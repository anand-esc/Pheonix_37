"""Signature registry for the format detector.

Every entry carries a ``source_note`` saying where the signature comes from
and ``verified_on_device`` saying whether anyone on this project has confirmed
it against a physical recorder. Nothing here is verified on hardware yet; the
notes are honest about that so the report can be too.

Weights feed the explainable confidence rules in ``detector.py``:

* a match at its expected offset contributes its full weight;
* a match found elsewhere contributes ``weight * ANYWHERE_FACTOR``;
* per-vendor weights are summed and capped at ``VENDOR_CAP``.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

from backend.core.evidence_model import ValidationStatus


class SignatureKind(str, Enum):
    VENDOR = "vendor"  # proprietary filesystem / frame markers
    CONTAINER = "container"  # standard container (AVI, MP4, MPEG-TS)
    CODEC = "codec"  # bare elementary stream, detected statistically


@dataclass(frozen=True)
class Signature:
    name: str
    vendor: str
    kind: SignatureKind
    pattern: bytes
    weight: float
    validation_status: ValidationStatus
    source_note: str
    expected_offset: int | None = None  # None: may appear anywhere
    verified_on_device: bool = False


ANYWHERE_FACTOR = 0.8
VENDOR_CAP = 0.95
CONFLICT_PENALTY = 0.10
CORROBORATION_BONUS = 0.05
CODEC_ONLY_BASE = 0.35
CODEC_ONLY_SPAN = 0.45  # codec-only confidence = base + span * density
CONFLICT_THRESHOLD = 0.5

HIKVISION_MAGIC = b"HIKVISION@HANGZHOU"
HIKVISION_MAGIC_OFFSET = 0x210

SIGNATURES: tuple[Signature, ...] = (
    # ------------------------------------------------------------------ vendor
    Signature(
        name="hikvision_master_sector",
        vendor="Hikvision",
        kind=SignatureKind.VENDOR,
        pattern=HIKVISION_MAGIC,
        expected_offset=HIKVISION_MAGIC_OFFSET,
        weight=0.90,
        validation_status=ValidationStatus.VALIDATED,
        source_note=(
            "Master-sector magic string of the Hikvision proprietary filesystem "
            "as described in public reverse-engineering write-ups; the 0x210 "
            "offset is taken from those write-ups and has not been confirmed "
            "against a physical unit on this branch."
        ),
    ),
    Signature(
        name="hikvision_hikbtree",
        vendor="Hikvision",
        kind=SignatureKind.VENDOR,
        pattern=b"HIKBTREE",
        weight=0.55,
        validation_status=ValidationStatus.VALIDATED,
        source_note=(
            "Tag of the data-block index pages of the Hikvision proprietary "
            "filesystem, reported in the same public write-ups as the master "
            "sector magic. Position varies by firmware, so it is matched "
            "anywhere. Not confirmed against a physical unit on this branch."
        ),
    ),
    Signature(
        name="dahua_dhfs_header",
        vendor="Dahua",
        kind=SignatureKind.VENDOR,
        pattern=b"DHFS4.1",
        expected_offset=0,
        weight=0.85,
        validation_status=ValidationStatus.VALIDATED,
        source_note=(
            "Header string of the Dahua DHFS 4.1 filesystem reported in public "
            "forensic tooling and forum analyses; offset 0 assumes the image "
            "starts at the DHFS partition. Not confirmed on hardware here."
        ),
    ),
    Signature(
        name="dahua_dhav_frame",
        vendor="Dahua",
        kind=SignatureKind.VENDOR,
        pattern=b"DHAV",
        weight=0.60,
        validation_status=ValidationStatus.VALIDATED,
        source_note=(
            "Frame-header tag of the Dahua DAV container (open-source demuxers "
            "such as the FFmpeg dhav demuxer key on this tag). Appears many "
            "times in recorded footage, so a single hit is weak; repeated hits "
            "are counted as one match with an occurrence count."
        ),
    ),
    Signature(
        name="dahua_dhav_trailer",
        vendor="Dahua",
        kind=SignatureKind.VENDOR,
        pattern=b"dhav",
        weight=0.25,
        validation_status=ValidationStatus.VALIDATED,
        source_note=(
            "Lower-case frame trailer tag of the Dahua DAV container, paired "
            "with the DHAV header. Low weight on its own."
        ),
    ),
    # --------------------------------------------------------------- container
    Signature(
        name="riff_header",
        vendor="Generic AVI",
        kind=SignatureKind.CONTAINER,
        pattern=b"RIFF",
        expected_offset=0,
        weight=0.40,
        validation_status=ValidationStatus.GENERIC_FALLBACK,
        source_note="RIFF chunk header, Microsoft RIFF specification.",
    ),
    Signature(
        name="avi_form_type",
        vendor="Generic AVI",
        kind=SignatureKind.CONTAINER,
        pattern=b"AVI ",
        expected_offset=8,
        weight=0.45,
        validation_status=ValidationStatus.GENERIC_FALLBACK,
        source_note="RIFF form type 'AVI ' at offset 8, Microsoft AVI specification.",
    ),
    Signature(
        name="iso_bmff_ftyp",
        vendor="Generic MP4",
        kind=SignatureKind.CONTAINER,
        pattern=b"ftyp",
        expected_offset=4,
        weight=0.80,
        validation_status=ValidationStatus.GENERIC_FALLBACK,
        source_note="ISO/IEC 14496-12 file type box; box type at offset 4.",
    ),
    Signature(
        name="mpegts_sync_0",
        vendor="Generic MPEG-TS",
        kind=SignatureKind.CONTAINER,
        pattern=b"\x47",
        expected_offset=0,
        weight=0.20,
        validation_status=ValidationStatus.GENERIC_FALLBACK,
        source_note="MPEG-TS sync byte 0x47 at packet 0 (ISO/IEC 13818-1).",
    ),
    Signature(
        name="mpegts_sync_1",
        vendor="Generic MPEG-TS",
        kind=SignatureKind.CONTAINER,
        pattern=b"\x47",
        expected_offset=188,
        weight=0.30,
        validation_status=ValidationStatus.GENERIC_FALLBACK,
        source_note="MPEG-TS sync byte at packet 1 (188-byte packets).",
    ),
    Signature(
        name="mpegts_sync_2",
        vendor="Generic MPEG-TS",
        kind=SignatureKind.CONTAINER,
        pattern=b"\x47",
        expected_offset=376,
        weight=0.35,
        validation_status=ValidationStatus.GENERIC_FALLBACK,
        source_note="MPEG-TS sync byte at packet 2 (188-byte packets).",
    ),
)

# Bare elementary streams have no fixed signature; the detector scores them
# statistically from NAL start codes. These names are used in the report.
CODEC_VENDOR = "Generic Annex-B stream"
CODEC_SIGNATURE = {"h264": "annexb-h264", "h265": "annexb-h265"}
UNKNOWN_VENDOR = "Unknown"
UNKNOWN_SIGNATURE = "none"

# Vendors the problem statement lists for which no independently reproducible
# public signature was found. They are reported honestly as research targets
# and routed to the generic carver.
RESEARCH_TARGETS: dict[str, str] = {
    "CP Plus": (
        "Many CP Plus recorders are Dahua OEM builds. A DHFS/DHAV hit on a CP "
        "Plus unit is expected and routes to the Dahua adapter; the report "
        "records the OEM relationship rather than claiming native CP Plus support."
    ),
    "Uniview": "No reproducible public filesystem signature found; generic carving.",
    "Godrej": "Rebadged hardware from several OEMs; no stable signature; generic carving.",
    "Honeywell": "No reproducible public filesystem signature found; generic carving.",
    "Matrix": "No reproducible public filesystem signature found; generic carving.",
    "TP-Link": (
        "Consumer NVRs usually store standard MP4/TS; the container signatures "
        "above cover them; no proprietary signature known."
    ),
}

# Adapter entry points. Vendor adapters live on other branches; the detector
# imports them lazily and falls back to the generic carver when they are
# absent, so this branch never depends on their code being present.
ADAPTER_FOR_VENDOR: dict[str, tuple[str, str]] = {
    "Hikvision": ("backend.adapters.hikvision", "HikvisionAdapter"),
    "Dahua": ("backend.adapters.dahua", "DahuaAdapter"),
}
GENERIC_ADAPTER: tuple[str, str] = (
    "backend.adapters.generic_carver",
    "GenericCarverAdapter",
)


def signatures_for_vendor(vendor: str) -> list[Signature]:
    return [s for s in SIGNATURES if s.vendor == vendor]


def status_for_vendor(vendor: str) -> ValidationStatus:
    if vendor in RESEARCH_TARGETS:
        return ValidationStatus.RESEARCH_TARGET
    for sig in SIGNATURES:
        if sig.vendor == vendor:
            return sig.validation_status
    return ValidationStatus.GENERIC_FALLBACK
