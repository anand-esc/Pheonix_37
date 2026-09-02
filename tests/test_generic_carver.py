import hashlib
from pathlib import Path

import pytest

from backend.adapters.generic_carver import (
    CarveOptions,
    CarverExportError,
    CarverSourceError,
    GenericCarverAdapter,
    GenericNalCarver,
)
from backend.adapters.generic_carver.nal import (
    BitReader,
    parse_sps_h264,
    parse_sps_h265,
    scan_start_codes,
    unescape,
)
from backend.adapters.generic_carver.scoring import score
from backend.core.evidence_model import ValidationStatus
from backend.core.interfaces import BaseAdapter, RecoveryEngine
from backend.detection import FormatDetector, resolve_adapter
from backend.pipeline.events import InMemoryEventSink
from tests.fixtures.build_fixtures import (
    BitWriter,
    SegmentSpec,
    build_dvr_image,
    build_h264_stream,
    build_sps,
    escape_emulation,
    load_manifest,
)

FIXTURE_DIR = Path(__file__).parent / "fixtures"
SMALL = CarveOptions(block_size=4096, filler_split_bytes=1024)  # exercise block seams


# ---------------------------------------------------------------------------
# Bit-level building blocks
# ---------------------------------------------------------------------------
def test_exp_golomb_round_trip():
    bw = BitWriter()
    values = [0, 1, 2, 7, 8, 255, 1000]
    for v in values:
        bw.ue(v)
    for v in [0, 1, -1, 5, -5, 300]:
        bw.se(v)
    br = BitReader(bw.to_bytes())
    assert [br.ue() for _ in values] == values
    assert [br.se() for _ in range(6)] == [0, 1, -1, 5, -5, 300]


def test_emulation_prevention_round_trip():
    rbsp = b"\x00\x00\x01\x00\x00\x00\x00\x00\x02\xff\x00\x00\x03\x00\x00"
    escaped = escape_emulation(rbsp)
    assert b"\x00\x00\x01" not in escaped
    assert b"\x00\x00\x00" not in escaped
    assert unescape(escaped) == rbsp


@pytest.mark.parametrize(
    "width,height,profile",
    [(704, 576, 66), (1920, 1080, 100), (640, 360, 77), (3840, 2160, 100)],
)
def test_h264_sps_parse_recovers_resolution(width, height, profile):
    info = parse_sps_h264(build_sps(width, height, profile_idc=profile))
    assert (info.width, info.height, info.profile_idc) == (width, height, profile)
    assert info.codec == "H.264"


def test_h265_sps_parse_recovers_resolution():
    bw = BitWriter()
    bw.u(4, 0).u(3, 0).u(1, 1)  # vps id, max_sub_layers_minus1, nesting
    bw.u(2, 0).u(1, 0).u(5, 1)  # profile space, tier, profile_idc Main
    bw.u(32, 0x60000000)  # compatibility flags
    bw.u(48, 0)  # source flags + reserved
    bw.u(8, 93)  # level 3.1
    bw.ue(0)  # sps id
    bw.ue(1)  # chroma 4:2:0
    bw.ue(1280).ue(728)
    bw.u(1, 1).ue(0).ue(0).ue(0).ue(4)  # conformance window: crop 8 rows bottom
    bw.rbsp_trailing()
    nal = b"\x42\x01" + escape_emulation(bw.to_bytes())
    info = parse_sps_h265(nal)
    assert (info.codec, info.width, info.height) == ("H.265", 1280, 720)
    assert info.profile_name == "Main" and info.level_idc == 93


def test_scanner_finds_every_start_code_across_block_boundaries(tmp_path):
    stream = build_h264_stream(frames=40, seed=3)
    path = tmp_path / "s.h264"
    path.write_bytes(stream)
    expected = stream.count(b"\x00\x00\x00\x01")
    for block in (7, 64, 1000, 1 << 20):
        with open(path, "rb") as fh:
            nals = list(scan_start_codes(fh, len(stream), block))
        assert len(nals) == expected, block
        assert all(n.start_code_len == 4 for n in nals)
        assert nals[0].offset == 0 and nals[0].preceding_zeros == 0


# ---------------------------------------------------------------------------
# Carving
# ---------------------------------------------------------------------------
def test_single_stream_round_trips_byte_exact(tmp_path):
    stream = build_h264_stream(frames=30, seed=11)
    path = tmp_path / "one.h264"
    path.write_bytes(stream)
    result = GenericNalCarver(SMALL).carve(path)
    assert len(result.fragments) == 1
    frag = result.fragments[0]
    f = frag.fragment
    assert (f.byte_offset_start, f.byte_offset_end) == (0, len(stream))
    assert frag.sha256 == hashlib.sha256(stream).hexdigest()
    assert frag.features.end_reason == "eos"
    assert frag.features.first_vcl_is_idr
    assert frag.stream.width == 704 and frag.stream.height == 576
    assert f.codec_info.startswith("H.264 Baseline")
    assert f.recovery_method == "annexb_nal_carve"
    assert f.confidence_score == 0.95
    assert "ended by eos" in f.confidence_rationale


