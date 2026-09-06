"""
Comprehensive test suite for Audit Ledger, RBAC Controller, EventSink, and DahuaAdapter.

Tests cover:
1. DahuaAdapter header magic detection and slice carving
2. InMemoryEventSink pub/sub subscriber distribution
3. AuditLedger hash-chain continuity and HMAC-SHA256 signature verification
4. AuditLedger tamper detection (tamper_block) and restoration (restore_chain)
5. AuditLedger auto-ingestion of events from InMemoryEventSink
6. Deny-by-default RBAC permission enforcement and mandatory event emission for grants & denials
"""
from __future__ import annotations
import struct
import hashlib
import os

import pytest
from fastapi import HTTPException

from backend.adapters.dahua import DahuaAdapter
from backend.ledger.event_bus import InMemoryEventSink
from backend.ledger.audit_ledger import AuditLedger, LedgerEntry
from backend.ledger.rbac import RBACController, Role, ROLE_PERMISSIONS


# ---------------------------------------------------------------------------
# Test setup: ensure PHOENIX_LEDGER_SECRET is set for all tests
# ---------------------------------------------------------------------------
@pytest.fixture(autouse=True)
def setup_ledger_secret(monkeypatch):
    """Sets the required ledger secret env var for all ledger tests."""
    monkeypatch.setenv("PHOENIX_LEDGER_SECRET", "test-ledger-secret-12345")


def _make_dhav_frame(payload: bytes, seq: int = 1, ts: int = 1000) -> bytes:
    """Build a minimal DHAV frame for testing."""
    frame_len = 16 + len(payload)
    header = (
        b"DHAV"
        + bytes([0xFC, 0x01, 0x00, seq])
        + struct.pack("<I", frame_len)
        + struct.pack("<I", ts)
    )
    return header + payload


# ===================================================================
# DahuaAdapter tests
# ===================================================================

class TestDahuaAdapter:
    def setup_method(self):
        self.adapter = DahuaAdapter()

    def test_detect_dhav_magic(self):
        assert self.adapter.detect(b"DHAV" + b"\x00" * 60) is True

    def test_detect_dhfs_magic(self):
        assert self.adapter.detect(b"DHFS" + b"\x00" * 60) is True

    def test_detect_rejects_unknown(self):
        assert self.adapter.detect(b"MPEG" + b"\x00" * 60) is False

    def test_detect_short_input(self):
        assert self.adapter.detect(b"DH") is False

    def test_parse_fragments_single_frame(self):
        payload = b"\x00\x00\x00\x01\x65" + b"\xAB" * 50
        raw = _make_dhav_frame(payload, seq=7, ts=9999)
        frags = self.adapter.parse_fragments(raw)
        assert len(frags) == 1
        f = frags[0]
        assert f["offset"] == 0
        assert f["length"] == len(payload)
        assert f["sequence_id"] == 7
        assert f["timestamp"] == 9999
        assert f["codec"] == "H.264"
        assert f["sha256"] == hashlib.sha256(payload).hexdigest()

    def test_parse_fragments_multiple_frames(self):
        p1 = b"\x00\x00\x00\x01\x65" + b"\xAA" * 20
        p2 = b"\x00\x00\x00\x01\x41" + b"\xBB" * 30
        raw = _make_dhav_frame(p1, seq=1, ts=100) + _make_dhav_frame(p2, seq=2, ts=200)
        frags = self.adapter.parse_fragments(raw)
        assert len(frags) == 2
        assert frags[0]["sequence_id"] == 1
        assert frags[1]["sequence_id"] == 2

    def test_parse_fragments_empty_input(self):
        assert self.adapter.parse_fragments(b"") == []

    def test_parse_fragments_from_bytes(self):
        payload = b"\x00\x00\x00\x01\x65" + b"\xCC" * 10
        raw = _make_dhav_frame(payload)
        frags = self.adapter.parse_fragments(raw)
        assert len(frags) == 1


# ===================================================================
# InMemoryEventSink tests
# ===================================================================

class TestInMemoryEventSink:
    def test_subscribe_and_publish(self):
        sink = InMemoryEventSink()
        received = []
        sink.subscribe(lambda e: received.append(e))
        sink.publish({"event_type": "INTAKE", "operator_id": "op-1", "details": {}})
        assert len(received) == 1
        assert received[0]["event_type"] == "INTAKE"

    def test_multiple_subscribers(self):
        sink = InMemoryEventSink()
        a, b = [], []
        sink.subscribe(lambda e: a.append(e))
        sink.subscribe(lambda e: b.append(e))
        sink.publish({"event_type": "CARVING", "operator_id": "op-2", "details": {}})
        assert len(a) == 1 and len(b) == 1

    def test_event_count(self):
        sink = InMemoryEventSink()
        sink.publish({"event_type": "X", "operator_id": "x", "details": {}})
        sink.publish({"event_type": "Y", "operator_id": "y", "details": {}})
        assert sink.event_count == 2

    def test_subscriber_exception_does_not_break_others(self):
        sink = InMemoryEventSink()
        good = []
        sink.subscribe(lambda e: (_ for _ in ()).throw(ValueError("boom")))
        sink.subscribe(lambda e: good.append(e))
        sink.publish({"event_type": "Z", "operator_id": "z", "details": {}})
        assert len(good) == 1


