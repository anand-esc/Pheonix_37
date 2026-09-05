import random

import pytest

from backend.core.evidence_model import ChannelInfo, EvidenceItem, ValidationStatus
from backend.core.interfaces import BaseAdapter
from backend.detection import (
    ADAPTER_FOR_VENDOR,
    GENERIC_ADAPTER,
    RESEARCH_TARGETS,
    SIGNATURES,
    FormatDetector,
    SignatureKind,
    resolve_adapter,
)
from backend.detection.signatures import HIKVISION_MAGIC, HIKVISION_MAGIC_OFFSET
from backend.pipeline.events import InMemoryEventSink

# Small windows keep the tests fast while still exercising the sampler.
DETECTOR = FormatDetector(head_bytes=4096, sample_windows=8, window_bytes=1024)


# ---------------------------------------------------------------------------
# Synthetic inputs
# ---------------------------------------------------------------------------
def _h264_stream(frames: int = 40) -> bytes:
    sps = b"\x00\x00\x00\x01\x67\x42\x00\x1e\xab\x40\x50\x1e\xd0"
    pps = b"\x00\x00\x00\x01\x68\xce\x38\x80"
    idr = b"\x00\x00\x00\x01\x65\x88\x84" + b"\x11" * 120
    p = b"\x00\x00\x00\x01\x41\x9a\x02" + b"\x22" * 60
    out = bytearray()
    for i in range(frames):
        if i % 10 == 0:
            out += sps + pps + idr
        else:
            out += p
    return bytes(out)


def _h265_stream(frames: int = 40) -> bytes:
    vps = b"\x00\x00\x00\x01\x40\x01\x0c\x01\xff\xff"
    sps = b"\x00\x00\x00\x01\x42\x01\x01\x01\x60\x00"
    pps = b"\x00\x00\x00\x01\x44\x01\xc0\xf2\xf0"
    idr = b"\x00\x00\x00\x01\x26\x01\xaf" + b"\x33" * 120  # type 19 IDR_W_RADL
    trail = b"\x00\x00\x00\x01\x02\x01\xd0" + b"\x44" * 60  # type 1 TRAIL_R
    out = bytearray()
    for i in range(frames):
        if i % 10 == 0:
            out += vps + sps + pps + idr
        else:
            out += trail
    return bytes(out)


def _write(tmp_path, name, data: bytes):
    p = tmp_path / name
    p.write_bytes(data)
    return p


def _hikvision_image(size=64 * 1024, with_video=True) -> bytes:
    buf = bytearray(size)
    buf[HIKVISION_MAGIC_OFFSET : HIKVISION_MAGIC_OFFSET + len(HIKVISION_MAGIC)] = (
        HIKVISION_MAGIC
    )
    if with_video:
        stream = _h264_stream()
        buf[8192 : 8192 + len(stream)] = stream
    return bytes(buf)


def _dahua_image(size=64 * 1024) -> bytes:
    buf = bytearray(size)
    buf[0:7] = b"DHFS4.1"
    for off in range(512, size - 64, 512):
        buf[off : off + 4] = b"DHAV"
        buf[off + 40 : off + 44] = b"dhav"
    return bytes(buf)


# ---------------------------------------------------------------------------
# Vendor signatures
# ---------------------------------------------------------------------------
def test_hikvision_magic_at_expected_offset(tmp_path):
    report = DETECTOR.detect(_write(tmp_path, "hik.img", _hikvision_image()))
    vi = report.vendor_info
    assert vi.vendor_name == "Hikvision"
    assert vi.validation_status is ValidationStatus.VALIDATED
    assert vi.detected_format_signature == "hikvision_master_sector@0x210"
    m = {x.signature_name: x for x in report.matches}["hikvision_master_sector"]
    assert m.at_expected_offset and m.offset == 0x210
    assert 0.85 <= report.confidence <= 0.95
    assert report.adapter_module == ADAPTER_FOR_VENDOR["Hikvision"][0]
    assert any("decision: Hikvision" in line for line in report.rationale)


