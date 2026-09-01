import pytest

from backend.core.evidence_model import ChannelInfo, EvidenceItem
from backend.core.interfaces import BaseAdapter, CryptoProvider, Ledger, RecoveryEngine


def test_cannot_instantiate_abcs():
    with pytest.raises(TypeError):
        BaseAdapter()

    with pytest.raises(TypeError):
        RecoveryEngine()

    with pytest.raises(TypeError):
        Ledger()

    with pytest.raises(TypeError):
        CryptoProvider()


class ConcreteAdapter(BaseAdapter):
    def detect(self, source_path: str) -> bool:
        return True

    def parse(self, source_path: str) -> EvidenceItem:
        pass

    def list_channels(self, source_path: str) -> list[ChannelInfo]:
        return []


def test_can_instantiate_concrete():
    adapter = ConcreteAdapter()
    assert adapter.detect("fake/path") is True
