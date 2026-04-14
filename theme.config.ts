// theme.config.ts — Single source of truth for all design tokens
// Extracted from mock screenshots. Every component imports from here.
//
// `colors` is now a MUTABLE object seeded from the Shelly preset. At
// runtime, applyThemePreset() (lib/theme-presets.ts) calls
// Object.assign(colors, newPalette) to swap values in place. Consumers
// keep the same object reference so the 100+ `import { colors as C }`
// call sites do not need to change.

// ─── Colors ─────────────────────────────────────────────────────────────────

// NOTE: no imports on purpose. tailwind.config.js does a plain
// CommonJS require() of this file during Metro bundling, and sucrase
// on this project's version chokes on any TS-style import in the top
// of theme.config.ts (column 8 parse error, regardless of `import
// type` vs `import {}`). So keep this file import-free. Mutable
// palette object is seeded inline here; lib/theme-presets.ts holds the
// identical shellyPalette for runtime preset swaps via Object.assign.
export const colors = {
  // Backgrounds (mock-exact)
  bgDeep:     '#0A0A0A',
  bgSurface:  '#111111',
  bgSidebar:  '#0D0D0D',
  border:     '#1C1C1C',

  // Accents (mock-exact)
  accent:        '#00D4AA',
  accentGreen:   '#4ADE80',
  accentBlue:    '#60A5FA',
  accentSky:     '#38BDF8',
  accentPurple:  '#A78BFA',
  accentPink:    '#EC4899',
  accentAmber:   '#F59E0B',
  accentCode:    '#60A5FA',
  warning:       '#F59E0B',

  // Text (mock-exact)
  text1:      '#E5E7EB',
  text2:      '#9CA3AF',
  text3:      '#6B7280',

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
  crtBadgeBg:   '#0D0D0D',
  crtBadgeText: '#00D4AA',

  // Auto-save
  autoSaveBg: '#111827',

  // Diff
  diffAddBorder:    '#4ADE80',
  diffRemoveBorder: '#F87171',
};

// ─── Fonts ──────────────────────────────────────────────────────────────────

export const fonts = {
  // Default UI font — JetBrains Mono for real lowercase glyphs and a
  // shared aesthetic with the terminal. Silkscreen used to be the default
  // but renders lowercase as uppercase by design (bug #28). Users can
  // override via Settings → Display → Font.
  family: 'JetBrainsMono_400Regular',

  // PressStart2P is an 8x8 pixel font, so each unit reads about 1.4× a normal
  // monospace pixel. These sizes were tuned down from 10/9/8 because the
  // mock-1 ratios were drowning the actual content.
  agentTab:       { size: 8, weight: '700' as const },
  paneHeader:     { size: 8, weight: '700' as const },
  sidebarSection: { size: 8, weight: '700' as const, letterSpacing: 0.4 },
  sidebarItem:    { size: 7, weight: '500' as const },
  fileName:       { size: 7, weight: '400' as const },
  badge:          { size: 6, weight: '700' as const },
  contextBar:     { size: 7, weight: '500' as const },
  layoutButton:   { size: 7, weight: '700' as const },
  tip:            { size: 7, weight: '400' as const },
} as const;

// ─── Sizes ──────────────────────────────────────────────────────────────────

export const sizes = {
  agentBarHeight: 28,
  paneHeaderHeight: 24,
  layoutBarHeight: 32,
  sidebarWidth: 156,
  // Tightened rows — mock renders much denser than the original 20/22 px.
  sidebarItemHeight: 16,
  sidebarSectionHeaderHeight: 18,
  agentDotSize: 5,
  borderWidth: 1,
  contextBarHeight: 18,
} as const;

// ─── Padding ────────────────────────────────────────────────────────────────

export const padding = {
  agentBar:     { px: 5 },
  agentTab:     { px: 8, py: 4 },
  paneHeader:   { px: 6 },
  // Tighter sidebar rows — py dropped from 3 to 1 for denser stacking.
  sidebarItem:  { px: 10, py: 1 },
  layoutButton: { px: 10, py: 4, gap: 5 },
  statusBadge:  { px: 5, py: 2 },
} as const;

// ─── Radii ──────────────────────────────────────────────────────────────────

export const radii = {
  agentTab: 4,
  layoutButton: 4,
  badge: 3,
  paneHeader: 0,
  actionButton: 3,  // ALLOW/DENY/ACCEPT/REJECT
} as const;

// ─── Icons ──────────────────────────────────────────────────────────────────

export const icons = {
  sidebarArrow: 6,
  fileIcon: 12,
  externalLink: 10,
} as const;

// ─── Diff / Decorations ────────────────────────────────────────────────────

export const decorations = {
  diffBorderWidth: 2,
  cursorColor: '#00D4AA',
  promptChar: '#00D4AA',
} as const;

// ─── Legacy compat — themeColors used by theme-engine.ts ────────────────────
// Maps the new tokens into the old light/dark format consumed by useTheme().

export const themeColors = {
  primary:        { light: colors.accent,      dark: colors.accent },
  background:     { light: colors.bgDeep,      dark: colors.bgDeep },
  backgroundDeep: { light: colors.bgDeep,      dark: colors.bgDeep },
  surface:        { light: colors.bgSurface,   dark: colors.bgSurface },
  surfaceHigh:    { light: colors.bgSidebar,   dark: colors.bgSidebar },
  surface2:       { light: colors.btnSecondaryBg, dark: colors.btnSecondaryBg },

  foreground:     { light: colors.text1,       dark: colors.text1 },
  foregroundDim:  { light: colors.text1,       dark: colors.text1 },
  muted:          { light: colors.text2,       dark: colors.text2 },
  inactive:       { light: colors.text3,       dark: colors.text3 },
  hint:           { light: colors.text3,       dark: colors.text3 },

  border:         { light: colors.border,      dark: colors.border },
  borderLight:    { light: colors.border,      dark: colors.border },
  borderHeavy:    { light: '#333333',          dark: '#333333' },

  success:        { light: colors.accentGreen, dark: colors.accentGreen },
  warning:        { light: colors.warning,     dark: colors.warning },
  error:          { light: colors.errorText,   dark: colors.errorText },

  accent:         { light: colors.accent,      dark: colors.accent },
  prompt:         { light: colors.accent,      dark: colors.accent },
  command:        { light: '#93C5FD',          dark: '#93C5FD' },
  tint:           { light: colors.accent,      dark: colors.accent },
  link:           { light: '#60A5FA',          dark: '#60A5FA' },

  aiPurple:       { light: '#8B5CF6',          dark: '#8B5CF6' },
  interpretPurple:{ light: '#A78BFA',          dark: '#A78BFA' },
  interpretText:  { light: '#C4B5FD',          dark: '#C4B5FD' },

  keyLabel:       { light: '#B0B8C1',          dark: '#B0B8C1' },
  infoText:       { light: '#9BA1A6',          dark: '#9BA1A6' },
} as const;
