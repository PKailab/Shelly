/**
 * lib/theme-engine.ts — JSON-based theme system
 *
 * Built-in themes + custom theme loading.
 * WezTerm-inspired theming with full color control.
 */
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Theme Definition ─────────────────────────────────────────────────────────

export interface ThemeColors {
  /** Main background */
  background: string;
  /** Card/surface background */
  surface: string;
  /** Elevated surface (modals, menus) */
  surfaceAlt: string;
  /** Primary foreground text */
  foreground: string;
  /** Muted/secondary text */
  muted: string;
  /** Accent color (buttons, highlights) */
  accent: string;
  /** Border color */
  border: string;
  /** Success color */
  success: string;
  /** Warning color */
  warning: string;
  /** Error color */
  error: string;
  /** Shell prompt color */
  prompt: string;
  /** Command text color */
  command: string;
  /** Inactive tab/element color */
  inactive: string;

  // ── ANSI Terminal Colors ─────────────────────────────────────────
  ansiBlack: string;
  ansiRed: string;
  ansiGreen: string;
  ansiYellow: string;
  ansiBlue: string;
  ansiMagenta: string;
  ansiCyan: string;
  ansiWhite: string;
  ansiBrightBlack: string;
  ansiBrightRed: string;
  ansiBrightGreen: string;
  ansiBrightYellow: string;
  ansiBrightBlue: string;
  ansiBrightMagenta: string;
  ansiBrightCyan: string;
  ansiBrightWhite: string;
}

export interface Theme {
  id: string;
  name: string;
  author?: string;
  type: 'dark' | 'light';
  colors: ThemeColors;
}

// ── Built-in Themes ──────────────────────────────────────────────────────────

const DEFAULT_ANSI = {
  ansiBlack: '#000000',
  ansiRed: '#FF5555',
  ansiGreen: '#50FA7B',
  ansiYellow: '#F1FA8C',
  ansiBlue: '#BD93F9',
  ansiMagenta: '#FF79C6',
  ansiCyan: '#8BE9FD',
  ansiWhite: '#F8F8F2',
  ansiBrightBlack: '#6272A4',
  ansiBrightRed: '#FF6E6E',
  ansiBrightGreen: '#69FF94',
  ansiBrightYellow: '#FFFFA5',
  ansiBrightBlue: '#D6ACFF',
  ansiBrightMagenta: '#FF92DF',
  ansiBrightCyan: '#A4FFFF',
  ansiBrightWhite: '#FFFFFF',
};

