# Native Terminal View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace WebView + ttyd + xterm.js with native Android terminal rendering using Termux's terminal-emulator/terminal-view libraries, eliminating 2 process boundaries and enabling direct terminal output → React Native state flow.

**Architecture:** Two new Expo Native Modules (`terminal-emulator` for PTY/session management, `terminal-view` for Canvas rendering) wrap vendored Termux libraries (Apache 2.0). PTY output flows through frame-aligned Kotlin batching → Expo EventEmitter → Zustand store. tmux remains for session persistence. OSC 133 protocol enables Warp-style block detection.

**Tech Stack:** Kotlin (Expo Modules API), Java (vendored Termux libs), C/JNI (PTY ops), TypeScript/React Native, Zustand, CMake/NDK

**Spec:** `docs/superpowers/specs/2026-03-27-native-terminal-view-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `modules/terminal-emulator/expo-module.config.json` | Expo module registration |
| `modules/terminal-emulator/android/build.gradle` | Gradle + NDK/CMake config |
| `modules/terminal-emulator/android/CMakeLists.txt` | Native library build |
| `modules/terminal-emulator/android/src/main/jni/termux.c` | PTY fork/exec/resize/close |
| `modules/terminal-emulator/android/src/main/java/com/termux/terminal/*.java` | Vendored Termux terminal-emulator (Apache 2.0) |
| `modules/terminal-emulator/android/src/main/java/expo/modules/terminalemulator/TerminalEmulatorModule.kt` | Expo Module: session CRUD, events |
| `modules/terminal-emulator/android/src/main/java/expo/modules/terminalemulator/ShellyTerminalSession.kt` | Session lifecycle, output batching, CLI detection |
| `modules/terminal-emulator/android/src/main/java/expo/modules/terminalemulator/ShellyShellEnvironment.kt` | Termux path abstraction |
| `modules/terminal-emulator/src/TerminalEmulatorModule.ts` | TypeScript API declaration |
| `modules/terminal-emulator/src/index.ts` | Re-exports |
| `modules/terminal-view/expo-module.config.json` | Expo module registration |
| `modules/terminal-view/android/build.gradle` | Gradle config |
| `modules/terminal-view/android/src/main/java/com/termux/view/*.java` | Vendored Termux terminal-view (Apache 2.0) |
| `modules/terminal-view/android/src/main/assets/fonts/*.ttf` | JetBrains Mono, Fira Code, PixelMplus |
| `modules/terminal-view/android/src/main/java/expo/modules/terminalview/TerminalViewModule.kt` | Expo Module: view registration |
| `modules/terminal-view/android/src/main/java/expo/modules/terminalview/ShellyTerminalView.kt` | Native View wrapper for Expo |
| `modules/terminal-view/android/src/main/java/expo/modules/terminalview/ShellyTerminalRenderer.kt` | Custom font/theme rendering |
| `modules/terminal-view/android/src/main/java/expo/modules/terminalview/ShellyInputHandler.kt` | IME, key events, gestures |
| `modules/terminal-view/android/src/main/java/expo/modules/terminalview/BlockDetector.kt` | OSC 133 block detection |
| `modules/terminal-view/android/src/main/java/expo/modules/terminalview/LinkDetector.kt` | URL/filepath detection |
| `modules/terminal-view/android/src/main/java/expo/modules/terminalview/FontManager.kt` | Bundled font loading + cache |
| `modules/terminal-view/src/TerminalViewModule.ts` | TypeScript API |
| `modules/terminal-view/src/NativeTerminalView.tsx` | React Native component |
| `modules/terminal-view/src/index.ts` | Re-exports |
| `hooks/use-terminal-output.ts` | EventEmitter → execution-log-store bridge |
| `lib/terminal-session-monitor.ts` | Simplified tmux health check (replaces phantom-process-guard) |
| `lib/theme-to-terminal-colors.ts` | Shelly Theme → TerminalColorScheme conversion |

### Modified Files

| File | Changes |
|------|---------|
| `store/types.ts` | Update `TabSession` type: remove `port`/`ttyUrl`/`connectionStatus`, add `nativeSessionId`/`sessionStatus`/`isAlive` |
| `store/terminal-store.ts` | Remove port allocation, raise MAX_SESSIONS to 4, add migration logic, update `createSession()` |
| `store/execution-log-store.ts` | No changes (same `addTerminalOutput` API) |
| `app/(tabs)/terminal.tsx` | Replace WebView with `<NativeTerminalView />`, remove JS injection, simplify recovery |
| `lib/smart-wakelock.ts` | Rewrite: event-driven (CLI start/stop) instead of 30s pgrep polling |
| `app.config.ts` | Add terminal-emulator and terminal-view to plugins |
| `~/shelly-bridge/start-shelly.sh` | Remove ttyd launch lines |

### Deleted Files

| File | Reason |
|------|--------|
| `lib/ttyd-manager.ts` | ttyd no longer used |
| `hooks/use-ttyd-connection.ts` | WebView connection no longer needed |
| `lib/phantom-process-guard.ts` | Replaced by terminal-session-monitor.ts |

---

## Task Breakdown

### Task 0: NDK Build Pipeline Validation

**Files:**
- Create: `modules/terminal-emulator/expo-module.config.json`
- Create: `modules/terminal-emulator/android/build.gradle`
- Create: `modules/terminal-emulator/android/CMakeLists.txt`
- Create: `modules/terminal-emulator/android/src/main/jni/termux.c`
- Create: `modules/terminal-emulator/android/src/main/java/expo/modules/terminalemulator/TerminalEmulatorModule.kt`
- Create: `modules/terminal-emulator/src/TerminalEmulatorModule.ts`
- Create: `modules/terminal-emulator/src/index.ts`
- Modify: `app.config.ts`

**Purpose:** Validate that JNI/NDK builds work in the Expo/EAS pipeline before writing any real logic. This is the highest-risk task.

- [ ] **Step 1: Create module scaffold**

```json
// modules/terminal-emulator/expo-module.config.json
{
  "platforms": ["android"],
  "android": {
    "modules": ["expo.modules.terminalemulator.TerminalEmulatorModule"]
  }
}
```

- [ ] **Step 2: Create build.gradle with NDK**

```groovy
// modules/terminal-emulator/android/build.gradle
// NOTE: follows existing termux-bridge pattern — no explicit compileSdk
// (expo-module-gradle-plugin handles it). No kotlin plugin needed here
// (expo-module-gradle-plugin applies it automatically).
plugins {
  id 'com.android.library'
  id 'expo-module-gradle-plugin'
}

group = 'expo.modules.terminalemulator'
version = '0.1.0'

android {
  namespace "expo.modules.terminalemulator"

  defaultConfig {
    externalNativeBuild {
      cmake {
        abiFilters "armeabi-v7a", "arm64-v8a"
      }
    }
  }

  externalNativeBuild {
    cmake {
      path "CMakeLists.txt"
    }
  }

  lint {
    abortOnError false
  }
}
```

- [ ] **Step 3: Create CMakeLists.txt**

```cmake
# modules/terminal-emulator/android/CMakeLists.txt
cmake_minimum_required(VERSION 3.18.1)
project(termux)

add_library(termux SHARED src/main/jni/termux.c)
target_link_libraries(termux log)
```

- [ ] **Step 4: Create minimal termux.c with one JNI function**

```c
// modules/terminal-emulator/android/src/main/jni/termux.c
#include <jni.h>
#include <android/log.h>

#define LOG_TAG "termux-jni"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)

JNIEXPORT jint JNICALL
Java_com_termux_terminal_JNI_testJni(JNIEnv *env, jclass clazz) {
    LOGI("JNI test: libtermux.so loaded successfully");
    return 42;
}
```

- [ ] **Step 5: Create minimal Kotlin module**

```kotlin
// modules/terminal-emulator/android/src/main/java/expo/modules/terminalemulator/TerminalEmulatorModule.kt
package expo.modules.terminalemulator

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class TerminalEmulatorModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("TerminalEmulator")

        AsyncFunction("testJni") {
            System.loadLibrary("termux")
            val result = com.termux.terminal.JNI.testJni()
            return@AsyncFunction result
        }
    }
}
```

- [ ] **Step 6: Create minimal JNI.java stub**

```java
// modules/terminal-emulator/android/src/main/java/com/termux/terminal/JNI.java
package com.termux.terminal;

public class JNI {
    static {
        System.loadLibrary("termux");
    }

    public static native int testJni();
}
```

- [ ] **Step 7: Create TypeScript API**

```typescript
// modules/terminal-emulator/src/TerminalEmulatorModule.ts
import { NativeModule, requireNativeModule } from 'expo-modules-core';

declare class TerminalEmulatorModuleType extends NativeModule {
  testJni(): Promise<number>;
}

export default requireNativeModule<TerminalEmulatorModuleType>('TerminalEmulator');
```

```typescript
// modules/terminal-emulator/src/index.ts
export { default } from './TerminalEmulatorModule';
```

- [ ] **Step 8: Add plugin to app.config.ts**

Add `"./modules/terminal-emulator"` to the `plugins` array in `app.config.ts`.

- [ ] **Step 9: Build and verify**

Run: `cd ~/Shelly && npx expo prebuild --platform android --clean 2>&1 | tail -20`

If prebuild succeeds, trigger a GitHub Actions build or local Gradle build:
Run: `cd ~/Shelly/android && ./gradlew :app:assembleDebug 2>&1 | tail -30`

Expected: BUILD SUCCESSFUL with libtermux.so compiled.

- [ ] **Step 10: Commit**

```bash
cd ~/Shelly
git add modules/terminal-emulator/ app.config.ts
git commit -m "feat: scaffold terminal-emulator module with JNI/NDK validation"
```

---

### Task 1: Vendor Termux terminal-emulator Library

**Files:**
- Create: `modules/terminal-emulator/android/src/main/java/com/termux/terminal/TerminalEmulator.java`
- Create: `modules/terminal-emulator/android/src/main/java/com/termux/terminal/TerminalSession.java`
- Create: `modules/terminal-emulator/android/src/main/java/com/termux/terminal/TerminalBuffer.java`
- Create: `modules/terminal-emulator/android/src/main/java/com/termux/terminal/TerminalRow.java`
- Create: `modules/terminal-emulator/android/src/main/java/com/termux/terminal/TerminalOutput.java`
- Create: `modules/terminal-emulator/android/src/main/java/com/termux/terminal/TerminalSessionClient.java`
- Create: `modules/terminal-emulator/android/src/main/java/com/termux/terminal/TerminalColors.java`
- Create: `modules/terminal-emulator/android/src/main/java/com/termux/terminal/TerminalColorScheme.java`
- Create: `modules/terminal-emulator/android/src/main/java/com/termux/terminal/TextStyle.java`
- Create: `modules/terminal-emulator/android/src/main/java/com/termux/terminal/WcWidth.java`
- Create: `modules/terminal-emulator/android/src/main/java/com/termux/terminal/KeyHandler.java`
- Create: `modules/terminal-emulator/android/src/main/java/com/termux/terminal/ByteQueue.java`
- Create: `modules/terminal-emulator/android/src/main/java/com/termux/terminal/Logger.java`
- Create: `modules/terminal-emulator/android/src/main/java/com/termux/terminal/LICENSE`
- Create: `modules/terminal-emulator/android/src/main/java/com/termux/terminal/NOTICE`
- Create: `modules/terminal-emulator/android/src/main/java/com/termux/terminal/VENDORED.md`
- Modify: `modules/terminal-emulator/android/src/main/jni/termux.c` (replace stub with full Termux PTY code)
- Modify: `modules/terminal-emulator/android/src/main/java/com/termux/terminal/JNI.java` (replace stub with full signatures)

- [ ] **Step 1: Download Termux terminal-emulator source**

```bash
cd ~/Shelly
# Clone Termux app repo (sparse checkout for terminal-emulator only)
git clone --depth 1 --filter=blob:none --sparse https://github.com/termux/termux-app.git /tmp/termux-app
cd /tmp/termux-app
git sparse-checkout set terminal-emulator/src/main/java/com/termux/terminal terminal-emulator/src/main/jni
```

- [ ] **Step 2: Copy Java source files**

```bash
cp /tmp/termux-app/terminal-emulator/src/main/java/com/termux/terminal/*.java \
   ~/Shelly/modules/terminal-emulator/android/src/main/java/com/termux/terminal/
```

- [ ] **Step 3: Copy JNI source (replace stub)**

```bash
cp /tmp/termux-app/terminal-emulator/src/main/jni/termux.c \
   ~/Shelly/modules/terminal-emulator/android/src/main/jni/termux.c
```

- [ ] **Step 4: Create license files**

Create `LICENSE` (full Apache 2.0 text), `NOTICE` (copyright attribution to Termux/jackpal), and `VENDORED.md` with commit SHA, tag, date.

- [ ] **Step 5: Build and verify all Java files compile**

Run: `cd ~/Shelly/android && ./gradlew :modules:terminal-emulator:compileDebugJavaWithJavac 2>&1 | tail -20`

Expected: BUILD SUCCESSFUL. Fix any compilation issues.

- [ ] **Step 6: Cleanup temp files**

```bash
rm -rf /tmp/termux-app
```

- [ ] **Step 7: Commit**

```bash
cd ~/Shelly
git add modules/terminal-emulator/android/src/main/java/com/termux/ modules/terminal-emulator/android/src/main/jni/
git commit -m "feat: vendor Termux terminal-emulator library (Apache 2.0)"
```

---

### Task 2: ShellyShellEnvironment + ShellyTerminalSession

**Files:**
- Create: `modules/terminal-emulator/android/src/main/java/expo/modules/terminalemulator/ShellyShellEnvironment.kt`
- Create: `modules/terminal-emulator/android/src/main/java/expo/modules/terminalemulator/ShellyTerminalSession.kt`
- Modify: `modules/terminal-emulator/android/src/main/java/expo/modules/terminalemulator/TerminalEmulatorModule.kt`
- Modify: `modules/terminal-emulator/src/TerminalEmulatorModule.ts`

- [ ] **Step 1: Create ShellyShellEnvironment**

```kotlin
// modules/terminal-emulator/android/src/main/java/expo/modules/terminalemulator/ShellyShellEnvironment.kt
package expo.modules.terminalemulator

import java.io.File

interface ShellEnvironment {
    val shellPath: String
    val homePath: String
    val envVars: Map<String, String>
    fun isAvailable(): Boolean
    fun tmuxPath(): String
}

class TermuxShellEnvironment : ShellEnvironment {
    override val shellPath = "/data/data/com.termux/files/usr/bin/bash"
    override val homePath = "/data/data/com.termux/files/home"

    override val envVars = mapOf(
        "PATH" to "/data/data/com.termux/files/usr/bin:/data/data/com.termux/files/usr/bin/applets",
        "HOME" to homePath,
        "TERM" to "xterm-256color",
        "LANG" to "en_US.UTF-8",
        "LD_LIBRARY_PATH" to "/data/data/com.termux/files/usr/lib",
        "PREFIX" to "/data/data/com.termux/files/usr",
        "TMPDIR" to "/data/data/com.termux/files/usr/tmp",
        "COLORTERM" to "truecolor",
        "PROMPT_COMMAND" to "\${PROMPT_COMMAND:+\$PROMPT_COMMAND;}echo -ne '\\033]133;D;\$?\\007\\033]133;A\\007'"
    )

    override fun isAvailable(): Boolean = File(shellPath).exists()
    override fun tmuxPath(): String = "/data/data/com.termux/files/usr/bin/tmux"
}
```

- [ ] **Step 2: Create ShellyTerminalSession**

```kotlin
// modules/terminal-emulator/android/src/main/java/expo/modules/terminalemulator/ShellyTerminalSession.kt
package expo.modules.terminalemulator

import android.os.Handler
import android.os.Looper
import com.termux.terminal.TerminalSession
import com.termux.terminal.TerminalSessionClient
import expo.modules.kotlin.modules.Module

class ShellyTerminalSession(
    private val sessionId: String,
    private val shell: ShellEnvironment,
    private val emitEvent: (name: String, body: Map<String, Any?>) -> Unit,
    cwd: String,
    rows: Int,
    cols: Int,
    useTmux: Boolean,
    tmuxSessionName: String?
) : TerminalSessionClient {

    private val outputBuffer = StringBuilder()
    private val batchHandler = Handler(Looper.getMainLooper())
    private val BATCH_INTERVAL_MS = 16L
    @Volatile private var flushScheduled = false

    val terminalSession: TerminalSession

    init {
        val cmd: String
        val args: Array<String>

        if (useTmux && tmuxSessionName != null) {
            cmd = shell.tmuxPath()
            args = arrayOf("attach-session", "-t", tmuxSessionName)
        } else {
            cmd = shell.shellPath
            args = emptyArray()
        }

        val envArray = shell.envVars.map { "${it.key}=${it.value}" }.toTypedArray()

        terminalSession = TerminalSession(
            cmd, cwd, args, envArray,
            rows, cols,
            this
        )
    }

    private val flushRunnable = Runnable {
        val text = synchronized(outputBuffer) {
            val t = outputBuffer.toString()
            outputBuffer.clear()
            t
        }
        flushScheduled = false
        if (text.isNotEmpty()) {
            // Backpressure: truncate if > 64KB
            val emitText = if (text.length > 65536) {
                text.take(1024) + "\n... [output truncated] ...\n" + text.takeLast(1024)
            } else {
                text
            }
            emitEvent("onSessionOutput", mapOf(
                "sessionId" to sessionId,
                "data" to emitText
            ))
        }
    }

    // Track last-known buffer position for incremental output capture
    private var lastBufferRow = 0
    private var lastBufferCol = 0

    // TerminalSessionClient implementation
    override fun onTextChanged(changedSession: TerminalSession) {
        // Extract only NEW text since last callback (not full transcript)
        val emulator = changedSession.emulator ?: return
        val screen = emulator.screen ?: return
        val curRow = screen.activeTranscriptRows + emulator.cursorRow
        val curCol = emulator.cursorCol

        if (curRow == lastBufferRow && curCol == lastBufferCol) return

        // Get text from last position to current position
        val newText = screen.getTranscriptTextBetween(lastBufferRow, lastBufferCol, curRow, curCol)
        lastBufferRow = curRow
        lastBufferCol = curCol

        if (newText.isNullOrEmpty()) return

        synchronized(outputBuffer) {
            outputBuffer.append(newText)
        }
        if (!flushScheduled) {
            flushScheduled = true
            batchHandler.postDelayed(flushRunnable, BATCH_INTERVAL_MS)
        }
    }

    override fun onSessionFinished(finishedSession: TerminalSession) {
        // Flush any remaining output
        flushRunnable.run()
        emitEvent("onSessionExit", mapOf(
            "sessionId" to sessionId,
            "exitCode" to (finishedSession.exitStatus ?: -1)
        ))
    }

    override fun onTitleChanged(changedSession: TerminalSession) {
        emitEvent("onTitleChanged", mapOf(
            "sessionId" to sessionId,
            "title" to (changedSession.title ?: "")
        ))
    }

    override fun onBell(session: TerminalSession) {
        emitEvent("onBell", mapOf("sessionId" to sessionId))
    }

    override fun onCopyTextToClipboard(session: TerminalSession, text: String) {}
    override fun onPasteTextFromClipboard(session: TerminalSession) {}
    override fun onColorsChanged(session: TerminalSession) {}
    override fun onTerminalCursorStateChange(state: Boolean) {}
    override fun logError(tag: String?, message: String?) {}
    override fun logWarn(tag: String?, message: String?) {}
    override fun logInfo(tag: String?, message: String?) {}
    override fun logDebug(tag: String?, message: String?) {}
    override fun logVerbose(tag: String?, message: String?) {}
    override fun logStackTraceWithMessage(tag: String?, message: String?, e: Exception?) {}
    override fun logStackTrace(tag: String?, e: Exception?) {}

    fun write(data: String) {
        terminalSession.write(data)
    }

    fun resize(rows: Int, cols: Int) {
        terminalSession.updateSize(rows, cols)
    }

    fun isAlive(): Boolean = terminalSession.isRunning

    fun destroy() {
        batchHandler.removeCallbacks(flushRunnable)
        terminalSession.finishIfRunning()
    }
}
```

- [ ] **Step 3: Update TerminalEmulatorModule with session management**

```kotlin
// modules/terminal-emulator/android/src/main/java/expo/modules/terminalemulator/TerminalEmulatorModule.kt
package expo.modules.terminalemulator

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class TerminalEmulatorModule : Module() {
    private val sessions = mutableMapOf<String, ShellyTerminalSession>()
    private val shellEnv = TermuxShellEnvironment()

    override fun definition() = ModuleDefinition {
        Name("TerminalEmulator")

        Events("onSessionOutput", "onSessionExit", "onTitleChanged", "onBell")

        AsyncFunction("createSession") { config: Map<String, Any?> ->
            val sessionId = config["sessionId"] as? String ?: throw Exception("sessionId required")
            val cwd = config["cwd"] as? String ?: shellEnv.homePath
            val rows = (config["rows"] as? Double)?.toInt() ?: 24
            val cols = (config["cols"] as? Double)?.toInt() ?: 80
            val useTmux = config["useTmux"] as? Boolean ?: true
            val tmuxSessionName = config["tmuxSessionName"] as? String

            if (!shellEnv.isAvailable()) {
                throw Exception("Shell not available: ${shellEnv.shellPath}")
            }

            val session = ShellyTerminalSession(
                sessionId = sessionId,
                shell = shellEnv,
                emitEvent = { name, body -> sendEvent(name, body) },
                cwd = cwd,
                rows = rows,
                cols = cols,
                useTmux = useTmux,
                tmuxSessionName = tmuxSessionName
            )
            sessions[sessionId] = session
            return@AsyncFunction sessionId
        }

        AsyncFunction("destroySession") { sessionId: String ->
            sessions.remove(sessionId)?.destroy()
        }

        AsyncFunction("writeToSession") { sessionId: String, data: String ->
            sessions[sessionId]?.write(data) ?: throw Exception("Session not found: $sessionId")
        }

        AsyncFunction("resizeSession") { sessionId: String, rows: Int, cols: Int ->
            sessions[sessionId]?.resize(rows, cols) ?: throw Exception("Session not found: $sessionId")
        }

        AsyncFunction("isSessionAlive") { sessionId: String ->
            return@AsyncFunction sessions[sessionId]?.isAlive() ?: false
        }

        AsyncFunction("getTranscriptText") { sessionId: String, maxLines: Int ->
            val session = sessions[sessionId] ?: throw Exception("Session not found: $sessionId")
            val screen = session.terminalSession.emulator?.screen
                ?: return@AsyncFunction ""
            val totalRows = screen.activeTranscriptRows + session.terminalSession.emulator.mRows
            val startRow = maxOf(0, totalRows - maxLines)
            return@AsyncFunction screen.getTranscriptText(startRow, 0, totalRows - 1, session.terminalSession.emulator.mColumns) ?: ""
        }

        AsyncFunction("sendKeyEvent") { sessionId: String, keyCode: Int, modifiers: Int ->
            val session = sessions[sessionId] ?: throw Exception("Session not found: $sessionId")
            // Convert keyCode + modifiers to terminal escape sequence
            val result = com.termux.terminal.KeyHandler.getCode(keyCode, 0, modifiers and 1 != 0, modifiers and 2 != 0)
            if (result != null) {
                session.write(result)
            }
        }

        AsyncFunction("getSessionTitle") { sessionId: String ->
            val session = sessions[sessionId] ?: throw Exception("Session not found: $sessionId")
            return@AsyncFunction session.terminalSession.title ?: ""
        }
    }
}
```

- [ ] **Step 4: Update TypeScript API**

```typescript
// modules/terminal-emulator/src/TerminalEmulatorModule.ts
import { NativeModule, requireNativeModule } from 'expo-modules-core';

export interface SessionConfig {
  sessionId: string;
  cwd?: string;
  rows?: number;
  cols?: number;
  useTmux?: boolean;
  tmuxSessionName?: string;
}

declare class TerminalEmulatorModuleType extends NativeModule {
  createSession(config: SessionConfig): Promise<string>;
  destroySession(sessionId: string): Promise<void>;
  writeToSession(sessionId: string, data: string): Promise<void>;
  sendKeyEvent(sessionId: string, keyCode: number, modifiers: number): Promise<void>;
  resizeSession(sessionId: string, rows: number, cols: number): Promise<void>;
  isSessionAlive(sessionId: string): Promise<boolean>;
  getTranscriptText(sessionId: string, maxLines: number): Promise<string>;
  getSessionTitle(sessionId: string): Promise<string>;
}

export default requireNativeModule<TerminalEmulatorModuleType>('TerminalEmulator');
```

- [ ] **Step 5: Build and verify**

Run: `cd ~/Shelly/android && ./gradlew :app:assembleDebug 2>&1 | tail -30`
Expected: BUILD SUCCESSFUL

- [ ] **Step 6: Commit**

```bash
cd ~/Shelly
git add modules/terminal-emulator/
git commit -m "feat: add ShellyTerminalSession and ShellEnvironment with PTY management"
```

---

### Task 3: Vendor Termux terminal-view + Font Bundling

**Files:**
- Create: `modules/terminal-view/expo-module.config.json`
- Create: `modules/terminal-view/android/build.gradle`
- Create: `modules/terminal-view/android/src/main/java/com/termux/view/*.java` (vendored)
- Create: `modules/terminal-view/android/src/main/assets/fonts/` (7 font files + 3 licenses)
- Create: `modules/terminal-view/android/src/main/java/com/termux/view/LICENSE`
- Create: `modules/terminal-view/android/src/main/java/com/termux/view/VENDORED.md`

- [ ] **Step 1: Create module scaffold**

```json
// modules/terminal-view/expo-module.config.json
{
  "platforms": ["android"],
  "android": {
    "modules": ["expo.modules.terminalview.TerminalViewModule"]
  }
}
```

- [ ] **Step 2: Create build.gradle (depends on terminal-emulator)**

```groovy
// modules/terminal-view/android/build.gradle
// NOTE: follows existing termux-bridge pattern. Verify Gradle project path
// for terminal-emulator dependency after expo prebuild — may need adjustment.
plugins {
  id 'com.android.library'
  id 'expo-module-gradle-plugin'
}

group = 'expo.modules.terminalview'
version = '0.1.0'

android {
  namespace "expo.modules.terminalview"

  lint {
    abortOnError false
  }
}

dependencies {
  // Verify project path after expo prebuild — may be ':terminal-emulator'
  // depending on how Expo auto-linking generates settings.gradle
  implementation project(':modules:terminal-emulator')
}
```

- [ ] **Step 3: Vendor Termux terminal-view source**

```bash
cd /tmp/termux-app  # or re-clone if cleaned up
git sparse-checkout add terminal-view/src/main/java/com/termux/view

cp -r /tmp/termux-app/terminal-view/src/main/java/com/termux/view/*.java \
   ~/Shelly/modules/terminal-view/android/src/main/java/com/termux/view/

# Copy textselection subdirectory
mkdir -p ~/Shelly/modules/terminal-view/android/src/main/java/com/termux/view/textselection/
cp /tmp/termux-app/terminal-view/src/main/java/com/termux/view/textselection/*.java \
   ~/Shelly/modules/terminal-view/android/src/main/java/com/termux/view/textselection/
```

- [ ] **Step 4: Download and bundle fonts**

```bash
mkdir -p ~/Shelly/modules/terminal-view/android/src/main/assets/fonts/

# JetBrains Mono (SIL OFL)
curl -L "https://github.com/JetBrains/JetBrainsMono/releases/download/v2.304/JetBrainsMono-2.304.zip" -o /tmp/jbm.zip
cd /tmp && unzip -o jbm.zip -d jbm
cp /tmp/jbm/fonts/ttf/JetBrainsMono-Regular.ttf ~/Shelly/modules/terminal-view/android/src/main/assets/fonts/
cp /tmp/jbm/fonts/ttf/JetBrainsMono-Bold.ttf ~/Shelly/modules/terminal-view/android/src/main/assets/fonts/
cp /tmp/jbm/fonts/ttf/JetBrainsMono-Italic.ttf ~/Shelly/modules/terminal-view/android/src/main/assets/fonts/
cp /tmp/jbm/OFL.txt ~/Shelly/modules/terminal-view/android/src/main/assets/fonts/JetBrainsMono-LICENSE.txt

# Fira Code (SIL OFL)
curl -L "https://github.com/tonsky/FiraCode/releases/download/6.2/Fira_Code_v6.2.zip" -o /tmp/fc.zip
cd /tmp && unzip -o fc.zip -d fc
cp /tmp/fc/ttf/FiraCode-Regular.ttf ~/Shelly/modules/terminal-view/android/src/main/assets/fonts/
cp /tmp/fc/ttf/FiraCode-Bold.ttf ~/Shelly/modules/terminal-view/android/src/main/assets/fonts/
cp /tmp/fc/LICENSE ~/Shelly/modules/terminal-view/android/src/main/assets/fonts/FiraCode-LICENSE.txt

# PixelMplus (M+ License, CJK dot font)
curl -L "https://github.com/itouhiro/PixelMplus/releases/download/v2.3.0/PixelMplus-20130602.zip" -o /tmp/pm.zip
cd /tmp && unzip -o pm.zip -d pm
cp /tmp/pm/PixelMplus10-Regular.ttf ~/Shelly/modules/terminal-view/android/src/main/assets/fonts/
cp /tmp/pm/PixelMplus12-Regular.ttf ~/Shelly/modules/terminal-view/android/src/main/assets/fonts/
cp /tmp/pm/LICENSE.txt ~/Shelly/modules/terminal-view/android/src/main/assets/fonts/PixelMplus-LICENSE.txt
```

- [ ] **Step 5: Add license and vendor tracking files**

- [ ] **Step 6: Build and verify**

Run: `cd ~/Shelly/android && ./gradlew :modules:terminal-view:compileDebugJavaWithJavac 2>&1 | tail -20`
Expected: BUILD SUCCESSFUL

- [ ] **Step 7: Add plugin to app.config.ts**

Add `"./modules/terminal-view"` to the `plugins` array.

- [ ] **Step 8: Commit**

```bash
cd ~/Shelly
git add modules/terminal-view/ app.config.ts
git commit -m "feat: vendor Termux terminal-view library + bundle fonts (JetBrains Mono, Fira Code, PixelMplus)"
```

---

### Task 4: Native View Components (FontManager, BlockDetector, LinkDetector)

**Files:**
- Create: `modules/terminal-view/android/src/main/java/expo/modules/terminalview/FontManager.kt`
- Create: `modules/terminal-view/android/src/main/java/expo/modules/terminalview/BlockDetector.kt`
- Create: `modules/terminal-view/android/src/main/java/expo/modules/terminalview/LinkDetector.kt`

- [ ] **Step 1: Create FontManager**

```kotlin
package expo.modules.terminalview

import android.content.Context
import android.graphics.Typeface

object FontManager {
    private val fontCache = mutableMapOf<String, Typeface>()

    fun getTypeface(context: Context, family: String, style: Int = Typeface.NORMAL): Typeface {
        val key = "$family-$style"
        return fontCache.getOrPut(key) {
            val assetPath = when (family) {
                "jetbrains-mono" -> when (style) {
                    Typeface.BOLD -> "fonts/JetBrainsMono-Bold.ttf"
                    Typeface.ITALIC -> "fonts/JetBrainsMono-Italic.ttf"
                    else -> "fonts/JetBrainsMono-Regular.ttf"
                }
                "fira-code" -> when (style) {
                    Typeface.BOLD -> "fonts/FiraCode-Bold.ttf"
                    else -> "fonts/FiraCode-Regular.ttf"
                }
                "pixel-mplus" -> "fonts/PixelMplus12-Regular.ttf"
                else -> "fonts/JetBrainsMono-Regular.ttf"
            }
            try {
                Typeface.createFromAsset(context.assets, assetPath)
            } catch (e: Exception) {
                Typeface.MONOSPACE
            }
        }
    }

    fun clearCache() {
        fontCache.clear()
    }
}
```

- [ ] **Step 2: Create BlockDetector (OSC 133)**

```kotlin
package expo.modules.terminalview

/**
 * Detects command blocks using OSC 133 (FinalTerm) semantic prompt protocol.
 * A = prompt start, B = command start, C = output start, D;N = command done with exit code N.
 * Fallback: timeout-based grouping for non-bash shells.
 */
