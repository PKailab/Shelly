# Superset Layout Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Shelly's 4-tab navigation with a single-screen terminal IDE layout: sidebar + agent bar + pane grid + context bar.

**Architecture:** The Expo Router `(tabs)` group is replaced by a single `index.tsx` that renders `ShellLayout` — a composition of `Sidebar`, `AgentBar`, `PaneContainer`, and `ContextBar`. The existing tree-based multi-pane system (`use-multi-pane.ts`) is promoted from an overlay to the primary layout engine. New Zustand stores manage sidebar state, pane focus, and agent-pane bindings.

**Tech Stack:** Expo 54, React Native 0.81, TypeScript, Zustand, NativeWind (TailwindCSS 3), react-native-gesture-handler, react-native-reanimated, expo-router

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `app/index.tsx` | New root screen — renders `ShellLayout` (replaces tab routing) |
| `components/layout/ShellLayout.tsx` | Top-level compositor: sidebar + agent bar + pane grid + context bar |
| `components/layout/Sidebar.tsx` | Collapsible left sidebar (Tasks, Repos, FileTree, Device, Ports, Profiles) |
| `components/layout/SidebarSection.tsx` | Accordion section wrapper (reusable) |
| `components/layout/FileTree.tsx` | File/folder browser inside sidebar |
| `components/layout/AgentBar.tsx` | Top agent switcher + search/settings buttons |
| `components/layout/ContextBar.tsx` | Bottom status strip (cwd, git, runtime, connection) |
| `store/sidebar-store.ts` | Sidebar state: expanded/collapsed, active repo, sections |
| `store/pane-store.ts` | Pane focus, agent-pane bindings, pane type extensions |

### Modified Files

| File | Change |
|------|--------|
| `app/_layout.tsx` | Remove `(tabs)` anchor, point Stack to new `index` |
| `hooks/use-multi-pane.ts` | Extend `PaneTab` type, add `focusedPaneId`, always-on mode |
| `hooks/use-native-exec.ts` | Export standalone `execCommand` for non-hook contexts |
| `components/multi-pane/PaneSlot.tsx` | Add agent color border, remove close on last pane |
| `components/multi-pane/MultiPaneContainer.tsx` | Remove `absoluteFill` overlay, render inline |
| `components/multi-pane/pane-registry.ts` | Keep `terminal` only for Plan 1 (AI/Browser/Markdown in Plan 2) |

### Preserved (No Changes in Plan 1)

| File | Reason |
|------|--------|
| `app/(tabs)/terminal.tsx` | Still loaded as pane content via `pane-registry.ts` |
| `app/(tabs)/index.tsx` (Chat) | Kept for pane-registry compat; deletion in Plan 5 |
| `app/(tabs)/projects.tsx` | Sidebar absorbs its role; deletion in Plan 5 |
| `app/(tabs)/settings.tsx` | Replaced by `shelly config`; deletion in Plan 5 |
| `store/terminal-store.ts` | Untouched — sessions, blocks, execution all stay |
| `store/agent-store.ts` | Untouched — agent definitions, run history stay |

---

## Task 0: Export `execCommand` from use-native-exec

**Files:**
- Modify: `hooks/use-native-exec.ts:42-44`

The private `exec()` function needs to be exported as `execCommand` for use in non-React contexts (Zustand store actions, FileTree).

- [ ] **Step 1: Add named export**

In `hooks/use-native-exec.ts`, change line 42:

```typescript
// Before:
async function exec(command: string, timeoutMs?: number): Promise<ExecResult> {

// After:
export async function execCommand(command: string, timeoutMs?: number): Promise<ExecResult> {
```

Then update all internal references from `exec(` to `execCommand(` within the same file (approximately 5 occurrences in `runCommand`, `runRawCommand`, `writeFile`, `readFile`, `listFiles`).

- [ ] **Step 2: Commit**

```bash
git add hooks/use-native-exec.ts
git commit -m "feat(exec): export execCommand for non-hook usage in stores and components"
```

---

## Task 1: Create Sidebar Store

**Files:**
- Create: `store/sidebar-store.ts`

- [ ] **Step 1: Write the sidebar store**

```typescript
// store/sidebar-store.ts
import { create } from 'zustand';

export type SidebarMode = 'expanded' | 'icons' | 'hidden';
export type SidebarSection = 'tasks' | 'repos' | 'files' | 'device' | 'ports' | 'profiles';

interface SidebarState {
  mode: SidebarMode;
  /** Which accordion sections are open (Record for Zustand serialization compat) */
  openSections: Record<SidebarSection, boolean>;
  /** Active repository path (drives file tree + cwd) */
  activeRepoPath: string | null;
  /** Known repository paths */
  repoPaths: string[];

  setMode: (mode: SidebarMode) => void;
  toggleSection: (section: SidebarSection) => void;
  setActiveRepo: (path: string) => void;
  addRepo: (path: string) => void;
  removeRepo: (path: string) => void;
}

export const useSidebarStore = create<SidebarState>((set, get) => ({
  mode: 'hidden',
  openSections: { tasks: false, repos: true, files: false, device: false, ports: false, profiles: false },
  activeRepoPath: null,
  repoPaths: [],

  setMode: (mode) => set({ mode }),

  toggleSection: (section) =>
    set((s) => ({
      openSections: { ...s.openSections, [section]: !s.openSections[section] },
    })),

  setActiveRepo: (path) => set({ activeRepoPath: path }),

  addRepo: (path) =>
    set((s) => ({
      repoPaths: s.repoPaths.includes(path) ? s.repoPaths : [...s.repoPaths, path],
    })),

  removeRepo: (path) =>
    set((s) => ({
      repoPaths: s.repoPaths.filter((p) => p !== path),
      activeRepoPath: s.activeRepoPath === path ? null : s.activeRepoPath,
    })),
}));
```

