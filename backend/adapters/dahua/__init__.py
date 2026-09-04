from backend.core.evidence_model import ChannelInfo, EvidenceItem
from backend.core.interfaces import BaseAdapter


class DahuaAdapter(BaseAdapter):
    """Native Dahua DHFS/DHAV filesystem adapter.

    STUB: routing/import scaffolding only. Real DHFS/DHAV parsing logic
    (signature detection, channel enumeration, fragment extraction)
    is a separate, larger task — not built in this session.
    Owner: Satya — real DHFS/DHAV parsing pending
    """

    def detect(self, source_path: str) -> bool:
        raise NotImplementedError(
            "Owner: Satya — real DHFS/DHAV parsing pending"
        )

    def parse(self, source_path: str) -> EvidenceItem:
        raise NotImplementedError(
            "Owner: Satya — real DHFS/DHAV parsing pending"
        )

    def list_channels(self, source_path: str) -> list[ChannelInfo]:
        raise NotImplementedError(
            "Owner: Satya — real DHFS/DHAV parsing pending"
        )
