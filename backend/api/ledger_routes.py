"""
Ledger & RBAC API routes — FastAPI router.
"""

from __future__ import annotations

import base64
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.ledger.event_bus import InMemoryEventSink
from backend.ledger.audit_ledger import AuditLedger
from backend.ledger.rbac import RBACController, Role
from backend.adapters.dahua import DahuaAdapter

event_sink = InMemoryEventSink()
ledger = AuditLedger(event_sink=event_sink)
rbac = RBACController(event_sink=event_sink)
dahua = DahuaAdapter()

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