def test_deleted_segment_is_recovered_byte_exact(tmp_path):
    manifest = build_dvr_image(
        tmp_path / "dvr.img", size_bytes=1024 * 1024, seed=5, vendor_variant="none"
    )
    deleted = [s for s in manifest.segments if s.deleted]
    assert deleted, "fixture must contain a deleted segment"

    result = GenericNalCarver(SMALL).carve(tmp_path / "dvr.img")
    carved = {(c.fragment.byte_offset_start, c.sha256) for c in result.fragments}
    for seg in manifest.segments:
        assert (seg.offset, seg.sha256) in carved, f"segment {seg.index}"
    assert len(result.fragments) == len(manifest.segments)  # noise made no fragment
    assert result.stats.discarded_fragments + result.stats.orphan_nals >= 0
    assert (
        result.recovery_hash
        == hashlib.sha256(
            "\n".join(c.sha256 for c in result.fragments).encode()
        ).hexdigest()
    )


def test_noise_region_produces_no_fragment(tmp_path):
    manifest = build_dvr_image(
        tmp_path / "dvr.img",
        size_bytes=512 * 1024,
        seed=9,
        segments=[SegmentSpec(frames=10)],
        noise_bytes=128 * 1024,
    )
    result = GenericNalCarver(SMALL).carve(tmp_path / "dvr.img")
    assert len(result.fragments) == 1
    lo, hi = manifest.noise_region
    assert all(not (lo <= c.fragment.byte_offset_start < hi) for c in result.fragments)


def test_truncated_segment_scores_lower_than_complete_one(tmp_path):
    build_dvr_image(
        tmp_path / "dvr.img",
        size_bytes=512 * 1024,
        seed=2,
        segments=[SegmentSpec(frames=12), SegmentSpec(frames=12, truncate_bytes=9000)],
    )
    result = GenericNalCarver(SMALL).carve(tmp_path / "dvr.img")
    assert len(result.fragments) == 2
    whole, cut = result.fragments
    assert whole.features.end_reason == "eos"
    assert cut.features.end_reason == "zero_filler"  # cut, then filler, then noise
    assert cut.fragment.byte_offset_end == cut.fragment.byte_offset_start + 9000
    assert cut.fragment.confidence_score < whole.fragment.confidence_score


def test_nal_cut_by_short_zero_run_is_truncated_nal(tmp_path):
    stream = build_h264_stream(frames=6, seed=3, with_eos=False)
    cut_at = len(stream) - 500
    data = stream[:cut_at] + b"\x00" * 40 + b"\xaa" * 3000
    path = tmp_path / "cut.h264"
    path.write_bytes(data)
    (frag,) = GenericNalCarver(CarveOptions(verify_nal_bytes=0)).carve(path).fragments
    assert frag.features.end_reason == "truncated_nal"
    assert frag.fragment.byte_offset_end == cut_at


def test_stream_cut_at_end_of_file_is_end_of_data(tmp_path):
    stream = build_h264_stream(frames=12, seed=4)[:-7000]
    path = tmp_path / "cut.h264"
    path.write_bytes(stream)
    (frag,) = GenericNalCarver(SMALL).carve(path).fragments
    assert frag.features.end_reason == "end_of_data"
    assert frag.fragment.byte_offset_end == len(stream)
    assert frag.fragment.confidence_score < 0.95


def test_new_resolution_without_eos_starts_a_new_fragment(tmp_path):
    a = build_h264_stream(frames=8, seed=1, with_eos=False)
    b = build_h264_stream(frames=8, seed=2, width=1280, height=720, with_eos=False)
    path = tmp_path / "two.h264"
    path.write_bytes(a + b)
    result = GenericNalCarver(SMALL).carve(path)
    assert [c.features.end_reason for c in result.fragments] == [
        "new_sequence",
        "end_of_data",
    ]
    assert result.fragments[0].fragment.byte_offset_end == len(a)
    assert result.fragments[1].fragment.byte_offset_start == len(a)
    assert result.fragments[1].stream.width == 1280


