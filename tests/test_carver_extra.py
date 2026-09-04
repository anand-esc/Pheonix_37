"""Extra carver coverage: H.265, access-unit delimiters, 3-byte start codes,
and a bounded performance check on a larger image."""

import hashlib
import time
from pathlib import Path

from backend.adapters.generic_carver import CarveOptions, GenericNalCarver
from backend.adapters.generic_carver.nal import parse_sps_h265
from backend.detection import FormatDetector
from tests.fixtures.build_fixtures import (
    SegmentSpec,
    build_dvr_image,
    build_h264_stream,
    build_h265_sps,
    build_h265_stream,
)

FIXTURE_DIR = Path(__file__).parent / "fixtures"
SMALL = CarveOptions(block_size=4096, filler_split_bytes=1024)


# ---------------------------------------------------------------------------
# H.265
# ---------------------------------------------------------------------------
def test_h265_sps_builder_round_trips():
    info = parse_sps_h265(build_h265_sps(1920, 1080))
    assert (info.codec, info.width, info.height, info.profile_name) == (
        "H.265",
        1920,
        1080,
        "Main",
    )


def test_h265_stream_carves_with_parsed_sps_and_gops(tmp_path):
    stream = build_h265_stream(frames=30, seed=3)
    path = tmp_path / "s.h265"
    path.write_bytes(stream)
    (frag,) = GenericNalCarver(SMALL).carve(path).fragments
    assert frag.features.codec == "h265"
    assert frag.features.start_reason == "vps"
    assert frag.features.end_reason == "eos"
    assert frag.features.idr_count == 3 and frag.features.vcl_count == 30
    assert frag.stream is not None and frag.stream.width == 1280
    assert frag.fragment.codec_info.startswith("H.265 Main")
    assert frag.sha256 == hashlib.sha256(stream).hexdigest()
    assert frag.fragment.confidence_score == 0.95


def test_h265_short_gop_split_uses_first_slice_flag(tmp_path):
    a = build_h265_stream(frames=25, seed=1, with_eos=False)
    b = build_h265_stream(frames=20, seed=2, with_eos=False)
    path = tmp_path / "abut.h265"
    path.write_bytes(a + b)
    result = GenericNalCarver(SMALL).carve(path)
    assert [c.sha256 for c in result.fragments] == [
        hashlib.sha256(a).hexdigest(),
        hashlib.sha256(b).hexdigest(),
    ]
    assert result.fragments[0].features.end_reason == "short_gop"


def test_detector_and_adapter_agree_on_h265(tmp_path):
    stream = build_h265_stream(frames=40, seed=9)
    path = tmp_path / "s.h265"
    path.write_bytes(stream)
    report = FormatDetector(
        head_bytes=4096, sample_windows=8, window_bytes=1024
    ).detect(path)
    assert report.vendor_info.detected_format_signature == "annexb-h265"
    carver = GenericNalCarver(CarveOptions(codec_hint=report.nal_stats.codec_guess))
    assert carver.carve(path).stats.codec == "h265"


def test_committed_h265_sample_matches_builder():
    sample = FIXTURE_DIR / "sample_stream.h265"
    data = sample.read_bytes()
    assert data == build_h265_stream(frames=20, seed=2026)
    (frag,) = GenericNalCarver().carve(sample).fragments
    assert frag.sha256 == hashlib.sha256(data).hexdigest()


# ---------------------------------------------------------------------------
# Access-unit delimiters and 3-byte start codes
# ---------------------------------------------------------------------------
def test_aud_stream_is_carved_from_the_first_aud(tmp_path):
    stream = build_h264_stream(frames=20, seed=4, with_aud=True)
    path = tmp_path / "aud.h264"
    path.write_bytes(stream)
    (frag,) = GenericNalCarver(SMALL).carve(path).fragments
    assert frag.fragment.byte_offset_start == 0
    assert frag.sha256 == hashlib.sha256(stream).hexdigest()
    assert frag.features.nal_count == 20 + 20 + 2 * 2 + 1  # AUD+slice, SPS/PPS x2, EOS


def test_three_byte_start_codes_are_handled(tmp_path):
    four = build_h265_stream(frames=12, seed=5, start_code_len=4)
    three = build_h265_stream(frames=12, seed=5, start_code_len=3)
    assert len(three) < len(four)
    path = tmp_path / "three.h265"
    path.write_bytes(three)
    (frag,) = GenericNalCarver(SMALL).carve(path).fragments
    assert frag.sha256 == hashlib.sha256(three).hexdigest()
    assert frag.features.nal_count == 3 * 2 + 12 + 1  # VPS/SPS/PPS x2 GOPs, slices, EOS

    # After zero filler the byte before "00 00 01" is taken as the zero_byte of
    # a 4-byte start code (H.264/H.265 Annex B require one before the first
    # NAL of an access unit), so the fragment starts one byte early. That is
    # the only byte of ambiguity and it is harmless to every decoder.
    path.write_bytes(b"\x00" * 5000 + three)
    (frag,) = GenericNalCarver(SMALL).carve(path).fragments
    assert frag.fragment.byte_offset_start == 4999
    assert frag.sha256 == hashlib.sha256(b"\x00" + three).hexdigest()


# ---------------------------------------------------------------------------
# Performance guard
# ---------------------------------------------------------------------------
def test_carving_a_32mib_image_is_fast_and_exact(tmp_path):
    specs = [SegmentSpec(frames=120, deleted=(i % 3 == 1)) for i in range(12)]
    manifest = build_dvr_image(
        tmp_path / "big.img",
        size_bytes=32 * 1024 * 1024,
        seed=77,
        segments=specs,
        block_size=256 * 1024,
        noise_bytes=512 * 1024,
    )
    t0 = time.perf_counter()
    result = GenericNalCarver().carve(tmp_path / "big.img")
    elapsed = time.perf_counter() - t0
    assert [c.sha256 for c in result.fragments] == [s.sha256 for s in manifest.segments]
    assert elapsed < 10.0, f"carve took {elapsed:.1f}s"