export const BUILTIN_THEMES: Theme[] = [
  {
    id: 'shelly-default',
    name: 'Shelly Default',
    type: 'dark',
    colors: {
      background: '#0A0A0A',
      surface: '#111111',
      surfaceAlt: '#1A1A1A',
      foreground: '#E8E8E8',
      muted: '#6B7280',
      accent: '#00D4AA',
      border: '#1E1E1E',
      success: '#4ADE80',
      warning: '#FBBF24',
      error: '#F87171',
      prompt: '#00D4AA',
      command: '#93C5FD',
      inactive: '#4B5563',
      ...DEFAULT_ANSI,
    },
  },
  {
    id: 'dracula',
    name: 'Dracula',
    author: 'Zeno Rocha',
    type: 'dark',
    colors: {
      background: '#282A36',
      surface: '#2D2F3D',
      surfaceAlt: '#343746',
      foreground: '#F8F8F2',
      muted: '#6272A4',
      accent: '#BD93F9',
      border: '#44475A',
      success: '#50FA7B',
      warning: '#F1FA8C',
      error: '#FF5555',
      prompt: '#50FA7B',
      command: '#8BE9FD',
      inactive: '#6272A4',
      ansiBlack: '#21222C',
      ansiRed: '#FF5555',
      ansiGreen: '#50FA7B',
      ansiYellow: '#F1FA8C',
      ansiBlue: '#BD93F9',
      ansiMagenta: '#FF79C6',
      ansiCyan: '#8BE9FD',
      ansiWhite: '#F8F8F2',
      ansiBrightBlack: '#6272A4',
      ansiBrightRed: '#FF6E6E',
      ansiBrightGreen: '#69FF94',
      ansiBrightYellow: '#FFFFA5',
      ansiBrightBlue: '#D6ACFF',
      ansiBrightMagenta: '#FF92DF',
      ansiBrightCyan: '#A4FFFF',
      ansiBrightWhite: '#FFFFFF',
    },
  },
  {
    id: 'solarized-dark',
    name: 'Solarized Dark',
    author: 'Ethan Schoonover',
    type: 'dark',
    colors: {
      background: '#002B36',
      surface: '#073642',
      surfaceAlt: '#0A3F4E',
      foreground: '#839496',
      muted: '#586E75',
      accent: '#2AA198',
      border: '#073642',
      success: '#859900',
      warning: '#B58900',
      error: '#DC322F',
      prompt: '#859900',
      command: '#268BD2',
      inactive: '#586E75',
      ansiBlack: '#073642',
      ansiRed: '#DC322F',
      ansiGreen: '#859900',
      ansiYellow: '#B58900',
      ansiBlue: '#268BD2',
      ansiMagenta: '#D33682',
      ansiCyan: '#2AA198',
      ansiWhite: '#EEE8D5',
      ansiBrightBlack: '#002B36',
      ansiBrightRed: '#CB4B16',
      ansiBrightGreen: '#586E75',
      ansiBrightYellow: '#657B83',
      ansiBrightBlue: '#839496',
      ansiBrightMagenta: '#6C71C4',
      ansiBrightCyan: '#93A1A1',
      ansiBrightWhite: '#FDF6E3',
    },
  },
  {
    id: 'nord',
    name: 'Nord',
    author: 'Arctic Ice Studio',
    type: 'dark',
    colors: {
      background: '#2E3440',
      surface: '#3B4252',
      surfaceAlt: '#434C5E',
      foreground: '#D8DEE9',
      muted: '#4C566A',
      accent: '#88C0D0',
      border: '#3B4252',
      success: '#A3BE8C',
      warning: '#EBCB8B',
      error: '#BF616A',
      prompt: '#A3BE8C',
      command: '#81A1C1',
      inactive: '#4C566A',
      ansiBlack: '#3B4252',
      ansiRed: '#BF616A',
      ansiGreen: '#A3BE8C',
      ansiYellow: '#EBCB8B',
      ansiBlue: '#81A1C1',
      ansiMagenta: '#B48EAD',
      ansiCyan: '#88C0D0',
      ansiWhite: '#E5E9F0',
      ansiBrightBlack: '#4C566A',
      ansiBrightRed: '#BF616A',
      ansiBrightGreen: '#A3BE8C',
      ansiBrightYellow: '#EBCB8B',
      ansiBrightBlue: '#81A1C1',
      ansiBrightMagenta: '#B48EAD',
      ansiBrightCyan: '#8FBCBB',
      ansiBrightWhite: '#ECEFF4',
    },
  },
  {
    id: 'catppuccin-mocha',
    name: 'Catppuccin Mocha',
    author: 'Catppuccin',
    type: 'dark',
    colors: {
      background: '#1E1E2E',
      surface: '#262637',
      surfaceAlt: '#313244',
      foreground: '#CDD6F4',
      muted: '#585B70',
      accent: '#CBA6F7',
      border: '#313244',
      success: '#A6E3A1',
      warning: '#F9E2AF',
      error: '#F38BA8',
      prompt: '#A6E3A1',
      command: '#89B4FA',
      inactive: '#585B70',
      ansiBlack: '#45475A',
      ansiRed: '#F38BA8',
      ansiGreen: '#A6E3A1',
      ansiYellow: '#F9E2AF',
      ansiBlue: '#89B4FA',
      ansiMagenta: '#F5C2E7',
      ansiCyan: '#94E2D5',
      ansiWhite: '#BAC2DE',
      ansiBrightBlack: '#585B70',
      ansiBrightRed: '#F38BA8',
      ansiBrightGreen: '#A6E3A1',
      ansiBrightYellow: '#F9E2AF',
      ansiBrightBlue: '#89B4FA',
      ansiBrightMagenta: '#F5C2E7',
      ansiBrightCyan: '#94E2D5',
      ansiBrightWhite: '#A6ADC8',
    },
  },
  {
    id: 'high-contrast',
    name: 'High Contrast',
    type: 'dark',
    colors: {
      background: '#000000',
      surface: '#0A0A0A',
      surfaceAlt: '#141414',
      foreground: '#FFFFFF',
      muted: '#999999',
      accent: '#00FF88',
      border: '#444444',
      success: '#00FF00',
      warning: '#FFFF00',
      error: '#FF0000',
      prompt: '#00FF88',
      command: '#00CCFF',
      inactive: '#666666',
      ansiBlack: '#000000',
      ansiRed: '#FF0000',
      ansiGreen: '#00FF00',
      ansiYellow: '#FFFF00',
      ansiBlue: '#0088FF',
      ansiMagenta: '#FF00FF',
      ansiCyan: '#00FFFF',
      ansiWhite: '#FFFFFF',
      ansiBrightBlack: '#555555',
      ansiBrightRed: '#FF5555',
      ansiBrightGreen: '#55FF55',
      ansiBrightYellow: '#FFFF55',
      ansiBrightBlue: '#5555FF',
      ansiBrightMagenta: '#FF55FF',
      ansiBrightCyan: '#55FFFF',
      ansiBrightWhite: '#FFFFFF',
    },
  },
];

