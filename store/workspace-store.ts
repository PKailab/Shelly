// store/workspace-store.ts
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'shelly:workspaces';

type WorkspaceConfig = {
  repoPath: string;
  sessionIds: string[];     // terminal session IDs bound to this repo
  boundAgent?: string;       // preferred AI agent for this repo
  lastCwd?: string;
};

type WorkspaceState = {
  /** repoPath → workspace config */
  workspaces: Record<string, WorkspaceConfig>;

  getWorkspace: (repoPath: string) => Omit<WorkspaceConfig, 'repoPath'> | undefined;
  setWorkspace: (repoPath: string, config: Partial<Omit<WorkspaceConfig, 'repoPath'>>) => void;
  loadWorkspaces: () => Promise<void>;
};

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspaces: {},

  getWorkspace: (repoPath) => {
    const ws = get().workspaces[repoPath];
    if (!ws) return undefined;
    const { repoPath: _rp, ...rest } = ws;
    return rest;
  },

  setWorkspace: (repoPath, config) => {
    set((s) => {
      const existing = s.workspaces[repoPath] ?? { repoPath, sessionIds: [] };
      const updated: WorkspaceConfig = { ...existing, ...config, repoPath };
      const next = { ...s.workspaces, [repoPath]: updated };
      // Persist asynchronously — fire and forget
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return { workspaces: next };
    });
  },

  loadWorkspaces: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: Record<string, WorkspaceConfig> = JSON.parse(raw);
        set({ workspaces: parsed });
      }
    } catch {
      // Silent fail — workspaces just start empty
    }
  },
}));
