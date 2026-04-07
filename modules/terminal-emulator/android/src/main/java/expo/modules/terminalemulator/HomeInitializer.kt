package expo.modules.terminalemulator

import android.content.Context
import java.io.File

object HomeInitializer {
    // Coreutils applets to create wrapper scripts for
    private val COREUTILS_APPLETS = listOf(
        "arch", "base32", "base64", "basename", "cat", "chgrp", "chmod", "chown",
        "cksum", "comm", "cp", "csplit", "cut", "date", "dd", "df", "dir", "dircolors",
        "dirname", "du", "echo", "env", "expand", "expr", "factor", "false", "fmt",
        "fold", "groups", "head", "hostid", "id", "install", "join", "kill", "link",
        "ln", "logname", "ls", "md5sum", "mkdir", "mkfifo", "mknod", "mktemp", "mv",
        "nice", "nl", "nohup", "nproc", "numfmt", "od", "paste", "pathchk", "pinky",
        "pr", "printenv", "printf", "pwd", "readlink", "realpath", "rm", "rmdir",
        "seq", "sha1sum", "sha224sum", "sha256sum", "sha384sum", "sha512sum",
        "shred", "shuf", "sleep", "sort", "split", "stat", "stty", "sum", "sync",
        "tac", "tail", "tee", "test", "timeout", "touch", "tr", "true", "truncate",
        "tsort", "tty", "uname", "unexpand", "uniq", "unlink", "users", "vdir",
        "wc", "who", "whoami", "yes"
    )

    fun getHomeDir(context: Context): File =
        File(context.filesDir, "home").also { it.mkdirs() }

    fun initialize(context: Context): File {
        val home = getHomeDir(context)
        val libDir = LibExtractor.getLibDir(context).absolutePath
        val binDir = File(context.filesDir, "bin")
        binDir.mkdirs()

        File(home, "projects").mkdirs()

        // Create .bashrc
        val bashrc = File(home, ".bashrc")
        if (!bashrc.exists()) {
            bashrc.writeText(
                "export HOME=\"${home.absolutePath}\"\n" +
                "export TERM=xterm-256color\n" +
                "export COLORTERM=truecolor\n" +
                "export LANG=en_US.UTF-8\n" +
                "export SHELL=\"$libDir/libbash.so\"\n" +
                "export PATH=\"${binDir.absolutePath}:$libDir:/system/bin:/vendor/bin\"\n" +
                "export LD_LIBRARY_PATH=\"$libDir\"\n" +
                "\n" +
                "# OSC 133 for command block detection\n" +
                "PS1='\\[\\e]133;A\\a\\]\\u@shelly:\\w\\\$ \\[\\e]133;B\\a\\]'\n" +
                "PROMPT_COMMAND='echo -ne \"\\033]133;D;\\\$?\\007\"'\n"
            )
        }

        // Create .profile
        val profile = File(home, ".profile")
        if (!profile.exists()) {
            profile.writeText("[ -f ~/.bashrc ] && . ~/.bashrc\n")
        }

        // Create wrapper scripts for node, git, and coreutils applets
        createWrapper(binDir, "node", libDir, "$libDir/node")
        createWrapper(binDir, "git", libDir, "$libDir/git")

        // Coreutils: each applet is a symlink-like wrapper that calls coreutils with applet name
        for (applet in COREUTILS_APPLETS) {
            val wrapper = File(binDir, applet)
            if (!wrapper.exists()) {
                wrapper.writeText(
                    "#!/system/bin/sh\n" +
                    "export LD_LIBRARY_PATH=\"$libDir\"\n" +
                    "exec /system/bin/linker64 $libDir/coreutils $applet \"\$@\"\n"
                )
                wrapper.setExecutable(true, false)
            }
        }

        return home
    }

    private fun createWrapper(binDir: File, name: String, libDir: String, binaryPath: String) {
        val wrapper = File(binDir, name)
        if (!wrapper.exists()) {
            wrapper.writeText(
                "#!/system/bin/sh\n" +
                "export LD_LIBRARY_PATH=\"$libDir\"\n" +
                "exec /system/bin/linker64 $binaryPath \"\$@\"\n"
            )
            wrapper.setExecutable(true, false)
        }
    }
}
