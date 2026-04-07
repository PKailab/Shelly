# Superset Advanced Features + Cleanup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement remaining advanced features (Kitty Graphics, Lua Scripting, SSH Profiles, Cloud Storage, Settings TUI, Workspace Isolation) and perform a full cleanup: delete dead tab routing, extract Chat to Chelly, remove unused code, update documentation.

**Architecture:** Plans 1-3 established the single-screen `ShellLayout` with pane system. The old `app/(tabs)/` routing is no longer active (`_layout.tsx` routes to `app/index.tsx` which renders `ShellLayout`), but the tab files still exist and some are loaded via `pane-registry.ts`. This plan finalizes the migration by adding the last advanced features, removing all legacy code, and preparing the Chat extraction to Chelly OSS.

**Tech Stack:** Expo 54, React Native 0.81, TypeScript, Zustand, NativeWind (TailwindCSS 3), react-native-gesture-handler, react-native-reanimated

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `lib/kitty-graphics.ts` | Kitty Graphics Protocol parser + image decoder (PNG/JPEG), sixel fallback |
| `lib/lua-runtime.ts` | Lua VM bridge (via `fengari` or `wasmoon`), config loader, event dispatch |
| `lib/workspace-manager.ts` | Per-repo session persistence, cwd switching, agent binding |
| `components/config/ConfigTUI.tsx` | TUI settings renderer for `shelly config` command |
| `components/config/LuaEngine.tsx` | Lua scripting status/debug panel (dev-only) |
| `components/layout/ProfilesSection.tsx` | SSH/SFTP profile list for sidebar Profiles accordion |
| `components/layout/CloudSection.tsx` | Cloud storage OAuth stubs for sidebar Cloud accordion |
| `store/profile-store.ts` | SSH/SFTP connection profiles CRUD + import from ~/.ssh/config |
| `store/workspace-store.ts` | Per-repository workspace state (sessions, bound agents, cwd) |
| `chelly/` | Extraction staging directory for Chat OSS (not a runtime dependency) |
| `chelly/README.md` | Chelly extraction manifest: what was moved, how to build standalone |

### Modified Files

| File | Change |
|------|--------|
| `components/multi-pane/pane-registry.ts` | Remove `index`, `projects`, `settings` legacy entries |
| `components/layout/Sidebar.tsx` | Add Profiles and Cloud accordion sections |
| `components/layout/ShellLayout.tsx` | Wire workspace switching, add `shelly config` command handler |
| `store/sidebar-store.ts` | Add `profiles` and `cloud` section state, workspace binding |
| `store/terminal-store.ts` | Add per-workspace session grouping |
| `lib/input-router.ts` | Add `shelly config` command routing to ConfigTUI |
| `lib/shelly-system-prompt.ts` | Add workspace context to AI prompt |
| `CLAUDE.md` | Update architecture section for post-redesign state |

### Deleted Files (Task 12-14)

| File | Reason |
|------|--------|
| `app/(tabs)/_layout.tsx` | Tab routing replaced by `app/index.tsx` + `ShellLayout` |
| `app/(tabs)/index.tsx` | Chat tab — extracted to Chelly |
| `app/(tabs)/projects.tsx` | Absorbed by sidebar Repositories section |
| `app/(tabs)/settings.tsx` | Replaced by `shelly config` + command palette |
| `components/chat/*.tsx` (13 files) | Extracted to `chelly/components/` |
| `components/creator/*.tsx` (8 files) | Only used by Chat tab Creator mode |
| `components/snippets/*.tsx` (2 files) | Only used by Chat tab |
| `components/preview/*.tsx` (4+ files) | Only used by Chat tab Creator mode |
| `components/ChatOnboarding.tsx` | Chat-specific onboarding |
| `store/chat-store.ts` | Chat tab state |
| `store/arena-store.ts` | Arena mode (Chat-only feature) |
| `store/creator-store.ts` | Creator mode (Chat-only feature) |
| `store/obsidian-store.ts` | Obsidian collector (Chat-only feature) |
| `store/plan-store.ts` | Plan cards (Chat-only feature) |
| `store/snippet-store.ts` | Snippets (Chat-only feature) |
| `lib/chat-onboarding.ts` | Chat onboarding logic |
| `lib/realtime-translate.ts` | Chat translate overlay |
| `lib/team-roundtable.ts` | Chat roundtable mode |
| `lib/arena-selector.ts` | Arena model selector |
| `lib/creator-engine.ts` | Creator project generation |
| `lib/obsidian-collector.ts` | Obsidian integration |
| `lib/snippet-io.ts` | Snippet file I/O |
| `hooks/use-ai-dispatch.ts` | Chat-only AI dispatch (replaced by `use-ai-pane-dispatch.ts`) |

