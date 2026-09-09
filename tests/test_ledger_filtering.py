#!/usr/bin/env python
"""Test that /api/case/{id}/ledger correctly filters by case_id.

This is an integration test that exercises the full API stack including
RBAC, acquisition, and ledger filtering. It uses the app's own shared
state rather than resetting it, to mirror real runtime behavior.
"""
import os
os.environ.setdefault('PHOENIX_LEDGER_SECRET', 'test-secret-123')

import tempfile
import shutil
from pathlib import Path
from fastapi.testclient import TestClient
from backend.api.main import app
from backend.api.routes_acquisition import store
from backend.api.shared import get_ledger


def run_acquisition_job(client, case_id: str, operator_id: str, out_dir: Path) -> str:
    """Start an acquisition job and wait for completion. Returns job_id."""
    r = client.post('/acquisition/runs', json={
        'source_path': str(Path('tests/fixtures/sample_dvr_image.img')),
        'case_id': case_id,
        'operator_id': operator_id,
        'out_dir': str(out_dir),
        'encrypt': True
    }, params={'wait': True}, headers={'X-Operator-ID': 'investigator-01'})
    assert r.status_code == 202, f"Job start failed: {r.status_code} {r.text}"
    job_id = r.json()['job_id']

    # Copy results to case_store for dashboard
    case_store = Path('./case_store') / case_id / 'run'
    case_store.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(out_dir, case_store, dirs_exist_ok=True)

    return job_id


def test_ledger_filtering():
    """Verify that per-case ledger filtering returns only events for that case."""
    # Record the ledger length before this test's acquisitions so we can
    # calculate the delta rather than assuming an absolute count.
    initial_length = get_ledger().length

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_path = Path(tmpdir)
        client = TestClient(app)
        headers_inv = {'X-Operator-ID': 'investigator-01'}
        headers_aud = {'X-Operator-ID': 'auditor-01'}

        # Run first case
        run_acquisition_job(client, 'CASE-FILT-A', 'op-a', tmp_path / 'run_a')

        # Run second case
        run_acquisition_job(client, 'CASE-FILT-B', 'op-b', tmp_path / 'run_b')

        # Check CASE-FILT-A ledger
        r = client.get('/api/case/CASE-FILT-A/ledger', headers=headers_aud)
        assert r.status_code == 200
        ledger_a = r.json()
        event_types_a = [e['event_type'] for e in ledger_a]

        # Verify CASE-FILT-A pipeline events present
        assert 'GENESIS' in event_types_a
        assert 'intake_started' in event_types_a
        assert 'intake_completed' in event_types_a
        assert 'format_detected' in event_types_a
        assert 'adapter_resolved' in event_types_a
        assert 'recovery_started' in event_types_a
        assert 'recovery_completed' in event_types_a
        assert 'fragment_exported' in event_types_a
        assert 'encryption_completed' in event_types_a

        non_genesis_a = [e for e in ledger_a if e['event_type'] != 'GENESIS']
        assert len(non_genesis_a) == 13  # 13 pipeline events per case

        # Check CASE-FILT-B ledger
        r = client.get('/api/case/CASE-FILT-B/ledger', headers=headers_aud)
        assert r.status_code == 200
        ledger_b = r.json()

        non_genesis_b = [e for e in ledger_b if e['event_type'] != 'GENESIS']
        assert len(non_genesis_b) == 13

        # Verify GENESIS appears in both
        genesis_a = [e for e in ledger_a if e['event_type'] == 'GENESIS']
        genesis_b = [e for e in ledger_b if e['event_type'] == 'GENESIS']
        assert len(genesis_a) == 1
        assert len(genesis_b) == 1
        assert genesis_a[0] == genesis_b[0]

        # Verify the operator_id filtering works by checking raw ledger entries
        raw_ledger = get_ledger().chain
        case_a_raw = [e for e in raw_ledger if e.operator_id == 'CASE-FILT-A']
        case_b_raw = [e for e in raw_ledger if e.operator_id == 'CASE-FILT-B']
        genesis_raw = [e for e in raw_ledger if e.event_type == 'GENESIS']

        assert len(case_a_raw) == 13
        assert len(case_b_raw) == 13
        assert len(genesis_raw) == 1

        # Verify API filtering matches raw filtering
        assert len(ledger_a) == len(genesis_raw) + len(case_a_raw)  # 1 + 13 = 14
        assert len(ledger_b) == len(genesis_raw) + len(case_b_raw)  # 1 + 13 = 14


if __name__ == '__main__':
    test_ledger_filtering()