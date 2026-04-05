# TCP Connection Hardening — Termux-Equivalent Terminal Stability

**Date:** 2026-04-05
**Status:** Reviewed
**Supersedes:** 2026-03-29 UDS migration plan (abandoned — SELinux blocks cross-UID UDS on Android 9+)

## Problem

Shelly's terminal connection drops during idle periods (e.g., Claude Code thinking for 30+ seconds). The screen goes blank, requiring manual recovery. Termux doesn't have this problem because it holds the PTY in-process — no TCP.

## Why TCP Is Required

Android's security model prevents two apps with different UIDs from communicating via:
- Unix Domain Sockets (SELinux MLS categories differ per app since Android 9)
- Shared file descriptors (Binder FD passing requires a bound service — Termux doesn't expose one)
- Shared memory (same Binder constraint)
- Direct binary execution (Termux's `/data/data/com.termux/` is 700, inaccessible to Shelly)

**TCP localhost is the only IPC channel Android allows between two apps without special permissions.** Both apps share the same network namespace and have the `inet` group. SELinux allows `untrusted_app` to use inet sockets. TCP on 127.0.0.1 never leaves the kernel's loopback interface.

## Design Philosophy Alignment

- **Termux is invisible**: No changes to Termux required. Stock F-Droid Termux works.
- **Native feel**: Disconnections become invisible to the user (sub-second auto-reconnect).
- **No special permissions**: Only standard INTERNET permission (already granted).

## Architecture (No Change)

```
Shelly App (Kotlin) ──TCP 127.0.0.1──▶ pty-helper (C, Termux) ──PTY──▶ bash
```

The architecture stays the same. We harden every layer.

## Improvements

### 1. Bidirectional Application-Level Heartbeat

**Why**: TCP keepalive takes 30-60s to detect a dead connection. An app-level heartbeat detects in ~20s.

**Protocol**: Uses the existing escape sequence pattern (same as resize `\x1bPTYR`).

- **Heartbeat request**: `\x1bPTYH\n` (Shelly → pty-helper, every 15s)
- **Heartbeat response**: `\x1bPTYH\n` (pty-helper → Shelly, on client_fd, NOT on master_fd)
- pty-helper intercepts the heartbeat in the existing resize parser — does NOT forward to PTY
- Kotlin side filters heartbeat responses before passing to TerminalEmulator

**Detection logic**:
- Kotlin: if no data (heartbeat response or PTY output) received for 45s, close socket → trigger reconnect
- pty-helper: if no data (heartbeat or user input) from client for 45s, close client_fd → accept-wait loop

**Why not `\x00`**: NUL is a legitimate terminal byte (Ctrl+Space). The escape sequence approach is collision-free and reuses the existing resize parser infrastructure.

### 2. Output Ring Buffer with Drain Loop

**Why**: When the client disconnects, PTY output is lost. On reconnect, the user sees a blank screen.

**Design**:
- pty-helper maintains a 64KB ring buffer of recent PTY output
- **During relay_loop**: every PTY→client write also copies to ring buffer
- **During accept-wait (critical)**: a drain loop reads from `master_fd` into the ring buffer even when no client is connected. This prevents the shell from blocking on writes when the kernel PTY buffer fills (~16KB)
- **On new client accept**: replay ring buffer before entering relay_loop

**Replay framing** (mandatory):
```
\x1bPTYREPLAY_START\n
<ring buffer contents>
\x1bPTYREPLAY_END\n
```
Kotlin side: on reconnect via `replaceStreams()`, clear the TerminalEmulator buffer before processing replay data. This prevents double-rendering of content already in the scroll buffer.

**Size tradeoff**: 64KB ≈ 1-2 screens of dense output. Sufficient for the Claude Code thinking scenario. Long output (e.g., `cat large-file.txt`) will only preserve the last 64KB. This is acceptable — scroll buffer in TerminalEmulator handles the rest.

### 3. Kotlin Auto-Reconnect Improvement

**Why**: Current reconnect loop has fixed 1s interval and 30 max attempts. Too slow for the common case.

**Design**:
- **Immediate first attempt** (0ms delay) — most TCP drops recover instantly
- **Exponential backoff**: 100ms, 200ms, 400ms, ... max 5s
- **No attempt limit** — keep trying as long as `shouldReconnect` is true
- Show "Reconnecting..." indicator only after 2s of failed attempts (avoid flashing)
- **After successful reconnect**: send `sendResizeCommand(currentCols, currentRows)` then `Ctrl+L`

**Connection state machine** (replaces volatile booleans):
```kotlin
enum class ConnectionState {
    CONNECTED,           // Normal operation
    HEARTBEAT_TIMEOUT,   // No data for 45s, about to reconnect
    RECONNECTING,        // Actively trying to reconnect
    DISCONNECTED         // shouldReconnect = false (session destroyed)
}
```

### 4. Foreground Service WakeLock

**Why**: Android can sleep the CPU even with screen on, dropping TCP connections. Termux does the same — foreground service + WakeLock.

**Design**:
- `TerminalEmulatorModule.kt` acquires `PowerManager.PARTIAL_WAKE_LOCK` with tag `"shelly:terminal"` when the first session is created
- Released when the last session is destroyed
- The existing `startSessionService()` foreground notification satisfies Android's WakeLock requirement

**Why TerminalEmulatorModule**: This module manages session lifecycle (create/destroy). The WakeLock is tied to session existence, not bridge connection. `ShellyForegroundService` (in termux-bridge module) manages bridge lifecycle, which is a different concern.

### 5. Battery Optimization Exemption

**Why**: Even with foreground service + WakeLock, Doze mode can defer network activity.

**Design**:
- Check `PowerManager.isIgnoringBatteryOptimizations()` on startup
- **Trigger**: Show prompt after the first disconnection event, not during setup (users who never experience disconnects are not bothered)
- Use `Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` intent
- If denied, Shelly still works but may have occasional Doze-related disconnects

### 6. TCP Keepalive (Already Implemented)

Already in pty-helper: `TCP_KEEPIDLE=30s, TCP_KEEPINTVL=10s, TCP_KEEPCNT=3`. Secondary detection behind the app-level heartbeat.

## Expected Behavior After Hardening

| Scenario | Before | After |
|----------|--------|-------|
| Claude Code thinking (60s) | Screen goes blank | Heartbeat keeps connection alive |
| App backgrounded 5min | Dead terminal on return | Auto-reconnect <1s, output preserved via ring buffer |
| App updated (APK install) | `[Process completed]` | Auto-reconnect on launch, ring buffer replays missed output |
| Memory pressure | Silent socket death | Heartbeat detects in ~20s → auto-reconnect |
| Screen off 30min | Connection dies | WakeLock prevents CPU sleep, heartbeat maintains connection |
| Doze mode | Deferred network | Battery exemption prevents Doze interference |

## File Changes

| File | Change |
|------|--------|
| `shelly-bridge/pty-helper.c` | Heartbeat handler, ring buffer, drain loop, replay on reconnect |
| `modules/terminal-emulator/.../ShellyTerminalSession.kt` | Heartbeat thread, ConnectionState enum, exponential backoff, resize after reconnect, heartbeat filtering |
| `modules/terminal-emulator/.../TerminalEmulatorModule.kt` | WakeLock acquire/release tied to session lifecycle |
| `modules/terminal-emulator/.../TerminalSession.java` | Clear emulator buffer on replaceStreams (for clean replay) |
| Setup wizard or first-disconnect handler | Battery optimization exemption prompt |

## Non-Goals

- Replacing TCP with another IPC (proven infeasible due to Android security model)
- Modifying Termux (design principle: stock Termux only)
- Bundling a shell/toolchain inside Shelly
- Preserving full scrollback across disconnects (64KB ring buffer is sufficient)

## Success Criteria

1. Terminal survives 10+ minutes of idle (Claude Code thinking) without disconnection
2. App background → foreground recovers in <1 second with output preserved
3. APK update recovers terminal session automatically
4. User never sees blank screen or `[Process completed]` during normal usage
5. No visible difference from Termux's terminal stability in daily use
