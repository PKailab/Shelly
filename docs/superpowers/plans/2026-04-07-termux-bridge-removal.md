# Termux Bridge Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all Termux bridge code from Shelly, making native PTY (JNI forkpty + linker64) the sole execution engine.

**Architecture:** Add `execCommand()` to TerminalEmulatorModule (JNI fork+exec+pipe) as the native replacement for bridge's runCommand/runRawCommand. Create a thin `useNativeExec` hook as drop-in replacement. Then remove bridge code in dependency order: leaves first, roots last.

**Tech Stack:** Kotlin (Expo Module), C/JNI, TypeScript/React Native

**Key Decision:** Chat tab's `sendCommand` (visible terminal block) stays as-is — it already writes to the native PTY via `TerminalEmulator.writeToSession()`. Only the "invisible" programmatic execution (runCommand/runRawCommand) needs the new `execCommand` API.

---

## File Structure

### New files
| File | Responsibility |
|------|---------------|
| `modules/terminal-emulator/android/src/main/jni/shelly-exec.c` | JNI: fork+exec+pipe, capture stdout/stderr, return exit code |
| `hooks/use-native-exec.ts` | Drop-in replacement hook: `runCommand`, `runRawCommand`, `writeFile`, `readFile`, `listFiles`, `editFile` via native PTY |

### Files to delete (11 + 1 dir)
| File | Reason |
|------|--------|
| `hooks/use-termux-bridge.ts` | Replaced by `use-native-exec.ts` |
| `lib/bridge-bundle.ts` | Bridge server JS — no longer needed |
| `lib/termux-intent.ts` | Termux RunCommandService intents — no longer needed |
| `lib/tmux-manager.ts` | Tmux session management — no longer needed |
| `lib/auto-setup.ts` | Bridge setup automation — no longer needed |
| `components/SetupWizard.tsx` | Termux setup wizard UI — no longer needed |
| `components/BridgeRecoveryBanner.tsx` | Bridge recovery UI — no longer needed |
| `components/terminal/FullscreenTerminal.tsx` | Bridge-direct WebSocket terminal — no longer needed |
| `modules/termux-bridge/` (entire dir) | Kotlin native module for Termux intents — no longer needed |
| `plugins/with-termux-permission.js` | Termux permission config plugin — no longer needed |
| `scripts/sync-bridge-bundle.js` | Bridge bundle sync script — no longer needed |

### Files to modify (major changes)
| File | Change |
|------|--------|
| `modules/terminal-emulator/android/src/main/java/expo/modules/terminalemulator/TerminalEmulatorModule.kt` | Add `execCommand` async function |
| `modules/terminal-emulator/android/src/main/java/expo/modules/terminalemulator/ShellyJNI.kt` | Add `execSubprocess` JNI binding |
| `modules/terminal-emulator/android/src/main/jni/CMakeLists.txt` | Add `shelly-exec.c` |
| `modules/terminal-emulator/src/TerminalEmulatorModule.ts` | Add `execCommand` TypeScript binding |
| `store/terminal-store.ts` | Remove bridgeStatus, termuxSettings, connectionMode simplification |
| `store/types.ts` | Remove BridgeStatus, TermuxSettings, simplify ConnectionMode |
| `store/settings-store.ts` | Remove TermuxSettings |
| `app/(tabs)/_layout.tsx` | Remove SetupWizard, BridgeRecoveryBanner |
| `app/(tabs)/settings.tsx` | Remove bridge UI sections, SetupWizard |
| `app/(tabs)/index.tsx` | Replace useTermuxBridge with useNativeExec |
| `app/(tabs)/projects.tsx` | Replace useTermuxBridge with useNativeExec |
| `app/(tabs)/terminal.tsx` | Remove connectionMode from block metadata |
| `hooks/use-ai-dispatch.ts` | Replace useTermuxBridge with useNativeExec, remove termux branches |
| `hooks/use-tool-discovery.ts` | Replace useTermuxBridge with useNativeExec |
| `components/terminal/TerminalHeader.tsx` | Remove termux mode, BridgeDot, FullscreenTerminal |
| `app.config.ts` | Remove with-termux-permission plugin |

