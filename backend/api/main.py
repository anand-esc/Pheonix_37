"""Phoenix API — FastAPI application.

This is the sole API surface for the desktop client. Every data route
requires a registered operator (``X-Operator-ID``); mutating routes require
a permission from the RBAC matrix. Case data is read from the run directory
the pipeline wrote under ``case_store/<case_id>/run``; the mock case is served
only when ``PHOENIX_DEMO_MODE`` is set and the store is empty.
"""

from __future__ import annotations

import json
import shutil
import uuid
from datetime import UTC, datetime
from pathlib import Path

import anyio
from fastapi import Depends, FastAPI, Header, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

from backend.api.auth import require_operator, require_permission, validate_case_id
from backend.api.ledger_routes import router as ledger_router
from backend.api.routes_acquisition import router as acquisition_router
from backend.api.shared import get_ledger, is_demo_mode
from backend.core.evidence_model import Case, DetectionResult, EvidenceItem, Fragment

app = FastAPI(
    title="Phoenix API",
    description=(
        "Vendor-agnostic DVR/NVR forensic pipeline — SIH 2026 · NTRO · "
        "Blockchain & Cybersecurity"
    ),
    version="0.2.0",
)

# ---------------------------------------------------------------------------
# CORS: the renderer is served from the Vite dev server or from file:// inside
# Electron (origin "null"); the API itself is bound to 127.0.0.1 only.
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost",
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:8080",
        "http://localhost:8000",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:8000",
        "null",
    ],
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:[0-9]+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Range", "Accept-Ranges", "Content-Length"],
)

app.include_router(acquisition_router)
app.include_router(ledger_router)


# ---------------------------------------------------------------------------
# Case store helpers (the pipeline runner writes one run directory per case)
# ---------------------------------------------------------------------------
CASE_STORE_ROOT = Path("./case_store")
RESULT_NAME = "pipeline_result.json"
TRANSCRIPT_NAME = "run_transcript.json"
CUSTODY_NAME = "custody_facts.json"
META_NAME = "case_meta.json"
CERTIFICATE_DIR = "certificate"
CERTIFICATE_PDF = "certificate_draft.pdf"


def _run_dir(case_id: str) -> Path | None:
    """The run directory for ``case_id`` if the pipeline has completed on it."""
    validate_case_id(case_id)
    run_dir = CASE_STORE_ROOT / case_id / "run"
    if (run_dir / RESULT_NAME).is_file():
        return run_dir
    return None


def _read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _load_result(case_id: str) -> dict | None:
    run_dir = _run_dir(case_id)
    return _read_json(run_dir / RESULT_NAME) if run_dir else None


def _load_case(case_id: str) -> Case | None:
    """Build the locked ``Case`` contract from the run directory, or from the
    stub written at case creation when no pipeline has run yet."""
    data = _load_result(case_id)
    if data and data.get("evidence"):
        operator = data.get("operator_id", "unknown")
        return Case(
            case_id=case_id,
            intake_timestamp_utc=data.get("started_utc", datetime.now(UTC)),
            investigator_id=data.get("investigator_id") or operator,
            custodian_id=data.get("custodian_id") or operator,
            evidence_items=[EvidenceItem.model_validate(data["evidence"])],
        )
    meta_path = CASE_STORE_ROOT / case_id / META_NAME
    if meta_path.is_file():
        meta = _read_json(meta_path)
        return Case(
            case_id=case_id,
            intake_timestamp_utc=meta.get("created_at", datetime.now(UTC)),
            investigator_id=meta.get("examiner", "unknown"),
            custodian_id=meta.get("examiner", "unknown"),
            evidence_items=[],
        )
    return None


def _case_or_404(case_id: str) -> Case:
    case = _load_case(case_id)
    if case is not None:
        return case
    if is_demo_mode():
        from backend.api.mock_data import MOCK_CASE, MOCK_CASE_ID

        if case_id == MOCK_CASE_ID:
            return MOCK_CASE
    raise HTTPException(status_code=404, detail=f"Case '{case_id}' not found")


# ---------------------------------------------------------------------------
# Cases
# ---------------------------------------------------------------------------
class CreateCaseRequest(BaseModel):
    name: str
    examiner: str


@app.post("/api/cases", summary="Create a new case")
def create_case(
    req: CreateCaseRequest,
    operator_id: str = Depends(require_permission("RUN_CARVING")),
) -> dict:
    case_id = f"CASE-{datetime.now(UTC).year}-{str(uuid.uuid4())[:8].upper()}"
    case_dir = CASE_STORE_ROOT / case_id
    case_dir.mkdir(parents=True, exist_ok=True)
    meta = {
        "case_id": case_id,
        "name": req.name,
        "examiner": req.examiner or operator_id,
        "created_by": operator_id,
        "created_at": datetime.now(UTC).isoformat(),
        "status": "Intake",
    }
    (case_dir / META_NAME).write_text(json.dumps(meta, indent=2), encoding="utf-8")
    return {
        "id": case_id,
        "case_id": case_id,
        "name": meta["name"],
        "examiner": meta["examiner"],
        "createdAt": meta["created_at"],
        "status": "Intake",
        "hasEvidence": False,
    }


