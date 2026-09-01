import os
from pathlib import Path
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.exceptions import InvalidTag
from cryptography.hazmat.backends import default_backend


def generate_nonce() -> bytes:
    """Generates a cryptographically secure 12-byte nonce for AES-GCM."""
    return os.urandom(12)


# ---------------------------------------------------------
# IN-MEMORY ENCRYPTION (For small metadata, keys, tokens)
# ---------------------------------------------------------

def encrypt_data(plaintext: bytes, key: bytes) -> tuple[bytes, bytes]:
    """Encrypts small in-memory data using AES-256-GCM."""
    if len(key) != 32:
        raise ValueError("AES-256-GCM requires exactly a 32-byte key.")
    
    nonce = generate_nonce()
    aesgcm = AESGCM(key)
    ciphertext = aesgcm.encrypt(nonce, plaintext, None)
    return ciphertext, nonce


def decrypt_data(ciphertext: bytes, nonce: bytes, key: bytes) -> bytes:
    """Decrypts small in-memory data encrypted with AES-256-GCM."""
    if len(key) != 32:
        raise ValueError("AES-256-GCM requires exactly a 32-byte key.")
        
    aesgcm = AESGCM(key)
    try:
        return aesgcm.decrypt(nonce, ciphertext, None)
    except InvalidTag as e:
        raise ValueError("Integrity check failed. Data tampered or invalid key/nonce.") from e


# ---------------------------------------------------------
# STREAMING ENCRYPTION (For massive DVR video files)
# ---------------------------------------------------------

def encrypt_file(input_path: Path | str, output_path: Path | str, key: bytes, chunk_size: int = 65536) -> None:
    """
    Encrypts a massive file using streaming AES-256-GCM in O(1) memory space.
    File format: [12-byte Nonce] + [Ciphertext...] + [16-byte Auth Tag]
    """
    if len(key) != 32:
        raise ValueError("AES-256-GCM requires exactly a 32-byte key.")
        
    nonce = generate_nonce()
    encryptor = Cipher(
        algorithms.AES(key),
        modes.GCM(nonce),
        backend=default_backend()
    ).encryptor()
    
    with open(input_path, 'rb') as f_in, open(output_path, 'wb') as f_out:
        # Write the nonce at the beginning of the file
        f_out.write(nonce)
        
        # Stream the file in chunks
        for chunk in iter(lambda: f_in.read(chunk_size), b''):
            f_out.write(encryptor.update(chunk))
            
        f_out.write(encryptor.finalize())
        
        # Append the authentication tag at the very end
        f_out.write(encryptor.tag)


def decrypt_file(input_path: Path | str, output_path: Path | str, key: bytes, chunk_size: int = 65536) -> None:
    """
    Decrypts a massive file using streaming AES-256-GCM.
    If the authentication tag at the end of the file is invalid, the operation aborts
    and the partially decrypted file is securely deleted.
    """
    if len(key) != 32:
        raise ValueError("AES-256-GCM requires exactly a 32-byte key.")
        
    file_size = os.path.getsize(input_path)
    if file_size < 28: # 12 (nonce) + 16 (tag)
        raise ValueError("File is too small to contain valid encrypted payload.")
        
    with open(input_path, 'rb') as f_in:
        # Read the 12-byte nonce from the beginning
        nonce = f_in.read(12)
        
        # Seek to the end to read the 16-byte tag
        f_in.seek(-16, os.SEEK_END)
        tag = f_in.read(16)
        
        # Reset pointer back to the start of the ciphertext
        f_in.seek(12)
        
        decryptor = Cipher(
            algorithms.AES(key),
            modes.GCM(nonce, tag),
            backend=default_backend()
        ).decryptor()
        
        # Calculate how many bytes of actual ciphertext we need to read
        ciphertext_length = file_size - 28
        bytes_read = 0
        
        with open(output_path, 'wb') as f_out:
            try:
                while bytes_read < ciphertext_length:
                    read_size = min(chunk_size, ciphertext_length - bytes_read)
                    chunk = f_in.read(read_size)
                    if not chunk:
                        break
                    f_out.write(decryptor.update(chunk))
                    bytes_read += len(chunk)
                
                # Finalize verifies the tag. If it fails, InvalidTag is raised.
                f_out.write(decryptor.finalize())
                
            except InvalidTag:
                # Security Rule: Do not leave unauthenticated plaintext on disk
                f_out.close()
                os.remove(output_path)
                raise ValueError("Integrity check failed: File tampered or incorrect key.")