class BlockDetector(
    private val onBlockCompleted: (command: String, output: String, exitCode: Int) -> Unit
) {
    private var currentCommand: String? = null
    private val currentOutput = StringBuilder()
    private var awaitingCommand = false
    private var lastOutputTime = 0L

    companion object {
        // OSC 133 sequences
        private const val OSC_START = "\u001b]133;"
        private const val ST = "\u0007"  // String Terminator
        private const val FALLBACK_TIMEOUT_MS = 2000L
    }

    fun processOutput(data: String) {
        var pos = 0
        while (pos < data.length) {
            val oscIdx = data.indexOf(OSC_START, pos)
            if (oscIdx < 0) {
                // No more OSC sequences — append remaining as output
                if (currentCommand != null) {
                    currentOutput.append(data.substring(pos))
                }
                lastOutputTime = System.currentTimeMillis()
                break
            }

            // Append text before OSC sequence
            if (oscIdx > pos && currentCommand != null) {
                currentOutput.append(data.substring(pos, oscIdx))
            }

            // Parse OSC 133 command
            val stIdx = data.indexOf(ST, oscIdx)
            if (stIdx < 0) break

            val oscContent = data.substring(oscIdx + OSC_START.length, stIdx)
            pos = stIdx + ST.length

            when {
                oscContent == "A" -> {
                    // Prompt start — finalize previous block if exists
                    finalizeCurrentBlock()
                    awaitingCommand = true
                }
                oscContent == "B" -> {
                    // Command start (user pressed Enter)
                    awaitingCommand = false
                }
                oscContent == "C" -> {
                    // Output start — nothing special needed
                }
                oscContent.startsWith("D;") -> {
                    // Command done with exit code
                    val exitCode = oscContent.substringAfter("D;").toIntOrNull() ?: -1
                    finalizeCurrentBlock(exitCode)
                }
                oscContent == "D" -> {
                    finalizeCurrentBlock(0)
                }
            }
        }
    }

    fun setCurrentCommand(command: String) {
        currentCommand = command
        currentOutput.clear()
    }

    private fun finalizeCurrentBlock(exitCode: Int = 0) {
        val cmd = currentCommand
        if (cmd != null) {
            onBlockCompleted(cmd, currentOutput.toString(), exitCode)
        }
        currentCommand = null
        currentOutput.clear()
        awaitingCommand = false
    }

    /**
     * Call periodically to handle timeout-based fallback
     * for non-bash shells that don't emit OSC 133.
     */
    fun checkTimeout() {
        if (currentCommand != null && lastOutputTime > 0) {
            val elapsed = System.currentTimeMillis() - lastOutputTime
            if (elapsed > FALLBACK_TIMEOUT_MS) {
                finalizeCurrentBlock(-1) // -1 = unknown exit code
            }
        }
    }
}
```

- [ ] **Step 3: Create LinkDetector**

```kotlin
package expo.modules.terminalview

