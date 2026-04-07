# Plan B Phase 1: JNI forkpty + linker64 Bash Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shellyアプリ単体でbashターミナルセッションを動作させる（Termux不要）

**Architecture:** JNI forkptyでPTY作成 → linker64経由でAPK同梱bashを実行 → PTY fdをKotlin/TerminalSessionに接続。TCP/WebSocket/pty-helper/bridge.jsを全排除。

**Tech Stack:** Kotlin, C (JNI/NDK), CMake, Expo Native Module, React Native

**Spec:** `docs/superpowers/specs/2026-04-07-plan-b-termux-free-terminal-design.md`

---

## File Structure

### 新規作成
| File | Responsibility |
|------|---------------|
| `modules/terminal-emulator/android/src/main/jni/shelly-pty.c` | JNI: forkpty + linker64 execve + resize + waitFor + close |
| `modules/terminal-emulator/android/src/main/java/expo/modules/terminalemulator/ShellyJNI.kt` | JNIネイティブメソッド宣言 |
| `modules/terminal-emulator/android/src/main/java/expo/modules/terminalemulator/LibExtractor.kt` | APKからバイナリ抽出 |
| `modules/terminal-emulator/android/src/main/java/expo/modules/terminalemulator/HomeInitializer.kt` | ホームディレクトリ初期化 (.bashrc, .profile) |

### 変更
| File | Change |
|------|--------|
| `modules/terminal-emulator/android/CMakeLists.txt` | shelly-pty.cをビルドターゲットに追加 |
| `modules/terminal-emulator/android/src/main/java/expo/modules/terminalemulator/ShellyTerminalSession.kt` | TCP Socket → PTY fd直接I/O |
| `modules/terminal-emulator/android/src/main/java/expo/modules/terminalemulator/TerminalEmulatorModule.kt` | createSessionをJNI forkpty方式に変更 |
| `modules/terminal-emulator/src/TerminalEmulatorModule.ts` | SessionConfigからport削除 |
| `app/(tabs)/terminal.tsx` | pty-helper起動/TCP接続ロジック削除、シンプルなcreateSession呼び出し |
| `store/terminal-store.ts` | tmux依存削除、ポート割り当て削除 |

---

## Task 1: JNI — shelly-pty.c

**Files:**
- Create: `modules/terminal-emulator/android/src/main/jni/shelly-pty.c`
- Modify: `modules/terminal-emulator/android/CMakeLists.txt`

- [ ] **Step 1: CMakeLists.txtにshelly-ptyターゲット追加**

```cmake
cmake_minimum_required(VERSION 3.18.1)
project(termux)

add_library(termux SHARED src/main/jni/termux.c)
target_link_libraries(termux log)

add_library(shelly-pty SHARED src/main/jni/shelly-pty.c)
target_link_libraries(shelly-pty log)
```

- [ ] **Step 2: shelly-pty.cを作成**

linker64経由でbashをforkpty実行するJNI関数群。既存のtermux.cを参考にするが、`execve`を`/system/bin/linker64`経由にする。