def test_hikvision_magic_elsewhere_scores_lower(tmp_path):
    buf = bytearray(32 * 1024)
    buf[5000 : 5000 + len(HIKVISION_MAGIC)] = HIKVISION_MAGIC
    report = DETECTOR.detect(_write(tmp_path, "hik2.img", bytes(buf)))
    assert report.vendor_info.vendor_name == "Hikvision"
    assert report.matches[0].at_expected_offset is False
    assert report.confidence == pytest.approx(0.9 * 0.8, abs=0.01)
    assert any("unexpected offset" in line for line in report.rationale)


def test_dahua_dhfs_and_dhav_markers(tmp_path):
    report = DETECTOR.detect(_write(tmp_path, "dahua.img", _dahua_image()))
    assert report.vendor_info.vendor_name == "Dahua"
    names = {m.signature_name for m in report.matches}
    assert {"dahua_dhfs_header", "dahua_dhav_frame"} <= names
    frame = next(m for m in report.matches if m.signature_name == "dahua_dhav_frame")
    assert frame.occurrences > 1
    assert report.confidence == 0.95  # capped
    assert any("OEM note" in line for line in report.rationale)  # CP Plus honesty


def test_conflicting_vendor_signatures_are_penalised_and_explained(tmp_path):
    buf = bytearray(_hikvision_image(with_video=False))
    buf[0:7] = b"DHFS4.1"
    report = DETECTOR.detect(_write(tmp_path, "conflict.img", bytes(buf)))
    assert report.vendor_info.vendor_name == "Hikvision"
    assert report.confidence == pytest.approx(0.9 - 0.1, abs=0.001)
    assert any(line.startswith("conflict:") for line in report.rationale)


# ---------------------------------------------------------------------------
# Containers and bare streams
# ---------------------------------------------------------------------------
def test_avi_container(tmp_path):
    data = b"RIFF" + (1000).to_bytes(4, "little") + b"AVI LIST" + b"\x00" * 2000
    report = DETECTOR.detect(_write(tmp_path, "a.avi", data))
    assert report.vendor_info.vendor_name == "Generic AVI"
    assert report.vendor_info.validation_status is ValidationStatus.GENERIC_FALLBACK
    assert report.confidence == pytest.approx(0.85, abs=0.001)
    assert report.adapter_module == GENERIC_ADAPTER[0]


def test_mp4_container(tmp_path):
    data = (24).to_bytes(4, "big") + b"ftypisom" + b"\x00" * 3000
    report = DETECTOR.detect(_write(tmp_path, "a.mp4", data))
    assert report.vendor_info.vendor_name == "Generic MP4"
    assert report.vendor_info.detected_format_signature == "iso_bmff_ftyp@0x4"


def test_mpegts_needs_periodic_sync_bytes(tmp_path):
    rng = random.Random(7)
    body = bytearray(rng.randbytes(188 * 5))
    for k in range(5):
        body[188 * k] = 0x47
    report = DETECTOR.detect(_write(tmp_path, "a.ts", bytes(body)))
    assert report.vendor_info.vendor_name == "Generic MPEG-TS"
    assert report.confidence == pytest.approx(0.85, abs=0.001)

    # A single 0x47 at offset 0 is only a weak hint, not a decision.
    lone = bytearray(rng.randbytes(2000))
    lone[0] = 0x47
    lone[188] = 0x00
    lone[376] = 0x00
    report = DETECTOR.detect(_write(tmp_path, "b.bin", bytes(lone)))
    assert report.vendor_info.vendor_name != "Generic MPEG-TS"
    assert any("not decisive" in line for line in report.rationale)


def test_bare_h264_stream_is_generic_with_density_confidence(tmp_path):
    report = DETECTOR.detect(_write(tmp_path, "raw.h264", _h264_stream(200)))
    vi = report.vendor_info
    assert vi.vendor_name == "Generic Annex-B stream"
    assert vi.detected_format_signature == "annexb-h264"
    assert vi.validation_status is ValidationStatus.GENERIC_FALLBACK
    assert report.nal_stats.codec_guess == "h264"
    assert report.nal_stats.density == 1.0
    assert report.confidence == pytest.approx(0.80, abs=0.001)


