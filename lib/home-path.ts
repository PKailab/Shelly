/**
 * lib/home-path.ts — Dynamic HOME path resolution
 *
 * Shelly's HOME is NOT /data/data/com.termux/files/home (Termux legacy).
 * It's dynamically set by HomeInitializer.kt to context.filesDir/home,
 * which is typically /data/user/0/dev.shelly.terminal/files/home.
 *
 * This module fetches the real HOME once at startup via execCommand,
 * and provides it to all JS modules that need it.
 */

import { logInfo, logError } from '@/lib/debug-logger';

// Fallback: will be overwritten once execCommand resolves the real path
let cachedHome: string = '/data/user/0/dev.shelly.terminal/files/home';
let resolved = false;

/**
 * Initialize the HOME path by querying the native layer.
 * Call this once at app startup (e.g., in _layout.tsx).
 */
export async function initHomePath(): Promise<void> {
  if (resolved) return;
  try {
    const TerminalEmulator = require('@/modules/terminal-emulator/src/TerminalEmulatorModule').default;
    const result = await TerminalEmulator.execCommand('echo $HOME');
    const home = result.stdout?.trim();
    if (home && home.startsWith('/')) {
      cachedHome = home;
      resolved = true;
      logInfo('HomePath', 'Resolved: ' + cachedHome);
    }
  } catch (e: any) {
    logError('HomePath', 'Failed to resolve HOME, using fallback', e);
  }
}

/**
 * Get the current HOME path. Returns the resolved value if available,
 * otherwise the fallback.
 */
export function getHomePath(): string {
  return cachedHome;
}

/**
 * Check if HOME has been resolved from the native layer.
 */
export function isHomeResolved(): boolean {
  return resolved;
}
