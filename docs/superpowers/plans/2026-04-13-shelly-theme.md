# Shelly Theme Preset — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new "Shelly" theme preset that matches the mock images pixel-for-pixel in color and font, make it the default, and let users switch among presets at runtime without destroying PTY sessions.

**Architecture:** Centralize palettes in a new `lib/theme-presets.ts`. Keep `theme.config.ts`'s `colors` export as a single mutable object whose fields are overwritten via `Object.assign` on preset switch. A tiny Zustand store bumps a version number on switch; `ShellLayout` reads the version and uses it as a React `key` to force a full re-render (identity-stable object, fresh render tree). Native PTY stays untouched because only JS styles re-compute.

**Tech Stack:** React Native / Expo, Zustand, existing `@expo-google-fonts/silkscreen` bundle, existing terminal-view module.

**Spec:** `docs/superpowers/specs/2026-04-13-shelly-theme-design.md`

---

## File Structure

### New files

- `lib/theme-presets.ts` — Defines `shellyPalette` (mock-faithful) + `silkscreenPalette` (current colors copied out of theme.config), exports `themePresets` map, `applyThemePreset(id)` function that mutates the live `colors` object and bumps version.
- `store/theme-version-store.ts` — Zustand store with `version: number` + `bumpVersion()`.

### Modified files

- `theme.config.ts` — `colors` becomes a mutable `Palette` object. Static values move out into `lib/theme-presets.ts` as `silkscreenPalette`. Initial `colors` is seeded from `shellyPalette`.
- `store/types.ts` — `uiFont` union gains `'shelly'`.
- `store/settings-store.ts` — Default `uiFont: 'shelly'`.
- `app/_layout.tsx` — Call `applyThemePreset(settings.uiFont ?? 'shelly')` on mount, re-apply when `settings.uiFont` changes.
- `components/layout/ShellLayout.tsx` — Read `themeVersion` from the store, use it as `key` on the root `<View>`.
- `components/layout/SettingsDropdown.tsx` — Add a "Shelly" option to the Font segment, make it the first/default entry.
- `components/panes/TerminalPane.tsx` — Pick the native terminal `fontFamily` + `colorScheme` from `settings.uiFont`.
- `lib/theme-to-terminal-colors.ts` — Export `presetToTerminalColors(id)` that returns the right terminal color scheme for the active preset.
- `lib/neon-glow.ts` — Rebuild glow constants from the active palette so `neonTextGlow` / `neonGlow*` pick up preset switches.

### Untouched

- The 100+ files that do `import { colors as C } from '@/theme.config'`. The exported object identity stays the same, only field values change, so re-rendering them after a version bump picks up the new values.

---

## Task 1: Theme version store

**Files:**
- Create: `store/theme-version-store.ts`

- [ ] **Step 1: Create the store file**

```ts
// store/theme-version-store.ts
import { create } from 'zustand';

/**
 * Global "theme version" counter. Bumped every time applyThemePreset()
 * rewrites the live colors object so consumers can re-render. Kept
 * dead simple — one number, one setter — because the only subscriber
 * is ShellLayout's root <View key={version}>.
 */
export const useThemeVersionStore = create<{
  version: number;
  bumpVersion: () => void;
}>((set) => ({
  version: 0,
  bumpVersion: () => set((s) => ({ version: s.version + 1 })),
}));
```

- [ ] **Step 2: Typecheck**

Run: `cd ~/Shelly && pnpm exec tsc --noEmit`
Expected: `0 errors`

- [ ] **Step 3: Commit**

```bash
git add store/theme-version-store.ts
git commit -m "feat(theme): add theme-version store for runtime preset swaps"
```

---

## Task 2: Palette definitions

**Files:**
- Create: `lib/theme-presets.ts`

- [ ] **Step 1: Write the presets file with the mock palette**

