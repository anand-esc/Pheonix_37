"""Tests for concrete adapter stubs.

Each test confirms:
1. The adapter can be instantiated (satisfies the BaseAdapter ABC)
2. Calling any method raises NotImplementedError (correctly stubbed, not silent pass)
"""

import pytest

from backend.adapters.dahua import DahuaAdapter
from backend.adapters.hikvision import HikvisionAdapter


def test_hikvision_adapter_instantiates():
    """HikvisionAdapter satisfies the BaseAdapter ABC and can be instantiated."""
    adapter = HikvisionAdapter()
    assert isinstance(adapter, HikvisionAdapter)


def test_hikvision_detect_raises_not_implemented():
    adapter = HikvisionAdapter()
    with pytest.raises(NotImplementedError):
        adapter.detect("/fake/path/to/disk.img")


def test_hikvision_parse_raises_not_implemented():
    adapter = HikvisionAdapter()
    with pytest.raises(NotImplementedError):
        adapter.parse("/fake/path/to/disk.img")


def test_hikvision_list_channels_raises_not_implemented():
    adapter = HikvisionAdapter()
    with pytest.raises(NotImplementedError):
        adapter.list_channels("/fake/path/to/disk.img")


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


