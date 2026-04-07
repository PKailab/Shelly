# Terminal Session Persistence — Termux-Grade Experience

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Shelly's terminal sessions survive app backgrounding with zero visual disruption — identical to Termux's native behavior.

**Architecture:** A new `replaceStreams()` method in TerminalSession.java allows reconnecting TCP streams without destroying the TerminalEmulator buffer. ShellyTerminalSession.kt gains an auto-reconnect loop. TypeScript side stops destroying live sessions on foreground resume. Session reset/new-tab creates fresh pty-helper connections for clean shell starts.

**Tech Stack:** Kotlin (Expo Native Module), Java (vendored Termux TerminalSession), TypeScript (React Native / Zustand), C (pty-helper — read-only reference)

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| **Modify** | `modules/terminal-emulator/android/src/main/java/com/termux/terminal/ByteQueue.java` | Add `reopen()` method to reset closed queue |
| **Modify** | `modules/terminal-emulator/android/src/main/java/com/termux/terminal/TerminalSession.java` | Add `replaceStreams()` — swap I/O without touching emulator |
| **Modify** | `modules/terminal-emulator/android/src/main/java/expo/modules/terminalemulator/ShellyTerminalSession.kt` | TCP reconnect loop, buffer preservation, keepAlive, `hasEmulator()` |
| **Modify** | `modules/terminal-emulator/android/src/main/java/expo/modules/terminalemulator/TerminalEmulatorModule.kt` | Expose `hasEmulator()` to JS |
| **Modify** | `modules/terminal-emulator/src/TerminalEmulatorModule.ts` | Add TS type declarations for `hasEmulator` |
| **Modify** | `app/(tabs)/terminal.tsx` | Fix `ensureNativeSessions()`, add `resetSession`, handle pending reset |
| **Modify** | `store/terminal-store.ts` | `clearSession()` clears `commandHistory`, add `requestResetSession` |
| **Modify** | `lib/terminal-session-monitor.ts` | Switch from `tmux has-session` to TCP port check |
| **Modify** | `components/terminal/TerminalHeader.tsx` | Reset action uses `requestResetSession` |
| Read-only | `~/shelly-bridge/pty-helper.c` | Reference — already supports client reconnection |

---

## Task 1: Java — Add `replaceStreams()` to TerminalSession and `reopen()` to ByteQueue

**Files:**
- Modify: `modules/terminal-emulator/android/src/main/java/com/termux/terminal/ByteQueue.java`
- Modify: `modules/terminal-emulator/android/src/main/java/com/termux/terminal/TerminalSession.java`

**Why this is needed:** `initializeWithStreams()` creates a new `TerminalEmulator` (destroying the scroll buffer) and doesn't stop old reader/writer threads. We need a method that swaps only the I/O streams while keeping the emulator intact.

### ByteQueue changes

- [ ] **Step 1: Add `reopen()` to ByteQueue.java**

After the `close()` method (line 32), add:

```java
/** Reopen a closed queue, resetting it to empty state. */
public synchronized void reopen() {
    mOpen = true;
    mHead = 0;
    mStoredBytes = 0;
    notify();
}
```

### TerminalSession changes

- [ ] **Step 2: Add `replaceStreams()` to TerminalSession.java**

Add after `initializeWithStreams()` (after line 246):

```java
/**
 * Replace the I/O streams for a reconnection scenario.
 * Stops old reader/writer threads by closing the queues, then reopens them
 * and starts new threads. The TerminalEmulator is NOT recreated — the
 * existing scroll buffer is preserved.
 *
 * @throws IllegalStateException if no emulator exists (must call initializeWithStreams first)
 */
public void replaceStreams(InputStream inputStream, OutputStream outputStream) {
    if (mEmulator == null) {
        throw new IllegalStateException("Cannot replace streams before emulator is initialized");
    }

    // 1. Close queues to stop old reader/writer threads
    mTerminalToProcessIOQueue.close();
    mProcessToTerminalIOQueue.close();

    // Give old threads a moment to exit (they check mOpen in their loops)
    try { Thread.sleep(50); } catch (InterruptedException ignored) {}

    // 2. Reopen queues for new threads
    mProcessToTerminalIOQueue.reopen();
    mTerminalToProcessIOQueue.reopen();

    // 3. Re-mark as stream-based and running
    mStreamBased = true;
    mShellPid = 0;

    // 4. Start new reader thread
    new Thread("TermSessionInputReader[reconnect]") {
        @Override
        public void run() {
            try {
                final byte[] buffer = new byte[4096];
                while (true) {
                    int read = inputStream.read(buffer);
                    if (read == -1) return;
                    if (!mProcessToTerminalIOQueue.write(buffer, 0, read)) return;
                    mMainThreadHandler.sendEmptyMessage(MSG_NEW_INPUT);
                }
            } catch (Exception e) {
                // Connection closed — signal session exit
                mMainThreadHandler.sendMessage(
                    mMainThreadHandler.obtainMessage(MSG_PROCESS_EXITED, 0)
                );
            }
        }
    }.start();

    // 5. Start new writer thread
    new Thread("TermSessionOutputWriter[reconnect]") {
        @Override
        public void run() {
            final byte[] buffer = new byte[4096];
            try {
                while (true) {
                    int bytesToWrite = mTerminalToProcessIOQueue.read(buffer, true);
                    if (bytesToWrite == -1) return;
                    outputStream.write(buffer, 0, bytesToWrite);
                    outputStream.flush();
                }
            } catch (IOException e) {
                // Ignore — connection closed
            }
        }
    }.start();
}
```

