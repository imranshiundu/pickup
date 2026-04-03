"""
Pickup Brain — Main Orchestrator
==================================
Listens on the Unix socket for :class:`~models.SessionEvent` JSON from the
Rust daemon. For each qualifying event:

1. Harvest supplemental context (shell history, file tail) locally.
2. Build a :class:`~models.ContextPacket`.
3. Call the LLM to produce a 3-sentence re-entry brief.
4. Persist the :class:`~models.Checkpoint` to the NDJSON store.
5. Print a human-readable summary to stdout.

Resilience
----------
- Reconnects to the daemon socket automatically (3-second backoff).
- An exception in the LLM or store layer does not crash the process.
- Ctrl-C exits cleanly with no traceback.

Run
---
::

    export ANTHROPIC_API_KEY=sk-ant-...
    python brain/main.py
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
from pathlib import Path
from typing import Optional

from config import (
    CHECKPOINT_STORE_PATH,
    LOG_PATH,
    MIN_SESSION_DURATION_SECONDS,
    FILE_TAIL_LINES,
    SHELL_HISTORY_COMMANDS,
    RECENT_WINDOW_COUNT,
    SOCKET_PATH,
)
from models import ContextPacket
from store import write_checkpoint
from writer import generate_brief

# ── Logging ────────────────────────────────────────────────────────────────────

def _setup_logging() -> None:
    """
    Configure structured JSON-like logging to both stderr and the log file.

    Format is intentionally flat JSON-ish so that tools like jq can parse it.
    The log file path is created if it doesn't exist.
    """
    Path(LOG_PATH).parent.mkdir(parents=True, exist_ok=True)

    handlers: list[logging.Handler] = [
        logging.StreamHandler(sys.stderr),
        logging.FileHandler(LOG_PATH, encoding="utf-8"),
    ]

    logging.basicConfig(
        level=logging.INFO,
        format=(
            '{"time":"%(asctime)s","level":"%(levelname)s",'
            '"name":"%(name)s","msg":"%(message)s"}'
        ),
        datefmt="%Y-%m-%dT%H:%M:%SZ",
        handlers=handlers,
    )


logger = logging.getLogger("pickup.brain")


# ── Context Harvesting ─────────────────────────────────────────────────────────

def _read_shell_history(n: int = SHELL_HISTORY_COMMANDS) -> Optional[list[str]]:
    """
    Read the last *n* commands from ``~/.zsh_history`` or ``~/.bash_history``.

    Handles the zsh extended history format:
    ``: <timestamp>:<elapsed>;<command>``

    Returns ``None`` if no history file is readable.
    """
    home = os.environ.get("HOME", "")
    for hist_file in [f"{home}/.zsh_history", f"{home}/.bash_history"]:
        try:
            with open(hist_file, "r", encoding="utf-8", errors="ignore") as fh:
                raw_lines = fh.readlines()

            commands: list[str] = []
            for line in raw_lines:
                line = line.strip()
                # Strip extended zsh history prefix: `: 1712345678:0;command`
                if line.startswith(":") and ";" in line:
                    line = line.split(";", 1)[1]
                if line:
                    commands.append(line)

            if commands:
                return commands[-n:]
        except (OSError, IOError):
            continue

    return None


def _read_file_tail(file_path: Optional[str], n: int = FILE_TAIL_LINES) -> Optional[str]:
    """
    Read the last *n* lines of *file_path*.

    Returns ``None`` if the path is absent or unreadable.
    """
    if not file_path:
        return None
    try:
        with open(file_path, "r", encoding="utf-8", errors="ignore") as fh:
            lines = fh.readlines()
        tail = lines[-n:] if len(lines) > n else lines
        return "".join(tail) if tail else None
    except (OSError, IOError):
        return None


def _build_context(event: dict, recent_windows: list[str]) -> ContextPacket:
    """
    Construct a :class:`~models.ContextPacket` from an incoming SessionEvent dict.

    ``recent_windows`` is the rolling buffer maintained by the listener loop.
    """
    return ContextPacket(
        process_name=event.get("process_name", "unknown"),
        timestamp=event.get("timestamp", ""),
        recent_windows=recent_windows[-RECENT_WINDOW_COUNT:],
        file_tail=_read_file_tail(event.get("file_path")),
        clipboard=None,           # Clipboard is read by the Rust harvester on Linux/macOS
        shell_history=_read_shell_history(),
        agent_note=event.get("agent_note"),
    )


# ── Event Processing ───────────────────────────────────────────────────────────

async def process_event(event: dict, recent_windows: list[str]) -> None:
    """
    Handle a single :class:`~models.SessionEvent` received from the daemon.

    Steps
    -----
    1. Guard: skip events below the minimum dwell threshold.
    2. Build :class:`~models.ContextPacket`.
    3. Call LLM via :func:`~writer.generate_brief`.
    4. Persist via :func:`~store.write_checkpoint`.
    5. Print human-readable output.

    Exceptions are caught and logged so the listener loop is never interrupted.
    """
    duration: int = event.get("session_duration_seconds", 0)

    if duration < MIN_SESSION_DURATION_SECONDS:
        logger.debug(
            "Event below dwell threshold (%ds < %ds) — skipping",
            duration,
            MIN_SESSION_DURATION_SECONDS,
        )
        return

    logger.info(
        "Processing event | %s | %s | %ds",
        event.get("event_type"),
        event.get("window_title"),
        duration,
    )

    # Build context
    context = _build_context(event, recent_windows)

    # Generate brief
    try:
        result = generate_brief(context)
    except Exception as exc:                            # noqa: BLE001
        logger.error("generate_brief raised unexpectedly: %s", exc, exc_info=True)
        return

    brief        = result["brief"]
    tokens_used  = result["tokens_used"]
    brief_invalid = result.get("brief_invalid", False)

    # Persist checkpoint
    try:
        checkpoint = write_checkpoint(
            window_title=event.get("window_title", ""),
            process_name=event.get("process_name", ""),
            brief=brief,
            trigger=event.get("trigger", "manual"),
            tokens_used=tokens_used,
            raw_context=context,
            file_path=event.get("file_path"),
            project_dir=event.get("project_dir"),
            agent_authored=event.get("trigger") == "agent",
            brief_invalid=brief_invalid,
        )
    except Exception as exc:                            # noqa: BLE001
        logger.error("write_checkpoint raised unexpectedly: %s", exc, exc_info=True)
        return

    # ── Human-readable output (also useful for piping / grepping) ─────────────
    invalid_flag = " ⚠️  [brief_invalid]" if brief_invalid else ""
    print(
        f"\n{'─' * 64}\n"
        f"  ✓  Checkpoint saved{invalid_flag}\n"
        f"  ID:     {checkpoint.checkpoint_id}\n"
        f"  App:    {checkpoint.process_name}\n"
        f"  Tokens: {tokens_used}\n"
        f"  Store:  {CHECKPOINT_STORE_PATH}\n\n"
        f"  Brief:\n"
        f"  {brief}\n"
        f"{'─' * 64}\n",
        flush=True,
    )


# ── Socket Listener ────────────────────────────────────────────────────────────

async def listen_on_socket() -> None:
    """
    Connect to the Rust daemon's Unix socket and process events as they arrive.

    Implements exponential back-off reconnection so the brain starts up cleanly
    even before the daemon is running.
    """
    recent_windows: list[str] = []
    reconnect_delay = 3  # seconds

    while True:
        logger.info("Connecting to daemon socket at %s", SOCKET_PATH)

        try:
            reader, _writer = await asyncio.open_unix_connection(SOCKET_PATH)
            logger.info("Connected to Rust daemon — listening for events")
            reconnect_delay = 3  # reset backoff on successful connect

            while True:
                line = await reader.readline()

                if not line:
                    logger.warning("Socket closed by daemon — will reconnect")
                    break

                raw = line.decode("utf-8", errors="replace").strip()
                if not raw:
                    continue

                try:
                    event = json.loads(raw)
                except json.JSONDecodeError as exc:
                    logger.error("Malformed JSON from socket: %s | data: %.200s", exc, raw)
                    continue

                # Roll window title into the history buffer.
                title: str = event.get("window_title", "")
                if title:
                    recent_windows.append(title)
                    if len(recent_windows) > RECENT_WINDOW_COUNT:
                        recent_windows = recent_windows[-RECENT_WINDOW_COUNT:]

                # Process in a separate task so the read loop stays responsive.
                asyncio.create_task(
                    process_event(event, list(recent_windows)),
                    name=f"process_event_{event.get('timestamp', '')}",
                )

        except (ConnectionRefusedError, FileNotFoundError) as exc:
            logger.warning(
                "Cannot connect to daemon (%s) — retrying in %ds", exc, reconnect_delay
            )
        except Exception as exc:                        # noqa: BLE001
            logger.error("Socket error: %s", exc, exc_info=True)

        await asyncio.sleep(reconnect_delay)
        reconnect_delay = min(reconnect_delay * 2, 30)  # cap at 30s


# ── Entry Point ────────────────────────────────────────────────────────────────

async def _main() -> None:
    _setup_logging()
    logger.info(
        "Pickup Brain starting | socket=%s | store=%s",
        SOCKET_PATH,
        CHECKPOINT_STORE_PATH,
    )
    await listen_on_socket()


if __name__ == "__main__":
    try:
        asyncio.run(_main())
    except KeyboardInterrupt:
        print("\nPickup Brain stopped.", flush=True)
        sys.exit(0)