- [ ] **Step 2: Commit**

```bash
git add store/sidebar-store.ts
git commit -m "feat(store): add sidebar-store for sidebar mode, sections, and repos"
```

---

## Task 2: Create Pane Store (Focus + Agent Bindings)

**Files:**
- Create: `store/pane-store.ts`

- [ ] **Step 1: Write the pane store**

```typescript
// store/pane-store.ts
import { create } from 'zustand';

/** Agent color mapping for pane top borders */
export const AGENT_COLORS: Record<string, string> = {
  claude: '#D4A574',
  gemini: '#4285F4',
  codex: '#10A37F',
  local: '#FFD700',
  perplexity: '#20808D',
  unbound: '#333333',
};

/** Get agent color for a pane (standalone — use outside React or in selectors) */
export function getAgentColor(paneAgents: Record<string, string>, paneId: string): string {
  const agent = paneAgents[paneId];
  return AGENT_COLORS[agent ?? 'unbound'] ?? AGENT_COLORS.unbound;
}

interface PaneState {
  /** Currently focused pane leaf ID */
  focusedPaneId: string | null;
  /** Agent bound to each pane: leafId → agentName */
  paneAgents: Record<string, string>;

  setFocusedPane: (id: string) => void;
  bindAgent: (paneId: string, agentName: string) => void;
  unbindAgent: (paneId: string) => void;
}

export const usePaneStore = create<PaneState>((set) => ({
  focusedPaneId: null,
  paneAgents: {},

  setFocusedPane: (id) => set({ focusedPaneId: id }),

  bindAgent: (paneId, agentName) =>
    set((s) => ({ paneAgents: { ...s.paneAgents, [paneId]: agentName } })),

  unbindAgent: (paneId) =>
    set((s) => {
      const next = { ...s.paneAgents };
      delete next[paneId];
      return { paneAgents: next };
    }),
}));
```

- [ ] **Step 2: Commit**

```bash
git add store/pane-store.ts
git commit -m "feat(store): add pane-store for focus tracking and agent-pane bindings"
```

---

## Task 3: Extend Multi-Pane Store for Always-On Mode

**Files:**
- Modify: `hooks/use-multi-pane.ts`

The multi-pane system currently works as an overlay toggled on wide screens. For the new layout it must be the primary layout engine — always active, starting with a single terminal pane.

- [ ] **Step 1: Extend PaneTab type and add always-on init**

In `hooks/use-multi-pane.ts`, add new pane tab types and an `initShell` action:

```typescript
// Change the PaneTab type (line 5-9):
export type PaneTab =
  | 'terminal'
  | 'ai'
  | 'browser'
  | 'markdown'
  // Legacy (kept for pane-registry compat during migration)
  | 'index'
  | 'projects'
  | 'settings';
```

Add to the store actions interface:

```typescript
/** Initialize for shell layout — always on, starts with 1 terminal pane */
initShell: () => void;
```

Add the implementation:

```typescript
initShell: () => {
  const { root } = get();
  // Only initialize if not already active
  if (root) return;
  set({ isMultiPane: true, root: makeLeaf('terminal') });
},
```

- [ ] **Step 2: Verify existing tests still pass (if any)**

Run: `cd ~/Shelly && npx jest --passWithNoTests hooks/use-multi-pane 2>&1 | tail -5`
Expected: PASS or no test found

- [ ] **Step 3: Commit**

```bash
git add hooks/use-multi-pane.ts
git commit -m "feat(multi-pane): extend PaneTab type, add initShell for always-on mode"
```

---

## Task 4: Create ContextBar Component

**Files:**
- Create: `components/layout/ContextBar.tsx`

The context bar shows cwd, git branch, runtime, and connection status in a bottom strip.

- [ ] **Step 1: Write ContextBar**

```typescript
// components/layout/ContextBar.tsx
import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Clipboard from 'expo-clipboard';
import { useTheme } from '@/lib/theme-engine';
import { useTerminalStore } from '@/store/terminal-store';
import { execCommand } from '@/hooks/use-native-exec';

function truncatePath(path: string, maxLen = 30): string {
  if (path.length <= maxLen) return path;
  const home = '/data/data/com.termux/files/home';
  const short = path.startsWith(home) ? '~' + path.slice(home.length) : path;
  if (short.length <= maxLen) return short;
  return '...' + short.slice(short.length - maxLen + 3);
}

export function ContextBar() {
  const theme = useTheme();
  const c = theme.colors;
  const session = useTerminalStore((s) => {
    const active = s.sessions.find((sess) => sess.id === s.activeSessionId);
    return active;
  });

  const cwd = session?.currentDir ?? '~';
  const connectionMode = useTerminalStore((s) => s.connectionMode);

  // Git branch detection
  const [gitBranch, setGitBranch] = useState<string | null>(null);
  useEffect(() => {
    execCommand(`cd '${cwd}' && git branch --show-current 2>/dev/null`)
      .then((r) => setGitBranch(r.exitCode === 0 ? r.stdout.trim() || null : null))
      .catch(() => setGitBranch(null));
  }, [cwd]);

  const handleCopyPath = () => {
    Clipboard.setStringAsync(cwd);
  };

  return (
    <View style={[styles.bar, { backgroundColor: c.surface, borderTopColor: c.border }]}>
      {/* CWD */}
      <Pressable onPress={handleCopyPath} style={styles.segment} hitSlop={4}>
        <MaterialIcons name="folder" size={11} color={c.muted} />
        <Text style={[styles.text, { color: c.muted }]} numberOfLines={1}>
          {truncatePath(cwd)}
        </Text>
      </Pressable>

      {/* Git branch */}
      {gitBranch && (
        <View style={[styles.segment, { marginLeft: 8 }]}>
          <MaterialIcons name="call-split" size={11} color={c.accent} />
          <Text style={[styles.text, { color: c.accent }]}>{gitBranch}</Text>
        </View>
      )}

      <View style={styles.spacer} />

      {/* Connection status */}
      <View style={styles.segment}>
        <View style={[styles.dot, {
          backgroundColor: connectionMode === 'native' ? c.success : c.error,
        }]} />
        <Text style={[styles.text, { color: c.muted }]}>
          {connectionMode === 'native' ? 'Native' : 'Off'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: 28,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    borderTopWidth: 1,
  },
  segment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  spacer: { flex: 1 },
  text: {
    fontSize: 10,
    fontFamily: 'monospace',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add components/layout/ContextBar.tsx
git commit -m "feat(layout): add ContextBar — bottom status strip with cwd and connection"
```

