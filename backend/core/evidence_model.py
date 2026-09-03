from datetime import datetime
from enum import Enum
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field


class ValidationStatus(str, Enum):
    """Honest grading of vendor support."""

    VALIDATED = "VALIDATED"
    GENERIC_FALLBACK = "GENERIC_FALLBACK"
    RESEARCH_TARGET = "RESEARCH_TARGET"


class VendorInfo(BaseModel):
    """Vendor information and format support status."""

    model_config = ConfigDict(extra="forbid")

    vendor_name: str
    detected_format_signature: str
    validation_status: ValidationStatus


class HashRecord(BaseModel):
    """Forensic identity of the evidence at a specific pipeline stage.
    Always computed on plaintext, before encryption.
    """

    model_config = ConfigDict(extra="forbid")

    pipeline_stage: str
    algorithm: str = "SHA-256"
    hex_digest: str
    timestamp_utc: datetime


class Fragment(BaseModel):
    """A recovered or original video fragment from the source image.

    fragment_id is auto-generated as a UUID4 if not supplied, so existing
    adapter stubs do not need to change to keep working.
    """

    model_config = ConfigDict(extra="forbid")

    fragment_id: str = Field(default_factory=lambda: str(uuid4()))
    byte_offset_start: int
    byte_offset_end: int
    codec_info: str
    recovery_method: str
    confidence_score: float = Field(ge=0.0, le=1.0)
    confidence_rationale: str


class ChannelInfo(BaseModel):
    """Camera/channel identifier and properties."""

    model_config = ConfigDict(extra="forbid")

    channel_id: str
    declared_frame_rate: float | None = None
    declared_resolution: str | None = None
    clock_offset_seconds: float | None = None


class DetectionResult(BaseModel):
    """AI Triage output. This is detection/triage only.
    MUST NEVER be treated as an identity claim.
    """

    model_config = ConfigDict(extra="forbid")

    bounding_box: list[float]  # e.g. [x, y, w, h]
    object_class: str  # person, vehicle, other
    confidence_score: float = Field(ge=0.0, le=1.0)
    fragment_id: str | None = None


class EvidenceItem(BaseModel):
    """Top-level unit of evidence in the forensic pipeline."""

    model_config = ConfigDict(extra="forbid")

    evidence_id: str
    source_device_info: str
    vendor_info: VendorInfo
    channels: list[ChannelInfo] = Field(default_factory=list)
    fragments: list[Fragment] = Field(default_factory=list)
    hash_lineage: list[HashRecord] = Field(default_factory=list)
    detections: list[DetectionResult] | None = None
    metadata: dict[str, str] = Field(default_factory=dict)


class Case(BaseModel):
    """Wraps one or more EvidenceItems into a case context."""

    model_config = ConfigDict(extra="forbid")

    case_id: str
    intake_timestamp_utc: datetime
    investigator_id: str
    custodian_id: str
    evidence_items: list[EvidenceItem] = Field(default_factory=list)
