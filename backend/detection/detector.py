"""Signature-based format detector with explainable confidence.

The detector never decodes video. It reads a head window and a fixed number
of evenly spaced sample windows, looks for registered byte signatures, counts
Annex-B NAL start codes, and applies a short list of published rules (see
docs/format_signatures.md) to arrive at a vendor, a validation status and a
confidence with a written rationale.

Scanning cost is bounded by ``head_bytes + sample_windows * window_bytes``
regardless of image size, so a 2 TB disk image costs the same as a 3 MB one.
"""

from __future__ import annotations

import importlib
import logging
from pathlib import Path
from typing import BinaryIO

from backend.core.evidence_model import ValidationStatus, VendorInfo
from backend.core.interfaces import BaseAdapter
from backend.detection.models import (
    AdapterResolution,
    DetectionReport,
    NalStats,
    SignatureMatch,
)
from backend.detection.signatures import (
    ADAPTER_FOR_VENDOR,
    ANYWHERE_FACTOR,
    CODEC_ONLY_BASE,
    CODEC_ONLY_SPAN,
    CODEC_SIGNATURE,
    CODEC_VENDOR,
    CONFLICT_PENALTY,
    CONFLICT_THRESHOLD,
    CORROBORATION_BONUS,
    GENERIC_ADAPTER,
    RESEARCH_TARGETS,
    SIGNATURES,
    UNKNOWN_SIGNATURE,
    UNKNOWN_VENDOR,
    VENDOR_CAP,
    Signature,
    SignatureKind,
    status_for_vendor,
)
from backend.pipeline.events import EventSink, emit

logger = logging.getLogger("phoenix.detection")

DEFAULT_HEAD_BYTES = 1024 * 1024
DEFAULT_SAMPLE_WINDOWS = 32
DEFAULT_WINDOW_BYTES = 64 * 1024

CODEC_ONLY_CAP = 0.80
WEAK_HINT_THRESHOLD = 0.30  # vendor scores below this are hints, not decisions
CORROBORATION_DENSITY = 0.5

START_CODE = b"\x00\x00\x01"
# H.264 (ITU-T H.264 table 7-1) NAL types a recorder can legitimately emit.
H264_TYPES = frozenset(range(1, 13))
H264_REF_REQUIRED = frozenset({5, 7, 8})  # IDR, SPS, PPS must have nal_ref_idc != 0
H264_REF_FORBIDDEN = frozenset({6, 9, 10, 11, 12})  # SEI, AUD, EOS, EOB, filler
# H.265 (ITU-T H.265 table 7-1): VCL 0-9 and 16-21, parameter sets/SEI 32-40.
H265_TYPES = frozenset(range(10)) | frozenset(range(16, 22)) | frozenset(range(32, 41))
H265_PARAMETER_SETS = frozenset({32, 33, 34})


