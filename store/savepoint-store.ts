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
  /** Pending savepoint request reason (consumed by auto-save subscriber) */
  pendingRequest: string | null;
  /** Security issues from last scan (if commit was blocked) */
  securityWarnings: string[];

  setEnabled: (enabled: boolean) => void;
  setSaving: (saving: boolean) => void;
  flashBadge: () => void;
  recordSavepoint: (messageId: string, info: Omit<SavepointInfo, 'reverted' | 'timestamp'>) => void;
  markReverted: (messageId: string) => void;
  requestSavepoint: (reason: string) => void;
  clearPendingRequest: () => void;
  setSecurityWarnings: (warnings: string[]) => void;
};

export const useSavepointStore = create<SavepointState>((set) => ({
  isEnabled: true,
  isSaving: false,
  showBadge: false,
  lastSaveTime: null,
  messageSavepoints: {},
  pendingRequest: null,
  securityWarnings: [],

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

  requestSavepoint: (reason) => set({ pendingRequest: reason }),
  clearPendingRequest: () => set({ pendingRequest: null }),
  setSecurityWarnings: (warnings) => set({ securityWarnings: warnings }),
}));
