from abc import ABC, abstractmethod

from backend.core.evidence_model import ChannelInfo, EvidenceItem, Fragment, HashRecord


class BaseAdapter(ABC):
    """Abstract base class for all vendor-specific or generic adapters."""

    @abstractmethod
    def detect(self, source_path: str) -> bool:
        """Determines if this adapter can handle the given source."""

    @abstractmethod
    def parse(self, source_path: str) -> EvidenceItem:
        """Parses the source into the Common Evidence Representation."""

    @abstractmethod
    def list_channels(self, source_path: str) -> list[ChannelInfo]:
        """Extracts channel information from the source."""


class RecoveryEngine(ABC):
    """Abstract base class for fragment recovery engines."""

    @abstractmethod
    def carve_fragments(self, source_path: str) -> list[Fragment]:
        """Carves video fragments from the raw source."""

    @abstractmethod
    def score_confidence(self, fragment: Fragment) -> float:
        """Scores the confidence of a recovered fragment."""


class Ledger(ABC):
    """Abstract base class for the permissioned, signed, hash-chained audit ledger.
    Note: This is an audit ledger, NEVER called a blockchain.
    """

    @abstractmethod
    def write_event(self, event_type: str, payload: dict) -> str:
        """Writes an event to the ledger and returns the entry hash/ID."""

    @abstractmethod
    def verify_chain(self) -> bool:
        """Verifies the integrity of the hash-chained ledger."""

    @abstractmethod
    def get_history(self, case_id: str) -> list[dict]:
        """Retrieves the history of events for a specific case."""


class CryptoProvider(ABC):
    """Abstract base class for cryptographic operations."""

    @abstractmethod
    def hash_plaintext(self, data: bytes, stage: str) -> HashRecord:
        """Computes the hash of the plaintext data at a specific pipeline stage.
        MUST be called before encryption; hash is computed on plaintext only.
        """

    @abstractmethod
    def encrypt(self, data: bytes, case_id: str) -> bytes:
        """Encrypts data using AES-256-GCM."""

    @abstractmethod
    def decrypt(self, data: bytes, case_id: str) -> bytes:
        """Decrypts AES-256-GCM encrypted data."""

    @abstractmethod
    def encrypt_file(self, input_path: str, output_path: str, case_id: str) -> None:
        """Encrypts a file using AES-256-GCM streaming.
        Reads from input_path, writes encrypted result to output_path.
        """
