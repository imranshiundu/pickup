//! # IPC Server — Unix Socket Broadcaster
//!
//! Owns the Unix domain socket that the Python brain connects to.
//! Every [`SessionEvent`] emitted by the watcher is serialised as a single
//! line of JSON and written to **every connected client**.
//!
//! ## Transport
//! Newline-delimited JSON (NDJSON) — one complete JSON object per line.
//! The Python `asyncio.StreamReader.readline()` receives one event per call.
//!
//! ## Resilience
//! - Stale socket files from a previous crash are removed on startup.
//! - Slow or disconnected clients are dropped; other clients are unaffected.
//! - The broadcast channel drops old events (not clients) when it overflows.

use crate::models::SessionEvent;
use std::path::Path;
use tokio::io::AsyncWriteExt;
use tokio::net::{UnixListener, UnixStream};
use tokio::sync::broadcast;
use tracing::{error, info, warn};

/// Broadcast channel capacity. Events older than this are dropped when a
/// client can't keep up — we never block the watcher for a slow reader.
const BROADCAST_CAPACITY: usize = 64;

// ── IpcServer ────────────────────────────────────────────────────────────────

/// Manages the Unix socket listener and fans events out to all clients.
pub struct IpcServer {
    /// Cloned into each connection handler so it can subscribe independently.
    tx: broadcast::Sender<String>,
}

impl IpcServer {
    /// Create a new server and return the sender handle used to emit events.
    ///
    /// The returned [`broadcast::Sender`] is what the main loop calls
    /// [`emit`] with; keep it alive for the duration of the process.
    pub fn new() -> (Self, broadcast::Sender<String>) {
        let (tx, _) = broadcast::channel(BROADCAST_CAPACITY);
        (IpcServer { tx: tx.clone() }, tx)
    }

    /// Start accepting connections on `socket_path`.
    ///
    /// Runs forever. Each accepted connection is handled in its own Tokio task.
    /// This method should be `tokio::spawn`-ed from `main`.
    pub async fn run(self, socket_path: &str) {
        // Remove a stale socket from a previous run.
        if Path::new(socket_path).exists() {
            if let Err(e) = std::fs::remove_file(socket_path) {
                error!(path = %socket_path, err = %e, "Failed to remove stale socket");
                return;
            }
        }

        let listener = match UnixListener::bind(socket_path) {
            Ok(l) => l,
            Err(e) => {
                error!(path = %socket_path, err = %e, "Failed to bind Unix socket");
                return;
            }
        };

        info!(path = %socket_path, "IPC socket ready — waiting for brain connection");

        loop {
            match listener.accept().await {
                Ok((stream, _addr)) => {
                    let rx = self.tx.subscribe();
                    tokio::spawn(handle_client(stream, rx));
                    info!("Pickup brain connected via IPC");
                }
                Err(e) => {
                    // Log and keep going — one bad accept doesn't kill the daemon.
                    error!(err = %e, "Error accepting IPC connection");
                }
            }
        }
    }
}

// ── Event Emission ────────────────────────────────────────────────────────────

/// Serialise a [`SessionEvent`] and broadcast it to all connected clients.
///
/// Errors are logged but never propagated — the daemon must never crash because
/// the brain isn't connected.
pub fn emit_event(tx: &broadcast::Sender<String>, event: &SessionEvent) {
    match serde_json::to_string(event) {
        Ok(json) => {
            // `send` errors only if there are zero receivers — that's fine.
            let _ = tx.send(json);
        }
        Err(e) => {
            error!(err = %e, "Failed to serialise SessionEvent — skipping");
        }
    }
}

// ── Connection Handler ────────────────────────────────────────────────────────

/// Stream NDJSON events to a single connected client until it disconnects.
async fn handle_client(mut stream: UnixStream, mut rx: broadcast::Receiver<String>) {
    loop {
        match rx.recv().await {
            Ok(json) => {
                // NDJSON: append newline so the reader can use `readline()`.
                let line = format!("{}\n", json);
                if let Err(e) = stream.write_all(line.as_bytes()).await {
                    warn!(err = %e, "IPC client disconnected");
                    break;
                }
            }
            Err(broadcast::error::RecvError::Lagged(n)) => {
                // Client was too slow — we dropped n events. Log and continue.
                warn!(dropped = n, "IPC client lagged — events dropped");
            }
            Err(broadcast::error::RecvError::Closed) => {
                info!("IPC broadcast closed — client handler exiting");
                break;
            }
        }
    }
}
