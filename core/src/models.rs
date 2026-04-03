//! # Pickup — Canonical Data Models
//!
//! These structs are the single source of truth for every data shape that
//! crosses a layer boundary in the Pickup system:
//!
//! - **Rust → Python**: [`SessionEvent`] is emitted over the Unix socket as
//!   newline-delimited JSON.
//! - **Python → JSONL store**: [`Checkpoint`] is serialised and appended by
//!   the brain layer.
//! - **JSONL → TypeScript MCP bridge**: [`Checkpoint`] is deserialised and
//!   served to MCP clients.
//!
//! **No layer may invent new field names.** All changes here must be reflected
//! in `brain/models.py` and `bridge/src/store.ts`.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

// ── Trigger ───────────────────────────────────────────────────────────────────

/// The mechanism that caused a [`SessionEvent`] to be emitted.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Trigger {
    /// The watcher detected that the user had been idle in a window for the
    /// minimum dwell period and then focused a different window.
    WindowSwitch,

    /// A git hook (pre-stash / post-checkout) fired and requested a checkpoint.
    GitHook,

    /// An AI agent explicitly called `pickup_save_manual` via MCP.
    Agent,

    /// The user or a script called the manual checkpoint endpoint.
    Manual,

    /// The watcher's inactivity timeout fired (not yet used in Phase 1).
    Timeout,
}

impl std::fmt::Display for Trigger {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = serde_json::to_value(self)
            .ok()
            .and_then(|v| v.as_str().map(String::from))
            .unwrap_or_else(|| format!("{:?}", self));
        write!(f, "{}", s)
    }
}

// ── EventType ─────────────────────────────────────────────────────────────────

/// Whether the session boundary is an exit or a return.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EventType {
    /// The user left the window / task.
    Leave,
    /// The user returned to the window / task.
    Return,
}

// ── SessionEvent ──────────────────────────────────────────────────────────────

/// A session boundary event emitted by the Rust daemon.
///
/// Sent to the Python brain over the Unix socket as newline-delimited JSON.
/// The brain enriches this with a [`ContextPacket`] and calls the LLM to
/// produce a [`Checkpoint`].
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionEvent {
    /// Whether this is a "leave" or "return" boundary.
    pub event_type: EventType,

    /// UTC timestamp of when the event was detected.
    pub timestamp: DateTime<Utc>,

    /// Title of the window that was active when the boundary occurred.
    pub window_title: String,

    /// Name of the application process (e.g. `"cursor"`, `"terminal"`).
    pub process_name: String,

    /// Absolute path to the active file, if detectable from the window title
    /// or a connected editor extension.
    pub file_path: Option<String>,

    /// Root directory of the active project, inferred from the file path.
    pub project_dir: Option<String>,

    /// How long (seconds) the departing window was in focus.
    pub session_duration_seconds: u64,

    /// What caused this event to fire.
    pub trigger: Trigger,
}

// ── ContextPacket ─────────────────────────────────────────────────────────────

/// Machine-readable context snapshot collected at checkpoint time.
///
/// This is serialised and sent as the *user message* to the LLM.
/// Every field is optional except `process_name` and `timestamp` — the brain
/// fills in what it can and leaves the rest `null`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextPacket {
    /// Last 50 lines of the active file.
    pub file_tail: Option<String>,

    /// Current clipboard contents.
    pub clipboard: Option<String>,

    /// Titles of the last 10 focused windows, oldest → newest.
    pub recent_windows: Vec<String>,

    /// Last 20 shell commands from zsh / bash history.
    pub shell_history: Option<Vec<String>>,

    pub process_name: String,

    pub timestamp: DateTime<Utc>,

    /// When triggered by an AI agent, the agent's own plain-text description
    /// of what it was doing at the time of the checkpoint.
    pub agent_note: Option<String>,
}

// ── Checkpoint ────────────────────────────────────────────────────────────────

/// A fully realised, persisted checkpoint.
///
/// Written to `~/.pickup/checkpoints.jsonl` by the Python brain.
/// Read by the TypeScript MCP bridge and served to MCP clients.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Checkpoint {
    /// UUID v4 — stable identifier used by all MCP tool calls.
    pub checkpoint_id: String,

    pub timestamp: DateTime<Utc>,
    pub process_name: String,
    pub window_title: String,
    pub file_path: Option<String>,
    pub project_dir: Option<String>,

    /// The 3-sentence re-entry brief produced by the LLM.
    /// This is the primary output of the entire Pickup system.
    pub brief: String,

    pub trigger: String,

    /// Total tokens consumed by the LLM call (input + output).
    pub tokens_used: u32,

    pub raw_context: ContextPacket,

    /// `true` when an AI agent triggered this checkpoint via `pickup_save_manual`.
    pub agent_authored: bool,
}