class FormatDetector:
    def __init__(
        self,
        *,
        signatures: tuple[Signature, ...] = SIGNATURES,
        head_bytes: int = DEFAULT_HEAD_BYTES,
        sample_windows: int = DEFAULT_SAMPLE_WINDOWS,
        window_bytes: int = DEFAULT_WINDOW_BYTES,
    ) -> None:
        self.signatures = signatures
        self.head_bytes = head_bytes
        self.sample_windows = max(1, sample_windows)
        self.window_bytes = window_bytes

    # ------------------------------------------------------------------ public
    def detect(
        self,
        source_path: str | Path,
        *,
        case_id: str | None = None,
        evidence_id: str | None = None,
        sink: EventSink | None = None,
    ) -> DetectionReport:
        path = Path(source_path)
        if not path.is_file():
            raise FileNotFoundError(f"Detection source is not a file: {path}")
        size = path.stat().st_size

        with open(path, "rb") as fh:
            head = fh.read(self.head_bytes)
            windows = self._sample(fh, size)

        matches = self._scan_signatures(head, windows)
        nal = self._nal_stats(windows)
        vendor, signature, status, confidence, rationale = self._decide(
            matches, nal, size
        )
        module, cls = ADAPTER_FOR_VENDOR.get(vendor, GENERIC_ADAPTER)

        report = DetectionReport(
            source_path=str(path),
            file_size=size,
            vendor_info=VendorInfo(
                vendor_name=vendor,
                detected_format_signature=signature,
                validation_status=status,
            ),
            matches=matches,
            nal_stats=nal,
            confidence=round(confidence, 3),
            rationale=rationale,
            adapter_module=module,
            adapter_class=cls,
            scan_bytes=len(head) + sum(len(w) for _, w in windows),
        )
        logger.info(
            "detected %s as %s (%s, confidence %.2f)",
            path,
            vendor,
            status.value,
            report.confidence,
        )
        if sink is not None and case_id is not None:
            emit(
                sink,
                "format_detected",
                case_id,
                stage="detection",
                evidence_id=evidence_id,
                source=str(path),
                **report.summary(),
            )
        return report

    # ---------------------------------------------------------------- sampling
    def _sample(self, fh: BinaryIO, size: int) -> list[tuple[int, bytes]]:
        """Return ``(offset, bytes)`` windows spread evenly over the file."""
        if size == 0:
            return []
        w = self.window_bytes
        n = self.sample_windows
        if size <= n * w:
            fh.seek(0)
            data = fh.read(size)
            return [(off, data[off : off + w]) for off in range(0, size, w)]
        span = size - w
        offsets = sorted({round(i * span / (n - 1)) for i in range(n)})
        out = []
        for off in offsets:
            fh.seek(off)
            out.append((off, fh.read(w)))
        return out

    # -------------------------------------------------------------- signatures
    def _scan_signatures(
        self, head: bytes, windows: list[tuple[int, bytes]]
    ) -> list[SignatureMatch]:
        matches: list[SignatureMatch] = []
        for sig in self.signatures:
            offsets: set[int] = set()
            exp = sig.expected_offset
            if exp is not None and head[exp : exp + len(sig.pattern)] == sig.pattern:
                offsets.add(exp)
            # Proprietary markers are meaningful anywhere; container magics
            # only count at their defined offset.
            if sig.kind is SignatureKind.VENDOR or exp is None:
                offsets.update(_find_all(sig.pattern, head, 0))
                for base, buf in windows:
                    offsets.update(_find_all(sig.pattern, buf, base))
            if not offsets:
                continue
            at_expected = exp is not None and exp in offsets
            weight = sig.weight if at_expected else sig.weight * ANYWHERE_FACTOR
            matches.append(
                SignatureMatch(
                    signature_name=sig.name,
                    vendor=sig.vendor,
                    kind=sig.kind.value,
                    offset=min(offsets),
                    at_expected_offset=at_expected,
                    occurrences=len(offsets),
                    effective_weight=round(weight, 3),
                )
            )
        return matches

    # -------------------------------------------------------------------- NALs
    def _nal_stats(self, windows: list[tuple[int, bytes]]) -> NalStats:
        with_nals = 0
        total_valid = 0
        v264 = v265 = 0
        ok264_total = ok265_total = 0
        for _, buf in windows:
            valid, ok264, ok265, votes264, votes265 = _scan_nals(buf)
            total_valid += valid
            ok264_total += ok264
            ok265_total += ok265
            v264 += votes264
            v265 += votes265
            if valid:
                with_nals += 1
        n = len(windows)
        density = with_nals / n if n else 0.0
        if total_valid == 0:
            guess = "none"
        elif v265 > v264:
            guess = "h265"
        elif v264 > v265:
            guess = "h264"
        else:
            guess = "h264" if ok264_total >= ok265_total else "h265"
        return NalStats(
            windows_sampled=n,
            windows_with_nals=with_nals,
            start_codes=total_valid,
            h264_votes=v264,
            h265_votes=v265,
            density=round(density, 3),
            codec_guess=guess,
        )

    # ---------------------------------------------------------------- decision
    def _decide(
        self, matches: list[SignatureMatch], nal: NalStats, size: int
    ) -> tuple[str, str, ValidationStatus, float, list[str]]:
        rationale: list[str] = []
        if size == 0:
            rationale.append("empty source: nothing to detect")
            return _unknown(rationale)

        scores: dict[str, float] = {}
        for m in matches:
            scores[m.vendor] = min(
                VENDOR_CAP, scores.get(m.vendor, 0.0) + m.effective_weight
            )
        ranked = sorted(scores.items(), key=lambda kv: (-kv[1], kv[0]))

        for vendor, score in ranked:
            names = ", ".join(
                f"{m.signature_name}@0x{m.offset:x}"
                + ("" if m.at_expected_offset else " (unexpected offset)")
                + (f" x{m.occurrences}" if m.occurrences > 1 else "")
                for m in matches
                if m.vendor == vendor
            )
            rationale.append(f"{vendor}: {names}; summed weight {score:.2f}")

        rationale.append(
            f"NAL scan: {nal.windows_with_nals}/{nal.windows_sampled} windows contain "
            f"valid Annex-B start codes (density {nal.density:.2f}), "
            f"codec guess {nal.codec_guess} (h264 votes {nal.h264_votes}, "
            f"h265 votes {nal.h265_votes})"
        )

        strong = [(v, s) for v, s in ranked if s >= WEAK_HINT_THRESHOLD]
        if strong:
            vendor, score = strong[0]
            confidence = score
            proprietary = [
                v
                for v, s in strong
                if s >= CONFLICT_THRESHOLD
                and any(
                    m.vendor == v and m.kind == SignatureKind.VENDOR.value
                    for m in matches
                )
            ]
            if len(proprietary) >= 2:
                confidence -= CONFLICT_PENALTY
                rationale.append(
                    f"conflict: proprietary signatures for {', '.join(proprietary)} "
                    f"both scored >= {CONFLICT_THRESHOLD:.2f}; picking the highest "
                    f"({vendor}) with a {CONFLICT_PENALTY:.2f} penalty"
                )
            if nal.density >= CORROBORATION_DENSITY:
                confidence = min(VENDOR_CAP, confidence + CORROBORATION_BONUS)
                rationale.append(
                    f"NAL density >= {CORROBORATION_DENSITY:.2f} corroborates "
                    f"recorded video: +{CORROBORATION_BONUS:.2f}"
                )
            best = max(
                (m for m in matches if m.vendor == vendor),
                key=lambda m: m.effective_weight,
            )
            signature = f"{best.signature_name}@0x{best.offset:x}"
            status = status_for_vendor(vendor)
            if vendor == "Dahua":
                rationale.append("OEM note: " + RESEARCH_TARGETS["CP Plus"])
            rationale.append(
                f"decision: {vendor} ({status.value}), confidence {confidence:.2f}"
            )
            return vendor, signature, status, max(0.0, confidence), rationale

        if ranked:
            rationale.append(
                "vendor hints below "
                f"{WEAK_HINT_THRESHOLD:.2f} are recorded but not decisive"
            )

        if nal.codec_guess != "none" and nal.density > 0:
            confidence = min(
                CODEC_ONLY_CAP, CODEC_ONLY_BASE + CODEC_ONLY_SPAN * nal.density
            )
            rationale.append(
                f"no decisive signature; bare {nal.codec_guess} elementary stream "
                f"scored {CODEC_ONLY_BASE:.2f} + {CODEC_ONLY_SPAN:.2f} x density"
            )
            rationale.append(
                f"decision: {CODEC_VENDOR} ({ValidationStatus.GENERIC_FALLBACK.value}), "
                f"confidence {confidence:.2f}"
            )
            return (
                CODEC_VENDOR,
                CODEC_SIGNATURE[nal.codec_guess],
                ValidationStatus.GENERIC_FALLBACK,
                confidence,
                rationale,
            )

        rationale.append("no signature and no NAL start codes found")
        return _unknown(rationale)


