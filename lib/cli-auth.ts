/**
 * lib/cli-auth.ts — CLI Authentication Helper
 *
 * Manages authentication for CLI tools (Claude Code, Gemini CLI, Codex)
 * via the native exec layer. Handles:
 * - API key storage in SecureStore (expo-secure-store)
 * - OAuth URL extraction from CLI login output
 * - Auth status verification
 *
 * All Termux interaction happens through the native exec layer — the user
 * never touches Termux directly.
 */

import { saveApiKey, getApiKey, deleteApiKey } from '@/lib/secure-store';
import type { ApiKeyName } from '@/lib/secure-store';

export type AuthToolId = 'claude-code' | 'gemini-cli' | 'codex';

export type AuthMethod = 'browser' | 'api-key';

export type AuthStatus = 'authenticated' | 'not-authenticated' | 'not-installed' | 'checking';

export interface AuthToolConfig {
  id: AuthToolId;
  name: string;
  /** Environment variable name for API key */
  envVar: string;
  /** SecureStore key name for this tool's token */
  secureStoreKey: ApiKeyName;
  /** URL to get an API key */
  apiKeyUrl: string;
  /** Command to check if installed */
  checkInstalled: string;
  /** Command to start OAuth login (if supported) */
  loginCommand?: string;
  /** Color for UI */
  color: string;
  /** Icon name (MaterialIcons) */
  icon: string;
}

export const AUTH_TOOL_CONFIGS: AuthToolConfig[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    envVar: 'ANTHROPIC_API_KEY',
    secureStoreKey: 'claudeAuthToken',
    apiKeyUrl: 'https://console.anthropic.com/settings/keys',
    checkInstalled: 'which claude 2>/dev/null',
    loginCommand: 'claude auth login 2>&1',
    color: '#F59E0B',
    icon: 'code',
  },
  {
    id: 'gemini-cli',
    name: 'Gemini CLI',
    envVar: 'GEMINI_API_KEY',
    secureStoreKey: 'geminiAuthToken',
    apiKeyUrl: 'https://aistudio.google.com/app/apikey',
    checkInstalled: 'which gemini 2>/dev/null',
    loginCommand: 'gemini auth login 2>&1',
    color: '#3B82F6',
    icon: 'auto-awesome',
  },
  {
    id: 'codex',
    name: 'Codex CLI',
    envVar: 'OPENAI_API_KEY',
    secureStoreKey: 'codexAuthToken',
    apiKeyUrl: 'https://platform.openai.com/api-keys',
    checkInstalled: 'which codex 2>/dev/null',
    loginCommand: 'codex login 2>&1',
    color: '#10B981',
    icon: 'terminal',
  },
];

/** Type for the bridge command runner */
export type AuthCommandRunner = (
  cmd: string,
  opts?: { timeoutMs?: number; onStream?: (type: 'stdout' | 'stderr', data: string) => void },
) => Promise<{ stdout: string; stderr: string; exitCode: number }>;

/**
 * Check authentication status of a tool.
 * CLI presence is verified via `which <tool>`.
 * Token presence is verified via SecureStore.
 */
export async function checkAuthStatus(
  toolId: AuthToolId,
  runCommand: AuthCommandRunner,
): Promise<AuthStatus> {
  const config = AUTH_TOOL_CONFIGS.find((c) => c.id === toolId);
  if (!config) return 'not-installed';

  try {
    // Check if the CLI binary is present
    const installCheck = await runCommand(config.checkInstalled, { timeoutMs: 5000 });
    if (installCheck.exitCode !== 0 || !installCheck.stdout?.trim()) return 'not-installed';

    // Check token in SecureStore
    const token = await getApiKey(config.secureStoreKey);
    return token ? 'authenticated' : 'not-authenticated';
  } catch {
    return 'not-installed';
  }
}

/**
 * Check auth status for all tools at once.
 */
export async function checkAllAuthStatus(
  runCommand: AuthCommandRunner,
): Promise<Record<AuthToolId, AuthStatus>> {
  const results: Record<string, AuthStatus> = {};
  for (const config of AUTH_TOOL_CONFIGS) {
    results[config.id] = await checkAuthStatus(config.id, runCommand);
  }
  return results as Record<AuthToolId, AuthStatus>;
}

/**
 * Store an API key in SecureStore.
 */
export async function storeApiKey(
  toolId: AuthToolId,
  apiKey: string,
  _runCommand: AuthCommandRunner,
): Promise<{ success: boolean; error?: string }> {
  const config = AUTH_TOOL_CONFIGS.find((c) => c.id === toolId);
  if (!config) return { success: false, error: 'Unknown tool' };

  try {
    await saveApiKey(config.secureStoreKey, apiKey);
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

/**
 * Remove an API key from SecureStore.
 */
export async function removeApiKey(
  toolId: AuthToolId,
  _runCommand: AuthCommandRunner,
): Promise<{ success: boolean }> {
  const config = AUTH_TOOL_CONFIGS.find((c) => c.id === toolId);
  if (!config) return { success: false };

  try {
    await deleteApiKey(config.secureStoreKey);
    return { success: true };
  } catch {
    return { success: false };
  }
}

/**
 * Verify that a stored API key actually works by checking auth status.
 */
export async function verifyAuth(
  toolId: AuthToolId,
  runCommand: AuthCommandRunner,
): Promise<boolean> {
  const status = await checkAuthStatus(toolId, runCommand);
  return status === 'authenticated';
}

/**
 * Extract an OAuth URL from CLI login command output.
 * Claude Code outputs a URL during `claude auth login`.
 */
export function extractOAuthUrl(output: string): string | null {
  // Match common URL patterns from CLI output
  const urlMatch = output.match(/https?:\/\/[^\s"'<>]+/);
  return urlMatch ? urlMatch[0] : null;
}

/**
 * Get the config for a tool.
 */
export function getAuthToolConfig(toolId: AuthToolId): AuthToolConfig | undefined {
  return AUTH_TOOL_CONFIGS.find((c) => c.id === toolId);
}
