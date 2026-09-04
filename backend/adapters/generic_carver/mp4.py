"""Lossless MP4 wrapping of carved H.264 Annex-B fragments.

The raw fragment stays the evidence (its SHA-256 never changes); this module
only produces a playable *view* of it. Every VCL and SEI NAL is copied into
the ``mdat`` box byte for byte with a 4-byte length prefix instead of the
Annex-B start code, parameter sets go into ``avcC``, and timing is a fixed
frame rate the caller supplies (recorders rarely embed one in the stream).
Nothing is re-encoded, so the wrapped file decodes to exactly what the
recorder wrote.

H.265 is not wrapped yet (``hvcC`` needs VPS/SPS/PPS arrays and the general
profile block); ``wrap_annexb`` raises ``NotImplementedError`` for it.
"""

from __future__ import annotations

import struct
from dataclasses import dataclass, field
from pathlib import Path

from backend.adapters.generic_carver.models import StreamInfo
from backend.adapters.generic_carver.nal import parse_sps_h264

TIMESCALE = 90_000


@dataclass
class Mp4Info:
    out_path: str
    samples: int
    sync_samples: int
    fps: float
    duration_seconds: float
    stream: StreamInfo
    nal_bytes_copied: int
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


def _access_units(nals: list[bytes]) -> tuple[list[list[bytes]], dict[int, int]]:
    """Group NALs into pictures; returns (units, dropped-by-type counts)."""
    units: list[list[bytes]] = []
    current: list[bytes] = []
    pending_non_vcl: list[bytes] = []  # SEI etc. that precede the next picture
    dropped: dict[int, int] = {}
    for nal in nals:
        t = nal[0] & 0x1F
        if t in (7, 8, 9, 10, 11, 12):  # SPS/PPS/AUD/EOS/EOB/filler: not samples
            dropped[t] = dropped.get(t, 0) + 1
            continue
        if t == 6:  # SEI travels with the picture that follows it
            pending_non_vcl.append(nal)
            continue
        if 1 <= t <= 5:
            first_mb_zero = bool(nal[1] & 0x80) if len(nal) > 1 else True
            if first_mb_zero and current:
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


def _stsd(sps: bytes, pps: bytes, width: int, height: int) -> bytes:
    avc1 = (
        b"\x00" * 6
        + struct.pack(">H", 1)  # data_reference_index
        + b"\x00" * 16  # pre_defined / reserved
        + struct.pack(">HH", width, height)
        + struct.pack(">II", 0x00480000, 0x00480000)  # 72 dpi
        + b"\x00" * 4
        + struct.pack(">H", 1)  # frame_count
        + b"\x00" * 32  # compressorname
        + struct.pack(">Hh", 0x0018, -1)  # depth, pre_defined
        + _avcc(sps, pps)
    )
    return _full(b"stsd", 0, 0, struct.pack(">I", 1) + _box(b"avc1", avc1))


def _moov(
    sizes: list[int],
    sync: list[int],
    sps: bytes,
    pps: bytes,
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
    stbl = _box(
        b"stbl", _stsd(sps, pps, width, height) + stts + stss + stsc + stsz + stco
    )
    minf = _box(b"minf", vmhd + dinf + stbl)
    mdia = _box(b"mdia", mdhd + hdlr + minf)
    trak = _box(b"trak", tkhd + mdia)
    return _box(b"moov", mvhd + trak)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
def wrap_annexb(data: bytes, *, fps: float = 25.0) -> tuple[bytes, Mp4Info]:
    """Return (mp4_bytes, info) for an H.264 Annex-B buffer."""
    nals = list(iter_annexb_nals(data))
    sps = next((n for n in nals if (n[0] & 0x1F) == 7), None)
    pps = next((n for n in nals if (n[0] & 0x1F) == 8), None)
    if sps is None or pps is None:
        if nals and ((nals[0][0] >> 1) & 0x3F) in (32, 33, 34):
            raise NotImplementedError("H.265 wrapping is not implemented")
        raise ValueError("fragment has no SPS/PPS; cannot build avcC")
    stream = parse_sps_h264(sps)

    units, dropped = _access_units(nals)
    if not units:
        raise ValueError("fragment has no picture data")
    samples: list[bytes] = []
    sync: list[int] = []
    copied = 0
    for idx, unit in enumerate(units, start=1):
        sample = b"".join(struct.pack(">I", len(n)) + n for n in unit)
        samples.append(sample)
        copied += sum(len(n) for n in unit)
        if any((n[0] & 0x1F) == 5 for n in unit):
            sync.append(idx)

    ftyp = _box(b"ftyp", b"isom" + struct.pack(">I", 0x200) + b"isomiso2avc1mp41")
    sizes = [len(s) for s in samples]
    mdat_payload = b"".join(samples)
    # moov size does not depend on the chunk offset value, so build it twice
    probe = _moov(sizes, sync, sps, pps, stream.width, stream.height, fps, 0)
    chunk_offset = len(ftyp) + len(probe) + 8
    moov = _moov(sizes, sync, sps, pps, stream.width, stream.height, fps, chunk_offset)
    mdat = _box(b"mdat", mdat_payload)
    info = Mp4Info(
        out_path="",
        samples=len(samples),
        sync_samples=len(sync),
        fps=fps,
        duration_seconds=len(samples) / fps,
        stream=stream,
        nal_bytes_copied=copied,
        dropped_nal_types=dropped,
    )
    return ftyp + moov + mdat, info


def wrap_fragment_file(
    src: str | Path, dst: str | Path, *, fps: float = 25.0
) -> Mp4Info:
    """Wrap an exported ``.h264`` fragment into ``dst`` (an ``.mp4``)."""
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
