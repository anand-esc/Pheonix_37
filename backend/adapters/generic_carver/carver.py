"""Generic carver: the vendor-agnostic fallback recovery engine.

Two passes run over the image, in this order:

A. Container pass (``container.py``) — whole MP4/MOV and AVI files are
   recovered as files and their byte ranges are then excluded from pass B.
   A copied ``.mp4`` keeps its NAL units length-prefixed inside ``mdat`` and
   carries no start codes, so without this pass it is reported as a handful
   of fragments built from coincidental ``00 00 01`` byte sequences.
B. Annex-B pass — runs of NAL units, which is what a recorder writes to its
   own disk.

Rules for pass B, in the order they are applied (see docs/generic_carver.md):

1. Scan the image for start codes followed by a plausible NAL header.
2. A fragment starts at an SPS (H.264) or VPS/SPS (H.265). If the codec is
   already known, a fragment may also start at an IDR/IRAP without parameter
   sets, at lower confidence.
3. A fragment continues through NALs of the same stream. It ends when:
   an end-of-sequence/stream NAL is seen (``eos``), an SPS with different
   bytes appears (``new_sequence``), the zero run between two NALs exceeds
   ``filler_split_bytes`` (``zero_filler``), the distance between two start
   codes exceeds ``max_nal_bytes`` (``oversized_nal_gap``), or the data ends
   (``end_of_data``).
4. Trailing zero bytes are never part of a fragment.
5. Fragments with fewer than ``min_nals`` NALs or without picture data are
   discarded as noise; the count is reported in ``CarveStats``.
6. Every fragment is hashed (SHA-256) from the image bytes it points at, and
   ``export`` re-hashes the written file and refuses to keep a mismatch.
"""

from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass, field, replace
from pathlib import Path
from typing import BinaryIO

from backend.adapters.generic_carver.exceptions import (
    CarverExportError,
    CarverSourceError,
)
from backend.adapters.generic_carver.container import (
    ContainerCarveOptions,
    carve_containers,
)
from backend.adapters.generic_carver.models import (
    RECOVERY_METHOD,
    CarvedFragment,
    CarveOptions,
    CarveResult,
    CarveStats,
    ExportedFragment,
    FragmentFeatures,
    StreamInfo,
)
from backend.adapters.generic_carver.nal import (
    H264_EOS,
    H264_IDR,
    H264_PPS,
    H264_SPS,
    H264_VCL,
    H265_EOS,
    H265_IRAP,
    H265_PPS,
    H265_SPS,
    H265_VCL,
    H265_VPS,
    RawNal,
    parse_sps_h264,
    parse_sps_h265,
    scan_start_codes,
    trailing_zeros_of_file,
)
from backend.adapters.generic_carver.scoring import score
from backend.core.evidence_model import Fragment
from backend.core.interfaces import RecoveryEngine
from backend.pipeline.events import EventSink, emit

logger = logging.getLogger("phoenix.generic_carver")

PARAMETER_SET_READ_LIMIT = 64 * 1024
HASH_CHUNK = 4 * 1024 * 1024


@dataclass
class _Builder:
    start: int
    start_reason: str
    codec: str
    end: int = 0
    nal_count: int = 0
    vcl_count: int = 0
    idr_count: int = 0
    first_vcl_is_idr: bool | None = None
    sps_bytes: bytes | None = None
    has_pps: bool = False
    parameter_set_repeats: int = 0
    stream: StreamInfo | None = None
    sps_error: str | None = field(default=None)
    pps_count: int = 0
    picture_count: int = 0
    # GOP bookkeeping for the short-GOP split heuristic
    gop_pictures: int = 0  # pictures since (and including) the last IDR
    gop_lengths: list[int] = field(default_factory=list)
    last_kind: str | None = None
    split_snapshot: _Builder | None = None  # state just before a repeated SPS/AUD
    split_start: int = 0  # offset where a new fragment would begin

    def snapshot(self) -> _Builder:
        return replace(self, gop_lengths=list(self.gop_lengths), split_snapshot=None)


