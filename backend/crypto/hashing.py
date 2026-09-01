import hashlib
from pathlib import Path
from typing import Union


def compute_sha256_bytes(data: bytes) -> str:
    """
    Computes the SHA-256 hash of a byte sequence.
    
    Args:
        data: The raw bytes to hash.
        
    Returns:
        A 64-character lowercase hex digest representing the SHA-256 hash.
    """
    return hashlib.sha256(data).hexdigest()


def compute_sha256_file(filepath: Union[Path, str], chunk_size: int = 65536) -> str:
    """
    Computes the SHA-256 hash of a file efficiently using memory-safe chunking.
    
    Args:
        filepath: The path to the file on disk.
        chunk_size: Number of bytes to read into memory at a time. Defaults to 64KB.
        
    Returns:
        A 64-character lowercase hex digest representing the SHA-256 hash.
    """
    hasher = hashlib.sha256()
    with open(filepath, 'rb') as f:
        for chunk in iter(lambda: f.read(chunk_size), b''):
            hasher.update(chunk)
    return hasher.hexdigest()