import java.util.regex.Pattern

data class DetectedLink(
    val text: String,
    val type: LinkType,
    val startCol: Int,
    val endCol: Int,
    val row: Int
)

enum class LinkType { URL, FILEPATH, ERROR_REF }

object LinkDetector {
    private val URL_PATTERN = Pattern.compile(
        "(https?://[\\w\\-._~:/?#\\[\\]@!$&'()*+,;=%]+)"
    )
    private val FILEPATH_PATTERN = Pattern.compile(
        "([.~/][\\w\\-./]+\\.[a-zA-Z]{1,10})"
    )
    private val ERROR_REF_PATTERN = Pattern.compile(
        "([\\w\\-./]+\\.[a-zA-Z]{1,10}):(\\d+)(?::(\\d+))?"
    )

    fun detectLinks(text: String, row: Int): List<DetectedLink> {
        val links = mutableListOf<DetectedLink>()

        // URLs
        val urlMatcher = URL_PATTERN.matcher(text)
        while (urlMatcher.find()) {
            links.add(DetectedLink(
                text = urlMatcher.group(1)!!,
                type = LinkType.URL,
                startCol = urlMatcher.start(),
                endCol = urlMatcher.end(),
                row = row
            ))
        }

        // Error references (file:line:col) — check before generic filepath
        val errorMatcher = ERROR_REF_PATTERN.matcher(text)
        while (errorMatcher.find()) {
            links.add(DetectedLink(
                text = errorMatcher.group(0)!!,
                type = LinkType.ERROR_REF,
                startCol = errorMatcher.start(),
                endCol = errorMatcher.end(),
                row = row
            ))
        }

        // File paths (only if not already matched as error ref)
        val fileMatcher = FILEPATH_PATTERN.matcher(text)
        while (fileMatcher.find()) {
            val start = fileMatcher.start()
            val alreadyMatched = links.any { it.startCol <= start && start < it.endCol }
            if (!alreadyMatched) {
                links.add(DetectedLink(
                    text = fileMatcher.group(1)!!,
                    type = LinkType.FILEPATH,
                    startCol = start,
                    endCol = fileMatcher.end(),
                    row = row
                ))
            }
        }

        return links
    }
}
```

- [ ] **Step 4: Commit**

```bash
cd ~/Shelly
git add modules/terminal-view/android/src/main/java/expo/modules/terminalview/
git commit -m "feat: add FontManager, BlockDetector (OSC 133), and LinkDetector"
```

---

### Task 5: ShellyTerminalView + Expo Native View

**Files:**
- Create: `modules/terminal-view/android/src/main/java/expo/modules/terminalview/ShellyTerminalView.kt`
- Create: `modules/terminal-view/android/src/main/java/expo/modules/terminalview/ShellyInputHandler.kt`
- Create: `modules/terminal-view/android/src/main/java/expo/modules/terminalview/TerminalViewModule.kt`
- Create: `modules/terminal-view/src/TerminalViewModule.ts`
- Create: `modules/terminal-view/src/NativeTerminalView.tsx`
- Create: `modules/terminal-view/src/index.ts`

- [ ] **Step 1: Create ShellyInputHandler**

Kotlin class that handles IME input, hardware keyboard events, and touch gestures. Wraps key events and dispatches to the PTY session. Implements `View.OnKeyListener` and manages `InputConnection` for IME.

- [ ] **Step 2: Create ShellyTerminalView**

Kotlin class extending Termux's `TerminalView`. Adds:
- Font injection via `FontManager`
- Theme color application via `TerminalColorScheme`
- Battery optimization: `onVisibilityChanged()` stops/starts invalidation
- Resize handling: `onSizeChanged()` auto-calls `resizeSession`
- Scroll ownership: `onInterceptTouchEvent()` returns true for vertical scroll
- Block detection integration: passes output through `BlockDetector`
- Link detection: scans visible rows on each render

Must implement `TerminalViewClient` interface for key events and gestures.

- [ ] **Step 3: Create TerminalViewModule**

Expo Module that registers `ShellyTerminalView` as a Native View:

```kotlin
package expo.modules.terminalview

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class TerminalViewModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("TerminalView")

        View(ShellyTerminalView::class) {
            Prop("sessionId") { view: ShellyTerminalView, sessionId: String ->
                view.attachSession(sessionId)
            }
            Prop("fontFamily") { view: ShellyTerminalView, family: String ->
                view.setFontFamily(family)
            }
            Prop("fontSize") { view: ShellyTerminalView, size: Int ->
                view.setTerminalFontSize(size)
            }
            Prop("cursorShape") { view: ShellyTerminalView, shape: String ->
                view.setCursorShape(shape)
            }
            Prop("cursorBlink") { view: ShellyTerminalView, blink: Boolean ->
                view.setCursorBlink(blink)
            }

            Events("onOutput", "onBlockCompleted", "onSelectionChanged", "onUrlDetected", "onBell", "onTitleChanged")

            AsyncFunction("scrollToBottom") { view: ShellyTerminalView ->
                view.scrollToBottom()
            }
            AsyncFunction("scrollToTop") { view: ShellyTerminalView ->
                view.scrollToTop()
            }
            AsyncFunction("selectAll") { view: ShellyTerminalView ->
                view.selectAll()
            }
            AsyncFunction("clearSelection") { view: ShellyTerminalView ->
                view.clearSelection()
            }
            AsyncFunction("getSelectedText") { view: ShellyTerminalView ->
                return@AsyncFunction view.getSelectedText()
            }
            AsyncFunction("copyToClipboard") { view: ShellyTerminalView ->
                view.copyToClipboard()
            }
            AsyncFunction("focus") { view: ShellyTerminalView ->
                view.requestFocus()
            }
        }
    }
}
```

- [ ] **Step 4: Create TypeScript components**

```typescript
// modules/terminal-view/src/NativeTerminalView.tsx
import { requireNativeViewManager } from 'expo-modules-core';
import { ViewProps } from 'react-native';