# ===================================================================
# AuditLedger tests
# ===================================================================

class TestAuditLedger:
    def test_genesis_block_exists(self):
        ledger = AuditLedger()
        assert ledger.length == 1
        genesis = ledger.chain[0]
        assert genesis.index == 0
        assert genesis.event_type == "GENESIS"
        assert genesis.prev_hash == "0" * 64

    def test_append_entry(self):
        ledger = AuditLedger()
        entry = ledger.append_entry("CARVING", "op-1", {"file": "clip.dav"})
        assert entry.index == 1
        assert entry.event_type == "CARVING"
        assert entry.operator_id == "op-1"
        assert ledger.length == 2

    def test_chain_integrity_valid(self):
        ledger = AuditLedger()
        ledger.append_entry("INTAKE", "op-1", {"src": "cam-01"})
        ledger.append_entry("CARVING", "op-2", {"fragments": 5})
        result = ledger.verify_chain()
        assert result["is_valid"] is True
        assert result["broken_index"] is None

    def test_tamper_breaks_chain(self):
        ledger = AuditLedger()
        ledger.append_entry("INTAKE", "op-1", {"src": "cam-01"})
        ledger.append_entry("EXPORT", "op-2", {"dest": "usb"})
        ledger.tamper_block(1, {"src": "TAMPERED"})
        result = ledger.verify_chain()
        assert result["is_valid"] is False
        assert result["broken_index"] is not None

    def test_restore_fixes_chain(self):
        ledger = AuditLedger()
        ledger.append_entry("INTAKE", "op-1", {})
        ledger.tamper_block(1, {"bad": True})
        assert ledger.verify_chain()["is_valid"] is False
        ledger.restore_chain()
        assert ledger.verify_chain()["is_valid"] is True

    def test_eventsink_auto_ingestion(self):
        sink = InMemoryEventSink()
        ledger = AuditLedger(event_sink=sink)
        assert ledger.length == 1
        sink.publish({"event_type": "ENCRYPTION", "operator_id": "op-3",
                       "details": {"algo": "AES-256"}})
        assert ledger.length == 2
        assert ledger.chain[1].event_type == "ENCRYPTION"

    def test_tamper_out_of_range(self):
        ledger = AuditLedger()
        with pytest.raises(IndexError):
            ledger.tamper_block(99, {})


# ===================================================================
# RBAC tests
# ===================================================================

class TestRBAC:
    def setup_method(self):
        self.sink = InMemoryEventSink()
        self.ledger = AuditLedger(event_sink=self.sink)
        self.rbac = RBACController(event_sink=self.sink)
        self.rbac.assign_role("inv-01", Role.INVESTIGATOR)
        self.rbac.assign_role("tech-01", Role.TECHNICAL_EXPERT)
        self.rbac.assign_role("aud-01", Role.AUDITOR)
        self.rbac.assign_role("court-01", Role.COURT_EXPORT)

    def test_access_granted(self):
        result = self.rbac.enforce_access("inv-01", "VIEW_EVIDENCE")
        assert result is True

    def test_access_denied_wrong_permission(self):
        with pytest.raises(HTTPException) as exc_info:
            self.rbac.enforce_access("inv-01", "EXPORT_BUNDLE")
        assert exc_info.value.status_code == 403

    def test_access_denied_unknown_operator(self):
        with pytest.raises(HTTPException) as exc_info:
            self.rbac.enforce_access("ghost-99", "VIEW_EVIDENCE")
        assert exc_info.value.status_code == 403

    def test_granted_event_logged_to_ledger(self):
        initial = self.ledger.length
        self.rbac.enforce_access("aud-01", "READ_LEDGER")
        assert self.ledger.length == initial + 1
        last = self.ledger.chain[-1]
        assert last.event_type == "ACCESS_GRANTED"

    def test_denied_event_logged_to_ledger(self):
        initial = self.ledger.length
        with pytest.raises(HTTPException):
            self.rbac.enforce_access("court-01", "RUN_CARVING")
        assert self.ledger.length == initial + 1
        last = self.ledger.chain[-1]
        assert last.event_type == "ACCESS_DENIED"

    def test_all_roles_have_permissions(self):
        for role in Role:
            assert role in ROLE_PERMISSIONS
            assert len(ROLE_PERMISSIONS[role]) > 0

    def test_technical_expert_permissions(self):
        self.rbac.enforce_access("tech-01", "VALIDATE_PARSER")
        self.rbac.enforce_access("tech-01", "GENERATE_CERT_DRAFT")
        self.rbac.enforce_access("tech-01", "EXPORT_REPORT")

    def test_court_export_permissions(self):
        self.rbac.enforce_access("court-01", "EXPORT_BUNDLE")
        self.rbac.enforce_access("court-01", "VIEW_CERTIFICATE")
