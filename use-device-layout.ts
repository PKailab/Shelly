import { useWindowDimensions } from 'react-native';
import { useMemo } from 'react';

export type DeviceLayout = {
  isLandscape: boolean;
  /** Inner screen (unfolded) — logical width ≥ 550dp */
  isFoldInner: boolean;
  /** Outer (cover) screen — logical width < 420dp */
  isFoldOuter: boolean;
  /** Use side-by-side split layout (inner screen landscape) */
  useSplitLayout: boolean;
  width: number;
  height: number;
  // Adaptive values
  fontSize: number;
  terminalFlex: number;
};

/**
 * Adaptive layout hook for Samsung Galaxy Z Fold6.
 *
 * Z Fold6 logical pixel widths (approximate):
 *   Inner unfolded portrait  : ~904 dp wide
 *   Inner unfolded landscape : ~1768 dp wide  (split layout)
 *   Outer cover portrait     : ~373 dp wide
 *   Outer cover landscape    : ~812 dp wide
 *
 * We use useWindowDimensions which returns logical pixels.
 */
export function useDeviceLayout(): DeviceLayout {
  const { width, height } = useWindowDimensions();

  return useMemo(() => {
    const isLandscape = width > height;

    // Inner screen: width ≥ 550dp (covers both portrait and landscape)
    const isFoldInner = width >= 550;
    // Outer screen: width < 420dp
    const isFoldOuter = width < 420;

    // Split layout: inner screen in landscape (very wide)
    const useSplitLayout = isLandscape && isFoldInner;

    // Adaptive font size
    let fontSize = 14;
    if (isFoldInner) fontSize = 15;
    if (isFoldOuter) fontSize = 13;
    if (isLandscape && !isFoldInner) fontSize = 12;

    // Terminal area flex ratio (higher = more space for output)
    // Inner portrait: terminal gets ~72% of screen
    // Outer portrait: terminal gets ~68% of screen
    const terminalFlex = isFoldInner ? 3 : 2.5;

    return {
      isLandscape,
      isFoldInner,
      isFoldOuter,
      useSplitLayout,
      width,
      height,
      fontSize,
      terminalFlex,
    };
  }, [width, height]);
}