# ---------------------------------------------------------------------------
# Adapter resolution
# ---------------------------------------------------------------------------
def resolve_adapter(
    report: DetectionReport,
    *,
    case_id: str | None = None,
    evidence_id: str | None = None,
    sink: EventSink | None = None,
    adapter_map: dict[str, tuple[str, str]] | None = None,
    generic: tuple[str, str] | None = None,
    probe: bool = True,
) -> AdapterResolution:
    """Load the adapter for ``report`` lazily; fall back to the generic carver.

    Vendor adapters are owned by other branches and may not be importable
    here. That is a normal, reported condition, not an error. When ``probe``
    is set, a loaded vendor adapter is asked ``detect(source)`` first: a stub
    that raises ``NotImplementedError``, an adapter that raises anything else,
    or one that declines the source all route to the generic carver.
    """
    generic = generic or GENERIC_ADAPTER
    table = adapter_map if adapter_map is not None else ADAPTER_FOR_VENDOR
    module, cls = table.get(report.vendor_info.vendor_name, generic)

    adapter, err = _load_adapter(module, cls)
    if adapter is not None and probe and (module, cls) != generic:
        probe_err = _probe_adapter(adapter, report.source_path)
        if probe_err is not None:
            adapter, err = None, probe_err
    if adapter is not None:
        fallback = report.vendor_info.vendor_name not in table
        resolution = AdapterResolution(
            requested_module=module,
            requested_class=cls,
            resolved_module=module,
            resolved_class=cls,
            fallback=fallback,
            available=True,
            reason="generic carver selected by detection"
            if fallback
            else "vendor adapter loaded",
            adapter=adapter,
        )
    else:
        gmod, gcls = generic
        g_adapter, g_err = (
            (None, err) if (module, cls) == generic else _load_adapter(gmod, gcls)
        )
        resolution = AdapterResolution(
            requested_module=module,
            requested_class=cls,
            resolved_module=gmod,
            resolved_class=gcls,
            fallback=True,
            available=g_adapter is not None,
            reason=(
                f"{module}.{cls} unavailable ({err}); using generic carver"
                if g_adapter is not None
                else f"{module}.{cls} unavailable ({err}); generic carver also "
                f"unavailable ({g_err})"
            ),
            adapter=g_adapter,
        )

    logger.info("adapter resolution: %s", resolution.reason)
    if sink is not None and case_id is not None:
        emit(
            sink,
            "adapter_resolved",
            case_id,
            stage="detection",
            evidence_id=evidence_id,
            adapter=f"{resolution.resolved_module}.{resolution.resolved_class}",
            fallback=resolution.fallback,
            available=resolution.available,
            reason=resolution.reason,
        )
    return resolution