export type FontFamily = 'jetbrains-mono' | 'fira-code' | 'pixel-mplus';

export interface NativeTerminalViewProps extends ViewProps {
  sessionId: string;
  fontFamily: FontFamily;
  fontSize: number;
  cursorShape?: 'block' | 'underline' | 'bar';
  cursorBlink?: boolean;
  onOutput?: (event: { nativeEvent: { text: string; isError: boolean } }) => void;
  onBlockCompleted?: (event: { nativeEvent: { command: string; output: string; exitCode: number } }) => void;
  onSelectionChanged?: (event: { nativeEvent: { text: string } }) => void;
  onUrlDetected?: (event: { nativeEvent: { url: string; type: 'url' | 'filepath' | 'error_ref' } }) => void;
  onBell?: () => void;
  onTitleChanged?: (event: { nativeEvent: { title: string } }) => void;
}

export const NativeTerminalView = requireNativeViewManager<NativeTerminalViewProps>('NativeTerminalView');
```

```typescript
// modules/terminal-view/src/index.ts
export { NativeTerminalView } from './NativeTerminalView';
export type { NativeTerminalViewProps, FontFamily } from './NativeTerminalView';
```

- [ ] **Step 5: Build and verify**

Run: `cd ~/Shelly/android && ./gradlew :app:assembleDebug 2>&1 | tail -30`

- [ ] **Step 6: Commit**

```bash
cd ~/Shelly
git add modules/terminal-view/
git commit -m "feat: add ShellyTerminalView Expo Native View with input handling"
```

---

### Task 6: TypeScript Integration Layer

**Files:**
- Create: `hooks/use-terminal-output.ts`
- Create: `lib/terminal-session-monitor.ts`
- Create: `lib/theme-to-terminal-colors.ts`
- Modify: `lib/smart-wakelock.ts`

- [ ] **Step 1: Create use-terminal-output hook**

```typescript
// hooks/use-terminal-output.ts
/**
 * Subscribes to TerminalEmulatorModule EventEmitter.
 * Feeds terminal output to execution-log-store for ALL sessions,
 * including background tabs. Independent of view lifecycle.
 */