---

## Task 5: Create AgentBar Component

**Files:**
- Create: `components/layout/AgentBar.tsx`

Horizontal scrollable bar of AI agents with settings/search buttons on the right.

- [ ] **Step 1: Write AgentBar**

```typescript
// components/layout/AgentBar.tsx
import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useTheme } from '@/lib/theme-engine';
import { usePaneStore, AGENT_COLORS } from '@/store/pane-store';
import { useSettingsStore } from '@/store/settings-store';
import { useCommandPaletteStore } from '@/hooks/use-command-palette';

type AgentDef = {
  name: string;
  icon: string; // MaterialIcons name
  key: string;  // matches AGENT_COLORS key
};

const BUILT_IN_AGENTS: AgentDef[] = [
  { name: 'Claude', icon: 'auto-awesome', key: 'claude' },
  { name: 'Gemini', icon: 'diamond', key: 'gemini' },
  { name: 'Codex', icon: 'code', key: 'codex' },
  { name: 'Local', icon: 'smartphone', key: 'local' },
  { name: 'Perplexity', icon: 'travel-explore', key: 'perplexity' },
];

export function AgentBar() {
  const theme = useTheme();
  const c = theme.colors;
  const { focusedPaneId, paneAgents, bindAgent } = usePaneStore();
  const settings = useSettingsStore((s) => s.settings);

  // Filter to enabled agents
  const agents = BUILT_IN_AGENTS.filter(
    (a) => settings.teamMembers?.[a.key as keyof typeof settings.teamMembers]
  );

  const activeAgent = focusedPaneId ? paneAgents[focusedPaneId] : null;

  const handleAgentTap = (agentKey: string) => {
    if (!focusedPaneId) return;
    bindAgent(focusedPaneId, agentKey);
  };

  return (
    <View style={[styles.bar, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        style={styles.scroll}
      >
        {agents.map((agent) => {
          const isActive = activeAgent === agent.key;
          const color = AGENT_COLORS[agent.key] ?? c.muted;
          return (
            <Pressable
              key={agent.key}
              style={[styles.agentBtn, isActive && { backgroundColor: color + '20' }]}
              onPress={() => handleAgentTap(agent.key)}
            >
              <MaterialIcons name={agent.icon as any} size={14} color={isActive ? color : c.muted} />
              <Text style={[styles.agentText, { color: isActive ? color : c.muted }]}>
                {agent.name}
              </Text>
              {isActive && <View style={[styles.activeDot, { backgroundColor: color }]} />}
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Right-side buttons */}
      <View style={styles.rightBtns}>
        <Pressable style={styles.iconBtn} hitSlop={8}>
          <MaterialIcons name="add" size={18} color={c.muted} />
        </Pressable>
        <Pressable
          style={styles.iconBtn}
          onPress={() => useCommandPaletteStore.getState().toggle()}
          hitSlop={8}
        >
          <MaterialIcons name="search" size={18} color={c.muted} />
        </Pressable>
        <Pressable style={styles.iconBtn} hitSlop={8}>
          <MaterialIcons name="settings" size={16} color={c.muted} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    alignItems: 'center',
    paddingHorizontal: 8,
    gap: 4,
  },
  agentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  agentText: {
    fontSize: 11,
    fontFamily: 'monospace',
    fontWeight: '600',
  },
  activeDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  rightBtns: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 8,
    gap: 4,
  },
  iconBtn: {
    padding: 4,
    borderRadius: 4,
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add components/layout/AgentBar.tsx
git commit -m "feat(layout): add AgentBar — agent switcher with search button"
```

---

## Task 6: Create SidebarSection Component

**Files:**
- Create: `components/layout/SidebarSection.tsx`

Reusable accordion section for the sidebar.

- [ ] **Step 1: Write SidebarSection**

```typescript
// components/layout/SidebarSection.tsx
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useTheme } from '@/lib/theme-engine';

type Props = {
  title: string;
  icon: string;
  isOpen: boolean;
  onToggle: () => void;
  badge?: number;
  /** Icons-only mode: show icon only, no title or children */
  iconsOnly?: boolean;
  children: React.ReactNode;
};

export function SidebarSection({
  title,
  icon,
  isOpen,
  onToggle,
  badge,
  iconsOnly,
  children,
}: Props) {
  const theme = useTheme();
  const c = theme.colors;

  if (iconsOnly) {
    return (
      <Pressable style={styles.iconBtn} onPress={onToggle} hitSlop={4}>
        <MaterialIcons name={icon as any} size={18} color={isOpen ? c.accent : c.muted} />
        {badge != null && badge > 0 && (
          <View style={[styles.badge, { backgroundColor: c.accent }]}>
            <Text style={styles.badgeText}>{badge > 9 ? '9+' : badge}</Text>
          </View>
        )}
      </Pressable>
    );
  }

  return (
    <View style={[styles.section, { borderBottomColor: c.border }]}>
      <Pressable style={styles.header} onPress={onToggle}>
        <MaterialIcons name={icon as any} size={14} color={c.muted} />
        <Text style={[styles.title, { color: c.foreground }]} numberOfLines={1}>
          {title}
        </Text>
        {badge != null && badge > 0 && (
          <View style={[styles.countBadge, { backgroundColor: c.accent + '30' }]}>
            <Text style={[styles.countText, { color: c.accent }]}>{badge}</Text>
          </View>
        )}
        <View style={styles.spacer} />
        <MaterialIcons
          name={isOpen ? 'expand-less' : 'expand-more'}
          size={16}
          color={c.muted}
        />
      </Pressable>
      {isOpen && <View style={styles.body}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    borderBottomWidth: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  title: {
    fontSize: 10,
    fontFamily: 'monospace',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  spacer: { flex: 1 },
  countBadge: {
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  countText: {
    fontSize: 9,
    fontFamily: 'monospace',
    fontWeight: '700',
  },
  body: {
    paddingBottom: 6,
  },
  iconBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: 6,
    right: 8,
    width: 14,
    height: 14,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#000',
    fontSize: 8,
    fontWeight: '800',
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add components/layout/SidebarSection.tsx
git commit -m "feat(layout): add SidebarSection — reusable accordion with icons-only mode"
```