---

## Task 0: Kitty Graphics Protocol — Image Rendering

**Files:**
- Create: `lib/kitty-graphics.ts`
- Modify: `components/terminal/TerminalBlock.tsx`

Implement the Kitty Graphics Protocol for inline image display in the terminal. When `kitty +kitten icat` or matplotlib outputs an image via the protocol, decode and render it inline.

- [ ] **Step 1: Protocol parser** — Parse Kitty APC escape sequences (`\x1b_G...;\x1b\\`). Extract action (transmit/display/delete), format (PNG/RGB/RGBA), transmission medium (direct/file/temp), image ID, placement params (rows, cols, x/y offset). Handle chunked payloads (m=1 continuation flag).
- [ ] **Step 2: Image decoder** — Base64-decode payload into `Uint8Array`. For `f=100` (PNG) and `f=32`/`f=24` (raw RGBA/RGB), convert to a data URI or write to app cache and return a `file://` URI. Respect `s=` (source width) and `v=` (source height) params.
- [ ] **Step 3: Sixel fallback** — Detect sixel escape sequences (`\x1bPq...`). Parse sixel color registers and pixel rows into an `ImageData`-equivalent, render to a canvas offscreen, export as PNG data URI. This covers tools that output sixel instead of Kitty.
- [ ] **Step 4: Inline rendering** — In `TerminalBlock.tsx`, detect image placeholders from the parser. Render `<Image>` components inline within terminal output, sized to the specified cell grid (rows x cols). Add pinch-to-zoom gesture. Respect `shelly config set kitty_graphics true|false`.
- [ ] **Step 5: Config integration** — Add `kitty_graphics: boolean` (default: true) and `sixel_enabled: boolean` (default: true) to settings store. Wire to `shelly config` command.

---

## Task 1: Lua Scripting Engine

**Files:**
- Create: `lib/lua-runtime.ts`
- Create: `components/config/LuaEngine.tsx`
- Modify: `lib/keybindings.ts`
- Modify: `lib/input-router.ts`

Provide WezTerm-style user scripting via `~/.shelly/config.lua`.

- [ ] **Step 1: Lua VM selection** — Evaluate `wasmoon` (Lua 5.4 via WASM, ~200KB) vs `fengari` (Lua 5.3 in JS). Choose `wasmoon` for better compat and async support. Add `wasmoon` to dependencies.
- [ ] **Step 2: Runtime wrapper** — Create `LuaRuntime` class: `init()` loads WASM, `loadConfig(path)` reads and executes `~/.shelly/config.lua`, `call(fn, ...args)` invokes Lua functions. Register JS bridge functions in Lua global table `shelly.*`.
- [ ] **Step 3: Event hooks** — Define events: `on_command_complete(cmd, exit_code, duration)`, `on_directory_change(old_cwd, new_cwd)`, `on_error(error_text)`, `on_pane_focus(pane_id, pane_type)`, `on_session_start()`. Fire events from `terminal-store.ts` and `pane-store.ts` actions.
- [ ] **Step 4: Custom keybindings** — Expose `shelly.bind(key_combo, lua_callback)` in the Lua bridge. When a keybinding fires, check Lua bindings before built-in bindings. Format: `shelly.bind("ctrl+shift+g", function() shelly.exec("git status") end)`.
- [ ] **Step 5: Plugin API bridge** — Expose existing `plugin-api.ts` functions to Lua: `shelly.exec(cmd)`, `shelly.notify(msg)`, `shelly.pane.split(type)`, `shelly.pane.focus(id)`, `shelly.config.get(key)`, `shelly.config.set(key, value)`. Serialize return values across JS/Lua boundary.
- [ ] **Step 6: Error handling** — Wrap all Lua execution in try/catch. On syntax/runtime error, display error in terminal as red dimmed text with file:line reference. Add `shelly lua reload` command to re-read config without app restart.

---

## Task 2: SSH/SFTP Connection Profile Manager

