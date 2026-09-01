import os
from cryptography.hazmat.primitives.kdf.argon2 import Argon2id
from backend.crypto.encryption import encrypt_data, decrypt_data


def generate_dek() -> bytes:
    """
    Generates a cryptographically secure 256-bit Data Encryption Key (DEK).
    
    Returns:
        32 bytes of secure random data.
    """
    return os.urandom(32)


def generate_salt() -> bytes:
    """
    Generates a cryptographically secure 16-byte salt for key derivation.
    
    Returns:
        16 bytes of secure random data.
    """
    return os.urandom(16)


def derive_kek(passphrase: str, salt: bytes) -> bytes:
    """
    Derives a 256-bit Key Encryption Key (KEK) using Argon2id.
    Parameters are tuned to modern OWASP recommendations for memory-hard KDFs.
    
    Args:
        passphrase: The human-readable string or master secret.
        salt: A 16-byte cryptographically secure random salt.
        
    Returns:
        A 32-byte derived Key Encryption Key.
    """
    kdf = Argon2id(
        salt=salt,
        length=32,
        iterations=3,
        lanes=4,
        memory_cost=65536,
    )
    return kdf.derive(passphrase.encode('utf-8'))


def wrap_dek(dek: bytes, kek: bytes) -> tuple[bytes, bytes]:
    """
    Wraps (encrypts) the Data Encryption Key (DEK) using the Key Encryption Key (KEK).
    Utilizes AES-256-GCM to ensure the DEK cannot be tampered with while at rest.
    
    Args:
        dek: The 32-byte key used to encrypt the actual evidence.
        kek: The 32-byte master key derived from the passphrase.
        
    Returns:
        A tuple containing (wrapped_dek_ciphertext, nonce).
    """
    return encrypt_data(dek, kek)


def unwrap_dek(wrapped_dek: bytes, nonce: bytes, kek: bytes) -> bytes:
    """
    Unwraps (decrypts) the Data Encryption Key (DEK) using the Key Encryption Key (KEK).
    
    Args:
        wrapped_dek: The AES-GCM encrypted DEK.
        nonce: The 12-byte nonce used during the wrapping process.
        kek: The 32-byte master key derived from the passphrase.
        
    Returns:
        The original 32-byte Data Encryption Key.
    """
    return decrypt_data(wrapped_dek, nonce, kek)
