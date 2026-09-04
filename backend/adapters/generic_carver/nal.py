"""Annex-B NAL scanning and parameter-set parsing for H.264 and H.265.

``scan_start_codes`` walks a file in fixed-size blocks and yields every
start code that is followed by a plausible NAL header, together with the
number of zero bytes that precede it. That zero count is what lets the carver
strip trailing filler without a second pass over the data.

``parse_sps_h264`` and ``parse_sps_h265`` read just enough of a sequence
parameter set to report profile, level and picture size. Everything else in
the SPS is skipped syntactically so that the picture size lands on the right
bits even for high profiles with scaling matrices.
"""

from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass
from typing import BinaryIO

from backend.adapters.generic_carver.models import StreamInfo

START_CODE = b"\x00\x00\x01"

H264_TYPES = frozenset(range(1, 13))
H264_REF_REQUIRED = frozenset({5, 7, 8})
H264_REF_FORBIDDEN = frozenset({6, 9, 10, 11, 12})
H264_VCL = frozenset({1, 2, 3, 4, 5})
H264_IDR = frozenset({5})
H264_SPS, H264_PPS = 7, 8
H264_EOS = frozenset({10, 11})  # end of sequence, end of stream

H265_TYPES = frozenset(range(10)) | frozenset(range(16, 22)) | frozenset(range(32, 41))
H265_VCL = frozenset(range(22))
H265_IRAP = frozenset(range(16, 22))
H265_VPS, H265_SPS, H265_PPS = 32, 33, 34
H265_EOS = frozenset({36, 37})

H264_PROFILES = {
    66: "Baseline",
    77: "Main",
    88: "Extended",
    100: "High",
    110: "High 10",
    122: "High 4:2:2",
    244: "High 4:4:4",
}
H264_HIGH_PROFILES = frozenset(
    {100, 110, 122, 244, 44, 83, 86, 118, 128, 138, 139, 134, 135}
)
H265_PROFILES = {1: "Main", 2: "Main 10", 3: "Main Still Picture"}


@dataclass(frozen=True)
class RawNal:
    """A start code the scanner accepted."""

    offset: int  # absolute offset of the start code (including a zero_byte)
    start_code_len: int  # 3 or 4
    header: int  # first byte after the start code
    header2: int  # second byte (0 when at EOF)
    preceding_zeros: int  # zero bytes immediately before ``offset``
    header3: int = 0  # third byte; first slice-header byte for H.265

    def is_picture_start(self, codec: str) -> bool:
        """True when this VCL NAL begins a new picture.

        H.264: ``first_mb_in_slice`` is the first ue(v) of the slice header
        and ue(0) is the single bit '1'. H.265: ``first_slice_segment_in_pic_flag``
        is the first bit after the two-byte header.
        """
        first = self.header2 if codec == "h264" else self.header3
        return bool(first & 0x80)

    # --- H.264 view -------------------------------------------------------
    @property
    def h264_type(self) -> int:
        return self.header & 0x1F

    @property
    def h264_ref_idc(self) -> int:
        return (self.header >> 5) & 0x3

    @property
    def is_h264(self) -> bool:
        t, ref = self.h264_type, self.h264_ref_idc
        return (
            not self.header & 0x80
            and t in H264_TYPES
            and not (t in H264_REF_REQUIRED and ref == 0)
            and not (t in H264_REF_FORBIDDEN and ref != 0)
        )

    # --- H.265 view -------------------------------------------------------
    @property
    def h265_type(self) -> int:
        return (self.header >> 1) & 0x3F

    @property
    def is_h265(self) -> bool:
        layer = ((self.header & 1) << 5) | (self.header2 >> 3)
        tid = self.header2 & 0x7
        return (
            not self.header & 0x80
            and self.h265_type in H265_TYPES
            and layer == 0
            and tid >= 1
        )

    @property
    def is_h264_parameter_set(self) -> bool:
        return self.is_h264 and self.h264_type in (H264_SPS, H264_PPS)

    @property
    def is_h265_parameter_set(self) -> bool:
        return (
            self.is_h265
            and self.h265_type in (H265_VPS, H265_SPS, H265_PPS)
            and self.header2 == 1
        )