- [ ] **Step 3: Commit**

```bash
cd ~/Shelly
git add modules/terminal-emulator/android/src/main/java/com/termux/terminal/ByteQueue.java
git add modules/terminal-emulator/android/src/main/java/com/termux/terminal/TerminalSession.java
git commit -m "feat(terminal): add replaceStreams() for TCP reconnection without buffer loss

ByteQueue gains reopen() to reset a closed queue. TerminalSession gains
replaceStreams() which stops old I/O threads, reopens queues, and starts
new threads — all without touching the TerminalEmulator. This preserves
the scroll buffer across TCP reconnections."
```

---

## Task 2: Kotlin — TCP Auto-Reconnect with Buffer Preservation

**Files:**
- Modify: `modules/terminal-emulator/android/src/main/java/expo/modules/terminalemulator/ShellyTerminalSession.kt`

This is the core change. When the TCP socket drops (Android Doze/background), the TerminalEmulator instance survives. A background thread attempts reconnection to the same pty-helper port.

- [ ] **Step 1: Add reconnection state fields**

Add these fields after `private var lastTranscriptLength = 0` (line 29):

```kotlin
@Volatile private var isReconnecting = false
@Volatile private var shouldReconnect = true
private var reconnectThread: Thread? = null
private val socketLock = Any()
private var initialRows: Int = 24
private var initialCols: Int = 80
```

- [ ] **Step 2: Store initial dimensions and add keepAlive in init**

Replace the entire `init` block with:

```kotlin
init {
    initialRows = rows
    initialCols = cols

    terminalSession = TerminalSession(
        "/bin/true", "/", arrayOf(), arrayOf(), null, this
    )

    val sock = Socket("127.0.0.1", port)
    sock.tcpNoDelay = true
    sock.keepAlive = true
    socket = sock

    val inputStream = sock.getInputStream()
    val outputStream = sock.getOutputStream()
    terminalSession.initializeWithStreams(inputStream, outputStream, cols, rows, 1, 1)

    Log.i(TAG, "Session $sessionId connected to pty-helper on port $port")
}
```

- [ ] **Step 3: Add `reconnectSocket()` method**

This method creates a new socket and uses `replaceStreams()` to swap I/O without touching the emulator:

```kotlin
/**
 * Reconnect to pty-helper — replaces only the TCP socket and I/O threads.
 * The TerminalEmulator (scroll buffer) is preserved.
 */
private fun reconnectSocket(): Boolean {
    synchronized(socketLock) {
        try {
            // Close old socket
            try { socket?.close() } catch (_: Exception) {}
            socket = null

            val sock = Socket("127.0.0.1", port)
            sock.tcpNoDelay = true
            sock.keepAlive = true
            socket = sock

            val inputStream = sock.getInputStream()
            val outputStream = sock.getOutputStream()

            // Use replaceStreams — preserves TerminalEmulator buffer
            terminalSession.replaceStreams(inputStream, outputStream)

            Log.i(TAG, "Session $sessionId reconnected to pty-helper on port $port")
            return true
        } catch (e: Exception) {
            Log.w(TAG, "Session $sessionId reconnect failed: ${e.message}")
            try { socket?.close() } catch (_: Exception) {}
            socket = null
            return false
        }
    }
}
```

