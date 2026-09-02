import asyncio
from backend.ai.triage import analyze_frame
from backend.core.evidence_model import DetectionResult


async def async_analyze_frame(
    image_bytes: bytes,
    confidence_threshold: float = 0.4,
    fragment_id: str | None = None
) -> list[DetectionResult]:
    """
    Asynchronous wrapper for AI inference.
    
    Offloads the heavy PyTorch/YOLO computation to a background thread.
    This guarantees that processing a video frame won't freeze the FastAPI event loop,
    keeping the dashboard responsive for other investigators.
    """
    return await asyncio.to_thread(
        analyze_frame, image_bytes, confidence_threshold, fragment_id
    )
