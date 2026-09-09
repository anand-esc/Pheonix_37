# Build on Windows only: pyinstaller --noconfirm backend/pyinstaller/windows.spec
# Output: backend/dist/forensic-backend.exe
from pathlib import Path

project_root = Path(SPECPATH).parent.parent

a = Analysis(
    [str(project_root / "backend" / "run_server.py")],
    pathex=[str(project_root), str(project_root / "backend")],
    hiddenimports=[
        "uvicorn.logging",
        "uvicorn.loops.auto",
        "uvicorn.protocols.http.auto",
        "uvicorn.lifespan.on",
        "api.main",
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
