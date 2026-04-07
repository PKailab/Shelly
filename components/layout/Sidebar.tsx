// components/layout/Sidebar.tsx
import React from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
} from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useTheme } from '@/lib/theme-engine';
import { useSidebarStore } from '@/store/sidebar-store';
import { useAgentStore } from '@/store/agent-store';
import { SidebarSection } from './SidebarSection';
import { FileTree } from './FileTree';

const WIDTH_EXPANDED = 240;
const WIDTH_ICONS = 48;
const WIDTH_HIDDEN = 0;
const TIMING_MS = 200;

const QUICK_FOLDERS = [
  { label: 'Home', path: '~/', icon: 'home' },
  { label: 'Downloads', path: '~/storage/downloads', icon: 'download' },
  { label: 'Documents', path: '~/storage/shared/Documents', icon: 'description' },
  { label: 'DCIM', path: '~/storage/dcim', icon: 'photo-camera' },
] as const;

export function Sidebar() {
  const theme = useTheme();
  const c = theme.colors;

  const { mode, openSections, toggleSection, activeRepoPath, repoPaths, setActiveRepo, setMode } =
    useSidebarStore();
  const agents = useAgentStore((s) => s.agents);

  // Running agents: enabled and had a last run (proxy for "active")
  const runningAgents = agents.filter((a) => a.enabled);

  const targetWidth =
    mode === 'expanded' ? WIDTH_EXPANDED : mode === 'icons' ? WIDTH_ICONS : WIDTH_HIDDEN;

  const animatedStyle = useAnimatedStyle(() => ({
    width: withTiming(targetWidth, { duration: TIMING_MS }),
    overflow: 'hidden',
  }));

  const iconsOnly = mode === 'icons';

  // Toggle between expanded and icons-only (hidden→expanded on open)
  function handleToggle() {
    if (mode === 'expanded') setMode('icons');
    else setMode('expanded');
  }

  if (mode === 'hidden') return null;

  return (
    <Animated.View style={[styles.container, animatedStyle, { backgroundColor: c.surface, borderRightColor: c.border }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Tasks */}
        <SidebarSection
          title="Tasks"
          icon="smart-toy"
          isOpen={openSections.tasks}
          onToggle={() => toggleSection('tasks')}
          badge={runningAgents.length}
          iconsOnly={iconsOnly}
        >
          {runningAgents.length === 0 ? (
            <Text style={[styles.emptyText, { color: c.muted }]}>No running tasks</Text>
          ) : (
            runningAgents.map((agent) => (
              <View key={agent.id} style={styles.row}>
                <View style={[styles.dot, { backgroundColor: c.success }]} />
                <Text style={[styles.rowText, { color: c.foreground }]} numberOfLines={1}>
                  {agent.name}
                </Text>
              </View>
            ))
          )}
        </SidebarSection>

        {/* Repos */}
        <SidebarSection
          title="Repos"
          icon="folder-special"
          isOpen={openSections.repos}
          onToggle={() => toggleSection('repos')}
          iconsOnly={iconsOnly}
        >
          {repoPaths.length === 0 ? (
            <Text style={[styles.emptyText, { color: c.muted }]}>No repos added</Text>
          ) : (
            repoPaths.map((p) => {
              const isActive = p === activeRepoPath;
              return (
                <Pressable
                  key={p}
                  style={[styles.row, isActive && { backgroundColor: c.accent + '20' }]}
                  onPress={() => setActiveRepo(p)}
                >
                  <MaterialIcons
                    name="folder"
                    size={14}
                    color={isActive ? c.accent : c.muted}
                  />
                  <Text
                    style={[styles.rowText, { color: isActive ? c.accent : c.foreground }]}
                    numberOfLines={1}
                  >
                    {p.replace(/^.*\//, '') || p}
                  </Text>
                </Pressable>
              );
            })
          )}
        </SidebarSection>

        {/* Files */}
        <SidebarSection
          title="Files"
          icon="folder-open"
          isOpen={openSections.files}
          onToggle={() => toggleSection('files')}
          iconsOnly={iconsOnly}
        >
          <FileTree />
        </SidebarSection>

        {/* Device */}
        <SidebarSection
          title="Device"
          icon="phone-android"
          isOpen={openSections.device}
          onToggle={() => toggleSection('device')}
          iconsOnly={iconsOnly}
        >
          {QUICK_FOLDERS.map(({ label, path, icon }) => (
            <Pressable
              key={path}
              style={styles.row}
              onPress={() => setActiveRepo(path)}
            >
              <MaterialIcons name={icon as any} size={14} color={c.muted} />
              <Text style={[styles.rowText, { color: c.foreground }]}>{label}</Text>
            </Pressable>
          ))}
        </SidebarSection>

        {/* Ports */}
        <SidebarSection
          title="Ports"
          icon="lan"
          isOpen={openSections.ports}
          onToggle={() => toggleSection('ports')}
          iconsOnly={iconsOnly}
        >
          <Text style={[styles.emptyText, { color: c.muted }]}>No forwarded ports</Text>
        </SidebarSection>

        {/* Profiles */}
        <SidebarSection
          title="Profiles"
          icon="manage-accounts"
          isOpen={openSections.profiles}
          onToggle={() => toggleSection('profiles')}
          iconsOnly={iconsOnly}
        >
          <Text style={[styles.emptyText, { color: c.muted }]}>No saved profiles</Text>
        </SidebarSection>
      </ScrollView>

      {/* Expand / collapse toggle */}
      <Pressable
        style={[styles.toggleBtn, { borderTopColor: c.border }]}
        onPress={handleToggle}
        hitSlop={8}
      >
        <MaterialIcons
          name={mode === 'expanded' ? 'chevron-left' : 'chevron-right'}
          size={20}
          color={c.muted}
        />
        {!iconsOnly && (
          <Text style={[styles.toggleLabel, { color: c.muted }]}>Collapse</Text>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'column',
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 4,
  },
  rowText: {
    fontSize: 12,
    flex: 1,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  emptyText: {
    fontSize: 11,
    paddingHorizontal: 12,
    paddingVertical: 6,
    fontStyle: 'italic',
  },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  toggleLabel: {
    fontSize: 11,
  },
});
