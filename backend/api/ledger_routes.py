"""
Ledger & RBAC API routes — FastAPI router.

Uses global shared instances from backend.api.main
"""

from __future__ import annotations

import base64
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from backend.api.shared import get_event_sink, get_ledger, get_rbac_controller, require_role
from backend.ledger.rbac import Role
from backend.adapters.dahua import DahuaAdapter


# Get shared instances
event_sink = get_event_sink()
ledger = get_ledger()
rbac = get_rbac_controller()
dahua = DahuaAdapter()

# Assign default roles to the shared RBAC controller
rbac.assign_role("investigator-01", Role.INVESTIGATOR)
rbac.assign_role("technical-expert-01", Role.TECHNICAL_EXPERT)
rbac.assign_role("auditor-01", Role.AUDITOR)
rbac.assign_role("court-export-01", Role.COURT_EXPORT)

router = APIRouter(prefix="/api/ledger", tags=["Ledger & RBAC"])


class TamperRequest(BaseModel):
    index: int
    payload: dict


class AccessRequest(BaseModel):
    operator_id: str
    action: str


@router.get("/chain", dependencies=[Depends(require_role("READ_LEDGER"))])
def get_chain():
    return [entry.model_dump() for entry in ledger.chain]


@router.post("/verify", dependencies=[Depends(require_role("VERIFY_INTEGRITY"))])
def verify():
    return ledger.verify_chain()


@router.post("/tamper", dependencies=[Depends(require_role("AUDIT_LOGS"))])
def tamper(req: TamperRequest):
    try:
        ledger.tamper_block(req.index, req.payload)
    except IndexError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"status": "tampered", "index": req.index}


@router.post("/restore", dependencies=[Depends(require_role("AUDIT_LOGS"))])
def restore():
    ledger.restore_chain()
    return {"status": "restored", "chain_length": ledger.length}


@router.post("/simulate-access")
def simulate_access(req: AccessRequest):
    rbac.enforce_access(req.operator_id, req.action)
    return {"status": "granted", "operator_id": req.operator_id, "action": req.action}


@router.get("/dahua/probe", dependencies=[Depends(require_role("VALIDATE_PARSER"))])
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