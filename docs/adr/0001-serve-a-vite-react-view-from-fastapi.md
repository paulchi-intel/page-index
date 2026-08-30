# Serve a Vite React view from FastAPI

PageIndex will keep its existing FastAPI API while replacing the embedded browser UI with a TypeScript React view maintained in a separate `frontend/` source tree. Vite will proxy the API during development, while FastAPI will serve the production build from the same origin and PyInstaller will package that build, preserving a single-process user experience and leaving a clean renderer boundary for a future Electron shell.

## Considered Options

Embedding compiled React inside `query_server.py` would preserve the monolith and make frontend development difficult. Running a separate production web server would add deployment and port-management complexity. Forking the complete React Bits showcase would import unrelated documentation, registry, routing, and 3D dependencies, so PageIndex will instead adapt only selected component sources.

## Consequences

Node.js is required to develop and build the View but not to run a completed Python package. A production frontend build must exist before PyInstaller packaging, and the spec must include its static assets.

## Entry point naming amendment (2026-08-28)

The importable application entry point is now `page_index.py`. Its PyInstaller
spec is `page_index.spec`, while the user-facing Windows executable and onedir
distribution retain the product-style name `page-index`. The historical
`query_server.py` entry point is not retained as a compatibility shim.

## Desktop packaging amendment (2026-08-28)

ADR-0002 supersedes the user-facing PyInstaller distribution described above.
`page_index.spec` is now `pageindex_backend.spec` and builds a private
`pageindex-backend.exe` sidecar; only Electron's portable `PageIndex.exe` is a
user-facing artifact.