---

## Task 7: Create FileTree Component

**Files:**
- Create: `components/layout/FileTree.tsx`

Renders a file/folder tree for the active repository path.

- [ ] **Step 1: Write FileTree**

```typescript
// components/layout/FileTree.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, Pressable, FlatList, TextInput, StyleSheet } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useTheme } from '@/lib/theme-engine';
import { useSidebarStore } from '@/store/sidebar-store';
import { execCommand } from '@/hooks/use-native-exec';

type FileEntry = {
  name: string;
  path: string;
  isDirectory: boolean;
};

export function FileTree() {
  const theme = useTheme();
  const c = theme.colors;
  const repoPath = useSidebarStore((s) => s.activeRepoPath);
  const [cwd, setCwd] = useState(repoPath ?? '');
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [search, setSearch] = useState('');
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());

  const loadDir = useCallback(async (dir: string) => {
    try {
      const result = await execCommand(
        `ls -1pa "${dir}" 2>/dev/null | head -100`
      );
      const lines = result.trim().split('\n').filter(Boolean);
      const parsed: FileEntry[] = lines
        .filter((l) => l !== './' && l !== '../')
        .map((l) => ({
          name: l.replace(/\/$/, ''),
          path: `${dir}/${l.replace(/\/$/, '')}`,
          isDirectory: l.endsWith('/'),
        }));
      setEntries(parsed);
    } catch {
      setEntries([]);
    }
  }, []);

  useEffect(() => {
    if (repoPath) {
      setCwd(repoPath);
      loadDir(repoPath);
    }
  }, [repoPath, loadDir]);

  const filtered = search
    ? entries.filter((e) => e.name.toLowerCase().includes(search.toLowerCase()))
    : entries;

  const handleTap = (entry: FileEntry) => {
    if (entry.isDirectory) {
      setCwd(entry.path);
      loadDir(entry.path);
    }
    // File taps will be handled in Plan 2 (open in Markdown pane or cat in terminal)
  };

  const handleGoUp = () => {
    const parent = cwd.replace(/\/[^/]+$/, '') || '/';
    setCwd(parent);
    loadDir(parent);
  };

  if (!repoPath) {
    return (
      <View style={styles.empty}>
        <Text style={[styles.emptyText, { color: c.muted }]}>
          Select a repository
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Search */}
      <TextInput
        style={[styles.search, { color: c.foreground, borderColor: c.border }]}
        placeholder="Search files..."
        placeholderTextColor={c.muted}
        value={search}
        onChangeText={setSearch}
      />

      {/* Breadcrumb */}
      {cwd !== repoPath && (
        <Pressable style={styles.breadcrumb} onPress={handleGoUp}>
          <MaterialIcons name="arrow-back" size={12} color={c.accent} />
          <Text style={[styles.breadcrumbText, { color: c.accent }]} numberOfLines={1}>
            ..
          </Text>
        </Pressable>
      )}

      {/* File list */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.path}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => handleTap(item)}>
            <MaterialIcons
              name={item.isDirectory ? 'folder' : 'insert-drive-file'}
              size={14}
              color={item.isDirectory ? c.accent : c.muted}
            />
            <Text style={[styles.fileName, { color: c.foreground }]} numberOfLines={1}>
              {item.name}
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    maxHeight: 300,
  },
  search: {
    height: 28,
    marginHorizontal: 8,
    marginBottom: 4,
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 8,
    fontSize: 11,
    fontFamily: 'monospace',
  },
  breadcrumb: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  breadcrumbText: {
    fontSize: 11,
    fontFamily: 'monospace',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  fileName: {
    fontSize: 11,
    fontFamily: 'monospace',
    flex: 1,
  },
  empty: {
    padding: 16,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 11,
    fontFamily: 'monospace',
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add components/layout/FileTree.tsx
git commit -m "feat(layout): add FileTree — file browser for sidebar with search and navigation"
```

---

## Task 8: Create Sidebar Component

**Files:**
- Create: `components/layout/Sidebar.tsx`

The left sidebar assembles SidebarSections: Tasks, Repositories, FileTree, Device, Ports.

- [ ] **Step 1: Write Sidebar**

