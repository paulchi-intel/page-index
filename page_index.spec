# -*- mode: python ; coding: utf-8 -*-

from pathlib import Path

view_dist = Path('frontend/dist')
if not (view_dist / 'index.html').is_file():
    raise SystemExit('React View is missing. Run `npm install` and `npm run build` in frontend/ first.')


a = Analysis(
    ['page_index.py'],
    pathex=[],
    binaries=[],
    datas=[(str(view_dist), 'frontend/dist')],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='page-index',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='page-index',
)