@app.delete("/api/cases/{case_id}", summary="Delete a case and everything it holds")
def delete_case(
    case_id: str, _: str = Depends(require_permission("RUN_CARVING"))
) -> dict:
    validate_case_id(case_id)
    case_dir = CASE_STORE_ROOT / case_id
    if not case_dir.is_dir():
        raise HTTPException(status_code=404, detail="Case not found")
    try:
        shutil.rmtree(case_dir)
    except OSError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    return {"success": True, "message": f"Case {case_id} deleted."}


@app.get("/api/cases", summary="List all cases (dashboard list view)")
def list_cases(_: str = Depends(require_operator)) -> list[dict]:
    cases: list[dict] = []
    if CASE_STORE_ROOT.is_dir():
        for case_dir in sorted(CASE_STORE_ROOT.iterdir()):
            if not case_dir.is_dir() or case_dir.name.startswith("."):
                continue
            result_path = case_dir / "run" / RESULT_NAME
            meta_path = case_dir / META_NAME
            if result_path.is_file():
                data = _read_json(result_path)
                meta = _read_json(meta_path) if meta_path.is_file() else {}
                cases.append(
                    {
                        "case_id": data.get("case_id", case_dir.name),
                        "name": meta.get("name"),
                        "intake_timestamp_utc": data.get("started_utc", ""),
                        "investigator_id": data.get("investigator_id")
                        or data.get("operator_id", "unknown"),
                        "evidence_count": len(
                            data.get("evidence", {}).get("fragments", [])
                        ),
                        "status": "COMPLETED"
                        if data.get("encrypted")
                        else "RECOVERY_COMPLETE",
                    }
                )
            elif meta_path.is_file():
                meta = _read_json(meta_path)
                cases.append(
                    {
                        "case_id": case_dir.name,
                        "name": meta.get("name"),
                        "intake_timestamp_utc": meta.get("created_at", ""),
                        "investigator_id": meta.get("examiner", "unknown"),
                        "evidence_count": 0,
                        "status": "Intake",
                    }
                )
    if not cases and is_demo_mode():
        from backend.api.mock_data import MOCK_CASE

        cases.append(
            {
                "case_id": MOCK_CASE.case_id,
                "name": "Demo case (mock data)",
                "intake_timestamp_utc": MOCK_CASE.intake_timestamp_utc.isoformat(),
                "investigator_id": MOCK_CASE.investigator_id,
                "evidence_count": len(MOCK_CASE.evidence_items),
                "status": "RECOVERY_COMPLETE",
            }
        )
    return cases


@app.get(
    "/api/case/{case_id}",
    response_model=Case,
    summary="Full case detail (EvidenceItems, Fragments, HashRecord lineage)",
)
def get_case(case_id: str, _: str = Depends(require_operator)) -> Case:
    return _case_or_404(case_id)


@app.get("/api/case/{case_id}/status", summary="Pipeline progress for a case")
def get_case_status(case_id: str, _: str = Depends(require_operator)) -> dict:
    data = _load_result(case_id)
    if data:
        sealed = bool(data.get("encrypted"))
        return {
            "case_id": case_id,
            "stage": "ENCRYPTION_COMPLETE" if sealed else "RECOVERY_COMPLETE",
            "stage_label": "Evidence vault sealed"
            if sealed
            else "Fragment recovery complete",
            "progress_pct": 100,
        }
    return {
        "case_id": case_id,
        "stage": "UNKNOWN",
        "stage_label": "No pipeline run found for this case",
        "progress_pct": 0,
    }


@app.get(
    "/api/case/{case_id}/fragments",
    response_model=list[Fragment],
    summary="All recovered fragments for a case",
)
def get_case_fragments(
    case_id: str, _: str = Depends(require_operator)
) -> list[Fragment]:
    case = _case_or_404(case_id)
    return [f for item in case.evidence_items for f in item.fragments]


