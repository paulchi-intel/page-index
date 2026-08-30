"""
page_index.py — PageIndex local application

Starts the PageIndex API and serves the production React view. The Vite source
lives in frontend/; its dist/ output is included in the private Python backend
used by the Electron desktop application.

Run directly:
    python page_index.py

Environment overrides used by Electron:
    PAGEINDEX_HOME, PAGEINDEX_HOST, PAGEINDEX_PORT, PAGEINDEX_OPEN_BROWSER,
    PAGEINDEX_DEV_ORIGIN
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import sys
import time
import webbrowser
import logging
from pathlib import Path
from typing import Generator, AsyncGenerator

# Must be set before any litellm import
os.environ["LITELLM_LOCAL_MODEL_COST_MAP"] = "True"

import litellm

# ── PyInstaller frozen-exe setup (mirrors batch_index.py) ────────────────────
if getattr(sys, "frozen", False):
    _internal = Path(sys._MEIPASS)
    os.environ.setdefault("TIKTOKEN_CACHE_DIR", str(_internal / "tiktoken_cache"))

    # Patch tiktoken for PyInstaller
    try:
        import tiktoken as _tiktoken
        import tiktoken.registry as _tr
        from tiktoken_ext import openai_public as _oai
        for _fn_name in dir(_oai):
            if _fn_name.startswith("_"):
                continue
            _fn = getattr(_oai, _fn_name)
            if not callable(_fn):
                continue
            try:
                _params = _fn()
                if isinstance(_params, dict) and "name" in _params:
                    _enc_name = _params["name"]
                    if _enc_name not in _tr.ENCODINGS:
                        _tr.ENCODINGS[_enc_name] = _tiktoken.Encoding(**_params)
            except Exception:
                pass
    except Exception:
        pass

# ── SSL: export Windows system cert store (runs always, not just frozen exe) ──
# Required for corporate networks with self-signed CA chains (e.g. Intel GNAI).
try:
    import ssl as _ssl, tempfile as _tempfile, base64 as _base64
    _pem_path = Path(_tempfile.gettempdir()) / "pageindex_ca_bundle.pem"
    if not _pem_path.exists():
        _ctx = _ssl.create_default_context()
        _pem_lines = []
        for _cert in _ctx.get_ca_certs(binary_form=True):
            _pem_lines.append("-----BEGIN CERTIFICATE-----")
            _pem_lines.append(_base64.b64encode(_cert).decode())
            _pem_lines.append("-----END CERTIFICATE-----")
        for _store in ("CA", "ROOT", "MY"):
            try:
                for _cert, _enc, _trust in _ssl.enum_certificates(_store):
                    if isinstance(_cert, bytes) and _enc == "x509_asn":
                        _pem_lines.append("-----BEGIN CERTIFICATE-----")
                        _pem_lines.append(_base64.b64encode(_cert).decode())
                        _pem_lines.append("-----END CERTIFICATE-----")
            except Exception:
                pass
        _pem_path.write_text("\n".join(_pem_lines), encoding="ascii")
    _pem_str = str(_pem_path)
    os.environ["SSL_CERT_FILE"]      = _pem_str
    os.environ["REQUESTS_CA_BUNDLE"] = _pem_str
    os.environ["CURL_CA_BUNDLE"]     = _pem_str
except Exception as _ssl_err:
    print(f"[PageIndex] WARNING: SSL cert setup failed: {_ssl_err}")

# ── Paths ─────────────────────────────────────────────────────────────────────
if os.environ.get("PAGEINDEX_HOME"):
    HOME = Path(os.environ["PAGEINDEX_HOME"]).expanduser().resolve()
elif getattr(sys, "frozen", False):
    HOME = Path(sys.executable).parent
else:
    HOME = Path(__file__).resolve().parent

CONFIG_PATH = HOME / "config.json"
DOCS_DIR    = Path(os.environ.get("PAGEINDEX_DOCUMENTS_DIR", HOME / "documents")).expanduser().resolve()
VIEW_DIR    = (Path(sys._MEIPASS) if getattr(sys, "frozen", False) else HOME) / "frontend" / "dist"

HOST = os.environ.get("PAGEINDEX_HOST", "127.0.0.1")
try:
    PORT = int(os.environ.get("PAGEINDEX_PORT", "7788"))
except ValueError:
    raise RuntimeError("PAGEINDEX_PORT must be an integer") from None
OPEN_BROWSER = os.environ.get("PAGEINDEX_OPEN_BROWSER", "1").lower() not in {"0", "false", "no"}
DEV_ORIGIN = os.environ.get("PAGEINDEX_DEV_ORIGIN", "").rstrip("/")

# ── Config ────────────────────────────────────────────────────────────────────
DEFAULTS = {
    "api_key":     "",
    "model":       "anthropic/claude-haiku-4-5",
    "index_model": "anthropic/claude-sonnet-4-6",
}

_MODEL_ALIASES = {
    "claude-4-5-haiku":  "claude-haiku-4-5",
    "claude-4-5-sonnet": "claude-sonnet-4-5",
    "claude-4-haiku":    "claude-haiku-4-5",
    "claude-4-sonnet":   "claude-sonnet-4-5",
}

GNAI_OPENAI    = "https://gnai.intel.com/api/providers/openai/v1"
GNAI_ANTHROPIC = "https://gnai.intel.com/api/providers/anthropic/v1"

FALLBACK_ANTHROPIC_MODELS = [
    "claude-4-6-opus", "claude-4-6-sonnet", "claude-4-5-opus",
    "claude-4-5-sonnet", "claude-4-5-haiku",
]
FALLBACK_OPENAI_MODELS = ["gpt-4o", "gpt-4.1", "gpt-5-mini", "gpt-5-nano", "o3-mini"]


def normalise_model(model: str) -> str:
    if "/" in model:
        prefix, name = model.split("/", 1)
        name = _MODEL_ALIASES.get(name.lower(), name)
        return f"{prefix}/{name}"
    lower = model.lower()
    model = _MODEL_ALIASES.get(lower, model)
    lower = model.lower()
    if lower.startswith("claude"):
        return f"anthropic/{model}"
    if lower.startswith(("gpt-", "o1", "o3", "o4")):
        return f"openai/{model}"
    return model


def setup_env(api_key: str, norm_model: str) -> None:
    _bypass = "gnai.intel.com,.intel.com,localhost,127.0.0.1"
    for _var in ("NO_PROXY", "no_proxy"):
        existing = os.environ.get(_var, "")
        merged = ",".join(filter(None, [existing, _bypass]))
        os.environ[_var] = merged

    if norm_model.startswith("anthropic/"):
        os.environ["ANTHROPIC_API_KEY"] = api_key
        anthropic_base = GNAI_ANTHROPIC
        if anthropic_base.endswith("/v1"):
            anthropic_base = anthropic_base[:-len("/v1")]
        os.environ["ANTHROPIC_BASE_URL"] = anthropic_base
    else:
        os.environ["OPENAI_API_KEY"]  = api_key
        os.environ["OPENAI_BASE_URL"] = GNAI_OPENAI


def load_config() -> dict:
    if not CONFIG_PATH.exists():
        return DEFAULTS.copy()
    with open(CONFIG_PATH, encoding="utf-8") as f:
        cfg = json.load(f)
    return {**DEFAULTS, **cfg}


# ── RAG helpers (same logic as query.py) ─────────────────────────────────────
def build_structure_text(structure: list, indent: int = 0) -> str:
    lines = []
    for node in structure:
        prefix = "  " * indent
        summary = node.get("summary", "")
        summary_short = summary[:200] + "..." if len(summary) > 200 else summary
        lines.append(
            f"{prefix}[章節] {node.get('title', '(無標題)')} "
            f"(第 {node.get('start_index', '?')}-{node.get('end_index', '?')} 頁)"
        )
        if summary_short:
            lines.append(f"{prefix}  摘要: {summary_short}")
        if node.get("nodes"):
            lines.append(build_structure_text(node["nodes"], indent + 1))
    return "\n".join(lines)


def get_pdf_pages(pdf_path: str, start_page: int, end_page: int) -> str:
    try:
        import fitz
        doc = fitz.open(pdf_path)
        pages_text = []
        for i in range(start_page - 1, min(end_page, doc.page_count)):
            text = doc[i].get_text()
            if text.strip():
                pages_text.append(f"[第 {i+1} 頁]\n{text}")
        doc.close()
        return "\n\n".join(pages_text)
    except Exception as e:
        return f"(無法讀取 PDF 頁面: {e})"


def llm_completion(model: str, messages: list, stream: bool = False):
    for attempt in range(5):
        try:
            return litellm.completion(
                model=model,
                messages=messages,
                stream=stream,
            )
        except Exception as e:
            if attempt < 4:
                wait = min(2 ** attempt, 20)
                time.sleep(wait)
            else:
                raise


def find_relevant_sections(index: dict, question: str, history: list, model: str) -> list:
    structure_text = build_structure_text(index.get("structure", []))
    doc_name = index.get("doc_name", "文件")

    # Include recent history for context
    history_text = ""
    if history:
        lines = []
        for msg in history[-6:]:
            role = "使用者" if msg["role"] == "user" else "助手"
            lines.append(f"{role}: {msg['content'][:300]}")
        history_text = "\n對話歷史（最近幾輪）:\n" + "\n".join(lines) + "\n\n"

    prompt = f"""你是一個文件查詢助手，負責從文件結構索引中找出最能回答問題的章節。

