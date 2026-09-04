"""Evidence acquisition: read-only imaging with plaintext hashing at intake."""

from backend.acquisition.imager import acquire, build_evidence_item
from backend.acquisition.models import AcquisitionRecord, AcquisitionStatus

__all__ = ["AcquisitionRecord", "AcquisitionStatus", "acquire", "build_evidence_item"]
