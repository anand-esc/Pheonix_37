"""Deterministic, explainable confidence for carved fragments.

Each rule adds or subtracts a fixed amount and writes one line of rationale.
The same features always give the same score; nothing here is learned.
"""

from __future__ import annotations

from backend.adapters.generic_carver.models import FragmentFeatures

BASE = 0.25
SPS_PARSED = 0.25
SPS_PRESENT_UNPARSED = 0.10
PPS_PRESENT = 0.10
STARTS_WITH_IDR = 0.15
VCL_RATIO = 0.10
END_DELTAS = {
    "eos": 0.10,
    "new_sequence": 0.05,
    "zero_filler": 0.05,
    "end_of_data": -0.05,
    "oversized_nal_gap": -0.10,
    "invalid_nal": -0.10,
    "truncated_nal": -0.10,
}
FLOOR, CEILING = 0.05, 0.95


def score(features: FragmentFeatures) -> tuple[float, str]:
    total = BASE
    lines = [f"base {BASE:.2f}: contiguous run of valid Annex-B NAL units"]

    if features.sps_parsed:
        total += SPS_PARSED
        lines.append(f"+{SPS_PARSED:.2f}: SPS parsed, resolution and profile known")
    elif features.has_sps:
        total += SPS_PRESENT_UNPARSED
        lines.append(f"+{SPS_PRESENT_UNPARSED:.2f}: SPS present but not parseable")
    else:
        lines.append("+0.00: no SPS, stream parameters unknown")

    if features.has_pps:
        total += PPS_PRESENT
        lines.append(f"+{PPS_PRESENT:.2f}: PPS present")

    if features.first_vcl_is_idr:
        total += STARTS_WITH_IDR
        lines.append(
            f"+{STARTS_WITH_IDR:.2f}: first picture is an IDR/IRAP (decodable start)"
        )
    else:
        lines.append(
            "+0.00: first picture is not a key frame; leading frames may not decode"
        )

    if features.nal_count and features.vcl_count >= 2:
        ratio = features.vcl_count / features.nal_count
        if ratio >= 0.5:
            total += VCL_RATIO
            lines.append(
                f"+{VCL_RATIO:.2f}: {features.vcl_count}/{features.nal_count} NALs "
                "carry picture data"
            )
        else:
            lines.append(
                f"+0.00: only {features.vcl_count}/{features.nal_count} NALs carry "
                "picture data"
            )

    delta = END_DELTAS.get(features.end_reason, 0.0)
    total += delta
    lines.append(f"{delta:+.2f}: ended by {features.end_reason.replace('_', ' ')}")

    total = max(FLOOR, min(CEILING, round(total, 3)))
    lines.append(f"= {total:.2f}")
    return total, "; ".join(lines)