def _probe_adapter(adapter: BaseAdapter, source_path: str) -> str | None:
    """Ask a vendor adapter whether it handles ``source_path``; None means yes."""
    try:
        accepted = adapter.detect(source_path)
    except NotImplementedError as exc:
        return f"vendor adapter is a stub ({exc})"
    except Exception as exc:  # noqa: BLE001 - a failing probe must not stop intake
        return f"vendor adapter probe failed ({type(exc).__name__}: {exc})"
    if not accepted:
        return "vendor adapter declined the source"
    return None


def _load_adapter(module: str, cls: str) -> tuple[BaseAdapter | None, str | None]:
    try:
        mod = importlib.import_module(module)
        factory = getattr(mod, cls)
        adapter = factory()
        try:
            adapter.detect("/nonexistent/probe/path")
        except NotImplementedError:
            return None, f"{module}.{cls} raises NotImplementedError"
        except Exception:
            pass
    except Exception as exc:  # noqa: BLE001 - any failure means "not available"
        return None, f"{type(exc).__name__}: {exc}"
    if not isinstance(adapter, BaseAdapter):
        return None, f"{module}.{cls} is not a BaseAdapter"
    return adapter, None



# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _unknown(
    rationale: list[str],
) -> tuple[str, str, ValidationStatus, float, list[str]]:
    rationale.append(
        f"decision: {UNKNOWN_VENDOR} ({ValidationStatus.GENERIC_FALLBACK.value}), "
        "confidence 0.00"
    )
    return (
        UNKNOWN_VENDOR,
        UNKNOWN_SIGNATURE,
        ValidationStatus.GENERIC_FALLBACK,
        0.0,
        rationale,
    )


def _find_all(pattern: bytes, buf: bytes, base: int) -> list[int]:
    out: list[int] = []
    i = buf.find(pattern)
    while i != -1:
        out.append(base + i)
        i = buf.find(pattern, i + 1)
    return out


def _scan_nals(buf: bytes) -> tuple[int, int, int, int, int]:
    """Count plausible NAL headers after ``00 00 01`` start codes.

    Returns (valid, ok_h264, ok_h265, votes_h264, votes_h265). Votes come only
    from parameter-set headers, which are near-unambiguous between codecs.
    """
    valid = ok264 = ok265 = votes264 = votes265 = 0
    i = buf.find(START_CODE)
    limit = len(buf) - 5
    while i != -1 and i <= limit:
        h = buf[i + 3]
        b2 = buf[i + 4]
        if not h & 0x80:  # forbidden_zero_bit
            t264 = h & 0x1F
            ref = (h >> 5) & 0x3
            is264 = (
                t264 in H264_TYPES
                and not (t264 in H264_REF_REQUIRED and ref == 0)
                and not (t264 in H264_REF_FORBIDDEN and ref != 0)
            )
            t265 = (h >> 1) & 0x3F
            layer = ((h & 1) << 5) | (b2 >> 3)
            tid = b2 & 0x7
            is265 = t265 in H265_TYPES and layer == 0 and tid >= 1
            if is264 or is265:
                valid += 1
            if is264:
                ok264 += 1
                if t264 in (7, 8) and ref == 3:
                    votes264 += 1
            if is265:
                ok265 += 1
                if t265 in H265_PARAMETER_SETS and b2 == 1:
                    votes265 += 1
        i = buf.find(START_CODE, i + 3)
    return valid, ok264, ok265, votes264, votes265
