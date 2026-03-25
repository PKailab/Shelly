/**
 * lib/git-advisor.ts — Monitors savepoint accumulation and suggests GitHub sync.
 *
 * Checks unpushed savepoints, elapsed time, and file changes
 * to determine when to nudge the user toward syncing with GitHub.
 */

export interface GitAdvisorConfig {
  accumulatedSavesThreshold: number; // default: 5
  suggestOnProjectCreation: boolean; // default: true
  largeChangeThreshold: number; // default: 10
  unpushedDurationMs: number; // default: 3600000 (1 hour)
}

export const DEFAULT_CONFIG: GitAdvisorConfig = {
  accumulatedSavesThreshold: 5,
  suggestOnProjectCreation: true,
  largeChangeThreshold: 10,
  unpushedDurationMs: 3_600_000,
};

/** Minimum interval between suggestions (1 hour) */
const MIN_SUGGESTION_INTERVAL_MS = 3_600_000;

/**
 * Determine whether we should suggest a push to GitHub.
 */
export function shouldSuggestPush(params: {
  unpushedSaveCount: number;
  lastPushTime: number | null;
  lastSuggestionTime: number | null;
  filesChanged: number;
  isGithubConfigured: boolean;
}): { suggest: boolean; reason: string } {
  const { unpushedSaveCount, lastPushTime, lastSuggestionTime, filesChanged, isGithubConfigured } = params;

  // Never suggest if GitHub is not configured
  if (!isGithubConfigured) {
    return { suggest: false, reason: '' };
  }

  // Don't suggest more than once per hour
  if (lastSuggestionTime && Date.now() - lastSuggestionTime < MIN_SUGGESTION_INTERVAL_MS) {
    return { suggest: false, reason: '' };
  }

  // Suggest when accumulated saves exceed threshold
  if (unpushedSaveCount >= DEFAULT_CONFIG.accumulatedSavesThreshold) {
    return {
      suggest: true,
      reason: `${unpushedSaveCount} savepoints not synced to GitHub.`,
    };
  }

  // Suggest when many files changed
  if (filesChanged >= DEFAULT_CONFIG.largeChangeThreshold) {
    return {
      suggest: true,
      reason: `${filesChanged} files changed since last sync.`,
    };
  }

  // Suggest when unpushed for more than 1 hour
  if (lastPushTime && Date.now() - lastPushTime > DEFAULT_CONFIG.unpushedDurationMs && unpushedSaveCount > 0) {
    return {
      suggest: true,
      reason: 'More than 1 hour since last sync.',
    };
  }

  return { suggest: false, reason: '' };
}

/**
 * Get the number of commits ahead of origin/main (unpushed).
 */
export async function getUnpushedCount(
  projectDir: string,
  runCommand: (cmd: string) => Promise<{ stdout: string; exitCode: number | null }>,
): Promise<number> {
  // Check if remote exists
  const { exitCode: remoteCheck } = await runCommand(
    `git -C '${projectDir.replace(/'/g, "'\\''")}' remote get-url origin 2>/dev/null`,
  );
  if (remoteCheck !== 0) return 0;

  // Count commits ahead of origin/main
  const { stdout, exitCode } = await runCommand(
    `git -C '${projectDir.replace(/'/g, "'\\''")}' rev-list --count origin/main..HEAD 2>/dev/null`,
  );
  if (exitCode !== 0) return 0;

  const count = parseInt(stdout.trim(), 10);
  return isNaN(count) ? 0 : count;
}