import { useEffect } from 'react';
import TerminalEmulator from '@/modules/terminal-emulator';
import { useExecutionLogStore } from '@/store/execution-log-store';

export function useTerminalOutput() {
  const addTerminalOutput = useExecutionLogStore((s) => s.addTerminalOutput);

  useEffect(() => {
    const sub = TerminalEmulator.addListener('onSessionOutput', (event: { sessionId: string; data: string }) => {
      // Pass all lines including empty ones — blank lines carry semantic meaning
      // in CLI output (paragraph breaks, formatting). Only skip if entire batch is empty.
      if (!event.data) return;
      const lines = event.data.split('\n');
      for (const line of lines) {
        addTerminalOutput(line, event.sessionId);
      }
    });
    return () => sub.remove();
  }, [addTerminalOutput]);
}
```

- [ ] **Step 2: Create terminal-session-monitor**

```typescript
// lib/terminal-session-monitor.ts
/**
 * Simplified session health monitor. Replaces phantom-process-guard.ts.
 * Only checks tmux sessions (no ttyd). Runs every 60s.
 */

type RunCommand = (cmd: string, opts: { timeoutMs: number; reason: string }) => Promise<any>;

const CHECK_INTERVAL = 60_000;
let _timer: ReturnType<typeof setInterval> | null = null;
let _onSessionDied: ((tmuxName: string) => void) | null = null;

