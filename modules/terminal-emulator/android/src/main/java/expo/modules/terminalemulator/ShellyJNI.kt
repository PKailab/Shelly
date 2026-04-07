package expo.modules.terminalemulator

object ShellyJNI {
    init {
        System.loadLibrary("shelly-pty")
        System.loadLibrary("shelly-exec")
    }

    // ── PTY (interactive terminal) ──────────────────────────────────────────

    @JvmStatic
    external fun createSubprocess(
        linkerPath: String,
        bashPath: String,
        ldLibPath: String,
        homePath: String,
        rows: Int,
        cols: Int,
        resultArray: IntArray
    ): Int

    @JvmStatic
    external fun setPtyWindowSize(fd: Int, rows: Int, cols: Int)

    @JvmStatic
    external fun waitFor(pid: Int): Int

    @JvmStatic
    external fun close(fd: Int)

    // ── Exec (non-interactive command execution) ────────────────────────────

    /** Fork+exec a command, capture stdout/stderr, return [exitCode, stdout, stderr] */
    @JvmStatic
    external fun execSubprocess(
        linkerPath: String,
        bashPath: String,
        ldLibPath: String,
        homePath: String,
        command: String,
        timeoutMs: Int
    ): Array<String>
}
