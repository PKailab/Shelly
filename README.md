<p align="center">
  <!-- TODO: Hero screenshot — Shelly UI with Nacre keyboard visible -->
  <img src="docs/images/hero.png" alt="Shelly — AI Terminal IDE" width="600">
</p>

<h1 align="center">Shelly</h1>

<p align="center">
  A chat-first terminal IDE for Android.<br>
  Talk to your phone. It builds things.
</p>

<p align="center">
  <a href="#getting-started">Getting Started</a> ·
  <a href="#features">Features</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="docs/DESIGN_PHILOSOPHY.md">Design Philosophy</a> ·
  <a href="CONTRIBUTING.md">Contributing</a>
</p>

---

## I can't write code.

I'm not an engineer. I've never written a line of TypeScript. I don't fully understand how Git works internally. I have no formal training in computer science.

But I built this — a 70,000-line terminal IDE — by talking to AI.

Every function, every component, every architectural decision in Shelly was created through conversation with [Claude Code](https://claude.ai/), running inside [Termux](https://termux.dev/) on a Samsung Galaxy Z Fold6. No desktop. No laptop. Just a foldable phone, a terminal emulator, and an AI that can execute commands.

The keyboard you see in the screenshots? I built that too. It's called [Nacre](https://github.com/RYOITABASHI/Nacre) — an 11,000-line Android IME written in Kotlin, also created entirely through AI conversation. I'm typing on it right now, inside Shelly, improving both apps simultaneously.

This is not a portfolio project. This is a tool I use every day to build things. And I'm releasing it as open source — not because the code is perfect, but because I believe this represents a new way of making software.

If you find rough edges in the code, that's expected. This is AI-generated code shaped by a designer's intent. **Improvements are not just welcome — they're the reason this is open source.**

---

## The Story

Mobile development never took off — not because phones lack computing power, but because the **input** and **interface** weren't designed for creation.

- **Chat apps** (ChatGPT, Claude, Gemini) can *talk* about code, but they can't *run* it. You get suggestions, but executing them is your problem.
- **Terminal emulators** (Termux) can *run* anything, but they're hostile to anyone who isn't already a developer.

Shelly fills the gap between conversation and execution. You type "make me a portfolio site" in a chat bubble, and a real shell runs `mkdir`, `npm init`, generates files, and shows you the results — all inside the same chat interface you already know from ChatGPT.

For the person who wants to build things but doesn't speak terminal, Shelly translates. For the person who speaks terminal fluently, a raw shell is one tab away.

---

## Features

- **Chat-first UI** — Talk naturally, get real execution. Commands run behind the scenes in Termux.
- **Multi-agent AI routing** — Automatically selects Claude Code, Gemini, Perplexity, or local LLM based on the task.
- **@mention routing** — `@claude`, `@gemini`, `@local`, `@perplexity`, `@team` for direct control.
- **5-level command safety** — Every command is risk-assessed before execution. Dangerous operations require explicit confirmation.
- **Termux bridge** — Native Kotlin module for direct Termux integration. No WebSocket server required.
- **Voice input** — Speak commands and hear AI responses.
- **Creator engine** — "Build me an app" → full project scaffolding from natural language.
- **Local LLM support** — Run Gemma/Llama on-device via llama.cpp with guided setup wizard.
- **Terminal tab** — Full TTY access with Japanese input support (something Termux alone can't do).
- **Multi-pane layout** — Split view on foldable/wide screens.
- **Project management** — Chat history tied to project folders, like conversations in ChatGPT.
- **Obsidian RAG** — Search your Obsidian vault from the terminal.
- **Snippet manager** — Save and reuse code snippets.
- **Theme engine** — 30+ customizable tokens.
- **i18n** — English and Japanese.

---

## Architecture

```
User input (natural language)
       │
       ▼
┌─────────────────────┐
│   Input Router       │  ← Intent classification (4 layers + 4.5 routing)
│   "What does the     │
│    user want?"       │
└──────────┬──────────┘
           │
    ┌──────┴──────┐
    ▼             ▼
┌────────┐  ┌──────────┐
│ Light  │  │ AI Agent │  ← Claude Code / Gemini / Local LLM / Perplexity
│ Tasks  │  │ Selection│
│(direct)│  └────┬─────┘
└────────┘       │
                 ▼
          ┌─────────────┐
          │Termux Bridge │  ← Native Kotlin module → Termux RunCommandService
          │(real shell)  │
          └──────┬──────┘
                 │
                 ▼
          ┌─────────────┐
          │  Chat UI     │  ← Results rendered as chat bubbles
          │  (response)  │     Command output collapsed/expandable
          └─────────────┘
```

The Input Router is the heart of Shelly. It decides whether your message is:
- A **light task** (file listing, simple lookup) → handled directly, no AI needed
- An **AI task** → routed to the best available backend
- A **@mention** → sent to the specified AI
- A **slash command** → executed as a shortcut

This design emerged from a non-engineer's question: *"Why do I have to know which tool to use? Can't the app just figure it out?"*

---

## Built With

| Layer | Technology |
|-------|-----------|
| Framework | Expo 54 / React Native 0.81 |
| Language | TypeScript (strict) |
| UI | NativeWind (TailwindCSS 3) |
| State | Zustand |
| API | tRPC + TanStack React Query |
| Animation | React Native Reanimated v4 |
| Navigation | expo-router v6 |
| Native modules | Kotlin (Termux Bridge) |
| i18n | expo-localization + Zustand |
| Package manager | pnpm 9.12 |

---

## Getting Started

### Prerequisites

- Android device with [Termux](https://f-droid.org/en/packages/com.termux/) installed (F-Droid version recommended)
- Node.js 18+ (via Termux or build environment)

### Install

```bash
# Clone the repository
git clone https://github.com/RYOITABASHI/Shelly.git
cd Shelly

# Install dependencies
pnpm install

# Start the development server
pnpm start

# Run on Android
pnpm android
```

### Termux Bridge Setup

Shelly communicates with Termux via a native bridge module. On first launch, the Setup Wizard guides you through:

1. Installing Termux (if not present)
2. Granting necessary permissions
3. Configuring the bridge connection

For manual setup:
```bash
cd ~/shelly-bridge && node server.js
```

---

## Design Philosophy

Shelly was designed by someone who can't use a terminal — for people who can't use a terminal.

Every design decision comes from the question: *"If I don't know what this command does, how should the app protect me and teach me at the same time?"*

Read the full design philosophy: **[docs/DESIGN_PHILOSOPHY.md](docs/DESIGN_PHILOSOPHY.md)**

---

## Contributing

This is my first open source project. I'm a designer, not a developer. The code was generated by AI, and there's plenty of room for improvement.

If you find something that could be better — a cleaner pattern, a performance optimization, a bug fix — **please open an issue or PR**. That's exactly why this is open source.

Read the contributing guide: **[CONTRIBUTING.md](CONTRIBUTING.md)**

---

## About the Creator

**RYO ITABASHI** — Creative Director at [Rebuild Factoryz](https://rebuildfactoryz.com/). Branding and design are my profession. Code is not.

I built Shelly because I wanted to use Claude Code on my phone, but Termux was too intimidating. So I made a chat interface that hides the terminal complexity while keeping its full power.

The keyboard in the screenshots is **Nacre** — a split-layout Android IME I built (also through AI) to solve the input problem on mobile. Shelly handles the interface. Nacre handles the input. Together, they make phone-only development actually possible.

Both were developed entirely on a Samsung Galaxy Z Fold6, in Termux, without ever touching a desktop computer.

---

## License

[MIT](./LICENSE) — Copyright (c) 2026 RYO ITABASHI