async function checkTmuxSession(name: string, runCmd: RunCommand): Promise<boolean> {
  try {
    const result = await runCmd(
      `tmux has-session -t "${name}" 2>/dev/null && echo ALIVE || echo DEAD`,
      { timeoutMs: 3000, reason: 'tmux-check' }
    );
    const output = typeof result === 'string' ? result : result?.output || '';
    return output.includes('ALIVE');
  } catch {
    return true; // Can't check = assume alive
  }
}

export function startSessionMonitor(
  tmuxNames: string[],
  runCmd: RunCommand,
  onDied: (tmuxName: string) => void
): void {
  stopSessionMonitor();
  _onSessionDied = onDied;

  _timer = setInterval(async () => {
    for (const name of tmuxNames) {
      const alive = await checkTmuxSession(name, runCmd);
      if (!alive) {
        _onSessionDied?.(name);
      }
    }
  }, CHECK_INTERVAL);
}

export function stopSessionMonitor(): void {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
  _onSessionDied = null;
}
```

- [ ] **Step 3: Create theme-to-terminal-colors**

```typescript
// lib/theme-to-terminal-colors.ts
/**
 * Converts Shelly ThemeColors to TerminalColorScheme for native view.
 */
import type { ThemeColors } from './theme';

export interface TerminalColorScheme {
  background: string;
  foreground: string;
  cursor: string;
  selectionBackground: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
}