```c
#include <jni.h>
#include <stdlib.h>
#include <unistd.h>
#include <fcntl.h>
#include <errno.h>
#include <string.h>
#include <signal.h>
#include <sys/ioctl.h>
#include <sys/wait.h>
#include <termios.h>
#include <android/log.h>

#define LOG_TAG "ShellyPTY"
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)

// Open /dev/ptmx, configure, fork, exec linker64+bash
JNIEXPORT jint JNICALL
Java_expo_modules_terminalemulator_ShellyJNI_createSubprocess(
    JNIEnv *env, jclass clazz,
    jstring jLinkerPath,   // "/system/bin/linker64"
    jstring jBashPath,     // ".../termux-libs/libbash.so"
    jstring jLdLibPath,    // ".../termux-libs"
    jstring jHomePath,     // ".../files/home"
    jint rows, jint cols,
    jintArray jResultArray // [masterFd, childPid]
) {
    const char *linkerPath = (*env)->GetStringUTFChars(env, jLinkerPath, NULL);
    const char *bashPath = (*env)->GetStringUTFChars(env, jBashPath, NULL);
    const char *ldLibPath = (*env)->GetStringUTFChars(env, jLdLibPath, NULL);
    const char *homePath = (*env)->GetStringUTFChars(env, jHomePath, NULL);

    // Open PTM
    int ptm = open("/dev/ptmx", O_RDWR | O_CLOEXEC);
    if (ptm < 0) {
        LOGE("open /dev/ptmx failed: %s", strerror(errno));
        goto cleanup;
    }
    if (grantpt(ptm) || unlockpt(ptm)) {
        LOGE("grantpt/unlockpt failed: %s", strerror(errno));
        close(ptm);
        ptm = -1;
        goto cleanup;
    }

    // Get PTS name
    char ptsName[64];
    if (ptsname_r(ptm, ptsName, sizeof(ptsName))) {
        LOGE("ptsname_r failed: %s", strerror(errno));
        close(ptm);
        ptm = -1;
        goto cleanup;
    }

    // Set window size
    struct winsize ws = { .ws_row = rows, .ws_col = cols };
    ioctl(ptm, TIOCSWINSZ, &ws);

    // Enable UTF-8
    struct termios tios;
    if (tcgetattr(ptm, &tios) == 0) {
        tios.c_iflag |= IUTF8;
        tcsetattr(ptm, TCSANOW, &tios);
    }

    pid_t pid = fork();
    if (pid < 0) {
        LOGE("fork failed: %s", strerror(errno));
        close(ptm);
        ptm = -1;
        goto cleanup;
    }

    if (pid == 0) {
        // === Child process ===
        close(ptm);
        setsid();

        int pts = open(ptsName, O_RDWR);
        if (pts < 0) _exit(1);

        dup2(pts, 0);
        dup2(pts, 1);
        dup2(pts, 2);
        if (pts > 2) close(pts);

        // Close all other fds
        for (int i = 3; i < 64; i++) close(i);

        // Reset signals
        struct sigaction sa;
        memset(&sa, 0, sizeof(sa));
        sa.sa_handler = SIG_DFL;
        for (int i = 1; i < 32; i++) sigaction(i, &sa, NULL);

        // Set environment
        clearenv();
        setenv("HOME", homePath, 1);
        setenv("TERM", "xterm-256color", 1);
        setenv("COLORTERM", "truecolor", 1);
        setenv("LANG", "en_US.UTF-8", 1);
        setenv("LD_LIBRARY_PATH", ldLibPath, 1);
        setenv("SHELL", bashPath, 1);

        // Build PATH: ldLibPath + /system/bin
        char pathBuf[512];
        snprintf(pathBuf, sizeof(pathBuf), "%s:/system/bin:/vendor/bin", ldLibPath);
        setenv("PATH", pathBuf, 1);

        chdir(homePath);

        // Exec: linker64 bash --login
        char *argv[] = {(char *)linkerPath, (char *)bashPath, "--login", NULL};
        execve(linkerPath, argv, environ);

        // If execve fails
        LOGE("execve failed: %s", strerror(errno));
        _exit(127);
    }

    // === Parent process ===
    LOGI("Created subprocess pid=%d masterFd=%d", pid, ptm);

    {
        jint result[2] = { ptm, pid };
        (*env)->SetIntArrayRegion(env, jResultArray, 0, 2, result);
    }

cleanup:
    (*env)->ReleaseStringUTFChars(env, jLinkerPath, linkerPath);
    (*env)->ReleaseStringUTFChars(env, jBashPath, bashPath);
    (*env)->ReleaseStringUTFChars(env, jLdLibPath, ldLibPath);
    (*env)->ReleaseStringUTFChars(env, jHomePath, homePath);
    return ptm;
}

JNIEXPORT void JNICALL
Java_expo_modules_terminalemulator_ShellyJNI_setPtyWindowSize(
    JNIEnv *env, jclass clazz,
    jint fd, jint rows, jint cols
) {
    struct winsize ws = { .ws_row = rows, .ws_col = cols };
    if (ioctl(fd, TIOCSWINSZ, &ws) < 0) {
        LOGE("TIOCSWINSZ failed: %s", strerror(errno));
    }
}

JNIEXPORT jint JNICALL
Java_expo_modules_terminalemulator_ShellyJNI_waitFor(
    JNIEnv *env, jclass clazz, jint pid
) {
    int status;
    while (waitpid(pid, &status, 0) == -1) {
        if (errno != EINTR) return -1;
    }
    if (WIFEXITED(status)) return WEXITSTATUS(status);
    if (WIFSIGNALED(status)) return -(WTERMSIG(status));
    return -1;
}

JNIEXPORT void JNICALL
Java_expo_modules_terminalemulator_ShellyJNI_close(
    JNIEnv *env, jclass clazz, jint fd
) {
    close(fd);
}
```

