"""Lossless MP4 wrapping of carved H.264 and H.265 Annex-B fragments.

The raw fragment stays the evidence (its SHA-256 never changes); this module
only produces a playable *view* of it. Every VCL and SEI NAL is copied into
the ``mdat`` box byte for byte with a 4-byte length prefix instead of the
Annex-B start code, parameter sets go into the sample entry's configuration
record (``avcC`` for H.264, ``hvcC`` for H.265), and timing is a fixed frame
rate the caller supplies (recorders rarely embed one in the stream). Nothing
is re-encoded, so the wrapped file decodes to exactly what the recorder wrote.
"""

from __future__ import annotations

import struct
from dataclasses import dataclass, field
from pathlib import Path

from backend.adapters.generic_carver.models import StreamInfo
from backend.adapters.generic_carver.nal import (
    h265_general_ptl,
    parse_sps_h264,
    parse_sps_h265,
)

TIMESCALE = 90_000

# H.264 NAL types that are not samples of their own.
H264_NON_SAMPLE = frozenset({7, 8, 9, 10, 11, 12})
# H.265: VPS/SPS/PPS/AUD/EOS/EOB/FD.
H265_NON_SAMPLE = frozenset({32, 33, 34, 35, 36, 37, 38})
H265_VCL_MAX = 31
H265_IRAP = frozenset(range(16, 24))


@dataclass
class Mp4Info:
    out_path: str
    samples: int
    sync_samples: int
    fps: float
    duration_seconds: float
    stream: StreamInfo
    nal_bytes_copied: int
    codec: str = "h264"
    dropped_nal_types: dict[int, int] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Annex-B parsing
# ---------------------------------------------------------------------------
def iter_annexb_nals(data: bytes):
    """Yield NAL unit payloads (header byte first) from an Annex-B buffer."""
    i = data.find(b"\x00\x00\x01")
    while i != -1:
        start = i + 3
        j = data.find(b"\x00\x00\x01", start)
        end = len(data) if j == -1 else j
        # drop the zero_byte of a 4-byte start code and trailing zeros
        nal = data[start:end].rstrip(b"\x00")
        if nal:
            yield nal
        i = j


def detect_codec(nals: list[bytes]) -> str:
    """ "h265" if the parameter sets are H.265 shaped, else "h264"."""
    for nal in nals:
        if len(nal) >= 2 and not nal[0] & 0x80:
            if ((nal[0] >> 1) & 0x3F) in (32, 33, 34) and nal[1] == 1:
                return "h265"
            if (nal[0] & 0x1F) in (7, 8) and ((nal[0] >> 5) & 0x3) != 0:
                return "h264"
    return "h264"


def _nal_type(nal: bytes, codec: str) -> int:
    return (nal[0] >> 1) & 0x3F if codec == "h265" else nal[0] & 0x1F


def _access_units(
    nals: list[bytes], codec: str
) -> tuple[list[list[bytes]], dict[int, int]]:
    """Group NALs into pictures; returns (units, dropped-by-type counts)."""
    non_sample = H265_NON_SAMPLE if codec == "h265" else H264_NON_SAMPLE
    sei_types = (39, 40) if codec == "h265" else (6,)
    units: list[list[bytes]] = []
    current: list[bytes] = []
    pending_non_vcl: list[bytes] = []  # SEI etc. that precede the next picture
    dropped: dict[int, int] = {}
    for nal in nals:
        t = _nal_type(nal, codec)
        if t in non_sample:
            dropped[t] = dropped.get(t, 0) + 1
            continue
        if t in sei_types:
            pending_non_vcl.append(nal)
            continue
        if _is_vcl(t, codec):
            if _is_picture_start(nal, codec) and current:
                units.append(current)
                current = []
            current.extend(pending_non_vcl)
            pending_non_vcl = []
            current.append(nal)
        else:
            dropped[t] = dropped.get(t, 0) + 1
    if current:
        units.append(current)
    return units, dropped


def _is_vcl(nal_type: int, codec: str) -> bool:
    return nal_type <= H265_VCL_MAX if codec == "h265" else 1 <= nal_type <= 5


def _is_picture_start(nal: bytes, codec: str) -> bool:
    """H.264: ``first_mb_in_slice`` == 0. H.265: ``first_slice_segment_in_pic_flag``."""
    index = 2 if codec == "h265" else 1
    return bool(nal[index] & 0x80) if len(nal) > index else True


def _is_sync(unit: list[bytes], codec: str) -> bool:
    if codec == "h265":
        return any(_nal_type(n, "h265") in H265_IRAP for n in unit)
    return any((n[0] & 0x1F) == 5 for n in unit)


