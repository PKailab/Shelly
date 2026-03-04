import { useMemo } from 'react';
import { Colors, type ThemeColorPalette } from '@/lib/theme';

/**
 * Provides the resolved theme color palette for components.
 * All components should use this instead of hardcoded color values.
 *
 * Usage:
 *   const { colors } = useTheme();
 *   <View style={{ backgroundColor: colors.surface }} />
 */
export function useTheme(): { colors: ThemeColorPalette } {
  // Currently the app is always dark mode
  const colors = useMemo(() => Colors.dark, []);
  return { colors };
}
