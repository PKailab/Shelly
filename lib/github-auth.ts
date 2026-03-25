/**
 * lib/github-auth.ts — GitHub authentication via Personal Access Token.
 *
 * Stores the PAT in expo-secure-store (same pattern as secure-store.ts).
 * Validates tokens against the GitHub API.
 */

import * as SecureStore from 'expo-secure-store';

const SECURE_KEY = 'shelly_github_pat';

/**
 * Retrieve the stored GitHub PAT.
 */
export async function getGitHubPAT(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(SECURE_KEY);
  } catch (e) {
    console.warn('[GitHubAuth] Failed to read PAT');
    return null;
  }
}

/**
 * Save a GitHub PAT to secure storage.
 */
export async function saveGitHubPAT(token: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(SECURE_KEY, token);
  } catch (e) {
    console.warn('[GitHubAuth] Failed to save PAT');
  }
}

/**
 * Delete the stored GitHub PAT.
 */
export async function deleteGitHubPAT(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(SECURE_KEY);
  } catch (e) {
    console.warn('[GitHubAuth] Failed to delete PAT');
  }
}

/**
 * Validate a PAT by calling the GitHub API.
 * Returns the associated username on success.
 */
export async function validateGitHubPAT(
  token: string,
): Promise<{ valid: boolean; username?: string }> {
  try {
    const res = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
      },
    });
    if (res.ok) {
      const data = await res.json();
      return { valid: true, username: data.login };
    }
    return { valid: false };
  } catch {
    return { valid: false };
  }
}

/**
 * Return the URL for creating a new GitHub PAT with repo scope pre-filled.
 */
export function getGitHubTokenUrl(): string {
  return 'https://github.com/settings/tokens/new?scopes=repo&description=Shelly';
}

/**
 * Check whether a valid GitHub PAT is stored.
 */
export async function isGitHubConfigured(): Promise<boolean> {
  const pat = await getGitHubPAT();
  return pat !== null && pat.length > 0;
}
