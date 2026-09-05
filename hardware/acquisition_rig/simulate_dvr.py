"""Simulate a DVR hard disk as a raw image file.

The physical rig (see README.md) images a real DVR disk through a write
blocker. When no disk is on the bench, this script produces a stand-in that
has the same shape: a vendor header block, an index that lists only the
recordings the DVR still "knows about", several block-aligned H.264
recordings (some deleted from the index, one cut short by overwrite), zero
filler, and a region of random noise. The manifest next to the image lists
every recording with its SHA-256 so recovery can be checked byte for byte.

    python hardware/acquisition_rig/simulate_dvr.py                 # 128 MiB, hikvision
    python hardware/acquisition_rig/simulate_dvr.py --size 512M --vendor dahua
    python hardware/acquisition_rig/simulate_dvr.py --out /mnt/usb --name disk.img
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from tests.fixtures.build_fixtures import (
    VENDOR_VARIANTS,
    SegmentSpec,
    build_dvr_image,
)

DEFAULT_OUT = Path(__file__).resolve().parent / "out"
DEFAULT_SIZE = 128 * 1024 * 1024


def _parse_size(text: str) -> int:
    units = {"K": 1024, "M": 1024**2, "G": 1024**3}
    if text and text[-1].upper() in units:
        return int(float(text[:-1]) * units[text[-1].upper()])
    return int(text)


def default_segments(size_bytes: int) -> list[SegmentSpec]:
    """A recorder-like mix: 4 channels, a few deletions, one overwritten tail."""
    # ~0.6 MiB per 300 frames; scale the count with the image size, capped.
    per_segment = 300
    count = max(4, min(24, size_bytes // (6 * 1024 * 1024)))
    specs: list[SegmentSpec] = []
    for i in range(count):
        width, height = (1280, 720) if i % 4 in (0, 1) else (704, 576)
        # Mixed on purpose: most recorders write VUI timing, some do not, and
        # the timeline has to be honest about which durations are estimates.
        declared_fps = {0: 25.0, 1: 25.0, 2: 12.5, 3: None}[i % 4]
        specs.append(
            SegmentSpec(
                frames=per_segment,
                width=width,
                height=height,
                declared_fps=declared_fps,
                deleted=i % 5 == 2,  # every fifth recording was "deleted"
                truncate_bytes=200_000 if i == count - 1 else None,
                with_eos=i % 7 != 3,  # some recordings end without EOS
            )
        )
    return specs


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT, help="output directory")
    ap.add_argument("--name", default="dvr_image.img")
    ap.add_argument("--size", type=_parse_size, default=DEFAULT_SIZE, help="e.g. 128M")
    ap.add_argument("--seed", type=int, default=2026)
    ap.add_argument("--vendor", choices=VENDOR_VARIANTS, default="hikvision")
    args = ap.parse_args(argv)

    args.out.mkdir(parents=True, exist_ok=True)
    target = args.out / args.name
    t0 = time.perf_counter()
    manifest = build_dvr_image(
        target,
        size_bytes=args.size,
        seed=args.seed,
        vendor_variant=args.vendor,
        segments=default_segments(args.size),
        block_size=256 * 1024,
        noise_bytes=1024 * 1024,
    )
    dt = time.perf_counter() - t0

    deleted = sum(1 for s in manifest.segments if s.deleted)
    truncated = sum(1 for s in manifest.segments if s.truncated)
    print(f"image     : {target} ({args.size / 1024 / 1024:.0f} MiB, {dt:.1f}s)")
    print(f"sha256    : {manifest.sha256}")
    print(f"vendor    : {args.vendor}")
    print(
        f"segments  : {len(manifest.segments)} "
        f"({deleted} deleted from index, {truncated} truncated)"
    )
    print(f"manifest  : {target}.manifest.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
