# Build on Linux only: pyinstaller --noconfirm backend/pyinstaller/linux.spec
# Output: backend/dist/forensic-backend
from pathlib import Path

project_root = Path(SPECPATH).parent.parent

a = Analysis(
    [str(project_root / "backend" / "run_server.py")],
    pathex=[str(project_root)],
    datas=[
        (
            str(project_root / "backend" / "reporting" / "templates"),
            "backend/reporting/templates",
        )
    ],
    hiddenimports=[
        "uvicorn.logging",
        "uvicorn.loops.auto",
        "uvicorn.protocols.http.auto",
        "uvicorn.lifespan.on",
        "backend.api.main",
        "backend.adapters.generic_carver.adapter",
        "backend.adapters.hikvision",
        "backend.adapters.dahua",
        "backend.crypto.provider",
        "backend.reporting.certificate_draft",
        "pydantic",
        "hashlib",
        "hmac",
        "fastapi",
    ],
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="forensic-backend",
    distpath=str(project_root / "backend" / "dist"),
    console=True,
)
