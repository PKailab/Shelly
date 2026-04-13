// Global git status for the active repository. One poller (kicked off
// from Sidebar, which already tracks activeRepoPath) feeds the count
// via setDirty; any consumer can subscribe. Keeps the AgentBar badge
// and the Sidebar badge in sync without running two polling loops.

import { create } from 'zustand';

type GitStatusState = {
  dirtyCount: number | null;
  setDirty: (n: number | null) => void;
};

export const useGitStatusStore = create<GitStatusState>((set) => ({
  dirtyCount: null,
  setDirty: (n) => set({ dirtyCount: n }),
}));
