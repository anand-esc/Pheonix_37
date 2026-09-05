import hashlib
import json
from pathlib import Path

import pytest

from backend.acquisition import AcquisitionStatus
from backend.acquisition.exceptions import AcquisitionSourceError
from backend.adapters.generic_carver.models import CarveOptions
from backend.core.evidence_model import ChannelInfo, EvidenceItem, Fragment, VendorInfo
from backend.core.interfaces import BaseAdapter
from backend.crypto.provider import PhoenixCryptoProvider
from backend.detection import FormatDetector
from backend.pipeline.events import InMemoryEventSink
from backend.pipeline.runner import (
    RESULT_NAME,
    TRANSCRIPT_NAME,
    PipelineError,
    PipelineResult,
    run_pipeline,
)
from tests.fixtures.build_fixtures import build_dvr_image

DETECTOR = FormatDetector(head_bytes=64 * 1024, sample_windows=16, window_bytes=8192)
CARVE = CarveOptions(block_size=64 * 1024)


def _image(tmp_path, variant="hikvision", seed=21):
    src = tmp_path / "source.img"
    return src, build_dvr_image(
        src, size_bytes=512 * 1024, seed=seed, vendor_variant=variant
    )


def test_full_run_end_to_end(tmp_path):
    src, manifest = _image(tmp_path)
    sink = InMemoryEventSink()
    crypto = PhoenixCryptoProvider()

    result = run_pipeline(
        src,
        case_id="CASE-001",
        operator_id="op-1",
        out_dir=tmp_path / "run",
        sink=sink,
        crypto=crypto,
        detector=DETECTOR,
        carve_options=CARVE,
    )

    # intake
    assert result.acquisition.status is AcquisitionStatus.COMPLETED
    assert result.acquisition.intake_sha256.hex_digest == manifest.sha256
    assert result.evidence_id == f"ev-{result.acquisition.acquisition_id}"

    # detection routed Hikvision to the generic fallback (no vendor adapter here)
    assert result.detection.vendor_info.vendor_name == "Hikvision"
    assert result.adapter.fallback is True and result.adapter.available is True
    assert result.adapter.module == "backend.adapters.generic_carver"
    assert result.evidence.vendor_info == result.detection.vendor_info

    # recovery: every manifest segment (including the deleted one) came back
    carved = [c.sha256 for c in result.carve.fragments]
    assert carved == [s.sha256 for s in manifest.segments]
    assert len(result.evidence.fragments) == 3
    assert all(Path(e.out_path).exists() for e in result.exported)

    # encryption: hash-then-encrypt, decryptable, hashes recorded in lineage
    assert len(result.encrypted) == 3
    for art in result.encrypted:
        blob = Path(art.encrypted_path).read_bytes()
        assert hashlib.sha256(blob).hexdigest() == art.ciphertext_sha256
        plain = crypto.decrypt(blob, "CASE-001")
        assert hashlib.sha256(plain).hexdigest() == art.plaintext_sha256
        assert plain == Path(art.plaintext_path).read_bytes()
    stages = [h.pipeline_stage for h in result.evidence.hash_lineage]
    assert stages[:3] == ["intake", "intake", "intake_verify"]
    assert stages[3:] == [f"pre_encryption/fragment_{i:04d}" for i in range(3)]

    # whole image: streamed AES-GCM with the same case key, decryptable
    img = result.image_encrypted
    assert img is not None and img.fragment_index == -1
    assert img.plaintext_sha256 == manifest.sha256
    assert img.ciphertext_bytes == img.plaintext_bytes + 28
    from backend.crypto.encryption import decrypt_file

    decrypt_file(
        img.encrypted_path,
        tmp_path / "back.img",
        bytes(crypto._get_key_for_case("CASE-001")),
    )
    assert (
        hashlib.sha256((tmp_path / "back.img").read_bytes()).hexdigest()
        == manifest.sha256
    )
    assert result.summary()["image_encrypted"] is True

    # playable MP4 views exist for every H.264 fragment; raw fragments untouched
    assert len(result.playable) == 3 and all(p.mp4_path for p in result.playable)
    for view, art in zip(result.playable, result.encrypted, strict=True):
        assert Path(view.mp4_path).read_bytes()[4:8] == b"ftyp"
        assert hashlib.sha256(Path(view.fragment_path).read_bytes()).hexdigest() == (
            art.plaintext_sha256
        )
    assert result.summary()["playable"] == 3
    # fragment ids link evidence, playable views and AI detections
    ids = [f.fragment_id for f in result.evidence.fragments]
    assert [p.fragment_id for p in result.playable] == ids
    assert all(i.startswith("frag-") for i in ids)

    # events, in order
    types = [e.event_type for e in sink.events]
    assert types[:4] == [
        "intake_started",
        "intake_completed",
        "format_detected",
        "adapter_resolved",
    ]
    assert types[4:6] == ["recovery_started", "recovery_completed"]
    assert types[6:9] == ["fragment_exported"] * 3
    assert types[9:] == ["encryption_completed"] * 4  # image + 3 fragments
    assert sink.events[9].payload["fragment_index"] == -1
    assert result.events == sink.events

    # persisted artefacts
    run = tmp_path / "run"
    assert (run / RESULT_NAME).exists()
    reloaded = PipelineResult.model_validate_json((run / RESULT_NAME).read_text())
    assert reloaded.summary() == result.summary()
    transcript = json.loads((run / TRANSCRIPT_NAME).read_text())
    assert transcript["summary"]["fragments"] == 3
    assert len(transcript["events"]) == len(sink.events)
    assert [s["stage"] for s in transcript["timings"]] == [
        "intake",
        "detection",
        "recovery",
        "encryption",
    ]


