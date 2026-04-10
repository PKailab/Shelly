// components/multi-pane/SessionInfoBar.tsx
// Rich session info bar shown inside terminal/AI panes — matches mock's
// "CLAUDE CODE V2.1.92 / OPUS 4.6 (1M CONTEXT) · ~/SHELLY" header block.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { usePaneStore, getAgentColor, AGENT_COLORS } from '@/store/pane-store';
import { useSidebarStore } from '@/store/sidebar-store';

const ACCENT = '#00D4AA';

const AGENT_INFO: Record<string, { name: string; version: string; model: string }> = {
  claude: { name: 'CLAUDE CODE', version: 'V2.1.92', model: 'OPUS 4.6 (1M CONTEXT)' },
  gemini: { name: 'GEMINI CLI', version: 'V0.1', model: 'GEMINI 2.5 PRO' },
  codex: { name: 'CODEX', version: 'V0.1', model: 'O4-MINI' },
  opencode: { name: 'OPENCODE', version: 'V0.1', model: 'SONNET 4.6' },
  copilot: { name: 'COPILOT', version: 'V1.0', model: 'GPT-4.1' },
};

type Props = {
  leafId: string;
};

export function SessionInfoBar({ leafId }: Props) {
  const boundAgent = usePaneStore((s) => s.paneAgents[leafId] ?? 'claude');
  const agentColor = usePaneStore((s) => getAgentColor(s.paneAgents, leafId));
  const cwd = useSidebarStore((s) => s.activeRepoPath);

  const info = AGENT_INFO[boundAgent] ?? AGENT_INFO.claude;
  const cwdShort = cwd
    ? cwd.replace(/^\/data\/data\/com\.termux\/files\/home/, '~')
    : '~/';

  // Mock shows: token usage progress bar + "42K / 1M TOKENS · ~$0.63"
  // These are cosmetic placeholders — actual values come from CLI output
  const tokenUsed = 42;
  const tokenMax = 1000;
  const progressRatio = tokenUsed / tokenMax;

  return (
    <View style={styles.container}>
      {/* Row 1: Agent name + version */}
      <View style={styles.row1}>
        <Text style={[styles.agentName, { color: agentColor }]}>{info.name}</Text>
        <Text style={styles.version}>{info.version}</Text>
      </View>

      {/* Row 2: Model + cwd */}
      <Text style={styles.model} numberOfLines={1}>
        {info.model} · {cwdShort}
      </Text>

      {/* Row 3: Progress bar */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progressRatio * 100}%`, backgroundColor: agentColor }]} />
      </View>

      {/* Row 4: Token count + cost */}
      <Text style={styles.tokenText}>
        {tokenUsed}K / {tokenMax >= 1000 ? `${tokenMax / 1000}M` : `${tokenMax}K`} TOKENS · ~$0.63
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#0D0D0D',
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
    gap: 3,
  },
  row1: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  agentName: {
    fontSize: 12,
    fontFamily: 'monospace',
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  version: {
    fontSize: 10,
    fontFamily: 'monospace',
    fontWeight: '600',
    color: '#E5E7EB',
  },
  model: {
    fontSize: 9,
    fontFamily: 'monospace',
    fontWeight: '600',
    color: '#6B7280',
    letterSpacing: 0.3,
  },
  progressTrack: {
    height: 2,
    backgroundColor: '#1A1A1A',
    borderRadius: 1,
    marginTop: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: 2,
    borderRadius: 1,
  },
  tokenText: {
    fontSize: 8,
    fontFamily: 'monospace',
    fontWeight: '600',
    color: '#6B7280',
    letterSpacing: 0.3,
    textAlign: 'right',
  },
});