# ---------------------------------------------------------------------------
# Box helpers
# ---------------------------------------------------------------------------
def _box(kind: bytes, payload: bytes) -> bytes:
    return struct.pack(">I", 8 + len(payload)) + kind + payload


def _full(kind: bytes, version: int, flags: int, payload: bytes) -> bytes:
    return _box(kind, struct.pack(">I", (version << 24) | flags) + payload)


def _avcc(sps: bytes, pps: bytes) -> bytes:
    body = bytes([1, sps[1], sps[2], sps[3], 0xFF, 0xE1])
    body += struct.pack(">H", len(sps)) + sps
    body += bytes([1]) + struct.pack(">H", len(pps)) + pps
    return _box(b"avcC", body)


def _hvcc(vps: bytes | None, sps: bytes, pps: bytes, stream: StreamInfo) -> bytes:
    """``hvcC`` decoder configuration record (ISO/IEC 14496-15 clause 8.3.3).

    The 12-byte general ``profile_tier_level`` block is copied straight out of
    the SPS so the record cannot disagree with the bitstream.
    """
    ptl = h265_general_ptl(sps)
    chroma = stream.chroma_format_idc if stream.chroma_format_idc is not None else 1
    luma = (stream.bit_depth_luma or 8) - 8
    chroma_depth = (stream.bit_depth_chroma or 8) - 8
    layers = stream.max_sub_layers or 1
    nested = 1 if stream.temporal_id_nested else 0

    body = bytearray()
    body.append(1)  # configurationVersion
    body += ptl  # profile space/tier/idc, compatibility, constraints, level
    body += struct.pack(">H", 0xF000)  # reserved '1111' + min_spatial_segmentation 0
    body.append(0xFC)  # reserved '111111' + parallelismType 0
    body.append(0xFC | (chroma & 0x3))  # reserved + chromaFormat
    body.append(0xF8 | (luma & 0x7))  # reserved + bitDepthLumaMinus8
    body.append(0xF8 | (chroma_depth & 0x7))  # reserved + bitDepthChromaMinus8
    body += struct.pack(">H", 0)  # avgFrameRate: 0 = unspecified
    # constantFrameRate 0 | numTemporalLayers | temporalIdNested | lengthSize-1 = 3
    body.append(((layers & 0x7) << 3) | (nested << 2) | 0x3)

    arrays = [(32, vps), (33, sps), (34, pps)]
    present = [(t, n) for t, n in arrays if n]
    body.append(len(present))
    for nal_type, nal in present:
        body.append(0x80 | nal_type)  # array_completeness = 1
        body += struct.pack(">H", 1)  # numNalus
        body += struct.pack(">H", len(nal)) + nal
    return _box(b"hvcC", bytes(body))


def _sample_entry(kind: bytes, config: bytes, width: int, height: int) -> bytes:
    body = (
        b"\x00" * 6
        + struct.pack(">H", 1)  # data_reference_index
        + b"\x00" * 16  # pre_defined / reserved
        + struct.pack(">HH", width, height)
        + struct.pack(">II", 0x00480000, 0x00480000)  # 72 dpi
        + b"\x00" * 4
        + struct.pack(">H", 1)  # frame_count
        + b"\x00" * 32  # compressorname
        + struct.pack(">Hh", 0x0018, -1)  # depth, pre_defined
        + config
    )
    return _box(kind, body)


def _moov(
    sizes: list[int],
    sync: list[int],
    sample_entry: bytes,
    width: int,
    height: int,
    fps: float,
    chunk_offset: int,
) -> bytes:
    n = len(sizes)
    delta = round(TIMESCALE / fps)
    duration = n * delta
    matrix = struct.pack(">9I", 0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000)

    mvhd = _full(
        b"mvhd",
        0,
        0,
        struct.pack(">IIII", 0, 0, TIMESCALE, duration)
        + struct.pack(">IH", 0x00010000, 0x0100)
        + b"\x00" * 10
        + matrix
        + b"\x00" * 24
        + struct.pack(">I", 2),
    )
    tkhd = _full(
        b"tkhd",
        0,
        0x7,
        struct.pack(">IIII", 0, 0, 1, 0)
        + struct.pack(">I", duration)
        + b"\x00" * 8
        + struct.pack(">hhh", 0, 0, 0)
        + b"\x00\x00"
        + matrix
        + struct.pack(">II", width << 16, height << 16),
    )
    mdhd = _full(
        b"mdhd", 0, 0, struct.pack(">IIIIHH", 0, 0, TIMESCALE, duration, 0x55C4, 0)
    )
    hdlr = _full(b"hdlr", 0, 0, b"\x00" * 4 + b"vide" + b"\x00" * 12 + b"Phoenix\x00")
    vmhd = _full(b"vmhd", 0, 1, b"\x00" * 8)
    dinf = _box(
        b"dinf", _full(b"dref", 0, 0, struct.pack(">I", 1) + _full(b"url ", 0, 1, b""))
    )
    stsd = _full(b"stsd", 0, 0, struct.pack(">I", 1) + sample_entry)
    stts = _full(b"stts", 0, 0, struct.pack(">III", 1, n, delta))
    stss = _full(
        b"stss",
        0,
        0,
        struct.pack(">I", len(sync)) + b"".join(struct.pack(">I", s) for s in sync),
    )
    stsc = _full(b"stsc", 0, 0, struct.pack(">IIII", 1, 1, n, 1))
    stsz = _full(
        b"stsz",
        0,
        0,
        struct.pack(">II", 0, n) + b"".join(struct.pack(">I", s) for s in sizes),
    )
    stco = _full(b"stco", 0, 0, struct.pack(">II", 1, chunk_offset))
    stbl = _box(b"stbl", stsd + stts + stss + stsc + stsz + stco)
    minf = _box(b"minf", vmhd + dinf + stbl)
    mdia = _box(b"mdia", mdhd + hdlr + minf)
    trak = _box(b"trak", tkhd + mdia)
    return _box(b"moov", mvhd + trak)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