- [ ] **Step 3: ビルド確認**

Run: `cd ~/Shelly && npx expo prebuild --platform android --clean 2>&1 | tail -5`
Expected: no CMake errors

- [ ] **Step 4: Commit**

```bash
git add modules/terminal-emulator/android/CMakeLists.txt \
       modules/terminal-emulator/android/src/main/jni/shelly-pty.c
git commit -m "feat(phase1): add shelly-pty.c JNI — forkpty + linker64 execve"
```

---

## Task 2: Kotlin — ShellyJNI.kt + LibExtractor.kt + HomeInitializer.kt

**Files:**
- Create: `modules/terminal-emulator/android/src/main/java/expo/modules/terminalemulator/ShellyJNI.kt`
- Create: `modules/terminal-emulator/android/src/main/java/expo/modules/terminalemulator/LibExtractor.kt`
- Create: `modules/terminal-emulator/android/src/main/java/expo/modules/terminalemulator/HomeInitializer.kt`

- [ ] **Step 1: ShellyJNI.kt — JNIブリッジクラス**

```kotlin
package expo.modules.terminalemulator

object ShellyJNI {
    init {
        System.loadLibrary("shelly-pty")
    }

    @JvmStatic
    external fun createSubprocess(
        linkerPath: String,
        bashPath: String,
        ldLibPath: String,
        homePath: String,
        rows: Int,
        cols: Int,
        resultArray: IntArray  // [masterFd, childPid]
    ): Int

    @JvmStatic
    external fun setPtyWindowSize(fd: Int, rows: Int, cols: Int)

    @JvmStatic
    external fun waitFor(pid: Int): Int

    @JvmStatic
    external fun close(fd: Int)
}
```

- [ ] **Step 2: LibExtractor.kt — APKバイナリ抽出**

testExecveの抽出ロジックを汎用化。

```kotlin
package expo.modules.terminalemulator

import android.content.Context
import java.io.File
import java.util.zip.ZipFile

object LibExtractor {
    private val LIBS = mapOf(
        "lib/arm64-v8a/libbash.so" to "libbash.so",
        "lib/arm64-v8a/libandroid-support.so" to "libandroid-support.so",
        "lib/arm64-v8a/libiconv.so" to "libiconv.so",
        "lib/arm64-v8a/libreadline8.so" to "libreadline.so.8",
        "lib/arm64-v8a/libncursesw6.so" to "libncursesw.so.6"
    )

    fun getLibDir(context: Context): File =
        File(context.filesDir, "termux-libs").also { it.mkdirs() }

    fun getBashPath(context: Context): String =
        File(getLibDir(context), "libbash.so").absolutePath

    fun extractAll(context: Context): File {
        val libDir = getLibDir(context)
        val apkPath = context.applicationInfo.sourceDir
        val zipFile = ZipFile(apkPath)
        try {
            for ((apkEntry, fileName) in LIBS) {
                val outFile = File(libDir, fileName)
                if (outFile.exists() && outFile.length() > 0) continue
                val entry = zipFile.getEntry(apkEntry) ?: continue
                zipFile.getInputStream(entry).use { input ->
                    outFile.outputStream().use { output ->
                        input.copyTo(output)
                    }
                }
                outFile.setExecutable(true, false)
            }
        } finally {
            zipFile.close()
        }
        return libDir
    }
}
```

- [ ] **Step 3: HomeInitializer.kt — ホームディレクトリ初期化**

