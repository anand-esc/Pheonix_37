"""
Ledger & RBAC API routes — FastAPI router.

Uses global shared instances from backend.api.main
"""

from __future__ import annotations

import base64
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.adapters.dahua import DahuaAdapter
from backend.api.auth import require_operator, require_permission
from backend.api.shared import get_ledger, get_rbac_controller

# Shared instances; operator roles are registered in backend.api.shared
ledger = get_ledger()
rbac = get_rbac_controller()
dahua = DahuaAdapter()

router = APIRouter(prefix="/api/ledger", tags=["Ledger & RBAC"])


class TamperRequest(BaseModel):
    index: int
    payload: dict


class AccessRequest(BaseModel):
    operator_id: str
    action: str


@router.get("/chain")
def get_chain(_: str = Depends(require_operator)):
    return [entry.model_dump() for entry in ledger.chain]


@router.post("/verify")
def verify(_: str = Depends(require_operator)):
    return ledger.verify_chain()


@router.post("/tamper")
def tamper(req: TamperRequest, _: str = Depends(require_permission("AUDIT_LOGS"))):
    """Demo control: deliberately corrupt one block so verify_chain can catch it.

    Restricted to auditors (AUDIT_LOGS) so the audit trail cannot be altered
    by an unprivileged client.
    """
    try:
        ledger.tamper_block(req.index, req.payload)
    except IndexError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"status": "tampered", "index": req.index}


@router.post("/restore")
def restore(_: str = Depends(require_permission("AUDIT_LOGS"))):
    ledger.restore_chain()
    return {"status": "restored", "chain_length": ledger.length}


@router.post("/simulate-access")
def simulate_access(req: AccessRequest, _: str = Depends(require_operator)):
    rbac.enforce_access(req.operator_id, req.action)
    return {"status": "granted", "operator_id": req.operator_id, "action": req.action}


@router.get("/dahua/probe")
def dahua_probe(
    data_b64: str | None = None,
    file_path: str | None = None,
    _: str = Depends(require_operator),
):
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