def test_same_stream_split_by_zero_filler_but_not_by_small_padding(tmp_path):
    a = build_h264_stream(frames=8, seed=1, with_eos=False)
    b = build_h264_stream(frames=8, seed=1, with_eos=False)
    path = tmp_path / "gap.h264"
    path.write_bytes(a + b"\x00" * 4096 + b)
    result = GenericNalCarver(SMALL).carve(path)
    assert len(result.fragments) == 2
    assert result.fragments[0].features.end_reason == "zero_filler"
    assert result.fragments[0].fragment.byte_offset_end == len(a)

    # sub-threshold padding (like alignment bytes) keeps one fragment
    path.write_bytes(a + b"\x00" * 16 + b)
    result = GenericNalCarver(SMALL).carve(path)
    assert len(result.fragments) == 1
    assert result.fragments[0].features.parameter_set_repeats >= 1


def test_short_gop_before_repeated_sps_splits_abutting_recordings(tmp_path):
    # recording A: GOPs of 10, 10 and a cut GOP of 5; recording B starts
    # immediately with identical SPS/PPS, no EOS, no filler.
    a = build_h264_stream(frames=25, seed=1, with_eos=False)
    b = build_h264_stream(frames=20, seed=2, with_eos=False)
    path = tmp_path / "abut.h264"
    path.write_bytes(a + b)
    result = GenericNalCarver(SMALL).carve(path)
    assert [c.features.end_reason for c in result.fragments] == [
        "short_gop",
        "end_of_data",
    ]
    first, second = result.fragments
    assert first.fragment.byte_offset_end == len(a)
    assert second.fragment.byte_offset_start == len(a)
    assert first.sha256 == hashlib.sha256(a).hexdigest()
    assert second.sha256 == hashlib.sha256(b).hexdigest()
    assert second.features.has_sps and second.features.first_vcl_is_idr

    # with access-unit delimiters the split lands on the AUD, not the SPS
    a2 = build_h264_stream(frames=25, seed=1, with_eos=False, with_aud=True)
    b2 = build_h264_stream(frames=20, seed=2, with_eos=False, with_aud=True)
    path.write_bytes(a2 + b2)
    result = GenericNalCarver(SMALL).carve(path)
    assert [c.sha256 for c in result.fragments] == [
        hashlib.sha256(a2).hexdigest(),
        hashlib.sha256(b2).hexdigest(),
    ]


def test_full_gops_with_identical_sps_stay_one_fragment(tmp_path):
    # no in-band evidence of a boundary: documented residual limitation
    a = build_h264_stream(frames=30, seed=1, with_eos=False)
    b = build_h264_stream(frames=20, seed=2, with_eos=False)
    path = tmp_path / "abut2.h264"
    path.write_bytes(a + b)
    result = GenericNalCarver(SMALL).carve(path)
    assert len(result.fragments) == 1
    assert result.fragments[0].features.parameter_set_repeats == 4


def test_idr_without_parameter_sets_is_carved_at_lower_confidence(tmp_path):
    full = build_h264_stream(frames=6, seed=8)
    headerless = full[full.index(b"\x00\x00\x00\x01\x65") :]
    path = tmp_path / "headerless.h264"
    path.write_bytes(headerless)
    result = GenericNalCarver(CarveOptions(codec_hint="h264")).carve(path)
    (frag,) = result.fragments
    assert frag.features.start_reason == "idr_without_parameter_sets"
    assert not frag.features.has_sps
    assert frag.fragment.codec_info == "H.264 (SPS absent)"
    assert frag.fragment.confidence_score < 0.7

    # without a codec hint nothing can start a fragment
    assert GenericNalCarver().carve(path).fragments == []


def test_h265_stream_is_carved(tmp_path):
    vps = b"\x00\x00\x00\x01\x40\x01\x0c\x01\xff\xff"
    sps = b"\x00\x00\x00\x01\x42\x01\x01\x01\x60\x00"
    pps = b"\x00\x00\x00\x01\x44\x01\xc0\xf2\xf0"
    idr = b"\x00\x00\x00\x01\x26\x01\xaf" + b"\x33" * 120
    trail = b"\x00\x00\x00\x01\x02\x01\xd0" + b"\x44" * 60
    eos = b"\x00\x00\x00\x01\x48\x01"
    stream = vps + sps + pps + idr + trail * 5 + eos
    path = tmp_path / "s.h265"
    path.write_bytes(stream)
    (frag,) = GenericNalCarver(SMALL).carve(path).fragments
    assert frag.features.codec == "h265"
    assert frag.features.start_reason == "vps"
    assert frag.features.end_reason == "eos"
    assert frag.sha256 == hashlib.sha256(stream).hexdigest()
    assert frag.fragment.codec_info.startswith("H.265 (SPS unparseable")


