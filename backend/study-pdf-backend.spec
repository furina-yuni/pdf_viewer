from PyInstaller.utils.hooks import collect_submodules
from pathlib import Path

backend_dir = Path(SPECPATH)

hidden_imports = (
    collect_submodules("uvicorn")
    + collect_submodules("pydantic")
    + collect_submodules("pydantic_settings")
)

a = Analysis(
    [str(backend_dir / "run_server.py")],
    pathex=[str(backend_dir)],
    binaries=[],
    datas=[],
    hiddenimports=hidden_imports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["pytest"],
    noarchive=False,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="study-pdf-backend",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
)
