/**
 * Subscribes to TerminalEmulatorModule EventEmitter.
 * Feeds terminal output to execution-log-store for ALL sessions,
 * including background tabs. Independent of view lifecycle.
 *
 * Also detects file-changing output patterns to trigger savepoints.
 */
import { useEffect, useRef } from 'react';
import TerminalEmulator from '@/modules/terminal-emulator';
import { useExecutionLogStore } from '@/store/execution-log-store';
import { detectLocalhostUrl } from '@/lib/localhost-detector';
import { usePreviewStore } from '@/store/preview-store';
import { useSavepointStore } from '@/store/savepoint-store';

// Patterns indicating file changes in PTY output
const FILE_CHANGE_OUTPUT = [
  /(?:wrote|created|saved|modified|updated|generated)\s+\S+/i,
  /(?:^|\$\s+|#\s+)(?:vim|nano|code)\s+\S+/,
  /(?:^|\$\s+|#\s+)(?:mv|cp|rm)\s+/,
  /(?:^|\$\s+|#\s+)git\s+(?:checkout|reset|merge|rebase)/,
  /(?:^|\$\s+|#\s+)(?:npm|pnpm|yarn)\s+(?:install|add|remove)/,
];

export function useTerminalOutput() {
  const addTerminalOutput = useExecutionLogStore((s) => s.addTerminalOutput);
  const savepointDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const sub = TerminalEmulator.addListener('onSessionOutput', (event: { sessionId: string; data: string }) => {
      if (!event.data) return;
      const lines = event.data.split('\n');
      for (const line of lines) {
        addTerminalOutput(line, event.sessionId);

        // Detect localhost URLs for preview offers
        const url = detectLocalhostUrl(line);
        if (url) {
          usePreviewStore.getState().offerPreview(url, 'localhost');
        }

        // Detect file-changing output → request savepoint (5s debounce)
        for (const pattern of FILE_CHANGE_OUTPUT) {
          if (pattern.test(line)) {
            if (savepointDebounce.current) clearTimeout(savepointDebounce.current);
            savepointDebounce.current = setTimeout(() => {
              useSavepointStore.getState().requestSavepoint('file-change-detected');
            }, 5000);
            break;
          }
        }
      }
    });
    return () => {
      sub.remove();
      if (savepointDebounce.current) clearTimeout(savepointDebounce.current);
    };
  }, [addTerminalOutput]);
}
