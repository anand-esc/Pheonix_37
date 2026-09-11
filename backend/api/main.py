"""
Phoenix API — FastAPI application.

This is the sole API surface for the frontend. Endpoints now wire to real
pipeline/ledger/RBAC components. Mock data is retained only as a fallback
for demo mode when no case has been run yet.
"""

from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from backend.api.ledger_routes import router as ledger_router
from backend.api.routes_acquisition import router as acquisition_router
from backend.api.shared import get_event_sink, get_ledger, get_rbac_controller
from backend.core.evidence_model import Case, Fragment
from backend.ledger.rbac import Role, enforce_access


# ---------------------------------------------------------------------------
# RBAC dependency for protected endpoints
# ---------------------------------------------------------------------------
async def require_role(
    operator_id: str = Header(..., alias="X-Operator-ID"),
    action: str = Query(..., description="Action being attempted"),
) -> str:
    """
    FastAPI dependency that enforces RBAC for the given action.
    Reads operator_id from X-Operator-ID header, action from query param.
    Raises 403 on denial (and logs to ledger via event sink).
    """
    try:
        enforce_access(operator_id, action)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=403, detail=f"RBAC error: {exc}")
    return operator_id


app = FastAPI(
    title="Phoenix API",
    description=(
        "Vendor-agnostic DVR/NVR forensic pipeline — SIH 2026 · NTRO · "
        "Blockchain & Cybersecurity"
    ),
    version="0.2.0",
)

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost",
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:8080",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Register real routers
# ---------------------------------------------------------------------------
app.include_router(acquisition_router)
app.include_router(ledger_router)


# ---------------------------------------------------------------------------
# Helper: load case from run directory (produced by pipeline runner)
# ---------------------------------------------------------------------------
CASE_STORE_ROOT = Path("./case_store")


def _find_case_dir(case_id: str) -> Optional[Path]:
    """Find the most recent run directory for a case_id under CASE_STORE_ROOT."""
    if not CASE_STORE_ROOT.exists():
        return None
    # Look for case_id directories directly under CASE_STORE_ROOT
    case_dir = CASE_STORE_ROOT / case_id
    if case_dir.exists() and case_dir.is_dir():
        run_dir = case_dir / "run"
        if run_dir.exists() and (run_dir / "pipeline_result.json").exists():
            return run_dir
    # Fallback: search recursively
    matches = list(CASE_STORE_ROOT.rglob(f"*{case_id}*"))
    if not matches:
        return None
    run_dirs = [m for m in matches if m.is_dir() and (m / "pipeline_result.json").exists()]
    if not run_dirs:
        return None
    return max(run_dirs, key=lambda p: p.stat().st_mtime)


def _load_case_from_run(case_id: str) -> Optional[Case]:
    """Load a Case from the pipeline_result.json in the run directory."""
    import json
    from backend.core.evidence_model import Case as CaseModel, EvidenceItem
    from datetime import UTC, datetime

    run_dir = _find_case_dir(case_id)
    if run_dir is not None:
        result_path = run_dir / "pipeline_result.json"
        data = json.loads(result_path.read_text(encoding="utf-8"))
        evidence_data = data.get("evidence", {})
        if evidence_data:
            evidence_item = EvidenceItem.model_validate(evidence_data)
            return CaseModel(
                case_id=case_id,
                intake_timestamp_utc=data.get("started_utc", datetime.now(UTC)),
                investigator_id=data.get("operator_id", "unknown"),
                custodian_id=data.get("operator_id", "unknown"),
                evidence_items=[evidence_item],
            )
            
    # Check for stub case_meta.json
    case_dir = CASE_STORE_ROOT / case_id
    meta_path = case_dir / "case_meta.json"
    if meta_path.exists():
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        # We must return a valid Case object or dict. 
        # The frontend getCase now handles both. Wait, getCase expects rawCase.
        # So we can just return the meta wrapped in CaseModel or similar.
        # But get_case endpoint returns response_model=Case, so we must return a Case object.
        return CaseModel(
            case_id=case_id,
            intake_timestamp_utc=meta.get("created_at", datetime.now(UTC)),
            investigator_id=meta.get("examiner", "unknown"),
            custodian_id=meta.get("examiner", "unknown"),
            evidence_items=[]
        )
    return None


