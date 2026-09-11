"""End-to-end demo pipeline: intake -> detect -> resolve -> carve -> export -> encrypt.

Every stage emits events through the shared sink so the run is auditable,
and the whole run is written to ``<out_dir>/pipeline_result.json`` plus an
event transcript ``<out_dir>/run_transcript.json`` that the demo can replay
if live hardware misbehaves.

Order of hashing is the forensic invariant here: plaintext hashes are taken
at intake (streamed), after export (fragment SHA-256 from image bytes), and
again immediately before encryption (``pre_encryption`` stage via the shared
``CryptoProvider``). Encryption never touches bytes that have not been hashed.
"""

from __future__ import annotations

import hashlib
import io
import json
import logging
import time
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field

from backend.acquisition import (
    AcquisitionRecord,
    acquire,
    build_evidence_item,
)
from backend.adapters.generic_carver.adapter import GenericCarverAdapter
from backend.adapters.generic_carver.models import (
    CarveOptions,
    CarveResult,
    ExportedFragment,
)
from backend.adapters.generic_carver.timeline import Timeline
from backend.core.evidence_model import DetectionResult, EvidenceItem, HashRecord
from backend.core.interfaces import CryptoProvider
from backend.detection.detector import FormatDetector, resolve_adapter
from backend.detection.models import DetectionReport
from backend.pipeline.custody import write_custody_facts
from backend.pipeline.events import EventSink, InMemoryEventSink, PipelineEvent, emit

logger = logging.getLogger("phoenix.pipeline.runner")


class _RecordingSink:
    """Forward to the caller's sink and keep a copy of every event for the transcript."""

    def __init__(self, inner: EventSink) -> None:
        self.inner = inner
        self.events: list[PipelineEvent] = []

    def emit(self, event: PipelineEvent) -> None:
        self.events.append(event)
        self.inner.emit(event)

IMAGE_NAME = "evidence.img"
FRAGMENT_DIR = "fragments"
VAULT_DIR = "vault"
PLAYABLE_DIR = "playable"
RESULT_NAME = "pipeline_result.json"
CUSTODY_NAME = "custody_facts.json"
TRANSCRIPT_NAME = "run_transcript.json"


class PipelineError(Exception):
    """A stage could not run at all (for example, no adapter is available)."""


class EncryptedArtifact(BaseModel):
    model_config = ConfigDict(extra="forbid")

    fragment_index: int
    plaintext_path: str
    encrypted_path: str
    plaintext_sha256: str
    ciphertext_sha256: str
    plaintext_bytes: int
    ciphertext_bytes: int


class PlayableView(BaseModel):
    """A lossless MP4 wrapper around an exported fragment (a view, not evidence)."""

    model_config = ConfigDict(extra="forbid")

    fragment_id: str | None = None
    fragment_index: int
    fragment_path: str
    mp4_path: str | None
    samples: int = 0
    sync_samples: int = 0
    fps: float = 0.0
    mp4_sha256: str | None = None
    note: str | None = None


class AdapterSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")

    module: str
    class_name: str
    fallback: bool
    available: bool
    reason: str


class StageTiming(BaseModel):
    model_config = ConfigDict(extra="forbid")

    stage: str
    seconds: float


class PipelineResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    case_id: str
    operator_id: str
    investigator_id: str | None = None
    custodian_id: str | None = None
    evidence_id: str
    source_path: str
    out_dir: str
    started_utc: datetime
    finished_utc: datetime
    acquisition: AcquisitionRecord
    detection: DetectionReport
    adapter: AdapterSummary
    evidence: EvidenceItem
    carve: CarveResult | None = None
    timeline: Timeline | None = None
    exported: list[ExportedFragment] = Field(default_factory=list)
    encrypted: list[EncryptedArtifact] = Field(default_factory=list)
    image_encrypted: EncryptedArtifact | None = None
    playable: list[PlayableView] = Field(default_factory=list)
    timings: list[StageTiming] = Field(default_factory=list)
    events: list[PipelineEvent] = Field(default_factory=list)

    def summary(self) -> dict:
        return {
            "case_id": self.case_id,
            "evidence_id": self.evidence_id,
            "image_sha256": self.acquisition.intake_sha256.hex_digest,
            "image_md5": self.acquisition.intake_md5.hex_digest,
            "vendor": self.detection.vendor_info.vendor_name,
            "validation_status": self.detection.vendor_info.validation_status.value,
            "detection_confidence": self.detection.confidence,
            "adapter": f"{self.adapter.module}.{self.adapter.class_name}",
            "fallback": self.adapter.fallback,
            "fragments": len(self.evidence.fragments),
            "exported": len(self.exported),
            "encrypted": len(self.encrypted),
            "image_encrypted": self.image_encrypted is not None,
            "playable": sum(1 for p in self.playable if p.mp4_path),
            "channels": len(self.evidence.channels),
            "estimated_seconds": (
                self.timeline.total_estimated_seconds if self.timeline else None
            ),
            "events": len(self.events),
            "seconds": sum(t.seconds for t in self.timings),
        }