- [ ] **Step 4: Modify `onSessionFinished` to trigger reconnect instead of exit**

Replace the current implementation:

```kotlin
override fun onSessionFinished(finishedSession: TerminalSession) {
    if (shouldReconnect && !isReconnecting) {
        Log.i(TAG, "Session $sessionId: socket lost, starting reconnect loop")
        startReconnectLoop()
        return
    }
    // Only emit exit event if we're not trying to reconnect
    batchHandler.removeCallbacks(flushRunnable)
    flushOutputBuffer()
    emitEvent("onSessionExit", mapOf("sessionId" to sessionId, "exitCode" to finishedSession.exitStatus))
}
```

- [ ] **Step 5: Implement the reconnect loop**

```kotlin
private fun startReconnectLoop() {
    if (isReconnecting) return
    isReconnecting = true

    reconnectThread = Thread("ReconnectLoop[$sessionId]") {
        var attempts = 0
        val maxAttempts = 30
        val intervalMs = 1000L

        while (shouldReconnect && attempts < maxAttempts && isReconnecting) {
            attempts++
            try {
                Thread.sleep(intervalMs)
            } catch (_: InterruptedException) {
                break
            }

            Log.d(TAG, "Session $sessionId: reconnect attempt $attempts/$maxAttempts")

            if (reconnectSocket()) {
                isReconnecting = false

                // Send Ctrl+L to refresh shell prompt on the main thread
                batchHandler.post {
                    try {
                        write("\u000c") // Ctrl+L
                    } catch (_: Exception) {}
                    onScreenUpdateCallback?.invoke()
                }
                return
            }
        }

        // All attempts exhausted — emit exit
        isReconnecting = false
        Log.w(TAG, "Session $sessionId: reconnect failed after $maxAttempts attempts")
        batchHandler.post {
            emitEvent("onSessionExit", mapOf("sessionId" to sessionId, "exitCode" to -1))
        }
    }.also { it.isDaemon = true; it.start() }
}
```

- [ ] **Step 6: Update `isAlive()` to account for reconnecting state**

Replace the current `isAlive()`:

```kotlin
fun isAlive(): Boolean {
    // If reconnecting with a preserved emulator, report alive
    if (isReconnecting && hasEmulator()) return true

    val sock = synchronized(socketLock) { socket } ?: return false
    if (sock.isClosed) return false
    return try {
        sock.sendUrgentData(0xFF)
        true
    } catch (e: Exception) {
        false
    }
}
```

- [ ] **Step 7: Add `hasEmulator()` method**

```kotlin
/** Check if the TerminalEmulator instance exists (buffer is preserved in memory). */
fun hasEmulator(): Boolean {
    return terminalSession.emulator != null
}
```

- [ ] **Step 8: Update `sendResizeCommand()` to use socketLock**

Replace the try block in `sendResizeCommand()`:

```kotlin
fun sendResizeCommand(cols: Int, rows: Int) {
    try {
        val cmd = "${RESIZE_PREFIX}${cols};${rows}\n"
        synchronized(socketLock) {
            socket?.getOutputStream()?.write(cmd.toByteArray(Charsets.UTF_8))
            socket?.getOutputStream()?.flush()
        }
        Log.i(TAG, "sendResizeCommand: ${cols}x${rows}")
    } catch (e: Exception) {
        Log.w(TAG, "sendResizeCommand failed: ${e.message}")
    }
}
```

- [ ] **Step 9: Update `destroy()` to stop reconnection**

Replace the current `destroy()`:

```kotlin
fun destroy() {
    shouldReconnect = false
    isReconnecting = false
    reconnectThread?.interrupt()
    reconnectThread = null
    batchHandler.removeCallbacks(flushRunnable)
    flushOutputBuffer()
    terminalSession.finishIfRunning()
    synchronized(socketLock) {
        try { socket?.close() } catch (_: Exception) {}
        socket = null
    }
}
```

- [ ] **Step 10: Commit**

```bash
cd ~/Shelly
git add modules/terminal-emulator/android/src/main/java/expo/modules/terminalemulator/ShellyTerminalSession.kt
git commit -m "feat(terminal): TCP auto-reconnect with TerminalEmulator buffer preservation

When Android backgrounds Shelly, TCP sockets may drop. Previously this
destroyed the entire session including scroll buffer. Now:
- replaceStreams() swaps I/O without touching the emulator
- Background reconnect loop tries 30x at 1s intervals
- socketLock prevents races between reconnect and write/resize
- Ctrl+L refreshes the shell prompt on successful reconnect"
```

