import hashlib
import json
import os

import pytest

from backend.acquisition import (
    AcquisitionStatus,
    acquire,
    build_evidence_item,
)
from backend.acquisition.exceptions import (
    AcquisitionSourceError,
    AcquisitionVerificationError,
    AcquisitionWriteError,
)
from backend.acquisition.imager import load_sidecar, sidecar_path_for
from backend.core.evidence_model import ValidationStatus, VendorInfo
from backend.pipeline.events import InMemoryEventSink

CASE = {
    "case_id": "CASE-001",
    "operator_id": "op-amritansh",
    "device_info": "synthetic DVR",
}


def _make_source(tmp_path, size=3 * 1024 * 1024 + 123, seed=1):
    # Odd size so the last chunk is partial; deterministic bytes.
    rng_bytes = (seed.to_bytes(4, "little") * (size // 4 + 1))[:size]
    src = tmp_path / "source.bin"
    src.write_bytes(rng_bytes)
    return (
        src,
        hashlib.sha256(rng_bytes).hexdigest(),
        hashlib.md5(rng_bytes).hexdigest(),
    )


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------
def test_acquire_known_input_produces_known_hashes(tmp_path):
    src, expected_sha, expected_md5 = _make_source(tmp_path)
    dst = tmp_path / "image.img"
    sink = InMemoryEventSink()
    seen = []

    record = acquire(
        src, dst, chunk_size=1024 * 1024, progress_cb=seen.append, sink=sink, **CASE
    )

    assert record.status is AcquisitionStatus.COMPLETED
    assert record.bytes_read == src.stat().st_size
    assert record.intake_sha256.hex_digest == expected_sha
    assert record.intake_md5.hex_digest == expected_md5
    assert record.verification_hash.hex_digest == expected_sha
    assert record.intake_sha256.pipeline_stage == "intake"
    assert record.verification_hash.pipeline_stage == "intake_verify"
    assert dst.read_bytes() == src.read_bytes()
    # progress callback is monotonic and ends at the full size
    assert seen == sorted(seen) and seen[-1] == record.bytes_read

    # sidecar exists and round-trips through the model
    sidecar = sidecar_path_for(dst)
    assert sidecar.exists()
    loaded = load_sidecar(dst)
    assert loaded.status is AcquisitionStatus.COMPLETED
    assert loaded.intake_sha256.hex_digest == expected_sha
    raw = json.loads(sidecar.read_text())
    assert raw["case_id"] == "CASE-001"

    # events: started then completed, with the hash in the payload
    types = [e.event_type for e in sink.events]
    assert types == ["intake_started", "intake_completed"]
    assert sink.events[-1].payload["sha256"] == expected_sha
    assert sink.events[-1].payload["md5"] == expected_md5


def test_source_is_never_modified(tmp_path):
    src, expected_sha, _ = _make_source(tmp_path, size=64 * 1024)
    mtime_before = src.stat().st_mtime_ns
    acquire(src, tmp_path / "img.img", **CASE)
    assert src.stat().st_mtime_ns == mtime_before
    assert hashlib.sha256(src.read_bytes()).hexdigest() == expected_sha


def test_build_evidence_item_seeds_hash_lineage(tmp_path):
    src, expected_sha, expected_md5 = _make_source(tmp_path, size=4096)
    record = acquire(src, tmp_path / "img.img", **CASE)
    vendor = VendorInfo(
        vendor_name="Unknown",
        detected_format_signature="none",
        validation_status=ValidationStatus.GENERIC_FALLBACK,
    )
    item = build_evidence_item(record, vendor)
    digests = {(h.pipeline_stage, h.algorithm): h.hex_digest for h in item.hash_lineage}
    assert digests[("intake", "SHA-256")] == expected_sha
    assert digests[("intake", "MD5")] == expected_md5
    assert digests[("intake_verify", "SHA-256")] == expected_sha
    assert item.metadata["acquisition_id"] == record.acquisition_id
    assert all(isinstance(v, str) for v in item.metadata.values())


# ---------------------------------------------------------------------------
# Failure paths
# ---------------------------------------------------------------------------
def test_missing_source_fails_and_records_sidecar(tmp_path):
    dst = tmp_path / "img.img"
    sink = InMemoryEventSink()
    with pytest.raises(AcquisitionSourceError):
        acquire(tmp_path / "does-not-exist.bin", dst, sink=sink, **CASE)
    assert not dst.exists()
    loaded = load_sidecar(dst)
    assert loaded is not None and loaded.status is AcquisitionStatus.FAILED
    assert [e.event_type for e in sink.events] == ["intake_started", "intake_failed"]


def test_missing_destination_directory_fails_cleanly(tmp_path):
    src, _, _ = _make_source(tmp_path, size=1024)
    with pytest.raises(AcquisitionWriteError):
        acquire(src, tmp_path / "no-such-dir" / "img.img", **CASE)


def test_disk_full_mid_write_marks_failed(tmp_path, monkeypatch):
    src, _, _ = _make_source(tmp_path, size=2 * 1024 * 1024)
    dst = tmp_path / "img.img"
    real_open = open
    calls = {"n": 0}

    class ExplodingFile:
        def __init__(self, f):
            self._f = f

        def write(self, chunk):
            calls["n"] += 1
            if calls["n"] == 2:
                raise OSError(28, "No space left on device")
            return self._f.write(chunk)

        def __getattr__(self, name):
            return getattr(self._f, name)

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return self._f.__exit__(*exc)

    def fake_open(path, mode="r", *args, **kwargs):
        f = real_open(path, mode, *args, **kwargs)
        if "w" in mode and str(path) == str(dst):
            return ExplodingFile(f)
        return f

    monkeypatch.setattr("backend.acquisition.imager.open", fake_open, raising=False)

    with pytest.raises(AcquisitionWriteError):
        acquire(src, dst, chunk_size=512 * 1024, **CASE)

    loaded = load_sidecar(dst)
    assert loaded.status is AcquisitionStatus.FAILED
    assert loaded.bytes_read == 512 * 1024
    assert any("write error" in n for n in loaded.notes)
    assert loaded.intake_hashes == []  # a failed run never claims a hash


def test_verification_mismatch_is_a_hard_failure(tmp_path, monkeypatch):
    src, _, _ = _make_source(tmp_path, size=8192)
    dst = tmp_path / "img.img"
    monkeypatch.setattr(
        "backend.acquisition.imager.compute_sha256_file", lambda *a, **k: "0" * 64
    )
    with pytest.raises(AcquisitionVerificationError):
        acquire(src, dst, **CASE)
    loaded = load_sidecar(dst)
    assert loaded.status is AcquisitionStatus.FAILED_VERIFICATION
    assert loaded.verification_hash.hex_digest == "0" * 64


def test_build_evidence_item_refuses_failed_acquisition(tmp_path):
    dst = tmp_path / "img.img"
    with pytest.raises(AcquisitionSourceError):
        acquire(tmp_path / "missing.bin", dst, **CASE)
    record = load_sidecar(dst)
    vendor = VendorInfo(
        vendor_name="Unknown",
        detected_format_signature="none",
        validation_status=ValidationStatus.GENERIC_FALLBACK,
    )
    with pytest.raises(ValueError):
        build_evidence_item(record, vendor)


@pytest.mark.skipif(
    os.name != "nt", reason="raw device path syntax is Windows-specific"
)
def test_raw_device_without_rights_raises_permission_or_source_error(tmp_path):
    # Without administrator rights this must fail loudly, never silently.
    from backend.acquisition.exceptions import AcquisitionError

    with pytest.raises(AcquisitionError):
        acquire(r"\\.\PhysicalDrive99", tmp_path / "raw.img", **CASE)
