"""Build the SIH demonstration case end to end, with nothing left to type.

What it produces
----------------
A recorder-style disk image holding several video files. Some are listed in
the volume's index; the rest are not, which is what a recorder leaves behind
when a recording is deleted or the ring buffer wraps. The carver never reads
that index — it recovers every file from the raw blocks — so the ones nothing
points at come back exactly like the ones that are listed.

The whole acquisition pipeline is then run against that image under the case
id ``CASE2026NTRO``, and every recovered file is checked byte for byte
against the original that went in. The run directory it writes is the same
one the desktop client reads, so the case is on the dashboard the moment this
finishes.

Where the videos come from
--------------------------
``--videos DIR``   use the files already on disk (mp4, avi, h264, h265)
``--download``     fetch a few small public sample clips
(neither)          synthesise recordings; always works offline

Typical use::

    python demo/build_demo_case.py --download
    python demo/build_demo_case.py --videos D:\\evidence\\clips
    python demo/build_demo_case.py --keep-image   # leave the .img on disk
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import struct
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend.pipeline.runner import run_pipeline

CASE_ID = "CASE2026NTRO"
CASE_NAME = "NTRO DVR recovery demonstration"
OPERATOR_ID = "investigator-01"
INVESTIGATOR_ID = "inv-ntro-01"
CUSTODIAN_ID = "cus-malkhana-01"

BLOCK_SIZE = 64 * 1024
INDEX_OFFSET = 0x1000  # the volume index lives near the front of the disk
INDEX_MAGIC = b"PHXVOLIDX"
DATA_START = 0x40000  # first data block, well clear of the index
VIDEO_SUFFIXES = (".mp4", ".mov", ".m4v", ".avi", ".h264", ".h265", ".264", ".265")

# Small, public, freely downloadable sample clips. Each is a real MP4, which
# is the point: the container pass has to handle files it did not create.
SAMPLE_URLS = [
    "https://download.samplelib.com/mp4/sample-5s.mp4",
    "https://download.samplelib.com/mp4/sample-10s.mp4",
    "https://download.samplelib.com/mp4/sample-15s.mp4",
]


@dataclass
class Recording:
    """One video as it was written into the image."""

    name: str
    data: bytes = field(repr=False)
    offset: int = 0
    listed: bool = True  # False = deleted: present on disk, absent from the index
    channel: int = 1
    started_utc: str = ""

    @property
    def length(self) -> int:
        return len(self.data)

    @property
    def sha256(self) -> str:
        return hashlib.sha256(self.data).hexdigest()


# ---------------------------------------------------------------------------
# Sourcing the videos
# ---------------------------------------------------------------------------
def _download(url: str, timeout: int = 60) -> bytes | None:
    try:
        request = urllib.request.Request(url, headers={"User-Agent": "phoenix-demo"})
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.read()
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        print(f"  ! {url}: {exc}")
        return None


def _synthesise(count: int) -> list[tuple[str, bytes]]:
    """Build real MP4 files locally, so the demo never depends on a network."""
    from backend.adapters.generic_carver.mp4 import wrap_annexb
    from tests.fixtures.build_fixtures import build_h264_stream

    shapes = [
        (40, 704, 576, 25.0),
        (60, 1280, 720, 25.0),
        (30, 1280, 720, None),
        (50, 704, 576, 15.0),
    ]
    out: list[tuple[str, bytes]] = []
    for index in range(count):
        frames, width, height, fps = shapes[index % len(shapes)]
        stream = build_h264_stream(
            frames=frames,
            width=width,
            height=height,
            seed=2026 + index,
            declared_fps=fps,
        )
        data, _ = wrap_annexb(stream, fps=fps or 25.0)
        out.append((f"synthetic_ch{index + 1:02d}.mp4", data))
    return out


def gather_videos(args) -> list[tuple[str, bytes]]:
    if args.videos:
        folder = Path(args.videos)
        if not folder.is_dir():
            raise SystemExit(f"--videos is not a directory: {folder}")
        found = sorted(
            p
            for p in folder.iterdir()
            if p.is_file() and p.suffix.lower() in VIDEO_SUFFIXES
        )
        if not found:
            raise SystemExit(
                f"no video files in {folder} (looked for {', '.join(VIDEO_SUFFIXES)})"
            )
        print(f"Using {len(found)} file(s) from {folder}")
        return [(p.name, p.read_bytes()) for p in found[: args.count]]

    if args.download:
        print("Downloading sample clips...")
        out: list[tuple[str, bytes]] = []
        for url in SAMPLE_URLS[: args.count]:
            blob = _download(url)
            if blob:
                name = url.rsplit("/", 1)[-1]
                print(f"  {name}: {len(blob):,} bytes")
                out.append((name, blob))
        if out:
            return out
        print("  download failed; falling back to synthesised recordings")

    print(f"Synthesising {args.count} recordings")
    return _synthesise(args.count)


# ---------------------------------------------------------------------------
# Laying the image out
# ---------------------------------------------------------------------------
def _align(value: int, block: int = BLOCK_SIZE) -> int:
    return ((value + block - 1) // block) * block


def build_image(
    videos: list[tuple[str, bytes]], target: Path, *, delete_every: int = 2
):
    """Write a recorder-style volume: an index, then the recordings.

    Every second recording is left out of the index. Its bytes are still on
    the disk, exactly as a recorder leaves them until they are overwritten.
    """
    base = datetime(2026, 2, 14, 21, 5, 0, tzinfo=UTC)
    recordings: list[Recording] = []
    cursor = DATA_START
    for index, (name, data) in enumerate(videos):
        recordings.append(
            Recording(
                name=name,
                data=data,
                offset=cursor,
                listed=index % delete_every != 1,
                channel=(index % 4) + 1,
                started_utc=(base + timedelta(minutes=17 * index)).isoformat(),
            )
        )
        # leave a gap so recordings are not adjacent, as on a real volume
        cursor = _align(cursor + len(data) + BLOCK_SIZE)

    total = _align(cursor + BLOCK_SIZE)
    image = bytearray(total)

    # a volume index that lists only the recordings that were not deleted
    listed = [r for r in recordings if r.listed]
    index_blob = bytearray(INDEX_MAGIC)
    index_blob += struct.pack("<I", len(listed))
    for rec in listed:
        name_bytes = rec.name.encode("utf-8")[:64].ljust(64, b"\x00")
        index_blob += name_bytes
        index_blob += struct.pack("<QQB", rec.offset, rec.length, rec.channel)
        index_blob += rec.started_utc.encode("ascii")[:32].ljust(32, b"\x00")
    image[INDEX_OFFSET : INDEX_OFFSET + len(index_blob)] = index_blob

    for rec in recordings:
        image[rec.offset : rec.offset + rec.length] = rec.data

    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(bytes(image))
    return recordings, total


def read_index(image_path: Path) -> list[dict]:
    """Read back the volume index, so the demo can show what it does not list."""
    data = image_path.read_bytes()
    if data[INDEX_OFFSET : INDEX_OFFSET + len(INDEX_MAGIC)] != INDEX_MAGIC:
        return []
    pos = INDEX_OFFSET + len(INDEX_MAGIC)
    count = struct.unpack("<I", data[pos : pos + 4])[0]
    pos += 4
    entries = []
    for _ in range(count):
        name = data[pos : pos + 64].rstrip(b"\x00").decode("utf-8", "replace")
        pos += 64
        offset, length, channel = struct.unpack("<QQB", data[pos : pos + 17])
        pos += 17
        started = data[pos : pos + 32].rstrip(b"\x00").decode("ascii", "replace")
        pos += 32
        entries.append(
            {
                "name": name,
                "offset": offset,
                "length": length,
                "channel": channel,
                "started_utc": started,
            }
        )
    return entries


# ---------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------
def _row(cells: list[str], widths: list[int]) -> str:
    return "  ".join(text.ljust(width) for text, width in zip(cells, widths)).rstrip()


def print_verification(recordings: list[Recording], result) -> bool:
    recovered = {f.sha256: f for f in (result.carve.fragments if result.carve else [])}
    widths = [26, 10, 9, 12, 10]
    print()
    print(_row(["RECORDING", "BYTES", "IN INDEX", "RECOVERED", "BYTE-EXACT"], widths))
    print("-" * (sum(widths) + 2 * (len(widths) - 1)))
    all_ok = True
    for rec in recordings:
        hit = recovered.get(rec.sha256)
        ok = hit is not None
        all_ok = all_ok and ok
        print(
            _row(
                [
                    rec.name[:26],
                    f"{rec.length:,}",
                    "yes" if rec.listed else "NO",
                    f"#{hit.index}" if hit else "-",
                    "YES" if ok else "NO",
                ],
                widths,
            )
        )
    return all_ok


def write_case_meta(
    case_dir: Path, image_path: Path, recordings: list[Recording]
) -> None:
    """The stub the dashboard reads for the case name and examiner."""
    deleted = sum(1 for r in recordings if not r.listed)
    case_dir.mkdir(parents=True, exist_ok=True)
    (case_dir / "case_meta.json").write_text(
        json.dumps(
            {
                "case_id": CASE_ID,
                "name": CASE_NAME,
                "examiner": INVESTIGATOR_ID,
                "created_by": OPERATOR_ID,
                "created_at": datetime.now(UTC).isoformat(),
                "status": "Intake",
                "demo": True,
                "demo_source_image": str(image_path),
                "demo_recordings": len(recordings),
                "demo_unlisted_recordings": deleted,
            },
            indent=2,
        ),
        encoding="utf-8",
    )


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--videos", help="directory of real video files to embed")
    parser.add_argument("--download", action="store_true", help="fetch sample clips")
    parser.add_argument("--count", type=int, default=4, help="how many recordings")
    parser.add_argument("--case-id", default=CASE_ID)
    parser.add_argument(
        "--image",
        type=Path,
        default=PROJECT_ROOT / "demo" / "out" / "ntro_dvr_volume.img",
        help="where to write the disk image",
    )
    parser.add_argument(
        "--keep-image",
        action="store_true",
        help="keep the image after the run (default: keep)",
    )
    parser.add_argument("--no-encrypt", action="store_true", help="skip the vault")
    args = parser.parse_args(argv)

    os.environ.setdefault("PHOENIX_DEMO_MODE", "1")
    os.chdir(PROJECT_ROOT)  # case_store is resolved relative to the repo root

    print("=" * 74)
    print(f"  Phoenix demonstration case: {args.case_id}")
    print("=" * 74)

    videos = gather_videos(args)
    if not videos:
        raise SystemExit("no source videos")

    print(f"\nBuilding recorder volume at {args.image}")
    recordings, total = build_image(videos, args.image)
    unlisted = [r for r in recordings if not r.listed]
    print(f"  image size          : {total:,} bytes")
    print(f"  recordings written  : {len(recordings)}")
    print(f"  listed in the index : {len(recordings) - len(unlisted)}")
    print(
        f"  deleted (unlisted)  : {len(unlisted)}  <- nothing on disk points at these"
    )
    for entry in read_index(args.image):
        print(
            f"    index entry: {entry['name']}  @0x{entry['offset']:x}  ch{entry['channel']}"
        )

    case_dir = PROJECT_ROOT / "case_store" / args.case_id
    write_case_meta(case_dir, args.image, recordings)

    print(f"\nRunning the pipeline (case {args.case_id})")
    started = time.perf_counter()
    result = run_pipeline(
        args.image,
        case_id=args.case_id,
        operator_id=OPERATOR_ID,
        investigator_id=INVESTIGATOR_ID,
        custodian_id=CUSTODIAN_ID,
        out_dir=case_dir / "run",
        device_info=f"demonstration recorder volume ({len(recordings)} recordings)",
        encrypt=not args.no_encrypt,
    )
    elapsed = time.perf_counter() - started

    summary = result.summary()
    print(f"  finished in {elapsed:.1f}s")
    print(f"  image sha256      : {summary['image_sha256']}")
    print(f"  vendor detected   : {summary['vendor']} ({summary['validation_status']})")
    print(f"  adapter           : {summary['adapter']}")
    print(f"  fragments         : {summary['fragments']}")
    print(f"  exported files    : {summary['exported']}")
    print(f"  playable views    : {summary['playable']}")
    print(f"  encrypted vault   : {summary['encrypted']} artefact(s)")
    if result.carve:
        print(f"  container files   : {result.carve.stats.container_files}")

    ok = print_verification(recordings, result)

    print(f"\nRun directory: {case_dir / 'run'}")
    print("  fragments/   recovered files, byte for byte")
    print("  playable/    what the viewer streams")
    print("  vault/       AES-256-GCM, plaintext hashed first")
    print("  custody_facts.json / pipeline_result.json / run_transcript.json")

    if ok:
        print(
            f"\nAll {len(recordings)} recordings recovered byte-exact, "
            f"including the {len(unlisted)} the index does not list."
        )
    else:
        print("\nSome recordings were NOT recovered byte-exact; see the table above.")

    print(
        f"\nOpen the desktop client and the case is on the dashboard as {args.case_id}."
    )
    if not args.keep_image:
        print(f"The source image is kept at {args.image} so the run can be repeated.")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
