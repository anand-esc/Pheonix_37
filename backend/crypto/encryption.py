import os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.exceptions import InvalidTag


def generate_nonce() -> bytes:
    """
    Generates a cryptographically secure 12-byte nonce for AES-GCM.
    NIST SP 800-38D strongly recommends a 96-bit (12-byte) initialization vector.
    
    Returns:
        12 bytes of random data.
    """
    return os.urandom(12)


def encrypt_data(plaintext: bytes, key: bytes) -> tuple[bytes, bytes]:
    """
    Encrypts data using AES-256-GCM, providing both confidentiality and authenticity.
    
    Args:
        plaintext: The raw bytes to encrypt.
        key: A 32-byte (256-bit) encryption key.
        
    Returns:
        A tuple containing (ciphertext_with_tag, nonce).
        The authentication tag is appended to the ciphertext automatically by AESGCM.
        
    Raises:
        ValueError: If the provided key is not exactly 32 bytes.
    """
    if len(key) != 32:
        raise ValueError("AES-256-GCM requires exactly a 32-byte key.")
    
    nonce = generate_nonce()
    aesgcm = AESGCM(key)
    ciphertext = aesgcm.encrypt(nonce, plaintext, None)
    
    return ciphertext, nonce


def decrypt_data(ciphertext: bytes, nonce: bytes, key: bytes) -> bytes:
    """
    Decrypts AES-256-GCM encrypted data and verifies its integrity.
    
    Args:
        ciphertext: The encrypted bytes (must include the appended authentication tag).
        nonce: The 12-byte nonce used during encryption.
        key: The 32-byte (256-bit) encryption key.
        
    Returns:
        The decrypted plaintext bytes.
        
    Raises:
        ValueError: If the key length is invalid or if the authentication tag verification fails
                    (meaning the data was tampered with or the wrong key/nonce was provided).
    """
    if len(key) != 32:
        raise ValueError("AES-256-GCM requires exactly a 32-byte key.")
        
    aesgcm = AESGCM(key)
    try:
        return aesgcm.decrypt(nonce, ciphertext, None)
    except InvalidTag as e:
        raise ValueError("Decryption failed: Integrity check failed. Data may be tampered or key/nonce is invalid.") from e
