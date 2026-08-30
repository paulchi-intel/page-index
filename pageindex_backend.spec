# -*- mode: python ; coding: utf-8 -*-

from pathlib import Path
from PyInstaller.utils.hooks import collect_data_files

view_dist = Path('frontend/dist')
if not (view_dist / 'index.html').is_file():
    raise SystemExit('React View is missing. Run `npm install` and `npm run build` in frontend/ first.')

litellm_data = collect_data_files(
    'litellm',
    includes=[
        '**/*.json',
        'litellm_core_utils/tokenizers/*',
    ],
)
pageindex_data = collect_data_files('pageindex', includes=['config.yaml'])

a = Analysis(
    ['page_index.py'],
    pathex=[],
    binaries=[],
    datas=[(str(view_dist), 'frontend/dist'), *litellm_data, *pageindex_data],
    hiddenimports=['litellm.litellm_core_utils.tokenizers'],
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
    name='pageindex-backend',
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
    name='pageindex-backend',
)
