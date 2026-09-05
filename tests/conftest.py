"""Global test configuration and fixtures."""
import pytest


@pytest.fixture(autouse=True)
def setup_master_secret(monkeypatch):
    """Sets the required master secret env var for all tests using crypto."""
    monkeypatch.setenv("PHOENIX_MASTER_SECRET", "test-master-secret-12345")


@pytest.fixture(autouse=True)
def setup_ledger_secret(monkeypatch):
    """Sets the required ledger secret env var for all tests using ledger."""
    monkeypatch.setenv("PHOENIX_LEDGER_SECRET", "test-ledger-secret-12345")