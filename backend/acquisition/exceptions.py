class AcquisitionError(Exception):
    """Base class for every failure raised while imaging a source."""


class AcquisitionSourceError(AcquisitionError):
    """The source path does not exist or cannot be opened for reading."""


class AcquisitionPermissionError(AcquisitionError):
    """The process lacks the rights to read the source (raw devices need admin)."""


class AcquisitionWriteError(AcquisitionError):
    """Writing the forensic image failed (destination missing, disk full, ...)."""


class AcquisitionVerificationError(AcquisitionError):
    """The image written to disk does not hash to what was streamed from the source."""
