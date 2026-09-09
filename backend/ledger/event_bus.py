"""
InMemoryEventSink — lightweight, thread-safe pub/sub event bus.

Distributes pipeline events (INTAKE, CARVING, ENCRYPTION, ACCESS, EXPORT)
to registered subscribers.
"""

from __future__ import annotations

import logging
import threading
from typing import Callable

logger = logging.getLogger(__name__)

EventCallback = Callable[[dict], None]


class InMemoryEventSink:
    """Thread-safe in-memory pub/sub event bus for forensic pipeline events."""

    def __init__(self) -> None:
        self._subscribers: list[EventCallback] = []
        self._lock = threading.Lock()
        self._event_log: list[dict] = []

    def subscribe(self, callback: EventCallback) -> None:
        """Register a callback that will receive every published event."""
        with self._lock:
            self._subscribers.append(callback)

    def unsubscribe(self, callback: EventCallback) -> None:
        """Remove a previously registered callback."""
        with self._lock:
            try:
                self._subscribers.remove(callback)
            except ValueError:
                pass

    def publish(self, event: dict) -> None:
        """Distribute event to every registered subscriber."""
        with self._lock:
            self._event_log.append(event)
            subscribers_snapshot = list(self._subscribers)

        for cb in subscribers_snapshot:
            try:
                cb(event)
            except Exception:
                logger.exception("Subscriber error during event dispatch")

    def emit(self, event) -> None:
        """
        Accept a PipelineEvent (from backend.pipeline.events) or a plain dict,
        convert to the internal dict format, and publish.
        
        This enables compatibility with the pipeline's EventSink protocol
        while maintaining the ledger's internal dict-based format.
        """
        if hasattr(event, "model_dump"):
            # It's a Pydantic model (PipelineEvent) - convert to dict
            data = event.model_dump()
            # Map PipelineEvent fields to ledger's expected format
            event_dict = {
                "event_type": data.get("event_type", "UNKNOWN"),
                "operator_id": data.get("case_id", "SYSTEM"),  # case_id serves as operator_id
                "details": {
                    **data.get("payload", {}),
                    "evidence_id": data.get("evidence_id"),
                    "stage": data.get("stage"),
                    "timestamp_utc": data.get("timestamp_utc").isoformat() if data.get("timestamp_utc") else None,
                },
            }
        elif isinstance(event, dict):
            event_dict = event
        else:
            logger.warning("Unknown event type passed to emit: %s", type(event))
            return
        self.publish(event_dict)

    @property
    def event_count(self) -> int:
        with self._lock:
            return len(self._event_log)

    @property
    def subscriber_count(self) -> int:
        with self._lock:
            return len(self._subscribers)
