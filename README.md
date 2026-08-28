# PageIndex local application

This workspace contains the FastAPI backend and a React 19 / TypeScript View for
querying and indexing PDF or Markdown documents. Source documents and generated
`*_structure.json` indexes are stored together directly under `documents/`.

## Development

Install the Python and frontend dependencies:

```powershell
python -m pip install -r requirements-dev.txt
cd frontend
npm install
```

Run the API and Vite development server in separate terminals:

```powershell
python page_index.py
```

```powershell
cd frontend
npm run dev
```

Open `http://127.0.0.1:5173`. Vite proxies `/api` requests to FastAPI on port
7788.

## Production

Build the React View, then start FastAPI:

```powershell
cd frontend
npm run build
cd ..
python page_index.py
```

The application is served from `http://127.0.0.1:7788`; Node.js is not required
after the View has been built.

In **設定 → 模型**, enter a GNAI API key and choose **驗證支援模型…**. The
application refreshes the full provider candidate list with that key, displays
every model immediately, and streams each pending, checking, available, or
unavailable result into the dialog. When verification finishes, both model
dropdowns contain only models the key can use. The key is only persisted after
**儲存設定** is selected.

To create the Windows onedir executable:

```powershell
pyinstaller page_index.spec --clean --workpath build/page-index
```

The spec refuses to package if `frontend/dist/index.html` is missing and bundles
the complete production View into `dist/page-index/page-index.exe` and its
runtime directory.

## Verification

```powershell
cd frontend
npm test
npm run lint
npm run build
```

Architecture vocabulary and decisions are recorded in `CONTEXT.md` and
`docs/adr/` respectively. Adapted React Bits sources are listed in
`THIRD_PARTY_NOTICES.md`.

## Repository hygiene

Local API credentials (`config.json`), source documents and generated indexes
(`documents/`), runtime logs, dependency folders, caches, and build output are
excluded by `.gitignore`. Keep these files local; install dependencies and
rebuild the React View or Windows executable from the checked-in source when
setting up a new clone.
