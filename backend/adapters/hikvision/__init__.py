"""Hikvision WFS filesystem adapter — native parser implementation.

Parses Hikvision proprietary WFS (Web File System) format used in DVR/NVR devices.
Extracts channel information and recovers video fragments including deleted files.
"""

from backend.core.evidence_model import ChannelInfo, EvidenceItem
from backend.core.interfaces import BaseAdapter
from backend.pipeline.events import EventSink

from .wfs_parser import WFSParser, parse_wfs_image


class HikvisionAdapter(BaseAdapter):
    """Native Hikvision WFS filesystem adapter with full parsing capability."""
    
    def __init__(
        self,
        *,
        detector=None,
        sink: Optional[EventSink] = None,
        case_id: Optional[str] = None,
        evidence_id: Optional[str] = None,
    ) -> None:
        self._detector = detector
        self._sink = sink
        self._case_id = case_id
        self._evidence_id = evidence_id

    def detect(self, source_path: str) -> bool:
        """Detect Hikvision WFS format by checking for magic bytes at known offsets."""
        from pathlib import Path
        
        path = Path(source_path)
        if not path.exists() or not path.is_file():
            return False
        
        try:
            with open(path, "rb") as f:
                # Check primary offset 0x210 for standard HIKVISION magic
                f.seek(0x210)
                magic = f.read(18)
                if magic.startswith(b"HIKVISION"):
                    return True
                
                # Check alternative offsets
                for offset in [0x200, 0x400, 0x1000]:
                    f.seek(offset)
                    if f.read(18).startswith(b"HIKVISION"):
                        return True
        except Exception:
            pass
        
        return False

    def parse(self, source_path: str) -> EvidenceItem:
        """Parse WFS image into EvidenceItem with channels and fragments."""
        return parse_wfs_image(
            source_path,
            case_id=self._case_id,
            evidence_id=self._evidence_id,
            sink=self._sink,
        )

    def list_channels(self, source_path: str) -> list[ChannelInfo]:
        """Extract channel information from WFS image."""
        from backend.core.evidence_model import EvidenceItem
        
        # Parse just enough to get channels
        item = self.parse(source_path)
        return item.channels