```kotlin
package expo.modules.terminalemulator

import android.content.Context
import java.io.File

object HomeInitializer {
    fun getHomeDir(context: Context): File =
        File(context.filesDir, "home").also { it.mkdirs() }

    fun initialize(context: Context): File {
        val home = getHomeDir(context)
        val projectsDir = File(home, "projects")
        projectsDir.mkdirs()

        val bashrc = File(home, ".bashrc")
        if (!bashrc.exists()) {
            val libDir = LibExtractor.getLibDir(context).absolutePath
            bashrc.writeText("""
                export HOME="${home.absolutePath}"
                export TERM=xterm-256color
                export COLORTERM=truecolor
                export LANG=en_US.UTF-8
                export SHELL="$libDir/libbash.so"
                export PATH="$libDir:/system/bin:/vendor/bin"
                export LD_LIBRARY_PATH="$libDir"

                # OSC 133 for command block detection
                PS1='\[\e]133;A\a\]\u@shelly:\w\$ \[\e]133;B\a\]'
                PROMPT_COMMAND='echo -ne "\033]133;D;\$?\007"'
            """.trimIndent() + "\n")
        }

        val profile = File(home, ".profile")
        if (!profile.exists()) {
            profile.writeText("""
                [ -f ~/.bashrc ] && . ~/.bashrc
            """.trimIndent() + "\n")
        }

        return home
    }
}
```

- [ ] **Step 4: Commit**

```bash
git add modules/terminal-emulator/android/src/main/java/expo/modules/terminalemulator/ShellyJNI.kt \
       modules/terminal-emulator/android/src/main/java/expo/modules/terminalemulator/LibExtractor.kt \
       modules/terminal-emulator/android/src/main/java/expo/modules/terminalemulator/HomeInitializer.kt
git commit -m "feat(phase1): add ShellyJNI, LibExtractor, HomeInitializer"
```

---

## Task 3: ShellyTerminalSession.kt — TCP → PTY fd直接I/O

**Files:**
- Modify: `modules/terminal-emulator/android/src/main/java/expo/modules/terminalemulator/ShellyTerminalSession.kt`

現在389行のTCPソケット方式を、PTY fd直接I/O方式に書き換える。

- [ ] **Step 1: ShellyTerminalSession.ktを書き換え**

TCP接続、heartbeat、reconnect、pty-helperのresize escapeを全て削除。
PTY fdからの直接read/writeに置き換え。