def test_empty_and_missing_sources(tmp_path):
    empty = tmp_path / "empty.img"
    empty.write_bytes(b"")
    result = GenericNalCarver().carve(empty)
    assert result.fragments == [] and result.stats.file_size == 0
    with pytest.raises(CarverSourceError):
        GenericNalCarver().carve(tmp_path / "missing.img")


def test_recovery_engine_interface_and_scoring_are_deterministic(tmp_path):
    stream = build_h264_stream(frames=10, seed=6)
    path = tmp_path / "s.h264"
    path.write_bytes(stream)
    carver = GenericNalCarver(SMALL)
    assert isinstance(carver, RecoveryEngine)
    fragments = carver.carve_fragments(str(path))
    assert len(fragments) == 1
    frag = fragments[0]
    assert carver.score_confidence(frag) == frag.confidence_score
    assert 0.0 <= frag.confidence_score <= 1.0
    feats = carver._features[(frag.byte_offset_start, frag.byte_offset_end)]
    assert score(feats) == score(feats)
    assert (
        score(feats.model_copy(update={"end_reason": "end_of_data"}))[0]
        < score(feats)[0]
    )


# ---------------------------------------------------------------------------
# Export and events
# ---------------------------------------------------------------------------
def test_export_writes_verified_files_and_emits_events(tmp_path):
    build_dvr_image(tmp_path / "dvr.img", size_bytes=512 * 1024, seed=5)
    sink = InMemoryEventSink()
    carver = GenericNalCarver(SMALL, sink=sink, case_id="CASE-001", evidence_id="ev-1")
    result = carver.carve(tmp_path / "dvr.img")
    exported = carver.export(tmp_path / "dvr.img", result, tmp_path / "out")

    assert len(exported) == len(result.fragments) == 3
    for item, frag in zip(exported, result.fragments, strict=True):
        data = Path(item.out_path).read_bytes()
        assert hashlib.sha256(data).hexdigest() == item.sha256 == frag.sha256
        assert len(data) == item.length == frag.length
        assert item.out_path.endswith(".h264")

    types = [e.event_type for e in sink.events]
    assert types[0] == "recovery_started"
    assert types[1] == "recovery_completed"
    assert types[2:] == ["fragment_exported"] * 3
    assert sink.events[1].payload["fragment_count"] == 3
    assert sink.events[1].payload["recovery_hash"] == result.recovery_hash
    assert sink.events[2].payload["sha256"] == result.fragments[0].sha256
    assert all(e.evidence_id == "ev-1" and e.stage == "recovery" for e in sink.events)


def test_export_refuses_a_hash_mismatch(tmp_path):
    stream = build_h264_stream(frames=6, seed=1)
    path = tmp_path / "s.h264"
    path.write_bytes(stream)
    carver = GenericNalCarver(SMALL)
    result = carver.carve(path)
    # tamper with the image after carving: export must notice
    tampered = bytearray(stream)
    tampered[100] ^= 0xFF
    path.write_bytes(bytes(tampered))
    with pytest.raises(CarverExportError):
        carver.export(path, result, tmp_path / "out")
    assert not any((tmp_path / "out").glob("*.h264"))


# ---------------------------------------------------------------------------
# Adapter and detection integration
# ---------------------------------------------------------------------------
def test_generic_adapter_parses_into_evidence_item(tmp_path):
    build_dvr_image(
        tmp_path / "dvr.img", size_bytes=512 * 1024, seed=5, vendor_variant="none"
    )
    sink = InMemoryEventSink()
    adapter = GenericCarverAdapter(
        SMALL,
        detector=FormatDetector(head_bytes=4096, sample_windows=8, window_bytes=1024),
        sink=sink,
        case_id="CASE-001",
    )
    assert isinstance(adapter, BaseAdapter)
    assert adapter.detect(str(tmp_path / "dvr.img")) is True
    item = adapter.parse(str(tmp_path / "dvr.img"))
    assert item.evidence_id.startswith("ev-generic-")
    assert item.vendor_info.vendor_name == "Generic Annex-B stream"
    assert item.vendor_info.validation_status is ValidationStatus.GENERIC_FALLBACK
    assert len(item.fragments) == 3
    assert (
        item.channels == [] and adapter.list_channels(str(tmp_path / "dvr.img")) == []
    )
    assert item.metadata["recovery_hash"] == adapter.last_result.recovery_hash
    assert (
        item.metadata["fragment_0000_sha256"] == adapter.last_result.fragments[0].sha256
    )
    assert all(isinstance(v, str) for v in item.metadata.values())
    assert [e.event_type for e in sink.events][:2] == [
        "format_detected",
        "recovery_started",
    ]