def run_pipeline(
    source: str | Path,
    *,
    case_id: str,
    operator_id: str,
    out_dir: str | Path,
    sink: EventSink | None = None,
    device_info: str = "",
    investigator_id: str | None = None,
    custodian_id: str | None = None,
    crypto: CryptoProvider | None = None,
    detector: FormatDetector | None = None,
    carve_options: CarveOptions | None = None,
    encrypt: bool = True,
    encrypt_image: bool = True,
    wrap_mp4: bool = True,
    adapter_map: dict[str, tuple[str, str]] | None = None,
    generic: tuple[str, str] | None = None,
    progress_cb: Callable[[int], None] | None = None,
) -> PipelineResult:
    """Run the full acquisition-side pipeline on ``source``.

    Raises the typed ``AcquisitionError`` subclasses if intake fails (after
    recording the failure), and ``PipelineError`` if no adapter can be loaded.
    """
    source = Path(source)
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    sink = sink if sink is not None else InMemoryEventSink()
    if not hasattr(sink, "events"):
        sink = _RecordingSink(sink)
    detector = detector or FormatDetector()
    started = datetime.now(UTC)
    timings: list[StageTiming] = []

    # 1. intake -----------------------------------------------------------
    t0 = time.perf_counter()
    image_path = out_dir / IMAGE_NAME
    record = acquire(
        source,
        image_path,
        case_id=case_id,
        operator_id=operator_id,
        device_info=device_info or f"source {source}",
        sink=sink,
        progress_cb=progress_cb,
    )
    evidence_id = f"ev-{record.acquisition_id}"
    timings.append(StageTiming(stage="intake", seconds=time.perf_counter() - t0))

    # 2. detection --------------------------------------------------------
    t0 = time.perf_counter()
    report = detector.detect(
        image_path, case_id=case_id, evidence_id=evidence_id, sink=sink
    )
    resolution = resolve_adapter(
        report,
        case_id=case_id,
        evidence_id=evidence_id,
        sink=sink,
        adapter_map=adapter_map,
        generic=generic,
    )
    timings.append(StageTiming(stage="detection", seconds=time.perf_counter() - t0))
    if not resolution.available or resolution.adapter is None:
        raise PipelineError(f"No adapter available: {resolution.reason}")

    evidence = build_evidence_item(record, report.vendor_info, evidence_id=evidence_id)

    # 3. parse / carve ----------------------------------------------------
    t0 = time.perf_counter()
    adapter = resolution.adapter
    carve_result: CarveResult | None = None
    timeline: Timeline | None = None
    exported: list[ExportedFragment] = []
    playable: list[PlayableView] = []
    parsed: EvidenceItem | None = None
    if type(adapter) is not GenericCarverAdapter:
        fallback_reason: str | None = None
        try:
            parsed = adapter.parse(str(image_path))
        except NotImplementedError as exc:
            # a vendor adapter that passed the probe but has no parser yet
            fallback_reason = f"parse raised NotImplementedError ({exc})"
        else:
            if not parsed.fragments:
                # A vendor parser that finds nothing (missing or damaged index)
                # must not end the recovery: the generic carver still reads
                # the raw stream, which is the whole point of having it.
                fallback_reason = "vendor parser found no recordings"
                parsed = None
        if fallback_reason is not None:
            # Safety net: intake must not stop. Route to the generic carver
            # and record the change of plan.
            resolution = resolution.model_copy(
                update={
                    "resolved_module": GenericCarverAdapter.__module__,
                    "resolved_class": GenericCarverAdapter.__name__,
                    "fallback": True,
                    "reason": f"{resolution.reason}; {fallback_reason}; "
                    "using generic carver",
                    "adapter": None,
                }
            )
            emit(
                sink,
                "adapter_resolved",
                case_id,
                stage="detection",
                evidence_id=evidence_id,
                adapter=f"{resolution.resolved_module}.{resolution.resolved_class}",
                fallback=True,
                available=True,
                reason=resolution.reason,
            )
            adapter = GenericCarverAdapter()
    if type(adapter) is GenericCarverAdapter:
        options = carve_options or CarveOptions()
        adapter = GenericCarverAdapter(
            options,
            detector=detector,
            sink=sink,
            case_id=case_id,
            evidence_id=evidence_id,
            report=report,
        )
        parsed = adapter.parse(str(image_path))
        carve_result = adapter.last_result
        timeline = adapter.last_timeline
        exported = adapter.last_carver.export(
            image_path, carve_result, out_dir / FRAGMENT_DIR
        )
        if wrap_mp4:
            playable = _wrap_playable(
                exported,
                out_dir / PLAYABLE_DIR,
                fragment_ids={
                    c.index: c.fragment.fragment_id for c in carve_result.fragments
                },
            )
        else:
            playable = []

    if not exported and parsed and parsed.fragments:
        frag_dir = out_dir / FRAGMENT_DIR
        frag_dir.mkdir(parents=True, exist_ok=True)
        with open(image_path, "rb") as src_f:
            for idx, frag in enumerate(parsed.fragments):
                ext = ".h265" if "265" in (frag.codec_info or "") else ".h264"
                start = frag.byte_offset_start or 0
                end = frag.byte_offset_end or start
                frag_filename = f"fragment_{idx:04d}_{start:012d}{ext}"
                out_path = frag_dir / frag_filename
                src_f.seek(start)
                length = max(0, end - start)
                frag_bytes = src_f.read(length) if length > 0 else b""
                out_path.write_bytes(frag_bytes)
                frag_sha = hashlib.sha256(frag_bytes).hexdigest()
                exported.append(
                    ExportedFragment(
                        index=idx,
                        out_path=str(out_path),
                        byte_offset_start=start,
                        byte_offset_end=end,
                        sha256=frag_sha,
                        length=len(frag_bytes),
                    )
                )
        if wrap_mp4:
            playable = _wrap_playable(
                exported,
                out_dir / PLAYABLE_DIR,
                fragment_ids={
                    idx: frag.fragment_id for idx, frag in enumerate(parsed.fragments)
                },
            )
        else:
            playable = []

    recovery_end = time.perf_counter()
    timings.append(StageTiming(stage="recovery", seconds=recovery_end - t0))
    t0 = recovery_end
    
    # 3b. AI Triage (runs on playable MP4 views) ---------------------------
    detections: list[DetectionResult] = []
    if playable:
        t0 = time.perf_counter()
        try:
            from backend.adapters.generic_carver.frame_extractor import (
                extract_frames_from_playable,
            )
            from backend.ai.triage import analyze_frame
            
            frames = extract_frames_from_playable(playable, max_frames_per_fragment=3)
            for frame in frames:
                img_bytes = io.BytesIO()
                frame.image.save(img_bytes, format="JPEG", quality=85)
                frame_detections = analyze_frame(
                    img_bytes.getvalue(),
                    confidence_threshold=0.4,
                    fragment_id=playable[frame.fragment_index].fragment_id if frame.fragment_index >= 0 else None
                )
                detections.extend(frame_detections)
            
            timings.append(StageTiming(stage="triage", seconds=time.perf_counter() - t0))
            logger.info(f"AI triage completed: {len(detections)} detections across {len(frames)} frames")
        except Exception as e:
            logger.warning(f"AI triage failed (non-fatal): {e}")
            timings.append(StageTiming(stage="triage", seconds=time.perf_counter() - t0))
    else:
        timings.append(StageTiming(stage="triage", seconds=0.0))

    if parsed is None:
        raise PipelineError("Adapter parse returned None unexpectedly")

    evidence = evidence.model_copy(
        update={
            "channels": parsed.channels,
            "fragments": parsed.fragments,
            "hash_lineage": evidence.hash_lineage + parsed.hash_lineage,
            "detections": detections if detections else None,
            "metadata": {**evidence.metadata, **parsed.metadata},
        }
    )

    # 4. hash-then-encrypt ------------------------------------------------
    encrypted: list[EncryptedArtifact] = []
    image_encrypted: EncryptedArtifact | None = None
    if encrypt:
        t0 = time.perf_counter()
        if crypto is None:
            import os

            from backend.crypto.provider import PhoenixCryptoProvider

            demo_mode = os.environ.get("PHOENIX_DEMO_MODE", "").lower() in ("1", "true", "yes")
            crypto = PhoenixCryptoProvider(demo_mode=demo_mode)
        vault = out_dir / VAULT_DIR
        vault.mkdir(exist_ok=True)
        lineage: list[HashRecord] = list(evidence.hash_lineage)

        if encrypt_image:
            # Whole image, streamed: the intake hash already covers the
            # plaintext, so only the ciphertext is hashed here.
            image_encrypted = _encrypt_image(
                image_path, vault / (IMAGE_NAME + ".enc"), crypto, case_id, record
            )
            if image_encrypted is not None:
                emit(
                    sink,
                    "encryption_completed",
                    case_id,
                    stage="encryption",
                    evidence_id=evidence_id,
                    **image_encrypted.model_dump(),
                )

        for item in exported:
            data = Path(item.out_path).read_bytes()
            pre = crypto.hash_plaintext(
                data, f"pre_encryption/fragment_{item.index:04d}"
            )
            if pre.hex_digest != item.sha256:
                raise PipelineError(
                    f"Fragment {item.index} changed between export and encryption"
                )
            lineage.append(pre)
            blob = crypto.encrypt(data, case_id)
            enc_path = vault / (Path(item.out_path).name + ".enc")
            enc_path.write_bytes(blob)
            cipher_sha = hashlib.sha256(blob).hexdigest()
            artifact = EncryptedArtifact(
                fragment_index=item.index,
                plaintext_path=item.out_path,
                encrypted_path=str(enc_path),
                plaintext_sha256=pre.hex_digest,
                ciphertext_sha256=cipher_sha,
                plaintext_bytes=len(data),
                ciphertext_bytes=len(blob),
            )
            encrypted.append(artifact)
            emit(
                sink,
                "encryption_completed",
                case_id,
                stage="encryption",
                evidence_id=evidence_id,
                **artifact.model_dump(),
            )
        evidence = evidence.model_copy(update={"hash_lineage": lineage})
        timings.append(
            StageTiming(stage="encryption", seconds=time.perf_counter() - t0)
        )

    # 5. persist ----------------------------------------------------------
    events = list(getattr(sink, "events", []))
    result = PipelineResult(
        case_id=case_id,
        operator_id=operator_id,
        investigator_id=investigator_id,
        custodian_id=custodian_id,
        evidence_id=evidence_id,
        source_path=str(source),
        out_dir=str(out_dir),
        started_utc=started,
        finished_utc=datetime.now(UTC),
        acquisition=record,
        detection=report,
        adapter=AdapterSummary(
            module=resolution.resolved_module,
            class_name=resolution.resolved_class,
            fallback=resolution.fallback,
            available=resolution.available,
            reason=resolution.reason,
        ),
        evidence=evidence,
        carve=carve_result,
        timeline=timeline,
        exported=exported,
        encrypted=encrypted,
        image_encrypted=image_encrypted,
        playable=playable,
        timings=timings,
        events=events,
    )
    write_custody_facts(result, out_dir / CUSTODY_NAME)
    (out_dir / RESULT_NAME).write_text(
        result.model_dump_json(indent=2), encoding="utf-8"
    )
    write_transcript(result, out_dir / TRANSCRIPT_NAME)
    logger.info("pipeline finished: %s", json.dumps(result.summary()))
    return result