```ts
// lib/theme-presets.ts
//
// Theme presets. Each preset fully describes the palette a user can flip
// between at runtime via Settings → Display → Font. theme.config.ts
// imports shellyPalette at boot; applyThemePreset mutates the live
// colors object in place so the 100+ files that already do
// `import { colors as C } from '@/theme.config'` don't need to change.

import { Text } from 'react-native';

// Keep in sync with the Palette type in theme.config.ts.
export type Palette = Record<string, string>;

export type ThemePresetId = 'shelly' | 'silkscreen' | 'pixel' | 'mono';

export type ThemePreset = {
  id: ThemePresetId;
  font: string;
  colors: Palette;
};

// ── Shelly palette — extracted pixel-by-pixel from docs/images/mock-*.jpg ──
// This IS the mock. Do not drift without updating the spec first.
export const shellyPalette: Palette = {
  // Backgrounds
  bgDeep:     '#0A0A0A',
  bgSurface:  '#111111',
  bgSidebar:  '#0D0D0D',
  bgPanel:    '#1A1A1A',
  bgHover:    '#151515',
  border:         '#1C1C1C',
  borderLight:    '#2A2A2A',

  // Accents (mock-exact)
  accent:        '#00D4AA',  // teal — active, prompts, READING TERMINAL
  accentGreen:   '#4ADE80',  // + diff, LINKED, :3000, branch
  accentBlue:    '#60A5FA',  // YOU, folder/file, DEVICE, APP/ ls-dir
  accentSky:     '#38BDF8',  // COMPONENTS/ ls-dir, :8081 EXPO
  accentPurple:  '#A78BFA',  // IMPORT/FROM/USESTATE, CLAUDE label
  accentPink:    '#EC4899',  // string literals 'REACT'
  accentAmber:   '#F59E0B',  // BASH warning, EDIT dot, ALLOW, RUNNING
  accentRed:     '#F87171',  // - diff, README.MD
  accentCode:    '#60A5FA',  // alias for accentBlue, used by file-icon colorizer
  warning:       '#F59E0B',  // alias for accentAmber

  // Text
  text1:      '#E5E7EB',
  text2:      '#9CA3AF',
  text3:      '#6B7280',
  text4:      '#374151',

  // Semantic
  errorText:  '#F87171',
  errorBg:    'rgba(248,113,113,0.12)',
  addText:    '#4ADE80',
  addBg:      'rgba(74,222,128,0.12)',

  // Buttons
  btnPrimaryBg:     '#00D4AA',
  btnPrimaryText:   '#000000',
  btnSecondaryBg:   '#1F2937',
  btnSecondaryText: '#E5E7EB',

  // Badges
  badgeRunningBg:   'rgba(245,158,11,0.15)',
  badgeRunningText: '#F59E0B',
  badgeLinkedBg:    'rgba(74,222,128,0.15)',
  badgeLinkedText:  '#4ADE80',
  badgeConnectBg:   '#111111',
  badgeConnectText: '#6B7280',

  // Layout buttons
  layoutActiveBg:     '#00D4AA',
  layoutActiveText:   '#000000',
  layoutInactiveBg:   '#111111',
  layoutInactiveText: '#6B7280',

  // CRT badge
  crtBadgeBg: '#0D0D0D',
};

// ── Silkscreen palette — the old static theme.config.ts values, kept as a
// separate preset so existing users with `settings.uiFont === 'silkscreen'`
// don't see their screen shift. Copy-paste current theme.config.ts colors
// into this object verbatim.
export const silkscreenPalette: Palette = {
  bgDeep:     '#0A0A0A',
  bgSurface:  '#111111',
  bgSidebar:  '#0D0D0D',
  bgPanel:    '#1A1A1A',
  bgHover:    '#151515',
  border:         '#1C1C1C',
  borderLight:    '#2A2A2A',

  accent:        '#00D4AA',
  accentGreen:   '#22C55E',
  accentBlue:    '#60A5FA',
  accentSky:     '#38BDF8',
  accentPurple:  '#A78BFA',
  accentPink:    '#EC4899',
  accentAmber:   '#F59E0B',
  accentRed:     '#EF4444',
  accentCode:    '#60A5FA',
  warning:       '#F59E0B',

  text1:      '#E5E7EB',
  text2:      '#6B7280',
  text3:      '#374151',
  text4:      '#1F2937',

  errorText:  '#EF4444',
  errorBg:    '#7F1D1D',
  addText:    '#00D4AA',
  addBg:      '#064E3B',

  btnPrimaryBg:     '#00D4AA',
  btnPrimaryText:   '#000000',
  btnSecondaryBg:   '#1F2937',
  btnSecondaryText: '#E5E7EB',

  badgeRunningBg:   '#022C22',
  badgeRunningText: '#00D4AA',
  badgeLinkedBg:    '#022C22',
  badgeLinkedText:  '#00D4AA',
  badgeConnectBg:   '#1F2937',
  badgeConnectText: '#6B7280',

  layoutActiveBg:     '#00D4AA',
  layoutActiveText:   '#000000',
  layoutInactiveBg:   '#111111',
  layoutInactiveText: '#6B7280',

  crtBadgeBg: '#0D0D0D',
};

export const themePresets: Record<ThemePresetId, ThemePreset> = {
  shelly:     { id: 'shelly',     font: 'Silkscreen',   colors: shellyPalette },
  silkscreen: { id: 'silkscreen', font: 'Silkscreen',   colors: silkscreenPalette },
  pixel:      { id: 'pixel',      font: 'PressStart2P', colors: silkscreenPalette },
  mono:       { id: 'mono',       font: 'monospace',    colors: silkscreenPalette },
};

// ── Runtime apply ──────────────────────────────────────────────────
// Lazy imports avoid circular dependency with theme.config.ts (which
// imports from this file to seed its initial palette).

export function applyThemePreset(id: ThemePresetId) {
  const preset = themePresets[id];
  if (!preset) return;

  // 1. Swap the live colors object fields in place.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const themeConfig = require('@/theme.config');
  Object.assign(themeConfig.colors, preset.colors);

  // 2. Re-inject the Text defaultProps so any freshly mounted Text
  //    picks up the new font family without waiting for its parent
  //    to re-render.
  (Text as any).defaultProps = (Text as any).defaultProps || {};
  (Text as any).defaultProps.style = {
    ...((Text as any).defaultProps?.style || {}),
    fontFamily: preset.font,
  };

  // 3. Bump the theme version so ShellLayout forces a full re-render.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useThemeVersionStore } = require('@/store/theme-version-store');
  useThemeVersionStore.getState().bumpVersion();
}
```

