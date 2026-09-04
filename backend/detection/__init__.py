"""Format detection: signature scan, explainable confidence, adapter routing."""

from backend.detection.detector import FormatDetector, resolve_adapter
from backend.detection.models import (
    AdapterResolution,
    DetectionReport,
    NalStats,
    SignatureMatch,
)
from backend.detection.signatures import (
    ADAPTER_FOR_VENDOR,
    GENERIC_ADAPTER,
    RESEARCH_TARGETS,
    SIGNATURES,
    Signature,
    SignatureKind,
)

__all__ = [
    "ADAPTER_FOR_VENDOR",
    "GENERIC_ADAPTER",
    "RESEARCH_TARGETS",
    "SIGNATURES",
    "AdapterResolution",
    "DetectionReport",
    "FormatDetector",
    "NalStats",
    "Signature",
    "SignatureKind",
    "SignatureMatch",
    "resolve_adapter",
]