### Files to modify (minor — import/reference cleanup)
| File | Change |
|------|--------|
| `components/QuickTerminal.tsx` | Replace useTermuxBridge, remove termux mode check |
| `components/chat/ChatHeader.tsx` | Replace useTermuxBridge |
| `components/AuthWizard.tsx` | Replace useTermuxBridge with useNativeExec |
| `components/terminal/FirstMateOverlay.tsx` | Replace useTermuxBridge with useNativeExec |
| `components/preview/CodeTab.tsx` | Replace useTermuxBridge with useNativeExec |
| `components/preview/FilesTab.tsx` | Replace useTermuxBridge with useNativeExec |
| `components/StatusIndicator.tsx` | Replace bridge status with native session status |
| `components/input/ShortcutBar.tsx` | Remove connectionMode check |
| `components/terminal/TerminalBlock.tsx` | Remove termux badge |
| `components/creator/ToolsLane.tsx` | Remove termuxConnected, update text |
| `components/settings/LlamaCppSection.tsx` | Update alert text |
| `lib/llm-interpreter.ts` | Update "Termux" references in prompts |
| `lib/shelly-system-prompt.ts` | Update "powered by Termux" text |
| `lib/intent-router.ts` | Remove 'termux' routing tool |
| `lib/llamacpp-setup.ts` | Remove shelly-bridge references |
| `lib/auto-savepoint.ts` | Replace runCommand with native exec |
| `lib/cli-auth.ts` | Replace runCommand with native exec |
| `lib/env-manager.ts` | Replace runCommand with native exec |
| `lib/git-advisor.ts` | Replace runCommand with native exec |
| `lib/tool-orchestrator.ts` | Replace runCommand with native exec |
| `lib/ai-tool-agent.ts` | Replace runCommand/writeFile with native exec |
| `lib/team-roundtable.ts` | Replace runCommand with native exec |
| `lib/session-persistence.ts` | Remove tmux operations |
| `lib/smart-wakelock.ts` | Remove termux-wake-lock (not available in native) |
| `lib/i18n/locales/en.ts` | Remove bridge.* keys |
| `lib/i18n/locales/ja.ts` | Remove bridge.* keys |

---

## Task 1: Add `execCommand` to TerminalEmulatorModule (JNI)

The critical prerequisite. Without this, nothing else works.

**Files:**
- Create: `modules/terminal-emulator/android/src/main/jni/shelly-exec.c`
- Modify: `modules/terminal-emulator/android/src/main/jni/CMakeLists.txt`
- Modify: `modules/terminal-emulator/android/src/main/java/expo/modules/terminalemulator/ShellyJNI.kt`
- Modify: `modules/terminal-emulator/android/src/main/java/expo/modules/terminalemulator/TerminalEmulatorModule.kt`
- Modify: `modules/terminal-emulator/src/TerminalEmulatorModule.ts`

### Design

`execCommand(command, options?)` does:
1. Fork a child process
2. Execute via linker64 → bash -c "command"
3. Pipe stdout/stderr back to parent
4. Return `{ stdout, stderr, exitCode }` as a Promise

This is NOT a PTY — it's a plain fork+exec+pipe (like Node's `child_process.exec`). No terminal emulation, no interactive I/O. Just run a command, get the output.

- [ ] **Step 1: Write `shelly-exec.c`**

```c
// JNI function: execSubprocess(linkerPath, bashPath, ldLibPath, homePath, command, timeoutMs)
// Returns: int[3] = {exitCode, stdoutFd, stderrFd} via pipe
// Parent reads pipes, child execve's via linker64 → bash -c "command"
```

Key differences from shelly-pty.c:
- No PTY (no /dev/ptmx) — uses pipe() for stdout/stderr
- No setsid/controlling terminal
- Timeout via alarm() in parent
- Reads all output into buffer, returns via JNI string

