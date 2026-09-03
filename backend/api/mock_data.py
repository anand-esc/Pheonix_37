"""
TEMP MOCK DATA — replace with real pipeline output once adapters/crypto/ledger
are wired in. All mock objects are constructed via the real Pydantic models so
any future contract change will raise a ValidationError here, not silently drift.
"""

from datetime import UTC, datetime, timedelta
from uuid import uuid4

from backend.core.evidence_model import (
    Case,
    ChannelInfo,
    DetectionResult,
    EvidenceItem,
    Fragment,
    HashRecord,
    ValidationStatus,
    VendorInfo,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _hash_record(stage: str, hex_digest: str, minutes_ago: int = 0) -> HashRecord:
    return HashRecord(
        pipeline_stage=stage,
        algorithm="SHA-256",
        hex_digest=hex_digest,
        timestamp_utc=datetime.now(UTC) - timedelta(minutes=minutes_ago),
    )


def _make_fragments() -> list[Fragment]:
    frags = []
    for i in range(3):
        frag = Fragment(
            byte_offset_start=i * 4096,
            byte_offset_end=(i + 1) * 4096 - 1,
            codec_info="H264/AVC — NAL unit type 5 (IDR)",
            recovery_method="native_parse" if i == 0 else "carved",
            confidence_score=round(0.95 - i * 0.1, 2),
            confidence_rationale=(
                "SPS/PPS headers present, IDR frame verified"
                if i == 0
                else f"NAL header intact, partial GOP (fragment {i})"
            ),
        )
        frags.append(frag)
    return frags


def _make_detections(fragments: list[Fragment]) -> list[DetectionResult]:
    return [
        DetectionResult(
            bounding_box=[112.0, 340.0, 64.0, 180.0],
            object_class="person",
            confidence_score=0.91,
            fragment_id=fragments[0].fragment_id,
        ),
        DetectionResult(
            bounding_box=[500.0, 200.0, 120.0, 80.0],
            object_class="vehicle",
            confidence_score=0.78,
            fragment_id=fragments[1].fragment_id,
        ),
    ]


# ---------------------------------------------------------------------------
# A fixed case ID so URLs are stable during front-end development
# ---------------------------------------------------------------------------
MOCK_CASE_ID = "case-demo-001"

_FRAGMENTS = _make_fragments()

MOCK_CASE = Case(
    case_id=MOCK_CASE_ID,
    intake_timestamp_utc=datetime.now(UTC) - timedelta(hours=2),
    investigator_id="INV-2026-007",
    custodian_id="CST-2026-003",
    evidence_items=[
        EvidenceItem(
            evidence_id="ev-" + str(uuid4())[:8],
            source_device_info="Hikvision DS-7208HGHI-F1 — 2TB Seagate SkyHawk",
            vendor_info=VendorInfo(
                vendor_name="Hikvision",
                detected_format_signature="HIK_WFS_V3",
                validation_status=ValidationStatus.VALIDATED,
            ),
            channels=[
                ChannelInfo(
                    channel_id="CH01",
                    declared_frame_rate=25.0,
                    declared_resolution="1920x1080",
                    clock_offset_seconds=-3.2,
                ),
                ChannelInfo(
                    channel_id="CH02",
                    declared_frame_rate=25.0,
                    declared_resolution="1280x720",
                    clock_offset_seconds=None,
                ),
            ],
            fragments=_FRAGMENTS,
            hash_lineage=[
                _hash_record("intake", "a3f1" + "0" * 60, minutes_ago=120),
                _hash_record("post_recovery", "b7c2" + "1" * 60, minutes_ago=90),
                _hash_record("pre_encryption", "d9e4" + "2" * 60, minutes_ago=60),
            ],
            detections=_make_detections(_FRAGMENTS),
            metadata={
                "acquisition_tool": "Phoenix v0.1.0",
                "source_image_sha256": "a3f1" + "0" * 60,
                "investigator_notes": "Drive seized at scene — chain of custody intact",
            },
        )
    ],
)


# ---------------------------------------------------------------------------
# Mock ledger — hash-chained list so the frontend can visualise the chain
# ---------------------------------------------------------------------------
def make_mock_ledger_chain() -> list[dict]:
    events = [
        ("intake", "Evidence disk image acquired and SHA-256 hash recorded"),
        ("format_detect", "Hikvision WFS v3 signature detected"),
        ("recovery_start", "Fragment recovery engine started"),
        ("recovery_complete", "3 fragments recovered (1 native, 2 carved)"),
        ("hash_post_recovery", "Post-recovery hash computed on plaintext"),
        ("ai_triage", "YOLOv8-nano triage: 2 detections (1 person, 1 vehicle)"),
        ("encryption", "Evidence vault encrypted with AES-256-GCM"),
        ("ledger_seal", "Audit ledger sealed for this pipeline run"),
    ]
    chain = []
    prev_hash = "0" * 64
    base_time = datetime.now(UTC) - timedelta(minutes=120)
    for i, (event_type, description) in enumerate(events):
        entry_hash = hex(hash((event_type, prev_hash, i)))[2:].zfill(64)[:64]
        chain.append(
            {
                "seq": i + 1,
                "event_type": event_type,
                "description": description,
                "timestamp_utc": (base_time + timedelta(minutes=i * 14)).isoformat(),
                "entry_hash": entry_hash,
                "prev_hash": prev_hash,
            }
        )
        prev_hash = entry_hash
    return chain
