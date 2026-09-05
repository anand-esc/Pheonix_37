"""Custody facts: the machine-readable input a certificate draft is built from.

This module produces **facts, not a certificate**. Every field is something
the pipeline actually observed and can point at a hash or a rationale for.
The reporting owner turns these into the BSA §63 certificate draft, which a
human being then reviews and signs; nothing here is signed, and nothing here
should ever be rendered as if it were.

The section names follow what §63(4) of the Bharatiya Sakshya Adhiniyam asks a
certificate to state about electronic evidence produced by a computer:

* what the device/source was and who handled it (``source`` , ``custody``)
* how the copy was produced and by what tool (``method``, ``tooling``)
* that the content is unaltered, and how that is demonstrable (``integrity``)
* what the output actually contains (``contents``)

plus a ``limitations`` section, because a draft that hides what the tool could
not determine is worse than useless in court.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import TYPE_CHECKING

from pydantic import BaseModel, ConfigDict, Field

if TYPE_CHECKING:  # pragma: no cover - import cycle only matters for typing
    from backend.pipeline.runner import PipelineResult

CUSTODY_NAME = "custody_facts.json"
DISCLAIMER = (
    "These are observed facts produced by an automated pipeline. They are "
    "input for a certificate draft under BSA 2023 section 63; they are not a "
    "certificate, are unsigned, and require review and signature by the "
    "person responsible for the device or its operation."
)


class SourceFacts(BaseModel):
    model_config = ConfigDict(extra="forbid")

    case_id: str
    evidence_id: str
    source_path: str
    source_device_info: str
    declared_vendor: str
    vendor_validation_status: str
    detected_signature: str
    detection_confidence: float
    detection_rationale: list[str] = Field(default_factory=list)


class CustodyFacts_Handling(BaseModel):
    model_config = ConfigDict(extra="forbid")

    operator_id: str
    acquisition_id: str
    started_utc: datetime
    finished_utc: datetime | None
    acquisition_status: str
    notes: list[str] = Field(default_factory=list)


class MethodFacts(BaseModel):
    model_config = ConfigDict(extra="forbid")

    read_only_acquisition: bool = True
    description: str
    adapter: str
    adapter_is_fallback: bool
    adapter_reason: str
    recovery_method: str | None = None
    stages: list[str] = Field(default_factory=list)


class ToolingFacts(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tool_name: str = "Phoenix"
    tool_version: str
    python_version: str
    platform: str
    run_started_utc: datetime
    run_finished_utc: datetime


class HashFact(BaseModel):
    model_config = ConfigDict(extra="forbid")

    stage: str
    algorithm: str
    hex_digest: str
    timestamp_utc: datetime


class IntegrityFacts(BaseModel):
    model_config = ConfigDict(extra="forbid")

    image_sha256: str
    image_md5: str
    image_bytes: int
    verification_sha256: str | None
    verification_matched: bool
    hash_lineage: list[HashFact] = Field(default_factory=list)
    recovery_hash: str | None = None
    encrypted_artifacts: int = 0
    image_encrypted: bool = False
    statement: str


class FragmentFact(BaseModel):
    model_config = ConfigDict(extra="forbid")

    fragment_id: str
    byte_offset_start: int
    byte_offset_end: int
    sha256: str | None = None
    codec_info: str
    recovery_method: str
    confidence_score: float
    confidence_rationale: str
    channel_id: str | None = None
    estimated_seconds: float | None = None
    duration_basis: str | None = None
    complete: bool | None = None


class ContentsFacts(BaseModel):
    model_config = ConfigDict(extra="forbid")

    fragment_count: int
    channel_count: int
    estimated_footage_seconds: float | None
    channels: list[dict] = Field(default_factory=list)
    fragments: list[FragmentFact] = Field(default_factory=list)


class CustodyFacts(BaseModel):
    """Everything a certificate draft needs, with nothing asserted twice."""

    model_config = ConfigDict(extra="forbid")

    disclaimer: str = DISCLAIMER
    generated_utc: datetime = Field(default_factory=lambda: datetime.now(UTC))
    source: SourceFacts
    custody: CustodyFacts_Handling
    method: MethodFacts
    tooling: ToolingFacts
    integrity: IntegrityFacts
    contents: ContentsFacts
    limitations: list[str] = Field(default_factory=list)
    signature_block: dict[str, str] = Field(default_factory=dict)

    def to_json(self) -> str:
        return self.model_dump_json(indent=2)


def build_custody_facts(result: PipelineResult) -> CustodyFacts:
    """Assemble the facts of one pipeline run. Adds nothing it did not observe."""
    import platform
    import sys

    record = result.acquisition
    intake_sha = record.intake_sha256.hex_digest
    verification = record.verification_hash

    timeline = result.timeline
    entry_by_id = {e.fragment_id: e for e in (timeline.entries if timeline else [])}
    sha_by_id = {
        c.fragment.fragment_id: c.sha256
        for c in (result.carve.fragments if result.carve else [])
    }

    fragments = []
    for fragment in result.evidence.fragments:
        entry = entry_by_id.get(fragment.fragment_id)
        fragments.append(
            FragmentFact(
                fragment_id=fragment.fragment_id,
                byte_offset_start=fragment.byte_offset_start,
                byte_offset_end=fragment.byte_offset_end,
                sha256=sha_by_id.get(fragment.fragment_id),
                codec_info=fragment.codec_info,
                recovery_method=fragment.recovery_method,
                confidence_score=fragment.confidence_score,
                confidence_rationale=fragment.confidence_rationale,
                channel_id=entry.channel_id if entry else None,
                estimated_seconds=entry.estimated_seconds if entry else None,
                duration_basis=entry.duration_basis if entry else None,
                complete=entry.complete if entry else None,
            )
        )

    return CustodyFacts(
        source=SourceFacts(
            case_id=result.case_id,
            evidence_id=result.evidence_id,
            source_path=result.source_path,
            source_device_info=record.source_device_info,
            declared_vendor=result.detection.vendor_info.vendor_name,
            vendor_validation_status=(
                result.detection.vendor_info.validation_status.value
            ),
            detected_signature=result.detection.vendor_info.detected_format_signature,
            detection_confidence=result.detection.confidence,
            detection_rationale=list(result.detection.rationale),
        ),
        custody=CustodyFacts_Handling(
            operator_id=result.operator_id,
            acquisition_id=record.acquisition_id,
            started_utc=record.started_utc,
            finished_utc=record.finished_utc,
            acquisition_status=record.status.value,
            notes=list(record.notes),
        ),
        method=MethodFacts(
            description=(
                "The source was opened read-only and copied byte for byte into "
                "an image file. SHA-256 and MD5 were computed on the plaintext "
                "stream while it was read, before any other processing. The "
                "written image was re-read and re-hashed to confirm the copy. "
                "Recordings were then located by their bitstream structure, "
                "not by any index on the source, so recordings deleted from "
                "the recorder's index are recovered along with the rest."
            ),
            adapter=f"{result.adapter.module}.{result.adapter.class_name}",
            adapter_is_fallback=result.adapter.fallback,
            adapter_reason=result.adapter.reason,
            recovery_method=(
                result.evidence.fragments[0].recovery_method
                if result.evidence.fragments
                else None
            ),
            stages=[t.stage for t in result.timings],
        ),
        tooling=ToolingFacts(
            tool_version=record.tool_version,
            python_version=sys.version.split()[0],
            platform=platform.platform(),
            run_started_utc=result.started_utc,
            run_finished_utc=result.finished_utc,
        ),
        integrity=IntegrityFacts(
            image_sha256=intake_sha,
            image_md5=record.intake_md5.hex_digest,
            image_bytes=record.bytes_read,
            verification_sha256=verification.hex_digest if verification else None,
            verification_matched=bool(
                verification and verification.hex_digest == intake_sha
            ),
            hash_lineage=[
                HashFact(
                    stage=h.pipeline_stage,
                    algorithm=h.algorithm,
                    hex_digest=h.hex_digest,
                    timestamp_utc=h.timestamp_utc,
                )
                for h in result.evidence.hash_lineage
            ],
            recovery_hash=result.carve.recovery_hash if result.carve else None,
            encrypted_artifacts=len(result.encrypted),
            image_encrypted=result.image_encrypted is not None,
            statement=(
                "The image on disk was re-hashed after writing and matched the "
                "hash computed while reading the source, so the copy is "
                "identical to what was read. Each recovered fragment was hashed "
                "from the image before encryption; any later change to a "
                "fragment or to the image is detectable by recomputing these "
                "digests."
                if verification and verification.hex_digest == intake_sha
                else "Verification did not match: this image must not be relied on."
            ),
        ),
        contents=ContentsFacts(
            fragment_count=len(result.evidence.fragments),
            channel_count=len(result.evidence.channels),
            estimated_footage_seconds=(
                timeline.total_estimated_seconds if timeline else None
            ),
            channels=[
                {
                    "channel_id": c.channel_id,
                    "declared_resolution": c.declared_resolution,
                    "declared_frame_rate": c.declared_frame_rate,
                    "rationale": next(
                        (
                            g.rationale
                            for g in (timeline.channels if timeline else [])
                            if g.channel_id == c.channel_id
                        ),
                        "",
                    ),
                }
                for c in result.evidence.channels
            ],
            fragments=fragments,
        ),
        limitations=_limitations(result),
        signature_block={
            "certifying_person_name": "",
            "designation": "",
            "responsible_for": "",
            "place": "",
            "date": "",
            "signature": "",
            "note": (
                "Left blank deliberately. A certificate under BSA 2023 section "
                "63 is valid only when completed and signed by a person "
                "occupying a responsible official position in relation to the "
                "device or its management."
            ),
        },
    )


def _limitations(result: PipelineResult) -> list[str]:
    """What this run could not establish. Never empty."""
    out: list[str] = []
    vendor = result.detection.vendor_info
    if result.adapter.fallback:
        out.append(
            f"The source was classified as {vendor.vendor_name} "
            f"({vendor.validation_status.value}), but no validated native parser "
            f"for it was used in this run: {result.adapter.reason}. Recordings "
            "were recovered by generic bitstream carving, which reads the video "
            "structure itself and not the recorder's own index."
        )
    if vendor.validation_status.value != "VALIDATED":
        out.append(
            "Vendor support for this format is graded "
            f"{vendor.validation_status.value}; the vendor name is an inference "
            "from byte signatures, not a manufacturer confirmation."
        )
    out.append(
        "No wall-clock time is recoverable from the video bitstream alone. Any "
        "date or time in this material must come from the recorder's own index "
        "or from the operator, and the recorder's clock should be compared with "
        "a reference clock before times are relied on."
    )
    if result.timeline is not None:
        out.extend(result.timeline.notes)
        assumed = [
            e for e in result.timeline.entries if e.duration_basis == "assumed_fps"
        ]
        if assumed:
            out.append(
                f"{len(assumed)} recording(s) declare no frame rate; their "
                f"durations assume {result.timeline.assumed_fps:g} frames per "
                "second and scale directly with the true rate."
            )
    incomplete = [
        f
        for f in result.evidence.fragments
        if "ended by eos" not in f.confidence_rationale
    ]
    if incomplete:
        out.append(
            f"{len(incomplete)} recording(s) do not end at an end-of-stream "
            "marker, so material may be missing from their end."
        )
    out.append(
        "Confidence scores are structural: they describe how completely a "
        "recording was reconstructed, not whether its content is authentic."
    )
    return out


def write_custody_facts(result: PipelineResult, path: str | Path) -> Path:
    path = Path(path)
    facts = build_custody_facts(result)
    path.write_text(facts.to_json(), encoding="utf-8")
    return path


def load_custody_facts(path: str | Path) -> CustodyFacts:
    return CustodyFacts.model_validate(json.loads(Path(path).read_text("utf-8")))
