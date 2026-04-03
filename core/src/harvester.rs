//! # Context Harvester
//!
//! Enriches a [`SessionEvent`] with supplemental machine context before the
//! brain layer calls the LLM:
//!
//! | Field               | Source                                      |
//! |---------------------|---------------------------------------------|
//! | `file_tail`         | Last 50 lines of the active file (if any)  |
//! | `clipboard`         | Platform clipboard via `xclip` / `pbpaste`  |
//! | `shell_history`     | Last 20 entries from zsh / bash history     |
//! | `recent_windows`    | Passed in from the watcher's rolling buffer |
//!
//! All fields are best-effort — a failure to read any one of them is logged
//! and the field is set to `None`; the pipeline continues regardless.

use crate::models::{ContextPacket, SessionEvent};
use chrono::Utc;
use std::io::BufRead;
use tracing::{debug, warn};

/// Lines of the active file to include in the context packet.
const FILE_TAIL_LINES: usize = 50;

/// Shell history commands to include.
const SHELL_HISTORY_ENTRIES: usize = 20;

// ── Public API ────────────────────────────────────────────────────────────────

/// Build a [`ContextPacket`] from a [`SessionEvent`] and caller-supplied
/// window history.
///
/// `recent_windows` is the rolling buffer maintained by the watcher — pass
/// the last ≤ 10 titles, oldest first.
pub async fn harvest(event: &SessionEvent, recent_windows: Vec<String>) -> ContextPacket {
    let file_tail = event
        .file_path
        .as_deref()
        .and_then(|p| read_tail(p, FILE_TAIL_LINES));

    let clipboard = read_clipboard().await;
    let shell_history = read_shell_history(SHELL_HISTORY_ENTRIES);

    ContextPacket {
        file_tail,
        clipboard,
        recent_windows,
        shell_history,
        process_name: event.process_name.clone(),
        timestamp: Utc::now(),
        agent_note: None, // Filled by the brain when trigger == Agent
    }
}

// ── File Tail ─────────────────────────────────────────────────────────────────

/// Read the last `n` lines of `path`. Returns `None` if the file is
/// unreadable or empty.
fn read_tail(path: &str, n: usize) -> Option<String> {
    let file = std::fs::File::open(path).ok()?;
    let reader = std::io::BufReader::new(file);

    let lines: Vec<String> = reader
        .lines()
        .filter_map(|l| l.ok())
        .collect();

    let tail: Vec<&String> = lines.iter().rev().take(n).rev().collect();

    if tail.is_empty() {
        None
    } else {
        Some(tail.iter().map(|s| s.as_str()).collect::<Vec<_>>().join("\n"))
    }
}

// ── Clipboard ─────────────────────────────────────────────────────────────────

/// Read clipboard contents using the platform's preferred CLI tool.
///
/// - **Linux (X11)**: `xclip -selection clipboard -o`, fallback to `xsel`
/// - **macOS**: `pbpaste`
/// - **Windows**: not yet implemented (returns `None`)
async fn read_clipboard() -> Option<String> {
    #[cfg(target_os = "linux")]
    {
        // Try xclip first (most common), then xsel
        for (cmd, args) in &[
            ("xclip", vec!["-selection", "clipboard", "-o"]),
            ("xsel",  vec!["--clipboard", "--output"]),
        ] {
            match tokio::process::Command::new(cmd).args(args).output().await {
                Ok(out) if out.status.success() => {
                    let text = String::from_utf8_lossy(&out.stdout).to_string();
                    if !text.trim().is_empty() {
                        debug!(tool = %cmd, "Clipboard read via {}", cmd);
                        return Some(text);
                    }
                }
                _ => continue,
            }
        }
        warn!("Could not read clipboard — install xclip or xsel");
        None
    }

    #[cfg(target_os = "macos")]
    {
        match tokio::process::Command::new("pbpaste").output().await {
            Ok(out) if out.status.success() => {
                let text = String::from_utf8_lossy(&out.stdout).to_string();
                if text.trim().is_empty() { None } else { Some(text) }
            }
            Err(e) => {
                warn!(err = %e, "pbpaste failed");
                None
            }
            _ => None,
        }
    }

    #[cfg(target_os = "windows")]
    {
        warn!("Clipboard harvesting not yet implemented on Windows");
        None
    }
}

// ── Shell History ─────────────────────────────────────────────────────────────

/// Read the last `n` commands from the user's shell history.
/// Supports zsh (extended format) and bash.
fn read_shell_history(n: usize) -> Option<Vec<String>> {
    let home = std::env::var("HOME").ok()?;

    let candidates = vec![
        format!("{}/.zsh_history", home),
        format!("{}/.bash_history", home),
    ];

    for path in candidates {
        if let Some(entries) = parse_history_file(&path, n) {
            return Some(entries);
        }
    }

    None
}

/// Parse a shell history file and return the last `n` commands.
///
/// Handles the zsh extended history format:
/// `: <unix_timestamp>:<elapsed>;<command>`
fn parse_history_file(path: &str, n: usize) -> Option<Vec<String>> {
    let file = std::fs::File::open(path).ok()?;
    let reader = std::io::BufReader::new(file);

    let commands: Vec<String> = reader
        .lines()
        .filter_map(|l| l.ok())
        .map(|line| {
            // Strip zsh extended history prefix: `: 1712345678:0;actual_command`
            if line.starts_with(':') {
                line.splitn(2, ';')
                    .nth(1)
                    .unwrap_or(&line)
                    .to_string()
            } else {
                line
            }
        })
        .filter(|l| !l.trim().is_empty())
        .collect();

    if commands.is_empty() {
        return None;
    }

    let tail: Vec<String> = commands.iter().rev().take(n).rev().cloned().collect();
    Some(tail)
}
