"""Tests for the (unregistered) acquisition router.

The endpoint functions are exercised directly so the tests need no HTTP
client. When ``httpx`` is installed the same flows also run through a
standalone FastAPI app to prove the router mounts cleanly.
"""

import asyncio
import time

import pytest
from fastapi import FastAPI, HTTPException

from backend.api import routes_acquisition as api
from tests.fixtures.build_fixtures import build_dvr_image


@pytest.fixture(autouse=True)
def _fresh_store():
    api.store.reset()
    yield
    api.store.reset()


def _request(tmp_path, **overrides):
    src = tmp_path / "source.img"
    build_dvr_image(src, size_bytes=512 * 1024, seed=31, vendor_variant="dahua")
    base = {
        "source_path": str(src),
        "case_id": "CASE-API-1",
        "operator_id": "op-api",
        "out_dir": str(tmp_path / "run"),
    }
    base.update(overrides)
    return api.RunRequest(**base)


def _wait(job_id: str, timeout: float = 30.0) -> api.JobView:
    deadline = time.time() + timeout
    while time.time() < deadline:
        view = asyncio.run(api.get_run(job_id))
        if view.status in (api.JobStatus.COMPLETED, api.JobStatus.FAILED):
            return view
        time.sleep(0.05)
    raise AssertionError("job did not finish")


def test_synchronous_run_returns_summary_and_result(tmp_path):
    view = asyncio.run(api.start_run(_request(tmp_path), wait=True))
    assert view.status is api.JobStatus.COMPLETED
    assert view.summary["fragments"] == 3
    assert view.summary["vendor"] == "Dahua"
    assert view.bytes_read == 512 * 1024
    assert view.last_event == "encryption_completed"

    result = asyncio.run(api.get_result(view.job_id))
    assert result.case_id == "CASE-API-1"
    assert len(result.encrypted) == 3
    events = asyncio.run(api.get_events(view.job_id))
    assert events[0].event_type == "intake_started"
    assert len(events) == view.events

    listed = asyncio.run(api.list_runs())
    assert [j.job_id for j in listed] == [view.job_id]


def test_background_run_is_polled_to_completion(tmp_path):
    view = asyncio.run(api.start_run(_request(tmp_path), wait=False))
    assert view.status in (api.JobStatus.QUEUED, api.JobStatus.RUNNING)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(api.get_result(view.job_id))
    assert exc.value.status_code == 409
    done = _wait(view.job_id)
    assert done.status is api.JobStatus.COMPLETED
    assert done.finished_utc is not None


def test_missing_source_is_rejected_up_front(tmp_path):
    req = api.RunRequest(
        source_path=str(tmp_path / "nope.img"),
        case_id="c",
        operator_id="o",
        out_dir=str(tmp_path / "run"),
    )
    with pytest.raises(HTTPException) as exc:
        asyncio.run(api.start_run(req, wait=True))
    assert exc.value.status_code == 400


def test_failed_run_reports_error(tmp_path, monkeypatch):
    req = _request(tmp_path, out_dir=str(tmp_path / "missing" / "deeper"))
    # make the destination unwritable by pointing out_dir at a file
    (tmp_path / "missing").write_text("not a directory")
    view = asyncio.run(api.start_run(req, wait=True))
    assert view.status is api.JobStatus.FAILED
    assert view.error
    with pytest.raises(HTTPException) as exc:
        asyncio.run(api.get_result(view.job_id))
    assert exc.value.status_code == 409


def test_unknown_job_is_404():
    with pytest.raises(HTTPException) as exc:
        asyncio.run(api.get_run("job-nope"))
    assert exc.value.status_code == 404


def test_detect_endpoint(tmp_path):
    src = tmp_path / "d.img"
    build_dvr_image(src, size_bytes=512 * 1024, seed=2, vendor_variant="hikvision")
    report = asyncio.run(api.detect(api.DetectRequest(source_path=str(src))))
    assert report.vendor_info.vendor_name == "Hikvision"
    with pytest.raises(HTTPException):
        asyncio.run(api.detect(api.DetectRequest(source_path=str(tmp_path))))


def test_router_mounts_on_a_standalone_app(tmp_path):
    httpx = pytest.importorskip("httpx")  # noqa: F841 - TestClient needs it
    from fastapi.testclient import TestClient

    app = FastAPI()
    app.include_router(api.router)
    client = TestClient(app)

    req = _request(tmp_path)
    resp = client.post("/acquisition/runs?wait=true", json=req.model_dump())
    assert resp.status_code == 202, resp.text
    job_id = resp.json()["job_id"]
    assert resp.json()["status"] == "completed"
    assert client.get(f"/acquisition/runs/{job_id}/result").status_code == 200
    assert client.get(f"/acquisition/runs/{job_id}/events").status_code == 200
    assert client.get("/acquisition/runs/nope").status_code == 404
