from backend.core.evidence_model import ChannelInfo, EvidenceItem
from backend.core.interfaces import BaseAdapter


class HikvisionAdapter(BaseAdapter):
    """Native Hikvision WFS filesystem adapter.

    STUB: routing/import scaffolding only. Real WFS parsing logic
    (signature detection, channel enumeration, fragment extraction)
    is a separate, larger task — not built in this session.
    Owner: Sibam (feature/core-architecture)
    """

    def detect(self, source_path: str) -> bool:
        raise NotImplementedError("Sibam: WFS signature detection pending")

    def parse(self, source_path: str) -> EvidenceItem:
        raise NotImplementedError("Sibam: full WFS parser pending")

    def list_channels(self, source_path: str) -> list[ChannelInfo]:
        raise NotImplementedError("Sibam: full WFS parser pending")