def test_detector_now_resolves_the_generic_carver(tmp_path):
    build_dvr_image(tmp_path / "dvr.img", size_bytes=512 * 1024, seed=1)
    report = FormatDetector().detect(tmp_path / "dvr.img")
    res = resolve_adapter(report)
    assert res.available and res.fallback
    assert isinstance(res.adapter, GenericCarverAdapter)


def test_vendor_marker_variants_carve_identically(tmp_path):
    hashes = {}
    for variant in ("none", "hikvision", "dahua", "avi", "mp4", "mpegts"):
        manifest = build_dvr_image(
            tmp_path / f"{variant}.img",
            size_bytes=512 * 1024,
            seed=3,
            vendor_variant=variant,
        )
        result = GenericNalCarver(SMALL).carve(tmp_path / f"{variant}.img")
        hashes[variant] = [c.sha256 for c in result.fragments]
        assert hashes[variant] == [s.sha256 for s in manifest.segments], variant
    assert len({tuple(v) for v in hashes.values()}) == 1


# ---------------------------------------------------------------------------
# Lossless MP4 wrapping
# ---------------------------------------------------------------------------
def test_mp4_wrap_is_lossless_and_well_formed(tmp_path):
    from backend.adapters.generic_carver.mp4 import (
        iter_annexb_nals,
        parse_boxes,
        wrap_fragment_file,
    )

    stream = build_h264_stream(frames=25, seed=5, with_aud=True)
    src = tmp_path / "frag.h264"
    src.write_bytes(stream)
    before = hashlib.sha256(stream).hexdigest()

    info = wrap_fragment_file(src, tmp_path / "frag.mp4", fps=25.0)
    assert hashlib.sha256(src.read_bytes()).hexdigest() == before  # untouched
    assert info.samples == 25 and info.sync_samples == 3
    assert info.stream.width == 704 and info.duration_seconds == 1.0
    assert info.dropped_nal_types[9] == 25  # AUDs are not samples

    mp4 = (tmp_path / "frag.mp4").read_bytes()
    top = [(k, s, n) for k, s, n in parse_boxes(mp4)]
    assert [k for k, _, _ in top] == [b"ftyp", b"moov", b"mdat"]
    assert sum(n for _, _, n in top) == len(mp4)

    # every VCL NAL appears byte for byte in mdat, length-prefixed
    _, mdat_start, mdat_size = top[2]
    mdat = mp4[mdat_start + 8 : mdat_start + mdat_size]
    vcl = [n for n in iter_annexb_nals(stream) if 1 <= (n[0] & 0x1F) <= 5]
    pos = 0
    for nal in vcl:
        length = int.from_bytes(mdat[pos : pos + 4], "big")
        assert mdat[pos + 4 : pos + 4 + length] == nal
        pos += 4 + length
    assert pos == len(mdat)

    # avcC carries the SPS/PPS; stco points at the mdat payload
    assert b"avcC" in mp4 and b"stss" in mp4
    stco_at = mp4.index(b"stco")
    chunk_offset = int.from_bytes(mp4[stco_at + 12 : stco_at + 16], "big")
    assert chunk_offset == mdat_start + 8


def test_mp4_wrap_rejects_streams_without_parameter_sets(tmp_path):
    from backend.adapters.generic_carver.mp4 import wrap_annexb

    full = build_h264_stream(frames=6, seed=8)
    headerless = full[full.index(b"\x00\x00\x00\x01\x65") :]
    with pytest.raises(ValueError):
        wrap_annexb(headerless)
    with pytest.raises(NotImplementedError):
        wrap_annexb(b"\x00\x00\x00\x01\x40\x01\x0c\x01\xff\xff")


# ---------------------------------------------------------------------------
# Committed sample fixtures must match the builder (drift guard)
# ---------------------------------------------------------------------------
def test_committed_sample_image_matches_builder(tmp_path):
    sample = FIXTURE_DIR / "sample_dvr_image.img"
    manifest = load_manifest(sample)
    rebuilt = build_dvr_image(
        tmp_path / "rebuilt.img",
        size_bytes=manifest["size_bytes"],
        seed=manifest["seed"],
        vendor_variant=manifest["vendor_variant"],
        block_size=manifest["block_size"],
    )
    assert rebuilt.sha256 == manifest["sha256"]
    assert hashlib.sha256(sample.read_bytes()).hexdigest() == manifest["sha256"]
    result = GenericNalCarver().carve(sample)
    assert [c.sha256 for c in result.fragments] == [
        s["sha256"] for s in manifest["segments"]
    ]
    assert manifest["segments"][1]["deleted"] is True
