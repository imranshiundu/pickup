# Pickup

Pickup is a background system that runs on a laptop and eliminates the 23-minute cognitive re-entry cost humans pay after every interruption. 

It silently tracks active windows, shell commands, and clipboard state. When you leave a task and return, it writes a tightly scoped 3-sentence brief explaining exactly what you were doing.

## Installation

Run the setup script:

```bash
./scripts/install.sh
```

## Architecture

- **Core Daemon (`Rust`)**: Under 5MB, always-on window watcher. Emits events on Unix sockets.
- **Brain (`Python`)**: Connects to the daemon. Reaches out to the Anthropic API to generate a brief.
- **MCP Bridge (`TypeScript`)**: Exposes MCP tools for OpenClaw, Claude Code, and Cursor to access context.

## Logs & Data
Checkpoints are written to `~/.pickup/checkpoints.jsonl`.
Logs are at `~/.pickup/pickup.log`.
Unix Socket is at `/tmp/pickup.sock`.