class GenericNalCarver(RecoveryEngine):
    def __init__(
        self,
        options: CarveOptions | None = None,
        *,
        sink: EventSink | None = None,
        case_id: str | None = None,
        evidence_id: str | None = None,
    ) -> None:
        self.options = options or CarveOptions()
        self.sink = sink
        self.case_id = case_id
        self.evidence_id = evidence_id
        self._features: dict[tuple[int, int], FragmentFeatures] = {}
        self._pending_aud: tuple[int, int] | None = None

    # ------------------------------------------------------------ interface
    def carve_fragments(self, source_path: str) -> list[Fragment]:
        return [c.fragment for c in self.carve(source_path).fragments]

    def score_confidence(self, fragment: Fragment) -> float:
        feats = self._features.get(
            (fragment.byte_offset_start, fragment.byte_offset_end)
        )
        if feats is None:
            return fragment.confidence_score
        return score(feats)[0]

    # ----------------------------------------------------------------- carve
    def carve(self, source_path: str | Path) -> CarveResult:
        path = Path(source_path)
        if not path.is_file():
            raise CarverSourceError(f"Source is not a file: {path}")
        size = path.stat().st_size
        self._emit("recovery_started", image_path=str(path), file_size=size)

        opts = self.options
        codec = opts.codec_hint if opts.codec_hint in ("h264", "h265") else None
        fragments: list[CarvedFragment] = []
        stats = {
            "seen": 0,
            "valid": 0,
            "orphan": 0,
            "oversized": 0,
            "discarded": 0,
            "in_container": 0,
        }
        builder: _Builder | None = None
        pending: RawNal | None = None
        self._pending_aud = None

        # Pass A: whole container files. Their byte ranges are excluded from
        # the Annex-B scan below so the same bytes are never reported twice.
        containers: list[CarvedFragment] = []
        excluded: list[tuple[int, int]] = []
        if opts.carve_containers:
            try:
                containers, container_stats = carve_containers(
                    path, ContainerCarveOptions(block_size=opts.block_size)
                )
            except OSError as exc:
                raise CarverSourceError(f"Cannot read {path}: {exc}") from exc
            excluded = [
                (c.fragment.byte_offset_start, c.fragment.byte_offset_end)
                for c in containers
            ]
            if containers:
                logger.info(
                    "container pass recovered %d file(s) from %s",
                    len(containers),
                    path.name,
                )
                self._emit(
                    "container_files_recovered",
                    image_path=str(path),
                    files=len(containers),
                    candidates=container_stats.ftyp_candidates
                    + container_stats.riff_candidates,
                )

        def in_container(offset: int) -> bool:
            return any(lo <= offset < hi for lo, hi in excluded)

        try:
            # ``scan`` is read sequentially by the scanner; ``rnd`` is used for
            # random access (parameter sets, hashing) so the scan is never moved.
            with open(path, "rb") as scan, open(path, "rb") as rnd:
                file_trailing_zeros = trailing_zeros_of_file(rnd, size, opts.block_size)

                def close(reason: str, target: _Builder | None = None) -> None:
                    """Finish ``target`` (default: the current builder)."""
                    nonlocal builder
                    b = target if target is not None else builder
                    if b is None:
                        return
                    finished = self._finish(rnd, b, reason, len(fragments))
                    if finished is None:
                        stats["discarded"] += 1
                    else:
                        fragments.append(finished)
                    if target is None or target is builder:
                        builder = None

                for nal in scan_start_codes(scan, size, opts.block_size):
                    stats["seen"] += 1
                    inside = in_container(nal.offset)
                    if pending is not None:
                        end = nal.offset - nal.preceding_zeros
                        builder, codec = self._step(
                            rnd, builder, codec, pending, end, stats, close
                        )
                        if (
                            builder is not None
                            and nal.preceding_zeros > opts.filler_split_bytes
                        ):
                            close("zero_filler")
                    if inside:
                        # These bytes belong to a file recovered whole by pass
                        # A; inside an mdat a start code is a coincidence.
                        stats["in_container"] += 1
                        close("container_region")
                        pending = None
                        continue
                    pending = nal
                if pending is not None:
                    end = size - file_trailing_zeros
                    builder, codec = self._step(
                        rnd,
                        builder,
                        codec,
                        pending,
                        max(end, pending.offset),
                        stats,
                        close,
                        final=True,
                    )
                close("end_of_data")
        except OSError as exc:
            raise CarverSourceError(f"Cannot read {path}: {exc}") from exc

        # One ordered list: files recovered whole by pass A and streams carved
        # by pass B, in the order they appear in the image.
        fragments = sorted(
            fragments + containers, key=lambda c: c.fragment.byte_offset_start
        )
        for position, item in enumerate(fragments):
            item.index = position

        recovery_hash = hashlib.sha256(
            "\n".join(f.sha256 for f in fragments).encode()
        ).hexdigest()
        result = CarveResult(
            source_path=str(path),
            fragments=fragments,
            stats=CarveStats(
                file_size=size,
                start_codes_seen=stats["seen"],
                valid_nals=stats["valid"],
                orphan_nals=stats["orphan"],
                oversized_nals=stats["oversized"],
                discarded_fragments=stats["discarded"],
                codec=codec or "unknown",
                container_files=len(containers),
                nals_inside_containers=stats["in_container"],
            ),
            recovery_hash=recovery_hash,
        )
        logger.info(
            "carved %d fragment(s) from %s (%d start codes)",
            len(fragments),
            path,
            stats["seen"],
        )
        self._emit(
            "recovery_completed",
            image_path=str(path),
            fragment_count=len(fragments),
            recovery_hash=recovery_hash,
            recovery_method=RECOVERY_METHOD,
            **result.stats.model_dump(),
        )
        return result

    # -------------------------------------------------------- state machine
    def _step(
        self,
        fh: BinaryIO,
        builder: _Builder | None,
        codec: str | None,
        nal: RawNal,
        end: int,
        stats: dict[str, int],
        close,
        final: bool = False,
    ) -> tuple[_Builder | None, str | None]:
        """Consume one NAL whose stripped end is known. Returns new state."""
        opts = self.options
        cut_reason: str | None = None
        if end - nal.offset > opts.max_nal_bytes:
            stats["oversized"] += 1
            close("oversized_nal_gap")
            return None, codec

        # Decide the codec from the first unambiguous parameter set.
        if codec is None:
            if nal.is_h264_parameter_set:
                codec = "h264"
            elif nal.is_h265_parameter_set:
                codec = "h265"
            else:
                is_aud = (nal.is_h264 and nal.h264_type == 9) or (
                    nal.is_h265 and nal.h265_type == 35
                )
                self._pending_aud = (nal.offset, end) if is_aud else None
                stats["orphan"] += 1
                return builder, None

        kind = _classify(nal, codec)
        if kind is None:
            stats["orphan"] += 1
            if builder is not None:
                close("invalid_nal")
            return None, codec
        stats["valid"] += 1

        # An access-unit delimiter right before a fragment's first SPS belongs
        # to that fragment; remember it until the next NAL decides.
        pending_aud = self._pending_aud
        self._pending_aud = None
        if builder is None and kind == "aud":
            self._pending_aud = (nal.offset, end)
            return None, codec
        lead_in = pending_aud if pending_aud and pending_aud[1] == nal.offset else None

        if kind == "sps":
            sps_bytes = _read_nal(fh, nal, end)
            if builder is not None and builder.sps_bytes is not None:
                if sps_bytes != builder.sps_bytes:
                    close("new_sequence")
                    builder = None
                else:
                    # Remember the state before this repeated SPS (or the AUD
                    # that preceded it): if the IDR that follows reveals a
                    # short GOP, the recording boundary is here.
                    if builder.last_kind not in ("aud", "vps"):
                        builder.split_snapshot = builder.snapshot()
                        builder.split_start = nal.offset
                    builder.parameter_set_repeats += 1
            if builder is None:
                builder = _Builder(
                    start=lead_in[0] if lead_in else nal.offset,
                    start_reason="sps",
                    codec=codec,
                    nal_count=1 if lead_in else 0,
                )
            if builder.sps_bytes is None:
                builder.sps_bytes = sps_bytes
                try:
                    parser = parse_sps_h264 if codec == "h264" else parse_sps_h265
                    builder.stream = parser(sps_bytes[nal.start_code_len :])
                except (ValueError, IndexError) as exc:
                    builder.sps_error = str(exc)
        elif kind == "vps":
            if builder is None:
                builder = _Builder(
                    start=lead_in[0] if lead_in else nal.offset,
                    start_reason="vps",
                    codec=codec,
                    nal_count=1 if lead_in else 0,
                )
            elif builder.sps_bytes is not None and builder.last_kind != "aud":
                # A repeated VPS precedes the repeated SPS; a split lands here.
                builder.split_snapshot = builder.snapshot()
                builder.split_start = nal.offset
        elif builder is None:
            if kind == "idr":
                builder = _Builder(
                    start=nal.offset,
                    start_reason="idr_without_parameter_sets",
                    codec=codec,
                )
            elif kind == "pps":
                builder = _Builder(
                    start=nal.offset, start_reason="pps_without_sps", codec=codec
                )
            else:
                stats["orphan"] += 1
                return None, codec

        header_len = 1 if codec == "h264" else 2
        if kind == "eos":
            # End-of-sequence/stream NALs carry no payload, so their end is
            # exact even when unrelated data (or nothing) follows them.
            end = min(end, nal.offset + nal.start_code_len + header_len)
        elif final or end - nal.offset > opts.verify_nal_bytes:
            # Emulation prevention guarantees no 00 00 00 inside a NAL, so a
            # zero triple means the NAL really ended there (filler or damage).
            hit = _find_zero_triple(
                fh, nal.offset + nal.start_code_len + header_len, end
            )
            if hit is not None:
                end, run = hit
                cut_reason = (
                    "zero_filler" if run >= opts.filler_split_bytes else "truncated_nal"
                )

        picture_start = kind in ("idr", "vcl") and nal.is_picture_start(codec)

        if kind == "aud" and builder.sps_bytes is not None:
            # An access-unit delimiter may open the next recording; snapshot
            # here so a split lands before it rather than before the SPS.
            builder.split_snapshot = builder.snapshot()
            builder.split_start = nal.offset

        if kind == "idr" and picture_start and builder.split_snapshot is not None:
            snap = builder.split_snapshot
            expected = _established_gop(snap.gop_lengths)
            if expected is not None and 0 < snap.gop_pictures < expected:
                # The GOP before the repeated SPS was cut short: a recording
                # ended there and a new one started with these parameter sets.
                close("short_gop", snap)
                builder = _Builder(
                    start=builder.split_start,
                    start_reason="sps",
                    codec=codec,
                    end=builder.end,
                    nal_count=builder.nal_count - snap.nal_count,
                    sps_bytes=builder.sps_bytes,
                    stream=builder.stream,
                    sps_error=builder.sps_error,
                    has_pps=builder.pps_count > snap.pps_count,
                    pps_count=builder.pps_count - snap.pps_count,
                )
            else:
                builder.split_snapshot = None

        builder.nal_count += 1
        builder.end = end
        builder.last_kind = kind
        if kind == "pps":
            builder.has_pps = True
            builder.pps_count += 1
        if kind in ("idr", "vcl"):
            builder.vcl_count += 1
            if builder.first_vcl_is_idr is None:
                builder.first_vcl_is_idr = kind == "idr"
            if kind == "idr":
                builder.idr_count += 1
            if picture_start:
                builder.picture_count += 1
                if kind == "idr":
                    if builder.gop_pictures > 0:
                        builder.gop_lengths.append(builder.gop_pictures)
                    builder.gop_pictures = 0
                builder.gop_pictures += 1
        if kind == "eos":
            close("eos")
            return None, codec
        if cut_reason is not None:
            close(cut_reason)
            return None, codec
        return builder, codec

    def _finish(
        self, fh: BinaryIO, b: _Builder, reason: str, index: int
    ) -> CarvedFragment | None:
        if b.nal_count < self.options.min_nals or b.vcl_count == 0:
            logger.debug(
                "discarding candidate at 0x%x: %d NALs, %d VCL",
                b.start,
                b.nal_count,
                b.vcl_count,
            )
            return None
        features = FragmentFeatures(
            codec=b.codec,
            start_reason=b.start_reason,
            end_reason=reason,
            has_sps=b.sps_bytes is not None,
            sps_parsed=b.stream is not None,
            has_pps=b.has_pps,
            first_vcl_is_idr=bool(b.first_vcl_is_idr),
            nal_count=b.nal_count,
            vcl_count=b.vcl_count,
            idr_count=b.idr_count,
            picture_count=b.picture_count,
            parameter_set_repeats=b.parameter_set_repeats,
        )
        confidence, rationale = score(features)
        if b.stream is not None:
            codec_info = b.stream.describe()
        else:
            label = "H.264" if b.codec == "h264" else "H.265"
            codec_info = f"{label} (SPS {'unparseable: ' + b.sps_error if b.sps_error else 'absent'})"
        digest = _hash_range(fh, b.start, b.end)
        fragment = Fragment(
            # Deterministic id derived from content, so AI triage results and
            # reports can reference a fragment across re-runs of the carver.
            fragment_id=f"frag-{digest[:16]}",
            byte_offset_start=b.start,
            byte_offset_end=b.end,
            codec_info=codec_info,
            recovery_method=RECOVERY_METHOD,
            confidence_score=confidence,
            confidence_rationale=rationale,
        )
        self._features[(b.start, b.end)] = features
        return CarvedFragment(
            index=index,
            fragment=fragment,
            sps_sha256=(
                hashlib.sha256(b.sps_bytes).hexdigest() if b.sps_bytes else None
            ),
            features=features,
            stream=b.stream,
            sha256=digest,
            length=b.end - b.start,
        )

    # ---------------------------------------------------------------- export
    def export(
        self, source_path: str | Path, result: CarveResult, out_dir: str | Path
    ) -> list[ExportedFragment]:
        """Write each fragment to ``out_dir`` and verify it byte for byte."""
        out_dir = Path(out_dir)
        out_dir.mkdir(parents=True, exist_ok=True)
        exported: list[ExportedFragment] = []
        with open(source_path, "rb") as fh:
            for frag in result.fragments:
                f = frag.fragment
                if frag.container is not None:
                    ext = frag.container.extension.lstrip(".")
                else:
                    ext = "h265" if frag.features.codec == "h265" else "h264"
                out_path = (
                    out_dir
                    / f"fragment_{frag.index:04d}_{f.byte_offset_start:012x}.{ext}"
                )
                digest = hashlib.sha256()
                try:
                    with open(out_path, "wb") as dst:
                        fh.seek(f.byte_offset_start)
                        remaining = f.byte_offset_end - f.byte_offset_start
                        while remaining > 0:
                            chunk = fh.read(min(HASH_CHUNK, remaining))
                            if not chunk:
                                break
                            dst.write(chunk)
                            digest.update(chunk)
                            remaining -= len(chunk)
                except OSError as exc:
                    raise CarverExportError(f"Cannot write {out_path}: {exc}") from exc
                written = digest.hexdigest()
                on_disk = _hash_file(out_path)
                if written != frag.sha256 or on_disk != frag.sha256:
                    out_path.unlink(missing_ok=True)
                    raise CarverExportError(
                        f"Fragment {frag.index} hash mismatch: carved {frag.sha256}, "
                        f"written {written}, on disk {on_disk}"
                    )
                item = ExportedFragment(
                    index=frag.index,
                    out_path=str(out_path),
                    byte_offset_start=f.byte_offset_start,
                    byte_offset_end=f.byte_offset_end,
                    sha256=frag.sha256,
                    length=frag.length,
                )
                exported.append(item)
                self._emit("fragment_exported", **item.model_dump())
        return exported

    # ---------------------------------------------------------------- events
    def _emit(self, event_type: str, **payload) -> None:
        if self.sink is None or self.case_id is None:
            return
        emit(
            self.sink,
            event_type,
            self.case_id,
            stage="recovery",
            evidence_id=self.evidence_id,
            **payload,
        )


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------
def _classify(nal: RawNal, codec: str) -> str | None:
    if codec == "h264":
        if not nal.is_h264:
            return None
        t = nal.h264_type
        if t == H264_SPS:
            return "sps"
        if t == H264_PPS:
            return "pps"
        if t in H264_IDR:
            return "idr"
        if t in H264_VCL:
            return "vcl"
        if t in H264_EOS:
            return "eos"
        if t == 9:
            return "aud"
        return "other"
    if not nal.is_h265:
        return None
    t = nal.h265_type
    if t == H265_VPS:
        return "vps"
    if t == H265_SPS:
        return "sps"
    if t == H265_PPS:
        return "pps"
    if t in H265_IRAP:
        return "idr"
    if t in H265_VCL:
        return "vcl"
    if t in H265_EOS:
        return "eos"
    if t == 35:
        return "aud"
    return "other"


