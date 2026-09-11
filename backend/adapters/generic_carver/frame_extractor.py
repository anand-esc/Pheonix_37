"""Frame extraction from H.264/H.265 Annex-B or MP4 fragments for AI triage.

Extracts I-frames (IDR/IRAP) from carved fragments and converts them to 
PIL Images suitable for YOLOv8 inference.
"""

from __future__ import annotations

import io
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from PIL import Image

from backend.adapters.generic_carver.mp4 import (
    iter_annexb_nals,
    detect_codec,
    _nal_type,
    _is_picture_start,
    parse_boxes,
)

logger = logging.getLogger("phoenix.frame_extractor")

H264_IDR = 5
H265_IRAP_TYPES = frozenset(range(16, 24))  # 16-23 are IRAP


@dataclass
class ExtractedFrame:
    fragment_index: int
    frame_index: int
    image: Image.Image
    nal_type: int
    byte_offset: int


def _find_idr_nals(nals: list[bytes], codec: str) -> list[tuple[int, bytes]]:
    """Find all IDR/IRAP NALs in a fragment. Returns list of (index, nal_bytes)."""
    idr_nals = []
    for idx, nal in enumerate(nals):
        t = _nal_type(nal, codec)
        if codec == "h264" and t == H264_IDR:
            idr_nals.append((idx, nal))
        elif codec == "h265" and t in H265_IRAP_TYPES:
            idr_nals.append((idx, nal))
    return idr_nals


def _nal_to_jpeg(nal: bytes, codec: str) -> Optional[bytes]:
    """Attempt to decode a single NAL unit to JPEG using PIL.
    
    Note: This is a minimal decoder. For production, use ffmpeg/decord.
    This implementation tries to decode if the NAL contains a complete frame.
    """
    try:
        if codec == "h264":
            return _decode_h264_frame(nal)
        else:
            return _decode_h265_frame(nal)
    except Exception as e:
        logger.debug(f"Failed to decode NAL to image: {e}")
        return None


def _decode_h264_frame(nal: bytes) -> Optional[bytes]:
    """Decode H.264 IDR NAL to JPEG. Uses a minimal approach."""
    try:
        import subprocess
        import tempfile
        
        with tempfile.NamedTemporaryFile(suffix=".h264", delete=False) as f:
            f.write(b"\x00\x00\x00\x01" + nal)
            h264_path = f.name
        
        jpeg_path = h264_path + ".jpg"
        
        result = subprocess.run([
            "ffmpeg", "-y", "-i", h264_path,
            "-vframes", "1", "-f", "image2", jpeg_path
        ], capture_output=True, timeout=10)
        
        if result.returncode == 0:
            with open(jpeg_path, "rb") as f:
                return f.read()
        return None
    except Exception:
        return None
    finally:
        try:
            import os
            os.unlink(h264_path)
        except Exception:
            pass
        try:
            os.unlink(jpeg_path)
        except Exception:
            pass


def _decode_h265_frame(nal: bytes) -> Optional[bytes]:
    """Decode H.265 IRAP NAL to JPEG."""
    try:
        import subprocess
        import tempfile
        
        with tempfile.NamedTemporaryFile(suffix=".h265", delete=False) as f:
            f.write(b"\x00\x00\x00\x01" + nal)
            h265_path = f.name
        
        jpeg_path = h265_path + ".jpg"
        
        result = subprocess.run([
            "ffmpeg", "-y", "-i", h265_path,
            "-vframes", "1", "-f", "image2", jpeg_path
        ], capture_output=True, timeout=10)
        
        if result.returncode == 0:
            with open(jpeg_path, "rb") as f:
                return f.read()
        return None
    except Exception:
        return None
    finally:
        try:
            import os
            os.unlink(h265_path)
        except Exception:
            pass
        try:
            os.unlink(jpeg_path)
        except Exception:
            pass


