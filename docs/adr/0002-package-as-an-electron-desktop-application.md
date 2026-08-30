# Package PageIndex as an Electron desktop application

PageIndex will ship on Windows as a single unsigned x64 portable Electron executable. Electron owns the application window and the lifecycle of a private PyInstaller Python sidecar, waits for its loopback health endpoint on a dynamic port, and loads the React View from that same FastAPI origin. Runtime credentials, Source Documents, Document Indexes, and logs live under the Windows PageIndex application-data directory so replacing the executable cannot overwrite user data. This preserves the proven Python indexing implementation while giving the View a secure desktop boundary; rewriting the backend in Node.js and retaining the user-facing PyInstaller executable were rejected because both duplicate or expose implementation that Electron can manage privately.

## Consequences

Production disables broad CORS, external HTTPS links open in the system browser, only one application instance may own the sidecar, and quitting the window terminates it. The repository retains a sidecar PyInstaller spec and reproducible Electron build scripts, but ignores generated backend, Electron, and portable executable output. The previous `dist/page-index/page-index.exe` is obsolete and is removed only after the portable Electron build passes its smoke test.
