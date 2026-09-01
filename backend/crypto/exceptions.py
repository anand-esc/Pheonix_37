class CryptoError(Exception):
    """Base exception for all cryptographic operations within the Phoenix pipeline."""
    pass


class ForensicIntegrityError(CryptoError):
    """
    Critical Security Exception.
    Raised when evidence fails authentication or integrity checks.
    This typically means the AES-GCM tag is invalid, indicating the file was 
    tampered with, corrupted, or accessed with an unauthorized key.
    
    The Audit Ledger MUST catch this and log an unauthorized access/tamper event.
    """
    pass


class KeyManagementError(CryptoError):
    """
    Raised when an encryption key is invalid, missing, incorrectly sized, 
    or when an operation is attempted without proper key material.
    """
    pass