- [ ] **Step 2: Add to CMakeLists.txt**

Add `shelly-exec.c` to the existing native library target.

- [ ] **Step 3: Add JNI binding in ShellyJNI.kt**

```kotlin
@JvmStatic external fun execSubprocess(
    linkerPath: String, bashPath: String, ldLibPath: String,
    homePath: String, command: String, timeoutMs: Int
): Array<String> // [exitCode, stdout, stderr]
```

- [ ] **Step 4: Add `execCommand` in TerminalEmulatorModule.kt**

```kotlin
AsyncFunction("execCommand") { command: String, timeoutMs: Int? ->
    val timeout = timeoutMs ?: 120_000
    val result = ShellyJNI.execSubprocess(
        linkerPath, bashPath, ldLibPath, homePath, command, timeout
    )
    mapOf("exitCode" to result[0].toInt(), "stdout" to result[1], "stderr" to result[2])
}
```

- [ ] **Step 5: Add TypeScript binding**

```typescript
// In TerminalEmulatorModule.ts
export async function execCommand(
  command: string,
  timeoutMs?: number
): Promise<{ exitCode: number; stdout: string; stderr: string }>
```

- [ ] **Step 6: Commit**

```
feat: add execCommand to TerminalEmulatorModule — native command execution
```

---

## Task 2: Create `useNativeExec` hook

Drop-in replacement for `useTermuxBridge()`. Same function signatures, but executes via `TerminalEmulator.execCommand()` instead of WebSocket.

**Files:**
- Create: `hooks/use-native-exec.ts`

- [ ] **Step 1: Create the hook**

Must export the same interface that callers expect:
```typescript
export function useNativeExec() {
  return {
    // Command execution
    runCommand: (cmd, opts?) => execCommand(cmd, opts?.timeoutMs),
    runRawCommand: (cmd, opts?) => execCommand(cmd, opts?.timeoutMs ?? 1200000),

    // File operations (implemented via execCommand + cat/tee)
    writeFile: (path, content) => execCommand(`cat > '${path}' << 'SHELLY_EOF'\n${content}\nSHELLY_EOF`),
    readFile: (path) => execCommand(`cat '${path}'`),
    listFiles: (dir, opts?) => execCommand(`ls -la '${dir || "."}'`),
    editFile: (path, edits) => { /* sed-based or custom */ },

    // Status (always "connected" in native mode)
    isConnected: true,
    testConnection: async () => true,

    // These are no-ops in native mode (sendCommand goes through PTY)
    sendCommand: null,  // callers use TerminalEmulator.writeToSession directly
    sendStdin: null,
    cancelCurrent: null,
    hasActiveCommand: false,
  };
}
```

- [ ] **Step 2: Commit**

```
feat: add useNativeExec hook — native replacement for useTermuxBridge
```

---

## Task 3: Store cleanup — remove bridge state

**Files:**
- Modify: `store/types.ts`
- Modify: `store/terminal-store.ts`
- Modify: `store/settings-store.ts`

- [ ] **Step 1: Simplify types.ts**

- Remove `BridgeStatus` type
- Remove `TermuxSettings` type
- Remove `'termux'` from `ConnectionMode` (keep `'native' | 'disconnected'` for future extensibility)
- Remove `connectionMode` from `CommandBlock` type (or make it always 'native')

- [ ] **Step 2: Clean terminal-store.ts**

- Remove `bridgeStatus`, `termuxSettings` from state
- Remove `setBridgeStatus`, `updateTermuxSettings` actions
- Remove `connectionMode` (hardcode to 'native') or keep as simple state
- Remove tmux-related fields from session creation/persistence
- Remove `startTermuxBlock` (blocks are now always native)

- [ ] **Step 3: Clean settings-store.ts**

- Remove `TermuxSettings` import, `DEFAULT_TERMUX_SETTINGS`
- Remove `termuxSettings` from state and `updateTermuxSettings`
- Remove AsyncStorage persistence for `shelly_termux_settings`