---

## Task 3: Kotlin + TypeScript — Expose `hasEmulator()` to JS

**Files:**
- Modify: `modules/terminal-emulator/android/src/main/java/expo/modules/terminalemulator/TerminalEmulatorModule.kt`
- Modify: `modules/terminal-emulator/src/TerminalEmulatorModule.ts`

- [ ] **Step 1: Add `hasEmulator` AsyncFunction in Kotlin**

In `TerminalEmulatorModule.kt`, after the `isSessionAlive` function definition (line ~85), add:

```kotlin
AsyncFunction("hasEmulator") { sessionId: String ->
    val session = sessions[sessionId] ?: return@AsyncFunction false
    session.hasEmulator()
}
```

- [ ] **Step 2: Add TS type declaration**

In `modules/terminal-emulator/src/TerminalEmulatorModule.ts`, add after `isSessionAlive` (line 16):

```typescript
hasEmulator(sessionId: string): Promise<boolean>;
```

- [ ] **Step 3: Commit**

```bash
cd ~/Shelly
git add modules/terminal-emulator/android/src/main/java/expo/modules/terminalemulator/TerminalEmulatorModule.kt
git add modules/terminal-emulator/src/TerminalEmulatorModule.ts
git commit -m "feat(terminal): expose hasEmulator() to JS bridge

Allows TypeScript to check if a session's TerminalEmulator buffer is
preserved in memory, even when the TCP socket is disconnected."
```

---

## Task 4: TypeScript — Fix `ensureNativeSessions()` to Preserve Live Sessions

**Files:**
- Modify: `app/(tabs)/terminal.tsx`

This is the critical change that prevents the "Connecting to terminal..." flash.

- [ ] **Step 1: Update `ensureNativeSessions` to skip live sessions**

Replace the `ensureNativeSessions` callback (lines ~307-349) with:

```typescript
const ensureNativeSessions = useCallback(async () => {
    if (bridgeStatus !== 'connected') return;
    if (isHiddenBehindMultiPane) return;

    for (const session of sessions) {
      if (session.sessionStatus === 'starting' || session.sessionStatus === 'alive') {
        if (isRenderedInMultiPane) {
          try {
            const alive = await TerminalEmulator.isSessionAlive(session.nativeSessionId);
            if (alive) {
              useTerminalStore.setState((state) => ({
                sessions: state.sessions.map((s) =>
                  s.id === session.id ? { ...s, sessionStatus: 'alive' as const, isAlive: true } : s
                ),
              }));
              continue;
            }
          } catch {}
          continue;
        }

        try {
          const alive = await TerminalEmulator.isSessionAlive(session.nativeSessionId);
          if (alive) {
            // Session is alive (socket OK or reconnecting with preserved buffer) — do nothing
            useTerminalStore.setState((state) => ({
              sessions: state.sessions.map((s) =>
                s.id === session.id ? { ...s, sessionStatus: 'alive' as const, isAlive: true } : s
              ),
            }));
            continue;
          }
        } catch {}

        // Session not in Kotlin registry at all — need full re-creation
        console.log('[Terminal] ensureNativeSessions: session not alive, re-creating:', session.nativeSessionId);
        await createNativeSession(session);
      } else if (session.sessionStatus === 'exited') {
        if (isRenderedInMultiPane) continue;
        console.log('[Terminal] ensureNativeSessions: session exited, recovering:', session.nativeSessionId);
        recoverSession(session);
      }
    }
  }, [bridgeStatus, sessions, createNativeSession, recoverSession, isHiddenBehindMultiPane, isRenderedInMultiPane]);
```

- [ ] **Step 2: Guard `destroySession()` in `createNativeSession()` with `hasEmulator` check**

Replace line ~157 (`try { await TerminalEmulator.destroySession(...) }`) with:

```typescript
// 0. Only destroy if session exists but has no emulator buffer
try {
    const hasEmu = await TerminalEmulator.hasEmulator(session.nativeSessionId);
    if (!hasEmu) {
        await TerminalEmulator.destroySession(session.nativeSessionId);
    }
} catch {
    // Session doesn't exist in Kotlin registry — safe to proceed
}
```

- [ ] **Step 3: Only send Ctrl+L on reconnect, not fresh start**

Replace lines ~259-262 with:

