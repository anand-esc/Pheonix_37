import asyncio
from pathlib import Path

from backend.acquisition.imager import DEFAULT_CHUNK_SIZE, acquire
from backend.acquisition.models import AcquisitionRecord
from backend.pipeline.events import EventSink


async def async_acquire(
    source: Path | str,
    destination: Path | str,
    *,
    case_id: str,
    operator_id: str,
    device_info: str,
    chunk_size: int = DEFAULT_CHUNK_SIZE,
    sink: EventSink | None = None,
) -> AcquisitionRecord:
    """Run ``acquire`` in a worker thread so a multi-GB image never blocks the API loop."""
    return await asyncio.to_thread(
        acquire,
        source,
        destination,
        case_id=case_id,
        operator_id=operator_id,
        device_info=device_info,
        chunk_size=chunk_size,
        sink=sink,
    )
