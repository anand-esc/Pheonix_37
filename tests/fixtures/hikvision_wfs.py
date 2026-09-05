"""A Hikvision-*shaped* synthetic disk image.

This is **not** a real Hikvision filesystem and must never be described as
one. It is a stand-in that has the same *shape* as the layout described in
public reverse-engineering write-ups, so that the pipeline, the demo and a
future native parser have something structured to work against when no
physical recorder is on the bench:

* a master sector carrying the ``HIKVISION@HANGZHOU`` magic at offset 0x210
  and a few plausible fields (data block size and count, index offsets);
* a ``HIKBTREE`` page listing one entry per recording, with channel number,
  start/end times and the data-block number;
* fixed-size data blocks, each holding one recording's Annex-B stream after a
  small per-block header.

A recording is "deleted" exactly the way a recorder deletes one: its index
entry is dropped while its data block is left untouched. That is what the
generic carver has to find, and what the manifest lets tests verify byte for
byte.

Every field layout here was invented for this fixture. Where a real write-up
supplied a value (the magic string and its 0x210 offset, the ``HIKBTREE``
tag) it is noted in ``FIELD_NOTES`` below, with the honest caveat that none
of it has been confirmed against physical hardware by this team.
"""

from __future__ import annotations

import hashlib
import json
import struct
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime, timedelta
from pathlib import Path

from tests.fixtures.build_fixtures import SegmentSpec, build_h264_stream

MASTER_SECTOR_OFFSET = 0x200
MAGIC = b"HIKVISION@HANGZHOU"
MAGIC_OFFSET = 0x210
HIKBTREE_MAGIC = b"HIKBTREE"
SYSTEM_AREA = 1024 * 1024  # master sector + index pages live in here
DEFAULT_BLOCK = 1024 * 1024
BLOCK_HEADER = b"PHXBLK\x00\x01"  # clearly ours, not a vendor tag
ENTRY_SIZE = 48
FIELDS_AT = 0x40  # master-sector field block, clear of the magic string

FIELD_NOTES = {
    "magic": (
        "'HIKVISION@HANGZHOU' at 0x210 of the master sector is reported in "
        "public reverse-engineering write-ups; not confirmed on hardware here."
    ),
    "hikbtree": (
        "'HIKBTREE' is the tag those write-ups give for the data-block index "
        "pages; the field layout used below is invented for this fixture."
    ),
    "block_header": (
        "'PHXBLK' is a marker of our own so nobody mistakes this image for a "
        "real recorder dump."
    ),
    "everything_else": (
        "Offsets, entry layout and timestamps are synthetic and chosen to be "
        "plausible, not to match any shipped firmware."
    ),
}


@dataclass
class WfsRecording:
    index: int
    channel: int
    block: int
    offset: int  # absolute offset of the Annex-B stream
    length: int
    sha256: str
    deleted: bool
    truncated: bool
    frames: int
    width: int
    height: int
    declared_fps: float | None
    start_utc: str
    end_utc: str


@dataclass
class WfsManifest:
    image_path: str
    size_bytes: int
    sha256: str
    seed: int
    layout: str
    block_size: int
    system_area_bytes: int
    magic_offset: int
    index_offset: int
    field_notes: dict[str, str]
    recordings: list[WfsRecording] = field(default_factory=list)

    def to_json(self) -> str:
        return json.dumps(asdict(self), indent=2)


def default_recordings(count: int = 8) -> list[SegmentSpec]:
    """Four channels, a couple deleted from the index, one cut short."""
    specs: list[SegmentSpec] = []
    for i in range(count):
        width, height = (1280, 720) if i % 4 < 2 else (704, 576)
        specs.append(
            SegmentSpec(
                frames=150,
                width=width,
                height=height,
                deleted=i % 4 == 2,
                truncate_bytes=120_000 if i == count - 1 else None,
                with_eos=i % 5 != 3,
                declared_fps={0: 25.0, 1: 25.0, 2: 12.5, 3: None}[i % 4],
            )
        )
    return specs