```typescript
// 3. Send Ctrl+L only if reconnecting to existing pty-helper (not fresh start)
if (ptyAlive) {
    try {
        await TerminalEmulator.writeToSession(session.nativeSessionId, '\x0c');
    } catch {}
}
```

- [ ] **Step 4: Commit**

```bash
cd ~/Shelly
git add app/\(tabs\)/terminal.tsx
git commit -m "fix(terminal): stop destroying live sessions on foreground resume

ensureNativeSessions checks isSessionAlive (which includes emulator
buffer check) before taking action. Sessions with preserved buffers
are marked alive immediately — no destroy/recreate, no 'Connecting'
spinner. Ctrl+L only sent on reconnection to existing pty-helper."
```

---

## Task 5: TypeScript — Session Reset and New Tab Behavior

**Files:**
- Modify: `app/(tabs)/terminal.tsx` (add `resetSession`)
- Modify: `store/terminal-store.ts` (add `requestResetSession`, update `clearSession`)
- Modify: `components/terminal/TerminalHeader.tsx` (Reset action)

Goal: Reset = kill pty-helper + destroy Kotlin session + recreate. New tab = new pty-helper + new Kotlin session. Both show empty screen with prompt only.

- [ ] **Step 1: Add `requestResetSession` to terminal-store.ts**

Add to the `TerminalState` type (after `clearPendingCommand`):

```typescript
/** Session ID pending reset (consumed by terminal.tsx) */
pendingResetSessionId: string | null;
requestResetSession: (sessionId: string) => void;
clearPendingReset: () => void;
```

Add to store implementation (after `clearPendingCommand`):

```typescript
pendingResetSessionId: null,
requestResetSession: (sessionId) => set({ pendingResetSessionId: sessionId }),
clearPendingReset: () => set({ pendingResetSessionId: null }),
```

- [ ] **Step 2: Update `clearSession` to also clear `commandHistory`**

In `clearSession` (line ~217), add `commandHistory: []` to the mapped object:

Change:
```typescript
? { ...s, blocks: [], entries: [], currentDir: '/data/data/com.termux/files/home' }
```
To:
```typescript
? { ...s, blocks: [], entries: [], commandHistory: [], currentDir: '/data/data/com.termux/files/home' }
```

- [ ] **Step 3: Add `resetSession` function to terminal.tsx**

Add after `recoverSession` (after line ~302):

```typescript
// Reset a session: kill pty-helper, destroy Kotlin session, start fresh
const resetSession = useCallback(async (session: TabSession) => {
    const port = getPtyPort(session.tmuxSession);

    // 1. Destroy Kotlin session (clears TerminalEmulator buffer)
    try { await TerminalEmulator.destroySession(session.nativeSessionId); } catch {}

    // 2. Kill pty-helper process on this port
    await runRawCommand(
        `pkill -f "pty-helper.*${port}" 2>/dev/null; true`,
        { timeoutMs: 3000, reason: 'pty-reset-kill' }
    ).catch(() => {});

    // 3. Clear store state
    useTerminalStore.getState().clearSession(session.id);

    // 4. Small delay to ensure port is released
    await new Promise(resolve => setTimeout(resolve, 300));

    // 5. Create fresh session (new pty-helper + new Kotlin session + new shell)
    await createNativeSession(session);
}, [createNativeSession, runRawCommand]);
```

- [ ] **Step 4: Handle pendingResetSessionId in terminal.tsx**

Add a `useEffect` (after the ProcessGuard effect):

```typescript
// Handle reset requests from TerminalHeader
const pendingResetId = useTerminalStore((s) => s.pendingResetSessionId);
useEffect(() => {
    if (!pendingResetId) return;
    const session = sessions.find((s) => s.id === pendingResetId);
    if (session) {
        useTerminalStore.getState().clearPendingReset();
        resetSession(session);
    }
}, [pendingResetId, sessions, resetSession]);
```

- [ ] **Step 5: Update TerminalHeader.tsx Reset action**

In `TerminalHeader.tsx`, replace the Reset `onPress` (lines ~222-231):

```typescript
{
    text: 'Reset',
    onPress: () => {
        useTerminalStore.getState().requestResetSession(session.id);
    },
},
```

- [ ] **Step 6: Commit**

```bash
cd ~/Shelly
git add app/\(tabs\)/terminal.tsx store/terminal-store.ts components/terminal/TerminalHeader.tsx
git commit -m "feat(terminal): Termux-style session reset and new tab behavior

Reset kills pty-helper + destroys Kotlin session + creates fresh shell.
New tab creates new pty-helper connection. Both result in empty screen
with prompt only, matching Termux behavior. No cd ~ command artifacts."
```

