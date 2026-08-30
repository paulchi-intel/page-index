# PageIndex local application

This workspace contains the FastAPI backend and a React 19 / TypeScript View for
querying and indexing PDF or Markdown documents. Source documents and generated
`*_structure.json` indexes are stored together directly under `documents/`.

## Development

Install the Python, frontend, and Electron dependencies:

```powershell
python -m pip install -r requirements-dev.txt
npm install
npm --prefix frontend install
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

To run the complete desktop development environment with Electron managing the
Python backend and Vite View:

```powershell
npm run electron:dev
```

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

## Windows desktop build

Build the React View, private Python backend, and unsigned x64 portable Electron
application with one command:

```powershell
npm run electron:build
npm run electron:smoke
```

The final artifact is `release-electron/PageIndex.exe`. It is a single portable
executable; Electron extracts and manages its private `pageindex-backend.exe`
sidecar at runtime. The intermediate sidecar lives under `dist-electron/` and is
not a user-facing application.

The desktop application enforces a single instance, selects a dynamic loopback
port, waits for `/api/health`, and terminates the sidecar on exit. It never opens
the PageIndex View in the system browser. External HTTPS documentation links do
open in the system browser.

The desktop application creates and reads its document library beside the
executable on first launch:

```text
release-electron\
├── PageIndex.exe
└── documents\
```

Configuration and logs remain separate from the executable under
`%APPDATA%\PageIndex\`. Existing development data is not copied automatically.
To reuse it, close PageIndex and manually copy the contents of the development
`documents/` directory beside `PageIndex.exe`.

## Verification

```powershell
cd frontend
npm test
npm run lint
npm run build
cd ..
npm test
npm run electron:build
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
