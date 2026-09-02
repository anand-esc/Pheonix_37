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
import json
import logging
import time
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
from backend.core.evidence_model import EvidenceItem, HashRecord
from backend.core.interfaces import CryptoProvider
from backend.detection.detector import FormatDetector, resolve_adapter
from backend.detection.models import DetectionReport
from backend.pipeline.events import EventSink, InMemoryEventSink, PipelineEvent, emit

logger = logging.getLogger("phoenix.pipeline.runner")

IMAGE_NAME = "evidence.img"
FRAGMENT_DIR = "fragments"
VAULT_DIR = "vault"
RESULT_NAME = "pipeline_result.json"
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
    exported: list[ExportedFragment] = Field(default_factory=list)
    encrypted: list[EncryptedArtifact] = Field(default_factory=list)
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
    crypto: CryptoProvider | None = None,
    detector: FormatDetector | None = None,
    carve_options: CarveOptions | None = None,
    encrypt: bool = True,
    adapter_map: dict[str, tuple[str, str]] | None = None,
    generic: tuple[str, str] | None = None,
) -> PipelineResult:
    """Run the full acquisition-side pipeline on ``source``.

    Raises the typed ``AcquisitionError`` subclasses if intake fails (after
    recording the failure), and ``PipelineError`` if no adapter can be loaded.
    """
    source = Path(source)
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    sink = sink if sink is not None else InMemoryEventSink()
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
    exported: list[ExportedFragment] = []
    if isinstance(adapter, GenericCarverAdapter):
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
        exported = adapter.last_carver.export(
            image_path, carve_result, out_dir / FRAGMENT_DIR
        )
    else:
        parsed = adapter.parse(str(image_path))

    evidence = evidence.model_copy(
        update={
            "channels": parsed.channels,
            "fragments": parsed.fragments,
            "metadata": {**evidence.metadata, **parsed.metadata},
        }
    )
    timings.append(StageTiming(stage="recovery", seconds=time.perf_counter() - t0))

    # 4. hash-then-encrypt ------------------------------------------------
    encrypted: list[EncryptedArtifact] = []
    if encrypt and exported:
        t0 = time.perf_counter()
        if crypto is None:
            from backend.crypto.provider import PhoenixCryptoProvider

            crypto = PhoenixCryptoProvider()
        vault = out_dir / VAULT_DIR
        vault.mkdir(exist_ok=True)
        lineage: list[HashRecord] = list(evidence.hash_lineage)
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
        exported=exported,
        encrypted=encrypted,
        timings=timings,
        events=events,
    )
    (out_dir / RESULT_NAME).write_text(
        result.model_dump_json(indent=2), encoding="utf-8"
    )
    write_transcript(result, out_dir / TRANSCRIPT_NAME)
    logger.info("pipeline finished: %s", json.dumps(result.summary()))
    return result


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
        "hash_lineage": [
            h.model_dump(mode="json") for h in result.evidence.hash_lineage
        ],
        "events": [e.model_dump(mode="json") for e in result.events],
    }
    path.write_text(json.dumps(transcript, indent=2), encoding="utf-8")
    return path
