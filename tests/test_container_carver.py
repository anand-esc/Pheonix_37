"""Container carving: whole MP4/AVI files recovered from an image, byte for byte.

The case that matters: somebody copies an ordinary ``.mp4`` onto a drive and
later deletes it. That file keeps its NAL units length-prefixed inside an
``mdat`` box and carries no Annex-B start codes, so the stream carver finds
only coincidences in it. These tests prove both halves of that statement —
that a start-code scan cannot recover such a file, and that the container
pass returns it with a hash identical to the original.
"""

import hashlib
import struct
from pathlib import Path

import pytest

from backend.adapters.generic_carver import GenericNalCarver
from backend.adapters.generic_carver.container import (
    ContainerCarveOptions,
    carve_containers,
)
from backend.adapters.generic_carver.models import CarveOptions
from backend.adapters.generic_carver.mp4 import wrap_annexb
from tests.fixtures.build_fixtures import build_h264_stream


def _real_mp4(frames: int = 30, *, seed: int = 5, fps: float = 25.0) -> bytes:
    """A genuine ISO base media file, built from a synthetic Annex-B stream."""
    annexb = build_h264_stream(frames=frames, seed=seed, declared_fps=fps)
    data, _ = wrap_annexb(annexb, fps=fps)
    return data


def _image_with(payloads: list[bytes], *, gap: int = 8192, lead: int = 4096) -> bytes:
    """Lay files out in an image with zero padding between them."""
    out = bytearray(b"\x00" * lead)
    for payload in payloads:
        out += payload
        out += b"\x00" * gap
    return bytes(out)


@pytest.fixture(scope="module")
def mp4_bytes() -> bytes:
    return _real_mp4()


# ---------------------------------------------------------------------------
# The failure this pass exists to fix
# ---------------------------------------------------------------------------
def test_a_start_code_scan_cannot_recover_an_mp4(tmp_path, mp4_bytes):
    src = tmp_path / "video.mp4"
    src.write_bytes(mp4_bytes)
    digest = hashlib.sha256(mp4_bytes).hexdigest()

    # the file genuinely holds no Annex-B framing
    assert mp4_bytes[4:8] == b"ftyp"
    stream_only = GenericNalCarver(CarveOptions(carve_containers=False)).carve(src)
    assert digest not in {f.sha256 for f in stream_only.fragments}, (
        "a start-code scan must not be credited with recovering an MP4; "
        "if this passes the fixture is not a real container"
    )


def test_the_container_pass_recovers_it_byte_exact(tmp_path, mp4_bytes):
    src = tmp_path / "video.mp4"
    src.write_bytes(mp4_bytes)

    result = GenericNalCarver().carve(src)
    assert len(result.fragments) == 1
    carved = result.fragments[0]
    assert carved.sha256 == hashlib.sha256(mp4_bytes).hexdigest()
    assert carved.length == len(mp4_bytes)
    assert carved.fragment.recovery_method == "container_file_carve"
    assert result.stats.container_files == 1
    # no second fragment was built from bytes this file already accounts for
    ranges = [
        (f.fragment.byte_offset_start, f.fragment.byte_offset_end)
        for f in result.fragments
    ]
    assert ranges == [(0, len(mp4_bytes))]


def test_start_codes_inside_a_recovered_file_are_not_carved_again(tmp_path):
    """An ``mdat`` full of coincidental ``00 00 01`` must not become fragments."""
    mp4 = _real_mp4(12, seed=8)
    # splice a run of start-code-looking bytes into the media payload so the
    # stream scanner has something to find inside the file
    mdat_at = mp4.find(b"mdat")
    assert mdat_at > 0
    bait = b"\x00\x00\x01\x65" + b"\x41" * 400
    doctored = mp4[: mdat_at + 8] + bait + mp4[mdat_at + 8 + len(bait) :]

    src = tmp_path / "disk.img"
    src.write_bytes(_image_with([doctored]))

    stream_only = GenericNalCarver(CarveOptions(carve_containers=False)).carve(src)
    assert stream_only.stats.start_codes_seen > 0, "the bait was not planted"

    result = GenericNalCarver().carve(src)
    assert result.stats.nals_inside_containers > 0
    assert [f.fragment.recovery_method for f in result.fragments] == [
        "container_file_carve"
    ]