**Files:**
- Create: `store/profile-store.ts`
- Create: `components/layout/ProfilesSection.tsx`
- Modify: `components/layout/Sidebar.tsx`

Tabby-inspired connection profiles in the sidebar Profiles section.

- [ ] **Step 1: Profile store** — Zustand store with `profiles: Profile[]`, where `Profile = { id, name, host, port, user, keyFile?, jumpHost?, lastConnected? }`. Actions: `addProfile`, `updateProfile`, `deleteProfile`, `importFromSSHConfig`. Persist to AsyncStorage key `shelly-profiles`.
- [ ] **Step 2: SSH config import** — Parse `~/.ssh/config` (Host, HostName, Port, User, IdentityFile, ProxyJump). Map each `Host` block to a `Profile`. Handle wildcards by skipping `Host *` entries. Show import count as toast.
- [ ] **Step 3: ProfilesSection UI** — Accordion section in sidebar. List profiles with host icon + name + status dot (gray=disconnected). Tap profile = open new Terminal pane with `ssh user@host -p port -i keyFile` pre-filled and auto-executed. Long-press = edit/delete sheet.
- [ ] **Step 4: Add/Edit profile form** — Bottom sheet with fields: Name, Host, Port (default 22), User, Key File (file picker), Jump Host (optional). Validate host format. Save button calls `addProfile`/`updateProfile`.
- [ ] **Step 5: Connection status** — After SSH command executes, detect connection success/failure from terminal output patterns (`Connection refused`, `Permission denied`, prompt change). Update profile's status dot (green=connected, red=failed, gray=disconnected).

---

## Task 3: Cloud Storage OAuth Stubs

**Files:**
- Create: `components/layout/CloudSection.tsx`
- Modify: `components/layout/Sidebar.tsx`
- Modify: `store/sidebar-store.ts`

Sidebar Cloud section with OAuth placeholders for Google Drive, Dropbox, OneDrive.

- [ ] **Step 1: CloudSection component** — Accordion section showing three providers, each with icon + name + status badge ("Connect" or "Linked"). Tap "Connect" shows alert: "Cloud storage integration coming soon." This is a stub for future OAuth implementation.
- [ ] **Step 2: Sidebar integration** — Add CloudSection between Device and Ports sections in `Sidebar.tsx`. Add `cloudProviders` state to `sidebar-store.ts` with `{ id, name, icon, connected: boolean }` for each provider.
- [ ] **Step 3: OAuth architecture doc** — Write `docs/cloud-storage-oauth.md` documenting the planned OAuth flow: Expo AuthSession for each provider, token storage in SecureStore, file browser API integration. This is documentation only — no OAuth implementation in this plan.

---

## Task 4: Settings TUI (`shelly config`)

**Files:**
- Create: `components/config/ConfigTUI.tsx`
- Modify: `lib/input-router.ts`
- Modify: `store/terminal-store.ts`

Replace the Settings tab with a terminal-native TUI.

- [ ] **Step 1: Config command routing** — In `input-router.ts`, intercept `shelly config` (no args) to render ConfigTUI inline in the terminal pane. Intercept `shelly config set <key> <value>` for direct CLI setting. Intercept `shelly config get <key>` for value lookup.
- [ ] **Step 2: ConfigTUI renderer** — React component that renders a navigable settings menu using terminal-style UI (monospace text, `>` cursor, bracketed selections). Sections: General, Terminal, AI, Theme, Sound, Accessibility. Each setting shows current value and accepts input.
- [ ] **Step 3: Setting definitions** — Create settings schema: `{ key, label, type: 'boolean'|'string'|'number'|'select', options?, default, description }`. Source from existing `terminal-store` settings + `theme-engine` + `sounds` + `accessibility` stores.
- [ ] **Step 4: Bidirectional sync** — When ConfigTUI changes a value, update the corresponding Zustand store. When a store value changes externally, ConfigTUI reflects it. Use store subscriptions.
- [ ] **Step 5: Migrate settings from Settings tab** — Audit `app/(tabs)/settings.tsx` and `components/settings/` for all configurable options. Ensure every setting is accessible via `shelly config`. Document any settings that are intentionally dropped.

---

## Task 5: Repository Workspace Isolation

**Files:**
- Create: `store/workspace-store.ts`
- Create: `lib/workspace-manager.ts`
- Modify: `store/sidebar-store.ts`
- Modify: `store/terminal-store.ts`
- Modify: `components/layout/Sidebar.tsx`

