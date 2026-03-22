/**
 * Savepoint Store — Zustand state for auto-save system.
 */
import { create } from 'zustand';

export type SavepointInfo = {
  commitHash: string;
  message: string;
  filesChanged: number;
  filesCreated: number;
  filesDeleted: number;
  reverted: boolean;
  timestamp: number;
};

type SavepointState = {
  isEnabled: boolean;
  isSaving: boolean;
  showBadge: boolean;
  lastSaveTime: number | null;
  messageSavepoints: Record<string, SavepointInfo>;

  setEnabled: (enabled: boolean) => void;
  setSaving: (saving: boolean) => void;
  flashBadge: () => void;
  recordSavepoint: (messageId: string, info: Omit<SavepointInfo, 'reverted' | 'timestamp'>) => void;
  markReverted: (messageId: string) => void;
};

export const useSavepointStore = create<SavepointState>((set) => ({
  isEnabled: true,
  isSaving: false,
  showBadge: false,
  lastSaveTime: null,
  messageSavepoints: {},

  setEnabled: (enabled) => set({ isEnabled: enabled }),

  setSaving: (saving) => set({ isSaving: saving }),

  flashBadge: () => {
    set({ showBadge: true, lastSaveTime: Date.now() });
    setTimeout(() => set({ showBadge: false }), 2000);
  },

  recordSavepoint: (messageId, info) =>
    set((state) => ({
      messageSavepoints: {
        ...state.messageSavepoints,
        [messageId]: { ...info, reverted: false, timestamp: Date.now() },
      },
    })),

  markReverted: (messageId) =>
    set((state) => {
      const existing = state.messageSavepoints[messageId];
      if (!existing) return state;
      return {
        messageSavepoints: {
          ...state.messageSavepoints,
          [messageId]: { ...existing, reverted: true },
        },
      };
    }),
}));
