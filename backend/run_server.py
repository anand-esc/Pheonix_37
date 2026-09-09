"""Frozen-safe local API server entry point for the desktop application.

PyInstaller compiles this file into a standalone binary that Electron spawns
as a child process.  The frozen backend listens on 127.0.0.1:8000 and exposes
the FastAPI application defined in ``api.main``.

Required hidden imports (for PyInstaller spec / CLI):
    uvicorn.logging, uvicorn.loops.auto, uvicorn.protocols.http.auto,
    uvicorn.lifespan.on, pydantic, hashlib, hmac, fastapi, api.main
"""

from __future__ import annotations

# ── PyInstaller / Windows multiprocessing guard ──────────────────────────
# This MUST execute before any other logic — including top-level imports
# that might themselves spawn subprocesses.
import multiprocessing
multiprocessing.freeze_support()

import atexit
import logging
import signal
import sys
from pathlib import Path
from types import FrameType

# ---------------------------------------------------------------------------
# Ensure both the project root and backend/ are importable so that
# ``api.main:app`` resolves whether running from source or from a frozen
# PyInstaller bundle.
# ---------------------------------------------------------------------------
BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BACKEND_DIR.parent
for _import_root in (str(PROJECT_ROOT), str(BACKEND_DIR)):
    if _import_root not in sys.path:
        sys.path.insert(0, _import_root)

logger = logging.getLogger("forensic-backend")


# ---------------------------------------------------------------------------
# Graceful shutdown helpers
# ---------------------------------------------------------------------------
def _flush_and_release() -> None:
    """atexit callback: flush open file buffers, release database handles,
    and close any logging handlers so the process can exit without data loss.
    """
    # Flush standard streams (they may be piped to Electron)
    for stream in (sys.stdout, sys.stderr):
        try:
            if stream and not stream.closed:
                stream.flush()
        except Exception:
            pass

    # Shut down logging so file handlers are flushed and released
    logging.shutdown()


def _shutdown_handler(signum: int, frame: FrameType | None) -> None:
    """Allow service managers and Electron to stop a frozen server cleanly.

    Raising ``SystemExit`` triggers atexit callbacks registered above,
    ensuring buffers are flushed before the OS reclaims the process.
    """
    logger.info("Received signal %s — shutting down", signum)
    raise SystemExit(0)


def _install_signal_handlers() -> None:
    """Register SIGINT and SIGTERM handlers.

    Both signals are available on modern Windows Python (3.11+) as well as
    POSIX.  Guard each registration for embedded/interpreter edge cases.
    """
    for signum in (signal.SIGINT, signal.SIGTERM):
        try:
            signal.signal(signum, _shutdown_handler)
        except (AttributeError, OSError, ValueError):
            pass


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
def main() -> None:
    _install_signal_handlers()
    atexit.register(_flush_and_release)

    import uvicorn

    uvicorn.run(
        "api.main:app",
        host="127.0.0.1",
        port=8000,
        log_level="info",
        access_log=False,
    )


if __name__ == "__main__":
    main()