```typescript
// components/layout/Sidebar.tsx
import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useTheme } from '@/lib/theme-engine';
import { useSidebarStore, type SidebarMode } from '@/store/sidebar-store';
import { SidebarSection } from './SidebarSection';
import { FileTree } from './FileTree';
import { useAgentStore } from '@/store/agent-store';
import { useTerminalStore } from '@/store/terminal-store';

const EXPANDED_WIDTH = 240;
const ICONS_WIDTH = 48;

export function Sidebar() {
  const theme = useTheme();
  const c = theme.colors;
  const { mode, openSections, toggleSection, activeRepoPath, repoPaths, setActiveRepo, setMode } =
    useSidebarStore();
  const agents = useAgentStore((s) => s.agents);
  const sessions = useTerminalStore((s) => s.sessions);

  const iconsOnly = mode === 'icons';

  const animStyle = useAnimatedStyle(() => ({
    width: withTiming(
      mode === 'expanded' ? EXPANDED_WIDTH : mode === 'icons' ? ICONS_WIDTH : 0,
      { duration: 200 }
    ),
    opacity: withTiming(mode === 'hidden' ? 0 : 1, { duration: 150 }),
  }));

  if (mode === 'hidden') return null;

  const runningTasks = agents.filter((a) => a.status === 'running').length;

  return (
    <Animated.View style={[styles.sidebar, { backgroundColor: c.surface, borderRightColor: c.border }, animStyle]}>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Tasks */}
        <SidebarSection
          title="Tasks"
          icon="play-circle-outline"
          isOpen={openSections.tasks}
          onToggle={() => toggleSection('tasks')}
          badge={runningTasks}
          iconsOnly={iconsOnly}
        >
          {agents.length === 0 ? (
            <Text style={[styles.emptyText, { color: c.muted }]}>No active tasks</Text>
          ) : (
            agents.map((a) => (
              <View key={a.id} style={styles.listItem}>
                <View style={[styles.statusDot, {
                  backgroundColor: a.status === 'running' ? c.success : c.muted,
                }]} />
                <Text style={[styles.listText, { color: c.foreground }]} numberOfLines={1}>
                  {a.name}
                </Text>
              </View>
            ))
          )}
        </SidebarSection>

        {/* Repositories */}
        <SidebarSection
          title="Repos"
          icon="source"
          isOpen={openSections.repos}
          onToggle={() => toggleSection('repos')}
          badge={repoPaths.length}
          iconsOnly={iconsOnly}
        >
          {repoPaths.map((path) => {
            const name = path.split('/').pop() ?? path;
            const isActive = path === activeRepoPath;
            return (
              <Pressable
                key={path}
                style={[styles.listItem, isActive && { backgroundColor: c.accent + '15' }]}
                onPress={() => setActiveRepo(path)}
              >
                <MaterialIcons
                  name="folder"
                  size={14}
                  color={isActive ? c.accent : c.muted}
                />
                <Text
                  style={[styles.listText, { color: isActive ? c.accent : c.foreground }]}
                  numberOfLines={1}
                >
                  {name}
                </Text>
              </Pressable>
            );
          })}
        </SidebarSection>

        {/* File Tree */}
        <SidebarSection
          title="Files"
          icon="description"
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
          {[
            { name: '~/', path: '/data/data/com.termux/files/home' },
            { name: 'Download', path: '/storage/emulated/0/Download' },
            { name: 'Documents', path: '/storage/emulated/0/Documents' },
            { name: 'DCIM', path: '/storage/emulated/0/DCIM' },
          ].map((d) => (
            <Pressable key={d.path} style={styles.listItem} onPress={() => setActiveRepo(d.path)}>
              <MaterialIcons name="folder-open" size={14} color={c.muted} />
              <Text style={[styles.listText, { color: c.foreground }]}>{d.name}</Text>
            </Pressable>
          ))}
        </SidebarSection>

        {/* Ports — placeholder for Plan 5 */}
        <SidebarSection
          title="Ports"
          icon="settings-ethernet"
          isOpen={openSections.ports}
          onToggle={() => toggleSection('ports')}
          iconsOnly={iconsOnly}
        >
          <Text style={[styles.emptyText, { color: c.muted }]}>No forwarded ports</Text>
        </SidebarSection>

        {/* Profiles — placeholder for Plan 5 (SSH/SFTP connections) */}
        <SidebarSection
          title="Profiles"
          icon="dns"
          isOpen={openSections.profiles}
          onToggle={() => toggleSection('profiles')}
          iconsOnly={iconsOnly}
        >
          <Text style={[styles.emptyText, { color: c.muted }]}>No saved profiles</Text>
        </SidebarSection>
      </ScrollView>

      {/* Mode toggle at bottom */}
      {!iconsOnly && (
        <Pressable style={[styles.collapseBtn, { borderTopColor: c.border }]} onPress={() => setMode('icons')}>
          <MaterialIcons name="chevron-left" size={16} color={c.muted} />
        </Pressable>
      )}
      {iconsOnly && (
        <Pressable style={styles.expandBtn} onPress={() => setMode('expanded')}>
          <MaterialIcons name="chevron-right" size={16} color={c.muted} />
        </Pressable>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    borderRightWidth: 1,
    overflow: 'hidden',
  },
  scroll: {
    flex: 1,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
    marginHorizontal: 4,
  },
  listText: {
    fontSize: 11,
    fontFamily: 'monospace',
    flex: 1,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  emptyText: {
    fontSize: 10,
    fontFamily: 'monospace',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  collapseBtn: {
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: 1,
  },
  expandBtn: {
    alignItems: 'center',
    paddingVertical: 8,
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add components/layout/Sidebar.tsx
git commit -m "feat(layout): add Sidebar — collapsible sidebar with Tasks, Repos, Files, Device, Ports, Profiles"
```

---

## Task 9: Add Agent Color Border to PaneSlot

**Files:**
- Modify: `components/multi-pane/PaneSlot.tsx`

Each pane shows a colored 2px top border matching its bound agent.

- [ ] **Step 1: Import pane store and add color border**

In `components/multi-pane/PaneSlot.tsx`, add the agent color border to the pane header:

Add imports at the top:
```typescript
import { usePaneStore, getAgentColor } from '@/store/pane-store';
```

