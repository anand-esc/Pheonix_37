#!/usr/bin/env python
"""Test that /api/case/{id}/ledger correctly filters by case_id."""
import os
os.environ['PHOENIX_LEDGER_SECRET'] = 'test-secret-123'

import tempfile
import shutil
from pathlib import Path
from fastapi.testclient import TestClient
from backend.api.main import app
from backend.api.routes_acquisition import store
from backend.api.shared import get_event_sink, get_ledger

from tests.fixtures.build_fixtures import build_dvr_image

def run_acquisition_job(case_id: str, operator_id: str, out_dir: Path) -> str:
    """Start an acquisition job and wait for completion. Returns job_id."""
    out_dir.mkdir(parents=True, exist_ok=True)
    build_dvr_image(out_dir / "sample.img", size_bytes=512 * 1024, seed=5, vendor_variant="none")
    client = TestClient(app, headers={"X-Operator-ID": "investigator-01"})
    r = client.post('/acquisition/runs', json={
        'source_path': str(out_dir / "sample.img"),
        'case_id': case_id,
        'operator_id': operator_id,
        'out_dir': str(out_dir),
        'encrypt': True
    }, params={'wait': True})
    assert r.status_code == 202, f"Job start failed: {r.status_code} {r.text}"
    job_id = r.json()['job_id']
    
    # Copy results to case_store for dashboard
    case_store = Path('./case_store') / case_id / 'run'
    case_store.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(out_dir, case_store, dirs_exist_ok=True)
    
    return job_id


def test_ledger_filtering():
    print("=== Testing ledger case_id filtering ===\n")
    
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_path = Path(tmpdir)
        
        # Run first case
        print("1. Running CASE-A...")
        run_acquisition_job('CASE-A', 'op-a', tmp_path / 'run_a')
        
        # Run second case
        print("2. Running CASE-B...")
        run_acquisition_job('CASE-B', 'op-b', tmp_path / 'run_b')
        
        client = TestClient(app, headers={"X-Operator-ID": "investigator-01"})
        
        # Check CASE-A ledger
        print("\n3. Checking /api/case/CASE-A/ledger...")
        r = client.get('/api/case/CASE-A/ledger')
        assert r.status_code == 200
        ledger_a = r.json()
        event_types_a = [e['event_type'] for e in ledger_a]
        print(f"   Entries: {len(ledger_a)}")
        print(f"   Event types: {event_types_a}")
        
        # Verify CASE-A events present
        assert 'GENESIS' in event_types_a
        assert 'intake_started' in event_types_a
        assert 'intake_completed' in event_types_a
        assert 'format_detected' in event_types_a
        assert 'adapter_resolved' in event_types_a
        assert 'recovery_started' in event_types_a
        assert 'recovery_completed' in event_types_a
        assert 'fragment_exported' in event_types_a
        assert 'encryption_completed' in event_types_a
        
        # Verify NO CASE-B events in CASE-A ledger
        # (CASE-B events would have operator_id='CASE-B')
        # Since CASE-A ledger filters by operator_id == 'CASE-A', it should only have CASE-A events
        # The event_types are the same, but the operator_id differs
        # We can check by verifying the number of non-GENESIS entries matches expected
        non_genesis_a = [e for e in ledger_a if e['event_type'] != 'GENESIS']
        print(f"   Non-GENESIS entries for CASE-A: {len(non_genesis_a)}")
        assert len(non_genesis_a) == 13  # 13 pipeline events per case
        
        # Check CASE-B ledger
        print("\n4. Checking /api/case/CASE-B/ledger...")
        r = client.get('/api/case/CASE-B/ledger')
        assert r.status_code == 200
        ledger_b = r.json()
        event_types_b = [e['event_type'] for e in ledger_b]
        print(f"   Entries: {len(ledger_b)}")
        print(f"   Event types: {event_types_b}")
        
        non_genesis_b = [e for e in ledger_b if e['event_type'] != 'GENESIS']
        print(f"   Non-GENESIS entries for CASE-B: {len(non_genesis_b)}")
        assert len(non_genesis_b) == 13
        
        # Verify GENESIS appears in both
        genesis_a = [e for e in ledger_a if e['event_type'] == 'GENESIS']
        genesis_b = [e for e in ledger_b if e['event_type'] == 'GENESIS']
        assert len(genesis_a) == 1
        assert len(genesis_b) == 1
        # Both should have the SAME genesis entry (it's the chain anchor)
        assert genesis_a[0] == genesis_b[0]
        
        # Verify the operator_id filtering works by checking raw ledger entries
        # The ledger stores operator_id = case_id from PipelineEvent
        print("\n5. Verifying operator_id filtering in raw ledger...")
        raw_ledger = get_ledger().chain
        print(f"   Total raw ledger entries: {len(raw_ledger)}")
        case_a_raw = [e for e in raw_ledger if e.operator_id == 'CASE-A']
        case_b_raw = [e for e in raw_ledger if e.operator_id == 'CASE-B']
        genesis_raw = [e for e in raw_ledger if e.event_type == 'GENESIS']
        print(f"   Raw entries with operator_id=CASE-A: {len(case_a_raw)}")
        print(f"   Raw entries with operator_id=CASE-B: {len(case_b_raw)}")
        print(f"   Raw GENESIS entries: {len(genesis_raw)}")
        
        assert len(case_a_raw) == 13
        assert len(case_b_raw) == 13
        assert len(genesis_raw) == 1
        
        # Verify API filtering matches raw filtering
        assert len(ledger_a) == len(genesis_raw) + len(case_a_raw)  # 1 + 13 = 14
        assert len(ledger_b) == len(genesis_raw) + len(case_b_raw)  # 1 + 13 = 14
        
        print("\n=== ALL FILTERING TESTS PASSED ===")
        print(f"   CASE-A ledger: 1 GENESIS + 13 case events = {len(ledger_a)} entries")
        print(f"   CASE-B ledger: 1 GENESIS + 13 case events = {len(ledger_b)} entries")
        print(f"   Global raw ledger: 1 GENESIS + 13 CASE-A + 13 CASE-B = {len(raw_ledger)} entries")


if __name__ == '__main__':
    test_ledger_filtering()