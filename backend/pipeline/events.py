"""Pipeline event seam.

Every acquisition-side stage (intake, detection, recovery, export, encryption)
emits a ``PipelineEvent`` through an ``EventSink``. The ledger layer can later
subscribe to the same sink and persist each event as a signed, hash-chained
entry without any of the emitting modules changing. Until then the default
``InMemoryEventSink`` simply records events in order so tests and the demo
transcript can inspect them.

Event names emitted by this branch (keep in sync with docs/acquisition.md):

    intake_started, intake_completed, intake_failed,
    format_detected, adapter_resolved,
    recovery_started, recovery_completed,
    fragment_exported, encryption_completed
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any, Protocol

from pydantic import BaseModel, ConfigDict, Field

logger = logging.getLogger("phoenix.pipeline.events")

EVENT_TYPES: tuple[str, ...] = (
    "intake_started",
    "intake_completed",
    "intake_failed",
    "format_detected",
    "adapter_resolved",
    "recovery_started",
    "recovery_completed",
    "fragment_exported",
    "encryption_completed",
)


class PipelineEvent(BaseModel):
    """One auditable pipeline occurrence.

    ``payload`` is intentionally a free-form dict so that the ledger can hash
    it as-is; every value should be JSON-serialisable.
    """

    model_config = ConfigDict(extra="forbid")

    event_type: str
    case_id: str
    evidence_id: str | None = None
    stage: str
    payload: dict[str, Any] = Field(default_factory=dict)
    timestamp_utc: datetime = Field(default_factory=lambda: datetime.now(UTC))


class EventSink(Protocol):
    """Anything that can receive pipeline events."""

    def emit(self, event: PipelineEvent) -> None: ...


Subscriber = Callable[[PipelineEvent], None]


class InMemoryEventSink:
    """Default sink: keeps events in order and fans them out to subscribers.

    A subscriber that raises does not break the pipeline; the error is logged
    and the event is still recorded.
    """

    def __init__(self) -> None:
        self.events: list[PipelineEvent] = []
        self._subscribers: list[Subscriber] = []

    def subscribe(self, callback: Subscriber) -> None:
        self._subscribers.append(callback)

    def emit(self, event: PipelineEvent) -> None:
        if event.event_type not in EVENT_TYPES:
            logger.warning("Unknown pipeline event type emitted: %s", event.event_type)
        self.events.append(event)
        logger.info(
            "event=%s case=%s stage=%s", event.event_type, event.case_id, event.stage
        )
        for callback in self._subscribers:
            try:
                callback(event)
            except Exception:
                logger.exception("Event subscriber failed for %s", event.event_type)

    def of_type(self, event_type: str) -> list[PipelineEvent]:
        return [e for e in self.events if e.event_type == event_type]


class NullEventSink:
    """Sink that discards everything. Useful for standalone unit tests."""

    def emit(self, event: PipelineEvent) -> None:
        return None


def emit(
    sink: EventSink | None,
    event_type: str,
    case_id: str,
    stage: str,
    evidence_id: str | None = None,
    **payload: Any,
) -> PipelineEvent:
    """Convenience helper: build an event and send it to ``sink`` if one is set."""
    event = PipelineEvent(
        event_type=event_type,
        case_id=case_id,
        evidence_id=evidence_id,
        stage=stage,
        payload=payload,
    )
    if sink is not None:
        sink.emit(event)
    return event
