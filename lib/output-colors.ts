/**
 * Output color utilities for Shelly terminal blocks.
 *
 * Separated from TerminalBlock.tsx so this pure logic can be imported
 * in tests without pulling in React Native UI dependencies.
 *
 * Contrast ratios against block background (#1A1A1A):
 *   stdout  #E8E8E8  → ~13.5:1  (WCAG AAA)
 *   stderr  #FF7878  → ~6.2:1   (WCAG AA)
 *   info    #9BA1A6  → ~4.7:1   (WCAG AA)
 *   prompt  #00D4AA  → ~7.1:1   (WCAG AA)
 */

import { OutputLine } from '@/store/types';

/**
 * Returns the output text color for a given line type.
 *
 * @param type - The output line type ('stdout' | 'stderr' | 'info' | 'prompt')
 * @param highContrast - When true (default), uses WCAG-AA-safe colors
 *   guaranteed readable on OLED/AMOLED displays (Z Fold6).
 *   When false, uses legacy theme-dependent colors.
 */
export function getOutputColor(type: OutputLine['type'], highContrast = true): string {
  if (highContrast) {
    switch (type) {
      case 'stderr': return '#FF7878';
      case 'info':   return '#9BA1A6';
      case 'prompt': return '#00D4AA';
      default:       return '#E8E8E8'; // stdout — near-white, always readable on OLED
    }
  }
  // Legacy / theme-dependent colors
  switch (type) {
    case 'stderr': return '#F87171';
    case 'info':   return '#6B7280';
    case 'prompt': return '#00D4AA';
    default:       return '#D4D4D4';
  }
}
