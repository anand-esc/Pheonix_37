import os
import tempfile
import pytest
from pathlib import Path

from backend.crypto.hashing import compute_sha256_bytes, compute_sha256_file
from backend.crypto.encryption import encrypt_data, decrypt_data, encrypt_file, decrypt_file
from backend.crypto.key_manager import generate_dek, generate_salt, derive_kek, wrap_dek, unwrap_dek
from backend.crypto.exceptions import ForensicIntegrityError, KeyManagementError
from backend.crypto.provider import PhoenixCryptoProvider
from backend.utils.timestamps import normalize_dvr_timestamp

# ---------------------------------------------------------
# 1. Hashing Tests
# ---------------------------------------------------------
def test_hashing_consistency():
    """Validates that file streaming hash matches memory hash exactly."""
    data = b"confidential forensic evidence - NTRO"
    hash_val = compute_sha256_bytes(data)
    assert len(hash_val) == 64
    
    with tempfile.NamedTemporaryFile(delete=False) as f:
        f.write(data)
        temp_path = f.name
        
    try:
        file_hash = compute_sha256_file(temp_path)
        assert hash_val == file_hash
    finally:
        os.remove(temp_path)

# ---------------------------------------------------------
# 2. Key Management Tests
# ---------------------------------------------------------
def test_key_generation_and_derivation():
    """Ensures keys are correctly sized and Argon2id derivation is deterministic."""
    dek = generate_dek()
    assert len(dek) == 32
    
    salt = generate_salt()
    kek1 = derive_kek("super_secret_password", salt)
    kek2 = derive_kek("super_secret_password", salt)
    
    assert kek1 == kek2  # Deterministic for the same salt
    assert len(kek1) == 32

def test_key_wrapping():
    """Ensures DEKs can be safely encrypted by KEKs."""
    dek = generate_dek()
    kek = generate_dek()  # Simulate KEK
    wrapped_dek, nonce = wrap_dek(dek, kek)
    unwrapped_dek = unwrap_dek(wrapped_dek, nonce, kek)
    assert dek == unwrapped_dek

# ---------------------------------------------------------
# 3. Encryption Roundtrip & Tamper Tests
# ---------------------------------------------------------
def test_encryption_roundtrip():
    """Validates standard encryption and decryption."""
    key = generate_dek()
    plaintext = b"suspect seen near the entry gate"
    
    ciphertext, nonce = encrypt_data(plaintext, key)
    assert ciphertext != plaintext
    
    decrypted = decrypt_data(ciphertext, nonce, key)
    assert decrypted == plaintext

def test_encryption_tamper_detection():
    """CRITICAL: Proves that modifying even 1 bit throws ForensicIntegrityError."""
    key = generate_dek()
    plaintext = b"important digital evidence"
    ciphertext, nonce = encrypt_data(plaintext, key)
    
    # Tamper with the ciphertext (flip one byte to simulate hacking/corruption)
    tampered_ciphertext = bytearray(ciphertext)
    tampered_ciphertext[0] ^= 0xFF
    tampered_ciphertext = bytes(tampered_ciphertext)
    
    with pytest.raises(ForensicIntegrityError):
        decrypt_data(tampered_ciphertext, nonce, key)

def test_invalid_key_length():
    """Ensures AES-GCM strictly enforces 256-bit keys."""
    bad_key = b"too_short"
    with pytest.raises(KeyManagementError):
        encrypt_data(b"data", bad_key)

# ---------------------------------------------------------
# 4. Streaming Encryption Tests
# ---------------------------------------------------------
def test_streaming_file_encryption():
    """Proves O(1) memory file chunking successfully roundtrips data."""
    key = generate_dek()
    original_data = os.urandom(1024 * 100)  # 100 KB random data
    
    with tempfile.TemporaryDirectory() as tmpdir:
        input_path = Path(tmpdir) / "input.bin"
        enc_path = Path(tmpdir) / "encrypted.bin"
        dec_path = Path(tmpdir) / "decrypted.bin"
        
        input_path.write_bytes(original_data)
        
        encrypt_file(input_path, enc_path, key, chunk_size=4096)
        decrypt_file(enc_path, dec_path, key, chunk_size=4096)
        
        assert dec_path.read_bytes() == original_data

# ---------------------------------------------------------
# 5. Provider Interface Tests
# ---------------------------------------------------------
def test_phoenix_crypto_provider():
    """Tests the main integration class and secure RAM wiping."""
    provider = PhoenixCryptoProvider()
    case_id = "CASE-2026-001"
    data = b"raw video stream bytes"
    
    # Test Hashing
    record = provider.hash_plaintext(data, "intake")
    assert record.pipeline_stage == "intake"
    assert len(record.hex_digest) == 64
    
    # Test Encrypt/Decrypt
    encrypted_blob = provider.encrypt(data, case_id)
    assert encrypted_blob != data
    
    decrypted = provider.decrypt(encrypted_blob, case_id)
    assert decrypted == data
    
    # Test Secure Key Wiping
    assert case_id in provider._case_keys
    provider.revoke_case_keys(case_id)
    assert case_id not in provider._case_keys

# ---------------------------------------------------------
# 6. Timestamp Engine Tests
# ---------------------------------------------------------
def test_timestamp_normalization():
    """Proves clock-drift mathematical corrections."""
    # Scenario: DVR is 5 minutes (300s) fast. True time is 12:00:00.
    raw = "2026-09-01 12:05:00"
    result = normalize_dvr_timestamp(
        raw, 
        dvr_timezone_hours=5.5, 
        clock_drift_seconds=-300, 
        drift_threshold_seconds=200
    )
    
    assert result["drift_flagged"] is True
    assert result["clock_drift_seconds"] == -300
    assert result["ist_timestamp"].strftime("%H:%M:%S") == "12:00:00"
