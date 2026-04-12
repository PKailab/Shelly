/**
 * lib/neon-glow.ts — Neon glow styles for CRT terminal aesthetic
 */
import { TextStyle, ViewStyle } from 'react-native';
import { colors as C } from '@/theme.config';

const GLOW_COLOR = 'rgba(0, 212, 170, 0.6)';
const GLOW_COLOR_STRONG = 'rgba(0, 212, 170, 0.8)';

/** Subtle neon text glow for accent-colored labels */
export const neonTextGlow: TextStyle = {
  textShadowColor: GLOW_COLOR,
  textShadowOffset: { width: 0, height: 0 },
  textShadowRadius: 6,
};

/** Stronger neon text glow for prominent elements */
export const neonTextGlowStrong: TextStyle = {
  textShadowColor: GLOW_COLOR_STRONG,
  textShadowOffset: { width: 0, height: 0 },
  textShadowRadius: 10,
};

/** Neon glow for status dots and indicators */
export const neonDotGlow: ViewStyle = {
  shadowColor: C.accent,
  shadowOffset: { width: 0, height: 0 },
  shadowOpacity: 0.7,
  shadowRadius: 4,
  elevation: 3,
};

/** Neon border glow for active elements */
export const neonBorderGlow: ViewStyle = {
  shadowColor: C.accent,
  shadowOffset: { width: 0, height: 0 },
  shadowOpacity: 0.4,
  shadowRadius: 8,
  elevation: 2,
};

// ── Per-color glows ────────────────────────────────────────────────
// Match the mock's color-coded neon text (CLAUDE purple, YOU blue,
// strings pink, etc). Radius trimmed to 5 because Silkscreen pixels
// smear at higher values.

const glow = (color: string, alpha: number, radius: number): TextStyle => ({
  textShadowColor: `rgba(${color}, ${alpha})`,
  textShadowOffset: { width: 0, height: 0 },
  textShadowRadius: radius,
});

export const neonGlowTeal:   TextStyle = glow('0, 212, 170', 0.6, 6);
export const neonGlowBlue:   TextStyle = glow('96, 165, 250', 0.6, 6);
export const neonGlowSky:    TextStyle = glow('56, 189, 248', 0.55, 5);
export const neonGlowPurple: TextStyle = glow('167, 139, 250', 0.55, 5);
export const neonGlowPink:   TextStyle = glow('236, 72, 153', 0.5, 5);
export const neonGlowGreen:  TextStyle = glow('34, 197, 94', 0.6, 6);
export const neonGlowRed:    TextStyle = glow('239, 68, 68', 0.55, 5);
export const neonGlowAmber:  TextStyle = glow('245, 158, 11', 0.55, 6);
