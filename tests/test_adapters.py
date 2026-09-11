"""Tests for concrete adapters.

Each test confirms the adapter satisfies the BaseAdapter ABC and behaves correctly.
"""

import pytest
from pathlib import Path

from backend.adapters.dahua import DahuaAdapter
from backend.adapters.hikvision import HikvisionAdapter
from backend.core.evidence_model import ValidationStatus


def test_hikvision_adapter_instantiates():
    """HikvisionAdapter satisfies the BaseAdapter ABC and can be instantiated."""
    adapter = HikvisionAdapter()
    assert isinstance(adapter, HikvisionAdapter)


def test_hikvision_detect_returns_false_for_missing_file():
    adapter = HikvisionAdapter()
    assert adapter.detect("/fake/path/to/disk.img") is False


def test_hikvision_detect_returns_false_for_non_wfs_file(tmp_path):
    fake_file = tmp_path / "fake.img"
    fake_file.write_bytes(b"NOT_HIKVISION_DATA" + b"\x00" * 1000)
    adapter = HikvisionAdapter()
    assert adapter.detect(str(fake_file)) is False


def test_hikvision_parse_returns_empty_for_missing_file():
    adapter = HikvisionAdapter()
    res = adapter.parse("/fake/path/to/disk.img")
    assert res.vendor_info.vendor_name == "Hikvision"
    assert res.vendor_info.validation_status == ValidationStatus.VALIDATED
    assert res.fragments == []
    assert res.channels == []


def test_hikvision_list_channels_returns_empty_for_missing_file():
    adapter = HikvisionAdapter()
    res = adapter.list_channels("/fake/path/to/disk.img")
    assert res == []


# ---------------------------------------------------------------------------
# DahuaAdapter — Dahua DHFS/DHAV parsing implementation
# ---------------------------------------------------------------------------


def test_dahua_adapter_instantiates():
    """DahuaAdapter satisfies the BaseAdapter ABC and can be instantiated."""
    adapter = DahuaAdapter()
    assert isinstance(adapter, DahuaAdapter)


def test_dahua_detect():
    adapter = DahuaAdapter()
    assert adapter.detect(b"DHAV_HEADER") is True
    assert adapter.detect(b"DHFS_HEADER") is True
    assert adapter.detect(b"UNKNOWN_HEADER") is False


def test_dahua_parse():
    adapter = DahuaAdapter()
    res = adapter.parse("/nonexistent/path/to/dahua.img")
    assert res.vendor_info.vendor_name == "Dahua"
    assert res.fragments == []


def test_dahua_list_channels():
    adapter = DahuaAdapter()
    res = adapter.list_channels("/nonexistent/path/to/dahua.img")
    assert res == []


