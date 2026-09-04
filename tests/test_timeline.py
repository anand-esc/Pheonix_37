"""Timeline ordering, duration estimation and probable-channel grouping."""

import hashlib

import pytest

from backend.adapters.generic_carver import (
    CarveOptions,
    GenericCarverAdapter,
    GenericNalCarver,
    build_timeline,
)
from backend.adapters.generic_carver.nal import parse_sps_h264
from backend.adapters.generic_carver.timeline import UNKNOWN_SIGNATURE
from backend.detection import FormatDetector
from tests.fixtures.build_fixtures import (
    SegmentSpec,
    build_dvr_image,
    build_h264_stream,
    build_sps,
)

SMALL = CarveOptions(block_size=4096, filler_split_bytes=1024)
DETECTOR = FormatDetector(head_bytes=4096, sample_windows=8, window_bytes=1024)


def _carve(tmp_path, name, data, options=SMALL):
    path = tmp_path / name
    path.write_bytes(data)
    return GenericNalCarver(options).carve(path)


# ---------------------------------------------------------------------------
# Frame rate: declared vs assumed
# ---------------------------------------------------------------------------
def test_sps_without_vui_declares_no_frame_rate():
    assert parse_sps_h264(build_sps(704, 576)).declared_fps is None


@pytest.mark.parametrize("fps", [25.0, 12.5, 30.0, 1.0])
def test_sps_vui_timing_round_trips(fps):
    info = parse_sps_h264(build_sps(1280, 720, fps=fps))
    assert info.declared_fps == fps
    assert info.describe().endswith(f"@ {fps:g} fps (declared)")


def test_duration_uses_declared_rate_when_the_encoder_wrote_one(tmp_path):
    result = _carve(
        tmp_path, "d.h264", build_h264_stream(frames=50, seed=1, declared_fps=12.5)
    )
    timeline = build_timeline(result)
    (entry,) = timeline.entries
    assert entry.pictures == 50
    assert entry.duration_basis == "declared_fps"
    assert entry.fps == 12.5
    assert entry.estimated_seconds == 4.0  # 50 / 12.5
    assert "declared in the SPS VUI" in entry.rationale
    assert timeline.total_estimated_seconds == 4.0
    assert not any("assumed rate" in n for n in timeline.notes)


def test_duration_falls_back_to_an_assumed_rate_and_says_so(tmp_path):
    result = _carve(tmp_path, "a.h264", build_h264_stream(frames=50, seed=1))
    timeline = build_timeline(result, assumed_fps=20.0)
    (entry,) = timeline.entries
    assert entry.duration_basis == "assumed_fps"
    assert entry.fps == 20.0 and entry.estimated_seconds == 2.5
    assert "assumed" in entry.rationale
    assert any("no declared frame rate" in n for n in timeline.notes)

    # the estimate scales with the assumption, nothing else changes
    other = build_timeline(result, assumed_fps=10.0)
    assert other.entries[0].estimated_seconds == 5.0
    assert other.entries[0].pictures == entry.pictures


# ---------------------------------------------------------------------------
# Ordering and relative times
# ---------------------------------------------------------------------------
def test_entries_are_ordered_by_offset_with_cumulative_channel_times(tmp_path):
    manifest = build_dvr_image(
        tmp_path / "dvr.img",
        size_bytes=1024 * 1024,
        seed=4,
        segments=[
            SegmentSpec(frames=25, declared_fps=25.0),
            SegmentSpec(frames=50, deleted=True, declared_fps=25.0),
            SegmentSpec(frames=25, declared_fps=25.0),
        ],
    )
    result = GenericNalCarver(SMALL).carve(tmp_path / "dvr.img")
    timeline = build_timeline(result)

    assert [e.sequence for e in timeline.entries] == [1, 2, 3]
    assert [e.byte_offset_start for e in timeline.entries] == [
        s.offset for s in manifest.segments
    ]
    # one encoder configuration -> one probable channel, times run cumulatively
    assert {e.channel_id for e in timeline.entries} == {"probable-ch01"}
    assert [e.channel_position for e in timeline.entries] == [1, 2, 3]
    assert [e.estimated_seconds for e in timeline.entries] == [1.0, 2.0, 1.0]
    assert [e.relative_start_seconds for e in timeline.entries] == [0.0, 1.0, 3.0]
    assert timeline.total_estimated_seconds == 4.0
    assert any("wrapped around" in n for n in timeline.notes)
    assert any("no basis for separating channels" in n for n in timeline.notes)

    # the deleted recording sits in the timeline like any other
    deleted = next(s for s in manifest.segments if s.deleted)
    entry = next(e for e in timeline.entries if e.byte_offset_start == deleted.offset)
    assert entry.pictures == 50 and entry.complete


def test_incomplete_recordings_are_flagged(tmp_path):
    build_dvr_image(
        tmp_path / "dvr.img",
        size_bytes=512 * 1024,
        seed=6,
        segments=[
            SegmentSpec(frames=20, declared_fps=25.0),
            SegmentSpec(frames=20, declared_fps=25.0, truncate_bytes=9000),
        ],
    )
    timeline = build_timeline(GenericNalCarver(SMALL).carve(tmp_path / "dvr.img"))
    assert [e.complete for e in timeline.entries] == [True, False]
    assert "incomplete" in timeline.entries[1].rationale
    assert any("end-of-stream marker" in n for n in timeline.notes)