```kotlin
package expo.modules.terminalemulator

import android.os.Handler
import android.os.Looper
import com.termux.terminal.TerminalEmulator
import com.termux.terminal.TerminalSession
import com.termux.terminal.TerminalSessionClient
import expo.modules.kotlin.AppContext
import java.io.FileDescriptor
import java.io.FileInputStream
import java.io.FileOutputStream
import java.lang.reflect.Field

class ShellyTerminalSession(
    val sessionId: String,
    private val emitEvent: (String, Map<String, Any?>) -> Unit,
    private val masterFd: Int,
    private val childPid: Int,
    rows: Int,
    cols: Int,
    appContext: AppContext
) : TerminalSessionClient {
    val terminalSession: TerminalSession
    private val mainHandler = Handler(Looper.getMainLooper())
    private val outputBuffer = StringBuilder()
    private val flushRunnable = Runnable { flushOutputBuffer() }
    private var lastTranscriptLength = 0
    var onScreenUpdate: (() -> Unit)? = null

    // I/O streams from PTY master fd
    private val inputStream: FileInputStream
    private val outputStream: FileOutputStream
    private val readerThread: Thread
    private val waitThread: Thread

    init {
        // Create FileDescriptor from raw fd
        val fdField: Field = FileDescriptor::class.java.getDeclaredField("descriptor")
        fdField.isAccessible = true
        val fd = FileDescriptor()
        fdField.setInt(fd, masterFd)

        inputStream = FileInputStream(fd)
        outputStream = FileOutputStream(fd)

        // Create TerminalSession with streams
        terminalSession = TerminalSession("", "", arrayOfNulls(0), arrayOfNulls(0), intArrayOf(), this)
        terminalSession.initializeWithStreams(inputStream, outputStream, cols, rows, 1, 1)

        // Reader thread: read from PTY fd → emulator
        // (handled by TerminalSession internally via initializeWithStreams)

        // Wait thread: detect child exit
        waitThread = Thread({
            val exitCode = ShellyJNI.waitFor(childPid)
            mainHandler.post {
                emitEvent("onSessionExit", mapOf(
                    "sessionId" to sessionId,
                    "exitCode" to exitCode
                ))
            }
        }, "WaitFor-$sessionId").apply {
            isDaemon = true
            start()
        }

        // Dummy reader thread reference (TerminalSession handles reading)
        readerThread = Thread.currentThread() // placeholder
    }

    // --- Output Buffering (16ms batching) ---

    private fun appendToOutputBuffer(text: String) {
        synchronized(outputBuffer) {
            if (outputBuffer.length > 65536) {
                outputBuffer.delete(0, outputBuffer.length - 32768)
            }
            outputBuffer.append(text)
        }
        mainHandler.removeCallbacks(flushRunnable)
        mainHandler.postDelayed(flushRunnable, 16)
    }

    private fun flushOutputBuffer() {
        val text: String
        synchronized(outputBuffer) {
            if (outputBuffer.isEmpty()) return
            text = outputBuffer.toString()
            outputBuffer.clear()
        }
        emitEvent("onSessionOutput", mapOf(
            "sessionId" to sessionId,
            "data" to text
        ))
    }

    // --- Public API ---

    fun write(data: String) {
        terminalSession.write(data)
    }

    fun resize(rows: Int, cols: Int) {
        ShellyJNI.setPtyWindowSize(masterFd, rows, cols)
        terminalSession.updateSize(cols, rows, 1, 1)
    }

    fun isAlive(): Boolean {
        return try {
            // Check if process is still running
            android.os.Process.getUidForPid(childPid) != -1
        } catch (_: Exception) {
            false
        }
    }

    fun hasEmulator(): Boolean = terminalSession.emulator != null

    fun getTitle(): String = terminalSession.title ?: ""

    fun writeToEmulator(text: String) {
        terminalSession.emulator?.append(text.toByteArray(), text.length)
    }

    fun getTranscriptText(maxLines: Int): String {
        val emulator = terminalSession.emulator ?: return ""
        val transcript = emulator.screen.getTranscriptText()
        if (maxLines <= 0) return transcript
        val lines = transcript.split("\n")
        return lines.takeLast(maxLines).joinToString("\n")
    }

    fun destroy() {
        mainHandler.removeCallbacks(flushRunnable)
        flushOutputBuffer()
        try { ShellyJNI.close(masterFd) } catch (_: Exception) {}
        try {
            android.os.Process.killProcess(childPid)
        } catch (_: Exception) {}
        terminalSession.finishIfRunning()
    }

    // --- TerminalSessionClient ---

    override fun onTextChanged(changedSession: TerminalSession) {
        val emulator = changedSession.emulator ?: return
        val newLength = emulator.screen.activeTranscriptRows
        if (newLength > lastTranscriptLength) {
            val transcript = emulator.screen.getTranscriptText()
            val newContent = if (lastTranscriptLength == 0) transcript
                else transcript.substring(transcript.lastIndexOf('\n', transcript.length - 2).coerceAtLeast(0))
            appendToOutputBuffer(newContent)
            lastTranscriptLength = newLength
        }
        onScreenUpdate?.invoke()
    }

    override fun onTitleChanged(changedSession: TerminalSession) {
        emitEvent("onTitleChanged", mapOf(
            "sessionId" to sessionId,
            "title" to (changedSession.title ?: "")
        ))
    }

    override fun onSessionFinished(finishedSession: TerminalSession) {
        emitEvent("onSessionExit", mapOf(
            "sessionId" to sessionId,
            "exitCode" to 0
        ))
    }

    override fun onCopyTextToClipboard(session: TerminalSession, text: String?) {}
    override fun onPasteTextFromClipboard(session: TerminalSession?) {}

    override fun onBell(session: TerminalSession) {
        emitEvent("onBell", mapOf("sessionId" to sessionId))
    }

    override fun onColorsChanged(session: TerminalSession) {}
    override fun onTerminalCursorStateChange(state: Boolean) {}
    override fun setTerminalShellPid(session: TerminalSession, pid: Int) {}
    override fun getTerminalCursorStyle(): Int = 0
    override fun logError(tag: String?, message: String?) {
        if (tag != null && message != null) {
            android.util.Log.e("ShellyTerm", "$tag: $message")
        }
    }
    override fun logWarn(tag: String?, message: String?) {}
    override fun logInfo(tag: String?, message: String?) {}
    override fun logDebug(tag: String?, message: String?) {}
    override fun logVerbose(tag: String?, message: String?) {}
    override fun logStackTraceWithMessage(tag: String?, message: String?, e: Exception?) {}
    override fun logStackTrace(tag: String?, e: Exception?) {}
}
```