@app.get(
    "/api/case/{case_id}/timeline",
    summary="Per-channel timeline built from encoder parameters (no wall clock)",
)
def get_case_timeline(case_id: str, _: str = Depends(require_operator)) -> dict:
    """The ``Timeline`` the pipeline recorded: one entry per fragment with its
    probable channel, estimated duration and relative position in that channel.
    Vendor-parsed runs carry no carver timeline; the response says so."""
    data = _load_result(case_id)
    if data is None:
        _case_or_404(case_id)
        return {"entries": [], "channels": [], "notes": ["no pipeline run yet"]}
    timeline = data.get("timeline")
    if not timeline:
        return {
            "entries": [],
            "channels": [],
            "notes": ["this run has no carver timeline (vendor parser path)"],
        }
    return timeline


@app.get(
    "/api/case/{case_id}/detections",
    response_model=list[DetectionResult],
    summary="AI triage detections for a case",
)
def get_case_detections(
    case_id: str, _: str = Depends(require_operator)
) -> list[DetectionResult]:
    case = _case_or_404(case_id)
    return [d for item in case.evidence_items for d in (item.detections or [])]


# ---------------------------------------------------------------------------
# Per-case audit ledger
# ---------------------------------------------------------------------------
def _ledger_row(entry) -> dict:
    row = entry.model_dump()
    row.update({"stage": None, "evidence_id": None, "payload": {}, "source": "ledger"})
    return row


@app.get(
    "/api/case/{case_id}/ledger",
    summary="Hash-chained audit ledger for a case",
)
def get_case_ledger(case_id: str, _: str = Depends(require_operator)) -> list[dict]:
    """Rows share one shape whatever their origin.

    1. Signed entries from the in-memory ``AuditLedger`` (they carry payload,
       previous and signature hashes) when the run happened in this process.
    2. Otherwise the persisted ``run_transcript.json`` events, which survive a
       restart but carry no chain hashes; ``source`` says which.
    The GENESIS block is always first.
    """
    validate_case_id(case_id)
    ledger = get_ledger()
    genesis = [_ledger_row(e) for e in ledger.chain if e.event_type == "GENESIS"]
    rows = [_ledger_row(e) for e in ledger.chain if e.operator_id == case_id]
    if rows:
        return genesis + rows

    run_dir = _run_dir(case_id)
    transcript_path = run_dir / TRANSCRIPT_NAME if run_dir else None
    if transcript_path and transcript_path.is_file():
        try:
            events = _read_json(transcript_path).get("events", [])
        except (OSError, ValueError):
            events = []
        rows = [
            {
                "index": i + 1,
                "timestamp": ev.get("timestamp_utc"),
                "event_type": ev.get("event_type", "UNKNOWN"),
                "operator_id": case_id,
                "payload_hash": "",
                "prev_hash": "",
                "signature": "",
                "stage": ev.get("stage"),
                "evidence_id": ev.get("evidence_id"),
                "payload": ev.get("payload", {}),
                "source": "transcript",
            }
            for i, ev in enumerate(events)
        ]
    return genesis + rows


# ---------------------------------------------------------------------------
# Fragment streaming with HTTP Range support (MP4 view preferred over raw NAL)
# ---------------------------------------------------------------------------
@app.get(
    "/api/case/{case_id}/fragments/{fragment_index}/stream",
    summary="Stream a fragment (MP4 view or raw H.264/H.265) with range support",
)
async def stream_fragment(
    case_id: str,
    fragment_index: int,
    request: Request,
    range_header: str | None = Header(None, alias="Range"),
    _: str = Depends(require_operator),
) -> Response:
    run_dir = _run_dir(case_id)
    if not run_dir:
        raise HTTPException(status_code=404, detail=f"Case '{case_id}' not found")

    prefix = f"fragment_{fragment_index:04d}"
    # A wrapped view is preferred; a file recovered whole by the container
    # pass is already playable and is served from the fragments directory.
    candidates = sorted((run_dir / "playable").glob(f"{prefix}*.mp4"))
    for suffix in (".mp4", ".avi", ".mov", ".h264", ".h265"):
        candidates.extend(sorted((run_dir / "fragments").glob(f"{prefix}*{suffix}")))
    file_path = candidates[0] if candidates else None
    if file_path is None or not file_path.is_file():
        raise HTTPException(
            status_code=404, detail=f"Fragment {fragment_index} not found"
        )

    file_size = file_path.stat().st_size
    media_type = {
        ".mp4": "video/mp4",
        ".mov": "video/quicktime",
        ".avi": "video/x-msvideo",
        ".h265": "video/h265",
    }.get(file_path.suffix.lower(), "video/h264")

    start, end = 0, file_size - 1
    if range_header:
        try:
            start_str, end_str = range_header.replace("bytes=", "").split("-")
            start = int(start_str) if start_str else 0
            end = int(end_str) if end_str else file_size - 1
        except ValueError:
            raise HTTPException(status_code=416, detail="Invalid Range header")
    start = max(0, start)
    end = min(file_size - 1, end)
    if start > end:
        raise HTTPException(status_code=416, detail="Range not satisfiable")
    content_length = end - start + 1

    async def file_iterator(path: Path, first: int, last: int, chunk: int = 65536):
        def _read(fh, n):
            return fh.read(n)

        with open(path, "rb") as fh:
            fh.seek(first)
            remaining = last - first + 1
            while remaining > 0:
                data = await anyio.to_thread.run_sync(_read, fh, min(chunk, remaining))
                if not data:
                    break
                remaining -= len(data)
                yield data

    headers = {
        "Accept-Ranges": "bytes",
        "Content-Range": f"bytes {start}-{end}/{file_size}",
        "Content-Length": str(content_length),
        "Content-Type": media_type,
    }
    return StreamingResponse(
        file_iterator(file_path, start, end),
        status_code=206 if range_header else 200,
        headers=headers,
        media_type=media_type,
    )


