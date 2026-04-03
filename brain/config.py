"""
Pickup Brain — Configuration
=============================
All runtime constants live here. Override any value via environment variable.
No magic numbers anywhere else in the brain layer.
"""

import os
from pathlib import Path

# ── IPC ────────────────────────────────────────────────────────────────────────

# Unix socket path — must match PICKUP_SOCKET on the Rust daemon side.
SOCKET_PATH: str = os.environ.get("PICKUP_SOCKET", "/tmp/pickup.sock")

# ── Storage ────────────────────────────────────────────────────────────────────

_DEFAULT_STORE = str(Path.home() / ".pickup" / "checkpoints.jsonl")
CHECKPOINT_STORE_PATH: str = os.environ.get("PICKUP_STORE", _DEFAULT_STORE)

# ── Logging ────────────────────────────────────────────────────────────────────

_DEFAULT_LOG = str(Path.home() / ".pickup" / "pickup.log")
LOG_PATH: str = os.environ.get("PICKUP_LOG", _DEFAULT_LOG)

# ── LLM ────────────────────────────────────────────────────────────────────────

# Model must match the spec. Do not change without updating the system prompt.
ANTHROPIC_MODEL: str = os.environ.get("PICKUP_MODEL", "claude-haiku-4-5-20251001")

# Hard cap — the brief must be ≤ 120 tokens (≈ 60 words × 2).
ANTHROPIC_MAX_TOKENS: int = 120

# Zero temperature → deterministic, factual reconstruction.
ANTHROPIC_TEMPERATURE: float = 0.0

# Only used on retry when sentence count validation fails.
ANTHROPIC_RETRY_TEMPERATURE: float = 0.2

# ── Watcher Thresholds ─────────────────────────────────────────────────────────

# Minimum seconds a window must be active before a "leave" event triggers a brief.
# Prevents noisy checkpoints from accidental alt-tabs.
MIN_SESSION_DURATION_SECONDS: int = int(
    os.environ.get("PICKUP_MIN_DWELL", "10")
)

# ── Context Harvesting ─────────────────────────────────────────────────────────

# Lines of the active file included in the ContextPacket.
FILE_TAIL_LINES: int = 50

# Shell history commands included in the ContextPacket.
SHELL_HISTORY_COMMANDS: int = 20

# Rolling window of recent window titles tracked in memory.
RECENT_WINDOW_COUNT: int = 10