def test_bare_h265_stream_is_recognised(tmp_path):
    report = DETECTOR.detect(_write(tmp_path, "raw.h265", _h265_stream(200)))
    assert report.vendor_info.detected_format_signature == "annexb-h265"
    assert report.nal_stats.codec_guess == "h265"
    assert report.nal_stats.h265_votes > report.nal_stats.h264_votes


def test_vendor_match_is_corroborated_by_nal_density(tmp_path):
    with_video = DETECTOR.detect(_write(tmp_path, "v.img", _hikvision_image()))
    without = DETECTOR.detect(
        _write(tmp_path, "n.img", _hikvision_image(with_video=False))
    )
    assert without.confidence == pytest.approx(0.90, abs=0.001)
    # video occupies part of the image only, so density may or may not reach
    # the corroboration threshold; it must never lower the vendor score.
    assert with_video.confidence >= without.confidence


# ---------------------------------------------------------------------------
# Negative / edge cases
# ---------------------------------------------------------------------------
def test_random_bytes_are_unknown(tmp_path):
    data = random.Random(1234).randbytes(256 * 1024)
    report = DETECTOR.detect(_write(tmp_path, "noise.bin", data))
    assert report.vendor_info.vendor_name == "Unknown"
    assert report.vendor_info.detected_format_signature == "none"
    assert report.confidence == 0.0
    assert report.adapter_module == GENERIC_ADAPTER[0]


def test_empty_file_is_unknown_with_reason(tmp_path):
    report = DETECTOR.detect(_write(tmp_path, "empty.bin", b""))
    assert report.vendor_info.vendor_name == "Unknown"
    assert report.rationale[0].startswith("empty source")
    assert report.nal_stats.windows_sampled == 0


def test_missing_file_raises(tmp_path):
    with pytest.raises(FileNotFoundError):
        DETECTOR.detect(tmp_path / "nope.img")


def test_detection_is_deterministic_and_bounded(tmp_path):
    big = _hikvision_image(size=2 * 1024 * 1024)
    path = _write(tmp_path, "big.img", big)
    a = DETECTOR.detect(path)
    b = DETECTOR.detect(path)
    assert a == b
    assert a.scan_bytes <= DETECTOR.head_bytes + DETECTOR.sample_windows * (
        DETECTOR.window_bytes
    )
    assert a.nal_stats.windows_sampled == DETECTOR.sample_windows


def test_detect_emits_event_with_summary(tmp_path):
    sink = InMemoryEventSink()
    DETECTOR.detect(
        _write(tmp_path, "hik.img", _hikvision_image()),
        case_id="CASE-001",
        evidence_id="ev-1",
        sink=sink,
    )
    (event,) = sink.of_type("format_detected")
    assert event.evidence_id == "ev-1" and event.stage == "detection"
    assert event.payload["vendor"] == "Hikvision"
    assert event.payload["validation_status"] == "VALIDATED"
    assert "confidence" in event.payload and "matched" in event.payload


# ---------------------------------------------------------------------------
# Registry hygiene
# ---------------------------------------------------------------------------
def test_every_signature_is_documented_and_honest():
    names = [s.name for s in SIGNATURES]
    assert len(names) == len(set(names))
    for sig in SIGNATURES:
        assert sig.source_note.strip(), sig.name
        assert 0.0 < sig.weight <= 1.0, sig.name
        assert sig.pattern, sig.name
        assert sig.kind in (SignatureKind.VENDOR, SignatureKind.CONTAINER)
        # nothing has been checked on physical hardware on this branch
        assert sig.verified_on_device is False, sig.name
    for vendor in ("CP Plus", "Uniview", "Godrej", "Honeywell", "Matrix", "TP-Link"):
        assert vendor in RESEARCH_TARGETS


# ---------------------------------------------------------------------------
# Adapter resolution
# ---------------------------------------------------------------------------
class DummyAdapter(BaseAdapter):
    def detect(self, source_path: str) -> bool:
        return True

    def parse(self, source_path: str) -> EvidenceItem:
        raise NotImplementedError

    def list_channels(self, source_path: str) -> list[ChannelInfo]:
        return []


class NotAnAdapter:
    pass


HERE = "tests.test_detection"


