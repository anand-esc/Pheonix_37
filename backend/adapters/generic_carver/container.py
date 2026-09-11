"""Container-level file carving: whole MP4/MOV and AVI files, byte for byte.

The NAL carver reads Annex-B elementary streams, which is what a recorder
writes to its own disk: every access unit is introduced by a ``00 00 01``
start code. A file copied from a computer is a different shape. An MP4 keeps
its NAL units length-prefixed inside an ``mdat`` box and carries no start
codes at all, so scanning one for start codes finds only coincidences — on a
five-second sample it finds hundreds, and every fragment built from them is
noise.

This module carves such a file *as a file*. It finds the ``ftyp`` box that
opens every ISO base media file (or the ``RIFF....AVI `` header of an AVI),
walks the box chain to the end, and returns exactly that byte range. The
result hashes identical to the original file, which is the only claim worth
making about a recovered exhibit.

What is parsed beyond the boundaries is deliberately small: ``mvhd`` for the
declared duration and ``tkhd``/``stsd`` for track geometry and codec. Those
are facts the container states about itself, and each one is reported with
where it came from.
"""

from __future__ import annotations

import hashlib
import logging
import struct
from pathlib import Path

from pydantic import BaseModel, ConfigDict

from backend.adapters.generic_carver.models import (
    CarvedFragment,
    ContainerInfo,
    FragmentFeatures,
)
from backend.core.evidence_model import Fragment

logger = logging.getLogger("phoenix.generic_carver.container")

CONTAINER_RECOVERY_METHOD = "container_file_carve"
HASH_CHUNK = 4 * 1024 * 1024

# ``ftyp`` is 4 bytes of size, the type, a major brand, a minor version and
# then zero or more compatible brands of 4 bytes each.
FTYP_MIN, FTYP_MAX = 16, 512
BOX_HEADER = 8

# Top-level boxes a file is expected to be made of. Anything else with a
# printable type is accepted but recorded, because the set is open-ended.
KNOWN_BOXES = frozenset(
    {
        b"ftyp",
        b"moov",
        b"mdat",
        b"free",
        b"skip",
        b"wide",
        b"pnot",
        b"uuid",
        b"moof",
        b"mfra",
        b"styp",
        b"sidx",
        b"ssix",
        b"prft",
        b"meta",
        b"pdin",
        b"junk",
        b"cmov",
        b"rmra",
        b"mere",
    }
)

# fourcc -> what the sample entry says the track holds
SAMPLE_ENTRY_CODECS = {
    b"avc1": "H.264",
    b"avc3": "H.264",
    b"hvc1": "H.265",
    b"hev1": "H.265",
    b"mp4v": "MPEG-4 Visual",
    b"jpeg": "Motion JPEG",
    b"av01": "AV1",
    b"vp09": "VP9",
}


class ContainerCarveOptions(BaseModel):
    """Bounds for the container scan. Defaults suit whole-disk images."""

    model_config = ConfigDict(extra="forbid")

    block_size: int = 8 * 1024 * 1024
    min_bytes: int = 1024  # a "file" smaller than this is not worth reporting
    max_bytes: int = 8 * 1024 * 1024 * 1024  # refuse to claim an absurd length
    parse_metadata: bool = True  # read mvhd/tkhd/stsd for duration and geometry
    metadata_read_limit: int = 8 * 1024 * 1024  # never read more moov than this