# ---------------------------------------------------------------------------
# Recovery from an image, which is the real workflow
# ---------------------------------------------------------------------------
def test_files_are_recovered_from_an_image_that_no_longer_lists_them(tmp_path):
    """The deleted-file story: the bytes are on the disk, nothing points at them."""
    first, second = _real_mp4(24, seed=1), _real_mp4(36, seed=2)
    src = tmp_path / "disk.img"
    src.write_bytes(_image_with([first, second]))

    result = GenericNalCarver().carve(src)
    recovered = {f.sha256 for f in result.fragments}
    assert hashlib.sha256(first).hexdigest() in recovered
    assert hashlib.sha256(second).hexdigest() in recovered
    assert result.stats.container_files == 2

    # offsets point back into the image, so the chain to the disk stays explicit
    for carved in result.fragments:
        start = carved.fragment.byte_offset_start
        end = carved.fragment.byte_offset_end
        assert src.read_bytes()[start:end] == (
            first if carved.sha256 == hashlib.sha256(first).hexdigest() else second
        )


def test_a_recovered_file_reports_what_its_header_declares(tmp_path, mp4_bytes):
    src = tmp_path / "disk.img"
    src.write_bytes(_image_with([mp4_bytes]))

    carved = GenericNalCarver().carve(src).fragments[0]
    info = carved.container
    assert info is not None
    assert info.kind == "mp4"
    assert info.has_index and info.has_media
    assert "ftyp" in info.boxes and "mdat" in info.boxes and "moov" in info.boxes
    assert info.duration_seconds and info.duration_seconds > 0
    assert info.width and info.height
    assert info.codec_name in ("H.264", "H.265")
    # the rationale names the evidence, not just a number
    assert "moov" in carved.fragment.confidence_rationale
    assert "structural" in carved.fragment.confidence_rationale


def test_exported_file_keeps_the_container_extension(tmp_path, mp4_bytes):
    src = tmp_path / "disk.img"
    src.write_bytes(_image_with([mp4_bytes]))
    carver = GenericNalCarver()
    result = carver.carve(src)

    exported = carver.export(src, result, tmp_path / "out")
    assert len(exported) == 1
    written = exported[0].out_path
    assert written.endswith(".mp4")
    # export re-hashes what it wrote and refuses a mismatch, so this is the
    # same guarantee the pipeline relies on
    assert (
        hashlib.sha256(Path(written).read_bytes()).hexdigest()
        == result.fragments[0].sha256
    )


# ---------------------------------------------------------------------------
# Refusing to claim what is not there
# ---------------------------------------------------------------------------
def test_a_header_without_media_is_not_claimed(tmp_path):
    """An ``ftyp`` with no ``mdat`` holds no footage, so it is not an exhibit."""
    header = struct.pack(">I", 24) + b"ftyp" + b"isom" + b"\x00" * 12
    moov = struct.pack(">I", 16) + b"moov" + b"\x00" * 8
    src = tmp_path / "disk.img"
    src.write_bytes(_image_with([header + moov + b"\x00" * 4096]))

    carved, stats = carve_containers(src)
    assert carved == []
    assert stats.rejected >= 1


def test_a_vendor_riff_marker_is_not_mistaken_for_an_avi(tmp_path):
    """The AVI fixture header has no ``movi`` list, so it holds no frames."""
    marker = (
        b"RIFF" + (60000).to_bytes(4, "little") + b"AVI " + b"LIST" + b"\x00" * 60000
    )
    src = tmp_path / "disk.img"
    src.write_bytes(marker)

    carved, _ = carve_containers(src)
    assert carved == []