export function themeToTerminalColors(colors: ThemeColors): TerminalColorScheme {
  return {
    background: colors.background,
    foreground: colors.foreground,
    cursor: colors.accent,
    selectionBackground: colors.accent + '40', // 25% opacity
    black: colors.ansiBlack ?? '#000000',
    red: colors.ansiRed ?? colors.error,
    green: colors.ansiGreen ?? colors.success,
    yellow: colors.ansiYellow ?? colors.warning,
    blue: colors.ansiBlue ?? '#5C78FF',
    magenta: colors.ansiMagenta ?? '#FF5CF5',
    cyan: colors.ansiCyan ?? colors.accent,
    white: colors.ansiWhite ?? colors.foreground,
    brightBlack: colors.ansiBrightBlack ?? colors.muted,
    brightRed: colors.ansiBrightRed ?? colors.error,
    brightGreen: colors.ansiBrightGreen ?? colors.success,
    brightYellow: colors.ansiBrightYellow ?? colors.warning,
    brightBlue: colors.ansiBrightBlue ?? '#7B93FF',
    brightMagenta: colors.ansiBrightMagenta ?? '#FF7BF7',
    brightCyan: colors.ansiBrightCyan ?? colors.accent,
    brightWhite: colors.ansiBrightWhite ?? '#FFFFFF',
  };
}
```

- [ ] **Step 4: Rewrite smart-wakelock.ts (event-driven)**

Replace the 30s polling with event-driven wakelock based on `activeCli` state changes in terminal-store. Acquire on CLI start, release 5 minutes after CLI exit.

- [ ] **Step 5: Commit**

```bash
cd ~/Shelly
git add hooks/use-terminal-output.ts lib/terminal-session-monitor.ts lib/theme-to-terminal-colors.ts lib/smart-wakelock.ts
git commit -m "feat: add TypeScript integration layer (output hook, session monitor, theme mapper, wakelock)"
```

---

### Task 7: Update Store Types and Migration

**Files:**
- Modify: `store/types.ts`
- Modify: `store/terminal-store.ts`

- [ ] **Step 1: Update TabSession type in types.ts**

Remove `port`, `ttyUrl`, `connectionStatus` fields. Add `nativeSessionId`, `sessionStatus`, `isAlive`. Update `activeCli` union type to include `'cody'`.

```typescript
type SessionStatus = 'starting' | 'alive' | 'exited' | 'recovering';

type TabSession = {
  id: string;
  name: string;
  currentDir: string;
  blocks: CommandBlock[];
  entries: TerminalEntry[];
  commandHistory: string[];
  historyIndex: number;
  activeCli: 'claude' | 'gemini' | 'codex' | 'cody' | null;
  tmuxSession: string;
  nativeSessionId: string;
  sessionStatus: SessionStatus;
  isAlive: boolean;
};
```

- [ ] **Step 2: Update terminal-store.ts**

- Change `MAX_SESSIONS` from 2 to 4
- Remove `TTYD_PORTS`, `TTYD_PORT_BASE`, `allocatePort()`
- Update `createSession()` to use new fields (no port/ttyUrl)
- Add migration in `loadSessionState()`: detect old format by presence of `ttyUrl` field, transform

```typescript
const MAX_SESSIONS = 4;
const TMUX_NAMES = ['shelly-1', 'shelly-2', 'shelly-3', 'shelly-4'];

function allocateTmuxName(sessions: TabSession[]): string | null {
  const used = new Set(sessions.map((s) => s.tmuxSession));
  for (const name of TMUX_NAMES) {
    if (!used.has(name)) return name;
  }
  return null;
}

function createSession(id: string, name: string, tmuxName: string): TabSession {
  return {
    id,
    name,
    currentDir: '/data/data/com.termux/files/home',
    blocks: [],
    entries: [],
    commandHistory: [],
    historyIndex: -1,
    activeCli: null,
    tmuxSession: tmuxName,
    nativeSessionId: tmuxName,
    sessionStatus: 'starting',
    isAlive: false,
  };
}
```

Migration in `loadSessionState()`:
```typescript
// Detect old format and migrate
if (parsed.sessions?.[0]?.ttyUrl !== undefined) {
  parsed.sessions = parsed.sessions.map((s: any) => {
    const { port, ttyUrl, connectionStatus, ...rest } = s;
    return {
      ...rest,
      nativeSessionId: rest.tmuxSession || 'shelly-1',
      sessionStatus: 'starting' as const,
      isAlive: false,
    };
  });
}
```

- [ ] **Step 3: Commit**

```bash
cd ~/Shelly
git add store/types.ts store/terminal-store.ts
git commit -m "feat: update TabSession type and store for native terminal (migration included)"
```

---

### Task 8: Rewrite terminal.tsx

**Files:**
- Modify: `app/(tabs)/terminal.tsx`
- Delete: `lib/ttyd-manager.ts`
- Delete: `hooks/use-ttyd-connection.ts`
- Delete: `lib/phantom-process-guard.ts`

This is the largest task. Replace WebView with NativeTerminalView, remove all JS injection, integrate with new native modules.

- [ ] **Step 1: Delete obsolete files**

```bash
cd ~/Shelly
rm lib/ttyd-manager.ts hooks/use-ttyd-connection.ts lib/phantom-process-guard.ts
```

- [ ] **Step 2: Rewrite terminal.tsx imports**

Remove imports for: `WebView`, `useTtydConnection`, `launchTtyd`, `killTtyd`, `killAllTtyd`, `isTtydRunning`, `startPhantomGuard`, `stopPhantomGuard`, `monitorPort`, `unmonitorPort`, `pauseMonitorForRecovery`, `resumeMonitorAfterRecovery`, `CAPTURE_INJECT_JS`, `FONT_INJECT_JS`.

Add imports for: `NativeTerminalView`, `TerminalEmulator`, `useTerminalOutput`, `startSessionMonitor`, `stopSessionMonitor`, `themeToTerminalColors`.

- [ ] **Step 3: Replace session creation logic**

On mount or when adding a new tab, call `TerminalEmulator.createSession()` instead of launching ttyd. Ensure tmux session is created first via bridge `runRawCommand`.

```typescript
const createNativeSession = useCallback(async (session: TabSession) => {
  // 1. Ensure tmux session exists
  await runRawCommand(
    `tmux has-session -t "${session.tmuxSession}" 2>/dev/null || tmux new-session -d -s "${session.tmuxSession}"`,
    { timeoutMs: 5000, reason: 'tmux-create' }
  );

  // 2. Configure tmux passthrough for OSC 133
  await runRawCommand(
    `tmux set -g allow-passthrough on 2>/dev/null; true`,
    { timeoutMs: 3000, reason: 'tmux-config' }
  );

  // 3. Create native PTY session attached to tmux
  await TerminalEmulator.createSession({
    sessionId: session.nativeSessionId,
    cwd: session.currentDir,
    rows: 24,
    cols: 80,
    useTmux: true,
    tmuxSessionName: session.tmuxSession,
  });

  updateSessionStatus(session.id, 'alive');
}, [runRawCommand]);
```

- [ ] **Step 4: Replace WebView with NativeTerminalView**

Remove the entire `<WebView>` block and replace with:

```tsx
<NativeTerminalView
  sessionId={activeSession.nativeSessionId}
  fontFamily={settings.terminalFont ?? 'jetbrains-mono'}
  fontSize={termFontSize}
  cursorShape={settings.cursorShape}
  cursorBlink={true}
  style={styles.terminalView}
  onOutput={(e) => {
    // Convenience for auto-scroll, not for execution-log (that's handled by useTerminalOutput hook)
    scrollToBottomIfNeeded();
  }}
  onBlockCompleted={(e) => {
    const { command, output, exitCode } = e.nativeEvent;
    addBlock(activeSession.id, command, output, exitCode);
  }}
  onUrlDetected={(e) => {
    handleUrlTap(e.nativeEvent.url, e.nativeEvent.type);
  }}
  onBell={() => {
    if (settings.soundEffects) playBellSound();
  }}