Inside `PaneSlotInner`, add after the `const entry = ...` line:
```typescript
const agentColor = usePaneStore((s) => getAgentColor(s.paneAgents, leafId));
```

Replace the `{/* Pane header */}` View with a focus-tracking wrapper:
```typescript
const { setFocusedPane } = usePaneStore();
```

Wrap the entire `pane` View with an `onTouchStart` handler:
```typescript
onTouchStart={() => setFocusedPane(leafId)}
```

Add to the header style inline:
```typescript
style={[styles.header, { borderTopWidth: 2, borderTopColor: agentColor }]}
```

- [ ] **Step 2: Commit**

```bash
git add components/multi-pane/PaneSlot.tsx
git commit -m "feat(pane): add agent color border and focus tracking to PaneSlot"
```

---

## Task 10: Modify MultiPaneContainer for Inline Rendering

**Files:**
- Modify: `components/multi-pane/MultiPaneContainer.tsx`

Remove `absoluteFill` and `zIndex: 50` overlay positioning. The pane container now renders inline within `ShellLayout`, taking `flex: 1`.

- [ ] **Step 1: Change root style**

In `components/multi-pane/MultiPaneContainer.tsx`, change the `MultiPaneContainer` component:

Replace:
```typescript
return (
  <View style={[StyleSheet.absoluteFill, styles.root, { paddingTop: insets.top }]}>
    <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
    <PaneTreeNode node={root} />
  </View>
);
```

With:
```typescript
return (
  <View style={styles.root}>
    <PaneTreeNode node={root} />
  </View>
);
```

Update the `root` style:
```typescript
root: {
  flex: 1,
  backgroundColor: '#0A0A0A',
},
```

(Remove the `zIndex: 50` — no longer an overlay.)

- [ ] **Step 2: Commit**

```bash
git add components/multi-pane/MultiPaneContainer.tsx
git commit -m "refactor(multi-pane): render inline instead of absolute overlay"
```

---

## Task 11: Create ShellLayout Component

**Files:**
- Create: `components/layout/ShellLayout.tsx`

The top-level compositor that assembles all layout pieces.

- [ ] **Step 1: Write ShellLayout**

```typescript
// components/layout/ShellLayout.tsx
import React, { useEffect } from 'react';
import { View, StyleSheet, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/theme-engine';
import { useDeviceLayout } from '@/hooks/use-device-layout';
import { useMultiPaneStore } from '@/hooks/use-multi-pane';
import { useSidebarStore } from '@/store/sidebar-store';
import { Sidebar } from './Sidebar';
import { AgentBar } from './AgentBar';
import { ContextBar } from './ContextBar';
import { MultiPaneContainer } from '@/components/multi-pane/MultiPaneContainer';
import { CommandPalette } from '@/components/CommandPalette';
import { WelcomeWizard, isWizardComplete } from '@/components/WelcomeWizard';

export function ShellLayout() {
  const theme = useTheme();
  const c = theme.colors;
  const layout = useDeviceLayout();
  const insets = useSafeAreaInsets();
  const { initShell, setMaxPanes } = useMultiPaneStore();
  const { setMode } = useSidebarStore();

  // Initialize pane system on mount
  useEffect(() => {
    initShell();
  }, []);

  // Responsive sidebar mode
  useEffect(() => {
    if (layout.isWide && layout.isLandscape) {
      setMode('expanded');
    } else if (layout.isWide) {
      setMode('icons');
    } else {
      setMode('hidden');
    }
  }, [layout.isWide, layout.isLandscape]);

  // Responsive max panes
  useEffect(() => {
    setMaxPanes(layout.isLandscape && layout.isWide ? 4 : layout.isWide ? 2 : 1);
  }, [layout.isWide, layout.isLandscape]);

  // Welcome wizard state
  const [showWizard, setShowWizard] = React.useState(false);
  const [wizardChecked, setWizardChecked] = React.useState(false);
  useEffect(() => {
    isWizardComplete().then((done) => {
      if (!done) setShowWizard(true);
      setWizardChecked(true);
    });
  }, []);

  return (
    <View style={[styles.root, { backgroundColor: c.background, paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* Agent Bar (top) */}
      <AgentBar />

      {/* Main area: sidebar + panes */}
      <View style={styles.main}>
        <Sidebar />
        <MultiPaneContainer />
      </View>

      {/* Context Bar (bottom) */}
      <ContextBar />

      {/* Overlays */}
      <CommandPalette />
      {wizardChecked && (
        <WelcomeWizard visible={showWizard} onComplete={() => setShowWizard(false)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  main: {
    flex: 1,
    flexDirection: 'row',
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add components/layout/ShellLayout.tsx
git commit -m "feat(layout): add ShellLayout — top-level compositor with sidebar, agent bar, panes, context bar"
```

---

## Task 12: Create New Root Screen (Replace Tab Routing)

**Files:**
- Create: `app/index.tsx`
- Modify: `app/_layout.tsx`

Replace the `(tabs)` routing with a single `index.tsx` that renders `ShellLayout`.

- [ ] **Step 1: Create `app/index.tsx`**

```typescript
// app/index.tsx — Single-screen terminal IDE
import React from 'react';
import { ShellLayout } from '@/components/layout/ShellLayout';

export default function ShellScreen() {
  return <ShellLayout />;
}
```

- [ ] **Step 2: Modify `app/_layout.tsx` to remove `(tabs)` anchor**

In `app/_layout.tsx`, change the `unstable_settings` and Stack:

Replace:
```typescript
export const unstable_settings = {
  anchor: "(tabs)",
};
```

With:
```typescript
export const unstable_settings = {
  initialRouteName: "index",
};
```

Update the Stack.Screen inside RootLayout:
```typescript
<Stack screenOptions={{ headerShown: false }}>
  <Stack.Screen name="index" />
</Stack>
```

