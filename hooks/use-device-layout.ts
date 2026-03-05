import { useWindowDimensions } from 'react-native';
import { useMemo } from 'react';

export type DeviceLayout = {
  isLandscape: boolean;
  /** Wide screen (tablet, foldable inner, desktop browser) — width >= 600dp */
  isWide: boolean;
  /** Compact screen (small phone, foldable cover) — width < 380dp */
  isCompact: boolean;
  /** Use side-by-side split layout (wide + landscape) */
  useSplitLayout: boolean;
  width: number;
  height: number;
  // Adaptive values
  fontSize: number;
  terminalFlex: number;

  // Legacy compat aliases (used by existing code)
  isFoldInner: boolean;
  isFoldOuter: boolean;
};

/**
 * Responsive layout hook.
 *
 * Breakpoints:
 *   Compact  : width < 380dp  (Z Fold6 cover ~373dp, small phones)
 *   Standard : 380-599dp      (most phones)
 *   Wide     : width >= 600dp (tablets, foldable inner, desktop)
 */
export function useDeviceLayout(): DeviceLayout {
  const { width, height } = useWindowDimensions();

  return useMemo(() => {
    const isLandscape = width > height;
    const isWide = width >= 600;
    const isCompact = width < 380;
    const useSplitLayout = isLandscape && isWide;

    // Adaptive font size
    let fontSize = 14;
    if (isWide) fontSize = 15;
    if (isCompact) fontSize = 13;
    if (isLandscape && !isWide) fontSize = 12;

    const terminalFlex = isWide ? 3 : 2.5;

    return {
      isLandscape,
      isWide,
      isCompact,
      useSplitLayout,
      width,
      height,
      fontSize,
      terminalFlex,
      // Legacy aliases
      isFoldInner: isWide,
      isFoldOuter: isCompact,
    };
  }, [width, height]);
}