# ---------------------------------------------------------------------------
# Channel grouping
# ---------------------------------------------------------------------------
def test_different_encoder_configurations_become_separate_channels(tmp_path):
    a = build_h264_stream(frames=20, seed=1, declared_fps=25.0)
    b = build_h264_stream(frames=30, seed=2, width=1280, height=720, declared_fps=12.5)
    result = _carve(tmp_path, "two.h264", a + b)
    timeline = build_timeline(result)

    assert [c.channel_id for c in timeline.channels] == [
        "probable-ch01",
        "probable-ch02",
    ]
    ch1, ch2 = timeline.channels
    assert ch1.resolution == "704x576" and ch1.declared_fps == 25.0
    assert ch2.resolution == "1280x720" and ch2.declared_fps == 12.5
    assert ch1.estimated_seconds == 0.8 and ch2.estimated_seconds == 2.4
    assert ch1.stream_signature != ch2.stream_signature
    assert "probable channel, not a vendor channel number" in ch1.rationale
    assert [e.channel_position for e in timeline.entries] == [1, 1]

    info = timeline.to_channel_info()
    assert [c.channel_id for c in info] == ["probable-ch01", "probable-ch02"]
    assert info[1].declared_frame_rate == 12.5
    assert all(c.clock_offset_seconds is None for c in info)  # no wall clock exists


def test_identical_configurations_collapse_into_one_channel(tmp_path):
    # Two cameras set up identically are indistinguishable in the bitstream.
    a = build_h264_stream(frames=10, seed=1, declared_fps=25.0)
    b = build_h264_stream(frames=10, seed=2, declared_fps=25.0)
    result = _carve(tmp_path, "same.h264", a + b"\x00" * 4096 + b)
    timeline = build_timeline(result)
    assert len(result.fragments) == 2
    assert len(timeline.channels) == 1
    assert timeline.channels[0].fragment_indexes == [0, 1]
    assert "would appear here as one" in timeline.channels[0].rationale


def test_fragments_without_a_readable_sps_are_grouped_honestly(tmp_path):
    full = build_h264_stream(frames=9, seed=8)
    headerless = full[full.index(b"\x00\x00\x00\x01\x65") :]
    result = _carve(tmp_path, "h.h264", headerless, CarveOptions(codec_hint="h264"))
    timeline = build_timeline(result)
    (group,) = timeline.channels
    assert group.stream_signature == UNKNOWN_SIGNATURE
    assert group.resolution is None
    assert "cannot be attributed" in group.rationale
    assert timeline.entries[0].duration_basis == "assumed_fps"


def test_empty_carve_yields_an_empty_timeline(tmp_path):
    empty = tmp_path / "empty.img"
    empty.write_bytes(b"")
    timeline = build_timeline(GenericNalCarver().carve(empty))
    assert timeline.entries == [] and timeline.channels == []
    assert timeline.total_estimated_seconds is None
    assert timeline.to_channel_info() == []


# ---------------------------------------------------------------------------
# Adapter and evidence item
# ---------------------------------------------------------------------------
def test_adapter_exposes_channels_and_per_fragment_timeline_metadata(tmp_path):
    build_dvr_image(
        tmp_path / "dvr.img",
        size_bytes=1024 * 1024,
        seed=7,
        segments=[
            SegmentSpec(frames=20, declared_fps=25.0),
            SegmentSpec(frames=20, width=1280, height=720, declared_fps=25.0),
        ],
    )
    adapter = GenericCarverAdapter(SMALL, detector=DETECTOR)
    item = adapter.parse(str(tmp_path / "dvr.img"))
    timeline = adapter.last_timeline

    assert [c.channel_id for c in item.channels] == ["probable-ch01", "probable-ch02"]
    assert item.metadata["channels_inferred"] == "2"
    assert item.metadata["estimated_footage_seconds"] == "1.600"
    assert item.metadata["fragment_0000_channel"] == "probable-ch01"
    assert item.metadata["fragment_0001_channel"] == "probable-ch02"
    assert item.metadata["fragment_0000_seconds"] == "0.800 (declared_fps)"
    assert "wrapped around" in item.metadata["timeline_notes"]
    assert all(isinstance(v, str) for v in item.metadata.values())

    # every fragment is placed exactly once, and ids match the evidence item
    assert [e.fragment_id for e in timeline.entries] == [
        f.fragment_id for f in item.fragments
    ]
    assert timeline.channel_of(item.fragments[1].fragment_id) == "probable-ch02"
    assert timeline.channel_of("frag-nope") is None


def test_timeline_survives_a_json_round_trip(tmp_path):
    result = _carve(
        tmp_path, "d.h264", build_h264_stream(frames=30, seed=3, declared_fps=25.0)
    )
    timeline = build_timeline(result)
    from backend.adapters.generic_carver.timeline import Timeline

    again = Timeline.model_validate_json(timeline.model_dump_json())
    assert again == timeline
    assert hashlib.sha256(timeline.model_dump_json().encode()).hexdigest() == (
        hashlib.sha256(again.model_dump_json().encode()).hexdigest()
    )
