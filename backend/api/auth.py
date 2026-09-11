"""Operator identity and RBAC dependencies for the HTTP layer.

Every data route requires an ``X-Operator-ID`` header naming a registered
operator. Mutating routes additionally require a specific permission from
the RBAC matrix in :mod:`backend.ledger.rbac`. The required action is bound
at route-registration time, never taken from the request, so a manipulated
query string cannot escalate privileges.
"""

from __future__ import annotations

import re

from fastapi import Header, HTTPException

from backend.api.shared import get_rbac_controller
from backend.ledger.rbac import ROLE_PERMISSIONS

OPERATOR_HEADER = "X-Operator-ID"

# case ids are used as directory names under the case store, so they are
# restricted to a safe character set; ``..`` and separators are impossible.
_CASE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")


def validate_case_id(case_id: str) -> str:
    if not _CASE_ID.match(case_id) or ".." in case_id:
        raise HTTPException(status_code=400, detail="invalid case_id")
    return case_id


def _operator_or_401(operator_id: str | None) -> str:
    if not operator_id:
        raise HTTPException(
            status_code=401, detail=f"{OPERATOR_HEADER} header is required"
        )
    return operator_id


async def require_operator(
    operator_id: str | None = Header(None, alias=OPERATOR_HEADER),
) -> str:
    """The caller must be a registered operator; no specific permission."""
    operator_id = _operator_or_401(operator_id)
    if get_rbac_controller().get_role(operator_id) is None:
        raise HTTPException(
            status_code=403,
            detail=f"Access denied: operator '{operator_id}' not registered",
        )
    return operator_id


def require_permission(*actions: str):
    """Dependency factory: the caller's role must hold one of ``actions``.

    The granted (or denied) decision is recorded in the audit ledger through
    the RBAC controller's event sink.
    """

    async def _dependency(
        operator_id: str | None = Header(None, alias=OPERATOR_HEADER),
    ) -> str:
        operator_id = _operator_or_401(operator_id)
        rbac = get_rbac_controller()
        role = rbac.get_role(operator_id)
        allowed = ROLE_PERMISSIONS.get(role, []) if role is not None else []
        for action in actions:
            if action in allowed:
                rbac.enforce_access(operator_id, action)
                return operator_id
        # not permitted: enforce_access records the denial and raises 403
        rbac.enforce_access(operator_id, actions[0])
        return operator_id  # pragma: no cover - enforce_access always raises

    return _dependency