- [ ] **Step 2: Typecheck**

Run: `cd ~/Shelly && pnpm exec tsc --noEmit`
Expected: `0 errors` (there may be warnings about require() usage; they are fine)

- [ ] **Step 3: Commit**

```bash
git add lib/theme-presets.ts
git commit -m "feat(theme): add themePresets map + applyThemePreset runtime swap"
```

---

## Task 3: theme.config.ts — mutable colors export

**Files:**
- Modify: `theme.config.ts`

- [ ] **Step 1: Read the current file**

Read `theme.config.ts` so you know the shape of the `colors` export.

- [ ] **Step 2: Replace the static colors literal with a mutable import-seeded object**

Find the `export const colors = { ... }` block and replace with:

```ts
import { shellyPalette, type Palette } from '@/lib/theme-presets';

// Mutable on purpose: applyThemePreset() rewrites these fields in place
// at runtime when the user flips Settings → Display → Font. Readers keep
// the same object identity and pick up new values on the next render.
export const colors: Palette = { ...shellyPalette };
```

Keep `export const fonts`, `export const sizes`, `export const padding`, `export const radii`, `export const icons` unchanged.

Move the current literal color values out of `theme.config.ts` into `lib/theme-presets.ts`'s `silkscreenPalette` (Task 2 already wrote that, so this is verify-only).

- [ ] **Step 3: Typecheck**

Run: `cd ~/Shelly && pnpm exec tsc --noEmit`
Expected: `0 errors`

- [ ] **Step 4: Commit**

```bash
git add theme.config.ts
git commit -m "refactor(theme): seed colors from shellyPalette, make it mutable"
```

---

## Task 4: Extend uiFont type

**Files:**
- Modify: `store/types.ts`

- [ ] **Step 1: Find the uiFont line**

Run: `grep -n "uiFont" ~/Shelly/store/types.ts`
Expected: one or two lines including the union type.

- [ ] **Step 2: Replace the union**

Change:

```ts
uiFont?: 'silkscreen' | 'pixel' | 'mono';
```

to:

```ts
/** UI preset: 'shelly' is mock-faithful default, others keep the current palette. */
uiFont?: 'shelly' | 'silkscreen' | 'pixel' | 'mono';
```

- [ ] **Step 3: Typecheck**

Run: `cd ~/Shelly && pnpm exec tsc --noEmit`
Expected: `0 errors`

- [ ] **Step 4: Commit**

```bash
git add store/types.ts
git commit -m "feat(settings): add 'shelly' variant to uiFont union"
```

