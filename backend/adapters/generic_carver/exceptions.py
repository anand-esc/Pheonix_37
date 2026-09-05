class CarverError(Exception):
    """Base class for generic carver failures."""


class CarverSourceError(CarverError):
    """The source image cannot be read."""


class CarverExportError(CarverError):
    """A carved fragment could not be written or failed post-write verification."""