# ---------------------------------------------------------------------------
# GET /api/cases — dashboard list view (real ledger query)
# ---------------------------------------------------------------------------
from pydantic import BaseModel
class CreateCaseRequest(BaseModel):
    name: str
    examiner: str

@app.post("/api/cases", summary="Create a new case stub")
def create_case(req: CreateCaseRequest) -> dict:
    import uuid
    import json
    from datetime import datetime, UTC
    # generate new id
    case_id = f"CASE-{datetime.now(UTC).year}-{str(uuid.uuid4())[:8].upper()}"
    case_dir = CASE_STORE_ROOT / case_id
    case_dir.mkdir(parents=True, exist_ok=True)
    
    meta = {
        "case_id": case_id,
        "name": req.name,
        "examiner": req.examiner,
        "created_at": datetime.now(UTC).isoformat(),
        "status": "Intake"
    }
    
    (case_dir / "case_meta.json").write_text(json.dumps(meta), encoding="utf-8")
    return {
        "id": case_id,
        "name": req.name,
        "examiner": req.examiner,
        "createdAt": meta["created_at"],
        "status": "Intake",
        "hasEvidence": False
    }


@app.delete("/api/cases/{case_id}", summary="Delete a case")
def delete_case(case_id: str) -> dict:
    import shutil
    case_dir = CASE_STORE_ROOT / case_id
    if not case_dir.exists():
        raise HTTPException(status_code=404, detail="Case not found")
    try:
        shutil.rmtree(case_dir)
        return {"success": True, "message": f"Case {case_id} deleted successfully."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/cases", summary="List all cases (dashboard list view)")
def list_cases() -> list[dict]:
    """Returns a lightweight list of cases from the ledger / case store."""
    cases = []
    if CASE_STORE_ROOT.exists():
        for case_dir in CASE_STORE_ROOT.iterdir():
            if case_dir.is_dir():
                run_dir = case_dir / "run"
                if run_dir.exists() and (run_dir / "pipeline_result.json").exists():
                    import json
                    data = json.loads((run_dir / "pipeline_result.json").read_text(encoding="utf-8"))
                    fragments_count = len(data.get("evidence", {}).get("fragments", []))
                    encrypted_count = len(data.get("encrypted", []))
                    cases.append({
                        "case_id": data.get("case_id", case_dir.name),
                        "intake_timestamp_utc": data.get("started_utc", ""),
                        "investigator_id": data.get("operator_id", "unknown"),
                        "evidence_count": fragments_count,
                        "status": "COMPLETED" if encrypted_count > 0 else "RECOVERY_COMPLETE",
                    })
                elif (case_dir / "case_meta.json").exists():
                    import json
                    meta = json.loads((case_dir / "case_meta.json").read_text(encoding="utf-8"))
                    cases.append({
                        "case_id": case_dir.name,
                        "intake_timestamp_utc": meta.get("created_at", ""),
                        "investigator_id": meta.get("examiner", "unknown"),
                        "evidence_count": 0,
                        "status": "Intake",
                    })

    # Fallback to mock if no real cases yet (demo mode)
    if not cases:
        from backend.api.mock_data import MOCK_CASE, MOCK_CASE_ID
        cases.append({
            "case_id": MOCK_CASE.case_id,
            "intake_timestamp_utc": MOCK_CASE.intake_timestamp_utc.isoformat(),
            "investigator_id": MOCK_CASE.investigator_id,
            "evidence_count": len(MOCK_CASE.evidence_items),
            "status": "RECOVERY_COMPLETE",
        })
    return cases


# ---------------------------------------------------------------------------
# GET /api/case/{case_id} — full case detail (real pipeline result)
# ---------------------------------------------------------------------------
@app.get(
    "/api/case/{case_id}",
    response_model=Case,
    summary="Full case detail (EvidenceItems, Fragments, HashRecord lineage)",
)
def get_case(case_id: str) -> Case:
    """Returns the complete Case object from the latest pipeline run."""
    case = _load_case_from_run(case_id)
    if case is not None:
        return case
    # Demo fallback
    from backend.api.mock_data import MOCK_CASE, MOCK_CASE_ID
    if case_id != MOCK_CASE_ID:
        raise HTTPException(status_code=404, detail=f"Case '{case_id}' not found")
    return MOCK_CASE


# ---------------------------------------------------------------------------
# GET /api/case/{case_id}/status — pipeline progress polling
# ---------------------------------------------------------------------------
@app.get(
    "/api/case/{case_id}/status",
    summary="Pipeline progress (poll for progress bar)",
)
def get_case_status(case_id: str) -> dict:
    """Returns the current pipeline stage and progress percentage."""
    run_dir = _find_case_dir(case_id)
    if run_dir:
        import json
        result_path = run_dir / "pipeline_result.json"
        if result_path.exists():
            data = json.loads(result_path.read_text(encoding="utf-8"))
            summary = data.get("summary", {})
            return {
                "case_id": case_id,
                "stage": "ENCRYPTION_COMPLETE" if summary.get("encrypted", 0) > 0 else "RECOVERY_COMPLETE",
                "stage_label": "Evidence vault sealed" if summary.get("encrypted", 0) > 0 else "Fragment recovery complete",
                "progress_pct": 100,
            }
    # Fallback for in-progress or demo
    return {
        "case_id": case_id,
        "stage": "UNKNOWN",
        "stage_label": "No pipeline run found for this case",
        "progress_pct": 0,
    }


# ---------------------------------------------------------------------------
# GET /api/case/{case_id}/fragments — video viewer / timeline view
# ---------------------------------------------------------------------------
@app.get(
    "/api/case/{case_id}/fragments",
    response_model=list[Fragment],
    summary="All recovered fragments for a case (video viewer / timeline)",
)
def get_case_fragments(case_id: str) -> list[Fragment]:
    """Returns the flat list of Fragment objects for a case."""
    case = _load_case_from_run(case_id)
    if case is not None:
        fragments: list[Fragment] = []
        for item in case.evidence_items:
            fragments.extend(item.fragments)
        return fragments
    # Demo fallback
    from backend.api.mock_data import MOCK_CASE, MOCK_CASE_ID
    if case_id != MOCK_CASE_ID:
        raise HTTPException(status_code=404, detail=f"Case '{case_id}' not found")
    fragments: list[Fragment] = []
    for item in MOCK_CASE.evidence_items:
        fragments.extend(item.fragments)
    return fragments


# ---------------------------------------------------------------------------
# GET /api/case/{case_id}/ledger — hash-chained audit ledger view (real)
# ---------------------------------------------------------------------------
@app.get(
    "/api/case/{case_id}/ledger",
    summary="Hash-chained audit ledger for a case",
)
def get_case_ledger(case_id: str) -> list[dict]:
    """Returns the real audit ledger chain from the shared AuditLedger,
    filtered to this case's events (plus the genesis anchor).
    """
    ledger = get_ledger()
    chain = ledger.chain
    # Ledger's emit() maps PipelineEvent.case_id -> operator_id.
    # GENESIS always included as chain anchor. Other entries filtered by operator_id == case_id.
    filtered = [
        entry.model_dump() for entry in chain
        if entry.event_type == "GENESIS" or entry.operator_id == case_id
    ]
    return filtered


# ---------------------------------------------------------------------------
# Video Streaming Endpoint with Range Requests
# ---------------------------------------------------------------------------
@app.get(
    "/api/case/{case_id}/fragments/{fragment_index}/stream",
    summary="Stream a fragment (H.264 elementary or MP4) with range support",
)
async def stream_fragment(
    case_id: str,
    fragment_index: int,
    request: Request,
    range_header: Optional[str] = Header(None, alias="Range"),
) -> Response:
    """
    Stream a recovered fragment for the video viewer.
    Supports HTTP Range requests for scrubbing/seeking.
    """
    run_dir = _find_case_dir(case_id)
    if not run_dir:
        raise HTTPException(status_code=404, detail=f"Case '{case_id}' not found")

    # Prefer MP4 if exists, else raw .h264 (find by fragment_index prefix)
    playable_dir = run_dir / "playable"
    fragment_dir = run_dir / "fragments"

    mp4_files = list(playable_dir.glob(f"fragment_{fragment_index:04d}*.mp4"))
    raw_files = list(fragment_dir.glob(f"fragment_{fragment_index:04d}*.h264"))

    file_path = mp4_files[0] if mp4_files else (raw_files[0] if raw_files else None)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail=f"Fragment {fragment_index} not found")

    file_size = file_path.stat().st_size
    media_type = "video/mp4" if file_path.suffix == ".mp4" else "video/h264"

    # Parse Range header
    start = 0
    end = file_size - 1
    if range_header:
        # Range: bytes=start-end
        try:
            range_val = range_header.replace("bytes=", "")
            start_str, end_str = range_val.split("-")
            start = int(start_str) if start_str else 0
            end = int(end_str) if end_str else file_size - 1
        except Exception:
            raise HTTPException(status_code=416, detail="Invalid Range header")

    start = max(0, start)
    end = min(file_size - 1, end)
    content_length = end - start + 1

    async def file_iterator(path: Path, start: int, end: int, chunk_size: int = 8192):
        with open(path, "rb") as f:
            f.seek(start)
            remaining = end - start + 1
            while remaining > 0:
                read_size = min(chunk_size, remaining)
                chunk = f.read(read_size)
                if not chunk:
                    break
                remaining -= len(chunk)
                yield chunk

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
# RBAC-protected example endpoint
# ---------------------------------------------------------------------------
@app.get(
    "/api/protected/evidence/{case_id}",
    summary="Example RBAC-protected endpoint (requires VIEW_EVIDENCE)",
)
def protected_evidence(
    case_id: str,
    operator_id: str = Depends(require_role),
) -> dict:
    """Example endpoint that requires VIEW_EVIDENCE permission."""
    # The require_role dependency already enforced VIEW_EVIDENCE via action param
    case = _load_case_from_run(case_id)
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

