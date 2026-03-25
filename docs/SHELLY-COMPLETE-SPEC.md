# Shelly — Complete Technical Specification

> **What is Shelly?**
> A mobile-first development environment that runs entirely on Android (Termux).
> Chat and Terminal, side by side. Connected by AI.
> Built by a non-engineer who can't write code, using only AI tools on a phone.

---

## Table of Contents

1. [Core Architecture](#core-architecture)
2. [Implemented Features (v1.0)](#implemented-features)
3. [Cross-Pane Intelligence (v1.0) — Implemented](#cross-pane-intelligence)
4. [Future Design (v2.0+)](#future-design)
5. [Excluded by Design](#excluded-by-design)
6. [Design Philosophy](#design-philosophy)
7. [Review Questions for AI Reviewers](#review-questions)

---

## Core Architecture

### Tech Stack
- **Runtime**: Expo 54 / React Native 0.81 / TypeScript
- **UI**: NativeWind (TailwindCSS 3)
- **State**: Zustand (terminal-store, chat-store, savepoint-store)
- **AI Routing**: @mention system — `@claude`, `@gemini`, `@local`, `@perplexity`, `@cerebras`, `@groq`, `@team`
- **Terminal**: Termux + ttyd (WebView) + WebSocket bridge (Node.js)
- **Package Manager**: pnpm 9.12
- **Build**: GitHub Actions → APK artifact

### Connection Architecture
```
[Shelly App (React Native)]
    ├── WebSocket (ws://127.0.0.1:8765) → [Bridge Server (Node.js in Termux)]
    │       └── child_process.spawn → shell commands
    ├── WebView (http://localhost:7681) → [ttyd (Termux)]
    │       └── full interactive TTY
    └── Native Module (Kotlin) → [Termux RunCommandService]
            └── background command execution
```

### Multi-Pane Layout
- Compact (phone): Single pane, tab navigation (Chat / Terminal / Projects / Settings)
- Wide (tablet/foldable): Up to 4 panes side-by-side, Chat + Terminal simultaneously

---

## Implemented Features (v1.0)

### AI Multi-Agent Routing
- **Input Router** (`lib/input-router.ts`): Analyzes natural language input and routes to appropriate AI
- **@mention system**: Direct control over which AI handles the request
- **@team**: Parallel execution across multiple AIs, results merged
- **Supported agents**: Claude Code, Gemini CLI, Cerebras, Groq, Perplexity, Local LLM (llama-server/Ollama), Codex

### Chat-First Interface
- Natural language → command conversion (e.g., "show me all files" → `ls -la`)
- Command execution results displayed as chat bubbles (CommandExecBubble)
- Voice input with continuous conversation mode
- CLI session mode (`@claude` starts persistent Claude Code session)

### Terminal Integration
- Full TTY via ttyd WebView with Japanese input support
- WebSocket bridge for command execution from Chat
- Shortcut bar for common terminal operations

### Auto-Recovery (Implemented 2026-03-22)
- When Termux crashes, Shelly automatically attempts restart via Native Module
- Fallback: opens Termux app + copies recovery command to clipboard
- Polls for reconnection (3s intervals, max 30s)
- After recovery, offers to resume previous Claude Code session via `--continue`
- Recovery banner with SafeArea support

### Auto-Savepoint System (Implemented 2026-03-22)
Game-like auto-save. Users never see Git terminology.

**Triggers:**
- AI response completion → immediate diff check → save
- File-changing commands (npm, touch, mkdir, etc.) → save
- 30-second idle timer → silent diff check → save if changes exist

**Components:**
- `lib/auto-savepoint.ts`: git init/status/add/commit/revert/diff
- `store/savepoint-store.ts`: Zustand state management
- `components/SaveBadge.tsx`: Animated 💾 in ChatHeader (2s fade)
- `components/SavepointBubble.tsx`: "Undo" + "View changes" buttons per message
- `components/DiffViewerModal.tsx`: Color-highlighted diff viewer
- Auto-generated commit messages: "Auto: Created index.html", "Auto: Updated 3 files"

**Undo:**
- "Undo" button on chat bubbles → `git revert HEAD --no-edit`
- Conflict handling: auto-abort on failure + error toast
- Already-reverted commits show disabled button

### WebView Preview (Implemented 2026-03-22)
- Detects ```html code blocks in AI responses
- "Preview" button opens WebPreviewModal with live WebView rendering
- The correct reincarnation of the deleted Browser tab

### Setup & Onboarding
- SetupWizard: One-tap Termux setup, AI tool selection
- AuthWizard: API key configuration for LLM services
- Project context auto-generation (`.shelly/context.md`)
- User profile auto-learning (command patterns, AI preferences)

---

## Cross-Pane Intelligence (v1.0) — Implemented

**Full spec:** `docs/superpowers/specs/2026-03-23-cross-pane-intelligence-design.md`

### The Problem
Every developer using CLI AI tools repeats this daily:
1. Error in terminal → 2. Copy → 3. Switch to chat → 4. Paste → 5. Read answer → 6. Copy fix → 7. Switch back → 8. Paste and run

### The Solution (Implemented)
Say "fix the error on the right" — AI reads terminal output, explains, generates executable command, one-tap to run.

**All 8 phases implemented and verified on device (2026-03-25).**

### Terminal Output Capture
- xterm.js buffer observation via injected JS (baseY + cursorY tracking, 500ms polling)
- ANSI escape code stripping via `lib/strip-ansi.ts`
- Dual buffer: hotBuffer (100 lines for realtime UI) + sessionBuffer (1000 lines with error prioritization)
- `store/execution-log-store.ts`: addTerminalOutput, getRecentOutput, clearTerminalOutput

### Cross-Pane Pattern Detection
- `lib/input-router.ts`: `hasTerminalReference()` and `getTerminalIntent()`
- 3 intents: `reference` / `second-opinion` / `session-summary`
- Japanese patterns: 「右のエラー直して」「ターミナルの出力を見て」「さっきのエラー」
- English patterns: "fix the error on the right", "terminal output", "review what's happening"
- Wide mode: always inject terminal context. Single pane: only on pattern match

### AI Context Injection
- `hooks/use-ai-dispatch.ts`: `getTerminalContextForPrompt()` with intent-based suffixes
- Injected into all providers: Local LLM, Cerebras, Groq, Gemini (API+CLI), Perplexity
- Empty output: graceful fallback to normal response

### ActionBlock
- `lib/parse-code-blocks.ts`: Parse AI responses, separate text from fenced code blocks
- `components/chat/ActionBlock.tsx`: [▶ Run] + [Copy] buttons per code block
- Run: Wide = send to Terminal pane, Single = execute via bridge
- Safety check via `command-safety.ts` before execution
- Language hints (```bash etc.) displayed

### CLI Real-Time Assist
- `lib/realtime-translate.ts`: Cerebras → Groq → Local LLM fallback (Gemini CLI intentionally excluded — CLI process spawn latency too high for realtime use. Could be added as final fallback for users without API keys in future)
- `components/chat/TranslateOverlay.tsx`: Semi-transparent overlay, 1s debounce, 10s auto-hide
- Approval prompt detection (Y/n, y/N patterns) with warning icon
- Second opinion: "review what Claude is doing" → different AI reviews terminal
- Session summary: "summarize what we did" → structured summary

### "Open in Terminal" Button
- `components/chat/ChatBubble.tsx`: "Open in Terminal" link on command results
- Switches to Terminal tab

### Feature Cleanup (Done)
- Quick Terminal hidden on wide screens (`!layout.isWide && <QuickTerminal />`)
- LLM interpreter toggle in Settings (default OFF)
- ShortcutBar toggle for external keyboard users

### Codebase Cleanup (2026-03-25)
- Removed 4 hidden tabs: creator, snippets, obsidian, search (-2,740 lines)
- Removed MCP settings (contradicted Excluded by Design)
- Moved Glass Background to Advanced Settings
- Consolidated duplicate theme sections
- Tab structure: Projects / Chat / Terminal / Settings (4 tabs only)

---

## Known Limitations (v1.0)

| Item | Detail |
|------|--------|
| **Gemini CLI excluded from realtime translate** | CLI process spawn latency (1-2s) too high for realtime use. Cerebras → Groq → Local LLM provides sub-500ms responses. Intentional design decision. |
| **Terminal history display on reconnect** | Previous session output is re-injected as dimmed text on WebView reload. Not a true scrollback buffer restore, but functionally equivalent for user reference. |

### Timeline View (Implemented)
- Projects tab: accordion under each git project, toggle with 🕒 button
- `components/ProjectTimeline.tsx`: vertical timeline with dots, messages, relative timestamps
- Tap any savepoint → "View diff" or "Revert to this point"
- Backend: `git log --oneline --format='%h|%s|%cr'` + `git diff` + `git checkout`
- 20 savepoints shown by default, "Show more" button for additional entries

---

## Future Design (v2.0+)

### GitHub Integration — "Share" Button
- Projects tab: "Share to GitHub" one-button flow
- First time: GitHub PAT setup → repo creation → push
- Subsequent: one-tap push with progress in Chat
- No git terminology exposed to user

### A2A (Agent-to-Agent Protocol) Interface
- Define external agent registration interface in `plugin-api.ts`
- Compatible with Google's A2A protocol and Anthropic's MCP ecosystem
- @team architecture already implements multi-agent parallel execution
- Interface only — no implementation until ecosystem matures

### Parallel Task Execution
- Extend @team from "same prompt to multiple AIs" to "different tasks to multiple AIs simultaneously"
- Example: `@claude build frontend` + `@gemini research API docs` running in parallel
- Requires git worktree management + savepoint integration
- v2.0 because savepoint system must be battle-tested first

### Developer Keyboard App (Post-Shelly)
- Split layout (V-angle), trackball
- One-tap terminal shortcuts
- High-accuracy voice input
- Optimized Japanese prediction

---

## Excluded by Design

| Feature | Reason |
|---------|--------|
| **MCP Protocol** | Shelly's @mention + input router achieves the same tool selection without MCP's overhead. Perplexity's CTO noted MCP tool descriptions consume 40-50% of context window. Settings UI for MCP was removed in v1.0 cleanup to resolve this contradiction. |
| **Autonomous Agent Mode** | Contradicts Shelly's design: "user chats and builds interactively." Autonomous agents work when user walks away — opposite philosophy. |
| **Cloud Execution** | Shelly's value is "everything on one phone." Sending code to cloud breaks the privacy-first, offline-capable design. |
| **Browser Tab** | Replaced by WebPreviewModal in chat bubbles. Purpose-built preview is better than a general browser. |

---

## Design Philosophy

### Origin
Shelly was built by a non-engineer (construction industry project manager) who:
- Can't write code
- Can't read English error messages fluently
- Develops entirely on a phone (Samsung Galaxy Z Fold6, Termux)
- Uses only AI tools to build software

### Core Principles
1. **Hide Termux** — Users should never need to know Termux exists
2. **Natural language only** — No command memorization required
3. **5-minute setup** — From install to first command in 5 minutes
4. **Game-like UX** — Auto-save, undo button, visual preview
5. **Two-layer design** — Beginners: Chat only. Power users: Terminal + Chat side by side
6. **No API key hoarding** — Use CLI tools (gemini, claude) that handle their own auth
7. **Phone-complete** — No laptop, no cloud, no external server required

### The Innovation Pattern
Every feature started as a limitation of being a non-engineer on a phone:
- Can't copy-paste accurately on phone → **Cross-pane intelligence** (AI reads terminal directly)
- Can't read English CLI output → **Real-time translation**
- Can't assess CLI approval risks → **Approval prompt translation with risk level**
- Can't trust one AI's judgment → **Second opinion from different AI**
- Don't understand Git → **Auto-savepoint with undo button**
- Can't preview HTML on phone → **WebView preview in chat**

**Every limitation became an innovation that engineers need just as much.**

---

## Open Questions

Areas where community feedback and contributions are especially welcome:

### Architecture
- Terminal output capture uses xterm.js buffer polling (500ms). Are there more efficient approaches (MutationObserver, xterm.js onData event)?
- The dual-buffer design (hotBuffer 100 + sessionBuffer 1000) works but may need tuning for long-running CLI sessions.

### UX
- ActionBlock safety check shows a dialog for HIGH-risk commands. Is this the right threshold, or should MEDIUM also prompt?
- Realtime translation overlay auto-hides after 10s. Should this be configurable?

### Ecosystem
- How should Shelly interact with VS Code Server / Code-Server when both are running on the same device?
- Is A2A protocol integration worth pursuing, or does the @mention system already cover multi-agent needs?

### Demo Script for OSS Launch
- Looking for community input on the best demo scenario to showcase Cross-Pane Intelligence
- Target: 30-60 second video showing the "7-step problem → 0-step solution" narrative