def _wrap_playable(
    exported: list[ExportedFragment],
    out_dir: Path,
    fps: float = 25.0,
    fragment_ids: dict[int, str] | None = None,
) -> list[PlayableView]:
    """Lossless MP4 views of H.264 fragments; failures are recorded, not raised."""
    from backend.adapters.generic_carver.mp4 import wrap_fragment_file

    out_dir.mkdir(parents=True, exist_ok=True)
    ids = fragment_ids or {}
    views: list[PlayableView] = []
    for item in exported:
        src = Path(item.out_path)
        if src.suffix.lower() in (".mp4", ".mov", ".m4v", ".avi"):
            # A file recovered whole by the container pass is already a
            # playable file. Wrapping it would change its bytes, so the view
            # points at the exhibit itself.
            views.append(
                PlayableView(
                    fragment_id=ids.get(item.index),
                    fragment_index=item.index,
                    fragment_path=item.out_path,
                    mp4_path=item.out_path,
                    mp4_sha256=item.sha256,
                    note="recovered container file; played as recovered, not re-wrapped",
                )
            )
            continue
        dst = out_dir / (src.stem + ".mp4")
        try:
            info = wrap_fragment_file(src, dst, fps=fps)
        except (ValueError, NotImplementedError) as exc:
            views.append(
                PlayableView(
                    fragment_id=ids.get(item.index),
                    fragment_index=item.index,
                    fragment_path=item.out_path,
                    mp4_path=None,
                    note=f"not wrapped: {exc}",
                )
            )
            continue
        views.append(
            PlayableView(
                fragment_id=ids.get(item.index),
                fragment_index=item.index,
                fragment_path=item.out_path,
                mp4_path=str(dst),
                samples=info.samples,
                sync_samples=info.sync_samples,
                fps=info.fps,
                mp4_sha256=hashlib.sha256(dst.read_bytes()).hexdigest(),
            )
        )
    return views


