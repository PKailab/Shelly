/**
 * Theme color utility helpers.
 * Replace hardcoded hex+alpha patterns like '#00D4AA22' with
 * composable functions: withAlpha(colors.accent, 0.13)
 */

/**
 * Convert a hex color + alpha to an rgba() string.
 * @example withAlpha('#00D4AA', 0.13) → 'rgba(0,212,170,0.13)'
 * @example withAlpha('#FF0000', 0.5) → 'rgba(255,0,0,0.5)'
 */
export function withAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Adjust the brightness of a hex color by a percentage.
 * Positive percent = lighter, negative = darker.
 * @example adjustBrightness('#1A1A1A', 10) → slightly lighter
 * @example adjustBrightness('#FFFFFF', -20) → slightly darker
 */
export function adjustBrightness(hex: string, percent: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  const adjust = (c: number) =>
    Math.max(0, Math.min(255, Math.round(c + (c * percent) / 100)));

  const rr = adjust(r).toString(16).padStart(2, '0');
  const gg = adjust(g).toString(16).padStart(2, '0');
  const bb = adjust(b).toString(16).padStart(2, '0');

  return `#${rr}${gg}${bb}`;
}
