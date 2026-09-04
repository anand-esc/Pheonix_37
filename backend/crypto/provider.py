from datetime import datetime, timezone
import os

from backend.core.interfaces import CryptoProvider
from backend.core.evidence_model import HashRecord
from backend.crypto.hashing import compute_sha256_bytes
from backend.crypto.encryption import encrypt_data, decrypt_data
from backend.crypto.key_manager import generate_dek, generate_salt, derive_kek, wrap_dek, unwrap_dek
from backend.crypto.exceptions import ForensicIntegrityError


class PhoenixCryptoProvider(CryptoProvider):
    """
    Concrete implementation of the CryptoProvider interface.
    Wires our standalone mathematical crypto engines into the strict Pydantic data contracts.
    """
    
    def __init__(self):
        # ASSUMPTION: Since per-investigator authentication isn't wired in yet
        # (blocked on Satya's RBAC branch), we derive the KEK from a system-level
        # master secret read from an environment variable, combined with a per-case salt.
        # TODO: replace with real per-investigator secret once RBAC lands.
        self._master_secret = os.environ.get("PHOENIX_MASTER_SECRET", "dev-fallback-secret-12345")

        # In production, this would securely fetch wrapped DEKs from a KMS/Vault database.
        # For the hackathon prototype, we use an in-memory secure registry per case.
        # Stores: case_id -> {"wrapped_dek": bytes, "nonce": bytes, "salt": bytes}
        self._case_key_records: dict[str, dict] = {}

    def _ensure_case_initialized(self, case_id: str) -> None:
        """Generates a DEK, derives a KEK, wraps the DEK, and stores only the wrapped material."""
        if case_id not in self._case_key_records:
            salt = generate_salt()
            kek = derive_kek(self._master_secret, salt)
            dek = generate_dek()

            wrapped_dek, wrap_nonce = wrap_dek(dek, kek)

            self._case_key_records[case_id] = {
                "wrapped_dek": wrapped_dek,
                "nonce": wrap_nonce,
                "salt": salt,
            }

    def _unwrap_dek_for_case(self, case_id: str) -> bytearray:
        """Unwraps the DEK for a case just-in-time."""
        self._ensure_case_initialized(case_id)
        record = self._case_key_records[case_id]

        kek = derive_kek(self._master_secret, record["salt"])
        dek = unwrap_dek(record["wrapped_dek"], record["nonce"], kek)
        return bytearray(dek)

    def revoke_case_keys(self, case_id: str) -> None:
        """
        Removes the wrapped Data Encryption Key (DEK) record from active memory.
        (Note: the raw DEK is now securely wiped immediately after use in encrypt/decrypt).
        """
        if case_id in self._case_key_records:
            del self._case_key_records[case_id]

    def hash_plaintext(self, data: bytes, stage: str) -> HashRecord:
        """
        Hashes plaintext data and wraps it in a strict HashRecord model.
        Must be called before encryption to preserve forensic identity.
        """
        hex_digest = compute_sha256_bytes(data)
        return HashRecord(
            pipeline_stage=stage,
            hex_digest=hex_digest,
            timestamp_utc=datetime.now(timezone.utc)
        )

    def encrypt(self, data: bytes, case_id: str) -> bytes:
        """
        Encrypts data using AES-256-GCM. 
        Prepends the 12-byte nonce to the ciphertext to adhere to the strict `bytes` interface.
        """
        dek_array = self._unwrap_dek_for_case(case_id)
        try:
            dek = bytes(dek_array)
            ciphertext, nonce = encrypt_data(data, dek)
            # Package nonce and ciphertext together for the data store
            return nonce + ciphertext
        finally:
            # Securely wipe the DEK from RAM immediately after use
            for i in range(len(dek_array)):
                dek_array[i] = 0

    def decrypt(self, data: bytes, case_id: str) -> bytes:
        """
        Decrypts data. Extracts the 12-byte nonce from the beginning and verifies integrity.
        """
        if len(data) < 28: # 12 (nonce) + 16 (auth tag)
            raise ForensicIntegrityError("Data blob too small to contain valid AES-GCM payload.")
            
        nonce = data[:12]
        ciphertext = data[12:]

        dek_array = self._unwrap_dek_for_case(case_id)
        try:
            dek = bytes(dek_array)
            return decrypt_data(ciphertext, nonce, dek)
        finally:
            # Securely wipe the DEK from RAM immediately after use
            for i in range(len(dek_array)):
                dek_array[i] = 0