def build_hikvision_image(
    path: Path | str,
    *,
    size_bytes: int = 32 * 1024 * 1024,
    recordings: list[SegmentSpec] | None = None,
    seed: int = 2026,
    block_size: int = DEFAULT_BLOCK,
    start_time: datetime | None = None,
) -> WfsManifest:
    """Write the image and its manifest; return the manifest."""
    path = Path(path)
    specs = recordings if recordings is not None else default_recordings()
    start = start_time or datetime(2026, 8, 30, 21, 15, tzinfo=UTC)

    data_start = SYSTEM_AREA
    capacity = (size_bytes - data_start) // block_size
    if capacity < len(specs):
        raise ValueError(
            f"image holds {capacity} data block(s), {len(specs)} recording(s) asked for"
        )

    image = bytearray(size_bytes)
    entries: list[WfsRecording] = []
    clock = start

    for i, spec in enumerate(specs):
        stream = build_h264_stream(
            frames=spec.frames,
            width=spec.width,
            height=spec.height,
            seed=seed * 1000 + i,
            with_eos=spec.with_eos,
            declared_fps=spec.declared_fps,
        )
        truncated = False
        if spec.truncate_bytes is not None and spec.truncate_bytes < len(stream):
            stream = stream[: spec.truncate_bytes]
            truncated = True

        block_start = data_start + i * block_size
        payload_at = block_start + len(BLOCK_HEADER) + 16
        if len(stream) > block_size - (payload_at - block_start):
            raise ValueError(f"recording {i} does not fit in a {block_size}-byte block")

        channel = i % 4 + 1
        fps = spec.declared_fps or 25.0
        seconds = spec.frames / fps
        end = clock + timedelta(seconds=seconds)

        header = BLOCK_HEADER + struct.pack(
            "<HHII", channel, 0, len(stream), int(clock.timestamp())
        )
        image[block_start : block_start + len(header)] = header
        image[payload_at : payload_at + len(stream)] = stream

        entries.append(
            WfsRecording(
                index=i,
                channel=channel,
                block=i,
                offset=payload_at,
                length=len(stream),
                sha256=hashlib.sha256(stream).hexdigest(),
                deleted=spec.deleted,
                truncated=truncated,
                frames=spec.frames,
                width=spec.width,
                height=spec.height,
                declared_fps=spec.declared_fps,
                start_utc=clock.isoformat(),
                end_utc=end.isoformat(),
            )
        )
        clock = end + timedelta(seconds=30)

    index_offset = MASTER_SECTOR_OFFSET + 512
    live = [e for e in entries if not e.deleted]

    master = bytearray(512)
    master[0:8] = b"HIKPHX01"  # our own version tag, not a vendor value
    magic_at = MAGIC_OFFSET - MASTER_SECTOR_OFFSET
    master[magic_at : magic_at + len(MAGIC)] = MAGIC
    fields = struct.pack(
        "<QQIIIII",
        size_bytes,
        data_start,
        block_size,
        capacity,
        len(entries),
        index_offset,
        len(live),
    )
    master[FIELDS_AT : FIELDS_AT + len(fields)] = fields
    image[MASTER_SECTOR_OFFSET : MASTER_SECTOR_OFFSET + 512] = master

    # HIKBTREE index page: header, then one entry per *listed* recording.
    page = bytearray()
    page += HIKBTREE_MAGIC
    page += struct.pack("<III", 1, len(live), ENTRY_SIZE)
    for e in live:
        entry = struct.pack(
            "<IIQQIIII",
            e.block,
            e.channel,
            int(datetime.fromisoformat(e.start_utc).timestamp()),
            int(datetime.fromisoformat(e.end_utc).timestamp()),
            e.offset,
            e.length,
            e.width,
            e.height,
        )
        page += entry.ljust(ENTRY_SIZE, b"\x00")  # fixed stride, like a real page
    image[index_offset : index_offset + len(page)] = page

    data = bytes(image)
    path.write_bytes(data)
    manifest = WfsManifest(
        image_path=str(path),
        size_bytes=size_bytes,
        sha256=hashlib.sha256(data).hexdigest(),
        seed=seed,
        layout="hikvision-shaped-synthetic",
        block_size=block_size,
        system_area_bytes=SYSTEM_AREA,
        magic_offset=MAGIC_OFFSET,
        index_offset=index_offset,
        field_notes=FIELD_NOTES,
        recordings=entries,
    )
    Path(str(path) + ".manifest.json").write_text(manifest.to_json(), encoding="utf-8")
    return manifest


def read_index(image_path: Path | str) -> list[dict]:
    """Parse the synthetic index back out; what a native parser would read."""
    data = Path(image_path).read_bytes()
    master = data[MASTER_SECTOR_OFFSET : MASTER_SECTOR_OFFSET + 512]
    if master[MAGIC_OFFSET - MASTER_SECTOR_OFFSET :][: len(MAGIC)] != MAGIC:
        raise ValueError("master sector magic not found")
    (_size, _data_start, _block, _cap, _total, index_offset, listed) = struct.unpack(
        "<QQIIIII", master[FIELDS_AT : FIELDS_AT + 36]
    )
    page = data[index_offset:]
    if page[:8] != HIKBTREE_MAGIC:
        raise ValueError("index page magic not found")
    _version, count, entry_size = struct.unpack("<III", page[8:20])
    out = []
    for i in range(count):
        raw = page[20 + i * entry_size : 20 + (i + 1) * entry_size]
        block, channel, start, end, offset, length, width, height = struct.unpack(
            "<IIQQIIII", raw[:40]
        )
        out.append(
            {
                "block": block,
                "channel": channel,
                "start_utc": datetime.fromtimestamp(start, UTC).isoformat(),
                "end_utc": datetime.fromtimestamp(end, UTC).isoformat(),
                "offset": offset,
                "length": length,
                "resolution": f"{width}x{height}",
            }
        )
    assert len(out) == listed
    return out
