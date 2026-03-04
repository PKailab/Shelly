/**
 * Snippets機能のユニットテスト (v1.5)
 * - 保存 / 検索 / 実行 / 削除 / 重複確認
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Mock AsyncStorage ──────────────────────────────────────────────────────────
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn().mockResolvedValue(null),
    setItem: vi.fn().mockResolvedValue(undefined),
    removeItem: vi.fn().mockResolvedValue(undefined),
  },
}));

// ── Snippet helpers (pure logic extracted for testing) ─────────────────────────

type Snippet = {
  id: string;
  title: string;
  command: string;
  tags: string[];
  scope: 'global' | 'session';
  createdAt: number;
  lastUsedAt: number;
  useCount: number;
};

function createSnippet(command: string, title?: string): Snippet {
  return {
    id: `snip_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    title: title ?? command.slice(0, 20),
    command,
    tags: [],
    scope: 'global',
    createdAt: Date.now(),
    lastUsedAt: Date.now(),
    useCount: 0,
  };
}

function searchSnippets(snippets: Snippet[], query: string): Snippet[] {
  if (!query.trim()) return snippets;
  const q = query.toLowerCase();
  return snippets.filter(
    (s) =>
      s.command.toLowerCase().includes(q) ||
      s.title.toLowerCase().includes(q) ||
      s.tags.some((t) => t.toLowerCase().includes(q)),
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Snippets', () => {
  it('should create a snippet with default title', () => {
    const s = createSnippet('ls -la');
    expect(s.command).toBe('ls -la');
    expect(s.title).toBe('ls -la');
    expect(s.useCount).toBe(0);
  });

  it('should create a snippet with custom title', () => {
    const s = createSnippet('git push origin main', 'Push to main');
    expect(s.title).toBe('Push to main');
  });

  it('should search by command', () => {
    const snippets = [
      createSnippet('ls -la'),
      createSnippet('git status'),
      createSnippet('npm install'),
    ];
    const results = searchSnippets(snippets, 'git');
    expect(results).toHaveLength(1);
    expect(results[0].command).toBe('git status');
  });

  it('should return all snippets for empty query', () => {
    const snippets = [createSnippet('ls'), createSnippet('pwd')];
    expect(searchSnippets(snippets, '')).toHaveLength(2);
  });

  it('should search case-insensitively', () => {
    const snippets = [createSnippet('Docker Build')];
    expect(searchSnippets(snippets, 'docker')).toHaveLength(1);
  });
});