# ---------------------------------------------------------------------------
# Box reading
# ---------------------------------------------------------------------------
class _Box(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: bytes
    offset: int  # absolute offset of the box header
    size: int  # total size including the header
    header_len: int


def _printable_type(kind: bytes) -> bool:
    return len(kind) == 4 and all(0x20 <= b < 0x7F for b in kind)


def _read_box_header(fh, offset: int, file_size: int) -> _Box | None:
    """Read one box header at ``offset``; ``None`` when it is not a box.

    Handles both extended forms the specification defines: ``size == 1`` puts
    a 64-bit length in the next eight bytes, ``size == 0`` means the box runs
    to the end of the file. Getting these wrong is how a parser silently
    mis-reads every file larger than four gigabytes.
    """
    if offset + BOX_HEADER > file_size:
        return None
    fh.seek(offset)
    head = fh.read(BOX_HEADER)
    if len(head) < BOX_HEADER:
        return None
    size, kind = struct.unpack(">I4s", head)
    header_len = BOX_HEADER
    if size == 1:
        ext = fh.read(8)
        if len(ext) < 8:
            return None
        size = struct.unpack(">Q", ext)[0]
        header_len = 16
    elif size == 0:
        size = file_size - offset
    if not _printable_type(kind) or size < header_len:
        return None
    return _Box(kind=kind, offset=offset, size=size, header_len=header_len)


def _find_box(data: bytes, wanted: bytes, start: int = 0, end: int | None = None):
    """Depth-first search for ``wanted`` in an in-memory box tree."""
    end = len(data) if end is None else min(end, len(data))
    pos = start
    while pos + BOX_HEADER <= end:
        size, kind = struct.unpack(">I4s", data[pos : pos + BOX_HEADER])
        header_len = BOX_HEADER
        if size == 1:
            if pos + 16 > end:
                return None
            size = struct.unpack(">Q", data[pos + 8 : pos + 16])[0]
            header_len = 16
        elif size == 0:
            size = end - pos
        if size < header_len or not _printable_type(kind):
            return None
        if kind == wanted:
            return pos + header_len, pos + size
        # containers whose payload is a list of further boxes
        if kind in (b"moov", b"trak", b"mdia", b"minf", b"stbl", b"edts", b"mvex"):
            found = _find_box(data, wanted, pos + header_len, pos + size)
            if found is not None:
                return found
        pos += size
    return None


# ---------------------------------------------------------------------------
# Metadata the container states about itself
# ---------------------------------------------------------------------------
def _parse_movie_facts(moov: bytes) -> dict:
    """Duration, geometry and codec, each read straight out of ``moov``."""
    facts: dict = {}

    mvhd = _find_box(moov, b"mvhd")
    if mvhd is not None:
        body = moov[mvhd[0] : mvhd[1]]
        if len(body) >= 4:
            version = body[0]
            try:
                if version == 1 and len(body) >= 28:
                    timescale = struct.unpack(">I", body[20:24])[0]
                    duration = struct.unpack(">Q", body[24:32])[0]
                elif len(body) >= 20:
                    timescale = struct.unpack(">I", body[12:16])[0]
                    duration = struct.unpack(">I", body[16:20])[0]
                else:
                    timescale = duration = 0
                if timescale > 0 and duration > 0:
                    facts["duration_seconds"] = round(duration / timescale, 3)
            except struct.error:
                pass

    tkhd = _find_box(moov, b"tkhd")
    if tkhd is not None:
        body = moov[tkhd[0] : tkhd[1]]
        # width and height are the last two 16.16 fixed-point fields
        if len(body) >= 8:
            try:
                w, h = struct.unpack(">II", body[-8:])
                width, height = w >> 16, h >> 16
                if 0 < width <= 16384 and 0 < height <= 16384:
                    facts["width"], facts["height"] = width, height
            except struct.error:
                pass

    stsd = _find_box(moov, b"stsd")
    if stsd is not None:
        body = moov[stsd[0] : stsd[1]]
        if len(body) >= 16:
            fourcc = body[12:16]
            if fourcc in SAMPLE_ENTRY_CODECS:
                facts["codec_name"] = SAMPLE_ENTRY_CODECS[fourcc]
            elif _printable_type(fourcc):
                facts["codec_name"] = fourcc.decode("ascii")
            # the sample entry repeats the geometry; trust it over tkhd
            if len(body) >= 52:
                try:
                    width, height = struct.unpack(">HH", body[44:48])
                    if 0 < width <= 16384 and 0 < height <= 16384:
                        facts["width"], facts["height"] = width, height
                except struct.error:
                    pass

    facts["track_count"] = moov.count(b"tkhd")
    return facts


# ---------------------------------------------------------------------------
# Confidence
# ---------------------------------------------------------------------------
BASE = 0.30
HAS_INDEX = 0.30
HAS_MEDIA = 0.25
CLEAN_END = 0.10
METADATA_READ = 0.05
TRUNCATED = -0.20
FLOOR, CEILING = 0.05, 0.95


def score_container(info: ContainerInfo) -> tuple[float, str]:
    """Deterministic confidence with one line of rationale per rule."""
    total = BASE
    lines = [f"base {BASE:.2f}: valid {info.kind.upper()} header and box chain"]

    if info.has_index:
        total += HAS_INDEX
        lines.append(
            f"+{HAS_INDEX:.2f}: index present "
            f"({'moov' if info.kind == 'mp4' else 'idx1'}), the file can be played"
        )
    else:
        lines.append(
            "+0.00: no index box; the media payload is present but a player "
            "cannot seek it without rebuilding the index"
        )

    if info.has_media:
        total += HAS_MEDIA
        lines.append(
            f"+{HAS_MEDIA:.2f}: media payload present "
            f"({'mdat' if info.kind == 'mp4' else 'movi'})"
        )
    else:
        lines.append("+0.00: no media payload box; header only")

    if info.end_reason in ("clean_end", "next_file", "padding"):
        total += CLEAN_END
        lines.append(
            f"+{CLEAN_END:.2f}: every box parsed to its stated length, so the "
            "file ends where the chain does"
        )
    elif info.end_reason in ("truncated_box", "end_of_data"):
        total += TRUNCATED
        lines.append(f"{TRUNCATED:+.2f}: last box runs past the end of the image")
    else:
        lines.append(f"+0.00: chain ended by {info.end_reason.replace('_', ' ')}")

    if info.duration_seconds is not None:
        total += METADATA_READ
        lines.append(
            f"+{METADATA_READ:.2f}: header declares {info.duration_seconds:g}s"
            + (f" at {info.width}x{info.height}" if info.width else "")
        )

    total = max(FLOOR, min(CEILING, round(total, 3)))
    lines.append(f"= {total:.2f}")
    lines.append(
        "structural only: this is reconstruction completeness, not a claim "
        "about what the footage shows"
    )
    return total, "; ".join(lines)


# ---------------------------------------------------------------------------
# Scanning
# ---------------------------------------------------------------------------
def _iter_signature_offsets(fh, file_size: int, block_size: int, pattern: bytes):
    """Absolute offsets of ``pattern``, with overlap so a match spanning two
    reads is never missed — the usual way a chunked scanner loses evidence."""
    overlap = len(pattern) - 1
    pos = 0
    carry = b""
    carry_at = 0
    while pos < file_size:
        fh.seek(pos)
        chunk = fh.read(block_size)
        if not chunk:
            return
        buf = carry + chunk
        base = carry_at if carry else pos
        find_from = 0
        while True:
            hit = buf.find(pattern, find_from)
            if hit < 0:
                break
            yield base + hit
            find_from = hit + 1
        pos += len(chunk)
        carry = buf[-overlap:] if overlap else b""
        carry_at = pos - len(carry)


def _walk_mp4(fh, start: int, file_size: int, opts: ContainerCarveOptions):
    """Walk the box chain from ``start``; returns (end, boxes, end_reason)."""
    boxes: list[str] = []
    pos = start
    while pos < file_size:
        box = _read_box_header(fh, pos, file_size)
        if box is None:
            # Every box up to here was complete, so the file ends here and what
            # follows (padding, another file, unrelated blocks) is not part of
            # it. Only a chain that never parsed at all is a bad candidate.
            return pos, boxes, "padding" if boxes else "invalid_box"
        if box.kind == b"ftyp" and pos != start:
            return pos, boxes, "next_file"  # the next file begins here
        if box.kind not in KNOWN_BOXES and not _printable_type(box.kind):
            return pos, boxes, "invalid_box"
        end = pos + box.size
        if end > file_size:
            return file_size, boxes + [box.kind.decode("ascii")], "truncated_box"
        boxes.append(box.kind.decode("ascii"))
        pos = end
        if pos - start > opts.max_bytes:
            return pos, boxes, "size_limit"
    if not boxes:
        return pos, boxes, "invalid_box"
    # The chain consumed whole boxes right up to the last byte of the image:
    # nothing is missing, the file simply ends there.
    return file_size, boxes, "clean_end" if pos == file_size else "end_of_data"


def _mp4_metadata(fh, start: int, end: int, boxes: list[str], opts) -> dict:
    """Read ``moov`` (wherever it sits) and pull the facts it declares."""
    if not opts.parse_metadata or "moov" not in boxes:
        return {}
    pos = start
    while pos < end:
        box = _read_box_header(fh, pos, end)
        if box is None:
            return {}
        if box.kind == b"moov":
            length = min(box.size, opts.metadata_read_limit)
            fh.seek(box.offset)
            try:
                return _parse_movie_facts(fh.read(length))
            except (struct.error, ValueError, MemoryError):
                logger.debug("moov at 0x%x could not be parsed", box.offset)
                return {}
        pos = box.offset + box.size
    return {}


def _hash_range(fh, start: int, end: int) -> str:
    digest = hashlib.sha256()
    fh.seek(start)
    remaining = end - start
    while remaining > 0:
        chunk = fh.read(min(HASH_CHUNK, remaining))
        if not chunk:
            break
        digest.update(chunk)
        remaining -= len(chunk)
    return digest.hexdigest()


class ContainerCarveStats(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ftyp_candidates: int = 0
    riff_candidates: int = 0
    rejected: int = 0
    carved: int = 0


def carve_containers(
    source_path: str | Path,
    options: ContainerCarveOptions | None = None,
    *,
    first_index: int = 0,
) -> tuple[list[CarvedFragment], ContainerCarveStats]:
    """Recover whole MP4/MOV and AVI files from ``source_path``.

    Each result is a ``CarvedFragment`` so the rest of the pipeline — export,
    hashing, encryption, the evidence record — treats a recovered file exactly
    like a carved stream.
    """
    opts = options or ContainerCarveOptions()
    path = Path(source_path)
    file_size = path.stat().st_size
    stats = ContainerCarveStats()
    carved: list[CarvedFragment] = []
    claimed_to = 0  # never start a new file inside one already carved

    with open(path, "rb") as fh:
        # --- ISO base media (mp4, mov, 3gp, m4v) ---------------------------
        for hit in _iter_signature_offsets(fh, file_size, opts.block_size, b"ftyp"):
            start = hit - 4
            if start < 0 or start < claimed_to:
                continue
            stats.ftyp_candidates += 1
            header = _read_box_header(fh, start, file_size)
            if (
                header is None
                or header.kind != b"ftyp"
                or not (FTYP_MIN <= header.size <= FTYP_MAX)
                or header.size % 4
            ):
                stats.rejected += 1
                continue
            # The major brand follows the header, which is longer when the
            # box uses the 64-bit size form.
            fh.seek(start + header.header_len)
            brand_bytes = fh.read(4)
            if not _printable_type(brand_bytes):
                stats.rejected += 1
                continue

            end, boxes, end_reason = _walk_mp4(fh, start, file_size, opts)
            length = end - start
            # A four-byte magic is a weak claim on its own. Require the box
            # that actually holds the media: a header with no payload is a
            # marker, not a recoverable exhibit.
            if length < opts.min_bytes or "mdat" not in boxes:
                stats.rejected += 1
                continue

            facts = _mp4_metadata(fh, start, end, boxes, opts)
            info = ContainerInfo(
                kind="mp4",
                brand=brand_bytes.decode("ascii").strip() or None,
                extension=".mp4",
                boxes=boxes,
                has_index="moov" in boxes,
                has_media="mdat" in boxes,
                end_reason=end_reason,
                **facts,
            )
            carved.append(_to_fragment(fh, first_index + len(carved), start, end, info))
            claimed_to = end
            stats.carved += 1

        # --- RIFF/AVI ------------------------------------------------------
        for hit in _iter_signature_offsets(fh, file_size, opts.block_size, b"RIFF"):
            if hit < claimed_to:
                continue
            stats.riff_candidates += 1
            fh.seek(hit)
            head = fh.read(12)
            if len(head) < 12 or head[8:12] != b"AVI ":
                stats.rejected += 1
                continue
            riff_size = struct.unpack("<I", head[4:8])[0]
            end = min(hit + 8 + riff_size, file_size)
            length = end - hit
            if length < opts.min_bytes or riff_size < 4:
                stats.rejected += 1
                continue
            truncated = hit + 8 + riff_size > file_size
            fh.seek(hit)
            probe = fh.read(min(length, 512 * 1024))
            # Same bar as MP4: every real AVI carries its frames in a ``movi``
            # list. Without one the RIFF header is just a vendor marker.
            if b"movi" not in probe:
                stats.rejected += 1
                continue
            info = ContainerInfo(
                kind="avi",
                brand="AVI",
                extension=".avi",
                boxes=["RIFF", "AVI "],
                has_index=b"idx1" in probe,
                has_media=b"movi" in probe,
                end_reason="truncated_box" if truncated else "clean_end",
            )
            carved.append(_to_fragment(fh, first_index + len(carved), hit, end, info))
            claimed_to = end
            stats.carved += 1

    carved.sort(key=lambda c: c.fragment.byte_offset_start)
    for position, item in enumerate(carved, start=first_index):
        item.index = position
    return carved, stats


def _to_fragment(fh, index: int, start: int, end: int, info: ContainerInfo):
    """Wrap a recovered file in the shared ``Fragment`` contract."""
    confidence, rationale = score_container(info)
    digest = _hash_range(fh, start, end)
    label = info.codec_name or info.kind.upper()
    geometry = f" {info.width}x{info.height}" if info.width and info.height else ""
    duration = (
        f" @ {info.duration_seconds:g}s declared"
        if info.duration_seconds is not None
        else ""
    )
    codec_info = f"{info.kind.upper()} container, {label}{geometry}{duration}"

    fragment = Fragment(
        # content-derived, so re-running the carver references the same exhibit
        fragment_id=f"frag-{digest[:16]}",
        byte_offset_start=start,
        byte_offset_end=end,
        codec_info=codec_info,
        recovery_method=CONTAINER_RECOVERY_METHOD,
        confidence_score=confidence,
        confidence_rationale=rationale,
    )
    # Synthetic features so grouping, timing and reporting treat a recovered
    # file like any other fragment. Picture counts are not available without
    # decoding, so the duration the header declares is carried separately.
    features = FragmentFeatures(
        codec=(info.codec_name or "container").lower().replace(".", ""),
        start_reason=f"{info.kind}_header",
        end_reason=info.end_reason,
        has_sps=info.has_index,
        sps_parsed=info.duration_seconds is not None,
        has_pps=info.has_index,
        first_vcl_is_idr=True,  # a container file starts at a playable point
        nal_count=len(info.boxes),
        vcl_count=1 if info.has_media else 0,
        idr_count=1 if info.has_media else 0,
        picture_count=0,
    )
    return CarvedFragment(
        index=index,
        fragment=fragment,
        features=features,
        container=info,
        sha256=digest,
        length=end - start,
    )