---

## Task 5: Default to Shelly preset

**Files:**
- Modify: `store/settings-store.ts`

- [ ] **Step 1: Find the default**

Run: `grep -n "uiFont" ~/Shelly/store/settings-store.ts`

- [ ] **Step 2: Change default**

Change:

```ts
uiFont: 'silkscreen',
```

to:

```ts
uiFont: 'shelly',
```

- [ ] **Step 3: Typecheck**

Run: `cd ~/Shelly && pnpm exec tsc --noEmit`
Expected: `0 errors`

- [ ] **Step 4: Commit**

```bash
git add store/settings-store.ts
git commit -m "feat(settings): default uiFont to 'shelly'"
```

---

## Task 6: Wire _layout.tsx to apply preset on boot and on change

**Files:**
- Modify: `app/_layout.tsx`

- [ ] **Step 1: Find the existing font-family effect**

Run: `grep -n "uiFont\|fontFamily" ~/Shelly/app/_layout.tsx`
Expected: the block that currently sets `Text.defaultProps.style.fontFamily` based on `uiFont`.

- [ ] **Step 2: Replace the effect with applyThemePreset**

Find the `useEffect` that computes `fontFamily` and sets `Text.defaultProps`. Replace the whole effect with:

```ts
useEffect(() => {
  // applyThemePreset updates colors + font + bumps theme version
  // in one shot. See lib/theme-presets.ts.
  import('@/lib/theme-presets').then(({ applyThemePreset }) => {
    applyThemePreset(uiFont as any);
    logInfo('RootLayout', 'Theme preset applied: ' + uiFont);
  });
}, [uiFont, fontsLoaded]);
```

Delete the old inline `const fontFamily = ...` block and the `(Text as any).defaultProps...` lines it set.

- [ ] **Step 3: Default uiFont fallback**

Find `const uiFont = useSettingsStore((s) => s.settings.uiFont ?? 'silkscreen');` and change the fallback to `'shelly'`:

```ts
const uiFont = useSettingsStore((s) => s.settings.uiFont ?? 'shelly');
```

- [ ] **Step 4: Typecheck**

Run: `cd ~/Shelly && pnpm exec tsc --noEmit`
Expected: `0 errors`

- [ ] **Step 5: Commit**

```bash
git add app/_layout.tsx
git commit -m "feat(theme): call applyThemePreset on boot + uiFont change"
```

---

## Task 7: ShellLayout re-mounts on theme version bump

**Files:**
- Modify: `components/layout/ShellLayout.tsx`

- [ ] **Step 1: Find the root View**

Run: `grep -n "styles.root\|insets.top" ~/Shelly/components/layout/ShellLayout.tsx`
Expected: the outer `<View style={[styles.root, ...]}>`.

- [ ] **Step 2: Subscribe to theme version**

Add at the top of the `ShellLayout` function:

```ts
import { useThemeVersionStore } from '@/store/theme-version-store';
// ...
const themeVersion = useThemeVersionStore((s) => s.version);
```

- [ ] **Step 3: Use version as key on the root View**

Change:

```tsx
<View style={[styles.root, { backgroundColor: c.background, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
```

to:

```tsx
<View
  key={`theme-${themeVersion}`}
  style={[styles.root, { backgroundColor: c.background, paddingTop: insets.top, paddingBottom: insets.bottom }]}
>
```

- [ ] **Step 4: Typecheck**

Run: `cd ~/Shelly && pnpm exec tsc --noEmit`
Expected: `0 errors`

- [ ] **Step 5: Commit**

```bash
git add components/layout/ShellLayout.tsx
git commit -m "feat(theme): remount ShellLayout on theme version bump"
```

---

## Task 8: SettingsDropdown Shelly option

**Files:**
- Modify: `components/layout/SettingsDropdown.tsx`

- [ ] **Step 1: Find the font family row**

Run: `grep -n "FontFamilyRow\|uiFont\|segGroup" ~/Shelly/components/layout/SettingsDropdown.tsx`

- [ ] **Step 2: Add 'shelly' to the options array**

Find the `options` array inside `FontFamilyRow`. Change:

```ts
const options: Array<{ value: 'silkscreen' | 'pixel' | 'mono'; label: string }> = [
  { value: 'silkscreen', label: 'Silk' },
  { value: 'pixel',      label: '8bit' },
  { value: 'mono',       label: 'Mono' },
];
```

