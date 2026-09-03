"""
Phoenix API — FastAPI application.

This is the sole API surface for the frontend. During development the endpoints
return realistic mock data so the frontend owner can build without waiting for
real adapters/crypto/ledger to be wired together.

Mock data lives in backend/api/mock_data.py and is clearly marked
# TEMP MOCK DATA — once real pipeline output is available, swap that file out
and the response shapes remain identical (they are defined by the real Pydantic
models from backend/core/evidence_model.py).
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from backend.api.mock_data import MOCK_CASE, MOCK_CASE_ID, make_mock_ledger_chain
from backend.core.evidence_model import Case, Fragment

app = FastAPI(
    title="Phoenix API",
    description=(
        "Vendor-agnostic DVR/NVR forensic pipeline — SIH 2026 · NTRO · "
        "Blockchain & Cybersecurity"
    ),
    version="0.1.0",
)

# ---------------------------------------------------------------------------
# CORS — allow localhost on any port so the frontend dev server can call us
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
# GET /api/cases — dashboard list view
# ---------------------------------------------------------------------------
@app.get("/api/cases", summary="List all cases (dashboard list view)")
def list_cases() -> list[dict]:
    """Returns a lightweight list of cases for the dashboard.

    Each entry contains only the fields needed for the list view — the full
    ``Case`` object is available via GET /api/case/{case_id}.

    # TEMP MOCK — replace with real DB/ledger query once ledger branch lands
    """
    return [
        {
            "case_id": MOCK_CASE.case_id,
            "intake_timestamp_utc": MOCK_CASE.intake_timestamp_utc.isoformat(),
            "investigator_id": MOCK_CASE.investigator_id,
            "evidence_count": len(MOCK_CASE.evidence_items),
            "status": "RECOVERY_COMPLETE",  # TEMP MOCK — enum from pipeline state
        }
    ]


# ---------------------------------------------------------------------------
# GET /api/case/{case_id} — full case detail
# ---------------------------------------------------------------------------
@app.get(
    "/api/case/{case_id}",
    response_model=Case,
    summary="Full case detail (EvidenceItems, Fragments, HashRecord lineage)",
)
def get_case(case_id: str) -> Case:
    """Returns the complete ``Case`` object, including all nested
    ``EvidenceItem``s, ``Fragment``s, and ``HashRecord`` lineage.

    The response is serialised directly from real Pydantic models — if the
    contract in ``evidence_model.py`` changes, this endpoint breaks loudly
    rather than silently drifting out of sync.

    # TEMP MOCK — replace with real case lookup once adapters/ledger land
    """
    if case_id != MOCK_CASE_ID:
        raise HTTPException(status_code=404, detail=f"Case '{case_id}' not found")
    return MOCK_CASE


# ---------------------------------------------------------------------------
# GET /api/case/{case_id}/status — pipeline progress polling
# ---------------------------------------------------------------------------
@app.get(
    "/api/case/{case_id}/status",
    summary="Pipeline progress (poll this for a progress bar — no websocket needed)",
)
def get_case_status(case_id: str) -> dict:
    """Returns the current pipeline stage and progress percentage.

    Designed to be polled every few seconds by a frontend progress bar.
    ``progress_pct`` is 0–100; ``stage`` is a human-readable string.

    # TEMP MOCK — replace with real pipeline state tracking
    """
    if case_id != MOCK_CASE_ID:
        raise HTTPException(status_code=404, detail=f"Case '{case_id}' not found")
    return {
        "case_id": case_id,
        "stage": "RECOVERY_COMPLETE",
        "stage_label": "Fragment recovery complete — ready for AI triage",
        "progress_pct": 100,
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
    """Returns the flat list of ``Fragment`` objects for a case.

    Used by the video viewer and the timeline view to enumerate recovered
    footage segments. Each fragment carries a ``fragment_id`` (UUID4) that
    ``DetectionResult`` objects reference via their own ``fragment_id`` field.

    # TEMP MOCK — replace with real fragment list from EvidenceItem
    """
    if case_id != MOCK_CASE_ID:
        raise HTTPException(status_code=404, detail=f"Case '{case_id}' not found")
    fragments: list[Fragment] = []
    for item in MOCK_CASE.evidence_items:
        fragments.extend(item.fragments)
    return fragments


# ---------------------------------------------------------------------------
# GET /api/case/{case_id}/ledger — hash-chained audit ledger view
# ---------------------------------------------------------------------------
@app.get(
    "/api/case/{case_id}/ledger",
    summary="Hash-chained audit ledger for a case",
)
def get_case_ledger(case_id: str) -> list[dict]:
    """Returns the audit ledger as a **hash-chained list**, ordered by
    sequence number, suitable for a frontend chain-verification display.

    Each entry includes:
    - ``seq``: position in the chain
    - ``event_type``: pipeline event identifier
    - ``description``: human-readable event description
    - ``timestamp_utc``: ISO-8601 UTC timestamp
    - ``entry_hash``: SHA-256 of this entry (hex)
    - ``prev_hash``: SHA-256 of the previous entry (hex) — ``000...`` for genesis

    Note: This is a permissioned, signed, hash-chained audit ledger.
    It is NOT called a blockchain — a real distributed ledger requires
    multi-party consensus this single-node prototype does not implement.

    # TEMP MOCK — replace with real ledger.get_history() call once ledger branch lands
    """
    if case_id != MOCK_CASE_ID:
        raise HTTPException(status_code=404, detail=f"Case '{case_id}' not found")
    return make_mock_ledger_chain()
