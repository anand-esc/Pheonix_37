from datetime import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field

from backend.core.evidence_model import HashRecord


class AcquisitionStatus(str, Enum):
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    FAILED_VERIFICATION = "FAILED_VERIFICATION"


class AcquisitionRecord(BaseModel):
    """Custody record for one imaging run. Written verbatim as the sidecar JSON.

    ``intake_hashes`` holds the SHA-256 and MD5 computed on the plaintext
    stream while it was read from the source. ``verification_hash`` is the
    SHA-256 recomputed from the written image; it must equal the intake
    SHA-256 for the status to be COMPLETED.
    """

    model_config = ConfigDict(extra="forbid")

    acquisition_id: str
    case_id: str
    operator_id: str
    source_path: str
    image_path: str
    source_device_info: str
    bytes_read: int = Field(ge=0)
    started_utc: datetime
    finished_utc: datetime | None = None
    intake_hashes: list[HashRecord] = Field(default_factory=list)
    verification_hash: HashRecord | None = None
    status: AcquisitionStatus
    tool_version: str
    notes: list[str] = Field(default_factory=list)

    @property
    def intake_sha256(self) -> HashRecord | None:
        for record in self.intake_hashes:
            if record.algorithm == "SHA-256":
                return record
        return None

    @property
    def intake_md5(self) -> HashRecord | None:
        for record in self.intake_hashes:
            if record.algorithm == "MD5":
                return record
        return None