to:

```ts
const options: Array<{ value: 'shelly' | 'silkscreen' | 'pixel' | 'mono'; label: string }> = [
  { value: 'shelly',     label: 'Shelly' },
  { value: 'silkscreen', label: 'Silk' },
  { value: 'pixel',      label: '8bit' },
  { value: 'mono',       label: 'Mono' },
];
```

Also find the `useSettingsStore` selector that reads `uiFont` and update its fallback:

```ts
const uiFont = useSettingsStore((s) => s.settings.uiFont ?? 'shelly');
```

- [ ] **Step 3: Typecheck**

Run: `cd ~/Shelly && pnpm exec tsc --noEmit`
Expected: `0 errors`

- [ ] **Step 4: Commit**

```bash
git add components/layout/SettingsDropdown.tsx
git commit -m "feat(settings): add Shelly option to Font segment"
```

---

## Task 9: TerminalPane — preset-aware native font + color scheme

**Files:**
- Modify: `components/panes/TerminalPane.tsx`

- [ ] **Step 1: Find the NativeTerminalView fontFamily prop**

Run: `grep -n "fontFamily\|colorScheme" ~/Shelly/components/panes/TerminalPane.tsx`
Expected: a block that picks fontFamily from `settings.uiFont` and another that derives `terminalColorScheme`.

- [ ] **Step 2: Extend the fontFamily mapping for 'shelly'**

Find:

```tsx
fontFamily={
  settings.uiFont === 'silkscreen'
    ? 'silkscreen'
    : settings.uiFont === 'pixel'
    ? 'pixel-mplus'
    : 'jetbrains-mono'
}
```

Change to:

```tsx
fontFamily={
  settings.uiFont === 'shelly' || settings.uiFont === 'silkscreen'
    ? 'silkscreen'
    : settings.uiFont === 'pixel'
    ? 'pixel-mplus'
    : 'jetbrains-mono'
}
```

- [ ] **Step 3: Typecheck**

Run: `cd ~/Shelly && pnpm exec tsc --noEmit`
Expected: `0 errors`

- [ ] **Step 4: Commit**

```bash
git add components/panes/TerminalPane.tsx
git commit -m "feat(terminal): use Silkscreen font for 'shelly' preset"
```

---

## Task 10: Preset-aware terminal color scheme

**Files:**
- Modify: `lib/theme-to-terminal-colors.ts`
- Modify: `components/panes/TerminalPane.tsx`

- [ ] **Step 1: Inspect the current file**

Read `lib/theme-to-terminal-colors.ts` so you know what kind of scheme object it returns today.

- [ ] **Step 2: Add presetToTerminalColors export**

Append to `lib/theme-to-terminal-colors.ts`:

```ts
import type { ThemePresetId } from './theme-presets';
import { shellyPalette } from './theme-presets';

/**
 * Translate a Shelly theme preset into the native TerminalView's
 * color-scheme object. The native module expects hex values for all
 * ANSI slots (black/red/green/yellow/blue/magenta/cyan/white + their
 * bright variants) plus background/foreground/cursor.
 */
export function presetToTerminalColors(id: ThemePresetId) {
  if (id === 'shelly') {
    return {
      background: shellyPalette.bgDeep,
      foreground: shellyPalette.text1,
      cursor:     shellyPalette.accent,
      black:          '#0A0A0A',
      red:            shellyPalette.accentRed,
      green:          shellyPalette.accentGreen,
      yellow:         shellyPalette.accentAmber,
      blue:           shellyPalette.accentBlue,
      magenta:        shellyPalette.accentPurple,
      cyan:           shellyPalette.accentSky,
      white:          shellyPalette.text1,
      brightBlack:    shellyPalette.text3,
      brightRed:      shellyPalette.accentRed,
      brightGreen:    shellyPalette.accentGreen,
      brightYellow:   shellyPalette.accentAmber,
      brightBlue:     shellyPalette.accentBlue,
      brightMagenta:  shellyPalette.accentPurple,
      brightCyan:     shellyPalette.accentSky,
      brightWhite:    '#FFFFFF',
    };
  }
  // Fall through to the existing default for silkscreen / pixel / mono.
  return null;
}
```

