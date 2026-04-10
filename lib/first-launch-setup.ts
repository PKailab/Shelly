/**
 * lib/first-launch-setup.ts — First-launch MOTD via real PTY
 *
 * On first launch, displays a simple welcome message with info
 * about pre-installed CLI tools. No wizard, no install steps.
 * CLIs are bundled in the APK and ready to use immediately.
 *
 * Triggered once after the first PTY session becomes alive.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import TerminalEmulator from '@/modules/terminal-emulator/src/TerminalEmulatorModule';
import { logInfo } from '@/lib/debug-logger';
import { t } from '@/lib/i18n';

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
 * Reset setup flag (for re-running via `shelly setup`).
 */
export async function resetSetup(): Promise<void> {
  await AsyncStorage.removeItem(SETUP_KEY);
}

/**
 * Show a simple welcome MOTD on first launch.
 * CLIs are pre-installed — just tell the user they're ready.
 */
export async function runFirstLaunchSetup(sessionId: string): Promise<void> {
  const done = await isSetupComplete();
  if (done) return;

  logInfo('FirstLaunchSetup', 'MOTD now handled by .bashrc — marking complete');

  // MOTD is now displayed by .bashrc on first launch (checks ~/.shelly_motd_shown)
  // This function just marks the TS-side flag as complete
  await markSetupComplete();
  logInfo('FirstLaunchSetup', 'Setup flag saved');
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
