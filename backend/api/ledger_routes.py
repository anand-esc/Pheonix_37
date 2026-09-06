"""
Ledger & RBAC API routes — FastAPI router.

Uses global shared instances from backend.api.main
"""

from __future__ import annotations

import base64
from typing import Optional
from fastapi import APIRouter, Header, HTTPException, Query
from pydantic import BaseModel

from backend.api.shared import get_event_sink, get_ledger, get_rbac_controller
from backend.ledger.rbac import Role
from backend.adapters.dahua import DahuaAdapter


# Get shared instances
event_sink = get_event_sink()
ledger = get_ledger()
rbac = get_rbac_controller()
dahua = DahuaAdapter()

# Assign default roles to the shared RBAC controller
rbac.assign_role("sat-01", Role.INVESTIGATOR)
rbac.assign_role("tech-02", Role.TECHNICAL_EXPERT)
rbac.assign_role("audit-03", Role.AUDITOR)
rbac.assign_role("court-04", Role.COURT_EXPORT)

router = APIRouter(prefix="/api/ledger", tags=["Ledger & RBAC"])


class TamperRequest(BaseModel):
    index: int
    payload: dict


class AccessRequest(BaseModel):
    operator_id: str
    action: str


class ResetResponse(BaseModel):
    status: str
    message: str
    genesis_block: dict
    total_entries: int


@router.get("/chain")
def get_chain():
    return [entry.model_dump() for entry in ledger.chain]


@router.post("/verify")
def verify():
    return ledger.verify_chain()


@router.post("/tamper")
def tamper(req: TamperRequest):
    try:
        ledger.tamper_block(req.index, req.payload)
    except IndexError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"status": "tampered", "index": req.index}


@router.post("/restore")
def restore():
    ledger.restore_chain()
    return {"status": "restored", "chain_length": ledger.length}


@router.post("/reset", response_model=ResetResponse)
def reset_ledger(
    operator_id: Optional[str] = Header(None, alias="X-Operator-ID"),
    demo: bool = Query(False, description="Bypass RBAC for demo runs"),
) -> ResetResponse:
    if not demo and operator_id is not None:
        role = rbac.get_role(operator_id)
        if role is None or role.value != Role.AUDITOR.value:
            raise HTTPException(status_code=403, detail="Access denied: reset requires AUDITOR role")

    ledger.reset()
    genesis_block = ledger.chain[0].model_dump()
    return ResetResponse(
        status="success",
        message="Ledger state has been reset to Genesis block.",
        genesis_block=genesis_block,
        total_entries=ledger.length,
    )


@router.post("/simulate-access")
def simulate_access(req: AccessRequest):
    rbac.enforce_access(req.operator_id, req.action)
    return {"status": "granted", "operator_id": req.operator_id, "action": req.action}


@router.get("/dahua/probe")
def dahua_probe(data_b64: Optional[str] = None, file_path: Optional[str] = None):
    if data_b64:
        raw = base64.b64decode(data_b64)
    elif file_path:
        try:
            with open(file_path, "rb") as f:
                raw = f.read(64)
        except FileNotFoundError:
            raise HTTPException(status_code=404, detail="File not found")
    else:
        raise HTTPException(status_code=400, detail="Provide data_b64 or file_path")
    detected = dahua.detect(raw)
    result = {"detected": detected, "bytes_checked": len(raw)}
    if detected:
        fragments = dahua.parse_fragments(raw)
        result["fragments"] = fragments
    return result