// ── Theme Store ──────────────────────────────────────────────────────────────

const STORAGE_KEY = '@shelly/theme';
const CUSTOM_THEMES_KEY = '@shelly/custom_themes';

type ThemeState = {
  currentThemeId: string;
  customThemes: Theme[];
  loadTheme: () => Promise<void>;
  setTheme: (id: string) => void;
  addCustomTheme: (theme: Theme) => void;
  removeCustomTheme: (id: string) => void;
  importThemeJson: (json: string) => Theme | null;
};

export const useThemeStore = create<ThemeState>((set, get) => ({
  currentThemeId: 'shelly-default',
  customThemes: [],

  loadTheme: async () => {
    const [savedId, customJson] = await Promise.all([
      AsyncStorage.getItem(STORAGE_KEY),
      AsyncStorage.getItem(CUSTOM_THEMES_KEY),
    ]);
    const updates: Partial<ThemeState> = {};
    if (savedId) updates.currentThemeId = savedId;
    if (customJson) {
      try { updates.customThemes = JSON.parse(customJson); } catch {}
    }
    set(updates);
  },

  setTheme: (id) => {
    set({ currentThemeId: id });
    AsyncStorage.setItem(STORAGE_KEY, id);
  },

  addCustomTheme: (theme) => {
    const updated = [...get().customThemes.filter((t) => t.id !== theme.id), theme];
    set({ customThemes: updated });
    AsyncStorage.setItem(CUSTOM_THEMES_KEY, JSON.stringify(updated));
  },

  removeCustomTheme: (id) => {
    const updated = get().customThemes.filter((t) => t.id !== id);
    set({ customThemes: updated });
    AsyncStorage.setItem(CUSTOM_THEMES_KEY, JSON.stringify(updated));
    if (get().currentThemeId === id) {
      set({ currentThemeId: 'shelly-default' });
      AsyncStorage.setItem(STORAGE_KEY, 'shelly-default');
    }
  },

  importThemeJson: (json) => {
    try {
      const parsed = JSON.parse(json);
      if (!parsed.id || !parsed.name || !parsed.colors) return null;
      const theme: Theme = {
        id: parsed.id,
        name: parsed.name,
        author: parsed.author,
        type: parsed.type || 'dark',
        colors: { ...BUILTIN_THEMES[0].colors, ...parsed.colors },
      };
      get().addCustomTheme(theme);
      return theme;
    } catch {
      return null;
    }
  },
}));

// ── Helper: Get current theme ────────────────────────────────────────────────

export function getCurrentTheme(): Theme {
  const { currentThemeId, customThemes } = useThemeStore.getState();
  return (
    BUILTIN_THEMES.find((t) => t.id === currentThemeId) ??
    customThemes.find((t) => t.id === currentThemeId) ??
    BUILTIN_THEMES[0]
  );
}

/**
 * React hook — re-renders when theme changes.
 */
export function useTheme(): Theme {
  const currentThemeId = useThemeStore((s) => s.currentThemeId);
  const customThemes = useThemeStore((s) => s.customThemes);
  return (
    BUILTIN_THEMES.find((t) => t.id === currentThemeId) ??
    customThemes.find((t) => t.id === currentThemeId) ??
    BUILTIN_THEMES[0]
  );
}

export function getAllThemes(): Theme[] {
  const { customThemes } = useThemeStore.getState();
  return [...BUILTIN_THEMES, ...customThemes];
}