Also move the global store initialization that was in `app/(tabs)/_layout.tsx` into `app/_layout.tsx`:

Add the following imports and useEffect inside `RootLayout()`:
```typescript
import { useI18n } from '@/lib/i18n';
import { useThemeStore } from '@/lib/theme-engine';
import { useA11yStore } from '@/lib/accessibility';
import { usePluginStore } from '@/lib/plugin-api';

// Inside RootLayout useEffect (existing one):
useI18n.getState().loadLocale();
useThemeStore.getState().loadTheme();
useA11yStore.getState().loadConfig();
usePluginStore.getState().loadPlugins();
```

- [ ] **Step 3: Verify the app renders**

Run: `cd ~/Shelly && npx expo start --android 2>&1 | head -20`
Expected: Expo dev server starts. On device: single screen with AgentBar at top, terminal pane in center, ContextBar at bottom.

- [ ] **Step 4: Commit**

```bash
git add app/index.tsx app/_layout.tsx
git commit -m "feat(routing): replace tab navigation with single-screen ShellLayout"
```

---

## Task 13: Add Swipe Gesture for Sidebar on Phone/Folded

**Files:**
- Modify: `components/layout/ShellLayout.tsx`

On non-wide screens, sidebar is hidden. A swipe-right gesture from the left edge reveals it.

- [ ] **Step 1: Add gesture handler to ShellLayout**

In `components/layout/ShellLayout.tsx`, add swipe detection:

Add import:
```typescript
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
```

Inside `ShellLayout`, add before the return:
```typescript
const swipeRight = Gesture.Pan()
  .activeOffsetX(30)
  .onEnd((e) => {
    if (e.translationX > 80 && useSidebarStore.getState().mode === 'hidden') {
      setMode('expanded');
    }
  });

const swipeLeft = Gesture.Pan()
  .activeOffsetX(-30)
  .onEnd((e) => {
    if (e.translationX < -80 && !layout.isWide) {
      setMode('hidden');
    }
  });

const composed = Gesture.Race(swipeRight, swipeLeft);
```

Wrap the `main` View with GestureDetector:
```typescript
<GestureDetector gesture={composed}>
  <View style={styles.main}>
    <Sidebar />
    <MultiPaneContainer />
  </View>
</GestureDetector>
```

- [ ] **Step 2: Commit**

```bash
git add components/layout/ShellLayout.tsx
git commit -m "feat(layout): add swipe gestures for sidebar reveal/hide on phone"
```

---

## Task 14: Move Keybinding Handler from Tabs Layout

**Files:**
- Modify: `components/layout/ShellLayout.tsx`

The global keyboard shortcut handler currently lives in `app/(tabs)/_layout.tsx`. Move it to ShellLayout.

- [ ] **Step 1: Copy keybinding logic to ShellLayout**

Add imports to `components/layout/ShellLayout.tsx`:
```typescript
import { Platform, useWindowDimensions } from 'react-native';
import { matchKeybinding, type KeyAction } from '@/lib/keybindings';
import { useTerminalStore } from '@/store/terminal-store';
import { useCommandPaletteStore } from '@/hooks/use-command-palette';
```

Add inside the component, before the return:
```typescript
const handleKeyAction = React.useCallback((action: KeyAction) => {
  switch (action) {
    case 'command_palette':
      useCommandPaletteStore.getState().toggle();
      break;
    case 'new_session':
      useTerminalStore.getState().addSession();
      break;
    case 'clear_terminal':
      useTerminalStore.getState().clearSession();
      break;
    case 'multi_pane_toggle':
      // In new layout, toggle sidebar instead
      const sidebar = useSidebarStore.getState();
      sidebar.setMode(sidebar.mode === 'expanded' ? 'icons' : 'expanded');
      break;
  }
}, []);

React.useEffect(() => {
  if (Platform.OS !== 'web') return;
  const handleKeyDown = (e: KeyboardEvent) => {
    const action = matchKeybinding(e.key, e.ctrlKey, e.shiftKey, e.altKey);
    if (action) {
      e.preventDefault();
      handleKeyAction(action);
    }
  };
  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, [handleKeyAction]);
```

- [ ] **Step 2: Commit**

```bash
git add components/layout/ShellLayout.tsx
git commit -m "feat(layout): move global keybinding handler to ShellLayout"
```

---

## Task 15: Auto-Detect Repositories on Mount

**Files:**
- Modify: `components/layout/ShellLayout.tsx`
- Modify: `store/sidebar-store.ts`

On app launch, scan `~` for directories containing `.git` and populate `repoPaths` in the sidebar store.

- [ ] **Step 1: Add `loadRepos` action to sidebar store**

In `store/sidebar-store.ts`, add:

```typescript
import { execCommand } from '@/hooks/use-native-exec';

// Add to SidebarState interface:
loadRepos: () => Promise<void>;

// Add implementation:
loadRepos: async () => {
  try {
    const result = await execCommand(
      'find ~/ -maxdepth 2 -name .git -type d 2>/dev/null | head -20 | sed "s/\\.git$//"'
    );
    const paths = result.trim().split('\n').filter(Boolean).map((p) => p.replace(/\/$/, ''));
    if (paths.length > 0) {
      set({ repoPaths: paths, activeRepoPath: paths[0] });
    }
  } catch {
    // Silent fail — sidebar just shows empty repos
  }
},
```

- [ ] **Step 2: Call loadRepos from ShellLayout**

In `components/layout/ShellLayout.tsx`, add to the mount useEffect:

```typescript
useSidebarStore.getState().loadRepos();
```

- [ ] **Step 3: Commit**

```bash
git add store/sidebar-store.ts components/layout/ShellLayout.tsx
git commit -m "feat(sidebar): auto-detect git repositories on mount"
```

