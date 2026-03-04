/**
 * Obsidian Store
 *
 * Obsidianタブの状態管理。
 * - Daily Briefing一覧
 * - 選択中アイテム
 * - 議論履歴
 * - SNS下書き
 * - 設定（VaultPath・自動収集）
 */

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { BriefingItem, CollectionResult } from '@/lib/obsidian-collector';

// ─── 型定義 ──────────────────────────────────────────────────────────────────

export interface DiscussionMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  model: 'local' | 'perplexity' | 'gemini' | 'claude';
}

export interface SnsDraft {
  itemId: string;
  x?: string;
  threads?: string;
  note?: string;
  generatedAt: string;
}

export interface ObsidianSettings {
  vaultPath: string;             // 例: /storage/emulated/0/ObsidianVault
  autoCollectEnabled: boolean;
  collectTimeHour: number;       // 0〜23（デフォルト: 6）
  collectTimeMinute: number;     // 0〜59（デフォルト: 0）
  maxItemsPerDay: number;        // デフォルト: 8
  daysBack: number;              // 過去N日以内（デフォルト: 30）
  lastCollectedAt?: string;      // 最後の収集日時
}

export const DEFAULT_OBSIDIAN_SETTINGS: ObsidianSettings = {
  vaultPath: '/storage/emulated/0/ObsidianVault',
  autoCollectEnabled: true,
  collectTimeHour: 6,
  collectTimeMinute: 0,
  maxItemsPerDay: 8,
  daysBack: 30,
};

export type ObsidianView =
  | 'briefing'     // Daily Briefing一覧（メイン）
  | 'detail'       // 記事詳細
  | 'discuss'      // 議論モード
  | 'sns'          // SNS執筆モード
  | 'research';    // 論文執筆支援

export interface ObsidianState {
  // ── データ ──────────────────────────────────────────────────────────────
  todayItems: BriefingItem[];
  selectedItem: BriefingItem | null;
  currentView: ObsidianView;

  // ── 収集状態 ─────────────────────────────────────────────────────────────
  isCollecting: boolean;
  lastCollectionResult: CollectionResult | null;
  collectionError: string | null;

  // ── 議論 ─────────────────────────────────────────────────────────────────
  discussionHistory: DiscussionMessage[];
  isDiscussing: boolean;

  // ── SNS下書き ─────────────────────────────────────────────────────────────
  snsDrafts: Record<string, SnsDraft>;  // itemId → draft
  isGeneratingSns: boolean;

  // ── 設定 ─────────────────────────────────────────────────────────────────
  settings: ObsidianSettings;
  settingsLoaded: boolean;

  // ── アクション ────────────────────────────────────────────────────────────
  loadSettings: () => Promise<void>;
  saveSettings: (settings: Partial<ObsidianSettings>) => Promise<void>;

  setTodayItems: (items: BriefingItem[]) => void;
  selectItem: (item: BriefingItem | null) => void;
  setView: (view: ObsidianView) => void;

  setCollecting: (collecting: boolean) => void;
  setCollectionResult: (result: CollectionResult | null) => void;
  setCollectionError: (error: string | null) => void;

  addDiscussionMessage: (msg: DiscussionMessage) => void;
  clearDiscussion: () => void;
  setDiscussing: (discussing: boolean) => void;

  setSnsDraft: (itemId: string, draft: Partial<SnsDraft>) => void;
  setGeneratingSns: (generating: boolean) => void;

  loadCachedItems: () => Promise<void>;
  saveCachedItems: (items: BriefingItem[]) => Promise<void>;
}

const SETTINGS_KEY = 'obsidian_settings_v1';
const DISCUSSION_KEY = 'obsidian_discussion_v1';

// ─── Store ───────────────────────────────────────────────────────────────────

export const useObsidianStore = create<ObsidianState>((set, get) => ({
  todayItems: [],
  selectedItem: null,
  currentView: 'briefing',
  isCollecting: false,
  lastCollectionResult: null,
  collectionError: null,
  discussionHistory: [],
  isDiscussing: false,
  snsDrafts: {},
  isGeneratingSns: false,
  settings: DEFAULT_OBSIDIAN_SETTINGS,
  settingsLoaded: false,

  // ── 設定 ──────────────────────────────────────────────────────────────────
  loadSettings: async () => {
    try {
      const raw = await AsyncStorage.getItem(SETTINGS_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        set({ settings: { ...DEFAULT_OBSIDIAN_SETTINGS, ...saved }, settingsLoaded: true });
      } else {
        set({ settingsLoaded: true });
      }
    } catch {
      set({ settingsLoaded: true });
    }
  },

  saveSettings: async (partial) => {
    const current = get().settings;
    const updated = { ...current, ...partial };
    set({ settings: updated });
    try {
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
    } catch {}
  },

  // ── データ ────────────────────────────────────────────────────────────────
  setTodayItems: (items) => set({ todayItems: items }),

  selectItem: (item) => set({ selectedItem: item }),

  setView: (view) => set({ currentView: view }),

  // ── 収集状態 ──────────────────────────────────────────────────────────────
  setCollecting: (collecting) => set({ isCollecting: collecting }),

  setCollectionResult: (result) => set({ lastCollectionResult: result }),

  setCollectionError: (error) => set({ collectionError: error }),

  // ── 議論 ──────────────────────────────────────────────────────────────────
  addDiscussionMessage: (msg) => {
    set(state => ({ discussionHistory: [...state.discussionHistory, msg] }));
    // 直近20件のみ保持（AsyncStorage節約）
    const history = get().discussionHistory.slice(-20);
    AsyncStorage.setItem(DISCUSSION_KEY, JSON.stringify(history)).catch(() => {});
  },

  clearDiscussion: () => {
    set({ discussionHistory: [] });
    AsyncStorage.removeItem(DISCUSSION_KEY).catch(() => {});
  },

  setDiscussing: (discussing) => set({ isDiscussing: discussing }),

  // ── SNS下書き ─────────────────────────────────────────────────────────────
  setSnsDraft: (itemId, draft) => {
    set(state => ({
      snsDrafts: {
        ...state.snsDrafts,
        [itemId]: {
          ...state.snsDrafts[itemId],
          ...draft,
          itemId,
          generatedAt: draft.generatedAt ?? state.snsDrafts[itemId]?.generatedAt ?? new Date().toISOString(),
        },
      },
    }));
  },

  setGeneratingSns: (generating) => set({ isGeneratingSns: generating }),

  // ── キャッシュ ────────────────────────────────────────────────────────────
  loadCachedItems: async () => {
    const today = new Date().toISOString().split('T')[0];
    const key = `briefing_cache_${today}`;
    try {
      const raw = await AsyncStorage.getItem(key);
      if (raw) {
        const items: BriefingItem[] = JSON.parse(raw);
        set({ todayItems: items });
      }
    } catch {}
  },

  saveCachedItems: async (items) => {
    const today = new Date().toISOString().split('T')[0];
    const key = `briefing_cache_${today}`;
    try {
      await AsyncStorage.setItem(key, JSON.stringify(items));
    } catch {}
  },
}));