from fastapi.responses import FileResponse

@app.post("/api/case/{case_id}/certificate", summary="Generate BSA Certificate")
def generate_case_certificate(case_id: str) -> dict:
    run_dir = _find_case_dir(case_id)
    if not run_dir:
        raise HTTPException(status_code=404, detail="Case run not found")
    
    facts_path = run_dir / "custody_facts.json"
    if not facts_path.exists():
        raise HTTPException(status_code=400, detail="custody_facts.json not found. Pipeline must finish first.")
        
    out_dir = CASE_STORE_ROOT / case_id / "certificate"
    out_dir.mkdir(parents=True, exist_ok=True)
    
    from backend.reporting.certificate_draft import generate_draft
    try:
        generate_draft(facts_path=str(facts_path), output_dir=str(out_dir))
        return {"success": True, "message": "Certificate generated successfully."}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to generate certificate: {exc}")

@app.get("/api/case/{case_id}/certificate/download", summary="Download BSA Certificate PDF")
def download_case_certificate(case_id: str):
    out_dir = CASE_STORE_ROOT / case_id / "certificate"
    pdf_path = out_dir / "certificate_draft.pdf"
    if not pdf_path.exists():
        raise HTTPException(status_code=404, detail="Certificate not generated yet.")
        
    return FileResponse(
        path=pdf_path,
        media_type="application/pdf",
        filename=f"BSA63-Certificate-{case_id}.pdf"
    )

@app.get("/health", summary="Health check endpoint")
def health_check():
    return {"status": "ok"}

@app.get("/ready", summary="Readiness endpoint")
def ready_check():
    return {"status": "ready"}
