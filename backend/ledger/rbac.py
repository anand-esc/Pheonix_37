"""
RBAC — deny-by-default access controller for forensic pipeline operators.

Every access decision (granted OR denied) emits an event through
InMemoryEventSink, which the AuditLedger auto-ingests.
"""

from __future__ import annotations

import logging
from enum import Enum
from typing import Optional
from fastapi import HTTPException

from .event_bus import InMemoryEventSink

logger = logging.getLogger(__name__)


class Role(str, Enum):
    INVESTIGATOR = "INVESTIGATOR"
    TECHNICAL_EXPERT = "TECHNICAL_EXPERT"
    AUDITOR = "AUDITOR"
    COURT_EXPORT = "COURT_EXPORT"


ROLE_PERMISSIONS: dict[Role, list[str]] = {
    Role.INVESTIGATOR: ["VIEW_EVIDENCE", "RUN_CARVING", "ANALYZE_TIMELINE"],
    Role.TECHNICAL_EXPERT: ["VALIDATE_PARSER", "GENERATE_CERT_DRAFT", "EXPORT_REPORT"],
    Role.AUDITOR: ["READ_LEDGER", "VERIFY_INTEGRITY", "AUDIT_LOGS"],
    Role.COURT_EXPORT: ["EXPORT_BUNDLE", "VIEW_CERTIFICATE"],
}


class RBACController:
    """Deny-by-default access controller tied to an event sink."""

    def __init__(self, event_sink: InMemoryEventSink) -> None:
        self._event_sink = event_sink
        self._operator_roles: dict[str, Role] = {}

    def assign_role(self, operator_id: str, role: Role) -> None:
        self._operator_roles[operator_id] = role

    def get_role(self, operator_id: str) -> Optional[Role]:
        return self._operator_roles.get(operator_id)

    def enforce_access(self, operator_id: str, action: str) -> bool:
        """Check permission; emit event; raise 403 on denial."""
        role = self._operator_roles.get(operator_id)

        if role is None:
            self._emit_denied(operator_id, action, "Unknown operator")
            raise HTTPException(
                status_code=403,
                detail=f"Access denied: operator '{operator_id}' not registered",
            )

        allowed = ROLE_PERMISSIONS.get(role, [])
        if action not in allowed:
            self._emit_denied(
                operator_id, action, f"Role {role.value} lacks permission '{action}'"
            )
            raise HTTPException(
                status_code=403,
                detail=f"Access denied: {role.value} cannot perform '{action}'",
            )

        self._event_sink.publish(
            {
                "event_type": "ACCESS_GRANTED",
                "operator_id": operator_id,
                "details": {"action": action, "role": role.value},
            }
        )
        return True

    def _emit_denied(self, operator_id: str, action: str, reason: str) -> None:
        self._event_sink.publish(
            {
                "event_type": "ACCESS_DENIED",
                "operator_id": operator_id,
                "details": {"action": action, "reason": reason},
            }
        )


_default_controller: Optional[RBACController] = None
_default_sink: Optional[InMemoryEventSink] = None


def init_rbac(event_sink: InMemoryEventSink) -> RBACController:
    global _default_controller, _default_sink
    _default_sink = event_sink
    _default_controller = RBACController(event_sink)
    return _default_controller


def get_controller() -> RBACController:
    if _default_controller is None:
        raise RuntimeError("RBAC not initialised — call init_rbac() first")
    return _default_controller


def enforce_access(operator_id: str, action: str) -> bool:
    return get_controller().enforce_access(operator_id, action)