def test_missing_source_stops_after_intake_failed(tmp_path):
    sink = InMemoryEventSink()
    with pytest.raises(AcquisitionSourceError):
        run_pipeline(
            tmp_path / "nope.img",
            case_id="CASE-002",
            operator_id="op-1",
            out_dir=tmp_path / "run",
            sink=sink,
        )
    assert [e.event_type for e in sink.events] == ["intake_started", "intake_failed"]
    assert not (tmp_path / "run" / RESULT_NAME).exists()


def test_encryption_can_be_skipped(tmp_path):
    src, _ = _image(tmp_path, variant="none")
    sink = InMemoryEventSink()
    result = run_pipeline(
        src,
        case_id="CASE-003",
        operator_id="op-1",
        out_dir=tmp_path / "run",
        sink=sink,
        detector=DETECTOR,
        carve_options=CARVE,
        encrypt=False,
    )
    assert result.encrypted == []
    assert "encryption_completed" not in {e.event_type for e in sink.events}
    assert len(result.exported) == 3


class StubVendorAdapter(BaseAdapter):
    def detect(self, source_path: str) -> bool:
        return True

    def list_channels(self, source_path: str) -> list[ChannelInfo]:
        return [ChannelInfo(channel_id="ch01", declared_frame_rate=25.0)]

    def parse(self, source_path: str) -> EvidenceItem:
        return EvidenceItem(
            evidence_id="stub",
            source_device_info="stub",
            vendor_info=VendorInfo(
                vendor_name="Hikvision",
                detected_format_signature="stub",
                validation_status="VALIDATED",
            ),
            channels=self.list_channels(source_path),
            fragments=[
                Fragment(
                    byte_offset_start=0,
                    byte_offset_end=10,
                    codec_info="stub",
                    recovery_method="vendor_index",
                    confidence_score=0.5,
                    confidence_rationale="stub",
                )
            ],
            metadata={"parsed_by": "stub"},
        )


def test_vendor_adapter_is_used_when_available(tmp_path):
    src, _ = _image(tmp_path)
    result = run_pipeline(
        src,
        case_id="CASE-004",
        operator_id="op-1",
        out_dir=tmp_path / "run",
        detector=DETECTOR,
        adapter_map={"Hikvision": ("tests.test_pipeline_runner", "StubVendorAdapter")},
    )
    assert result.adapter.fallback is False
    assert result.adapter.class_name == "StubVendorAdapter"
    assert result.carve is None and result.exported == [] and result.encrypted == []
    assert result.evidence.channels[0].channel_id == "ch01"
    assert result.evidence.fragments[0].recovery_method == "vendor_index"
    assert result.evidence.metadata["parsed_by"] == "stub"
    assert (
        result.evidence.metadata["acquisition_id"] == result.acquisition.acquisition_id
    )


class HalfBuiltAdapter(StubVendorAdapter):
    """detect() works, parse() does not: the shape of a vendor stub mid-build."""

    def parse(self, source_path: str) -> EvidenceItem:
        raise NotImplementedError("parser pending")


def test_vendor_adapter_without_parser_falls_back_to_generic(tmp_path):
    src, manifest = _image(tmp_path)
    sink = InMemoryEventSink()
    result = run_pipeline(
        src,
        case_id="CASE-006",
        operator_id="op-1",
        out_dir=tmp_path / "run",
        sink=sink,
        detector=DETECTOR,
        carve_options=CARVE,
        encrypt=False,
        adapter_map={"Hikvision": ("tests.test_pipeline_runner", "HalfBuiltAdapter")},
    )
    assert result.adapter.fallback is True
    assert result.adapter.class_name == "GenericCarverAdapter"
    assert "NotImplementedError" in result.adapter.reason
    assert [c.sha256 for c in result.carve.fragments] == [
        s.sha256 for s in manifest.segments
    ]
    resolved = [e for e in sink.events if e.event_type == "adapter_resolved"]
    assert [e.payload["fallback"] for e in resolved] == [False, True]


def test_no_adapter_at_all_is_a_pipeline_error(tmp_path):
    src, _ = _image(tmp_path)
    with pytest.raises(PipelineError):
        run_pipeline(
            src,
            case_id="CASE-005",
            operator_id="op-1",
            out_dir=tmp_path / "run",
            detector=DETECTOR,
            adapter_map={},
            generic=("backend.adapters.nowhere", "Missing"),
        )