def test_random_bytes_produce_nothing(tmp_path):
    import random

    rng = random.Random(11)
    src = tmp_path / "noise.img"
    src.write_bytes(rng.randbytes(512 * 1024))
    carved, _ = carve_containers(src)
    assert carved == []


# ---------------------------------------------------------------------------
# Damage is reported, not hidden
# ---------------------------------------------------------------------------
def test_a_truncated_file_is_reported_as_truncated(tmp_path, mp4_bytes):
    # cut the file inside its last box
    src = tmp_path / "disk.img"
    src.write_bytes(b"\x00" * 2048 + mp4_bytes[: len(mp4_bytes) - 5000])

    carved, _ = carve_containers(src)
    assert len(carved) == 1
    info = carved[0].container
    assert info.end_reason == "truncated_box"
    # a damaged exhibit must score below an intact one
    intact = carve_containers_bytes(tmp_path, mp4_bytes)
    assert carved[0].fragment.confidence_score < intact.fragment.confidence_score
    assert "past the end" in carved[0].fragment.confidence_rationale


def carve_containers_bytes(tmp_path, payload: bytes):
    path = tmp_path / f"intact_{len(payload)}.img"
    path.write_bytes(payload)
    return carve_containers(path)[0][0]


def test_a_64_bit_largesize_box_is_read_correctly(tmp_path, mp4_bytes):
    """``size == 1`` puts the real length in the next eight bytes.

    A parser that ignores this mis-reads every file over four gigabytes, so
    the form is exercised here on a small one.
    """
    ftyp_size = struct.unpack(">I", mp4_bytes[:4])[0]
    rest = mp4_bytes[ftyp_size:]
    # rewrite the first box in the 64-bit form: same bytes, longer header
    big_ftyp = (
        struct.pack(">I", 1)
        + b"ftyp"
        + struct.pack(">Q", ftyp_size + 8)
        + mp4_bytes[8:ftyp_size]
    )
    payload = big_ftyp + rest
    src = tmp_path / "disk.img"
    src.write_bytes(_image_with([payload]))

    carved, _ = carve_containers(src)
    assert len(carved) == 1
    assert carved[0].length == len(payload)
    assert carved[0].sha256 == hashlib.sha256(payload).hexdigest()


def test_the_scan_finds_a_header_that_straddles_a_read_boundary(tmp_path, mp4_bytes):
    """Signatures split across two block reads must still be found."""
    block = 64 * 1024
    # place the file so its ftyp box sits two bytes before a block boundary
    lead = block - 2
    src = tmp_path / "disk.img"
    src.write_bytes(b"\x00" * lead + mp4_bytes)

    carved, _ = carve_containers(src, ContainerCarveOptions(block_size=block))
    assert len(carved) == 1
    assert carved[0].sha256 == hashlib.sha256(mp4_bytes).hexdigest()


# ---------------------------------------------------------------------------
# Both passes together
# ---------------------------------------------------------------------------
def test_a_container_and_a_raw_stream_in_one_image_are_both_recovered(tmp_path):
    """A recorder's own stream next to a copied file: two shapes, one image."""
    mp4 = _real_mp4(20, seed=3)
    stream = build_h264_stream(frames=40, seed=4, declared_fps=25.0)
    src = tmp_path / "disk.img"
    src.write_bytes(_image_with([mp4, stream]))

    result = GenericNalCarver().carve(src)
    methods = {f.fragment.recovery_method for f in result.fragments}
    assert methods == {"container_file_carve", "annexb_nal_carve"}
    assert hashlib.sha256(mp4).hexdigest() in {f.sha256 for f in result.fragments}
    assert hashlib.sha256(stream).hexdigest() in {f.sha256 for f in result.fragments}
    # fragments are indexed in image order, whichever pass found them
    offsets = [f.fragment.byte_offset_start for f in result.fragments]
    assert offsets == sorted(offsets)
    assert [f.index for f in result.fragments] == list(range(len(result.fragments)))
