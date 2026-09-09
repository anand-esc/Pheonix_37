# Master3: Security, Crypto, and Legal Compliance

This document details the cryptographic safeguards and legal compliance layers ensuring the output is court-defensible in India.

## 1. Cryptographic Evidence Vault
The system guarantees that once evidence is recovered, it cannot be altered.

### Plaintext-First Hashing
- Evidence is **always hashed in its plaintext state** before encryption. The cryptographic identity of a video fragment is independent of the encryption key.
- Pre-encryption SHA-256 hashes are recorded into the `pipeline_result.json` and the Audit Ledger.

### AES-256-GCM Envelope Encryption
- A unique 256-bit Data Encryption Key (DEK) is generated for every case.
- The DEK is wrapped using a Key Encryption Key (KEK) derived via Argon2id.
- The raw image and every recovered fragment are stream-encrypted using AES-256-GCM, establishing an authenticated encrypted `vault/`.

## 2. Hash-Chained Audit Ledger
Phoenix incorporates a strict, local, hash-chained ledger (`ledger/audit_ledger.py`).
- **Not a Public Blockchain**: It is a permissioned, append-only ledger designed for single-node forensic integrity.
- **Event Bus (`pipeline/events.py`)**: Every significant action (Intake started, format detected, fragment carved, encryption finished) emits an event.
- **Tamper Evidence**: Each ledger entry contains a hash of the previous entry. If a JSON file is manually edited, the chain of hashes breaks, and the application immediately flags the case as compromised.

## 3. Role-Based Access Control (RBAC)
Deny-by-default architecture enforced at the API layer (`X-Operator-ID` header mapping to `action` requests).
- **Investigator**: Can view dashboards and fragments.
- **Technical Expert**: Can run the pipeline and handle encryption keys.
- **Auditor**: Can read the ledger to verify chain integrity.
- **Court**: Can export the finalized legal draft.

## 4. Legal Compliance Matrix
- **BSA Section 63 (formerly IT Act 65-B)**: Phoenix automatically populates a draft certificate documenting the hardware hash, the cryptographic operations, and the software utilized.
- **DPDP Act 2023**: Ensures only authorized processing of bystander data. AI models (YOLOv8-nano) are explicitly restricted to generic object/vehicle detection and are explicitly forbidden from generating facial identification claims.
