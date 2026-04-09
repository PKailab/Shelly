/**
 * lib/first-launch-setup.ts — First-launch CLI setup via real PTY
 *
 * On first launch, writes commands directly to the terminal PTY
 * to install and authenticate CLI tools. No fake overlay, no
 * pseudo-shell — just real terminal commands the user can see.
 *
 * Triggered once after the first PTY session becomes alive.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import TerminalEmulator from '@/modules/terminal-emulator/src/TerminalEmulatorModule';
import { logInfo } from '@/lib/debug-logger';

const SETUP_KEY = '@shelly/setup_wizard_complete';

/**
 * Check if first-launch setup has been completed.
 */
export async function isSetupComplete(): Promise<boolean> {
  const val = await AsyncStorage.getItem(SETUP_KEY);
  return val === 'true';
}

/**
 * Mark first-launch setup as complete.
 */
export async function markSetupComplete(): Promise<void> {
  await AsyncStorage.setItem(SETUP_KEY, 'true');
}

/**
 * Reset setup flag (for re-running from ConfigTUI).
 */
export async function resetSetup(): Promise<void> {
  await AsyncStorage.removeItem(SETUP_KEY);
}

/**
 * Run the first-launch setup sequence on the real PTY terminal.
 * Sends commands directly via writeToSession — user sees everything
 * in the actual terminal with real output.
 */
export async function runFirstLaunchSetup(sessionId: string): Promise<void> {
  const done = await isSetupComplete();
  if (done) return;

  logInfo('FirstLaunchSetup', 'Starting first-launch setup on session ' + sessionId);

  // Small delay to let the shell prompt appear
  await sleep(1200);

  // Configure npm to use Shelly's lib dir (not system /apex paths)
  await writeToTerminal(sessionId, 'export NPM_CONFIG_PREFIX="$HOME/.npm-global" && export PATH="$HOME/.npm-global/bin:$PATH" && mkdir -p "$HOME/.npm-global"');
  await sleep(300);

  // Write welcome message using printf (echo doesn't interpret ANSI escapes)
  await writeToTerminal(sessionId, `printf '\\n\\033[36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m\\n\\033[1;32m  Welcome to Shelly\\033[0m\\n\\033[36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m\\n\\n  Your terminal is ready. Let\\'s install AI coding tools.\\n  Each step is optional — press \\033[33mCtrl+C\\033[0m to skip any install.\\n\\n\\033[36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m\\n\\n'`);
  await sleep(500);

  // Step 1: Check what's already installed
  await writeToTerminal(sessionId, `printf '\\033[1;33m[1/3]\\033[0m Checking installed tools...\\n'`);
  await sleep(300);
  await writeToTerminal(sessionId, 'which claude 2>/dev/null && echo "  ✓ Claude Code already installed" || echo "  ✗ Claude Code not found"');
  await sleep(300);
  await writeToTerminal(sessionId, 'which gemini 2>/dev/null && echo "  ✓ Gemini CLI already installed" || echo "  ✗ Gemini CLI not found"');
  await sleep(300);
  await writeToTerminal(sessionId, 'which codex 2>/dev/null && echo "  ✓ Codex CLI already installed" || echo "  ✗ Codex CLI not found"');
  await sleep(500);

  // Step 2: Install Gemini CLI (free, recommended)
  await writeToTerminal(sessionId, 'echo ""');
  await writeToTerminal(sessionId, `printf '\\033[1;33m[2/3]\\033[0m Installing Gemini CLI (free)...\\n'`);
  await writeToTerminal(sessionId, 'echo "  Press Ctrl+C to skip"');
  await sleep(300);
  await writeToTerminal(sessionId, 'which gemini >/dev/null 2>&1 || npm install -g @google/gemini-cli');
  await sleep(500);

  // Step 3: Install Claude Code
  await writeToTerminal(sessionId, 'echo ""');
  await writeToTerminal(sessionId, `printf '\\033[1;33m[3/3]\\033[0m Installing Claude Code...\\n'`);
  await writeToTerminal(sessionId, 'echo "  Press Ctrl+C to skip"');
  await sleep(300);
  await writeToTerminal(sessionId, 'which claude >/dev/null 2>&1 || npm install -g @anthropic-ai/claude-code');
  await sleep(500);

  // Done
  await writeToTerminal(sessionId, `printf '\\n\\033[36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m\\n\\033[1;32m  Setup complete!\\033[0m\\n\\n  To authenticate:\\n    \\033[33mclaude auth login\\033[0m\\n    \\033[33mgemini auth login\\033[0m\\n\\n  To start coding:\\n    \\033[33mclaude\\033[0m  or  \\033[33mgemini\\033[0m\\n\\n  Run \\033[33mshelly setup\\033[0m anytime to re-run this setup.\\n\\033[36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m\\n\\n'`);

  // Mark complete
  await markSetupComplete();
  logInfo('FirstLaunchSetup', 'Setup complete, flag saved');
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function writeToTerminal(sessionId: string, command: string): Promise<void> {
  try {
    await TerminalEmulator.writeToSession(sessionId, command + '\n');
  } catch (e) {
    logInfo('FirstLaunchSetup', 'writeToSession failed: ' + e);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