def wrap_annexb(data: bytes, *, fps: float = 25.0) -> tuple[bytes, Mp4Info]:
    """Return (mp4_bytes, info) for an H.264 or H.265 Annex-B buffer."""
    nals = list(iter_annexb_nals(data))
    if not nals:
        raise ValueError("no Annex-B NAL units in fragment")
    codec = detect_codec(nals)

    def first(nal_type: int) -> bytes | None:
        return next((n for n in nals if _nal_type(n, codec) == nal_type), None)

    if codec == "h265":
        vps, sps, pps = first(32), first(33), first(34)
        if sps is None or pps is None:
            raise ValueError("H.265 fragment has no SPS/PPS; cannot build hvcC")
        stream = parse_sps_h265(sps)
        config = _hvcc(vps, sps, pps, stream)
        entry_kind, brand = b"hvc1", b"isomiso2hvc1mp41"
    else:
        sps, pps = first(7), first(8)
        if sps is None or pps is None:
            raise ValueError("H.264 fragment has no SPS/PPS; cannot build avcC")
        stream = parse_sps_h264(sps)
        config = _avcc(sps, pps)
        entry_kind, brand = b"avc1", b"isomiso2avc1mp41"

    units, dropped = _access_units(nals, codec)
    if not units:
        raise ValueError("fragment has no picture data")
    samples: list[bytes] = []
    sync: list[int] = []
    copied = 0
    for idx, unit in enumerate(units, start=1):
        samples.append(b"".join(struct.pack(">I", len(n)) + n for n in unit))
        copied += sum(len(n) for n in unit)
        if _is_sync(unit, codec):
            sync.append(idx)

    ftyp = _box(b"ftyp", b"isom" + struct.pack(">I", 0x200) + brand)
    sizes = [len(s) for s in samples]
    sample_entry = _sample_entry(entry_kind, config, stream.width, stream.height)
    # moov size does not depend on the chunk offset value, so build it twice
    probe = _moov(sizes, sync, sample_entry, stream.width, stream.height, fps, 0)
    chunk_offset = len(ftyp) + len(probe) + 8
    moov = _moov(
        sizes, sync, sample_entry, stream.width, stream.height, fps, chunk_offset
    )
    mdat = _box(b"mdat", b"".join(samples))
    info = Mp4Info(
        out_path="",
        samples=len(samples),
        sync_samples=len(sync),
        fps=fps,
        duration_seconds=len(samples) / fps,
        stream=stream,
        nal_bytes_copied=copied,
        codec=codec,
        dropped_nal_types=dropped,
    )
    return ftyp + moov + mdat, info


def wrap_fragment_file(
    src: str | Path, dst: str | Path, *, fps: float = 25.0
) -> Mp4Info:
    """Wrap an exported ``.h264``/``.h265`` fragment into ``dst`` (an ``.mp4``)."""
    data = Path(src).read_bytes()
    mp4, info = wrap_annexb(data, fps=fps)
    Path(dst).write_bytes(mp4)
    info.out_path = str(dst)
    return info


def parse_boxes(data: bytes, offset: int = 0, end: int | None = None):
    """Tiny box walker for tests: yields (type, start, size)."""
    end = len(data) if end is None else end
    pos = offset
    while pos + 8 <= end:
        size, kind = struct.unpack(">I4s", data[pos : pos + 8])
        if size == 0:
            size = end - pos
        yield kind, pos, size
        pos += max(size, 8)
