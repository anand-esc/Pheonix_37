"""Acquisition-side HTTP routes (not yet registered in ``backend.api.main``).

Registering is one line in ``main.py``::

    from backend.api.routes_acquisition import router as acquisition_router
    app.include_router(acquisition_router)

Runs execute in a worker thread so the event loop stays responsive; the
in-memory ``JobStore`` tracks them. It is per-process and non-persistent,
which is fine for the prototype: the durable record is the run directory
(``pipeline_result.json``, sidecar, transcript), not this table.

All jobs share the global EventSink from backend.api.shared so their events
feed the global AuditLedger. Per-job event views are provided by subscribing
a filtered callback to the shared sink.
"""

from __future__ import annotations

import asyncio
import threading
import uuid
from datetime import UTC, datetime
from enum import Enum
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field

from backend.acquisition.exceptions import AcquisitionError
from backend.api.shared import get_event_sink
from backend.detection.detector import FormatDetector
from backend.detection.models import DetectionReport
from backend.pipeline.events import PipelineEvent
from backend.pipeline.runner import PipelineError, PipelineResult, run_pipeline

router = APIRouter(prefix="/acquisition", tags=["acquisition"])


class JobStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class RunRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_path: str = Field(
        description="file or raw device, e.g. \\\\.\\PhysicalDrive2"
    )
    case_id: str
    operator_id: str
    out_dir: str = Field(description="directory for image, fragments, vault, result")
    device_info: str = ""
    encrypt: bool = True


class JobView(BaseModel):
    model_config = ConfigDict(extra="forbid")

    job_id: str
    status: JobStatus
    request: RunRequest
    created_utc: datetime
    finished_utc: datetime | None = None
    bytes_read: int = 0
    events: int = 0
    last_event: str | None = None
    error: str | None = None
    summary: dict[str, Any] | None = None


class _Job:
    def __init__(self, job_id: str, request: RunRequest) -> None:
        self.job_id = job_id
        self.request = request
        self.status = JobStatus.QUEUED
        self.created_utc = datetime.now(UTC)
        self.finished_utc: datetime | None = None
        self.bytes_read = 0
        self._events: list[PipelineEvent] = []
        self._subscription_active = False
        self._subscription_lock = threading.Lock()
        self.error: str | None = None
        self.result: PipelineResult | None = None
        self.lock = threading.Lock()

    def _subscribe_to_shared_sink(self) -> None:
        """Subscribe a filtered callback to the shared global sink."""
        if self._subscription_active:
            return
        shared_sink = get_event_sink()
        case_id = self.request.case_id

        def _filtered_callback(event) -> None:
            # Filter by case_id - event can be PipelineEvent or dict (from ledger's emit)
            # The ledger's emit converts PipelineEvent to dict with operator_id = case_id
            event_case_id = (
                getattr(event, "case_id", None) or
                (event.get("operator_id") if isinstance(event, dict) else None) or
                (event.get("case_id") if isinstance(event, dict) else None)
            )
            if event_case_id == case_id:
                # Convert to PipelineEvent if needed
                if hasattr(event, "model_dump"):
                    # Already a PipelineEvent
                    self._events.append(event)
                elif isinstance(event, dict):
                    # Convert ledger's dict format to PipelineEvent
                    try:
                        details = event.get("details", {})
                        pe = PipelineEvent(
                            event_type=event.get("event_type", "UNKNOWN"),
                            case_id=event.get("operator_id", "UNKNOWN"),
                            evidence_id=details.get("evidence_id"),
                            stage=details.get("stage", "unknown"),
                            payload={k: v for k, v in details.items() 
                                     if k not in ("evidence_id", "stage", "timestamp_utc")},
                        )
                        self._events.append(pe)
                    except Exception:
                        # If conversion fails, skip
                        pass

        shared_sink.subscribe(_filtered_callback)
        self._subscription_active = True

    def view(self) -> JobView:
        with self.lock:
            events = list(self._events)
        return JobView(
            job_id=self.job_id,
            status=self.status,
            request=self.request,
            created_utc=self.created_utc,
            finished_utc=self.finished_utc,
            bytes_read=self.bytes_read,
            events=len(events),
            last_event=events[-1].event_type if events else None,
            error=self.error,
            summary=self.result.summary() if self.result is not None else None,
        )

    def run(self) -> None:
        """Blocking; called from a worker thread or directly for ``wait=true``."""
        self.status = JobStatus.RUNNING

        # Subscribe to shared sink to capture this job's events
        self._subscribe_to_shared_sink()

        def progress(n: int) -> None:
            self.bytes_read = n

        try:
            shared_sink = get_event_sink()
            self.result = run_pipeline(
                self.request.source_path,
                case_id=self.request.case_id,
                operator_id=self.request.operator_id,
                out_dir=self.request.out_dir,
                sink=shared_sink,
                device_info=self.request.device_info,
                encrypt=self.request.encrypt,
                progress_cb=progress,
            )
            self.status = JobStatus.COMPLETED
        except (AcquisitionError, PipelineError, OSError) as exc:
            self.error = f"{type(exc).__name__}: {exc}"
            self.status = JobStatus.FAILED
        finally:
            self.finished_utc = datetime.now(UTC)


class JobStore:
    def __init__(self) -> None:
        self._jobs: dict[str, _Job] = {}
        self._lock = threading.Lock()

    def create(self, request: RunRequest) -> _Job:
        job = _Job(f"job-{uuid.uuid4()}", request)
        with self._lock:
            self._jobs[job.job_id] = job
        return job

    def get(self, job_id: str) -> _Job:
        job = self._jobs.get(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail=f"unknown job {job_id}")
        return job

    def all(self) -> list[_Job]:
        return list(self._jobs.values())

    def reset(self) -> None:
        with self._lock:
            self._jobs.clear()


store = JobStore()


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@router.post("/runs", status_code=202, response_model=JobView)
async def start_run(
    request: RunRequest,
    wait: bool = Query(False, description="block until the run finishes"),
) -> JobView:
    """Start an acquisition run. Returns immediately unless ``wait=true``."""
    if not Path(request.source_path).exists():
        raise HTTPException(status_code=400, detail="source_path does not exist")
    job = store.create(request)
    if wait:
        await asyncio.to_thread(job.run)
    else:
        threading.Thread(target=job.run, name=job.job_id, daemon=True).start()
    return job.view()


@router.get("/runs", response_model=list[JobView])
async def list_runs() -> list[JobView]:
    return [j.view() for j in store.all()]


@router.get("/runs/{job_id}", response_model=JobView)
async def get_run(job_id: str) -> JobView:
    return store.get(job_id).view()


@router.get("/runs/{job_id}/result", response_model=PipelineResult)
async def get_result(job_id: str) -> PipelineResult:
    job = store.get(job_id)
    if job.status is JobStatus.FAILED:
        raise HTTPException(status_code=409, detail=job.error)
    if job.result is None:
        raise HTTPException(status_code=409, detail=f"run is {job.status.value}")
    return job.result


@router.get("/runs/{job_id}/events", response_model=list[PipelineEvent])
async def get_events(job_id: str) -> list[PipelineEvent]:
    job = store.get(job_id)
    with job.lock:
        return list(job._events)


class DetectRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_path: str


@router.post("/detect", response_model=DetectionReport)
async def detect(request: DetectRequest) -> DetectionReport:
    """Bounded signature scan of a file; cheap enough to run inline."""
    path = Path(request.source_path)
    if not path.is_file():
        raise HTTPException(status_code=400, detail="source_path is not a file")
    return await asyncio.to_thread(FormatDetector().detect, path)