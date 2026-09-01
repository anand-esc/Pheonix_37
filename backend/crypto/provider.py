from datetime import datetime, timezone
from backend.core.interfaces import CryptoProvider
from backend.core.evidence_model import HashRecord
from backend.crypto.hashing import compute_sha256_bytes
from backend.crypto.encryption import encrypt_data, decrypt_data
from backend.crypto.key_manager import generate_dek
from backend.crypto.exceptions import ForensicIntegrityError


class PhoenixCryptoProvider(CryptoProvider):
    """
    Concrete implementation of the CryptoProvider interface.
    Wires our standalone mathematical crypto engines into the strict Pydantic data contracts.
    """
    
    def __init__(self):
        # In production, this would securely fetch wrapped DEKs from a KMS/Vault database.
        # For the hackathon prototype, we use an in-memory secure registry per case.
        # We use bytearray instead of bytes so we can securely zero it out later.
        self._case_keys: dict[str, bytearray] = {}

    def _get_key_for_case(self, case_id: str) -> bytearray:
        """Retrieves or generates a secure Data Encryption Key for the case."""
        if case_id not in self._case_keys:
            self._case_keys[case_id] = bytearray(generate_dek())
        return self._case_keys[case_id]

    def revoke_case_keys(self, case_id: str) -> None:
        """
        Securely removes the Data Encryption Key (DEK) from active memory.
        Prevents Cold Boot or memory-dump attacks by overwriting the key material
        with zeroes before deleting the reference.
        """
        if case_id in self._case_keys:
            key = self._case_keys[case_id]
            # Cryptographic zeroing of the memory block
            for i in range(len(key)):
                key[i] = 0
            # Delete the dictionary reference
            del self._case_keys[case_id]

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
        dek = bytes(self._get_key_for_case(case_id))
        ciphertext, nonce = encrypt_data(data, dek)
        
        # Package nonce and ciphertext together for the data store
        return nonce + ciphertext

    def decrypt(self, data: bytes, case_id: str) -> bytes:
        """
        Decrypts data. Extracts the 12-byte nonce from the beginning and verifies integrity.
        """
        dek = bytes(self._get_key_for_case(case_id))
        
        if len(data) < 28: # 12 (nonce) + 16 (auth tag)
            raise ForensicIntegrityError("Data blob too small to contain valid AES-GCM payload.")
            
        nonce = data[:12]
        ciphertext = data[12:]
        return decrypt_data(ciphertext, nonce, dek)
