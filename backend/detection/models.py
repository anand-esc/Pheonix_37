"""Data types produced by the format detector."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from backend.core.evidence_model import VendorInfo


class SignatureMatch(BaseModel):
    """One signature that was found in the scanned bytes."""

    model_config = ConfigDict(extra="forbid")

    signature_name: str
    vendor: str
    kind: str
    offset: int
    at_expected_offset: bool
    occurrences: int = 1
    effective_weight: float = Field(ge=0.0, le=1.0)


class NalStats(BaseModel):
    """Annex-B NAL start-code statistics over the sampled windows."""

    model_config = ConfigDict(extra="forbid")

    windows_sampled: int
    windows_with_nals: int
    start_codes: int
    h264_votes: int
    h265_votes: int
    density: float = Field(ge=0.0, le=1.0)
    codec_guess: str  # "h264", "h265" or "none"


class DetectionReport(BaseModel):
    """Everything the detector concluded, plus why.

    ``rationale`` is a human-readable list of the rules that fired, in order.
    It is meant to be copied verbatim into the forensic report so an examiner
    can defend the vendor classification.
    """

    model_config = ConfigDict(extra="forbid")

    source_path: str
    file_size: int
    vendor_info: VendorInfo
    matches: list[SignatureMatch] = Field(default_factory=list)
    nal_stats: NalStats
    confidence: float = Field(ge=0.0, le=1.0)
    rationale: list[str] = Field(default_factory=list)
    adapter_module: str
    adapter_class: str
    scan_bytes: int

    def summary(self) -> dict[str, Any]:
        """Flat JSON-friendly view used for event payloads."""
        return {
            "vendor": self.vendor_info.vendor_name,
            "signature": self.vendor_info.detected_format_signature,
            "validation_status": self.vendor_info.validation_status.value,
            "confidence": self.confidence,
            "codec_guess": self.nal_stats.codec_guess,
            "nal_density": self.nal_stats.density,
            "matched": [m.signature_name for m in self.matches],
            "adapter_module": self.adapter_module,
        }


class AdapterResolution(BaseModel):
    """Outcome of routing a detection report to an adapter implementation."""

    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True)

    requested_module: str
    requested_class: str
    resolved_module: str
    resolved_class: str
    fallback: bool
    available: bool
    reason: str
    adapter: Any = None  # BaseAdapter instance when available, else None
