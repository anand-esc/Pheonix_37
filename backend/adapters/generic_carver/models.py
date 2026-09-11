"""Models for the generic Annex-B NAL carver."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from backend.core.evidence_model import Fragment

RECOVERY_METHOD = "annexb_nal_carve"
CONTAINER_RECOVERY_METHOD = "container_file_carve"


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
    # Whole MP4/AVI files are carved as files before the Annex-B scan, and the
    # bytes they occupy are then excluded from it. Without this a copied .mp4
    # is reported as a handful of fragments built from coincidental start codes.
    carve_containers: bool = True


class StreamInfo(BaseModel):
    """What the SPS (and VPS for H.265) declares about the stream."""

    model_config = ConfigDict(extra="forbid")

    codec: str  # "H.264" / "H.265"
    profile_idc: int
    profile_name: str
    level_idc: int
    width: int
    height: int
    declared_fps: float | None = None  # from SPS VUI timing, when the encoder wrote it
    chroma_format_idc: int | None = None
    bit_depth_luma: int | None = None
    bit_depth_chroma: int | None = None
    max_sub_layers: int | None = None  # H.265 only
    temporal_id_nested: bool | None = None  # H.265 only

    def describe(self) -> str:
        level = self.level_idc / 30 if self.codec == "H.265" else self.level_idc / 10
        text = (
            f"{self.codec} {self.profile_name} (profile_idc {self.profile_idc}) "
            f"level {level:.1f} {self.width}x{self.height}"
        )
        if self.declared_fps is not None:
            text += f" @ {self.declared_fps:g} fps (declared)"
        return text


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
    picture_count: int = 0
    parameter_set_repeats: int = 0


class ContainerInfo(BaseModel):
    """What a recovered container file declares about itself.

    Every value here is read out of the file's own header, never inferred:
    ``duration_seconds`` comes from ``mvhd``, the geometry from ``tkhd`` or
    the sample entry, the codec from the sample entry fourcc.
    """

    model_config = ConfigDict(extra="forbid")

    kind: str  # "mp4" | "avi"
    brand: str | None = None  # ISO major brand, e.g. "isom"
    extension: str  # file extension to write on export
    boxes: list[str] = Field(default_factory=list)  # top-level chain, in order
    has_index: bool  # moov / idx1 present: the file can be played as-is
    has_media: bool  # mdat / movi present
    end_reason: str
    duration_seconds: float | None = None
    width: int | None = None
    height: int | None = None
    codec_name: str | None = None
    track_count: int = 0


class CarvedFragment(BaseModel):
    """A ``Fragment`` from the shared contract plus the carver's own evidence."""

    model_config = ConfigDict(extra="forbid")

    index: int
    fragment: Fragment
    features: FragmentFeatures
    stream: StreamInfo | None = None
    sps_sha256: str | None = None  # identity of the encoder configuration
    # Set when the fragment is a whole container file rather than a run of
    # Annex-B NAL units; the two are carved by different passes.
    container: ContainerInfo | None = None
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
    container_files: int = 0  # whole MP4/AVI files recovered by the container pass
    nals_inside_containers: int = 0  # start codes skipped as part of a carved file


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