# ---------------------------------------------------------------------------
# RBAC-protected example endpoint (kept for the RBAC test-suite)
# ---------------------------------------------------------------------------
@app.get(
    "/api/protected/evidence/{case_id}",
    summary="Example RBAC-protected endpoint (requires VIEW_EVIDENCE)",
)
def protected_evidence(
    case_id: str,
    operator_id: str = Depends(require_permission("VIEW_EVIDENCE")),
) -> dict:
    case = _load_case(case_id)
    if case is None:
        from backend.api.mock_data import MOCK_CASE, MOCK_CASE_ID

        if case_id != MOCK_CASE_ID:
            raise HTTPException(status_code=404, detail=f"Case '{case_id}' not found")
        case = MOCK_CASE
    return {
        "case_id": case.case_id,
        "accessed_by": operator_id,
        "evidence_count": len(case.evidence_items),
        "message": "RBAC check passed — access granted",
    }


# ---------------------------------------------------------------------------
# BSA §63 certificate draft
# ---------------------------------------------------------------------------
@app.post("/api/case/{case_id}/certificate", summary="Generate the BSA §63 draft")
def generate_case_certificate(
    case_id: str, _: str = Depends(require_permission("GENERATE_CERT_DRAFT"))
) -> dict:
    run_dir = _run_dir(case_id)
    if not run_dir:
        raise HTTPException(status_code=404, detail="Case run not found")
    facts_path = run_dir / CUSTODY_NAME
    if not facts_path.is_file():
        raise HTTPException(
            status_code=400,
            detail="custody_facts.json not found. Pipeline must finish first.",
        )
    out_dir = CASE_STORE_ROOT / case_id / CERTIFICATE_DIR
    out_dir.mkdir(parents=True, exist_ok=True)

    from backend.reporting.certificate_draft import generate_draft

    try:
        generate_draft(facts_path=str(facts_path), output_dir=str(out_dir))
    except Exception as exc:  # noqa: BLE001 - the draft generator raises many types
        raise HTTPException(
            status_code=500, detail=f"Failed to generate certificate: {exc}"
        )
    return {
        "success": True,
        "message": "Certificate draft generated.",
        "pdf": str(out_dir / CERTIFICATE_PDF),
    }


@app.get(
    "/api/case/{case_id}/certificate/download",
    summary="Download the generated BSA §63 draft PDF",
)
def download_case_certificate(case_id: str, _: str = Depends(require_operator)):
    validate_case_id(case_id)
    pdf_path = CASE_STORE_ROOT / case_id / CERTIFICATE_DIR / CERTIFICATE_PDF
    if not pdf_path.is_file():
        raise HTTPException(status_code=404, detail="Certificate not generated yet.")
    return FileResponse(
        path=pdf_path,
        media_type="application/pdf",
        filename=f"BSA63-Certificate-{case_id}.pdf",
    )


# ---------------------------------------------------------------------------
# Demonstration helper
# ---------------------------------------------------------------------------
DEMO_IMAGE = Path("./demo/out/ntro_dvr_volume.img")


@app.get("/api/demo/source", summary="Path of the demonstration image, if built")
def demo_source(_: str = Depends(require_operator)) -> dict:
    """Lets the client offer the demo image instead of asking for a path.

    Returns nothing useful until ``demo/build_demo_case.py`` has been run, so
    the button only appears when there is something for it to point at.
    """
    if not DEMO_IMAGE.is_file():
        return {"available": False, "source_path": None, "size_bytes": 0}
    return {
        "available": True,
        "source_path": str(DEMO_IMAGE.resolve()),
        "size_bytes": DEMO_IMAGE.stat().st_size,
    }


@app.get("/health", summary="Health check endpoint")
def health_check():
    return {"status": "ok"}


@app.get("/ready", summary="Readiness endpoint")
def ready_check():
    return {"status": "ready"}
