"""
AuditLedger — append-only, tamper-evident hash-chained audit ledger.

Invariants:
  - No raw media — only SHA-256 hashes and event metadata.
  - Each entry chains via prev_hash to the preceding block.
  - HMAC-SHA256 signatures using server secret key.
  - Genesis block (index 0) is deterministic.
  - Auto-subscribes to InMemoryEventSink.
"""

from __future__ import annotations

import copy
import hashlib
import hmac
import json
import logging
import os
import threading
from datetime import datetime, timezone
from typing import Any, Optional
from pydantic import BaseModel, Field

from .event_bus import InMemoryEventSink

logger = logging.getLogger(__name__)


def _load_secret() -> str:
    """Read the HMAC signing key from the environment.

    In production, set ``PHOENIX_LEDGER_SECRET`` to a vault-managed value.
    When the variable is absent a deterministic dev/test key is used and a
    warning is emitted so the gap is visible in logs.
    """
    secret = os.environ.get("PHOENIX_LEDGER_SECRET")
    if secret:
        return secret
    logger.warning(
        "PHOENIX_LEDGER_SECRET is not set — using a non-production default key. "
        "Set this variable before deploying to production."
    )
    return "CHANGE-ME-NOT-FOR-PRODUCTION"


_DEFAULT_SECRET = _load_secret()


class LedgerEntry(BaseModel):
    index: int
    timestamp: str
    event_type: str
    operator_id: str
    payload_hash: str
    prev_hash: str
    signature: str


class AuditLedger:
    def __init__(
        self,
        event_sink: Optional[InMemoryEventSink] = None,
        secret: str = _DEFAULT_SECRET,
    ) -> None:
        self._secret = secret
        self._lock = threading.Lock()
        self._chain: list[LedgerEntry] = []
        self._backup: list[dict] = []
        self._create_genesis()
        self._event_sink = event_sink
        if event_sink is not None:
            event_sink.subscribe(self._on_event)

    def append_entry(
        self, event_type: str, operator_id: str, details: dict
    ) -> LedgerEntry:
        with self._lock:
            prev = self._chain[-1]
            index = prev.index + 1
            now = datetime.now(timezone.utc).isoformat()
            payload_hash = self._hash_payload(event_type, operator_id, details)
            prev_hash = self._hash_block(prev)
            signature = self._sign(index, payload_hash, prev_hash)

            entry = LedgerEntry(
                index=index,
                timestamp=now,
                event_type=event_type,
                operator_id=operator_id,
                payload_hash=payload_hash,
                prev_hash=prev_hash,
                signature=signature,
            )
            self._chain.append(entry)
            self._backup.append(entry.model_dump())
            return entry

    def verify_chain(self) -> dict:
        with self._lock:
            for i in range(1, len(self._chain)):
                cur = self._chain[i]
                prv = self._chain[i - 1]

                expected_prev = self._hash_block(prv)
                if cur.prev_hash != expected_prev:
                    return {
                        "is_valid": False,
                        "broken_index": i,
                        "reason": f"prev_hash mismatch at block {i}",
                    }

                expected_sig = self._sign(cur.index, cur.payload_hash, cur.prev_hash)
                if cur.signature != expected_sig:
                    return {
                        "is_valid": False,
                        "broken_index": i,
                        "reason": f"Signature mismatch at block {i}",
                    }

            return {"is_valid": True, "broken_index": None}

    def tamper_block(self, index: int, mutated_payload: dict) -> None:
        with self._lock:
            if index < 0 or index >= len(self._chain):
                raise IndexError(f"Block index {index} out of range")
            block = self._chain[index]
            tampered_hash = self._hash_payload(
                block.event_type, block.operator_id, mutated_payload
            )
            block.payload_hash = tampered_hash

    def restore_chain(self) -> None:
        with self._lock:
            self._chain = [LedgerEntry(**d) for d in self._backup]

    @property
    def chain(self) -> list[LedgerEntry]:
        with self._lock:
            return list(self._chain)

    @property
    def length(self) -> int:
        with self._lock:
            return len(self._chain)

    def _on_event(self, event: dict) -> None:
        self.append_entry(
            event.get("event_type", "UNKNOWN"),
            event.get("operator_id", "SYSTEM"),
            event.get("details", {}),
        )

    def _create_genesis(self) -> None:
        payload_hash = self._hash_payload(
            "GENESIS",
            "SYSTEM",
            {"message": "NTRO Forensic Ledger Initialized — SIH26150"},
        )
        prev_hash = "0" * 64
        signature = self._sign(0, payload_hash, prev_hash)

        genesis = LedgerEntry(
            index=0,
            timestamp=datetime.now(timezone.utc).isoformat(),
            event_type="GENESIS",
            operator_id="SYSTEM",
            payload_hash=payload_hash,
            prev_hash=prev_hash,
            signature=signature,
        )
        self._chain.append(genesis)
        self._backup.append(genesis.model_dump())

    @staticmethod
    def _hash_payload(event_type: str, operator_id: str, details: dict) -> str:
        canonical = json.dumps(
            {"event_type": event_type, "operator_id": operator_id, "details": details},
            sort_keys=True,
            separators=(",", ":"),
        )
        return hashlib.sha256(canonical.encode()).hexdigest()

    @staticmethod
    def _hash_block(entry: LedgerEntry) -> str:
        canonical = json.dumps(
            entry.model_dump(),
            sort_keys=True,
            separators=(",", ":"),
        )
        return hashlib.sha256(canonical.encode()).hexdigest()

    def _sign(self, index: int, payload_hash: str, prev_hash: str) -> str:
        msg = f"{index}:{payload_hash}:{prev_hash}"
        return hmac.new(
            self._secret.encode(), msg.encode(), hashlib.sha256
        ).hexdigest()