def _encrypt_image(
    image_path: Path,
    enc_path: Path,
    crypto: CryptoProvider,
    case_id: str,
    record: AcquisitionRecord,
) -> EncryptedArtifact | None:
    """Stream-encrypt the image with the case DEK using the provider's public encrypt_file method.

    The shared ``CryptoProvider`` interface now includes ``encrypt_file`` for
    streaming encryption of large files. If the provider doesn't implement it,
    the image is skipped (fragments are still encrypted via the public interface).
    """
    encrypt_file_method = getattr(crypto, "encrypt_file", None)
    if encrypt_file_method is None:
        logger.warning("crypto provider exposes no encrypt_file; image not encrypted")
        return None

    encrypt_file_method(image_path, enc_path, case_id)
    digest = hashlib.sha256()
    with open(enc_path, "rb") as fh:
        for chunk in iter(lambda: fh.read(4 * 1024 * 1024), b""):
            digest.update(chunk)
    return EncryptedArtifact(
        fragment_index=-1,
        plaintext_path=str(image_path),
        encrypted_path=str(enc_path),
        plaintext_sha256=record.intake_sha256.hex_digest,
        ciphertext_sha256=digest.hexdigest(),
        plaintext_bytes=record.bytes_read,
        ciphertext_bytes=enc_path.stat().st_size,
    )


def write_transcript(result: PipelineResult, path: str | Path) -> Path:
    """Compact, human-readable replay of the run for the demo fallback."""
    path = Path(path)
    transcript = {
        "summary": result.summary(),
        "started_utc": result.started_utc.isoformat(),
        "finished_utc": result.finished_utc.isoformat(),
        "timings": [t.model_dump() for t in result.timings],
        "detection_rationale": result.detection.rationale,
        "fragments": [
            {
                "index": i,
                "byte_offset_start": f.byte_offset_start,
                "byte_offset_end": f.byte_offset_end,
                "codec_info": f.codec_info,
                "confidence_score": f.confidence_score,
                "confidence_rationale": f.confidence_rationale,
            }
            for i, f in enumerate(result.evidence.fragments)
        ],
        "channels": [c.model_dump(mode="json") for c in result.evidence.channels],
        "timeline": (
            result.timeline.model_dump(mode="json") if result.timeline else None
        ),
        "hash_lineage": [
            h.model_dump(mode="json") for h in result.evidence.hash_lineage
        ],
        "events": [e.model_dump(mode="json") for e in result.events],
    }
    path.write_text(json.dumps(transcript, indent=2), encoding="utf-8")
    return path
