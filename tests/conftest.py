"""Global test configuration and fixtures."""
import os
import pytest


@pytest.fixture(scope="session", autouse=True)
def setup_secrets():
    """Sets the required secret env vars for all tests using crypto/ledger."""
    os.environ["PHOENIX_MASTER_SECRET"] = "test-master-secret-12345"
    os.environ["PHOENIX_LEDGER_SECRET"] = "test-ledger-secret-12345"
    yield