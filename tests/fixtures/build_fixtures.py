"""Deterministic synthetic fixtures: hand-built H.264 streams and DVR images.

No ffmpeg is available in the build environment, so the Annex-B streams here
are assembled bit by bit: real SPS/PPS syntax (exp-Golomb coded, parseable by
the carver and by any standards-following parser), real slice headers, and
pseudo-random macroblock payloads. The payloads are not decodable pictures;
they are byte-exact, deterministic stand-ins that exercise every boundary the
carver cares about (start codes, parameter sets, IDR/non-IDR, EOS, filler).

Payload bytes are kept out of the 0x00..0x03 range so no emulation-prevention
escaping is needed for them; ``escape_emulation`` is still applied to headers,
and a dedicated unit test covers streams that do need escaping.

Usage as a script::

    python tests/fixtures/build_fixtures.py --out some/dir --size 4M --seed 7

writes ``dvr_image.img`` and ``dvr_image.manifest.json`` into ``some/dir``.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import random
from dataclasses import asdict, dataclass, field
from pathlib import Path

START_CODE_4 = b"\x00\x00\x00\x01"

# NAL header bytes (forbidden_zero_bit=0 | nal_ref_idc | nal_unit_type)
NAL_SPS = 0x67  # ref_idc 3, type 7
NAL_PPS = 0x68  # ref_idc 3, type 8
NAL_IDR = 0x65  # ref_idc 3, type 5
NAL_NON_IDR = 0x41  # ref_idc 2, type 1
NAL_AUD = 0x09  # ref_idc 0, type 9
NAL_EOS = 0x0B  # ref_idc 0, type 11 (end of stream)

HIKVISION_MAGIC = b"HIKVISION@HANGZHOU"
HIKVISION_MAGIC_OFFSET = 0x210


# ---------------------------------------------------------------------------
# Bit-level writer
# ---------------------------------------------------------------------------
class BitWriter:
    def __init__(self) -> None:
        self.bits: list[int] = []

    def u(self, n: int, value: int) -> BitWriter:
        for i in range(n - 1, -1, -1):
            self.bits.append((value >> i) & 1)
        return self

    def ue(self, value: int) -> BitWriter:
        """Unsigned exp-Golomb (ITU-T H.264 9.1)."""
        code = value + 1
        length = code.bit_length()
        self.bits.extend([0] * (length - 1))
        return self.u(length, code)

    def se(self, value: int) -> BitWriter:
        """Signed exp-Golomb: k>0 -> 2k-1, k<=0 -> -2k."""
        return self.ue(2 * value - 1 if value > 0 else -2 * value)

    def rbsp_trailing(self) -> BitWriter:
        self.bits.append(1)
        while len(self.bits) % 8:
            self.bits.append(0)
        return self

    def to_bytes(self) -> bytes:
        bits = self.bits + [0] * (-len(self.bits) % 8)
        return bytes(
            int("".join(map(str, bits[i : i + 8])), 2) for i in range(0, len(bits), 8)
        )


def escape_emulation(rbsp: bytes) -> bytes:
    """Insert emulation_prevention_three_byte (H.264 7.4.1.1)."""
    out = bytearray()
    zeros = 0
    for b in rbsp:
        if zeros >= 2 and b <= 3:
            out.append(3)
            zeros = 0
        out.append(b)
        zeros = zeros + 1 if b == 0 else 0
    return bytes(out)


# ---------------------------------------------------------------------------
# H.264 syntax elements
# ---------------------------------------------------------------------------
def build_sps(
    width: int = 704,
    height: int = 576,
    *,
    profile_idc: int = 66,
    level_idc: int = 30,
    log2_max_frame_num: int = 4,
) -> bytes:
    """SPS NAL (header + escaped RBSP), frame_mbs_only, POC type 2."""
    w_mbs = (width + 15) // 16
    h_mbs = (height + 15) // 16
    crop_right = (w_mbs * 16 - width) // 2
    crop_bottom = (h_mbs * 16 - height) // 2
    bw = BitWriter()
    bw.u(8, profile_idc).u(8, 0).u(8, level_idc)
    bw.ue(0)  # seq_parameter_set_id
    if profile_idc in (100, 110, 122, 244, 44, 83, 86, 118, 128, 138, 139, 134, 135):
        bw.ue(1)  # chroma_format_idc 4:2:0
        bw.ue(0).ue(0)  # bit depth luma/chroma minus8
        bw.u(1, 0)  # qpprime_y_zero_transform_bypass_flag
        bw.u(1, 0)  # seq_scaling_matrix_present_flag
    bw.ue(log2_max_frame_num - 4)
    bw.ue(2)  # pic_order_cnt_type
    bw.ue(1)  # max_num_ref_frames
    bw.u(1, 0)  # gaps_in_frame_num_value_allowed_flag
    bw.ue(w_mbs - 1).ue(h_mbs - 1)
    bw.u(1, 1)  # frame_mbs_only_flag
    bw.u(1, 1)  # direct_8x8_inference_flag
    if crop_right or crop_bottom:
        bw.u(1, 1).ue(0).ue(crop_right).ue(0).ue(crop_bottom)
    else:
        bw.u(1, 0)
    bw.u(1, 0)  # vui_parameters_present_flag
    bw.rbsp_trailing()
    return bytes([NAL_SPS]) + escape_emulation(bw.to_bytes())


def build_pps() -> bytes:
    bw = BitWriter()
    bw.ue(0).ue(0)  # pps id, sps id
    bw.u(1, 0)  # entropy_coding_mode_flag (CAVLC)
    bw.u(1, 0)  # bottom_field_pic_order_in_frame_present_flag
    bw.ue(0)  # num_slice_groups_minus1
    bw.ue(0).ue(0)  # num_ref_idx_l0/l1_default_active_minus1
    bw.u(1, 0).u(2, 0)  # weighted_pred_flag, weighted_bipred_idc
    bw.se(0).se(0).se(0)  # pic_init_qp_minus26, qs, chroma_qp_index_offset
    bw.u(1, 1)  # deblocking_filter_control_present_flag
    bw.u(1, 0)  # constrained_intra_pred_flag
    bw.u(1, 0)  # redundant_pic_cnt_present_flag
    bw.rbsp_trailing()
    return bytes([NAL_PPS]) + escape_emulation(bw.to_bytes())


def build_slice(
    *,
    idr: bool,
    frame_num: int,
    payload_size: int,
    rng: random.Random,
    log2_max_frame_num: int = 4,
) -> bytes:
    """Slice NAL with a syntactically valid header and random macroblock bytes."""
    bw = BitWriter()
    bw.ue(0)  # first_mb_in_slice
    bw.ue(7 if idr else 5)  # slice_type: I (7) / P (5), all slices same type
    bw.ue(0)  # pic_parameter_set_id
    bw.u(log2_max_frame_num, frame_num % (1 << log2_max_frame_num))
    if idr:
        bw.ue(0)  # idr_pic_id
    else:
        bw.u(1, 0)  # num_ref_idx_active_override_flag
        bw.u(1, 0)  # ref_pic_list_modification_flag_l0
    # dec_ref_pic_marking (nal_ref_idc != 0 for both our slice kinds)
    if idr:
        bw.u(1, 0).u(1, 0)  # no_output_of_prior_pics, long_term_reference
    else:
        bw.u(1, 0)  # adaptive_ref_pic_marking_mode_flag
    bw.se(0)  # slice_qp_delta
    bw.ue(1)  # disable_deblocking_filter_idc
    header = escape_emulation(bw.to_bytes())
    payload = rng.randbytes(max(1, payload_size)).translate(_ZERO_FREE)
    return bytes([NAL_IDR if idr else NAL_NON_IDR]) + header + payload


# maps 0x00..0x03 -> 0x04..0x07 so payloads never need emulation prevention
_ZERO_FREE = bytes([4, 5, 6, 7] + list(range(4, 256)))


def build_h264_stream(
    *,
    frames: int = 30,
    gop: int = 10,
    width: int = 704,
    height: int = 576,
    seed: int = 1,
    idr_size: int = 6000,
    p_size: int = 1500,
    with_aud: bool = False,
    with_eos: bool = True,
    profile_idc: int = 66,
) -> bytes:
    """Annex-B byte stream: [AUD] SPS PPS IDR, then P frames, per GOP; EOS."""
    rng = random.Random(seed)
    sps = build_sps(width, height, profile_idc=profile_idc)
    pps = build_pps()
    out = bytearray()
    for i in range(frames):
        idr = i % gop == 0
        if with_aud:
            out += START_CODE_4 + bytes([NAL_AUD, 0x10 if idr else 0x30])
        if idr:
            out += START_CODE_4 + sps + START_CODE_4 + pps
        size = int((idr_size if idr else p_size) * rng.uniform(0.7, 1.3))
        out += START_CODE_4 + build_slice(
            idr=idr, frame_num=i % gop, payload_size=size, rng=rng
        )
    if with_eos:
        out += START_CODE_4 + bytes([NAL_EOS])
    return bytes(out)


def build_h265_sps(width: int = 1280, height: int = 720) -> bytes:
    """Minimal H.265 SPS NAL (2-byte header + escaped RBSP), Main profile."""
    bw = BitWriter()
    bw.u(4, 0).u(3, 0).u(1, 1)  # vps id, max_sub_layers_minus1, nesting
    bw.u(2, 0).u(1, 0).u(5, 1)  # profile space, tier, profile_idc Main
    bw.u(32, 0x60000000)  # compatibility flags
    bw.u(48, 0)  # source flags + reserved
    bw.u(8, 93)  # level 3.1
    bw.ue(0)  # sps id
    bw.ue(1)  # chroma 4:2:0
    bw.ue(width).ue(height)
    bw.u(1, 0)  # conformance_window_flag
    bw.rbsp_trailing()
    return b"\x42\x01" + escape_emulation(bw.to_bytes())


def build_h265_stream(
    *,
    frames: int = 20,
    gop: int = 10,
    width: int = 1280,
    height: int = 720,
    seed: int = 1,
    idr_size: int = 4000,
    p_size: int = 1000,
    with_eos: bool = True,
    start_code_len: int = 4,
) -> bytes:
    """Annex-B H.265 stream: VPS SPS PPS IDR per GOP, TRAIL_R otherwise, EOS."""
    rng = random.Random(seed)
    sc = START_CODE_4 if start_code_len == 4 else START_CODE_4[1:]
    vps = b"\x40\x01\x0c\x01\xff\xff\x01\x60\x00\x00\x03\x00\x90"
    sps = build_h265_sps(width, height)
    pps = b"\x44\x01\xc0\xf2\xf0\x3c\x90"
    out = bytearray()
    for i in range(frames):
        idr = i % gop == 0
        if idr:
            out += sc + vps + sc + sps + sc + pps
        header = b"\x26\x01" if idr else b"\x02\x01"  # IDR_W_RADL / TRAIL_R
        size = int((idr_size if idr else p_size) * rng.uniform(0.7, 1.3))
        # first_slice_segment_in_pic_flag = 1 -> first payload bit set
        payload = bytes([0xAF]) + rng.randbytes(size).translate(_ZERO_FREE)
        out += sc + header + payload
    if with_eos:
        out += sc + b"\x48\x01"  # EOS_NUT (36)
    return bytes(out)


# ---------------------------------------------------------------------------
# Synthetic DVR image
# ---------------------------------------------------------------------------
VENDOR_VARIANTS = ("none", "hikvision", "dahua", "avi", "mp4", "mpegts")


@dataclass
class SegmentSpec:
    frames: int = 30
    width: int = 704
    height: int = 576
    deleted: bool = False
    truncate_bytes: int | None = None  # cut the stream short (simulates overwrite)
    with_eos: bool = True
    seed: int | None = None


@dataclass
class SegmentRecord:
    index: int
    offset: int
    length: int
    sha256: str
    deleted: bool
    truncated: bool
    frames: int
    width: int
    height: int
    channel: str


@dataclass
class ImageManifest:
    image_path: str
    size_bytes: int
    sha256: str
    seed: int
    vendor_variant: str
    block_size: int
    noise_region: tuple[int, int] | None
    segments: list[SegmentRecord] = field(default_factory=list)

    def to_json(self) -> str:
        return json.dumps(asdict(self), indent=2)


def _vendor_header(variant: str, block_size: int, rng: random.Random) -> bytes:
    hdr = bytearray(block_size)
    if variant == "hikvision":
        hdr[HIKVISION_MAGIC_OFFSET : HIKVISION_MAGIC_OFFSET + len(HIKVISION_MAGIC)] = (
            HIKVISION_MAGIC
        )
    elif variant == "dahua":
        hdr[0:7] = b"DHFS4.1"
        for off in range(512, block_size - 64, 512):
            hdr[off : off + 4] = b"DHAV"
            hdr[off + 40 : off + 44] = b"dhav"
    elif variant == "avi":
        hdr[0:4] = b"RIFF"
        hdr[4:8] = (block_size - 8).to_bytes(4, "little")
        hdr[8:12] = b"AVI "
        hdr[12:16] = b"LIST"
    elif variant == "mp4":
        hdr[0:4] = (24).to_bytes(4, "big")
        hdr[4:8] = b"ftyp"
        hdr[8:12] = b"isom"
    elif variant == "mpegts":
        body = bytearray(rng.randbytes(block_size))
        for off in range(0, block_size, 188):
            body[off] = 0x47
        hdr = body
    elif variant != "none":
        raise ValueError(f"unknown vendor variant {variant!r}")
    return bytes(hdr)


def build_dvr_image(
    path: Path | str,
    *,
    size_bytes: int = 4 * 1024 * 1024,
    segments: list[SegmentSpec] | None = None,
    seed: int = 1,
    vendor_variant: str = "none",
    block_size: int = 64 * 1024,
    noise_bytes: int = 64 * 1024,
) -> ImageManifest:
    """Write a synthetic DVR image and return its manifest.

    Layout: [vendor header block] [index block listing only non-deleted
    segments] [segment 0] [filler] [segment 1] ... [noise region] [zeros].
    A "deleted" segment is simply absent from the index block; its bytes are
    intact, exactly as on a real recorder whose index entry was removed.
    """
    path = Path(path)
    rng = random.Random(seed)
    if segments is None:
        segments = [
            SegmentSpec(frames=30),
            SegmentSpec(frames=20, deleted=True),
            SegmentSpec(frames=25),
        ]

    image = bytearray(size_bytes)
    header = _vendor_header(vendor_variant, block_size, rng)
    image[0 : len(header)] = header

    cursor = 2 * block_size  # header block + index block
    records: list[SegmentRecord] = []
    for idx, spec in enumerate(segments):
        stream = build_h264_stream(
            frames=spec.frames,
            width=spec.width,
            height=spec.height,
            seed=spec.seed if spec.seed is not None else seed * 100 + idx,
            with_eos=spec.with_eos,
        )
        truncated = False
        if spec.truncate_bytes is not None and spec.truncate_bytes < len(stream):
            stream = stream[: spec.truncate_bytes]
            truncated = True
        if cursor + len(stream) > size_bytes - noise_bytes:
            raise ValueError("image too small for the requested segments")
        image[cursor : cursor + len(stream)] = stream
        records.append(
            SegmentRecord(
                index=idx,
                offset=cursor,
                length=len(stream),
                sha256=hashlib.sha256(stream).hexdigest(),
                deleted=spec.deleted,
                truncated=truncated,
                frames=spec.frames,
                width=spec.width,
                height=spec.height,
                channel=f"ch{idx % 4 + 1:02d}",
            )
        )
        # align the next segment to a block boundary, leaving zero filler
        cursor = -(-(cursor + len(stream)) // block_size) * block_size

    noise_region = None
    if noise_bytes and cursor + noise_bytes <= size_bytes:
        image[cursor : cursor + noise_bytes] = rng.randbytes(noise_bytes)
        noise_region = (cursor, cursor + noise_bytes)

    index = {
        "format": "phoenix-synthetic-dvr",
        "entries": [
            {"channel": r.channel, "offset": r.offset, "length": r.length}
            for r in records
            if not r.deleted
        ],
    }
    index_bytes = json.dumps(index).encode()
    image[block_size : block_size + len(index_bytes)] = index_bytes

    data = bytes(image)
    path.write_bytes(data)
    manifest = ImageManifest(
        image_path=str(path),
        size_bytes=size_bytes,
        sha256=hashlib.sha256(data).hexdigest(),
        seed=seed,
        vendor_variant=vendor_variant,
        block_size=block_size,
        noise_region=noise_region,
        segments=records,
    )
    Path(str(path) + ".manifest.json").write_text(manifest.to_json(), encoding="utf-8")
    return manifest


def load_manifest(image_path: Path | str) -> dict:
    return json.loads(Path(str(image_path) + ".manifest.json").read_text("utf-8"))


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def _parse_size(text: str) -> int:
    units = {"K": 1024, "M": 1024**2, "G": 1024**3}
    if text[-1].upper() in units:
        return int(float(text[:-1]) * units[text[-1].upper()])
    return int(text)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--out", type=Path, required=True, help="output directory")
    ap.add_argument("--size", type=_parse_size, default="4M")
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--vendor", choices=VENDOR_VARIANTS, default="none")
    ap.add_argument("--name", default="dvr_image.img")
    args = ap.parse_args(argv)
    args.out.mkdir(parents=True, exist_ok=True)
    manifest = build_dvr_image(
        args.out / args.name,
        size_bytes=args.size,
        seed=args.seed,
        vendor_variant=args.vendor,
    )
    print(manifest.to_json())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
