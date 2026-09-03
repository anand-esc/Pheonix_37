"""Tests for concrete adapter stubs.

Each test confirms:
1. The adapter can be instantiated (satisfies the BaseAdapter ABC)
2. Calling any method raises NotImplementedError (correctly stubbed, not silent pass)
"""

import pytest

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
