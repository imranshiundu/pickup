"""
Pickup Brain — Data Models
===========================
Python mirrors of the canonical data contracts defined in the Pickup spec.
All field names must stay in sync with the Rust ``models.rs`` structs and
the TypeScript ``store.ts`` / ``tools.ts`` types.

Every layer reads and writes these shapes; no layer invents new field names.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class ContextPacket:
    """
    Context snapshot collected from the machine at checkpoint time.

    This is the *user message* passed to the LLM — everything the model
    needs to reconstruct the cognitive state of the session.

    Fields
    ------
    process_name:
        Name of the application that was active (e.g. "cursor", "terminal").
    timestamp:
        ISO 8601 UTC string of when the snapshot was taken.
    recent_windows:
        Rolling list of the last 10 window titles, oldest → newest.
    file_tail:
        Last 50 lines of the file that was open, if detectable.
    clipboard:
        Current clipboard contents, if readable.
    shell_history:
        Last 20 shell commands from ~/.zsh_history or ~/.bash_history.
    agent_note:
        If the checkpoint was triggered by an AI agent, the agent's own
        plain-text description of what it was doing. The LLM uses this
        as the primary signal when present.
    """

    process_name: str
    timestamp: str
    recent_windows: list[str] = field(default_factory=list)
    file_tail: Optional[str] = None
    clipboard: Optional[str] = None
    shell_history: Optional[list[str]] = None
    agent_note: Optional[str] = None


@dataclass
class Checkpoint:
    """
    A fully realized checkpoint written by the brain to JSONL storage
    and read by the TypeScript MCP bridge.

    Fields
    ------
    checkpoint_id:
        UUID v4 — unique, stable identifier used by MCP tools.
    timestamp:
        ISO 8601 UTC string of when the checkpoint was saved.
    process_name:
        Active process at session end.
    window_title:
        Window title at session end.
    brief:
        3-sentence re-entry text produced by the LLM. This is the
        primary output of the entire Pickup system.
    trigger:
        What caused the checkpoint: ``window_switch``, ``git_hook``,
        ``agent``, or ``manual``.
    tokens_used:
        Total tokens consumed by the LLM call (input + output).
    raw_context:
        The full ContextPacket that was sent to the LLM.
    agent_authored:
        True when an AI agent triggered the checkpoint via
        ``pickup_save_manual``.
    file_path:
        Path to the active file, if detectable.
    project_dir:
        Root directory of the active project, if detectable.
    brief_invalid:
        True when sentence-count validation failed after retry.
        The brief is stored anyway so the user is never left empty-handed.
    """

    checkpoint_id: str
    timestamp: str
    process_name: str
    window_title: str
    brief: str
    trigger: str
    tokens_used: int
    raw_context: ContextPacket
    agent_authored: bool
    file_path: Optional[str] = None
    project_dir: Optional[str] = None
    brief_invalid: bool = False