---

## Task 6: Update Session Monitor — TCP Port Check Instead of tmux

**Files:**
- Modify: `lib/terminal-session-monitor.ts`

- [ ] **Step 1: Replace `checkTmuxSession` with TCP port check**

Replace the `checkTmuxSession` function (lines ~15-28) with:

```typescript
async function checkSessionAlive(name: string, runCmd: RunCommand): Promise<boolean> {
    try {
        const port = 18200 + ['shelly-1', 'shelly-2', 'shelly-3', 'shelly-4'].indexOf(name);
        if (port < 18200) return true; // Unknown session name — assume alive
        const result = await runCmd(
            `(echo >/dev/tcp/127.0.0.1/${port}) 2>/dev/null && echo ALIVE || echo DEAD`,
            { timeoutMs: 3000, reason: 'pty-health-check' }
        );
        const output = typeof result === 'string' ? result : result?.stdout || result?.output || '';
        return output.includes('ALIVE');
    } catch {
        return true; // On error, assume alive to avoid false recovery
    }
}
```

- [ ] **Step 2: Update `startSessionMonitor` to use the new function**

In the `setInterval` callback (line ~41), replace `checkTmuxSession` with `checkSessionAlive`:

```typescript
const alive = await checkSessionAlive(name, runCmd);
```

- [ ] **Step 3: Commit**

```bash
cd ~/Shelly
git add lib/terminal-session-monitor.ts
git commit -m "refactor(terminal): session monitor uses TCP port check instead of tmux

Checks pty-helper TCP port directly instead of tmux has-session.
More accurate and removes tmux dependency from health monitoring."
```

---

## Task 7: Integration Build & Verification

**Files:** None (testing only)

- [ ] **Step 1: Run TypeScript type check**

```bash
cd ~/Shelly
npx tsc --noEmit 2>&1 | tail -20
```

Fix any type errors before proceeding.

- [ ] **Step 2: Build APK**

```bash
cd ~/Shelly
npx expo prebuild --platform android --clean 2>&1 | tail -5
cd android && ./gradlew assembleDebug 2>&1 | tail -20
```

If Kotlin compilation fails, fix errors. Common issues:
- `replaceStreams` not visible: check it's `public` in TerminalSession.java
- `reopen` not visible: check it's `public synchronized` in ByteQueue.java

- [ ] **Step 3: Verify changed files are correct**

```bash
cd ~/Shelly
git diff --stat
```

Expected changed files:
1. `modules/terminal-emulator/android/src/main/java/com/termux/terminal/ByteQueue.java`
2. `modules/terminal-emulator/android/src/main/java/com/termux/terminal/TerminalSession.java`
3. `modules/terminal-emulator/android/src/main/java/expo/modules/terminalemulator/ShellyTerminalSession.kt`
4. `modules/terminal-emulator/android/src/main/java/expo/modules/terminalemulator/TerminalEmulatorModule.kt`
5. `modules/terminal-emulator/src/TerminalEmulatorModule.ts`
6. `app/(tabs)/terminal.tsx`
7. `store/terminal-store.ts`
8. `components/terminal/TerminalHeader.tsx`
9. `lib/terminal-session-monitor.ts`

---

## Design Philosophy Alignment Notes

Based on Shelly's design philosophy:

1. **"Termuxの存在を消す"** — Users never see "Connecting to terminal..." or any reconnection artifact. The terminal just works.

2. **"非エンジニアが自然言語オンリーで使える"** — A non-engineer switching between YouTube and Shelly encounters no technical failure state. Reconnection is invisible.

3. **"初回5分以内セットアップ"** — No impact on setup flow. Runtime-only changes.

### Additional Design Observations (for future consideration)

**Observation 1:** The "Connecting to terminal..." text (terminal.tsx line 543) implies a network operation. After this change it only appears on initial launch. Consider renaming to "Starting terminal..." — a non-engineer shouldn't think about "connecting."

**Observation 2:** Session identifiers still use tmux-era names (`shelly-1`). Consider renaming to `pty-1` in a future refactor — cosmetic only.

**Observation 3:** `_pendingTmuxKills` and `_pendingTmuxClears` queues in terminal-store.ts are legacy. The `resetSession` function handles cleanup directly via Kotlin `destroySession`. These queues are dead code for pty-helper sessions.