Per-repository terminal sessions with isolated state.

- [ ] **Step 1: Workspace store** — Zustand store: `workspaces: Map<repoPath, Workspace>` where `Workspace = { repoPath, sessionIds: string[], boundAgentId?, lastAccessed }`. Actions: `switchWorkspace(path)`, `bindAgent(path, agentId)`, `getActiveWorkspace()`. Persist to AsyncStorage.
- [ ] **Step 2: Workspace manager** — On `switchWorkspace`: (a) save current terminal sessions to outgoing workspace, (b) change cwd for all terminal panes, (c) restore incoming workspace's sessions (or create fresh), (d) update sidebar file tree, (e) update context bar.
- [ ] **Step 3: Sidebar binding** — When user taps a repository in sidebar Repositories section, call `switchWorkspace(repoPath)`. Show bound agent name/icon next to repo name. Long-press repo = context menu with "Bind Agent" option showing agent picker.
- [ ] **Step 4: Session grouping** — Extend `terminal-store.ts` sessions with `workspacePath?: string`. On workspace switch, filter visible sessions to current workspace. Inactive workspace sessions stay alive in background (immortal sessions via tmux).
- [ ] **Step 5: Context propagation** — On workspace switch, update: (a) AI pane system prompt with new project context, (b) autocomplete sources (PATH, project files), (c) git branch in context bar, (d) Lua `on_directory_change` event.

---

## Task 6: Old Tab Routing Deletion

**Files:**
- Delete: `app/(tabs)/_layout.tsx`
- Modify: `components/multi-pane/pane-registry.ts`

Remove the legacy tab routing infrastructure. The tab _layout is dead code since `app/_layout.tsx` routes directly to `app/index.tsx`.

- [ ] **Step 1: Verify no remaining routes** — Confirm `app/_layout.tsx` has `initialRouteName: "index"` and no Stack.Screen references to `(tabs)`. Confirm Expo Router does not auto-discover `(tabs)` when `_layout.tsx` is missing.
- [ ] **Step 2: Delete `app/(tabs)/_layout.tsx`** — This file defines the bottom tab bar, multi-pane overlay, WelcomeWizard mount, and global keybinding handler. Verify each responsibility is handled elsewhere: tab bar (removed by design), multi-pane (ShellLayout), WelcomeWizard (ShellLayout), keybindings (ShellLayout or `_layout.tsx` root).
- [ ] **Step 3: Clean pane-registry** — Remove `index`, `projects`, `settings` entries from `PANE_REGISTRY`. These were marked "Legacy" and should no longer be loadable as pane types. Keep `terminal` entry pointing to `app/(tabs)/terminal.tsx` for now (moved in Task 8).
- [ ] **Step 4: Move terminal screen** — Move `app/(tabs)/terminal.tsx` to `components/panes/TerminalPane.tsx` (or create a thin wrapper). Update `pane-registry.ts` to point to the new location. Delete the now-empty `app/(tabs)/` directory.

---

## Task 7: Chat to Chelly Extraction

**Files:**
- Create: `chelly/` directory structure
- Move (copy): `components/chat/*.tsx` (13 files)
- Move (copy): `store/chat-store.ts`, `store/arena-store.ts`, `store/plan-store.ts`, `store/creator-store.ts`
- Move (copy): related libs and hooks

Extract Chat UI components to a staging directory for the Chelly OSS repository.

