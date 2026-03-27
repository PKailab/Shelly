/**
 * Converts Shelly ThemeColors to TerminalColorScheme for native view.
 */

import type { ThemeColors } from '@/lib/theme-engine';

export interface TerminalColorScheme {
  background: string;
  foreground: string;
  cursor: string;
  selectionBackground: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
}

export function themeToTerminalColors(colors: ThemeColors): TerminalColorScheme {
  return {
    background: colors.background,
    foreground: colors.foreground,
    cursor: colors.accent,
    selectionBackground: colors.accent + '40',
    black: colors.ansiBlack,
    red: colors.ansiRed,
    green: colors.ansiGreen,
    yellow: colors.ansiYellow,
    blue: colors.ansiBlue,
    magenta: colors.ansiMagenta,
    cyan: colors.ansiCyan,
    white: colors.ansiWhite,
    brightBlack: colors.ansiBrightBlack,
    brightRed: colors.ansiBrightRed,
    brightGreen: colors.ansiBrightGreen,
    brightYellow: colors.ansiBrightYellow,
    brightBlue: colors.ansiBrightBlue,
    brightMagenta: colors.ansiBrightMagenta,
    brightCyan: colors.ansiBrightCyan,
    brightWhite: colors.ansiBrightWhite,
  };
}
