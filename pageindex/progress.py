"""
pageindex/progress.py — Live progress display for pageindex processing.

A singleton ProgressTracker wraps every LLM call and stage transition.
Enable it once in the entry point (batch_index.py) before calling page_index_main():

    from pageindex.progress import tracker
    tracker.enable()
"""

from __future__ import annotations

import asyncio
import time
from collections import deque
from contextlib import asynccontextmanager
from typing import Optional

# ── Lazy import of rich so the module is safe to import even without rich ──────
try:
    from rich.console import Console
    from rich.live import Live
    from rich.table import Table
    from rich.panel import Panel
    from rich.columns import Columns
    from rich.text import Text
    from rich import box
    _RICH = True
except ImportError:
    _RICH = False


# ── Spinner frames ─────────────────────────────────────────────────────────────
_SPIN = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]

# ── Stage labels ───────────────────────────────────────────────────────────────
STAGE_LABELS = {
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


class ProgressTracker:
    """Global singleton tracker.  Thread-safe for asyncio single-thread use."""

    def __init__(self):
        self._enabled   = False
        self._live: Optional[object] = None    # rich Live instance
        self._console   = Console() if _RICH else None

        self.stage      = "idle"
        self.doc_name   = ""

        # LLM call counters
        self._active    = 0          # currently in-flight
        self._done      = 0          # completed successfully
        self._retries   = 0          # retry count
        self._errors    = 0          # permanent errors

        # Concurrency peak
        self._peak      = 0

        # Timing
        self._t0        = time.monotonic()
        self._stage_t0  = time.monotonic()

        # Recent activity log  (last 8 entries)
        self._log: deque[str] = deque(maxlen=8)

        # Prompt log (all prompts sent to LLM)
        self._prompt_log: deque[dict] = deque(maxlen=500)
        self._prompt_seq = 0          # monotonic counter

        # Spinner state
        self._spin_idx  = 0

        # Refresh task handle
        self._refresh_task: Optional[asyncio.Task] = None

    # ── Public API ─────────────────────────────────────────────────────────────

    def enable(self, doc_name: str = "") -> None:
        if not _RICH:
            return
        self._enabled  = True
        self.doc_name  = doc_name
        self._t0       = time.monotonic()
        self._stage_t0 = time.monotonic()
        self._console  = Console()
        self._live     = Live(
            self._render(),
            console=self._console,
            refresh_per_second=4,
            transient=False,
        )
        self._live.start()

    def disable(self) -> None:
        if self._live:
            self._live.stop()
            self._live = None
        self._enabled = False

    def set_stage(self, stage: str, detail: str = "") -> None:
        self.stage      = stage
        self._stage_t0  = time.monotonic()
        icon, label     = STAGE_LABELS.get(stage, ("▶", stage))
        msg             = f"[bold]{icon}  {label}[/bold]"
        if detail:
            msg += f"  [dim]— {detail}[/dim]"
        self._log.append(msg)
        self._refresh()

    def set_doc(self, doc_name: str) -> None:
        self.doc_name = doc_name

    def on_prompt(self, label: str, full_text: str) -> None:
        """Record the full prompt text before an LLM call."""
        self._prompt_log.append({
            "idx":   self._prompt_seq,
            "label": label,
            "text":  full_text,
        })
        self._prompt_seq += 1

    # Called by llm_acompletion wrapper
    def on_call_start(self, label: str = "") -> None:
        self._active += 1
        if self._active > self._peak:
            self._peak = self._active
        if label:
            self._log.append(f"[cyan]  → LLM call[/cyan]  [dim]{label[:60]}[/dim]")
        self._refresh()

    def on_call_done(self) -> None:
        self._active  = max(0, self._active - 1)
        self._done   += 1
        self._refresh()

    def on_retry(self, attempt: int, wait: int, err: str) -> None:
        self._retries += 1
        self._log.append(
            f"[yellow]  ⚠  Retry #{attempt}[/yellow]  wait {wait}s  "
            f"[dim]{err[:50]}[/dim]"
        )
        self._refresh()

    def on_error(self) -> None:
        self._errors  += 1
        self._active   = max(0, self._active - 1)
        self._refresh()

    # ── Rendering ──────────────────────────────────────────────────────────────

    def _refresh(self) -> None:
        if self._live and self._enabled:
            self._spin_idx = (self._spin_idx + 1) % len(_SPIN)
            self._live.update(self._render())

    def _render(self):
        if not _RICH:
            return ""

        elapsed     = time.monotonic() - self._t0
        stage_elapsed = time.monotonic() - self._stage_t0
        icon, label = STAGE_LABELS.get(self.stage, ("▶", self.stage))
        spin        = _SPIN[self._spin_idx]
        rate        = self._done / elapsed if elapsed > 0.5 else 0.0

        # ── Top header bar ──────────────────────────────────────────────────
        title_txt = Text()
        title_txt.append("🔍 PageIndex  ", style="bold white")
        if self.doc_name:
            title_txt.append(self.doc_name, style="bold cyan")

        # ── Stats row ───────────────────────────────────────────────────────
        stats = Table.grid(padding=(0, 2))
        stats.add_row(
            Text(f"{spin} {icon} {label}", style="bold green" if self._active else "dim"),
            Text(f"⏱  {elapsed:6.1f}s  (stage {stage_elapsed:.0f}s)", style="dim"),
            Text(f"✅ {self._done} done", style="green"),
            Text(f"⚡ {self._active} active", style="bold yellow" if self._active else "dim"),
            Text(f"📈 peak {self._peak}", style="dim"),
            Text(f"🔁 {self._retries} retries", style="yellow" if self._retries else "dim"),
        )

        # ── Concurrency bar ─────────────────────────────────────────────────
        bar_width = 30
        filled    = min(self._active, bar_width)
        bar_txt   = Text()
        bar_txt.append("  Concurrency  [", style="dim")
        bar_txt.append("█" * filled, style="bold cyan")
        bar_txt.append("░" * (bar_width - filled), style="dim")
        bar_txt.append(f"]  {self._active}/{self._peak} peak", style="dim")

        # ── Log panel ───────────────────────────────────────────────────────
        log_lines = list(self._log)
        log_txt   = Text()
        for line in log_lines[-6:]:
            log_txt.append(line)
            log_txt.append("\n")

        # ── Assemble ────────────────────────────────────────────────────────
        inner = Table.grid(padding=(0, 0))
        inner.add_row(stats)
        inner.add_row(bar_txt)
        inner.add_row(Text())    # spacer
        inner.add_row(Text("  Recent activity:", style="dim"))
        inner.add_row(log_txt)

        return Panel(
            inner,
            title=title_txt,
            border_style="blue",
            padding=(0, 1),
        )


# ── Global singleton ──────────────────────────────────────────────────────────
tracker = ProgressTracker()


# ── Context manager helper for stages ────────────────────────────────────────
@asynccontextmanager
async def stage(name: str, detail: str = ""):
    tracker.set_stage(name, detail)
    try:
        yield
    finally:
        pass
