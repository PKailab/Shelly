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
import { ProfilesSection } from './ProfilesSection';

const WIDTH_EXPANDED = 240;
const WIDTH_ICONS = 48;
const WIDTH_HIDDEN = 0;
const TIMING_MS = 200;
const ACCENT = '#00D4AA';

const QUICK_FOLDERS = [
  { label: '~/', path: '~/', icon: 'home' },
  { label: 'DCIM', path: '~/storage/dcim', icon: 'photo-camera' },
  { label: 'DOWNLOAD', path: '~/storage/downloads', icon: 'download' },
  { label: 'DOCUMENTS', path: '~/storage/shared/Documents', icon: 'description' },
  { label: 'MUSIC', path: '~/storage/music', icon: 'music-note' },
] as const;

const CLOUD_SERVICES = [
  { label: 'GOOGLE DRIVE', status: 'LINKED', icon: 'cloud', linked: true },
  { label: 'DROPBOX', status: 'CONNECT', icon: 'cloud-queue', linked: false },
  { label: 'ONEDRIVE', status: 'CONNECT', icon: 'cloud-queue', linked: false },
] as const;

export function Sidebar() {
  const theme = useTheme();
  const c = theme.colors;

  const { mode, openSections, toggleSection, activeRepoPath, repoPaths, setActiveRepo, setMode } =
    useSidebarStore();
  const agents = useAgentStore((s) => s.agents);

  const runningAgents = agents.filter((a) => a.enabled);

  const targetWidth =
    mode === 'expanded' ? WIDTH_EXPANDED : mode === 'icons' ? WIDTH_ICONS : WIDTH_HIDDEN;

  const animatedStyle = useAnimatedStyle(() => ({
    width: withTiming(targetWidth, { duration: TIMING_MS }),
    overflow: 'hidden',
  }));

  const iconsOnly = mode === 'icons';

  function handleToggle() {
    if (mode === 'expanded') setMode('icons');
    else setMode('expanded');
  }

  if (mode === 'hidden') return null;

  return (
    <Animated.View style={[styles.container, animatedStyle, { backgroundColor: '#0D0D0D', borderRightColor: c.border }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* TASKS */}
        <SidebarSection
          title="TASKS"
          icon="smart-toy"
          isOpen={openSections.tasks}
          onToggle={() => toggleSection('tasks')}
          badge={runningAgents.length}
          iconsOnly={iconsOnly}
        >
          {runningAgents.length === 0 ? (
            <Text style={styles.emptyText}>No running tasks</Text>
          ) : (
            runningAgents.map((agent) => (
              <View key={agent.id} style={styles.taskRow}>
                <View style={styles.taskInfo}>
                  <Text style={styles.taskName} numberOfLines={1}>
                    {agent.name.toUpperCase()}
                  </Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: 'rgba(0,212,170,0.15)' }]}>
                  <Text style={[styles.statusBadgeText, { color: ACCENT }]}>RUNNING</Text>
                </View>
              </View>
            ))
          )}
        </SidebarSection>

        {/* REPOSITORIES */}
        <SidebarSection
          title="REPOSITORIES"
          icon="folder-special"
          isOpen={openSections.repos}
          onToggle={() => toggleSection('repos')}
          iconsOnly={iconsOnly}
        >
          {repoPaths.length === 0 ? (
            <Text style={styles.emptyText}>No repos added</Text>
          ) : (
            repoPaths.map((p) => {
              const isActive = p === activeRepoPath;
              const name = p.replace(/^.*\//, '') || p;
              return (
                <Pressable
                  key={p}
                  style={[styles.repoRow, isActive && { backgroundColor: ACCENT + '15' }]}
                  onPress={() => setActiveRepo(p)}
                >
                  <View style={[styles.repoIcon, { backgroundColor: isActive ? ACCENT : '#333' }]}>
                    <MaterialIcons
                      name="folder"
                      size={10}
                      color={isActive ? '#000' : '#999'}
                    />
                  </View>
                  <Text
                    style={[styles.repoName, { color: isActive ? ACCENT : '#E5E7EB' }]}
                    numberOfLines={1}
                  >
                    {name.toUpperCase()}
                  </Text>
                  {isActive && (
                    <Text style={styles.repoVersion}>V9.2</Text>
                  )}
                </Pressable>
              );
            })
          )}
          <Pressable style={styles.addRow} onPress={() => {}}>
            <Text style={styles.addRowText}>+ ADD REPOSITORY</Text>
          </Pressable>
        </SidebarSection>

        {/* FILE TREE */}
        <SidebarSection
          title="FILE TREE"
          icon="folder-open"
          isOpen={openSections.files}
          onToggle={() => toggleSection('files')}
          iconsOnly={iconsOnly}
        >
          <FileTree />
        </SidebarSection>

        {/* DEVICE */}
        <SidebarSection
          title="DEVICE"
          icon="phone-android"
          isOpen={openSections.device}
          onToggle={() => toggleSection('device')}
          iconsOnly={iconsOnly}
        >
          {QUICK_FOLDERS.map(({ label, path, icon }) => (
            <Pressable
              key={path}
              style={styles.deviceRow}
              onPress={() => setActiveRepo(path)}
            >
              <MaterialIcons name={icon as any} size={13} color="#6B7280" />
              <Text style={styles.deviceLabel}>{label}</Text>
            </Pressable>
          ))}
        </SidebarSection>

        {/* CLOUD */}
        <SidebarSection
          title="CLOUD"
          icon="cloud"
          isOpen={openSections.cloud}
          onToggle={() => toggleSection('cloud')}
          iconsOnly={iconsOnly}
        >
          {CLOUD_SERVICES.map((svc) => (
            <Pressable key={svc.label} style={styles.cloudRow}>
              <MaterialIcons
                name={svc.icon as any}
                size={13}
                color={svc.linked ? ACCENT : '#6B7280'}
              />
              <Text style={styles.cloudLabel}>{svc.label}</Text>
              <View style={styles.cloudSpacer} />
              <Text
                style={[
                  styles.cloudStatus,
                  { color: svc.linked ? ACCENT : '#6B7280' },
                ]}
              >
                {svc.status}
              </Text>
            </Pressable>
          ))}
        </SidebarSection>

        {/* PORTS */}
        <SidebarSection
          title="PORTS"
          icon="lan"
          isOpen={openSections.ports}
          onToggle={() => toggleSection('ports')}
          iconsOnly={iconsOnly}
        >
          <View style={styles.portRow}>
            <View style={[styles.portDot, { backgroundColor: ACCENT }]} />
            <Text style={styles.portLabel}>:3000</Text>
            <Text style={styles.portName}>NEXT.JS</Text>
            <View style={styles.cloudSpacer} />
            <MaterialIcons name="open-in-new" size={11} color="#6B7280" />
          </View>
          <View style={styles.portRow}>
            <View style={[styles.portDot, { backgroundColor: ACCENT }]} />
            <Text style={styles.portLabel}>:8081</Text>
            <Text style={styles.portName}>EXPO</Text>
            <View style={styles.cloudSpacer} />
            <MaterialIcons name="open-in-new" size={11} color="#6B7280" />
          </View>
        </SidebarSection>

        {/* PROFILES */}
        <SidebarSection
          title="PROFILES"
          icon="manage-accounts"
          isOpen={openSections.profiles}
          onToggle={() => toggleSection('profiles')}
          iconsOnly={iconsOnly}
        >
          <ProfilesSection />
        </SidebarSection>
      </ScrollView>

      {/* Collapse toggle */}
      <Pressable
        style={[styles.toggleBtn, { borderTopColor: c.border }]}
        onPress={handleToggle}
        hitSlop={8}
      >
        <MaterialIcons
          name={mode === 'expanded' ? 'chevron-left' : 'chevron-right'}
          size={20}
          color="#6B7280"
        />
        {!iconsOnly && (
          <Text style={styles.toggleLabel}>Collapse</Text>
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
  emptyText: {
    fontSize: 10,
    fontFamily: 'monospace',
    color: '#6B7280',
    paddingHorizontal: 12,
    paddingVertical: 6,
    fontStyle: 'italic',
  },
  // Tasks
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 5,
    gap: 8,
  },
  taskInfo: {
    flex: 1,
  },
  taskName: {
    fontSize: 10,
    fontFamily: 'monospace',
    fontWeight: '600',
    color: '#E5E7EB',
    letterSpacing: 0.3,
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
  },
  statusBadgeText: {
    fontSize: 8,
    fontFamily: 'monospace',
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  // Repos
  repoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 4,
  },
  repoIcon: {
    width: 18,
    height: 18,
    borderRadius: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  repoName: {
    fontSize: 10,
    fontFamily: 'monospace',
    fontWeight: '700',
    letterSpacing: 0.5,
    flex: 1,
  },
  repoVersion: {
    fontSize: 9,
    fontFamily: 'monospace',
    fontWeight: '600',
    color: '#6B7280',
  },
  addRow: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  addRowText: {
    fontSize: 10,
    fontFamily: 'monospace',
    fontWeight: '600',
    color: '#6B7280',
    letterSpacing: 0.3,
  },
  // Device
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  deviceLabel: {
    fontSize: 10,
    fontFamily: 'monospace',
    fontWeight: '600',
    color: '#E5E7EB',
    letterSpacing: 0.3,
  },
  // Cloud
  cloudRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  cloudLabel: {
    fontSize: 10,
    fontFamily: 'monospace',
    fontWeight: '600',
    color: '#E5E7EB',
    letterSpacing: 0.3,
  },
  cloudSpacer: {
    flex: 1,
  },
  cloudStatus: {
    fontSize: 8,
    fontFamily: 'monospace',
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  // Ports
  portRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  portDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  portLabel: {
    fontSize: 10,
    fontFamily: 'monospace',
    fontWeight: '700',
    color: '#E5E7EB',
  },
  portName: {
    fontSize: 10,
    fontFamily: 'monospace',
    fontWeight: '600',
    color: '#6B7280',
  },
  // Toggle
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  toggleLabel: {
    fontSize: 10,
    fontFamily: 'monospace',
    color: '#6B7280',
  },
});