def _extract_from_mp4(mp4_path: Path, max_frames: int = 5) -> list[ExtractedFrame]:
    """Extract I-frames from an MP4 file using ffmpeg."""
    frames = []
    try:
        import subprocess
        import tempfile
        
        with tempfile.TemporaryDirectory() as tmpdir:
            pattern = Path(tmpdir) / "frame_%04d.jpg"
            result = subprocess.run([
                "ffmpeg", "-y", "-i", str(mp4_path),
                "-vf", "select='eq(pict_type,I)'",
                "-vsync", "vfr",
                "-frames:v", str(max_frames),
                str(pattern)
            ], capture_output=True, timeout=30)
            
            if result.returncode != 0:
                logger.debug(f"ffmpeg could not extract I-frames from {mp4_path} (likely synthetic stream)")
                return frames
            
            for idx, img_path in enumerate(sorted(Path(tmpdir).glob("frame_*.jpg"))):
                try:
                    with Image.open(img_path) as img:
                        img.load()
                        frames.append(ExtractedFrame(
                            fragment_index=-1,
                            frame_index=idx,
                            image=img.copy(),
                            nal_type=0,
                            byte_offset=0
                        ))
                except Exception as e:
                    logger.debug(f"Failed to load extracted frame {img_path}: {e}")
    except Exception as e:
        logger.debug(f"MP4 frame extraction failed for {mp4_path}: {e}")
    return frames


def extract_frames_from_fragment(
    fragment_path: str | Path,
    mp4_path: str | Path | None = None,
    max_frames: int = 5,
    preferred_codec: str | None = None
) -> list[ExtractedFrame]:
    """Extract keyframes from a carved fragment for AI triage.
    
    Prefers MP4 wrapper if available (better seeking), falls back to 
    raw Annex-B parsing with ffmpeg.
    
    Args:
        fragment_path: Path to .h264/.h265 fragment
        mp4_path: Optional path to .mp4 wrapper (preferred)
        max_frames: Maximum frames to extract per fragment
        preferred_codec: "h264" or "h265" hint
    
    Returns:
        List of ExtractedFrame objects with PIL Images
    """
    fragment_path = Path(fragment_path)
    
    if mp4_path and Path(mp4_path).exists():
        logger.debug(f"Extracting frames from MP4 wrapper: {mp4_path}")
        return _extract_from_mp4(Path(mp4_path), max_frames)
    
    logger.debug(f"Extracting frames from raw fragment: {fragment_path}")
    try:
        data = fragment_path.read_bytes()
        nals = list(iter_annexb_nals(data))
        if not nals:
            return []
        
        codec = preferred_codec or detect_codec(nals)
        idr_nals = _find_idr_nals(nals, codec)
        
        frames = []
        for frame_idx, (nal_idx, nal) in enumerate(idr_nals[:max_frames]):
            jpeg_bytes = _nal_to_jpeg(nal, codec)
            if jpeg_bytes:
                try:
                    img = Image.open(io.BytesIO(jpeg_bytes))
                    img.load()
                    frames.append(ExtractedFrame(
                        fragment_index=-1,
                        frame_index=frame_idx,
                        image=img,
                        nal_type=_nal_type(nal, codec),
                        byte_offset=nal_idx
                    ))
                except Exception as e:
                    logger.debug(f"Failed to load decoded frame: {e}")
        
        return frames
    except Exception as e:
        logger.debug(f"Raw fragment frame extraction failed: {e}")
        return []


def extract_frames_from_playable(
    playable_views: list,
    max_frames_per_fragment: int = 3
) -> list[ExtractedFrame]:
    """Extract frames from all playable MP4 views."""
    all_frames = []
    for view in playable_views:
        if view.mp4_path and Path(view.mp4_path).exists():
            frames = _extract_from_mp4(Path(view.mp4_path), max_frames_per_fragment)
            for f in frames:
                f.fragment_index = view.fragment_index
            all_frames.extend(frames)
    return all_frames