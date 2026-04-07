// lib/workspace-manager.ts
import { useWorkspaceStore } from '@/store/workspace-store';
import { useTerminalStore } from '@/store/terminal-store';
import { useSidebarStore } from '@/store/sidebar-store';
import { usePaneStore } from '@/store/pane-store';

/** Switch to a repository workspace: update cwd, restore sessions, bind agent */
export function switchWorkspace(repoPath: string): void {
  const ws = useWorkspaceStore.getState().getWorkspace(repoPath);

  // Update sidebar active repo
  useSidebarStore.getState().setActiveRepo(repoPath);

  // Bind agent to focused pane if configured
  if (ws?.boundAgent) {
    const focusedPane = usePaneStore.getState().focusedPaneId;
    if (focusedPane) {
      usePaneStore.getState().bindAgent(focusedPane, ws.boundAgent);
    }
  }
}

/** Save current state as workspace */
export function saveCurrentWorkspace(repoPath: string): void {
  const sessions = useTerminalStore.getState().sessions;
  const { focusedPaneId, paneAgents } = usePaneStore.getState();
  const activeAgent = focusedPaneId ? paneAgents[focusedPaneId] : undefined;

  useWorkspaceStore.getState().setWorkspace(repoPath, {
    sessionIds: sessions.map((s) => s.id),
    boundAgent: activeAgent,
    lastCwd: sessions[0]?.currentDir,
  });
}