- [ ] **Step 4: Commit**

```
refactor: remove bridge/termux state from stores
```

---

## Task 4: Switch all `useTermuxBridge` consumers to `useNativeExec`

This is the bulk of the work — 14 direct consumers + lib utilities. Mechanical replacement.

**Files:** All 14 components + 8 lib files listed in "Files to modify (minor)" above.

- [ ] **Step 1: Replace in hooks**

- `hooks/use-ai-dispatch.ts` — replace `useTermuxBridge()` with `useNativeExec()`, remove all `connectionMode === 'termux'` branches
- `hooks/use-tool-discovery.ts` — replace, remove bridgeStatus check (native is always "connected")

- [ ] **Step 2: Replace in app tabs**

- `app/(tabs)/index.tsx` — replace `useTermuxBridge()` with `useNativeExec()`, remove termux mode branches. For `sendCommand` (visible execution): use `TerminalEmulator.writeToSession()` directly
- `app/(tabs)/projects.tsx` — replace, simplify
- `app/(tabs)/settings.tsx` — replace, remove bridge diagnostics/UI sections entirely

- [ ] **Step 3: Replace in components**

- `components/QuickTerminal.tsx` — remove `connectionMode === 'termux'` check, simplify
- `components/chat/ChatHeader.tsx` — replace
- `components/AuthWizard.tsx` — replace with useNativeExec
- `components/terminal/FirstMateOverlay.tsx` — replace (pkg install commands → native exec)
- `components/preview/CodeTab.tsx` — replace
- `components/preview/FilesTab.tsx` — replace
- `components/StatusIndicator.tsx` — replace bridge status with native session status
- `components/input/ShortcutBar.tsx` — remove connectionMode check
- `components/terminal/TerminalBlock.tsx` — remove termux badge
- `components/creator/ToolsLane.tsx` — remove termuxConnected, update strings

- [ ] **Step 4: Replace in lib utilities**

- `lib/auto-savepoint.ts` — replace runCommand calls
- `lib/cli-auth.ts` — replace
- `lib/env-manager.ts` — replace
- `lib/git-advisor.ts` — replace
- `lib/tool-orchestrator.ts` — replace
- `lib/ai-tool-agent.ts` — replace runCommand + writeFile
- `lib/team-roundtable.ts` — replace

- [ ] **Step 5: Commit**

```
refactor: switch all consumers from useTermuxBridge to useNativeExec
```

---

## Task 5: Remove bridge UI components and references

**Files:**
- Modify: `app/(tabs)/_layout.tsx` — remove SetupWizard, BridgeRecoveryBanner, AsyncStorage import
- Modify: `app/(tabs)/settings.tsx` — remove bridge sections (wsUrl, autoReconnect, timeout, diagnostics bridge test, script buttons, SetupWizard)
- Modify: `components/terminal/TerminalHeader.tsx` — remove 'termux' from MODE_CONFIG/MODE_CYCLE, remove BridgeDot, remove FullscreenTerminal
- Modify: `app.config.ts` — remove `./plugins/with-termux-permission`

- [ ] **Step 1: Clean _layout.tsx**

Remove: SetupWizard import, BridgeRecoveryBanner import, showSetupWizard state, wizard completion check, `<BridgeRecoveryBanner />`, `<SetupWizard />`.

- [ ] **Step 2: Clean settings.tsx**

Remove: All bridge-related imports (useTermuxBridge, BRIDGE_SERVER_JS, SetupWizard). Remove bridge connection UI section (wsUrl input, autoReconnect toggle, timeout, test connection button, update script button). Remove SetupWizard at bottom. Keep diagnostics but remove bridge test.

- [ ] **Step 3: Clean TerminalHeader.tsx**

Remove: 'termux' from MODE_CONFIG, MODE_CYCLE. Remove FullscreenTerminal import and render. Simplify to just 'native' and 'disconnected'.

