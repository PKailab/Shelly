# Shelly — AI-Powered Mobile Terminal IDE

## Overview

Shelly is a full-featured terminal IDE built entirely with React Native / Expo, designed to run on Android smartphones. It bridges the gap between mobile devices and real development environments by integrating Termux (Android's Linux terminal emulator) with multiple AI agents, a project generation engine, and a polished touch-optimized UI.

The entire app — every line of code — was developed on-device using Termux and Claude Code running on a Samsung Galaxy Z Fold6.

---

## Technical Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | React Native | 0.81.5 |
| Platform | Expo (New Architecture) | SDK 54 |
| Language | TypeScript | Strict mode |
| State Management | Zustand | 5.0.11 |
| Animation | React Native Reanimated | v4 (~4.1.6) |
| Gestures | React Native Gesture Handler | ~2.28.0 |
| Styling | NativeWind + Tailwind CSS | 4.2.1 / 3.4.17 |
| Audio | Expo Audio | ~1.1.0 |
| Navigation | Expo Router (file-based) | v6 |
| RPC | tRPC | 11.7.2 |
| Validation | Zod | 4.2.1 |
| Storage | AsyncStorage + Expo SecureStore | Latest |

---

## Architecture

### App Structure (8 Tabs)

```
Shelly
├── Terminal      — Main shell interface (command blocks + AI blocks)
├── TTY           — Full ttyd WebView terminal
├── Snippets      — Saved command management (swipe gestures)
├── Creator       — AI-powered project generation (4-lane workflow)
├── Browser       — In-app web browser
├── Obsidian      — Knowledge base / RAG integration
├── Search        — Cross-session search
└── Settings      — 38 configuration sections (advanced toggle for power users)
```

### Core Data Flow

```
User Input
    │
    ▼
5-Layer Input Router (lib/input-router.ts)
    │
    ├── Layer 1:   @mention        → Direct AI routing (@claude, @gemini, @local, @team, @git, etc.)
    ├── Layer 2:   NL + Tool       → Keyword detection ("claudeで", "検索して", "ollamaで")
    ├── Layer 3:   Natural Lang    → Tool suggestions with confidence scores
    ├── Layer 4:   Shell Command   → Pattern detection (pipes, paths, known CLIs)
    └── Layer 4.5: Lightweight NL  → Simple NL→shell shortcut ("ファイル一覧"→ls, "今どこ"→pwd) — no API call
    │
    ▼
Target Execution
    ├── Termux WebSocket Bridge → Real shell execution
    ├── Claude Code CLI         → Code generation / complex tasks
    ├── Gemini CLI              → Research / information gathering
    ├── Local LLM (Ollama)      → Offline chat / facilitation
    ├── Perplexity API          → Web search with citations
    ├── @team Table             → Multi-agent parallel consensus
    ├── @git Guide              → Natural language Git tutoring
    └── Browser                 → In-app web navigation
```

---

## Key Features

### 1. Termux WebSocket Bridge

Real bidirectional communication with Termux via WebSocket (ws://127.0.0.1:8765).

**Protocol (JSON over WebSocket):**
- Client → Server: `run`, `cancel`, `ping`
- Server → Client: `stdout`, `stderr`, `exit`, `cancelled`, `error`, `pong`, `ready`, `projectCreated`

**Reliability:**
- FIFO command queue with request IDs
- Auto-reconnect with exponential backoff (max 5 attempts, cap 30s)
- Foreground resume triggers reconnect (AppState listener)
- Cancel timeout fallback (5s) for force-finalize
- Battery-friendly retry strategy

### 2. Multi-AI Integration

5 AI backends with instant switching via @mention syntax:

| Agent | Method | Routing | Use Case |
|-------|--------|---------|----------|
| Claude Code | CLI (subscription) | `@claude` | Code generation, complex reasoning |
| Gemini | CLI + API | `@gemini` | Research, information gathering |
| Local LLM | Ollama HTTP API | `@local` / `@ai` | Offline chat, task classification |
| Perplexity | Sonar API | `@perplexity` / `@search` | Web search with source citations |
| Codex | CLI | `@codex` | Code assistance (optional) |

**Local LLM (Ollama) Details:**
- Default endpoint: http://127.0.0.1:11434
- Default model: llama3.2:3b
- Task classification: chat → local, code → Claude, research → Gemini, file_ops → Termux
- Full streaming support
- OpenAI-compatible API fallback (llama-server at port 8080)

### 3. @team Table — Multi-Agent Consensus

Sends the same prompt to all enabled AI agents in parallel, collects responses, and has a facilitator AI generate a unified summary. Results display facilitator summary first, followed by individual agent responses.

**Supported Members:**
- Claude (CLI, yellow), Gemini (CLI, blue), Codex (CLI, optional)
- Perplexity (API, teal), Local LLM (local, purple)

**Facilitation:**
- Auto-selected facilitator priority: Local → Claude → Gemini → Codex → Perplexity
- Callback-based streaming: each agent's response appears as it arrives
- Facilitator generates integrated summary after all responses collected

### 4. Command Safety System

Pre-execution risk analysis with 5 danger levels:

| Level | Action | Examples |
|-------|--------|---------|
| CRITICAL | Always block + confirm | `rm -rf /`, fork bomb, `dd` to block devices, `mkfs` |
| HIGH | Confirmation dialog | `curl \| bash`, `sudo`, socket access |
| MEDIUM | Warning only | Reversible side effects |
| LOW | Pass | Normal operations |
| SAFE | Pass | Read-only commands |

Pattern-based detection with ~20 regex rules covering:
- Recursive deletion of system directories
- Fork bomb patterns
- Direct storage device writes
- Pipe-to-interpreter attacks
- Privilege escalation attempts

**Post-Execution Recovery Suggestions:**
- `rm` → git checkout / git restore guidance
- `git reset --hard` → reflog recovery steps
- `git push --force` → force-with-lease recommendation
- `chmod 777` → correct permission values (755/644)
- `DROP TABLE / TRUNCATE` → backup restore procedures

### 5. Creator Engine — AI Project Generation

4-lane workflow for generating complete projects from natural language:

```
CommandLane → PlanLane → BuildLane → ResultLane
(Input)       (AI Plan)  (Execute)   (Output)
```

- Generates project plans with file estimates
- Step-by-step build execution with progress tracking
- Real file creation in Termux filesystem
- Project types: web (HTML/CSS/JS), script (Node/Python), document (MD/JSON)
- Project history with clone, improve, delete operations
- Save as recipe (reusable snippet template)
- **1-tap Task Templates:** Node API, Static Site, CLI Tool, Python Script — preset prompts for instant project creation

### 6. LLM Output Interpreter

Translates terminal command outputs to natural language using Local LLM:

- **Success:** "What happened" explanation (1-3 sentences)
- **Error:** Cause analysis + suggested fix command
- Streaming response with animated cursor
- Configurable model (default: qwen2.5-3b-instruct-q4_k_m)

### 7. Git Assistant

Natural language Git tutoring triggered by `@git`:

**Core Intents (5):** commit, push, status, diff, help — full guided workflow with action buttons

**Advanced Intents (11):** branch, merge, undo, pull, stash, clone, init, conflict, tag, remote, log — delegated to AI agents (@claude, @gemini) with a status-check command as fallback

**Workflow:**
1. Detect intent from Japanese/English natural language
2. Core intents: Run `git status`, generate beginner-friendly guide, present action buttons
3. Advanced intents: Suggest AI agent delegation with example prompts

### 8. Snippet Management

- Swipe-right to run, swipe-left to delete (gesture-based)
- Long-press to edit
- Sort by: last used, frequency, creation date
- Scope: global or session-specific
- Run modes: insert only / insert and auto-execute
- Import/export to JSON backup
- Recipe system for Creator Engine templates

### 9. Obsidian RAG Integration

- Configure Obsidian vault path
- Auto-collect notes on schedule (daily, configurable time)
- RAG-enhanced AI responses with vault context
- Configurable: max chunks (3-30), days back window (7-90)
- Target specific AI mentions for RAG injection

### 10. Dotfiles Sync

- GitHub Gist-based sync via Personal Access Token
- Push/pull configuration to cloud
- Last sync timestamp tracking

---

## UI/UX System

### Animation Engine

All animations use React Native Reanimated v4 running on the UI thread (worklets).

**Spring Presets:**
| Name | Damping | Stiffness | Mass | Use Case |
|------|---------|-----------|------|----------|
| snappy | 15 | 200 | 0.8 | Buttons, toggles |
| gentle | 20 | 120 | 1.0 | Panels, modals |
| bouncy | 10 | 180 | 0.6 | Success effects |
| quick | 18 | 300 | 0.5 | Micro-interactions |

**Timing Presets:**
| Name | Duration | Easing |
|------|----------|--------|
| fast | 150ms | cubic out |
| normal | 250ms | cubic out |
| slow | 400ms | cubic out |
| enter | 300ms | back(1.2) out |
| exit | 200ms | cubic in |

**Component Animations:**
- ShortcutBar: Key press scale (0.92 spring), toast spring + translateY
- CommandInput: Send button pulse (0.85→1 sequence), mode switch (0.8→1.1→1), recording dot pulse
- QuickTerminal: Spring slide-down, swipe-up-to-close gesture (Pan), backdrop opacity
- TerminalBlock: FadeInDown entrance, exit code badge bounce, 3-dot running indicator, copy button bounce, collapse icon rotation
- AiBlock: FadeInDown entrance, streaming cursor shimmer (0.4→1 opacity)
- TerminalHeader: Blinking cursor (500ms), tab switch bounce, bridge dot pulse, badge scale
- BlockList: Welcome banner FadeIn, scroll-to-bottom spring button

**Accessibility:**
- `useReducedMotion()` — All animations skip to target value when system reduce-motion is ON
- Sounds disabled when reduce-motion is active

### Sound System

14 UI feedback sounds with frequency/duration metadata (stub for WAV assets):

| Sound | Frequency | Duration | Trigger |
|-------|-----------|----------|---------|
| send | 880 Hz | 80ms | Command submission |
| success | 1047 Hz | 120ms | Exit code 0 |
| error | 220 Hz | 150ms | Non-zero exit |
| tab_switch | 660 Hz | 60ms | Tab navigation |
| key_press | 1200 Hz | 40ms | Shortcut key tap |
| ctrl_c | 440 Hz | 100ms | Interrupt signal |
| copy | 1320 Hz | 70ms | Copy to clipboard |
| ai_start | 523 Hz | 150ms | AI streaming begins |
| ai_complete | 784 Hz | 200ms | AI response done |
| connect | 587 Hz | 180ms | Bridge connected |
| disconnect | 330 Hz | 150ms | Bridge lost |
| mode_switch | 698 Hz | 90ms | Connection mode change |
| quick_open | 740 Hz | 120ms | Quick terminal opens |
| quick_close | 494 Hz | 100ms | Quick terminal closes |

**Controls:** Global enable/disable, volume (0-100%), Zustand store

### Theme System

30 color tokens in `theme.config.ts` with `as const` type safety:

**Categories:**
- Structural: background (#0D0D0D), backgroundDeep (#0A0A0A), surface (#1A1A1A), surfaceHigh (#111111)
- Text: foreground (#E8E8E8), foregroundDim (#D1D5DB), muted (#6B7280), inactive (#4B5563)
- Borders: border (#2D2D2D), borderLight (#2A2A2A), borderHeavy (#333333)
- Status: success (#4ADE80), warning (#FBBF24), error (#F87171)
- Semantic: accent (#00D4AA), command (#93C5FD), link (#60A5FA)
- AI: aiPurple (#8B5CF6), interpretPurple (#A78BFA), interpretText (#C4B5FD)

**Utilities:**
- `withAlpha(hex, alpha)` → rgba string (e.g., `withAlpha('#00D4AA', 0.13)`)
- `adjustBrightness(hex, percent)` → lighter/darker hex
- `useTheme()` hook for component consumption

### Haptic Feedback

Unified across all interactions:
- Light: Key press, navigation
- Medium: Ctrl+C, long press, mode switch
- Success: Copy, command success
- Warning: Error, safety alert

### Responsive Design

Optimized for Samsung Galaxy Z Fold6:
- Cover screen (narrow): Single-column, touch targets ≥44dp
- Inner screen (wide): Multi-pane layout (2-3 panes)
- Foldable detection via `useDeviceLayout()`
- Keyboard shortcuts for physical keyboards (Ctrl+Shift+P, Cmd+K, etc.)

---

## Settings (38 Sections)

| Category | Settings |
|----------|----------|
| Display | Font size (12-24), line height (0.8x-2.0x) |
| Glass Background | Wallpaper, opacity (10-100%), blur intensity (0-100) |
| Theme | Theme variant selection (visual grid), WezTerm-style theme engine |
| Cursor | Block / underline / bar (visual preview) |
| Behavior | Haptic feedback, auto-scroll, high contrast output (OLED) |
| Sound | Effects ON/OFF, volume (0-100%) |
| Termux Bridge | WS URL, auto-reconnect, timeout, TTY URL, connection test |
| Local LLM | Enable, URL, model name, connection test |
| llama.cpp | Model management, installation UI |
| Perplexity | API key (masked), model selection |
| Gemini | API key (masked), model selection |
| @team Table | Member enable/disable (5 agents), Codex CLI config |
| Command Safety | Enable, confirm level (CRITICAL/HIGH/MEDIUM) |
| Obsidian RAG | Vault path, auto-collect schedule, chunk limits |
| Snippets | Run mode, auto-return to terminal |
| Backup | Snippet export/import, project export/import |
| Data | Session log export, clear all history |
| Language | English / Japanese (i18n) |
| Dotfiles | GitHub PAT, Gist sync |
| Package Manager | Termux pkg GUI |

---

## Development Environment

```
Device:     Samsung Galaxy Z Fold6
OS:         Android 14
Terminal:   Termux (proot-distro or native)
Editor:     Claude Code (CLI) running in Termux
Runtime:    Node.js (via Termux)
Package Mgr: pnpm 9.12.0
Build:      Expo Development Build (EAS)
TypeScript: Strict mode, npx tsc --noEmit = 0 errors
```

The app is self-referential: Shelly is a terminal IDE, built inside a terminal (Termux), using an AI coding assistant (Claude Code), on the same device it's designed to run on.

---

## Metrics

- **Version:** 4.2.0
- **Codebase:** ~50+ TypeScript files
- **Dependencies:** 40+ packages
- **AI Integrations:** 5 backends (Claude, Gemini, Perplexity, Ollama, Codex)
- **Settings:** 38 configuration sections
- **Theme Tokens:** 30 color definitions
- **Sound Effects:** 14 feedback sounds
- **Animation Presets:** 9 (4 spring + 5 timing)
- **Keyboard Shortcuts:** 8+ physical key bindings
- **Git Intents:** 5 core + 11 AI-delegated
- **Safety Patterns:** ~20 danger detection rules
- **Supported Languages:** Japanese / English

---

## Summary

Shelly is not just a terminal emulator — it's a mobile-first development environment that combines real shell access, multi-AI orchestration, project scaffolding, command safety, and a polished UI with spring physics animations. Every component uses a centralized theme system, every interaction has haptic and audio feedback, and every animation respects system accessibility settings.

### 11. Setup Wizard — 2-Choice Onboarding

New users are presented with two paths before the 5-step setup wizard:

- **おすすめ構成 (Recommended):** Sets Gemini CLI as default agent, skips AI tool selection step. One-tap to start.
- **カスタム構成 (Custom):** Full 5-step wizard with manual AI tool selection.

This reduces initial friction for beginners while preserving flexibility for power users.

---

Built entirely on a smartphone, for smartphones.