- [ ] **Step 2: Commit**

```bash
git add -f modules/terminal-emulator/android/src/main/java/expo/modules/terminalemulator/ShellyTerminalSession.kt
git commit -m "feat(phase1): rewrite ShellyTerminalSession — TCP → PTY fd direct I/O"
```

---

## Task 4: TerminalEmulatorModule.kt — createSession変更

**Files:**
- Modify: `modules/terminal-emulator/android/src/main/java/expo/modules/terminalemulator/TerminalEmulatorModule.kt`

- [ ] **Step 1: createSessionをJNI forkpty方式に変更**

`port`パラメータを削除。lib抽出 → ホーム初期化 → JNI forkpty → セッション作成。

変更箇所: `createSession` AsyncFunction (現在lines 65-92)

```kotlin
AsyncFunction("createSession") { config: Map<String, Any?> ->
    val sessionId = config["sessionId"] as? String ?: return@AsyncFunction null
    val rows = (config["rows"] as? Number)?.toInt() ?: 24
    val cols = (config["cols"] as? Number)?.toInt() ?: 80
    val context = appContext.reactContext ?: return@AsyncFunction null

    // Extract libs & initialize home
    val libDir = LibExtractor.extractAll(context)
    val homeDir = HomeInitializer.initialize(context)

    // Create PTY via JNI
    val resultArray = IntArray(2)
    ShellyJNI.createSubprocess(
        "/system/bin/linker64",
        LibExtractor.getBashPath(context),
        libDir.absolutePath,
        homeDir.absolutePath,
        rows, cols,
        resultArray
    )
    val masterFd = resultArray[0]
    val childPid = resultArray[1]

    if (masterFd < 0) {
        return@AsyncFunction null
    }

    val session = ShellyTerminalSession(
        sessionId = sessionId,
        emitEvent = { name, data -> sendEvent(name, data) },
        masterFd = masterFd,
        childPid = childPid,
        rows = rows,
        cols = cols,
        appContext = appContext
    )
    sessionRegistry[sessionId] = session

    // WakeLock
    acquireWakeLock(context)

    sessionId
}
```

- [ ] **Step 2: resizeSessionの変更**

```kotlin
AsyncFunction("resizeSession") { sessionId: String, rows: Int, cols: Int ->
    val session = sessionRegistry[sessionId] ?: return@AsyncFunction null
    session.resize(rows, cols)
    null
}
```

- [ ] **Step 3: testExecve関数をクリーンアップ**

Phase 0のデバッグ用Alert.alertとdiagnosticsを削除。linker64動作確認だけ残す（起動時チェック用）。

- [ ] **Step 4: Commit**

```bash
git add -f modules/terminal-emulator/android/src/main/java/expo/modules/terminalemulator/TerminalEmulatorModule.kt
git commit -m "feat(phase1): TerminalEmulatorModule — JNI forkpty createSession"
```

---

## Task 5: TypeScript — SessionConfig変更 + terminal.tsx簡素化

**Files:**
- Modify: `modules/terminal-emulator/src/TerminalEmulatorModule.ts`
- Modify: `app/(tabs)/terminal.tsx`
- Modify: `store/terminal-store.ts`

- [ ] **Step 1: TerminalEmulatorModule.ts — portを削除**

```typescript
interface SessionConfig {
  sessionId: string;
  rows?: number;
  cols?: number;
}
```

- [ ] **Step 2: terminal-store.ts — tmux/port依存を削除**

- `TMUX_NAMES`, `PTY_BASE_PORT`, `getPtyPort()` を削除
- `createSession()`から`tmuxName`パラメータ削除
- `TabSession`型から`tmuxSession`フィールド削除
- `_pendingTmuxKills`, `_pendingTmuxClears` 削除

- [ ] **Step 3: terminal.tsx — createNativeSession簡素化**

現在の949行 → pty-helper起動、TCP接続ポーリング、bridge通信を全削除。

