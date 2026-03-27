# Agent SDK Harness Design

## Problem

When Shelly is put into split-view or backgrounded on Z Fold6, Android's Phantom Process Killer terminates ttyd/tmux processes. Claude Code loses its session context. The current `claude --continue` recovery is incomplete — it restores the CLI but not the full conversation context (tools used, files read, in-progress work).

## Goal

Transparent, automatic session persistence for Claude Code via Agent SDK's `resume` capability. Users never notice a disruption — when they return to Shelly, Claude Code continues exactly where it left off.

## Scope

- **In scope**: Claude Code sessions via Agent SDK in Bridge server
- **Out of scope**: Gemini CLI, Cody, Codex (no SDK available), Chat tab AI

## Architecture

### Current Flow

```
Shelly App → WebSocket → Bridge (server.js) → pty.spawn('bash', ['-c', 'claude ...'])
```

### New Flow

```
Shelly App → WebSocket → Bridge (server.js) → detectClaude(command)?
                                                ├─ YES → claude-harness.js → Agent SDK query()/resume()
                                                │         ↓ stream messages
                                                │         → WebSocket stdout/exit messages
                                                └─ NO  → pty.spawn() (unchanged)
```

### Key Constraint

- `server.js` is CommonJS (`"type": "commonjs"`)
- Agent SDK (`@anthropic-ai/claude-agent-sdk`) is ESM-only
- Solution: `claude-harness.js` is a separate ESM module, loaded via `import()` from server.js

## Components

### 1. `~/shelly-bridge/claude-harness.mjs` (new file)

ESM module that wraps Agent SDK interactions.

**Exports:**
- `startSession(prompt, cwd)` → `{ sessionId, stream: AsyncIterable }`
- `resumeSession(sessionId, prompt)` → `{ stream: AsyncIterable }`
- `cancelSession()` → void
- `getActiveSessionId()` → string | null

**Session state file:** `~/.shelly/harness/active-session.json`
```json
{
  "sessionId": "uuid-xxx",
  "cwd": "/home/Shelly",
  "startedAt": "2026-03-27T10:00:00Z",
  "lastActiveAt": "2026-03-27T12:30:00Z"
}
```

**Behavior:**
- On `startSession`: call `query({ prompt, options })`, capture `session_id` from init message, save to `active-session.json`, stream output
- On `resumeSession`: call `query({ prompt, options: { resume: sessionId } })`, stream output
- On `cancelSession`: abort the current stream iteration
- Output mapping: Agent SDK messages → Bridge protocol (`stdout`/`exit` messages)

### 2. `~/shelly-bridge/server.js` (modified)

**Changes to `handleRun()`:**

```
if command matches /^claude(\s|$)/:
  1. Extract prompt from command (everything after 'claude')
  2. Check active-session.json for existing sessionId
  3. If sessionId exists → resumeSession(sessionId, prompt)
  4. If no sessionId → startSession(prompt, cwd)
  5. Stream output via existing send(ws, { type: 'stdout', ... })
  6. On completion → send(ws, { type: 'exit', ... })
else:
  existing pty.spawn logic (unchanged)
```

**stdin handling:** When `activeCli === 'claude-sdk'`, route stdin to Agent SDK via `AskUserQuestion` response mechanism instead of pty.write().

### 3. `~/.shelly/harness/` (new directory)

- `active-session.json` — current session state
- Created on first use

## Agent SDK Configuration

```javascript
query({
  prompt: userPrompt,
  options: {
    cwd: workingDirectory,
    allowedTools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep", "Agent", "WebSearch", "WebFetch"],
    permissionMode: "acceptEdits",
    resume: existingSessionId,  // if resuming
  }
})
```

## Message Mapping

| Agent SDK Message | Bridge Protocol |
|---|---|
| `{ type: "system", subtype: "init" }` | Capture `session_id`, save to file |
| `{ "result": "..." }` | `{ type: "stdout", data: result }` then `{ type: "exit", code: 0 }` |
| Stream text content | `{ type: "stdout", data: text }` |
| Error | `{ type: "stderr", data: message }` then `{ type: "exit", code: 1 }` |

## Recovery Flow

```
1. Android kills processes (Phantom Process Killer)
2. Bridge restarts (start-shelly.sh or auto-recovery)
3. User types 'claude' or 'claude <prompt>'
4. Bridge reads ~/.shelly/harness/active-session.json
5. sessionId found → resumeSession(sessionId, prompt || "続きをお願いします")
6. Agent SDK restores full conversation context
7. User sees seamless continuation
```

## Auto-Recovery (Bridge Restart)

When Bridge restarts and `use-termux-bridge.ts` auto-recovery kicks in:
1. `tmux-manager.ts` checks `activeCli === 'claude'` for the tab
2. Instead of `claude --continue`, Bridge uses Agent SDK `resume`
3. The recovery is completely transparent

## Error Handling

- **Agent SDK not installed**: Fall back to `pty.spawn('claude', ...)` (current behavior)
- **Resume fails** (session expired/invalid): Clear `active-session.json`, start new session
- **Network error during stream**: Retry with resume using saved sessionId
- **Bridge crash during active session**: sessionId persisted to disk, resume on restart

## File Changes Summary

| File | Change |
|---|---|
| `~/shelly-bridge/claude-harness.mjs` | New — Agent SDK wrapper |
| `~/shelly-bridge/server.js` | Modified — route claude commands to harness |
| `~/shelly-bridge/package.json` | Add `@anthropic-ai/claude-agent-sdk` dependency |
| `~/.shelly/harness/active-session.json` | New — auto-created at runtime |

## Non-Changes

- `hooks/use-termux-bridge.ts` — WebSocket protocol unchanged
- `store/terminal-store.ts` — activeCli mechanism unchanged
- `lib/tmux-manager.ts` — still used for non-Claude CLIs
- `start-shelly.sh` — no changes needed
- App-side code — zero changes required

## Testing

1. Start Claude Code via Shelly terminal → verify session works
2. Kill Bridge process → restart → type `claude` → verify resume restores context
3. Split-view with another app → return → verify Claude Code session intact
4. New session after `/exit` → verify new sessionId created
5. Fallback: uninstall Agent SDK → verify pty.spawn still works
