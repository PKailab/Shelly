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
