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

    @property
    def event_count(self) -> int:
        with self._lock:
            return len(self._event_log)

    @property
    def subscriber_count(self) -> int:
        with self._lock:
            return len(self._subscribers)
