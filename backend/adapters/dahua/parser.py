"""
Dahua DVR/NVR binary parser — DHAV / DHFS container format.

Scans raw proprietary streams for DHAV frame headers, carves H.264/H.265
NAL slices, and computes deterministic SHA-256 hashes on plaintext data.
Inherits from GenericCarverAdapter for full pipeline export integration.
"""

from __future__ import annotations

import hashlib
import struct
from pathlib import Path
from typing import Union, Optional, BinaryIO

from backend.adapters.generic_carver.adapter import GenericCarverAdapter
from backend.adapters.generic_carver.models import CarveOptions
from backend.core.evidence_model import (
    ChannelInfo,
    EvidenceItem,
    Fragment,
    VendorInfo,
    ValidationStatus,
)
from backend.detection.detector import FormatDetector
from backend.detection.models import DetectionReport
from backend.pipeline.events import EventSink

DHAV_MAGIC: bytes = b"DHAV"
DHFS_MAGIC: bytes = b"DHFS"
DHAV_MAGIC_INT: int = 0x44484156
DHAV_HEADER_SIZE: int = 16

H264_NAL_START: bytes = b"\x00\x00\x00\x01"
H265_NAL_START: bytes = b"\x00\x00\x01"

# Streaming read chunk size (4 MiB)
STREAM_CHUNK_SIZE = 4 * 1024 * 1024
# Overlap buffer to catch magic bytes split across chunks
OVERLAP_SIZE = 64


