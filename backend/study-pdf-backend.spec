from PyInstaller.utils.hooks import collect_data_files, collect_dynamic_libs, collect_submodules
from pathlib import Path

backend_dir = Path(SPECPATH)

hidden_imports = (
    collect_submodules("uvicorn")
    + collect_submodules("pydantic")
    + collect_submodules("pydantic_settings")
    + [
        module
        for module in collect_submodules("lancedb")
        if ".tests" not in module and not module.endswith("conftest")
    ]
)
datas = collect_data_files("lancedb")
binaries = collect_dynamic_libs("lancedb")

a = Analysis(
    [str(backend_dir / "run_server.py")],
    pathex=[str(backend_dir)],
    binaries=binaries,
    datas=datas,
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
    [],
    exclude_binaries=True,
    name="study-pdf-backend",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    name="study-pdf-backend",
)
