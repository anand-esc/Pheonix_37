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


# ---------------------------------------------------------------------------
# H.265 MP4 wrapping
# ---------------------------------------------------------------------------
def test_h265_mp4_round_trip_is_lossless_and_well_formed(tmp_path):

    from backend.adapters.generic_carver.mp4 import (
        iter_annexb_nals,
        parse_boxes,
        wrap_fragment_file,
    )

    stream = build_h265_stream(frames=30, seed=12)
    src = tmp_path / "frag.h265"
    src.write_bytes(stream)
    before = hashlib.sha256(stream).hexdigest()

    info = wrap_fragment_file(src, tmp_path / "frag.mp4", fps=25.0)
    assert hashlib.sha256(src.read_bytes()).hexdigest() == before  # evidence untouched
    assert info.codec == "h265"
    assert info.samples == 30 and info.sync_samples == 3
    assert info.stream.width == 1280 and info.stream.height == 720
    assert info.duration_seconds == 30 / 25.0
    # parameter sets and the end-of-stream NAL are configuration, not samples
    assert info.dropped_nal_types == {32: 3, 33: 3, 34: 3, 36: 1}

    mp4 = (tmp_path / "frag.mp4").read_bytes()
    top = [(k, s, n) for k, s, n in parse_boxes(mp4)]
    assert [k for k, _, _ in top] == [b"ftyp", b"moov", b"mdat"]
    assert sum(n for _, _, n in top) == len(mp4)
    assert b"hvc1" in mp4 and b"hvcC" in mp4
    assert b"avc1" not in mp4 and b"avcC" not in mp4

    # every VCL NAL appears byte for byte in mdat, length-prefixed
    _, mdat_start, mdat_size = top[2]
    mdat = mp4[mdat_start + 8 : mdat_start + mdat_size]
    vcl = [n for n in iter_annexb_nals(stream) if ((n[0] >> 1) & 0x3F) <= 31]
    pos = 0
    for nal in vcl:
        length = int.from_bytes(mdat[pos : pos + 4], "big")
        assert mdat[pos + 4 : pos + 4 + length] == nal
        pos += 4 + length
    assert pos == len(mdat)

    # stco points at the mdat payload, so a player finds sample 1
    stco_at = mp4.index(b"stco")
    assert int.from_bytes(mp4[stco_at + 12 : stco_at + 16], "big") == mdat_start + 8


def test_hvcc_record_matches_the_bitstream(tmp_path):
    import struct

    from backend.adapters.generic_carver.mp4 import iter_annexb_nals, wrap_annexb
    from backend.adapters.generic_carver.nal import h265_general_ptl

    stream = build_h265_stream(frames=20, seed=5)
    mp4, info = wrap_annexb(stream)
    nals = list(iter_annexb_nals(stream))
    vps = next(n for n in nals if ((n[0] >> 1) & 0x3F) == 32)
    sps = next(n for n in nals if ((n[0] >> 1) & 0x3F) == 33)
    pps = next(n for n in nals if ((n[0] >> 1) & 0x3F) == 34)

    at = mp4.index(b"hvcC") + 4
    assert mp4[at] == 1  # configurationVersion
    # the 12-byte general profile_tier_level is copied out of the SPS verbatim
    assert mp4[at + 1 : at + 13] == h265_general_ptl(sps)
    chroma = mp4[at + 16] & 0x3
    assert chroma == info.stream.chroma_format_idc == 1  # 4:2:0
    assert (mp4[at + 17] & 0x7) + 8 == info.stream.bit_depth_luma == 8
    assert (mp4[at + 18] & 0x7) + 8 == info.stream.bit_depth_chroma == 8
    flags = mp4[at + 21]
    assert flags & 0x3 == 3  # lengthSizeMinusOne: 4-byte NAL lengths, as written
    assert (flags >> 3) & 0x7 == info.stream.max_sub_layers == 1

    # three arrays, one each for VPS, SPS and PPS, holding the exact NAL bytes
    assert mp4[at + 22] == 3
    pos = at + 23
    for expected_type, expected_nal in ((32, vps), (33, sps), (34, pps)):
        assert mp4[pos] & 0x3F == expected_type
        count = struct.unpack(">H", mp4[pos + 1 : pos + 3])[0]
        assert count == 1
        length = struct.unpack(">H", mp4[pos + 3 : pos + 5])[0]
        assert mp4[pos + 5 : pos + 5 + length] == expected_nal
        pos += 5 + length


def test_pipeline_wraps_an_h265_image_into_playable_mp4(tmp_path):
    from backend.pipeline.runner import run_pipeline

    src = tmp_path / "h265.img"
    stream = build_h265_stream(frames=20, seed=6)
    src.write_bytes(stream + b"\x00" * 8192)

    result = run_pipeline(
        src,
        case_id="CASE-H265",
        operator_id="op-1",
        out_dir=tmp_path / "run",
        encrypt=False,
    )
    assert result.carve.stats.codec == "h265"
    (fragment,) = result.exported
    assert fragment.out_path.endswith(".h265")
    (view,) = result.playable
    assert view.mp4_path and view.mp4_path.endswith(".mp4")
    assert view.samples == 20
    mp4 = Path(view.mp4_path).read_bytes()
    assert mp4[4:8] == b"ftyp" and b"hvc1" in mp4
    assert hashlib.sha256(mp4).hexdigest() == view.mp4_sha256