/>
```

- [ ] **Step 5: Remove all JS injection code**

Delete: `CAPTURE_INJECT_JS`, `FONT_INJECT_JS`, `handleWebViewLoad` (CSS/JS injection parts), `handleWebViewMessage` (postMessage handler).

- [ ] **Step 6: Simplify recovery logic**

Replace `recoverSession` to only handle tmux reattach (no ttyd relaunch):

```typescript
const recoverSession = useCallback(async (session: TabSession) => {
  updateSessionStatus(session.id, 'recovering');

  // Destroy old native session
  try { await TerminalEmulator.destroySession(session.nativeSessionId); } catch {}

  // Re-create (will reattach to existing tmux session)
  await createNativeSession(session);

  // Resume CLI if it was active
  if (session.activeCli) {
    const resumeCmd = buildRecoveryCommand(session.currentDir, session.activeCli);
    if (resumeCmd) {
      await sendKeysToSession(session.tmuxSession, resumeCmd, runRawCommand);
    }
  }
}, [createNativeSession, runRawCommand]);
```

- [ ] **Step 7: Update StatusBadge**

Map new `SessionStatus` to badge states:
- `'starting'` → yellow, "Starting..."
- `'alive'` → green, "Connected"
- `'exited'` → gray, "Session ended"
- `'recovering'` → orange, "Recovering..."

- [ ] **Step 8: Add useTerminalOutput hook call**

```typescript
// In the terminal screen component, before the return statement:
useTerminalOutput();
```

- [ ] **Step 9: Update TerminalHeader to support 4 tabs**

Change the tab limit check from 2 to 4.

- [ ] **Step 10: Remove WebView-related styles**

Remove `styles.webView` and any WebView-specific styling. Add `styles.terminalView` for the native view.

- [ ] **Step 11: Commit**

```bash
cd ~/Shelly
git add app/\(tabs\)/terminal.tsx lib/ttyd-manager.ts hooks/use-ttyd-connection.ts lib/phantom-process-guard.ts
git commit -m "feat: replace WebView+ttyd with NativeTerminalView in terminal.tsx"
```

---

### Task 9: Update start-shelly.sh

**Files:**
- Modify: `~/shelly-bridge/start-shelly.sh`

- [ ] **Step 1: Remove ttyd launch from start-shelly.sh**

Keep tmux setup and bridge server launch. Remove `ttyd -p 7681 -W tmux attach-session ...` line and any ttyd-related process killing.

- [ ] **Step 2: Add tmux allow-passthrough config**

Add `tmux set -g allow-passthrough on` to the tmux configuration section.

- [ ] **Step 3: Commit**

```bash
cd ~/Shelly
git add ~/shelly-bridge/start-shelly.sh
git commit -m "chore: remove ttyd from start-shelly.sh, add tmux passthrough config"
```

---

### Task 10: Integration Testing + Bug Fixes

**Files:** All modified files from previous tasks

- [ ] **Step 1: Trigger GitHub Actions build**

```bash
cd ~/Shelly && gh workflow run build-android.yml
```

Wait for build to complete. Download APK.

- [ ] **Step 2: Install and test basic functionality**

Test checklist:
1. App launches without crash
2. Terminal tab shows native terminal view
3. Can type commands and see output
4. CJK text renders correctly (no garbled characters)
5. New tab creates second session (up to 4)

- [ ] **Step 3: Test session persistence**

1. Run `claude` in terminal
2. Press home button, open another app
3. Wait 30 seconds
4. Return to Shelly
5. Verify terminal is not blank — tmux session preserved

- [ ] **Step 4: Test cross-pane intelligence**

1. Open split view (chat + terminal)
2. Run a command with an error in terminal
3. Verify chat can read terminal output
4. Test "Ask AI to fix" action

- [ ] **Step 5: Test Z Fold6 fold/unfold**

1. Open terminal on main screen
2. Fold to cover screen
3. Verify terminal resizes correctly
4. Unfold back to main screen
5. Verify no garbled text or blank screen

- [ ] **Step 6: Test fonts**

If settings UI for font selection exists, test switching between JetBrains Mono, Fira Code, and PixelMplus. Verify each renders correctly.

- [ ] **Step 7: Test all 30+ themes**

Cycle through themes in settings. Verify colors apply to native terminal view.

- [ ] **Step 8: Fix bugs found during testing**

Address any issues discovered. Commit each fix separately.

- [ ] **Step 9: Final commit**

```bash
cd ~/Shelly
git add -A
git commit -m "fix: integration testing bug fixes for native terminal view"
```

---

## Dependency Graph

```
Task 0 (NDK validation)
  ↓
Task 1 (vendor terminal-emulator)
  ↓
Task 2 (ShellyTerminalSession + ShellEnvironment)
  ↓
Task 3 (vendor terminal-view + fonts) ──→ Task 4 (FontManager, BlockDetector, LinkDetector)
  ↓                                              ↓
  └──────────────────────────────────────→ Task 5 (ShellyTerminalView + Expo Native View)
                                                   ↓
Task 6 (TypeScript integration) ←─────────────────┘
  ↓
Task 7 (Store types + migration)
  ↓
Task 8 (terminal.tsx rewrite)
  ↓
Task 9 (start-shelly.sh)
  ↓
Task 10 (Integration testing)
```

Tasks 0→1→2 are strictly sequential (each depends on previous).
Tasks 3 and 4 can partially overlap (font download is independent of view code).
Task 6 is independent of Tasks 3-5 and can be done in parallel.
Task 7 can be done in parallel with Tasks 3-5.
Tasks 8-10 must be sequential and depend on everything above.