def test_resolve_loads_vendor_adapter_when_importable(tmp_path):
    report = DETECTOR.detect(_write(tmp_path, "hik.img", _hikvision_image()))
    sink = InMemoryEventSink()
    res = resolve_adapter(
        report,
        case_id="CASE-001",
        sink=sink,
        adapter_map={"Hikvision": (HERE, "DummyAdapter")},
        generic=(HERE, "DummyAdapter"),
    )
    assert res.available and not res.fallback
    # pytest may import this module under a second name, so compare by name.
    assert isinstance(res.adapter, BaseAdapter)
    assert type(res.adapter).__name__ == "DummyAdapter"
    (event,) = sink.of_type("adapter_resolved")
    assert event.payload["fallback"] is False
    assert event.payload["adapter"] == f"{HERE}.DummyAdapter"


def test_resolve_falls_back_when_vendor_module_is_missing(tmp_path):
    report = DETECTOR.detect(_write(tmp_path, "hik.img", _hikvision_image()))
    res = resolve_adapter(
        report,
        adapter_map={"Hikvision": ("backend.adapters.does_not_exist", "Nope")},
        generic=(HERE, "DummyAdapter"),
    )
    assert res.fallback and res.available
    assert res.requested_module == "backend.adapters.does_not_exist"
    assert res.resolved_class == "DummyAdapter"
    assert "unavailable" in res.reason


def test_resolve_rejects_non_adapter_classes(tmp_path):
    report = DETECTOR.detect(_write(tmp_path, "hik.img", _hikvision_image()))
    res = resolve_adapter(
        report,
        adapter_map={"Hikvision": (HERE, "NotAnAdapter")},
        generic=(HERE, "DummyAdapter"),
    )
    assert res.fallback and res.available
    assert "not a BaseAdapter" in res.reason


def test_resolve_reports_when_nothing_is_available(tmp_path):
    report = DETECTOR.detect(_write(tmp_path, "noise.bin", b"\x00" * 100))
    res = resolve_adapter(report, generic=("backend.adapters.nowhere", "X"))
    assert res.fallback and not res.available and res.adapter is None


class StubAdapter(BaseAdapter):
    """Looks like a vendor adapter but has no implementation yet."""

    def detect(self, source_path: str) -> bool:
        raise NotImplementedError("pending")

    def parse(self, source_path: str) -> EvidenceItem:
        raise NotImplementedError("pending")

    def list_channels(self, source_path: str) -> list[ChannelInfo]:
        raise NotImplementedError("pending")


class DecliningAdapter(DummyAdapter):
    def detect(self, source_path: str) -> bool:
        return False


class CrashingAdapter(DummyAdapter):
    def detect(self, source_path: str) -> bool:
        raise OSError("device gone")


@pytest.mark.parametrize(
    "cls,expected",
    [
        ("StubAdapter", "is a stub"),
        ("DecliningAdapter", "declined"),
        ("CrashingAdapter", "probe failed"),
    ],
)
def test_probe_routes_unusable_vendor_adapters_to_generic(tmp_path, cls, expected):
    report = DETECTOR.detect(_write(tmp_path, "hik.img", _hikvision_image()))
    res = resolve_adapter(
        report,
        adapter_map={"Hikvision": (HERE, cls)},
        generic=(HERE, "DummyAdapter"),
    )
    assert res.fallback and res.available
    assert res.resolved_class == "DummyAdapter"
    assert expected in res.reason

    # probing can be switched off, in which case the stub is handed back as-is
    res = resolve_adapter(
        report,
        adapter_map={"Hikvision": (HERE, cls)},
        generic=(HERE, "DummyAdapter"),
        probe=False,
    )
    assert not res.fallback and type(res.adapter).__name__ == cls


def test_real_registry_never_raises_on_this_branch(tmp_path):
    """Vendor adapters belong to other branches; resolution must degrade, not crash."""
    report = DETECTOR.detect(_write(tmp_path, "hik.img", _hikvision_image()))
    res = resolve_adapter(report)
    assert isinstance(res.fallback, bool) and isinstance(res.available, bool)
    if res.available:
        assert isinstance(res.adapter, BaseAdapter)