def scan_start_codes(fh: BinaryIO, file_size: int, block_size: int) -> Iterator[RawNal]:
    """Yield accepted start codes in file order (see ``trailing_zeros_of_file``)."""
    carry = b""
    prev_trailing_zeros = 0
    position = 0  # absolute offset of buffer[0]
    first = True
    tail_len = 6  # start code + two header bytes + first slice byte

    def _emit(buffer: bytes, p: int) -> RawNal | None:
        header = buffer[p + 3]
        header2 = buffer[p + 4] if p + 4 < len(buffer) else 0
        header3 = buffer[p + 5] if p + 5 < len(buffer) else 0
        probe = RawNal(0, 3, header, header2, 0)
        if not (probe.is_h264 or probe.is_h265):
            return None
        start = p - 1 if p >= 1 and buffer[p - 1] == 0 else p
        zeros = _zeros_before(buffer, start)
        if zeros == start and not first:
            zeros += max(0, prev_trailing_zeros - len(carry))
        return RawNal(
            offset=position + start,
            start_code_len=4 if start != p else 3,
            header=header,
            header2=header2,
            preceding_zeros=zeros,
            header3=header3,
        )

    while True:
        block = fh.read(block_size)
        if not block:
            break
        buffer = carry + block
        search_from = 0 if first else 1
        limit = len(buffer) - tail_len  # keep two header bytes available
        p = buffer.find(START_CODE, search_from)
        while p != -1 and p <= limit:
            nal = _emit(buffer, p)
            if nal is not None:
                yield nal
            p = buffer.find(START_CODE, p + 3)
        tz = _trailing_zero_count(buffer)
        if tz == len(buffer) and not first:
            tz += prev_trailing_zeros - len(carry)
        prev_trailing_zeros = tz
        carry = buffer[-tail_len:]
        position += len(buffer) - len(carry)
        first = False

    # The last few bytes were never searched (no room for two header bytes).
    if not first:
        buffer = carry
        p = buffer.find(START_CODE, 1)
        while p != -1 and p <= len(buffer) - 4:
            nal = _emit(buffer, p)
            if nal is not None:
                yield nal
            p = buffer.find(START_CODE, p + 3)


def _trailing_zero_count(buf: bytes) -> int:
    return len(buf) - len(buf.rstrip(b"\x00"))


def _zeros_before(buf: bytes, end: int, step: int = 4096) -> int:
    """Number of consecutive zero bytes immediately before ``buf[end]``."""
    zeros = 0
    q = end
    while q > 0:
        lo = max(0, q - step)
        seg = buf[lo:q]
        stripped = seg.rstrip(b"\x00")
        zeros += len(seg) - len(stripped)
        if stripped:
            break
        q = lo
    return zeros


def trailing_zeros_of_file(fh: BinaryIO, file_size: int, block_size: int) -> int:
    """Count zero bytes at the very end of the file (cheap, reads backwards)."""
    total = 0
    pos = file_size
    while pos > 0:
        step = min(block_size, pos)
        fh.seek(pos - step)
        chunk = fh.read(step)
        tz = _trailing_zero_count(chunk)
        total += tz
        if tz < len(chunk):
            break
        pos -= step
    return total


# ---------------------------------------------------------------------------
# RBSP bit reading
# ---------------------------------------------------------------------------
def unescape(data: bytes) -> bytes:
    """Remove emulation_prevention_three_byte sequences (00 00 03 -> 00 00)."""
    out = bytearray()
    zeros = 0
    i = 0
    n = len(data)
    while i < n:
        b = data[i]
        if zeros >= 2 and b == 3 and (i + 1 == n or data[i + 1] <= 3):
            zeros = 0
            i += 1
            continue
        out.append(b)
        zeros = zeros + 1 if b == 0 else 0
        i += 1
    return bytes(out)


class BitReader:
    def __init__(self, data: bytes) -> None:
        self.data = data
        self.pos = 0

    def u(self, n: int) -> int:
        value = 0
        for _ in range(n):
            byte = self.pos >> 3
            if byte >= len(self.data):
                raise ValueError("SPS truncated")
            bit = (self.data[byte] >> (7 - (self.pos & 7))) & 1
            value = (value << 1) | bit
            self.pos += 1
        return value

    def ue(self) -> int:
        zeros = 0
        while self.u(1) == 0:
            zeros += 1
            if zeros > 32:
                raise ValueError("invalid exp-Golomb code")
        return (1 << zeros) - 1 + (self.u(zeros) if zeros else 0)

    def se(self) -> int:
        k = self.ue()
        return (k + 1) // 2 if k % 2 else -(k // 2)

    def skip(self, n: int) -> None:
        self.pos += n


def _skip_h264_scaling_list(br: BitReader, size: int) -> None:
    last, nxt = 8, 8
    for _ in range(size):
        if nxt != 0:
            nxt = (last + br.se() + 256) % 256
        last = last if nxt == 0 else nxt


