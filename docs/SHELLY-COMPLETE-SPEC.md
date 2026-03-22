# Shelly — Complete Technical Specification

> **What is Shelly?**
> A mobile-first development environment that runs entirely on Android (Termux).
> Chat and Terminal, side by side. Connected by AI.
> Built by a non-engineer who can't write code, using only AI tools on a phone.

---

## Table of Contents

1. [Core Architecture](#core-architecture)
2. [Implemented Features (v0.9)](#implemented-features)
3. [Next Implementation: Cross-Pane Intelligence (v1.0)](#cross-pane-intelligence)
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

## Implemented Features (v0.9)

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

## Cross-Pane Intelligence (v1.0) — Next Implementation

**Full spec:** `docs/superpowers/specs/2026-03-23-cross-pane-intelligence-design.md`

### The Problem
Every developer using CLI AI tools repeats this daily:
1. Error in terminal → 2. Copy → 3. Switch to chat → 4. Paste → 5. Read answer → 6. Copy fix → 7. Switch back → 8. Paste and run

### The Solution
Say "fix the error on the right" — AI reads terminal output, explains, generates executable command, one-tap to run.

### Phase 1: Terminal Cleanup
- Remove Activity Log from Terminal tab
- Terminal = pure TTY only (ttyd WebView + ShortcutBar + Header)

### Phase 2: Terminal Output Capture
- Capture terminal output from ttyd WebView via WebSocket/onMessage
- Store in `execution-log-store` as plain text (ANSI stripped)
- FIFO buffer: 100 lines max

### Phase 3: Cross-Pane Patterns
- Pattern matching in `input-router.ts` for terminal references:
  - Japanese: 「右のエラー直して」「ターミナルの出力を見て」
  - English: "fix the error on the right", "look at the terminal"
- Inject terminal output into AI system prompt
- Works in multi-pane (always) and single-pane (when output exists)

### Phase 4: ActionBlock
- Parse AI responses: separate natural language from code blocks
- Each code block becomes an ActionBlock with [▶ Execute] [Copy] buttons
- Execute: sends command to Terminal pane (multi-pane) or runs via bridge (single-pane)
- Safety check via `command-safety.ts` before execution

### Phase 5: CLI Real-Time Assist

**5-1. Real-Time Translation & Explanation**
- Settings toggle (default: OFF)
- Translates + explains CLI output in real-time
- Displayed as semi-transparent overlay on Chat pane (not in chat history)
- **Fallback order: Cerebras API → Groq API → `gemini -p` (Gemini CLI) → Local LLM**
- Gemini CLI chosen because: recommended CLI for all Shelly users, no API key needed, acts as implicit second opinion when Claude Code is running in Terminal

**5-2. Approval Prompt Translation**
- Detects CLI approval patterns: "Allow? (Y/n)", "[y/N]", etc.
- Translates context + assesses risk level
- Shows alert bubble in Chat with risk indicator

**5-3. Second Opinion**
- User-initiated: "What does @gemini think about what Claude is doing?"
- Sends terminal output to different AI for review

**5-4. Session Summary**
- User-initiated: "Summarize what we did"
- Sends full terminal buffer to AI for structured summary

### Phase 6: "Open in Terminal" Button
- CommandExecBubble gets "Open in Terminal" link
- Switches to Terminal tab + cd to working directory

### Phase 7: Feature Cleanup
- Quick Terminal hidden on wide screens (multi-pane replaces it)
- LLM interpreter default OFF (cross-pane replaces it)
- ShortcutBar toggle for external keyboard users

### Phase 8: Documentation Overhaul
- README rewrite: lead with pain (copy-paste hell), show solution
- Hero subtitle: "Chat and Terminal, side by side. Connected by AI."
- Architecture diagrams for cross-pane data flow
- CLAUDE.md decision table update

---

## Future Design (v2.0+)

### GitHub Integration — "Share" Button
- Projects tab: "Share to GitHub" one-button flow
- First time: GitHub PAT setup → repo creation → push
- Subsequent: one-tap push with progress in Chat
- No git terminology exposed to user

### Timeline View
- Projects tab: visual timeline of savepoints
- Each savepoint: timestamp, auto-generated description
- Tap to: "Restore to this point" or "View diff from here"
- Backend: `git log --oneline` + `git diff` + `git checkout`

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
| **MCP Protocol** | Shelly's @mention + input router achieves the same tool selection without MCP's overhead. Perplexity's CTO noted MCP tool descriptions consume 40-50% of context window. |
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

## Review Questions for AI Reviewers

Please review this specification and provide your assessment on:

### Architecture & Design
1. Are there architectural risks or blind spots in the cross-pane intelligence design?
2. Is the terminal output capture approach (WebSocket interception + ANSI stripping + 100-line FIFO) sufficient, or are there edge cases that could break it?
3. Is the ActionBlock design (parse code blocks → separate display → one-tap execute) the right approach, or is there a better UX pattern?

### Priority & Scope
4. **Of the Future Design items (GitHub integration, Timeline, A2A, Parallel Tasks), which should be implemented immediately for v1.0 launch?** What would maximize user adoption?
5. Is there a critical feature missing from this spec that competitors have?

### Real-Time Translation Fallback
6. The fallback order is: Cerebras API → Groq API → `gemini -p` (CLI) → Local LLM. Is this the right order? Are there better options?
7. Using Gemini CLI as a fallback (no API key needed, acts as implicit second opinion) — is this clever or problematic?

### OSS Impact Assessment
8. **What impact would Shelly's open-source release have on the developer community?** Consider:
   - A mobile-first dev environment built entirely by a non-engineer using AI
   - Cross-pane intelligence (Chat ↔ Terminal) as a new paradigm
   - The "I can't write code" narrative as a README opener
   - Competition: Termux alone, VS Code Server, Code-Server, GitHub Codespaces
9. **What would the community reception look like?** Which communities (HN, Reddit, Product Hunt, Japanese dev community) would respond most strongly?
10. **Is "built by a non-engineer on a phone" a strength or a liability** in terms of developer trust and adoption?

### Risk Assessment
11. What are the top 3 risks that could prevent Shelly from gaining traction?
12. Is there anything in this design that experienced developers would immediately reject or distrust?
