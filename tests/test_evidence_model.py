from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from backend.core.evidence_model import (
    DetectionResult,
    EvidenceItem,
    Fragment,
    HashRecord,
    ValidationStatus,
    VendorInfo,
)


def test_vendor_info_valid():
    info = VendorInfo(
        vendor_name="Hikvision",
        detected_format_signature="HIK",
        validation_status=ValidationStatus.VALIDATED,
    )
    assert info.vendor_name == "Hikvision"


def test_vendor_info_invalid_status():
    with pytest.raises(ValidationError):
        VendorInfo(
            vendor_name="Fake",
            detected_format_signature="FAKE",
            validation_status="UNSUPPORTED",  # not in Enum
        )


def test_vendor_info_extra_fields_forbidden():
    with pytest.raises(ValidationError):
        VendorInfo(
            vendor_name="Hikvision",
            detected_format_signature="HIK",
            validation_status=ValidationStatus.VALIDATED,
            extra_field="should fail",
        )


def test_fragment_confidence_bounds():
    with pytest.raises(ValidationError):
        Fragment(
            byte_offset_start=0,
            byte_offset_end=100,
            codec_info="H264",
            recovery_method="carved",
            confidence_score=1.5,  # > 1.0
            confidence_rationale="Too high",
        )
    with pytest.raises(ValidationError):
        Fragment(
            byte_offset_start=0,
            byte_offset_end=100,
            codec_info="H264",
            recovery_method="carved",
            confidence_score=-0.1,  # < 0.0
            confidence_rationale="Too low",
        )


def test_evidence_item_valid():
    vendor = VendorInfo(
        vendor_name="Dahua",
        detected_format_signature="DH",
        validation_status=ValidationStatus.GENERIC_FALLBACK,
    )
    fragment = Fragment(
        byte_offset_start=0,
        byte_offset_end=1024,
        codec_info="H265",
        recovery_method="native_parse",
        confidence_score=0.9,
        confidence_rationale="Valid SPS/PPS",
    )
    hash_record = HashRecord(
        pipeline_stage="intake",
        hex_digest="a" * 64,
        timestamp_utc=datetime.now(UTC),
    )

    item = EvidenceItem(
        evidence_id="ev_001",
        source_device_info="HDD_1",
        vendor_info=vendor,
        fragments=[fragment],
        hash_lineage=[hash_record],
    )
    assert item.evidence_id == "ev_001"
    assert len(item.fragments) == 1
    assert len(item.hash_lineage) == 1


def test_detection_result_extra_forbid():
    with pytest.raises(ValidationError):
        DetectionResult(
            bounding_box=[10, 10, 50, 50],
            object_class="person",
            confidence_score=0.8,
            identity_claim="John Doe",  # MUST fail, triage only
        )

def test_fragment_id_auto_generated():
    """Fragment.fragment_id should be set automatically to a UUID4 string
    when not supplied by the caller — no adapter stub needs to change.
    """
    frag = Fragment(
        byte_offset_start=0,
        byte_offset_end=512,
        codec_info="H264",
        recovery_method="carved",
        confidence_score=0.75,
        confidence_rationale="NAL header intact",
    )
    assert frag.fragment_id is not None
    assert len(frag.fragment_id) == 36  # canonical UUID4 string length


def test_detection_result_can_reference_fragment():
    """DetectionResult.fragment_id can be set to the UUID of a real Fragment,
    linking AI triage output back to its source fragment.
    """
    frag = Fragment(
        byte_offset_start=0,
        byte_offset_end=512,
        codec_info="H264",
        recovery_method="native_parse",
        confidence_score=0.95,
        confidence_rationale="SPS/PPS present",
    )
    detection = DetectionResult(
        bounding_box=[10.0, 20.0, 100.0, 200.0],
        object_class="person",
        confidence_score=0.88,
        fragment_id=frag.fragment_id,
    )
    assert detection.fragment_id == frag.fragment_id


def test_detection_result_fragment_id_nullable():
    """DetectionResult.fragment_id defaults to None — not every detection
    will have a resolved fragment link.
    """
    detection = DetectionResult(
        bounding_box=[5.0, 5.0, 50.0, 50.0],
        object_class="vehicle",
        confidence_score=0.72,
    )
    assert detection.fragment_id is None