---

## Task 16: Update pane-registry for New Pane Types

**Files:**
- Modify: `components/multi-pane/pane-registry.ts`

Add stub entries for the new pane types (ai, browser, markdown) so the type system is complete. They'll render placeholder content until Plan 2 implements them.

- [ ] **Step 1: Add stub pane entries**

In `components/multi-pane/pane-registry.ts`:

```typescript
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { ComponentType } from 'react';
import type { PaneTab } from '@/hooks/use-multi-pane';

type PaneEntry = {
  title: string;
  icon: string;
  getComponent: () => ComponentType;
};

function StubPane({ label }: { label: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: '#0A0A0A', justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ color: '#666', fontFamily: 'monospace', fontSize: 12 }}>{label} — Coming Soon</Text>
    </View>
  );
}

export const PANE_REGISTRY: Record<PaneTab, PaneEntry> = {
  terminal: {
    title: 'Terminal',
    icon: 'terminal',
    getComponent: () => require('@/app/(tabs)/terminal').default,
  },
  ai: {
    title: 'AI',
    icon: 'auto-awesome',
    getComponent: () => () => React.createElement(StubPane, { label: 'AI Pane' }),
  },
  browser: {
    title: 'Browser',
    icon: 'language',
    getComponent: () => () => React.createElement(StubPane, { label: 'Browser Pane' }),
  },
  markdown: {
    title: 'Markdown',
    icon: 'description',
    getComponent: () => () => React.createElement(StubPane, { label: 'Markdown Pane' }),
  },
  // Legacy — kept for backwards compat during migration
  index: {
    title: 'Chat',
    icon: 'chat',
    getComponent: () => require('@/app/(tabs)/index').default,
  },
  projects: {
    title: 'Projects',
    icon: 'folder',
    getComponent: () => require('@/app/(tabs)/projects').default,
  },
  settings: {
    title: 'Settings',
    icon: 'settings',
    getComponent: () => require('@/app/(tabs)/settings').default,
  },
};
```

- [ ] **Step 2: Update PaneSlot's SplitMenu to show new types first**

In `components/multi-pane/PaneSlot.tsx`, update the tab list in `SplitMenu` to prioritize new types:

Change:
```typescript
{(['index', 'terminal', 'projects', 'browser', 'creator', 'obsidian', 'snippets', 'search', 'settings'] as PaneTab[]).map(...)}
```
To:
```typescript
{(['terminal', 'ai', 'browser', 'markdown'] as PaneTab[]).map(...)}
```

- [ ] **Step 3: Commit**

```bash
git add components/multi-pane/pane-registry.ts components/multi-pane/PaneSlot.tsx
git commit -m "feat(pane-registry): add stub entries for AI, Browser, Markdown pane types"
```

---

## Task 17: Integration Smoke Test

**Files:**
- No new files

Verify the full layout works end-to-end on device.

- [ ] **Step 1: Build and test**

Run: `cd ~/Shelly && npx expo start --android 2>&1 | head -20`

Verify on device:
1. App opens to single screen (no tab bar)
2. AgentBar visible at top with agent buttons
3. Terminal pane renders in center (NativeTerminalView working)
4. ContextBar visible at bottom with cwd
5. On Z Fold6 unfolded: sidebar visible on left
6. On Z Fold6 folded: swipe right reveals sidebar
7. Pane split works (tap dashboard icon → split right → terminal)
8. Agent tap in AgentBar shows active color on pane border
9. Sidebar accordion sections expand/collapse
10. File tree loads when a repo is selected

- [ ] **Step 2: Fix any issues found**

Address rendering bugs, missing imports, or layout problems.

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "fix(layout): integration fixes for shell layout foundation"
```

---

## Notes

- **Drag-resize** between panes is already implemented in the existing `MultiPaneContainer.tsx` via the `Divider` component (Gesture.Pan + setSplitRatio). No new work needed.
- **Agent long-press settings** and **agent status dots** (green/yellow/gray) are deferred until agent status tracking is implemented (background agents run async, status is not yet reactive).
- **[+] button** and **gear icon** in AgentBar are stubs — their onPress handlers will be wired in Plan 2 (settings modal) and Plan 5 (agent creation).

## Summary

| Task | Component | Est. |
|------|-----------|------|
| 0 | Export execCommand from use-native-exec | 2 min |
| 1 | Sidebar Store | 2 min |
| 2 | Pane Store (focus + agent bindings) | 2 min |
| 3 | Extend Multi-Pane for always-on | 3 min |
| 4 | ContextBar | 3 min |
| 5 | AgentBar | 4 min |
| 6 | SidebarSection (accordion) | 3 min |
| 7 | FileTree | 4 min |
| 8 | Sidebar | 5 min |
| 9 | Agent color border on PaneSlot | 2 min |
| 10 | MultiPaneContainer inline rendering | 2 min |
| 11 | ShellLayout compositor | 4 min |
| 12 | New root screen + routing | 3 min |
| 13 | Swipe gestures for sidebar | 3 min |
| 14 | Keybinding handler migration | 3 min |
| 15 | Auto-detect repos | 3 min |
| 16 | Pane registry update | 3 min |
| 17 | Integration smoke test | 5 min |

**Total: 18 tasks, ~55 min estimated**

**Dependencies:** Task 0 is first (unblocks 4, 7, 15). Tasks 1-2 are independent. Tasks 3-10 depend on 0-2. Tasks 11-12 depend on 3-10. Tasks 13-16 depend on 11-12. Task 17 is last.

**After Plan 1:** The app runs as a single-screen terminal IDE with sidebar, agent bar, context bar, and multi-pane terminal. Tab navigation is removed. Ready for Plan 2 (AI/Browser/Markdown panes) and Plan 3 (Terminal enhancements), which can proceed in parallel.