- [ ] **Step 4: Clean app.config.ts**

Remove: `"./plugins/with-termux-permission"` from plugins array.

- [ ] **Step 5: Update i18n**

Remove all `bridge.*` keys from `lib/i18n/locales/en.ts` and `lib/i18n/locales/ja.ts`. Remove `setup2.*` keys. Update settings-related strings.

- [ ] **Step 6: Update text references**

- `lib/shelly-system-prompt.ts` — remove "(powered by Termux)" / "(バックエンドはTermux)"
- `lib/llm-interpreter.ts` — change "Termux" to "terminal" in prompts
- `lib/intent-router.ts` — remove 'termux' routing tool
- `components/settings/LlamaCppSection.tsx` — update alert text

- [ ] **Step 7: Commit**

```
refactor: remove bridge UI components and Termux references
```

---

## Task 6: Delete bridge files

Now that nothing imports them, safe to delete.

**Files to delete:**
- `hooks/use-termux-bridge.ts`
- `lib/bridge-bundle.ts`
- `lib/termux-intent.ts`
- `lib/tmux-manager.ts`
- `lib/auto-setup.ts`
- `lib/smart-wakelock.ts` (termux-wake-lock not available natively)
- `lib/session-persistence.ts` (tmux-based, no longer needed)
- `components/SetupWizard.tsx`
- `components/BridgeRecoveryBanner.tsx`
- `components/terminal/FullscreenTerminal.tsx`
- `modules/termux-bridge/` (entire directory)
- `plugins/with-termux-permission.js`
- `scripts/sync-bridge-bundle.js`

- [ ] **Step 1: Delete all files**

```bash
rm hooks/use-termux-bridge.ts
rm lib/bridge-bundle.ts lib/termux-intent.ts lib/tmux-manager.ts lib/auto-setup.ts
rm lib/smart-wakelock.ts lib/session-persistence.ts
rm components/SetupWizard.tsx components/BridgeRecoveryBanner.tsx
rm components/terminal/FullscreenTerminal.tsx
rm -rf modules/termux-bridge/
rm plugins/with-termux-permission.js scripts/sync-bridge-bundle.js
```

- [ ] **Step 2: Verify no dangling imports**

```bash
grep -rn "use-termux-bridge\|bridge-bundle\|termux-intent\|tmux-manager\|auto-setup\|SetupWizard\|BridgeRecoveryBanner\|FullscreenTerminal\|termux-bridge\|with-termux-permission\|smart-wakelock\|session-persistence" --include="*.ts" --include="*.tsx" --include="*.js" | grep -v node_modules | grep -v ".md"
```

Expected: zero results (or only comments/docs).

- [ ] **Step 3: Commit**

```
chore: delete all Termux bridge files — 13 files, 1 module removed
```

---

## Task 7: Build verification and push

- [ ] **Step 1: Type check**

```bash
npx tsc --noEmit 2>&1 | head -50
```

Fix any TypeScript errors.

- [ ] **Step 2: Push and build**

```bash
git push
```

Wait for CI build.

- [ ] **Step 3: Install and test**

Download APK, `adb install`, `pm clear`, test:
1. Terminal tab shows prompt (no blank screen)
2. Settings tab does NOT open Termux
3. Chat tab can execute commands via AI dispatch
4. PS1 shows `shelly:~$`

- [ ] **Step 4: Final commit if fixes needed**

```
fix: post-bridge-removal cleanup
```

---

## Execution Notes

- **Task 1 is the critical path** — everything depends on `execCommand`. If this fails (JNI issues), the whole plan is blocked.
- **Task 4 is the largest** — mechanical but tedious. Good candidate for parallel subagents per file group.
- **Task 6 must be last** — only delete after all consumers are switched.
- **AgentAlarmReceiver.kt** still uses `com.termux.RUN_COMMAND` for background agents. This is a separate concern (Plan B Phase 3) and should NOT be removed in this PR. Leave it as-is with a TODO comment.
