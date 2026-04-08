// components/layout/AgentBar.tsx
import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { usePaneStore, AGENT_COLORS } from '@/store/pane-store';
import { useSettingsStore } from '@/store/settings-store';
import { useCommandPaletteStore } from '@/hooks/use-command-palette';

type AgentDef = {
  name: string;
  key: string;
};

const BUILT_IN_AGENTS: AgentDef[] = [
  { name: 'CLAUDE', key: 'claude' },
  { name: 'GEMINI', key: 'gemini' },
  { name: 'CODEX', key: 'codex' },
  { name: 'OPENCODE', key: 'opencode' },
  { name: 'COPILOT', key: 'copilot' },
];

const ACCENT = '#00D4AA';

export function AgentBar() {
  const { focusedPaneId, paneAgents, bindAgent } = usePaneStore();
  const settings = useSettingsStore((s) => s.settings);

  const agents = BUILT_IN_AGENTS.filter(
    (a) => settings.teamMembers?.[a.key as keyof typeof settings.teamMembers]
  );

  const activeAgent = focusedPaneId ? paneAgents[focusedPaneId] : null;

  const handleAgentTap = (agentKey: string) => {
    if (!focusedPaneId) return;
    bindAgent(focusedPaneId, agentKey);
  };

  return (
    <View style={styles.bar}>
      {/* Agent tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        style={styles.scroll}
      >
        {agents.map((agent) => {
          const isActive = activeAgent === agent.key;
          return (
            <Pressable
              key={agent.key}
              style={[
                styles.agentTab,
                isActive && styles.agentTabActive,
              ]}
              onPress={() => handleAgentTap(agent.key)}
            >
              <View style={[styles.statusDot, { backgroundColor: isActive ? ACCENT : '#6B7280' }]} />
              <Text
                style={[
                  styles.agentText,
                  { color: isActive ? '#E5E7EB' : '#6B7280' },
                  isActive && { fontWeight: '800' },
                ]}
              >
                {agent.name}
              </Text>
            </Pressable>
          );
        })}
        {/* Add agent button */}
        <Pressable style={styles.addBtn} hitSlop={8}>
          <Text style={styles.addBtnText}>+</Text>
        </Pressable>
      </ScrollView>

      {/* Right-side action buttons */}
      <View style={styles.rightBtns}>
        <Pressable
          style={styles.iconBtn}
          onPress={() => useCommandPaletteStore.getState().toggle()}
          hitSlop={8}
        >
          <MaterialIcons name="search" size={16} color="#6B7280" />
        </Pressable>
        <Pressable
          style={styles.iconBtn}
          onPress={() => useSettingsStore.getState().setShowConfigTUI(true)}
          hitSlop={8}
        >
          <MaterialIcons name="settings" size={15} color="#6B7280" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: 32,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
    backgroundColor: '#0D0D0D',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    alignItems: 'center',
    paddingHorizontal: 6,
    gap: 2,
  },
  agentTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  agentTabActive: {
    backgroundColor: 'rgba(0,212,170,0.10)',
    borderColor: 'rgba(0,212,170,0.25)',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  agentText: {
    fontSize: 10,
    fontFamily: 'monospace',
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  addBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  addBtnText: {
    color: '#6B7280',
    fontSize: 14,
    fontFamily: 'monospace',
    fontWeight: '600',
  },
  rightBtns: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 8,
    gap: 6,
  },
  iconBtn: {
    padding: 4,
    borderRadius: 4,
  },
});
