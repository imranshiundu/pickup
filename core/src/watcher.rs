//! # Window Watcher
//!
//! Polls the active window every [`POLL_INTERVAL_MS`] milliseconds.
//! When the focused window changes **and** the previous window was active for
//! at least [`MIN_DWELL_SECONDS`], a [`SessionEvent`] of type `Leave` is sent
//! through the provided channel.
//!
//! ## Why polling instead of event-driven?
//! Cross-platform active-window events require X11/Wayland/Win32/Quartz APIs
//! with wildly different semantics. Polling at 2-second intervals is simpler,
//! reliable across all platforms, and costs ~0% CPU.
//!
//! ## Platform support
//! Delegates to `active-win-pos-rs` which supports X11 (Linux), macOS, and
//! Windows. Wayland support is limited by that crate's upstream status.

use crate::models::{EventType, SessionEvent, Trigger};
use active_win_pos_rs::get_active_window;
use chrono::Utc;
use std::collections::VecDeque;
use std::time::{Duration, Instant};
use tokio::sync::mpsc::Sender;
use tracing::{debug, error, info, warn};

/// Minimum seconds a window must be focused before a "leave" event fires.
/// Prevents noisy checkpoints from accidental alt-tabs or OS-level switches.
const MIN_DWELL_SECONDS: u64 = 10;

/// How often to poll the active window.
const POLL_INTERVAL_MS: u64 = 2_000;

/// How many window titles to keep in the rolling history buffer.
const WINDOW_HISTORY_SIZE: usize = 10;

// ── Internal State ────────────────────────────────────────────────────────────

/// Snapshot of the most recently observed focused window.
#[derive(Debug, Clone)]
struct WindowSnapshot {
    pub title:        String,
    pub process_name: String,
    /// Monotonic instant at which this window first gained focus.
    pub focused_at:   Instant,
}

// ── Public API ────────────────────────────────────────────────────────────────

/// Run the watcher loop. Sends [`SessionEvent`]s to `tx` indefinitely.
///
/// This function never returns under normal operation. Cancel the spawned
/// Tokio task to stop it cleanly.
pub async fn run_watcher(tx: Sender<SessionEvent>) {
    info!(
        poll_ms   = POLL_INTERVAL_MS,
        min_dwell = MIN_DWELL_SECONDS,
        "Window watcher started"
    );

    let mut current: Option<WindowSnapshot> = None;
    let mut history: VecDeque<String> = VecDeque::with_capacity(WINDOW_HISTORY_SIZE);

    loop {
        tokio::time::sleep(Duration::from_millis(POLL_INTERVAL_MS)).await;

        // `get_active_window` is synchronous and may block briefly on X11.
        // Offload to a thread so we don't stall the async runtime.
        let active = match tokio::task::spawn_blocking(get_active_window).await {
            Ok(Ok(w))    => w,
            Ok(Err(()))  => {
                warn!("active-win-pos-rs returned an error — skipping poll");
                continue;
            }
            Err(join_err) => {
                error!(err = %join_err, "spawn_blocking panicked in watcher");
                continue;
            }
        };

        let title        = active.title.trim().to_string();
        let process_name = active.app_name.trim().to_string();

        // Skip if the window title is empty (can happen on lock-screen, etc.)
        if title.is_empty() {
            continue;
        }

        match &current {
            // ── First observation: record, do not emit ────────────────────
            None => {
                debug!(title = %title, process = %process_name, "Initial window captured");
                current = Some(WindowSnapshot {
                    title,
                    process_name,
                    focused_at: Instant::now(),
                });
            }

            // ── Subsequent polls: check for a change ──────────────────────
            Some(prev) => {
                let changed =
                    prev.title        != title
                    || prev.process_name != process_name;

                if !changed {
                    continue;
                }

                let dwell = prev.focused_at.elapsed().as_secs();

                if dwell < MIN_DWELL_SECONDS {
                    debug!(
                        title   = %prev.title,
                        dwell_s = dwell,
                        min_s   = MIN_DWELL_SECONDS,
                        "Window switched too quickly — skipping"
                    );
                } else {
                    info!(
                        from        = %prev.title,
                        to          = %title,
                        dwell_secs  = dwell,
                        "Window switch — emitting Leave event"
                    );

                    // Roll the departing title into history.
                    if history.len() == WINDOW_HISTORY_SIZE {
                        history.pop_front();
                    }
                    history.push_back(prev.title.clone());

                    let event = SessionEvent {
                        event_type:               EventType::Leave,
                        timestamp:                Utc::now(),
                        window_title:             prev.title.clone(),
                        process_name:             prev.process_name.clone(),
                        file_path:                infer_file_path(&prev.title),
                        project_dir:              None, // harvester.rs fills this
                        session_duration_seconds: dwell,
                        trigger:                  Trigger::WindowSwitch,
                    };

                    if let Err(e) = tx.send(event).await {
                        error!(err = %e, "SessionEvent channel closed — watcher exiting");
                        return;
                    }
                }

                // Always update current snapshot on focus change.
                current = Some(WindowSnapshot {
                    title,
                    process_name,
                    focused_at: Instant::now(),
                });
            }
        }
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/// Try to extract an absolute file path from a window title.
///
/// Many editors embed the file path in the title bar, e.g.
/// `"auth.ts — my-project — VS Code"` or `"~/code/main.py - Neovim"`.
/// This is a heuristic; the editor extension layer will provide exact paths.
fn infer_file_path(title: &str) -> Option<String> {
    // Walk each whitespace-delimited token and return the first one that looks
    // like a real file that exists on disk.
    for token in title.split_whitespace() {
        let cleaned = token.trim_matches(|c| c == '"' || c == '\'' || c == '—' || c == '-');
        // Expand leading `~`
        let expanded = if cleaned.starts_with('~') {
            let home = std::env::var("HOME").unwrap_or_default();
            cleaned.replacen('~', &home, 1)
        } else {
            cleaned.to_string()
        };

        if std::path::Path::new(&expanded).is_file() {
            return Some(expanded);
        }
    }
    None
}

/// Walk a file path upward to find the project root.
///
/// Recognises `.git`, `Cargo.toml`, `package.json`, and `pyproject.toml`
/// as project markers.
pub fn infer_project_dir(file_path: &str) -> Option<String> {
    let mut path = std::path::Path::new(file_path);

    loop {
        let parent = path.parent()?;
        for marker in &[".git", "Cargo.toml", "package.json", "pyproject.toml"] {
            if parent.join(marker).exists() {
                return Some(parent.to_string_lossy().to_string());
            }
        }
        if parent == path {
            break;
        }
        path = parent;
    }

    None
}
