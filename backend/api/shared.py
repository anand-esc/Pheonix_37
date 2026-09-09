"""Shared global state for the API layer."""

from backend.ledger.event_bus import InMemoryEventSink
from backend.ledger.audit_ledger import AuditLedger
from backend.ledger.rbac import RBACController, init_rbac


_event_sink: InMemoryEventSink | None = None
_ledger: AuditLedger | None = None
_rbac_controller: RBACController | None = None


def get_event_sink() -> InMemoryEventSink:
    global _event_sink
    if _event_sink is None:
        _event_sink = InMemoryEventSink()
    return _event_sink


def get_ledger() -> AuditLedger:
    global _ledger
    if _ledger is None:
        _ledger = AuditLedger(event_sink=get_event_sink())
    return _ledger


def get_rbac_controller() -> RBACController:
    global _rbac_controller
    if _rbac_controller is None:
        _rbac_controller = init_rbac(get_event_sink())
    return _rbac_controller

from fastapi import Header, HTTPException

def require_role(action: str):
    def _dependency(operator_id: str = Header(..., alias="X-Operator-ID")) -> str:
        try:
            get_rbac_controller().enforce_access(operator_id, action)
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=403, detail=f"RBAC error: {exc}")
        return operator_id
    return _dependency

# Initialize RBAC immediately (works for both server and TestClient)
get_rbac_controller()