- [ ] **Step 1: Create staging directory** — `chelly/components/`, `chelly/store/`, `chelly/lib/`, `chelly/hooks/`. This is a copy-based extraction (original files stay until Task 8 deletes them).
- [ ] **Step 2: Copy Chat components** — Copy all 13 files from `components/chat/`: `ActionBlock.tsx`, `ActionsWizardBubble.tsx`, `ApprovalBubble.tsx`, `ArenaBubble.tsx`, `AutoCheckProposalBubble.tsx`, `ChatBubble.tsx`, `ChatHeader.tsx`, `ChatMessageList.tsx`, `EditSheet.tsx`, `ErrorSummaryBubble.tsx`, `PlanCardList.tsx`, `TemplateGallery.tsx`, `TranslateOverlay.tsx`.
- [ ] **Step 3: Copy stores** — `chat-store.ts`, `arena-store.ts`, `plan-store.ts`, `creator-store.ts`, `snippet-store.ts`, `obsidian-store.ts`. Copy `store/types.ts` (shared types).
- [ ] **Step 4: Copy libs and hooks** — `lib/chat-onboarding.ts`, `lib/realtime-translate.ts`, `lib/team-roundtable.ts`, `lib/arena-selector.ts`, `lib/creator-engine.ts`, `lib/obsidian-collector.ts`, `lib/snippet-io.ts`. Hook: `hooks/use-ai-dispatch.ts`.
- [ ] **Step 5: Copy supporting components** — `components/creator/*.tsx` (8 files), `components/snippets/*.tsx` (2 files), `components/preview/*.tsx` (4+ files), `components/ChatOnboarding.tsx`.
- [ ] **Step 6: Write extraction manifest** — `chelly/README.md` documenting: file inventory, shared dependencies (Zustand, NativeWind, i18n), what needs to be decoupled (terminal-store refs, input-router refs, theme-engine), and steps to create standalone Expo app.

---

## Task 8: Dead Code Deletion

**Files:**
- Delete: all files listed in "Deleted Files" table above
- Modify: files that import deleted modules (fix imports)

Remove all Chat-related code, unused stores, and orphaned libs from the Shelly codebase.

- [ ] **Step 1: Delete Chat tab and components** — Remove `app/(tabs)/index.tsx`, all 13 files in `components/chat/`, `components/ChatOnboarding.tsx`. Remove `components/creator/` (8 files), `components/snippets/` (2 files), `components/preview/` (4+ files, check if `WebTab.tsx` is used by BrowserPane first).
- [ ] **Step 2: Delete Chat stores** — Remove `store/chat-store.ts`, `store/arena-store.ts`, `store/creator-store.ts`, `store/obsidian-store.ts`, `store/plan-store.ts`, `store/snippet-store.ts`.
- [ ] **Step 3: Delete Chat libs** — Remove `lib/chat-onboarding.ts`, `lib/realtime-translate.ts`, `lib/team-roundtable.ts`, `lib/arena-selector.ts`, `lib/creator-engine.ts`, `lib/obsidian-collector.ts`, `lib/snippet-io.ts`.
- [ ] **Step 4: Delete Chat hook** — Remove `hooks/use-ai-dispatch.ts` (replaced by `hooks/use-ai-pane-dispatch.ts`).
- [ ] **Step 5: Fix broken imports** — Search codebase for all imports referencing deleted files. In `app/(tabs)/settings.tsx` (already deleted), `components/terminal/TerminalBlock.tsx`, `components/terminal/TerminalHeader.tsx`, `components/panes/AIPane.tsx`, `lib/ai-pane-context.ts`, `lib/terminal-context.ts` — remove or replace import references. TypeScript build must pass.
- [ ] **Step 6: Verify build** — Run `npx expo export --platform android --dev` (or `npx tsc --noEmit`) to confirm no broken imports or type errors remain.

---

## Task 9: i18n Key Cleanup

**Files:**
- Modify: `lib/i18n/en.ts`, `lib/i18n/ja.ts` (and any other locale files)

Remove translation keys that are only used by deleted Chat/Settings/Projects components.

- [ ] **Step 1: Identify dead keys** — Cross-reference all i18n keys against remaining codebase (after Task 8 deletions). Any key referenced only by deleted files is dead.
- [ ] **Step 2: Remove dead keys** — Delete unused entries from all locale files. Keep keys used by: terminal, panes, sidebar, agent bar, context bar, onboarding, voice, settings TUI.
- [ ] **Step 3: Add new keys** — Add i18n keys for new features: ConfigTUI labels, ProfilesSection strings, CloudSection strings, Workspace switching messages, Lua error messages, Kitty Graphics toggle label.

---

## Task 10: Settings Components Cleanup

**Files:**
- Evaluate: `components/settings/LlamaCppSection.tsx`, `components/settings/McpSection.tsx`
- Evaluate: `store/settings-store.ts`
- Evaluate: `store/execution-log-store.ts`, `store/mcp-store.ts`

Decide fate of settings sub-components and related stores.

