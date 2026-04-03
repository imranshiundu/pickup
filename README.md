# Pickup

Pickup is a background system that runs on a laptop and eliminates the 23-minute cognitive re-entry cost humans pay after every interruption. 

It silently tracks active windows, shell commands, and clipboard state. When you leave a task and return, it writes a tightly scoped 3-sentence brief explaining exactly what you were doing.

## Installation

### macOS
```bash
curl -fsSL https://pickup.sh/install | bash
```
*Installs the Rust binary to `/usr/local/bin/pickup`, registers `ai.pickup.daemon.plist` LaunchDaemon, adds the CLI to your PATH, and requests Accessibility permissions for window detection.*

### Linux (systemd)
```bash
curl -fsSL https://pickup.sh/install | bash
```
*Installs binary to `/usr/local/bin/pickup`, creates `~/.config/systemd/user/pickup.service`, enables and starts the daemon automatically on reboot.*

### Windows
```powershell
irm https://pickup.sh/install.ps1 | iex
```
*Installs to `%PROGRAMFILES%\Pickup\`, registers a Windows Service via NSSM, and requests accessibility/window-title permissions via manifest.*

### Mobile (Termux / Android & iOS)
**Android (via Termux):**
```bash
pkg install pickup
pickup setup --telegram
```
*Runs a lighter version of the daemon. Has no window watching, but works as an MCP client where agents can query your checkpoints from your phone.*

**iOS:** Run Native app (Swift) - Receives push notifications and operates strictly in relay-mode. The Telegram bot works natively!

---

## 05. Telegram Setup — Zero Friction
The goal: **working Telegram bot in under 3 minutes.**

```bash
pickup setup telegram
```

1. Prompts: *"Open Telegram, message @BotFather, create a bot, paste the token here:"*
2. You paste the token.
3. Pickup registers the webhook to your cloud relay (or runs local polling).
4. Prompts: *"Now message your new bot anything. Waiting..."*
5. You send any message. Pickup captures your chat ID automatically. Done.

### Telegram Commands
No YAML, no complex configs. Once setup, these are your instant interface commands:

```text
/pickup                  → Show last brief
/pickup list             → Last 5 checkpoints with timestamps
/pickup list 20          → Last 20 checkpoints
/pickup find auth        → Search checkpoints for "auth"
/pickup save [text]      → Create manual checkpoint with your note
/pickup agent            → Show what your AI agents are doing right now
/pickup status           → System health: daemon up? API working? RAM?
/pickup pause            → Pause checkpoint collection
/pickup resume           → Resume checkpoint collection
/pickup yes              → Approve a pending agent action
/pickup no               → Reject a pending agent action
/pickup allow [command]  → Whitelist a command for agents
/pickup block [command]  → Blacklist a command permanently
/pickup brief [id]       → Show full brief for a specific checkpoint ID
/pickup day              → Summary of today: focus time, interruptions, checkpoints
/pickup week             → Weekly pattern summary
/pickup cost             → How much API spend today/this month
/pickup model ollama     → Switch LLM to local Ollama (zero cost mode)
/pickup model claude     → Switch back to Claude
/pickup help             → Full command list
```

## Architecture

- **Core Daemon (`Rust`)**: Under 5MB, always-on window watcher. Emits events on Unix sockets.
- **Brain (`Python`)**: Connects to the daemon. Reaches out to the Anthropic API (or local Ollama, depending on `brain/config.yaml`) to generate a brief.
- **MCP Bridge (`TypeScript`)**: Exposes MCP tools for OpenClaw, Claude Code, and Cursor to access context.
- **Cloud Relay (`Node.js`) / Dashboard (`React`)**: Encrypted Tailscale/ngrok routing to provide mobile UI and Telegram delivery without exposing your local PC to the clear net. Access is strictly bounded by `guardrails.yaml`.

## Logs & Data
Checkpoints are written to `~/.pickup/checkpoints.jsonl`.
Logs are at `~/.pickup/pickup.log`.
Unix Socket is at `/tmp/pickup.sock`.