def parse_sps_h264(nal: bytes) -> StreamInfo:
    """``nal`` is the NAL unit without its start code (header byte first)."""
    if (nal[0] & 0x1F) != H264_SPS:
        raise ValueError("not an H.264 SPS")
    br = BitReader(unescape(nal[1:]))
    profile_idc = br.u(8)
    br.skip(8)  # constraint flags + reserved
    level_idc = br.u(8)
    br.ue()  # seq_parameter_set_id
    chroma_format_idc = 1
    if profile_idc in H264_HIGH_PROFILES:
        chroma_format_idc = br.ue()
        if chroma_format_idc == 3:
            br.skip(1)  # separate_colour_plane_flag
        br.ue()  # bit_depth_luma_minus8
        br.ue()  # bit_depth_chroma_minus8
        br.skip(1)  # qpprime_y_zero_transform_bypass_flag
        if br.u(1):  # seq_scaling_matrix_present_flag
            for i in range(8 if chroma_format_idc != 3 else 12):
                if br.u(1):
                    _skip_h264_scaling_list(br, 16 if i < 6 else 64)
    br.ue()  # log2_max_frame_num_minus4
    poc_type = br.ue()
    if poc_type == 0:
        br.ue()
    elif poc_type == 1:
        br.skip(1)
        br.se()
        br.se()
        for _ in range(br.ue()):
            br.se()
    br.ue()  # max_num_ref_frames
    br.skip(1)  # gaps_in_frame_num_value_allowed_flag
    width_mbs = br.ue() + 1
    height_map_units = br.ue() + 1
    frame_mbs_only = br.u(1)
    if not frame_mbs_only:
        br.skip(1)  # mb_adaptive_frame_field_flag
    br.skip(1)  # direct_8x8_inference_flag
    crop_left = crop_right = crop_top = crop_bottom = 0
    if br.u(1):  # frame_cropping_flag
        crop_left, crop_right, crop_top, crop_bottom = (
            br.ue(),
            br.ue(),
            br.ue(),
            br.ue(),
        )
    sub_w = 1 if chroma_format_idc == 3 else 2
    sub_h = 2 if chroma_format_idc == 1 else 1
    crop_unit_x = 1 if chroma_format_idc == 0 else sub_w
    crop_unit_y = (1 if chroma_format_idc == 0 else sub_h) * (2 - frame_mbs_only)
    width = width_mbs * 16 - crop_unit_x * (crop_left + crop_right)
    height = (2 - frame_mbs_only) * height_map_units * 16 - crop_unit_y * (
        crop_top + crop_bottom
    )
    fps = None
    if br.u(1):  # vui_parameters_present_flag
        fps = _h264_vui_fps(br)
    return StreamInfo(
        codec="H.264",
        profile_idc=profile_idc,
        profile_name=H264_PROFILES.get(profile_idc, f"profile {profile_idc}"),
        level_idc=level_idc,
        width=width,
        height=height,
        declared_fps=fps,
    )


def _h264_vui_fps(br: BitReader) -> float | None:
    """Frame rate from VUI timing info (H.264 E.2.1), or None if absent.

    A malformed VUI must not invalidate the picture size we already have, so
    any parse error here is swallowed and reported as "no declared rate".
    """
    try:
        if br.u(1) and br.u(8) == 255:  # aspect_ratio present, Extended_SAR
            br.skip(32)  # sar_width, sar_height
        if br.u(1):  # overscan_info_present_flag
            br.skip(1)
        if br.u(1):  # video_signal_type_present_flag
            br.skip(4)  # video_format + video_full_range_flag
            if br.u(1):  # colour_description_present_flag
                br.skip(24)
        if br.u(1):  # chroma_loc_info_present_flag
            br.ue()
            br.ue()
        if not br.u(1):  # timing_info_present_flag
            return None
        num_units_in_tick = br.u(32)
        time_scale = br.u(32)
        if num_units_in_tick == 0 or time_scale == 0:
            return None
        fps = time_scale / (2 * num_units_in_tick)
        return round(fps, 3) if 0 < fps <= 1000 else None
    except (ValueError, IndexError):
        return None


def parse_sps_h265(nal: bytes) -> StreamInfo:
    """``nal`` is the NAL unit without its start code (2 header bytes first)."""
    if ((nal[0] >> 1) & 0x3F) != H265_SPS:
        raise ValueError("not an H.265 SPS")
    br = BitReader(unescape(nal[2:]))
    br.skip(4)  # sps_video_parameter_set_id
    max_sub_layers_minus1 = br.u(3)
    br.skip(1)  # sps_temporal_id_nesting_flag
    # profile_tier_level(1, max_sub_layers_minus1)
    br.skip(2)  # general_profile_space
    br.skip(1)  # general_tier_flag
    profile_idc = br.u(5)
    br.skip(32)  # general_profile_compatibility_flags
    br.skip(48)  # progressive/interlaced/non_packed/frame_only + 44 reserved bits
    level_idc = br.u(8)
    sub_profile_present = []
    sub_level_present = []
    for _ in range(max_sub_layers_minus1):
        sub_profile_present.append(br.u(1))
        sub_level_present.append(br.u(1))
    if max_sub_layers_minus1 > 0:
        for _ in range(max_sub_layers_minus1, 8):
            br.skip(2)
    for i in range(max_sub_layers_minus1):
        if sub_profile_present[i]:
            br.skip(88)
        if sub_level_present[i]:
            br.skip(8)
    br.ue()  # sps_seq_parameter_set_id
    chroma_format_idc = br.ue()
    if chroma_format_idc == 3:
        br.skip(1)
    width = br.ue()
    height = br.ue()
    if br.u(1):  # conformance_window_flag
        sub_w = 2 if chroma_format_idc in (1, 2) else 1
        sub_h = 2 if chroma_format_idc == 1 else 1
        left, right, top, bottom = br.ue(), br.ue(), br.ue(), br.ue()
        width -= sub_w * (left + right)
        height -= sub_h * (top + bottom)
    return StreamInfo(
        codec="H.265",
        profile_idc=profile_idc,
        profile_name=H265_PROFILES.get(profile_idc, f"profile {profile_idc}"),
        level_idc=level_idc,
        width=width,
        height=height,
    )
