"""The Hikvision-shaped synthetic image: layout, detection and recovery.

The point of this fixture is the demo story: a recorder's index lists fewer
recordings than the disk actually holds, and the generic carver recovers the
missing ones byte for byte without any vendor parser.
"""

import hashlib

import pytest

from backend.adapters.generic_carver import GenericNalCarver, build_timeline
from backend.detection import FormatDetector
from backend.detection.signatures import SIGNATURES
from backend.pipeline.runner import run_pipeline
from tests.fixtures.build_fixtures import SegmentSpec
from tests.fixtures.hikvision_wfs import (
    HIKBTREE_MAGIC,
    MAGIC,
    MAGIC_OFFSET,
    build_hikvision_image,
    default_recordings,
    read_index,
)

SMALL_BLOCK = 512 * 1024


@pytest.fixture(scope="module")
def image(tmp_path_factory):
    path = tmp_path_factory.mktemp("wfs") / "hik.img"
    manifest = build_hikvision_image(
        path,
        size_bytes=8 * 1024 * 1024,
        block_size=SMALL_BLOCK,
        recordings=default_recordings(6),
        seed=7,
    )
    return path, manifest


# ---------------------------------------------------------------------------
# Layout
# ---------------------------------------------------------------------------
def test_master_sector_and_index_are_where_the_manifest_says(image):
    path, manifest = image
    data = path.read_bytes()
    assert data[MAGIC_OFFSET : MAGIC_OFFSET + len(MAGIC)] == MAGIC
    assert data[manifest.index_offset :][: len(HIKBTREE_MAGIC)] == HIKBTREE_MAGIC
    assert manifest.layout == "hikvision-shaped-synthetic"
    assert hashlib.sha256(data).hexdigest() == manifest.sha256
    # the fixture never pretends to be a real dump
    assert "not confirmed" in manifest.field_notes["magic"]
    assert b"PHXBLK" in data


def test_index_lists_only_the_recordings_that_were_not_deleted(image):
    path, manifest = image
    listed = read_index(path)
    kept = [r for r in manifest.recordings if not r.deleted]
    deleted = [r for r in manifest.recordings if r.deleted]
    assert deleted, "the fixture must delete at least one recording"
    assert len(listed) == len(kept)
    assert [e["offset"] for e in listed] == [r.offset for r in kept]
    assert {e["channel"] for e in listed} <= {1, 2, 3, 4}
    # the deleted recordings' bytes are still on disk, just unlisted
    data = path.read_bytes()
    for rec in deleted:
        chunk = data[rec.offset : rec.offset + rec.length]
        assert hashlib.sha256(chunk).hexdigest() == rec.sha256
        assert rec.offset not in [e["offset"] for e in listed]


def test_index_entries_carry_channel_and_time(image):
    path, manifest = image
    listed = read_index(path)
    first = listed[0]
    kept = next(r for r in manifest.recordings if not r.deleted)
    assert first["channel"] == kept.channel
    assert first["start_utc"] == kept.start_utc
    assert first["resolution"] == f"{kept.width}x{kept.height}"


def test_image_too_small_is_refused(tmp_path):
    with pytest.raises(ValueError, match="data block"):
        build_hikvision_image(
            tmp_path / "tiny.img", size_bytes=2 * 1024 * 1024, block_size=SMALL_BLOCK
        )


# ---------------------------------------------------------------------------
# Detection
# ---------------------------------------------------------------------------
def test_detection_finds_both_hikvision_markers(image):
    path, _ = image
    report = FormatDetector().detect(path)
    assert report.vendor_info.vendor_name == "Hikvision"
    names = {m.signature_name for m in report.matches}
    assert {"hikvision_master_sector", "hikvision_hikbtree"} <= names
    master = next(
        m for m in report.matches if m.signature_name.endswith("master_sector")
    )
    assert master.at_expected_offset and master.offset == MAGIC_OFFSET
    assert report.confidence == 0.95  # two markers, capped
    assert report.adapter_module == "backend.adapters.hikvision"


def test_hikbtree_signature_is_registered_honestly():
    sig = next(s for s in SIGNATURES if s.name == "hikvision_hikbtree")
    assert sig.verified_on_device is False
    assert "not confirmed" in sig.source_note.lower()
    assert sig.expected_offset is None  # firmware-dependent position


# ---------------------------------------------------------------------------
# Recovery
# ---------------------------------------------------------------------------
def test_carver_recovers_every_recording_including_the_unlisted_ones(image):
    path, manifest = image
    result = GenericNalCarver().carve(path)
    assert [c.sha256 for c in result.fragments] == [
        r.sha256 for r in manifest.recordings
    ]
    # the index knows about fewer recordings than the disk holds
    assert len(read_index(path)) < len(result.fragments)


def test_timeline_groups_the_synthetic_channels(image):
    path, manifest = image
    timeline = build_timeline(GenericNalCarver().carve(path))
    # channels 1 and 2 share an encoder configuration in this fixture, so the
    # carver cannot separate them; 3 and 4 differ and do separate.
    resolutions = {c.resolution for c in timeline.channels}
    assert resolutions == {"1280x720", "704x576"}
    assert 2 <= len(timeline.channels) <= len({r.channel for r in manifest.recordings})
    assert any(c.declared_fps == 25.0 for c in timeline.channels)
    assert any(c.declared_fps is None for c in timeline.channels)


def test_pipeline_runs_end_to_end_on_the_shaped_image(tmp_path):
    src = tmp_path / "hik.img"
    manifest = build_hikvision_image(
        src,
        size_bytes=4 * 1024 * 1024,
        block_size=SMALL_BLOCK,
        recordings=[
            SegmentSpec(frames=40, declared_fps=25.0),
            SegmentSpec(frames=40, deleted=True, declared_fps=25.0),
        ],
        seed=3,
    )
    result = run_pipeline(
        src,
        case_id="CASE-WFS-1",
        operator_id="op-1",
        out_dir=tmp_path / "run",
        encrypt=False,
    )
    assert result.detection.vendor_info.vendor_name == "Hikvision"
    assert result.adapter.fallback is False  # native WFS parser now implemented
    assert result.adapter.module == "backend.adapters.hikvision"
    # Native parser provides fragments directly in evidence
    assert [f.fragment_id.split("-")[-1] for f in result.evidence.fragments] == [
        r.sha256[:8] for r in manifest.recordings if not r.deleted
    ]
    # MP4 wrapping for native parser not yet integrated