- [ ] **Step 1: Audit LlamaCppSection** — Check if local LLM settings are needed in `shelly config`. If yes, migrate to ConfigTUI. If no, delete.
- [ ] **Step 2: Audit McpSection** — Check if MCP server config is needed in `shelly config`. If yes, migrate to ConfigTUI. If no, delete.
- [ ] **Step 3: Audit stores** — `settings-store.ts`: check if used outside settings tab. `execution-log-store.ts`: check if used by terminal features. `mcp-store.ts`: check if used by agent system. Keep stores that serve non-Chat purposes; delete the rest.
- [ ] **Step 4: Delete `components/settings/` directory** if both components are migrated or removed.

---

## Task 11: Usage Components Audit

**Files:**
- Evaluate: `components/UsagePanel.tsx`, `components/UsageBarChart.tsx`, `components/UsageIndicator.tsx`
- Evaluate: `store/usage-store.ts`, `lib/usage-parser.ts`, `lib/usage-alert.ts`

- [ ] **Step 1: Check usage integration** — These components show API token usage. Determine if they are shown in terminal header, context bar, or settings. If only in deleted settings tab, mark for deletion.
- [ ] **Step 2: Migrate or delete** — If usage display is valuable, add to `shelly config` or context bar. If not needed, delete all 5 files plus `store/usage-store.ts`.

---

## Task 12: ProGate and Feature Gate Cleanup

**Files:**
- Evaluate: `components/ProGate.tsx`, `lib/feature-gate.ts`, `lib/pro.ts`

- [ ] **Step 1: Audit ProGate** — Check if Pro gating is used in any non-deleted component. If only in Chat/Settings, delete.
- [ ] **Step 2: Audit feature-gate** — If only used by deleted features, delete. If used by terminal/pane features, keep.

---

## Task 13: Documentation Update

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/superpowers/specs/2026-04-07-superset-ui-redesign.md` (mark Phase 5 complete)

- [ ] **Step 1: Update CLAUDE.md** — Reflect post-redesign architecture: single-screen layout, no tabs, pane system, sidebar sections, removed Chat. Update file structure section, key stores, key components.
- [ ] **Step 2: Update spec** — Mark Phase 5 as complete in section 7. Add implementation notes for any deviations from spec.
- [ ] **Step 3: Remove stale docs** — Check `docs/` for documents referencing deleted components (Chat, tab routing, cross-pane as separate system). Add deprecation notes or delete if fully superseded.

---

## Task 14: Final Verification

**Files:** None (verification only)

- [ ] **Step 1: TypeScript check** — `npx tsc --noEmit` passes with zero errors.
- [ ] **Step 2: Lint check** — `npx eslint . --ext .ts,.tsx` passes (or only pre-existing warnings).
- [ ] **Step 3: Bundle check** — `npx expo export --platform android --dev` completes without errors.
- [ ] **Step 4: File inventory** — Confirm `app/(tabs)/` directory is fully deleted. Confirm `components/chat/`, `components/creator/`, `components/snippets/`, `components/preview/` are deleted. Confirm `chelly/` extraction directory exists with all Chat files.
- [ ] **Step 5: Smoke test** — Open app on device/emulator. ShellLayout renders. Terminal pane works. Sidebar opens. AI pane loads. No crash on startup.

---

## Dependency Graph

```
Task 0 (Kitty Graphics)     ─── independent
Task 1 (Lua Scripting)      ─── independent
Task 2 (SSH Profiles)       ─── independent
Task 3 (Cloud Stubs)        ─── independent
Task 4 (Settings TUI)       ─── independent
Task 5 (Workspace)          ─── independent

Task 6 (Tab Deletion)       ─── depends on Task 4 (settings migrated)
Task 7 (Chelly Extraction)  ─── independent (copy-based, non-destructive)
Task 8 (Dead Code Delete)   ─── depends on Task 6, Task 7
Task 9 (i18n Cleanup)       ─── depends on Task 8
Task 10 (Settings Cleanup)  ─── depends on Task 4, Task 8
Task 11 (Usage Audit)       ─── depends on Task 8
Task 12 (ProGate Audit)     ─── depends on Task 8

Task 13 (Docs)              ─── depends on Task 8
Task 14 (Verification)      ─── depends on ALL above
```

**Recommended execution order:**
1. Tasks 0-5 in parallel (6 independent feature tasks)
2. Tasks 6-7 (tab deletion + Chelly extraction)
3. Task 8 (bulk deletion)
4. Tasks 9-12 in parallel (cleanup audits)
5. Task 13 (docs)
6. Task 14 (verification)
