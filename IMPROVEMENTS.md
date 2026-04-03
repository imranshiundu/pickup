# Improvements for Pickup

## 1. Documentation & Onboarding
- Add a concise **quick‑start guide** with step‑by‑step screenshots for macOS, Linux, Windows, Android, and iOS.
- Provide a **FAQ** covering common permission prompts (Accessibility, Accessibility/Window‑title on Windows, etc.).
- Document how to switch LLM providers in `brain/config.yaml` (Claude ↔ Ollama ↔ OpenAI) with example snippets.

## 2. Cross‑Platform Consistency
- Unify the **service registration** process: use systemd on Linux, LaunchDaemon on macOS, and Windows Service via NSSM with the same configuration file layout.
- Add **Windows event‑log** integration to mirror the daemon logs on other OSes.
- Ensure the **clipboard watcher** works on Wayland (Linux) as well as X11.

## 3. Security & Privacy Enhancements
- Encrypt `~/.pickup/checkpoints.jsonl` at rest (optional AES‑256 wrapper) and add a `--encrypt` flag.
- Add a **revocation endpoint** to delete all stored checkpoints on command.
- Harden the MCP bridge: enforce strict CORS, rate‑limit, and require an API‑key header.

## 4. Extensibility & Integration
- Publish an **OpenAPI (Swagger) spec** for the MCP bridge so other services can auto‑generate clients.
- Add a **WebSocket** push option for real‑time streaming of new checkpoints to dashboards.
- Provide a **Docker Compose** file that spins up the daemon, brain, and bridge together for easy deployment.
- Create a **Python/Node SDK** (`pickup-client`) that abstracts the socket communication.

## 5. AI Brief Generation Improvements
- Allow **custom prompt templates** in `brain/config.yaml` so users can control length, tone, and detail of the brief.
- Cache LLM responses per checkpoint to avoid duplicate API calls when the same checkpoint is fetched repeatedly.
- Add an option to generate a **markdown‑formatted** brief (with bullet points, code fences, etc.) for better readability in chat platforms.

## 6. User Interaction & UI
- Enhance the **Telegram bot**: add inline keyboards for quick actions (pause/resume, approve/reject) and richer formatting (markdown, emojis).
- Create a **Desktop tray icon** (Linux/macOS/Windows) with a popup showing the latest brief and a button to copy it.
- Implement a **web dashboard** (React) that visualises daily/weekly interruption patterns and checkpoint timelines.

## 7. Performance & Reliability
- Reduce daemon memory footprint by lazy‑loading the XCB/X11 bindings only when needed.
- Add a **watchdog** that restarts the daemon automatically if it crashes.
- Provide a `--dry-run` mode for the bridge to validate incoming requests without persisting checkpoints.

## 8. Testing & CI
- Add **unit tests** for the Rust watcher, Python brain, and TypeScript bridge (currently only integration tests exist).
- Set up a **GitHub Actions CI pipeline** that builds the Rust binary for all three platforms and runs the full test suite on each.
- Include a **fuzzing** target for the IPC layer to catch malformed socket messages.

## 9. Internationalisation
- Externalise all user‑visible strings into a `locales/` folder and provide **English** and **German** translations as a starter.
- Allow the LLM prompt language to be configured per‑user in `brain/config.yaml`.

## 10. License & Community
- Clarify the **license** header in all source files (currently MIT, but some sub‑modules inherit different licenses).
- Add a **CONTRIBUTING.md** with guidelines for code style, issue triage, and pull‑request reviews.
- Set up a **discussions** board on GitHub for feature ideas and support.

---
*Prepared by Haico 1.0.  Deadline for the next release is **2026‑04‑08** (aligned with the overall project deadline).*