class DahuaAdapter(GenericCarverAdapter):
    """Native Dahua DHFS/DHAV container adapter and fragment parser."""

    def __init__(
        self,
        options: Optional[CarveOptions] = None,
        *,
        detector: Optional[FormatDetector] = None,
        sink: Optional[EventSink] = None,
        case_id: Optional[str] = None,
        evidence_id: Optional[str] = None,
        report: Optional[DetectionReport] = None,
    ) -> None:
        super().__init__(
            options=options,
            detector=detector,
            sink=sink,
            case_id=case_id,
            evidence_id=evidence_id,
            report=report,
        )

    def detect(self, source_path: Union[str, Path, bytes]) -> bool:
        """Return True if source begins with DHAV or DHFS magic bytes or has Annex-B NALs."""
        data: bytes = b""
        if isinstance(source_path, (str, Path)):
            p = Path(source_path)
            if p.exists() and p.is_file():
                try:
                    with open(p, "rb") as f:
                        data = f.read(64)
                except Exception:
                    data = b""
            else:
                data = str(source_path).encode()
        elif isinstance(source_path, bytes):
            data = source_path

        if len(data) >= 4:
            magic = data[:4]
            if magic in (DHAV_MAGIC, DHFS_MAGIC):
                return True
            try:
                val = struct.unpack(">I", magic)[0]
                if val == DHAV_MAGIC_INT:
                    return True
            except struct.error:
                pass

        if isinstance(source_path, (str, Path)) and Path(source_path).is_file():
            try:
                return super().detect(str(source_path))
            except Exception:
                pass
        return False

    def parse_fragments(
        self,
        file_path_or_bytes: Union[str, Path, bytes],
    ) -> list[dict]:
        """Scan a Dahua container for DHAV frames and extract NAL slice metadata.
        
        Streams large files in chunks to avoid OOM on multi-GB disk images.
        """
        if isinstance(file_path_or_bytes, bytes):
            # For bytes input (tests), use the original in-memory approach
            return self._parse_fragments_in_memory(file_path_or_bytes)
        
        path = Path(file_path_or_bytes)
        if not path.exists() or not path.is_file():
            return []
        
        return self._parse_fragments_streaming(path)

    def _parse_fragments_in_memory(self, data: bytes) -> list[dict]:
        """Original in-memory parsing for small inputs / tests."""
        fragments: list[dict] = []
        offset = 0

        while offset + DHAV_HEADER_SIZE <= len(data):
            magic_pos = data.find(DHAV_MAGIC, offset)
            if magic_pos == -1 or magic_pos + DHAV_HEADER_SIZE > len(data):
                break

            hdr = data[magic_pos : magic_pos + DHAV_HEADER_SIZE]
            sub_type = hdr[5]
            sequence_id = hdr[7]
            frame_length = struct.unpack("<I", hdr[8:12])[0]
            timestamp = struct.unpack("<I", hdr[12:16])[0]

            if frame_length < DHAV_HEADER_SIZE:
                offset = magic_pos + 4
                continue

            payload_end = min(magic_pos + frame_length, len(data))
            payload = data[magic_pos + DHAV_HEADER_SIZE : payload_end]

            codec = self._detect_codec(payload, sub_type)
            sha = hashlib.sha256(payload).hexdigest()

            fragments.append(
                {
                    "offset": magic_pos,
                    "length": len(payload),
                    "timestamp": timestamp,
                    "sequence_id": sequence_id,
                    "codec": codec,
                    "sha256": sha,
                }
            )

            offset = magic_pos + max(frame_length, DHAV_HEADER_SIZE)

        return fragments

    def _parse_fragments_streaming(self, path: Path) -> list[dict]:
        """Stream large file and find DHAV frames without loading entire file."""
        fragments: list[dict] = []
        file_size = path.stat().st_size
        
        with open(path, "rb") as f:
            buffer = b""
            buffer_start_offset = 0
            search_offset = 0
            
            while True:
                chunk = f.read(STREAM_CHUNK_SIZE)
                if not chunk:
                    # Process remaining buffer
                    final_fragments, _ = self._scan_buffer_for_frames(
                        buffer, buffer_start_offset, is_final=True
                    )
                    fragments.extend(final_fragments)
                    break
                
                buffer += chunk
                # Scan for frames in the buffer
                new_fragments, consumed = self._scan_buffer_for_frames(
                    buffer, buffer_start_offset, is_final=False
                )
                fragments.extend(new_fragments)
                
                # Keep only the unconsumed tail (overlap region) for next iteration
                if consumed < len(buffer):
                    buffer = buffer[consumed:]
                    buffer_start_offset += consumed
                else:
                    buffer = b""
                    buffer_start_offset += len(chunk)
        
        return fragments

    def _scan_buffer_for_frames(
        self, 
        buffer: bytes, 
        buffer_start_offset: int, 
        is_final: bool
    ) -> tuple[list[dict], int]:
        """Scan a buffer for DHAV frames. Returns (fragments, bytes_consumed)."""
        fragments: list[dict] = []
        offset = 0
        buffer_len = len(buffer)
        
        while offset + DHAV_HEADER_SIZE <= buffer_len:
            magic_pos = buffer.find(DHAV_MAGIC, offset)
            if magic_pos == -1:
                # No more magic in buffer - keep overlap for next chunk
                if not is_final and buffer_len > OVERLAP_SIZE:
                    return fragments, buffer_len - OVERLAP_SIZE
                return fragments, buffer_len
            
            if magic_pos + DHAV_HEADER_SIZE > buffer_len:
                # Header split across chunks - need more data
                if not is_final:
                    return fragments, max(0, magic_pos - OVERLAP_SIZE)
                break
            
            hdr = buffer[magic_pos : magic_pos + DHAV_HEADER_SIZE]
            sub_type = hdr[5]
            sequence_id = hdr[7]
            frame_length = struct.unpack("<I", hdr[8:12])[0]
            timestamp = struct.unpack("<I", hdr[12:16])[0]

            if frame_length < DHAV_HEADER_SIZE:
                offset = magic_pos + 4
                continue

            payload_start = magic_pos + DHAV_HEADER_SIZE
            payload_end = magic_pos + frame_length
            
            if payload_end > buffer_len:
                # Frame payload split across chunks - need more data
                if not is_final:
                    return fragments, max(0, magic_pos - OVERLAP_SIZE)
                # Final chunk - take what we have
                payload_end = buffer_len
            
            payload = buffer[payload_start:payload_end]
            codec = self._detect_codec(payload, sub_type)
            sha = hashlib.sha256(payload).hexdigest()
            
            absolute_offset = buffer_start_offset + magic_pos
            fragments.append(
                {
                    "offset": absolute_offset,
                    "length": len(payload),
                    "timestamp": timestamp,
                    "sequence_id": sequence_id,
                    "codec": codec,
                    "sha256": sha,
                }
            )
            
            offset = magic_pos + max(frame_length, DHAV_HEADER_SIZE)
        
        return fragments, offset

    def parse(self, source_path: str) -> EvidenceItem:
        """Parses the source into the Common Evidence Representation (EvidenceItem)."""
        path = Path(source_path)
        if not path.is_file():
            return EvidenceItem(
                evidence_id=self.evidence_id or f"dahua-{path.name}",
                source_device_info="Dahua DVR/NVR Device",
                vendor_info=VendorInfo(
                    vendor_name="Dahua",
                    detected_format_signature="DHAV/DHFS",
                    validation_status=ValidationStatus.VALIDATED,
                ),
                channels=[],
                fragments=[],
            )

        raw_frags = self.parse_fragments(source_path)

        if not raw_frags:
            item = super().parse(source_path)
            return EvidenceItem(
                evidence_id=self.evidence_id or f"dahua-{path.name}",
                source_device_info="Dahua DVR/NVR Device",
                vendor_info=VendorInfo(
                    vendor_name="Dahua",
                    detected_format_signature="DHAV/DHFS",
                    validation_status=ValidationStatus.VALIDATED,
                ),
                channels=item.channels,
                fragments=item.fragments,
                hash_lineage=item.hash_lineage,
                detections=item.detections,
                metadata=item.metadata,
            )

        frag_objects = []
        channels_set = set()

        for idx, frag in enumerate(raw_frags):
            frag_objects.append(
                Fragment(
                    byte_offset_start=frag["offset"],
                    byte_offset_end=frag["offset"] + frag["length"],
                    codec_info=frag["codec"],
                    recovery_method="DHAV_PARSER",
                    confidence_score=1.0,
                    confidence_rationale="DHAV Frame Magic Match",
                )
            )
            channels_set.add(str(frag["sequence_id"]))

        channels = [ChannelInfo(channel_id=cid) for cid in sorted(channels_set)]

        return EvidenceItem(
            evidence_id=self.evidence_id or f"dahua-{path.name}",
            source_device_info="Dahua DVR/NVR Device",
            vendor_info=VendorInfo(
                vendor_name="Dahua",
                detected_format_signature="DHAV/DHFS",
                validation_status=ValidationStatus.VALIDATED,
            ),
            channels=channels,
            fragments=frag_objects,
        )

    def list_channels(self, source_path: str) -> list[ChannelInfo]:
        """Extracts channel information from the source."""
        raw_frags = self.parse_fragments(source_path)
        channels_set = set(str(f["sequence_id"]) for f in raw_frags)
        return [ChannelInfo(channel_id=cid) for cid in sorted(channels_set)]

    @staticmethod
    def _detect_codec(payload: bytes, sub_type: int) -> str:
        if H264_NAL_START in payload[:32]:
            return "H.264"
        if H265_NAL_START in payload[:32]:
            return "H.265"
        if sub_type in (0x01, 0x02):
            return "H.264"
        if sub_type in (0x03, 0x04):
            return "H.265"
        return "H.264"
