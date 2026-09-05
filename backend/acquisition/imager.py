"""Read-only forensic imaging of a source into an image file.

Design rules (see docs/acquisition.md):

* The source is only ever opened with ``"rb"``. Nothing here can write to it.
* SHA-256 and MD5 are computed on the plaintext stream *as it is read*, before
  anything else touches the bytes. The SHA-256 is the forensic identity of the
  evidence; MD5 is recorded because the problem statement asks for both.
* After writing, the image is re-hashed from disk and compared with the streamed
  SHA-256. A mismatch is a hard failure, never a warning.
* A sidecar ``<image>.acquisition.json`` is written next to the image. On
  failure the sidecar still exists but carries ``status = FAILED``, so nobody
  can mistake a partial image for a complete one.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import uuid
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path

from backend.acquisition.exceptions import (
    AcquisitionPermissionError,
    AcquisitionSourceError,
    AcquisitionVerificationError,
    AcquisitionWriteError,
)
from backend.acquisition.models import AcquisitionRecord, AcquisitionStatus
from backend.core.evidence_model import EvidenceItem, HashRecord, VendorInfo
from backend.crypto.hashing import compute_sha256_file
from backend.pipeline.events import EventSink, emit

logger = logging.getLogger("phoenix.acquisition")

DEFAULT_CHUNK_SIZE = 4 * 1024 * 1024  # 4 MiB, same as the crypto module
SIDECAR_SUFFIX = ".acquisition.json"

ProgressCallback = Callable[[int], None]


def tool_version() -> str:
    try:
        from importlib.metadata import version

        return version("phoenix")
    except Exception:  # noqa: BLE001 - version lookup is best-effort
        return "0.1.0"


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _open_source_readonly(source: Path):
    """Open the source strictly for reading. Raw devices need elevated rights."""
    try:
        return open(source, "rb", buffering=0)
    except PermissionError as exc:
        raise AcquisitionPermissionError(
            f"No read permission for source {source}. Raw devices such as "
            "\\\\.\\PhysicalDriveN or /dev/sdX require administrator/root rights."
        ) from exc
    except FileNotFoundError as exc:
        raise AcquisitionSourceError(f"Source does not exist: {source}") from exc
    except OSError as exc:
        raise AcquisitionSourceError(f"Cannot open source {source}: {exc}") from exc


def sidecar_path_for(image_path: Path | str) -> Path:
    return Path(str(image_path) + SIDECAR_SUFFIX)


def write_sidecar(record: AcquisitionRecord) -> Path:
    path = sidecar_path_for(record.image_path)
    path.write_text(record.model_dump_json(indent=2), encoding="utf-8")
    return path


def load_sidecar(image_path: Path | str) -> AcquisitionRecord | None:
    path = sidecar_path_for(image_path)
    if not path.exists():
        return None
    return AcquisitionRecord.model_validate(
        json.loads(path.read_text(encoding="utf-8"))
    )


def acquire(
    source: Path | str,
    destination: Path | str,
    *,
    case_id: str,
    operator_id: str,
    device_info: str,
    chunk_size: int = DEFAULT_CHUNK_SIZE,
    progress_cb: ProgressCallback | None = None,
    sink: EventSink | None = None,
) -> AcquisitionRecord:
    """Image ``source`` into ``destination`` and return the custody record.

    Raises an ``AcquisitionError`` subclass on any failure. Even then, a sidecar
    describing the failed attempt is written when the destination directory is
    reachable, so the failure itself is part of the custody trail.
    """
    source = Path(source)
    destination = Path(destination)
    acquisition_id = f"acq-{uuid.uuid4()}"
    started = _utcnow()

    record = AcquisitionRecord(
        acquisition_id=acquisition_id,
        case_id=case_id,
        operator_id=operator_id,
        source_path=str(source),
        image_path=str(destination),
        source_device_info=device_info,
        bytes_read=0,
        started_utc=started,
        status=AcquisitionStatus.FAILED,
        tool_version=tool_version(),
    )

    emit(
        sink,
        "intake_started",
        case_id,
        stage="intake",
        acquisition_id=acquisition_id,
        source=str(source),
        destination=str(destination),
        operator_id=operator_id,
    )

    if not destination.parent.exists():
        record.notes.append(f"destination directory missing: {destination.parent}")
        _fail(record, sink, "destination directory does not exist")
        raise AcquisitionWriteError(
            f"Destination directory does not exist: {destination.parent}"
        )

    sha256 = hashlib.sha256()
    md5 = hashlib.md5()
    bytes_read = 0

    try:
        with _open_source_readonly(source) as src:
            try:
                dst = open(destination, "wb")  # noqa: SIM115 - closed by the `with dst:` below
            except OSError as exc:
                record.notes.append(f"cannot create image: {exc}")
                _fail(record, sink, f"cannot create image: {exc}")
                raise AcquisitionWriteError(
                    f"Cannot create image at {destination}: {exc}"
                ) from exc
            with dst:
                while True:
                    try:
                        chunk = src.read(chunk_size)
                    except OSError as exc:
                        record.notes.append(
                            f"read error after {bytes_read} bytes: {exc}"
                        )
                        _fail(record, sink, f"read error: {exc}")
                        raise AcquisitionSourceError(
                            f"Read error on {source} after {bytes_read} bytes: {exc}"
                        ) from exc
                    if not chunk:
                        break
                    sha256.update(chunk)
                    md5.update(chunk)
                    try:
                        dst.write(chunk)
                    except OSError as exc:
                        record.bytes_read = bytes_read
                        record.notes.append(
                            f"write error after {bytes_read} bytes: {exc}"
                        )
                        _fail(record, sink, f"write error: {exc}")
                        raise AcquisitionWriteError(
                            f"Write error on {destination} after {bytes_read} bytes: {exc}"
                        ) from exc
                    bytes_read += len(chunk)
                    if progress_cb is not None:
                        progress_cb(bytes_read)
                dst.flush()
                os.fsync(dst.fileno())
    except (AcquisitionSourceError, AcquisitionPermissionError) as exc:
        # Read errors mid-stream already recorded themselves via _fail above.
        # Failures to *open* the source have not, so record them here.
        if not record.notes:
            record.notes.append(str(exc))
            _fail(record, sink, str(exc))
        raise

    now = _utcnow()
    record.bytes_read = bytes_read
    record.intake_hashes = [
        HashRecord(
            pipeline_stage="intake",
            algorithm="SHA-256",
            hex_digest=sha256.hexdigest(),
            timestamp_utc=now,
        ),
        HashRecord(
            pipeline_stage="intake",
            algorithm="MD5",
            hex_digest=md5.hexdigest(),
            timestamp_utc=now,
        ),
    ]

    verify_digest = compute_sha256_file(destination, chunk_size=chunk_size)
    record.verification_hash = HashRecord(
        pipeline_stage="intake_verify",
        algorithm="SHA-256",
        hex_digest=verify_digest,
        timestamp_utc=_utcnow(),
    )
    record.finished_utc = _utcnow()

    if verify_digest != sha256.hexdigest():
        record.status = AcquisitionStatus.FAILED_VERIFICATION
        record.notes.append(
            "image on disk does not match streamed hash; image must not be trusted"
        )
        write_sidecar(record)
        emit(
            sink,
            "intake_failed",
            case_id,
            stage="intake",
            acquisition_id=acquisition_id,
            reason="verification mismatch",
            streamed_sha256=sha256.hexdigest(),
            on_disk_sha256=verify_digest,
        )
        raise AcquisitionVerificationError(
            f"Verification failed for {destination}: streamed {sha256.hexdigest()} "
            f"but on-disk {verify_digest}"
        )

    record.status = AcquisitionStatus.COMPLETED
    write_sidecar(record)
    logger.info(
        "acquired %s -> %s (%d bytes) sha256=%s",
        source,
        destination,
        bytes_read,
        sha256.hexdigest(),
    )
    emit(
        sink,
        "intake_completed",
        case_id,
        stage="intake",
        acquisition_id=acquisition_id,
        bytes_read=bytes_read,
        sha256=sha256.hexdigest(),
        md5=md5.hexdigest(),
        image_path=str(destination),
        sidecar=str(sidecar_path_for(destination)),
    )
    return record


def _fail(
    record: AcquisitionRecord, sink: EventSink | None, reason: str, write: bool = True
) -> None:
    record.status = AcquisitionStatus.FAILED
    record.finished_utc = _utcnow()
    if write:
        try:
            write_sidecar(record)
        except OSError:
            logger.warning("Could not write failure sidecar for %s", record.image_path)
    logger.error("acquisition %s failed: %s", record.acquisition_id, reason)
    emit(
        sink,
        "intake_failed",
        record.case_id,
        stage="intake",
        acquisition_id=record.acquisition_id,
        reason=reason,
        bytes_read=record.bytes_read,
    )


def build_evidence_item(
    record: AcquisitionRecord,
    vendor_info: VendorInfo,
    *,
    evidence_id: str | None = None,
) -> EvidenceItem:
    """Seed an EvidenceItem from a completed acquisition.

    The intake hashes become the first entries of ``hash_lineage``. Key custody
    facts are copied into ``metadata`` as strings so downstream reporting can
    read them without opening the sidecar.
    """
    if record.status is not AcquisitionStatus.COMPLETED:
        raise ValueError(
            f"Cannot build evidence from an acquisition with status {record.status.value}"
        )
    lineage = list(record.intake_hashes)
    if record.verification_hash is not None:
        lineage.append(record.verification_hash)
    metadata = {
        "acquisition_id": record.acquisition_id,
        "operator_id": record.operator_id,
        "source_path": record.source_path,
        "image_path": record.image_path,
        "bytes_read": str(record.bytes_read),
        "acquired_utc": record.started_utc.isoformat(),
        "tool_version": record.tool_version,
    }
    return EvidenceItem(
        evidence_id=evidence_id or f"ev-{record.acquisition_id}",
        source_device_info=record.source_device_info,
        vendor_info=vendor_info,
        hash_lineage=lineage,
        metadata=metadata,
    )
