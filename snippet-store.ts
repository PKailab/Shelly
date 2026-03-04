import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Snippet, SnippetScope, SnippetSortOrder } from './types';

// ─── Store Type ───────────────────────────────────────────────────────────────

interface SnippetStore {
  snippets: Snippet[];
  sortOrder: SnippetSortOrder;
  isLoaded: boolean;

  addSnippet: (opts: {
    command: string;
    title?: string;
    tags?: string[];
    scope?: SnippetScope;
  }) => Snippet;
  updateSnippet: (id: string, updates: Partial<Pick<Snippet, 'title' | 'command' | 'tags' | 'scope'>>) => void;
  deleteSnippet: (id: string) => void;
  incrementUseCount: (id: string) => void;
  setSortOrder: (order: SnippetSortOrder) => void;

  /** Find a snippet with the exact same command (for duplicate detection) */
  findByCommand: (command: string) => Snippet | undefined;

  /** Replace entire snippet list (used by import) */
  setSnippets: (snippets: Snippet[]) => void;

  /** Return snippets sorted by current sortOrder */
  getSorted: () => Snippet[];

  /** Search snippets by query string (title, command, tags) */
  search: (query: string) => Snippet[];

  /** Load snippets from AsyncStorage */
  loadSnippets: () => Promise<void>;

  /** Persist to AsyncStorage */
  _persist: () => Promise<void>;
  _load: () => Promise<void>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Parse a comma-separated tag string into a trimmed, non-empty array. */
export function parseTags(raw: string): string[] {
  return raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

function generateId(): string {
  return `snip_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function generateTitle(command: string): string {
  return command.slice(0, 40).trim();
}

const STORAGE_KEY = '@shelly/snippets';
const SORT_KEY = '@shelly/snippets_sort';

// ─── Store ────────────────────────────────────────────────────────────────────

export const useSnippetStore = create<SnippetStore>((set, get) => ({
  snippets: [],
  sortOrder: 'lastUsed',
  isLoaded: false,

  addSnippet: ({ command, title, tags = [], scope = 'global' }) => {
    const now = Date.now();
    const snippet: Snippet = {
      id: generateId(),
      title: title ?? generateTitle(command),
      command,
      tags,
      createdAt: now,
      lastUsedAt: now,
      useCount: 0,
      scope,
    };
    set((s) => ({ snippets: [snippet, ...s.snippets] }));
    get()._persist();
    return snippet;
  },

  updateSnippet: (id, updates) => {
    set((s) => ({
      snippets: s.snippets.map((sn) =>
        sn.id === id ? { ...sn, ...updates } : sn
      ),
    }));
    get()._persist();
  },

  deleteSnippet: (id) => {
    set((s) => ({ snippets: s.snippets.filter((sn) => sn.id !== id) }));
    get()._persist();
  },

  incrementUseCount: (id) => {
    set((s) => ({
      snippets: s.snippets.map((sn) =>
        sn.id === id
          ? { ...sn, useCount: sn.useCount + 1, lastUsedAt: Date.now() }
          : sn
      ),
    }));
    get()._persist();
  },

  setSortOrder: (order) => {
    set({ sortOrder: order });
    AsyncStorage.setItem(SORT_KEY, order).catch(() => {});
  },

  findByCommand: (command) => {
    return get().snippets.find((sn) => sn.command === command);
  },

  setSnippets: (snippets) => {
    set({ snippets });
    get()._persist();
  },

  getSorted: () => {
    const { snippets, sortOrder } = get();
    const sorted = [...snippets];
    switch (sortOrder) {
      case 'lastUsed':
        sorted.sort((a, b) => b.lastUsedAt - a.lastUsedAt);
        break;
      case 'useCount':
        sorted.sort((a, b) => b.useCount - a.useCount);
        break;
      case 'createdAt':
        sorted.sort((a, b) => b.createdAt - a.createdAt);
        break;
    }
    return sorted;
  },

  search: (query: string) => {
    const { snippets, sortOrder } = get();
    const q = query.toLowerCase();
    const filtered = snippets.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.command.toLowerCase().includes(q) ||
        s.tags.some((t) => t.toLowerCase().includes(q))
    );
    const sorted = [...filtered];
    switch (sortOrder) {
      case 'lastUsed':
        sorted.sort((a, b) => b.lastUsedAt - a.lastUsedAt);
        break;
      case 'useCount':
        sorted.sort((a, b) => b.useCount - a.useCount);
        break;
      case 'createdAt':
        sorted.sort((a, b) => b.createdAt - a.createdAt);
        break;
    }
    return sorted;
  },

  loadSnippets: async () => {
    await get()._load();
    set({ isLoaded: true });
  },

  _persist: async () => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(get().snippets));
    } catch (e) {
      console.warn('[SnippetStore] persist failed', e);
    }
  },

  _load: async () => {
    try {
      const [raw, sort] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEY),
        AsyncStorage.getItem(SORT_KEY),
      ]);
      if (raw) set({ snippets: JSON.parse(raw) });
      if (sort) set({ sortOrder: sort as SnippetSortOrder });
      set({ isLoaded: true });
    } catch (e) {
      console.warn('[SnippetStore] load failed', e);
    }
  },
}));

// Auto-load on import
useSnippetStore.getState()._load();
