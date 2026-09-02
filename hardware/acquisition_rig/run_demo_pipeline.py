"""Run the acquisition-side pipeline on a disk image and print a summary.

    python hardware/acquisition_rig/run_demo_pipeline.py                # uses out/dvr_image.img
    python hardware/acquisition_rig/run_demo_pipeline.py --source /dev/sdb --case CASE-042
    python hardware/acquisition_rig/run_demo_pipeline.py --fallback     # replay committed transcript

Live mode images the source (read-only), detects the format, carves and
exports fragments, hashes them and encrypts them into a vault directory,
writing ``pipeline_result.json`` and ``run_transcript.json`` under ``--out``.
Fallback mode prints the committed transcript from a previous successful run
so the demo can continue if the bench hardware misbehaves.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend.acquisition.exceptions import AcquisitionError
from backend.pipeline.events import InMemoryEventSink
from backend.pipeline.runner import PipelineError, run_pipeline

HERE = Path(__file__).resolve().parent
DEFAULT_SOURCE = HERE / "out" / "dvr_image.img"
DEFAULT_OUT = HERE / "out" / "run"
FALLBACK_TRANSCRIPT = HERE / "fallback_run" / "run_transcript.json"


def _print_transcript(transcript: dict) -> None:
    s = transcript["summary"]
    print("=" * 72)
    print(f"case {s['case_id']}   evidence {s['evidence_id']}")
    print(f"image sha256 : {s['image_sha256']}")
    print(f"image md5    : {s['image_md5']}")
    print(
        f"vendor       : {s['vendor']} [{s['validation_status']}] "
        f"confidence {s['detection_confidence']:.2f}"
    )
    print(f"adapter      : {s['adapter']} (fallback={s['fallback']})")
    print(
        f"fragments    : {s['fragments']} carved, {s['exported']} exported, "
        f"{s['encrypted']} encrypted"
    )
    print(f"events       : {s['events']} in {s['seconds']:.2f}s")
    print("-" * 72)
    for line in transcript["detection_rationale"]:
        print(f"  detect: {line}")
    print("-" * 72)
    for f in transcript["fragments"]:
        print(
            f"  #{f['index']:02d} 0x{f['byte_offset_start']:09x}-0x{f['byte_offset_end']:09x} "
            f"{f['codec_info']}  conf {f['confidence_score']:.2f}"
        )
    print("-" * 72)
    for t in transcript["timings"]:
        print(f"  {t['stage']:<11} {t['seconds']:7.2f}s")
    print("=" * 72)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    ap.add_argument("--case", default="CASE-DEMO-001")
    ap.add_argument("--operator", default="op-demo")
    ap.add_argument("--device-info", default="")
    ap.add_argument("--no-encrypt", action="store_true")
    ap.add_argument(
        "--fallback", action="store_true", help="replay committed transcript"
    )
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args(argv)

    if args.fallback:
        transcript = json.loads(FALLBACK_TRANSCRIPT.read_text(encoding="utf-8"))
        print(f"[fallback] replaying {FALLBACK_TRANSCRIPT}")
        _print_transcript(transcript)
        return 0

    if not args.source.exists():
        print(f"source not found: {args.source}", file=sys.stderr)
        print(
            "run simulate_dvr.py first, or pass --source / --fallback", file=sys.stderr
        )
        return 2

    sink = InMemoryEventSink()
    if not args.quiet:
        sink.subscribe(
            lambda e: print(
                f"  event {e.event_type:<21} {e.stage:<10} {_brief(e.payload)}"
            )
        )
    try:
        run_pipeline(
            args.source,
            case_id=args.case,
            operator_id=args.operator,
            out_dir=args.out,
            sink=sink,
            device_info=args.device_info,
            encrypt=not args.no_encrypt,
        )
    except (AcquisitionError, PipelineError) as exc:
        print(f"pipeline failed: {exc}", file=sys.stderr)
        print(f"use --fallback to replay {FALLBACK_TRANSCRIPT}", file=sys.stderr)
        return 1

    transcript = json.loads(
        (args.out / "run_transcript.json").read_text(encoding="utf-8")
    )
    _print_transcript(transcript)
    print(f"result     : {args.out / 'pipeline_result.json'}")
    print(f"transcript : {args.out / 'run_transcript.json'}")
    return 0


def _brief(payload: dict) -> str:
    keep = (
        "sha256",
        "vendor",
        "confidence",
        "adapter",
        "fragment_count",
        "index",
        "reason",
    )
    parts = [f"{k}={payload[k]}" for k in keep if k in payload]
    return " ".join(parts)[:100]


if __name__ == "__main__":
    raise SystemExit(main())
