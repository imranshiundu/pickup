"""
Pickup Brain — Checkpoint Persistence
=======================================
Writes and reads :class:`~models.Checkpoint` records as append-only
newline-delimited JSON (NDJSON) at :data:`~config.CHECKPOINT_STORE_PATH`.

Design choices
--------------
- **Append-only NDJSON**: no lock needed for writes; reads scan the whole
  file linearly (it stays small — even 10 k checkpoints is ~5 MB).
- **No SQLite in Phase 1**: intentional. The TypeScript bridge reads the
  same file directly; adding a DB would require another shared dependency.
- Search and filtering are O(n) over the file. This is acceptable for a
  local tool with hundreds to low-thousands of records.
"""

from __future__ import annotations

import json
import logging
import uuid
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from config import CHECKPOINT_STORE_PATH
from models import Checkpoint, ContextPacket

logger = logging.getLogger(__name__)


# ── Internal helpers ───────────────────────────────────────────────────────────

def _ensure_store_dir() -> None:
    """Create the parent directory of the checkpoint store if absent."""
    Path(CHECKPOINT_STORE_PATH).parent.mkdir(parents=True, exist_ok=True)


def _serialize(checkpoint: Checkpoint) -> str:
    """Serialise a Checkpoint (including the nested ContextPacket) to a JSON string."""
    return json.dumps(asdict(checkpoint), default=str)


def _deserialize(line: str) -> Optional[dict]:
    """Parse one NDJSON line. Returns None on malformed input (logged, not raised)."""
    try:
        return json.loads(line.strip())
    except json.JSONDecodeError as exc:
        logger.warning("Malformed NDJSON line — skipping: %s", exc)
        return None


# ── Write ──────────────────────────────────────────────────────────────────────

def write_checkpoint(
    window_title: str,
    process_name: str,
    brief: str,
    trigger: str,
    tokens_used: int,
    raw_context: ContextPacket,
    file_path: Optional[str] = None,
    project_dir: Optional[str] = None,
    agent_authored: bool = False,
    brief_invalid: bool = False,
) -> Checkpoint:
    """
    Persist a :class:`~models.Checkpoint` to the NDJSON store.

    Parameters
    ----------
    window_title:
        Title of the window that was active when the session ended.
    process_name:
        Process name of the active application.
    brief:
        3-sentence re-entry text from the LLM.
    trigger:
        What caused the checkpoint (e.g. ``"window_switch"``, ``"manual"``).
    tokens_used:
        Total LLM tokens consumed (input + output).
    raw_context:
        The :class:`~models.ContextPacket` sent to the LLM.
    file_path:
        Active file path, if known.
    project_dir:
        Project root directory, if detectable.
    agent_authored:
        ``True`` when triggered by an AI agent via ``pickup_save_manual``.
    brief_invalid:
        ``True`` when the LLM output failed sentence-count validation.

    Returns
    -------
    The written :class:`~models.Checkpoint` (callers can log or forward it).
    """
    _ensure_store_dir()

    checkpoint = Checkpoint(
        checkpoint_id=str(uuid.uuid4()),
        timestamp=datetime.now(timezone.utc).isoformat(),
        process_name=process_name,
        window_title=window_title,
        file_path=file_path,
        project_dir=project_dir,
        brief=brief,
        trigger=trigger,
        tokens_used=tokens_used,
        raw_context=raw_context,
        agent_authored=agent_authored,
        brief_invalid=brief_invalid,
    )

    with open(CHECKPOINT_STORE_PATH, "a", encoding="utf-8") as fh:
        fh.write(_serialize(checkpoint) + "\n")

    logger.info(
        "Checkpoint written",
        extra={
            "checkpoint_id": checkpoint.checkpoint_id,
            "process":        process_name,
            "trigger":        trigger,
            "tokens":         tokens_used,
            "invalid":        brief_invalid,
        },
    )

    return checkpoint


# ── Read ───────────────────────────────────────────────────────────────────────

def read_last(
    project_dir: Optional[str] = None,
    process_name: Optional[str] = None,
) -> Optional[dict]:
    """
    Return the most recent checkpoint dict, optionally filtered.

    Filters are ANDed together. If neither is given, returns the absolute
    last checkpoint regardless of context.

    Parameters
    ----------
    project_dir:
        If given, only consider checkpoints with this ``project_dir``.
    process_name:
        If given, only consider checkpoints with this ``process_name``.

    Returns
    -------
    A raw dict (not a Checkpoint dataclass) for TypeScript-parity reasons,
    or ``None`` if the store is empty or no record matches the filters.
    """
    _ensure_store_dir()
    store = Path(CHECKPOINT_STORE_PATH)
    if not store.exists():
        return None

    last: Optional[dict] = None
    with open(store, "r", encoding="utf-8") as fh:
        for line in fh:
            record = _deserialize(line)
            if record is None:
                continue
            if project_dir  and record.get("project_dir")  != project_dir:
                continue
            if process_name and record.get("process_name") != process_name:
                continue
            last = record

    return last


def read_by_id(checkpoint_id: str) -> Optional[dict]:
    """
    Find a checkpoint by its UUID.

    Returns
    -------
    The matching checkpoint dict or ``None``.
    """
    _ensure_store_dir()
    store = Path(CHECKPOINT_STORE_PATH)
    if not store.exists():
        return None

    with open(store, "r", encoding="utf-8") as fh:
        for line in fh:
            record = _deserialize(line)
            if record and record.get("checkpoint_id") == checkpoint_id:
                return record

    return None


def read_all(limit: int = 100) -> list[dict]:
    """
    Return up to *limit* most recent checkpoints, newest first.

    Parameters
    ----------
    limit:
        Maximum number of records to return. Default matches the MCP
        ``pickup_list`` tool default.
    """
    _ensure_store_dir()
    store = Path(CHECKPOINT_STORE_PATH)
    if not store.exists():
        return []

    records: list[dict] = []
    with open(store, "r", encoding="utf-8") as fh:
        for line in fh:
            record = _deserialize(line)
            if record is not None:
                records.append(record)

    # Reverse to get newest-first, then cap.
    return list(reversed(records))[:limit]


def search(query: str, limit: int = 10) -> list[dict]:
    """
    Full-text search across checkpoint brief and raw_context fields.

    Case-insensitive substring match against ``brief``, ``window_title``,
    ``process_name``, and the nested ``agent_note`` and ``file_tail`` fields.

    Parameters
    ----------
    query:
        The search term.
    limit:
        Maximum results to return.
    """
    _ensure_store_dir()
    store = Path(CHECKPOINT_STORE_PATH)
    if not store.exists():
        return []

    needle = query.lower()
    results: list[dict] = []

    with open(store, "r", encoding="utf-8") as fh:
        for line in fh:
            record = _deserialize(line)
            if record is None:
                continue

            # Build a searchable blob from the most informative fields.
            haystack = " ".join(filter(None, [
                record.get("brief", ""),
                record.get("window_title", ""),
                record.get("process_name", ""),
                (record.get("raw_context") or {}).get("agent_note", ""),
                (record.get("raw_context") or {}).get("file_tail", ""),
            ])).lower()

            if needle in haystack:
                results.append(record)

    return list(reversed(results))[:limit]
