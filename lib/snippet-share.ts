/**
 * lib/snippet-share.ts — Snippet sharing via GitHub Gist + URL
 *
 * Features:
 * - Share individual snippets or collections as Gist
 * - Import snippets from Gist URL
 * - Generate shareable deep links
 * - Community snippet browsing (curated list)
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Types ────────────────────────────────────────────────────────────────────

export interface SharedSnippet {
  title: string;
  command: string;
  tags: string[];
  description?: string;
  author?: string;
}

export interface SharedCollection {
  name: string;
  description: string;
  author: string;
  snippets: SharedSnippet[];
  version: number;
  createdAt: string;
}

export interface CommunityPack {
  id: string;
  name: string;
  description: string;
  author: string;
  icon: string;
  snippetCount: number;
  gistUrl: string;
  tags: string[];
}

// ── Share to Gist ────────────────────────────────────────────────────────────

const PAT_KEY = '@shelly/github_pat';

async function getPat(): Promise<string | null> {
  return AsyncStorage.getItem(PAT_KEY);
}

/**
 * Share snippets as a GitHub Gist.
 * Returns the Gist URL if successful.
 */
export async function shareSnippetsToGist(
  snippets: SharedSnippet[],
  collectionName: string = 'My Shelly Snippets',
): Promise<string | null> {
  const pat = await getPat();
  if (!pat) return null;

  const collection: SharedCollection = {
    name: collectionName,
    description: `${snippets.length} snippets shared from Shelly Terminal`,
    author: '',
    snippets,
    version: 1,
    createdAt: new Date().toISOString(),
  };

  try {
    const res = await fetch('https://api.github.com/gists', {
      method: 'POST',
      headers: {
        Authorization: `token ${pat}`,
        'Content-Type': 'application/json',
        Accept: 'application/vnd.github.v3+json',
      },
      body: JSON.stringify({
        description: `${collectionName} — Shelly Terminal Snippets`,
        public: true,
        files: {
          'shelly-snippets.json': {
            content: JSON.stringify(collection, null, 2),
          },
        },
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    return data.html_url;
  } catch {
    return null;
  }
}

// ── Import from Gist ─────────────────────────────────────────────────────────

/**
 * Import snippets from a GitHub Gist URL or ID.
 */
export async function importSnippetsFromGist(
  gistUrlOrId: string,
): Promise<SharedSnippet[] | null> {
  // Extract gist ID from URL
  const id = gistUrlOrId.replace(/^https?:\/\/gist\.github\.com\/[^/]+\//, '').split(/[?#]/)[0];
  if (!id) return null;

  try {
    const res = await fetch(`https://api.github.com/gists/${id}`, {
      headers: { Accept: 'application/vnd.github.v3+json' },
    });
    if (!res.ok) return null;

    const data = await res.json();

    // Find the snippet file
    const files = Object.values(data.files) as Array<{ filename: string; content: string }>;
    const snippetFile = files.find((f) =>
      f.filename.includes('shelly-snippets') || f.filename.endsWith('.json'),
    );

    if (!snippetFile) return null;

    const parsed = JSON.parse(snippetFile.content);

    // Handle both collection format and array format
    if (Array.isArray(parsed)) {
      return parsed as SharedSnippet[];
    }
    if (parsed.snippets && Array.isArray(parsed.snippets)) {
      return parsed.snippets as SharedSnippet[];
    }

    return null;
  } catch {
    return null;
  }
}

// ── Generate shareable URL ───────────────────────────────────────────────────

/**
 * Encode snippet as a compact shareable string (base64 JSON).
 */
export function encodeSnippetUrl(snippet: SharedSnippet): string {
  const compact = { t: snippet.title, c: snippet.command, g: snippet.tags };
  const encoded = btoa(JSON.stringify(compact));
  return `shelly://snippet/${encoded}`;
}

/**
 * Decode a snippet from a shareable URL.
 */
export function decodeSnippetUrl(url: string): SharedSnippet | null {
  try {
    const match = url.match(/shelly:\/\/snippet\/(.+)/);
    if (!match) return null;
    const decoded = JSON.parse(atob(match[1]));
    return {
      title: decoded.t || '',
      command: decoded.c || '',
      tags: decoded.g || [],
    };
  } catch {
    return null;
  }
}

// ── Community Packs (curated) ────────────────────────────────────────────────

/**
 * Curated community snippet packs.
 * These are hosted as public gists and updated independently.
 */
export const COMMUNITY_PACKS: CommunityPack[] = [
  {
    id: 'git-essentials',
    name: 'Git Essentials',
    description: 'Common git commands for daily development workflow',
    author: 'shelly-community',
    icon: 'merge-type',
    snippetCount: 15,
    gistUrl: '',
    tags: ['git', 'vcs', 'development'],
  },
  {
    id: 'docker-shortcuts',
    name: 'Docker Shortcuts',
    description: 'Docker & Docker Compose productivity commands',
    author: 'shelly-community',
    icon: 'cloud',
    snippetCount: 12,
    gistUrl: '',
    tags: ['docker', 'containers', 'devops'],
  },
  {
    id: 'npm-scripts',
    name: 'npm/Yarn Scripts',
    description: 'Node.js package manager power commands',
    author: 'shelly-community',
    icon: 'code',
    snippetCount: 10,
    gistUrl: '',
    tags: ['npm', 'yarn', 'node', 'javascript'],
  },
  {
    id: 'termux-setup',
    name: 'Termux Setup',
    description: 'Essential Termux configuration and package installation',
    author: 'shelly-community',
    icon: 'phone-android',
    snippetCount: 20,
    gistUrl: '',
    tags: ['termux', 'android', 'setup'],
  },
  {
    id: 'linux-admin',
    name: 'Linux Admin',
    description: 'System administration and monitoring commands',
    author: 'shelly-community',
    icon: 'dns',
    snippetCount: 18,
    gistUrl: '',
    tags: ['linux', 'sysadmin', 'monitoring'],
  },
];
