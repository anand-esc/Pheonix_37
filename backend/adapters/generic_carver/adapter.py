"""``GenericCarverAdapter``: the vendor-agnostic fallback ``BaseAdapter``.

It wraps the format detector (for honest ``VendorInfo``) and the NAL carver
(for fragments). It never claims channels it cannot see: ``list_channels``
returns an empty list because a bare byte stream carries no channel map.
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from backend.adapters.generic_carver.carver import GenericNalCarver
from backend.adapters.generic_carver.models import CarveOptions, CarveResult
from backend.core.evidence_model import ChannelInfo, EvidenceItem
from backend.core.interfaces import BaseAdapter
from backend.detection.detector import FormatDetector
from backend.detection.models import DetectionReport
from backend.pipeline.events import EventSink


class GenericCarverAdapter(BaseAdapter):
    def __init__(
        self,
        options: CarveOptions | None = None,
        *,
        detector: FormatDetector | None = None,
        sink: EventSink | None = None,
        case_id: str | None = None,
        evidence_id: str | None = None,
        report: DetectionReport | None = None,
    ) -> None:
        self.options = options or CarveOptions()
        self.detector = detector or FormatDetector()
        self.sink = sink
        self.case_id = case_id
        self.evidence_id = evidence_id
        # A report computed by the caller for the same source; avoids running
        # (and emitting) detection twice inside a pipeline.
        self.precomputed_report = report
        self.last_report: DetectionReport | None = None
        self.last_result: CarveResult | None = None
        self.last_carver: GenericNalCarver | None = None

    def detect(self, source_path: str) -> bool:
        """True when the source contains any plausible Annex-B NAL units."""
        report = self.detector.detect(source_path)
        self.last_report = report
        return report.nal_stats.start_codes > 0

    def list_channels(self, source_path: str) -> list[ChannelInfo]:
        return []

    def parse(self, source_path: str) -> EvidenceItem:
        path = Path(source_path)
        pre = self.precomputed_report
        if pre is not None and Path(pre.source_path) == path:
            report = pre
        else:
            report = self.detector.detect(
                path, case_id=self.case_id, evidence_id=self.evidence_id, sink=self.sink
            )
        self.last_report = report
        evidence_id = self.evidence_id or _default_evidence_id(path)

        options = self.options.model_copy()
        if options.codec_hint is None and report.nal_stats.codec_guess != "none":
            options.codec_hint = report.nal_stats.codec_guess
        carver = GenericNalCarver(
            options, sink=self.sink, case_id=self.case_id, evidence_id=evidence_id
        )
        result = carver.carve(path)
        self.last_result = result
        self.last_carver = carver

        metadata = {
            "adapter": "generic_carver",
            "recovery_method": "annexb_nal_carve",
            "detection_confidence": f"{report.confidence:.3f}",
            "detection_rationale": " | ".join(report.rationale),
            "carve_codec": result.stats.codec,
            "carve_start_codes_seen": str(result.stats.start_codes_seen),
            "carve_orphan_nals": str(result.stats.orphan_nals),
            "carve_discarded_fragments": str(result.stats.discarded_fragments),
            "recovery_hash": result.recovery_hash,
        }
        for frag in result.fragments:
            metadata[f"fragment_{frag.index:04d}_sha256"] = frag.sha256

        return EvidenceItem(
            evidence_id=evidence_id,
            source_device_info=f"generic carve of {path.name}",
            vendor_info=report.vendor_info,
            channels=[],
            fragments=[frag.fragment for frag in result.fragments],
            hash_lineage=[],
            metadata=metadata,
        )


def _default_evidence_id(path: Path) -> str:
    return "ev-generic-" + hashlib.sha256(str(path.resolve()).encode()).hexdigest()[:12]
