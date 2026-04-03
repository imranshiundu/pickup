//! # Pickup Core — Daemon Entry Point
//!
//! Orchestrates the three subsystems of the Rust layer:
//!
//! ```text
//!   ┌──────────────┐      mpsc channel      ┌──────────────┐
//!   │   watcher    │  ──── SessionEvent ───▶  │     main     │
//!   │  (polling)   │                          │  (enriches,  │
//!   └──────────────┘                          │   emits IPC) │
//!                                             └──────┬───────┘
//!   ┌──────────────┐                                 │  broadcast
//!   │  IpcServer   │  ◀─── NDJSON SessionEvent ──────┘
//!   │ (Unix socket)│
//!   └──────────────┘
//! ```
//!
//! The Python brain connects to the Unix socket and receives events.
//! It then harvests additional context, calls the LLM, and persists
//! the [`Checkpoint`].
//!
//! ## Configuration
//!
//! | Env var         | Default              | Purpose                        |
//! |-----------------|----------------------|--------------------------------|
//! | `PICKUP_SOCKET` | `/tmp/pickup.sock`   | Unix socket path               |
//! | `RUST_LOG`      | `info`               | Log level (`debug`, `warn` …)  |
//!
//! ## Signals
//! Ctrl-C is caught and exits with code 0. No panic, no traceback.

mod harvester;
mod ipc;
mod models;
mod watcher;

use std::env;
use tokio::sync::mpsc;
use tracing::{error, info};
use tracing_subscriber::{fmt, EnvFilter};

/// Default Unix socket path. Override with `PICKUP_SOCKET`.
const DEFAULT_SOCKET_PATH: &str = "/tmp/pickup.sock";

#[tokio::main]
async fn main() {
    // ── Logging ─────────────────────────────────────────────────────────────
    // Structured JSON logs to stderr. Set RUST_LOG=debug for verbose output.
    fmt()
        .json()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("pickup_core=info,warn")),
        )
        .init();

    // ── Config ──────────────────────────────────────────────────────────────
    let socket_path = env::var("PICKUP_SOCKET")
        .unwrap_or_else(|_| DEFAULT_SOCKET_PATH.to_string());

    info!(
        version = env!("CARGO_PKG_VERSION"),
        socket  = %socket_path,
        "Pickup Core daemon starting"
    );

    // ── IPC Server ──────────────────────────────────────────────────────────
    let (ipc_server, ipc_tx) = ipc::IpcServer::new();
    let socket_for_task = socket_path.clone();
    tokio::spawn(async move {
        ipc_server.run(&socket_for_task).await;
    });

    // ── Window Watcher ──────────────────────────────────────────────────────
    let (event_tx, mut event_rx) = mpsc::channel::<models::SessionEvent>(64);
    tokio::spawn(async move {
        watcher::run_watcher(event_tx).await;
    });

    // ── Ctrl-C handler ──────────────────────────────────────────────────────
    tokio::spawn(async {
        if tokio::signal::ctrl_c().await.is_ok() {
            info!("SIGINT received — Pickup Core shutting down cleanly");
            std::process::exit(0);
        }
    });

    info!("All subsystems running — watching for window changes");

    // ── Main Event Loop ─────────────────────────────────────────────────────
    while let Some(mut event) = event_rx.recv().await {
        info!(
            window   = %event.window_title,
            process  = %event.process_name,
            duration = event.session_duration_seconds,
            trigger  = %event.trigger,
            "SessionEvent received"
        );

        // Enrich the event: try to resolve project_dir from the inferred file.
        if let Some(ref fp) = event.file_path {
            event.project_dir = watcher::infer_project_dir(fp);
        }

        // Emit the enriched event over IPC to the Python brain.
        ipc::emit_event(&ipc_tx, &event);

        // Also harvest context locally for structured log visibility.
        let ctx = harvester::harvest(&event, vec![event.window_title.clone()]).await;
        match serde_json::to_string(&ctx) {
            Ok(json) => info!(context = %json, "ContextPacket harvested"),
            Err(e)   => error!(err = %e, "Failed to serialise ContextPacket"),
        }
    }
}
