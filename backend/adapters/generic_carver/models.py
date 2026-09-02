"""Models for the generic Annex-B NAL carver."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from backend.core.evidence_model import Fragment

RECOVERY_METHOD = "annexb_nal_carve"


class CarveOptions(BaseModel):
    model_config = ConfigDict(extra="forbid")

    block_size: int = 8 * 1024 * 1024  # bytes read per scan step
    max_nal_bytes: int = (
        8 * 1024 * 1024
    )  # larger gaps between start codes end a fragment
    filler_split_bytes: int = 4096  # a zero run this long between NALs ends a fragment
    verify_nal_bytes: int = 64 * 1024  # NALs longer than this are checked for 00 00 00
    min_nals: int = 3  # fragments with fewer NALs are discarded as noise
    codec_hint: str | None = None  # "h264" / "h265" from detection, if known


class StreamInfo(BaseModel):
    """What the SPS (and VPS for H.265) declares about the stream."""

    model_config = ConfigDict(extra="forbid")

    codec: str  # "H.264" / "H.265"
    profile_idc: int
    profile_name: str
    level_idc: int
    width: int
    height: int

    def describe(self) -> str:
        level = self.level_idc / 30 if self.codec == "H.265" else self.level_idc / 10
        return (
            f"{self.codec} {self.profile_name} (profile_idc {self.profile_idc}) "
            f"level {level:.1f} {self.width}x{self.height}"
        )


class FragmentFeatures(BaseModel):
    """Structural facts the scorer turns into a confidence with a rationale."""

    model_config = ConfigDict(extra="forbid")

    codec: str
    start_reason: str
    end_reason: str
    has_sps: bool
    sps_parsed: bool
    has_pps: bool
    first_vcl_is_idr: bool
    nal_count: int
    vcl_count: int
    idr_count: int
    parameter_set_repeats: int


class CarvedFragment(BaseModel):
    """A ``Fragment`` from the shared contract plus the carver's own evidence."""

    model_config = ConfigDict(extra="forbid")

    index: int
    fragment: Fragment
    features: FragmentFeatures
    stream: StreamInfo | None = None
    sha256: str
    length: int


class CarveStats(BaseModel):
    model_config = ConfigDict(extra="forbid")

    file_size: int
    start_codes_seen: int
    valid_nals: int
    orphan_nals: int
    oversized_nals: int
    discarded_fragments: int
    codec: str


class CarveResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_path: str
    fragments: list[CarvedFragment] = Field(default_factory=list)
    stats: CarveStats
    recovery_hash: str  # SHA-256 over the ordered fragment SHA-256 list


class ExportedFragment(BaseModel):
    model_config = ConfigDict(extra="forbid")

    index: int
    out_path: str
    byte_offset_start: int
    byte_offset_end: int
    sha256: str
    length: int