- [ ] **Step 3: Use it in TerminalPane**

In `TerminalPane.tsx`, find where `terminalColorScheme` is derived and update so Shelly preset uses the new scheme:

```tsx
import { presetToTerminalColors } from '@/lib/theme-to-terminal-colors';
// ...
const terminalColorScheme = useMemo(() => {
  return presetToTerminalColors(settings.uiFont as any) ?? defaultTerminalColorScheme;
}, [settings.uiFont]);
```

Adjust names to match the actual variables in the file (read first; the exact identifier for the existing default may be different).

- [ ] **Step 4: Typecheck**

Run: `cd ~/Shelly && pnpm exec tsc --noEmit`
Expected: `0 errors`

- [ ] **Step 5: Commit**

```bash
git add lib/theme-to-terminal-colors.ts components/panes/TerminalPane.tsx
git commit -m "feat(terminal): Shelly preset drives the native ANSI color scheme"
```

---

## Task 11: neon-glow.ts uses live palette

**Files:**
- Modify: `lib/neon-glow.ts`

- [ ] **Step 1: Read the current file**

Read `lib/neon-glow.ts`. It currently exports const glow objects built from hard-coded rgba strings.

- [ ] **Step 2: Decide on the simplest path**

The glow values are **independent of the palette values** (they use fixed rgba like `rgba(0, 212, 170, 0.95)` which already matches the Shelly accent). Neon glow constants DO NOT need to change per preset because the mock-exact teal is also the silkscreen-era teal. Leave the existing file alone and add a comment explaining why:

```ts
// Glow colors are fixed and match the Shelly palette's accent values.
// We intentionally do NOT rebuild them per preset — silkscreen / pixel /
// mono all look fine with the same glow hue because their accents are
// the same teal/purple/pink/etc.
```

- [ ] **Step 3: Typecheck** (no changes, but run anyway)

Run: `cd ~/Shelly && pnpm exec tsc --noEmit`
Expected: `0 errors`

- [ ] **Step 4: Commit** (comment-only)

```bash
git add lib/neon-glow.ts
git commit -m "docs(theme): note that neon-glow values are preset-agnostic"
```

---

## Task 12: Manual smoke test (user verification)

This task is executed by the user on their device. Nothing to commit, but the plan does not close until the user confirms these checks pass.

- [ ] **Step 1: Build + install**

The author pushes the commits, CI builds, user downloads/installs. Not automated here.

- [ ] **Step 2: First launch — default is Shelly**

Open Shelly on device. Expect: UI renders with mock-faithful colors and Silkscreen font. No manual flip required.

- [ ] **Step 3: Visual checks against mock-1-full-layout.jpg**

- `bg.deep` / `bg.surface` / `bg.sidebar` layering matches
- `~$` prompt and `SHELLY` active repo glow teal
- `YOU` label in AI pane is blue
- `CLAUDE` assistant label is purple
- String literals in code previews are pink
- `+` diff rows are green-tinted, `-` rows are red-tinted
- `RUNNING` badge is amber, `LINKED` is green, `CONNECT` is grey
- `ALLOW` button is amber, `DENY` is grey
- Folder/file icons in Sidebar are blue
- `ls -la` directories render in sky/blue via the new ANSI color scheme
- Fonts across Sidebar, panes, buttons, terminal all look the same pixel font

- [ ] **Step 4: Runtime preset swap preserves PTY**

1. Run `vim ~/test.txt` in a terminal pane, type a few letters so vim is in insert mode.
2. Open Settings → Display → Font → `Silk`
3. Expect: UI re-renders with the old silkscreen palette.
4. Expect: vim is STILL RUNNING in the terminal pane, cursor still where it was, no disconnect.
5. Flip back to `Shelly` → vim still alive.
6. Flip through `8bit` and `Mono` → vim still alive each time.

- [ ] **Step 5: Report back**

If anything fails, report the exact step and a screenshot. Otherwise: "✅ Shelly preset verified on device."

---

## Rollback

If a task lands a broken commit:

```bash
git revert HEAD
```

Or to bail on the whole plan mid-way:

```bash
git log --oneline | head -20   # find the commit before Task 1
git reset --hard <sha-before-task-1>
```

All tasks are independent enough that you can ship any prefix of them. Tasks 3 / 4 / 5 / 6 together are the minimum viable "Shelly is now selectable."
