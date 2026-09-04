"""Generic Annex-B NAL carver: vendor-agnostic fallback recovery."""

from backend.adapters.generic_carver.adapter import GenericCarverAdapter
from backend.adapters.generic_carver.carver import GenericNalCarver
from backend.adapters.generic_carver.exceptions import (
    CarverError,
    CarverExportError,
    CarverSourceError,
)
from backend.adapters.generic_carver.models import (
    CarvedFragment,
    CarveOptions,
    CarveResult,
    CarveStats,
    ExportedFragment,
    FragmentFeatures,
    StreamInfo,
)
from backend.adapters.generic_carver.timeline import (
    ChannelGroup,
    Timeline,
    TimelineEntry,
    build_timeline,
)

__all__ = [
    "CarveOptions",
    "CarveResult",
    "CarveStats",
    "CarvedFragment",
    "CarverError",
    "CarverExportError",
    "CarverSourceError",
    "ChannelGroup",
    "ExportedFragment",
    "FragmentFeatures",
    "GenericCarverAdapter",
    "GenericNalCarver",
    "StreamInfo",
    "Timeline",
    "TimelineEntry",
    "build_timeline",
]