```typescript
async function createNativeSession(session: TabSession) {
  if (creatingSessionRef.current[session.id]) return;
  creatingSessionRef.current[session.id] = true;

  try {
    // Check if session already has emulator buffer
    const hasEmulator = await TerminalEmulator.hasEmulator(session.nativeSessionId);
    if (hasEmulator) {
      updateSession(session.id, { sessionStatus: 'alive', isAlive: true });
      return;
    }

    // Destroy stale session if exists
    try { await TerminalEmulator.destroySession(session.nativeSessionId); } catch (_) {}

    // Create new session — JNI forkpty handles everything
    await TerminalEmulator.createSession({
      sessionId: session.nativeSessionId,
      rows: 24,
      cols: 80,
    });

    // Start foreground service
    await TerminalEmulator.startSessionService();

    updateSession(session.id, { sessionStatus: 'alive', isAlive: true });
  } catch (e) {
    console.error('[Terminal] createNativeSession failed:', e);
    updateSession(session.id, { sessionStatus: 'error' });
  } finally {
    creatingSessionRef.current[session.id] = false;
  }
}
```

- [ ] **Step 4: terminal.tsx — ensureNativeSessions簡素化**

bridgeStatus依存を削除。アプリ起動時・フォアグラウンド復帰時にセッション確認。

- [ ] **Step 5: terminal.tsx — recoverSession/resetSession簡素化**

pty-helper kill/TCP接続確認を削除。destroySession → createSessionのシンプルフロー。

- [ ] **Step 6: Commit**

```bash
git add modules/terminal-emulator/src/TerminalEmulatorModule.ts \
       app/(tabs)/terminal.tsx \
       store/terminal-store.ts
git commit -m "feat(phase1): simplify terminal.tsx — remove TCP/bridge/pty-helper"
```

---

## Task 6: _layout.tsx — Phase 0テスト削除 + linker64チェック

**Files:**
- Modify: `app/_layout.tsx`

- [ ] **Step 1: Phase 0 Alert.alertテストを削除**

起動時のtestExecve + Alertポップアップを削除。代わりに、初回起動時のlib抽出だけ行う（バックグラウンドで）。

```typescript
// Phase 0 test → 削除
// 代わりに初回lib抽出（createSession内で自動実行されるので不要）
```

- [ ] **Step 2: Commit**

```bash
git add app/_layout.tsx
git commit -m "chore(phase1): remove Phase 0 debug Alert from _layout.tsx"
```

---

## Task 7: ビルド + 実機テスト

**Files:** None (テストのみ)

- [ ] **Step 1: git pushしてCIビルド**

```bash
git push
```

- [ ] **Step 2: ビルド完了後、APKをインストール**

```bash
gh run download <run-id> --dir ~/Downloads/shelly-latest
adb install -r ~/Downloads/shelly-latest/shelly-apk/app-release.apk
```

- [ ] **Step 3: Shellyを起動してTerminalタブを開く**

確認事項:
- [ ] bashプロンプトが表示される
- [ ] `ls`等のコマンドが実行できる
- [ ] 出力が正常に表示される
- [ ] Ctrl+C/Ctrl+Dが動作する
- [ ] 画面回転/Fold開閉でリサイズが反映される
- [ ] アプリバックグラウンド → フォアグラウンドでセッション維持
- [ ] `exit`でセッション終了検知

- [ ] **Step 4: logcatで確認**

```bash
adb logcat -s "ShellyPTY:*" "ReactNativeJS:*" --pid=$(adb shell pidof space.manus.shelly.terminal.t20260224103125)
```

- [ ] **Step 5: 問題があれば修正してコミット**

---

## Task 8: 不要コード削除（Phase 1完了確認後）

**Files:**
- Delete: `hooks/use-termux-bridge.ts`
- Delete: `shelly-bridge/` directory
- Delete: `modules/termux-bridge/` directory
- Delete: `lib/tmux-manager.ts`
- Modify: Settings画面からTermux接続セクション削除
- Modify: SetupWizardからTermux関連ステップ削除

- [ ] **Step 1: 動作確認完了を確認**

Phase 1の実機テスト（Task 7）が全て通っていることを確認。

- [ ] **Step 2: 不要ファイル削除**

```bash
rm -rf hooks/use-termux-bridge.ts
rm -rf shelly-bridge/
rm -rf modules/termux-bridge/
rm -f lib/tmux-manager.ts
```

- [ ] **Step 3: 参照箇所のクリーンアップ**

削除したファイルをimportしている箇所を全て修正。

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(phase1): remove Termux bridge/tmux/pty-helper legacy code"
```