def _established_gop(lengths: list[int]) -> int | None:
    """GOP length a recorder has demonstrated: two consecutive equal GOPs."""
    if len(lengths) >= 2 and lengths[-1] == lengths[-2]:
        return lengths[-1]
    return None


def _find_zero_triple(fh: BinaryIO, start: int, end: int) -> tuple[int, int] | None:
    """First ``00 00 00`` in [start, end) and the length of that zero run."""
    pos = start
    carry = b""
    while pos < end:
        fh.seek(pos)
        chunk = fh.read(min(HASH_CHUNK, end - pos))
        if not chunk:
            break
        buf = carry + chunk
        i = buf.find(b"\x00\x00\x00")
        if i != -1:
            hit = pos - len(carry) + i
            run = 0
            fh.seek(hit)
            while hit + run < end:
                piece = fh.read(min(HASH_CHUNK, end - hit - run))
                if not piece:
                    break
                stripped = piece.lstrip(b"\x00")
                run += len(piece) - len(stripped)
                if stripped:
                    break
            return hit, run
        carry = buf[-2:]
        pos += len(chunk)
    return None


def _read_nal(fh: BinaryIO, nal: RawNal, end: int) -> bytes:
    length = min(end - nal.offset, PARAMETER_SET_READ_LIMIT)
    fh.seek(nal.offset)
    return fh.read(length)


def _hash_range(fh: BinaryIO, start: int, end: int) -> str:
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


def _hash_file(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(HASH_CHUNK), b""):
            digest.update(chunk)
    return digest.hexdigest()
