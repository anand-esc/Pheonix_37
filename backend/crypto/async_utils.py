import asyncio
from pathlib import Path
from typing import Union

from backend.crypto.hashing import compute_sha256_file
from backend.crypto.encryption import encrypt_file, decrypt_file


async def async_compute_sha256_file(filepath: Union[Path, str], chunk_size: int = 65536) -> str:
    """
    Asynchronous wrapper for file hashing.
    
    Offloads the heavy file reading and CPU hashing to a background thread.
    This guarantees that hashing a 10GB video won't freeze the FastAPI event loop,
    keeping the dashboard responsive for other investigators.
    """
    return await asyncio.to_thread(compute_sha256_file, filepath, chunk_size)


async def async_encrypt_file(
    input_path: Union[Path, str], 
    output_path: Union[Path, str], 
    key: bytes, 
    chunk_size: int = 65536
) -> None:
    """
    Asynchronous wrapper for streaming AES-GCM encryption.
    
    Offloads the disk I/O and encryption math to a background thread.
    """
    await asyncio.to_thread(encrypt_file, input_path, output_path, key, chunk_size)


async def async_decrypt_file(
    input_path: Union[Path, str], 
    output_path: Union[Path, str], 
    key: bytes, 
    chunk_size: int = 65536
) -> None:
    """
    Asynchronous wrapper for streaming AES-GCM decryption.
    
    Offloads the disk I/O, decryption math, and cryptographic tag verification
    to a background thread.
    """
    await asyncio.to_thread(decrypt_file, input_path, output_path, key, chunk_size)