文件名稱: {doc_name}

文件結構索引:
{structure_text}

{history_text}目前問題: {question}

請找出最相關的 1-3 個章節。回覆格式（只輸出 JSON 陣列，不要其他說明）:
[
  {{
    "title": "章節標題",
    "start_index": 起始頁碼（數字）,
    "end_index": 結束頁碼（數字）,
    "reason": "選擇原因（一句話）"
  }}
]"""

    response = llm_completion(model, [{"role": "user", "content": prompt}])
    content = response.choices[0].message.content

    json_match = re.search(r'\[.*?\]', content, re.DOTALL)
    if json_match:
        try:
            return json.loads(json_match.group())
        except Exception:
            pass
    return []


def stream_answer(question: str, page_content: str, history: list, model: str) -> Generator:
    messages = []
    # Inject conversation history (without page content to save tokens)
    for msg in history[-8:]:
        messages.append({"role": msg["role"], "content": msg["content"]})

    prompt = f"""根據以下文件內容，回答使用者的問題。請用繁體中文回答，條理清晰。

文件內容:
{page_content}

問題: {question}"""

    messages.append({"role": "user", "content": prompt})

    response = llm_completion(model, messages, stream=True)
    for chunk in response:
        delta = chunk.choices[0].delta
        if hasattr(delta, "content") and delta.content:
            yield delta.content


# ── FastAPI app ───────────────────────────────────────────────────────────────
import queue
import threading
import re as _re

from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.responses import HTMLResponse, StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

# Global config (loaded at startup)
_cfg: dict = {}
_model: str = ""
_index_model: str = ""


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _cfg, _model, _index_model
    _cfg         = load_config()
    _model       = normalise_model(_cfg["model"])
    _index_model = normalise_model(_cfg.get("index_model") or _cfg["model"])
    if _cfg.get("api_key"):
        setup_env(_cfg["api_key"], _model)
    print(f"[PageIndex] Model       : {_model}")
    print(f"[PageIndex] Index model : {_index_model}")
    print(f"[PageIndex] Home        : {HOME}")
    print(f"[PageIndex] Ready       : http://{HOST}:{PORT}")
    yield


app = FastAPI(title="PageIndex Query Server", lifespan=lifespan)
if DEV_ORIGIN:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[DEV_ORIGIN],
        allow_methods=["*"],
        allow_headers=["*"],
    )

if (VIEW_DIR / "assets").is_dir():
    app.mount("/assets", StaticFiles(directory=VIEW_DIR / "assets"), name="view-assets")


# ── API: list available document pairs ───────────────────────────────────────
@app.get("/api/health")
def api_health():
    return {"status": "ok", "service": "pageindex-backend"}


@app.get("/api/files")
def api_list_files():
    pairs = []
    DOCS_DIR.mkdir(parents=True, exist_ok=True)

    # Build a lookup of source files (pdf / md / markdown) in DOCS_DIR
    src_exts = {".pdf", ".md", ".markdown"}
    src_files: dict[str, Path] = {}
    for p in DOCS_DIR.iterdir():
        if p.is_file() and p.suffix.lower() in src_exts:
            src_files[p.stem.lower()] = p

    for json_file in sorted(DOCS_DIR.glob("*_structure.json")):
        stem = json_file.stem.replace("_structure", "")
        src = src_files.get(stem.lower())
        pairs.append({
            "json_name":  json_file.name,
            "json_path":  str(json_file),
            "src_name":   src.name if src else None,
            "src_path":   str(src) if src else None,
            "has_src":    src is not None,
        })

    return {"pairs": pairs, "model": _model, "index_model": _index_model, "api_key_set": bool(_cfg.get("api_key"))}


# ── API: get document structure ───────────────────────────────────────────────
@app.get("/api/structure")
def api_structure(json_path: str):
    p = Path(json_path)
    if not p.exists():
        raise HTTPException(404, "JSON file not found")
    with open(p, encoding="utf-8") as f:
        data = json.load(f)
    return data


# ── API: query (SSE streaming) ────────────────────────────────────────────────
class QueryRequest(BaseModel):
    json_path: str
    src_path:  str | None = None
    question:  str
    history:   list = []


def _sse(event_type: str, **kwargs) -> str:
    payload = json.dumps({"type": event_type, **kwargs}, ensure_ascii=False)
    return f"data: {payload}\n\n"


def _generate(req: QueryRequest):
    try:
        if not _cfg.get("api_key"):
            yield _sse("error", message="config.json 中 api_key 未設定，請先填入 GNAI key。")
            return

        # Load index
        p = Path(req.json_path)
        if not p.exists():
            yield _sse("error", message=f"找不到 JSON 檔案: {req.json_path}")
            return
        with open(p, encoding="utf-8") as f:
            index = json.load(f)

        yield _sse("status", message="正在分析相關章節...")

        # Stage 1: find relevant sections
        sections = find_relevant_sections(index, req.question, req.history, _model)
        if not sections:
            yield _sse("error", message="無法從文件結構中找到相關章節，請換個方式提問。")
            return

        yield _sse("sections", sections=sections)

        # Stage 2: read source file pages and answer
        all_content = []
        if req.src_path and Path(req.src_path).exists():
            yield _sse("status", message="正在讀取原文內容...")
            for sec in sections:
                start = sec.get("start_index", 1)
                end   = min(sec.get("end_index", start), start + 9)  # max 10 pages/section
                content = get_pdf_pages(req.src_path, start, end)
                all_content.append(f"【{sec.get('title', '')}】\n{content}")
        else:
            # Fallback: use summaries from the index when no source file available
            yield _sse("status", message="（未提供原文，將使用摘要作答）")
            for sec in sections:
                title = sec.get("title", "")
                # Find matching node in index
                def find_node(nodes, title):
                    for n in nodes:
                        if n.get("title") == title:
                            return n
                        if n.get("nodes"):
                            found = find_node(n["nodes"], title)
                            if found:
                                return found
                    return None
                node = find_node(index.get("structure", []), title)
                summary = node.get("summary", "") if node else ""
                all_content.append(f"【{title}】\n{summary}")

        combined = "\n\n".join(all_content)
        yield _sse("status", message="正在生成回答...")

        # Stream the answer
        for token in stream_answer(req.question, combined, req.history, _model):
            yield _sse("token", text=token)

        yield _sse("done")

    except Exception as exc:
        import traceback
        traceback.print_exc()
        yield _sse("error", message=str(exc))


@app.post("/api/query")
def api_query(req: QueryRequest):
    return StreamingResponse(
        _generate(req),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ── API: save config ──────────────────────────────────────────────────────────
class ConfigUpdate(BaseModel):
    api_key:     str
    model:       str
    index_model: str = ""


class VerifyModelsRequest(BaseModel):
    api_key: str
    models: list[str] = Field(default_factory=list)


@app.get("/api/config")
def api_get_config():
    return {
        "api_key":     _cfg.get("api_key", ""),
        "api_key_set": bool(_cfg.get("api_key")),
        "model":       _model or _cfg.get("model", ""),
        "index_model": _index_model or _cfg.get("index_model", ""),
    }


@app.post("/api/config")
def api_save_config(body: ConfigUpdate):
    global _cfg, _model, _index_model
    api_key = body.api_key.strip() or _cfg.get("api_key", "")
    if not api_key:
        raise HTTPException(400, "請先輸入 API key")
    _cfg["api_key"]     = api_key
    _cfg["model"]       = body.model
    _cfg["index_model"] = body.index_model or body.model
    _model       = normalise_model(body.model)
    _index_model = normalise_model(body.index_model or body.model)
    setup_env(api_key, _model)
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump({
            "api_key":     api_key,
            "model":       body.model,
            "index_model": body.index_model or body.model,
            "skip_existing": _cfg.get("skip_existing", True),
        }, f, indent=2, ensure_ascii=False)
    return {"ok": True, "model": _model, "index_model": _index_model}


# ── API: upload file ──────────────────────────────────────────────────────────
@app.post("/api/upload")
async def api_upload(file: UploadFile = File(...)):
    allowed = {".pdf", ".md", ".markdown"}
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in allowed:
        raise HTTPException(400, f"不支援的檔案類型: {suffix}，請上傳 PDF 或 Markdown 檔案。")
    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    dest = DOCS_DIR / (file.filename or "upload")
    content = await file.read()
    dest.write_bytes(content)
    return {"path": str(dest), "name": file.filename, "size": len(content)}


# ── API: index document (SSE streaming progress) ──────────────────────────────
_index_lock = threading.Lock()   # prevent concurrent indexing runs

class IndexRequest(BaseModel):
    file_path: str


_STAGE_LABELS = {
    "parse":       ("📄", "Parsing PDF / MD"),
    "toc_detect":  ("🔎", "Detecting Table of Contents"),
    "toc_build":   ("🏗 ", "Building TOC structure"),
    "toc_verify":  ("✅", "Verifying TOC page numbers"),
    "toc_fix":     ("🔧", "Fixing incorrect TOC entries"),
    "node_check":  ("📌", "Validating section positions"),
    "node_expand": ("🌿", "Expanding large sections"),
    "summarise":   ("✍ ", "Generating node summaries"),
    "finalise":    ("🎁", "Finalising structure"),
    "idle":        ("💤", "Idle"),
}


def _strip_rich(text: str) -> str:
    return _re.sub(r"\[/?[^\]]*\]", "", text).strip()


def _generate_index(req: IndexRequest):
    if not _index_lock.acquire(blocking=False):
        yield _sse("error", message="另一個索引任務正在執行中，請稍後再試。")
        return

    try:
        fpath = Path(req.file_path)
        if not fpath.exists():
            yield _sse("error", message=f"找不到檔案: {req.file_path}")
            return

        if not _cfg.get("api_key"):
            yield _sse("error", message="config.json 中 api_key 未設定，請先填入 GNAI key。")
            return

        suffix = fpath.suffix.lower()
        if suffix not in {".pdf", ".md", ".markdown"}:
            yield _sse("error", message=f"不支援的檔案類型: {suffix}")
            return

        from pageindex.utils import ConfigLoader
        from pageindex.progress import tracker

        user_opt = {"model": _cfg.get("index_model") or _cfg.get("model", "anthropic/claude-sonnet-4-6")}
        opt = ConfigLoader().load({k: v for k, v in user_opt.items() if v is not None})

        result_q: queue.Queue = queue.Queue()

        def run_sync():
            try:
                tracker.enable(doc_name=fpath.name)
                if suffix == ".pdf":
                    from pageindex import page_index_main as _pim
                    result = _pim(str(fpath), opt)
                else:
                    import asyncio as _aio
                    from pageindex.page_index_md import md_to_tree
                    result = _aio.run(md_to_tree(
                        md_path=str(fpath),
                        model=opt.model,
                        if_add_node_summary=opt.if_add_node_summary,
                        if_add_doc_description=opt.if_add_doc_description,
                        if_add_node_text=opt.if_add_node_text,
                        if_add_node_id=opt.if_add_node_id,
                    ))
                tracker.disable()
                result_q.put(("done", result))
            except Exception as exc:
                import traceback as _tb
                _tb.print_exc()
                try:
                    tracker.disable()
                except Exception:
                    pass
                result_q.put(("error", str(exc)))

        t = threading.Thread(target=run_sync, daemon=True)
        t.start()

        yield _sse("started", name=fpath.name)

        last_stage = None
        last_done = -1
        last_log_len = 0
        last_prompt_len = 0

        while t.is_alive() or not result_q.empty():
            # Check for completion first
            try:
                ev, data = result_q.get_nowait()
                if ev == "done":
                    # Emit final progress snapshot (active=0, final done count)
                    yield _sse("progress", done=tracker._done, active=0, peak=tracker._peak)
                    # Save results
                    DOCS_DIR.mkdir(parents=True, exist_ok=True)
                    out_name = fpath.stem + "_structure.json"
                    out_path = DOCS_DIR / out_name
                    with open(out_path, "w", encoding="utf-8") as f:
                        json.dump(data, f, indent=2, ensure_ascii=False)
                    yield _sse("done", output=str(out_path), output_name=out_name)
                else:
                    yield _sse("error", message=data)
                return
            except queue.Empty:
                pass

            # Stream stage + progress updates
            stage = tracker.stage
            if stage != last_stage:
                last_stage = stage
                icon, label = _STAGE_LABELS.get(stage, ("▶", stage))
                yield _sse("stage", stage=stage, icon=icon, label=label)

            done = tracker._done
            active = tracker._active
            if done != last_done:
                last_done = done
                yield _sse("progress", done=done, active=active, peak=tracker._peak)

            # New log entries
            log_snapshot = list(tracker._log)
            new_entries = log_snapshot[last_log_len:]
            for entry in new_entries:
                # skip raw "→ LLM call" log lines — covered by prompt events
                stripped = _strip_rich(entry)
                if not (stripped.startswith('→ LLM call') or '→ LLM call' in stripped):
                    yield _sse("log", text=stripped)
            last_log_len = len(log_snapshot)

            # New prompt entries
            prompt_snapshot = list(tracker._prompt_log)
            new_prompts = prompt_snapshot[last_prompt_len:]
            for p in new_prompts:
                yield _sse("prompt", idx=p["idx"], label=p["label"], text=p["text"])
            last_prompt_len = len(prompt_snapshot)

            time.sleep(0.25)

        # Drain queue one last time after thread exits
        try:
            ev, data = result_q.get_nowait()
            if ev == "done":
                # Emit final progress snapshot (active=0, final done count)
                yield _sse("progress", done=tracker._done, active=0, peak=tracker._peak)
                DOCS_DIR.mkdir(parents=True, exist_ok=True)
                out_name = fpath.stem + "_structure.json"
                out_path = DOCS_DIR / out_name
                with open(out_path, "w", encoding="utf-8") as f:
                    json.dump(data, f, indent=2, ensure_ascii=False)
                yield _sse("done", output=str(out_path), output_name=out_name)
            else:
                yield _sse("error", message=data)
        except queue.Empty:
            yield _sse("error", message="索引任務意外結束，未產生結果。")

    except Exception as exc:
        logging.exception("Index setup failed")
        yield _sse("error", message=str(exc))

    finally:
        _index_lock.release()


# ── API: preview file ──────────────────────────────────────────────────
from fastapi import Query as _Query
from fastapi.responses import FileResponse as _FileResponse, PlainTextResponse as _PlainText

@app.get("/api/preview")
def api_preview(path: str = _Query(...)):
    fpath = Path(path)
    if not fpath.exists():
        raise HTTPException(404, f"找不到檔案: {path}")
    suffix = fpath.suffix.lower()
    if suffix == ".pdf":
        return _FileResponse(str(fpath), media_type="application/pdf",
                             headers={"Content-Disposition": "inline"})
    elif suffix in {".md", ".markdown"}:
        return _PlainText(fpath.read_text(encoding="utf-8"))
    raise HTTPException(400, f"不支援的檔案類型: {suffix}")


@app.post("/api/index")
def api_index(req: IndexRequest):
    return StreamingResponse(
        _generate_index(req),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/api/check_index")
def api_check_index(path: str):
    fpath = Path(path)
    out_name = fpath.stem + "_structure.json"
    out_path = DOCS_DIR / out_name
    return {"exists": out_path.exists(), "output_name": out_name}


def _discover_model_options(api_key: str) -> list[dict[str, str]]:
    """Read the complete GNAI provider catalogs, with Key Chatter fallbacks."""
    import httpx, ssl as _ssl

    headers = {"Authorization": f"Bearer {api_key}", "x-api-key": api_key}

    # Build SSL context from the cert bundle exported at startup
    ssl_ctx = None
    cert_file = os.environ.get("SSL_CERT_FILE") or os.environ.get("REQUESTS_CA_BUNDLE")
    if cert_file and os.path.exists(cert_file):
        try:
            ssl_ctx = _ssl.create_default_context(cafile=cert_file)
        except Exception:
            pass

    def _fetch(url: str):
        try:
            with httpx.Client(verify=ssl_ctx or True, timeout=10) as client:
                resp = client.get(url, headers=headers)
                resp.raise_for_status()
                return resp.json()
        except Exception:
            return None

    results = []

    # Anthropic models
    anthropic_base = GNAI_ANTHROPIC
    if anthropic_base.endswith("/v1"):
        anthropic_base = anthropic_base[:-3]
    data = _fetch(anthropic_base + "/v1/models")
    ant_ids = [m.get("id", "") for m in (data or {}).get("data", []) if m.get("id")] if data else []
    if not ant_ids:
        ant_ids = FALLBACK_ANTHROPIC_MODELS
    for mid in ant_ids:
        results.append({"id": f"anthropic/{mid}", "label": mid})

    # OpenAI models
    data = _fetch(GNAI_OPENAI + "/models")
    oai_ids = [m.get("id", "") for m in (data or {}).get("data", []) if m.get("id")] if data else []
    if not oai_ids:
        oai_ids = FALLBACK_OPENAI_MODELS
    for mid in oai_ids:
        results.append({"id": f"openai/{mid}", "label": mid})

    return list({item["id"]: item for item in results}.values())


@app.get("/api/models")
def api_models():
    """Fetch available model IDs from GNAI; fall back to known candidates."""
    api_key = _cfg.get("api_key") or os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("OPENAI_API_KEY", "")
    if not api_key:
        raise HTTPException(400, "尚未設定 API key")
    return {"models": _discover_model_options(api_key)}


def _safe_probe_error(response) -> str:
    """Return a useful model-probe error without reflecting response bodies."""
    if response.status_code == 401:
        return "API key 驗證失敗"
    if response.status_code == 403:
        return "此 API key 沒有模型權限"
    if response.status_code == 404:
        return "模型不存在或 endpoint 不支援"
    if response.status_code == 429:
        return "已達速率限制，但模型可用"
    return f"HTTP {response.status_code}"


async def _probe_supported_model(client, api_key: str, model_id: str) -> dict:
    """Probe one GNAI model with the same minimal requests used by Key Chatter."""
    provider, _, raw_model = model_id.partition("/")
    if not raw_model or provider not in {"anthropic", "openai"}:
        return {"id": model_id, "available": False, "status": 0, "error": "模型 ID 格式不支援"}

    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    if provider == "anthropic":
        url = GNAI_ANTHROPIC + "/messages"
        body = {"model": raw_model, "max_tokens": 1, "messages": [{"role": "user", "content": "Hi"}]}
    else:
        url = GNAI_OPENAI + "/chat/completions"
        is_reasoning = raw_model.lower().startswith(("o1", "o3", "o4", "gpt-5"))
        body = {
            "model": raw_model,
            "messages": [{"role": "user", "content": "Hi"}],
            "stream": False,
            **({"max_completion_tokens": 16} if is_reasoning else {"max_tokens": 1}),
        }

    try:
        response = await client.post(url, headers=headers, json=body)
        available = response.is_success or response.status_code == 429
        return {
            "id": model_id,
            "available": available,
            "status": response.status_code,
            "error": None if available else _safe_probe_error(response),
        }
    except Exception as exc:
        return {"id": model_id, "available": False, "status": 0, "error": f"連線失敗：{type(exc).__name__}"}


@app.post("/api/models/verify")
async def api_verify_models(body: VerifyModelsRequest):
    """Verify candidate models with a newly entered or previously saved GNAI key."""
    import httpx

    api_key = body.api_key.strip() or _cfg.get("api_key", "")
    if not api_key:
        raise HTTPException(400, "請先輸入 API key")

    valid_id = _re.compile(r"^(anthropic|openai)/[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
    candidates = list(dict.fromkeys(model.strip() for model in body.models if valid_id.fullmatch(model.strip())))[:100]
    if not candidates:
        candidates = [item["id"] for item in await asyncio.to_thread(_discover_model_options, api_key)]
    if not candidates:
        raise HTTPException(400, "找不到可驗證的候選模型")

    semaphore = asyncio.Semaphore(6)
    timeout = httpx.Timeout(12.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        async def probe(model_id: str):
            async with semaphore:
                return await _probe_supported_model(client, api_key, model_id)

        details = await asyncio.gather(*(probe(model_id) for model_id in candidates))

    if details and all(detail["status"] == 401 for detail in details):
        raise HTTPException(401, "API key 驗證失敗；請確認 key 尚未過期且具有 GNAI 模型權限")

    available_ids = {detail["id"] for detail in details if detail["available"]}
    models = [
        {"id": model_id, "label": model_id.split("/", 1)[1]}
        for model_id in candidates if model_id in available_ids
    ]
    return {
        "models": models,
        "details": details,
        "available": len(models),
        "unavailable": len(details) - len(models),
    }


async def _generate_model_verification(body: VerifyModelsRequest) -> AsyncGenerator[str, None]:
    """Discover every candidate, then stream start/result events as probes finish."""
    import httpx

    api_key = body.api_key.strip() or _cfg.get("api_key", "")
    if not api_key:
        yield _sse("error", message="請先輸入 API key")
        return

    valid_id = _re.compile(r"^(anthropic|openai)/[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
    try:
        discovered = await asyncio.to_thread(_discover_model_options, api_key)
        requested = [
            {"id": model.strip(), "label": model.strip().split("/", 1)[-1]}
            for model in body.models
            if valid_id.fullmatch(model.strip())
        ]
        candidates = list({
            item["id"]: {"id": item["id"], "label": item.get("label") or item["id"].split("/", 1)[-1]}
            for item in [*discovered, *requested]
            if valid_id.fullmatch(item.get("id", ""))
        }.values())[:100]
        if not candidates:
            yield _sse("error", message="找不到可驗證的候選模型")
            return

        yield _sse("candidates", models=candidates)

        semaphore = asyncio.Semaphore(6)
        events: asyncio.Queue = asyncio.Queue()
        details_by_id: dict[str, dict] = {}

        async with httpx.AsyncClient(timeout=httpx.Timeout(12.0)) as client:
            async def probe(option: dict[str, str]) -> None:
                async with semaphore:
                    await events.put({"type": "checking", "id": option["id"]})
                    detail = await _probe_supported_model(client, api_key, option["id"])
                    details_by_id[option["id"]] = detail
                    await events.put({"type": "result", "detail": detail})

            tasks = [asyncio.create_task(probe(option)) for option in candidates]
            completed = 0
            while completed < len(candidates):
                event = await events.get()
                if event["type"] == "result":
                    completed += 1
                yield _sse(event.pop("type"), **event)
            await asyncio.gather(*tasks)

        details = [details_by_id[option["id"]] for option in candidates]
        if details and all(detail["status"] == 401 for detail in details):
            yield _sse("error", message="API key 驗證失敗；請確認 key 尚未過期且具有 GNAI 模型權限")
            return

        available_ids = {detail["id"] for detail in details if detail["available"]}
        models = [option for option in candidates if option["id"] in available_ids]
        yield _sse(
            "done",
            result={
                "models": models,
                "details": details,
                "available": len(models),
                "unavailable": len(details) - len(models),
            },
        )
    except asyncio.CancelledError:
        raise
    except Exception as exc:
        yield _sse("error", message=f"模型驗證失敗：{type(exc).__name__}")


@app.post("/api/models/verify/stream")
def api_verify_models_stream(body: VerifyModelsRequest):
    return StreamingResponse(
        _generate_model_verification(body),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )



@app.get("/", response_class=HTMLResponse)
def serve_ui():
    index_file = VIEW_DIR / "index.html"
    if index_file.is_file():
        return _FileResponse(
            index_file,
            media_type="text/html",
            headers={"Cache-Control": "no-cache"},
        )
    return HTMLResponse(
        content=(
            "<main style='font:16px Segoe UI,sans-serif;max-width:680px;margin:12vh auto'>"
            "<h1>PageIndex View 尚未建置</h1>"
            "<p>請在 <code>frontend</code> 目錄執行 <code>npm install</code> 與 "
            "<code>npm run build</code>，再重新啟動伺服器。</p></main>"
        ),
        status_code=503,
    )


# ── Entry point ───────────────────────────────────────────────────────────────
def main():
    import uvicorn

    print(f"\n[PageIndex] Starting on http://{HOST}:{PORT}")
    print(f"[PageIndex] Home: {HOME}\n")

    if OPEN_BROWSER:
        import threading

        def _open():
            time.sleep(1.2)
            webbrowser.open(f"http://{HOST}:{PORT}")

        threading.Thread(target=_open, daemon=True).start()

    uvicorn.run(app, host=HOST, port=PORT, log_level="warning")


if __name__ == "__main__":
    main()
