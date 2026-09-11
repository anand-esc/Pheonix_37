"""Shared global state for the API layer."""

import os

from backend.ledger.audit_ledger import AuditLedger
from backend.ledger.event_bus import InMemoryEventSink
from backend.ledger.rbac import RBACController, Role, init_rbac

_event_sink: InMemoryEventSink | None = None
_ledger: AuditLedger | None = None
_rbac_controller: RBACController | None = None

_DEMO_MODE = os.environ.get("PHOENIX_DEMO_MODE", "").lower() in ("1", "true", "yes")


def get_event_sink() -> InMemoryEventSink:
    global _event_sink
    if _event_sink is None:
        _event_sink = InMemoryEventSink()
    return _event_sink


def get_ledger() -> AuditLedger:
    global _ledger
    if _ledger is None:
        _ledger = AuditLedger(event_sink=get_event_sink(), demo_mode=_DEMO_MODE)
    return _ledger


# Operator ids the desktop client offers (frontend/src/api.js OPERATORS),
# plus the short ids used by the ledger/RBAC test-suite.
DEFAULT_OPERATORS: dict[str, Role] = {
    "investigator-01": Role.INVESTIGATOR,
    "technical-expert-01": Role.TECHNICAL_EXPERT,
    "auditor-01": Role.AUDITOR,
    "court-export-01": Role.COURT_EXPORT,
    "sat-01": Role.INVESTIGATOR,
    "tech-02": Role.TECHNICAL_EXPERT,
    "audit-03": Role.AUDITOR,
    "court-04": Role.COURT_EXPORT,
}


def get_rbac_controller() -> RBACController:
    global _rbac_controller
    if _rbac_controller is None:
        _rbac_controller = init_rbac(get_event_sink())
        for operator_id, role in DEFAULT_OPERATORS.items():
            _rbac_controller.assign_role(operator_id, role)
    return _rbac_controller


def is_demo_mode() -> bool:
    return _DEMO_MODE


# Initialize RBAC immediately (works for both server and TestClient)
get_rbac_controller()