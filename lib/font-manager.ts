import { useCosmeticStore, type FontFamily } from '@/store/cosmetic-store';

export type FontInfo = {
  key: FontFamily;
  displayName: string;
  isPixel: boolean;
};

export const FONT_CATALOG: FontInfo[] = [
  { key: 'jetbrains-mono', displayName: 'JetBrains Mono', isPixel: false },
  { key: 'fira-code', displayName: 'Fira Code', isPixel: false },
  { key: 'source-code-pro', displayName: 'Source Code Pro', isPixel: false },
  { key: 'ibm-plex-mono', displayName: 'IBM Plex Mono', isPixel: false },
  { key: 'pixel-mplus', displayName: 'PixelMPlus', isPixel: true },
  { key: 'press-start-2p', displayName: 'Press Start 2P', isPixel: true },
  { key: 'silkscreen', displayName: 'Silkscreen', isPixel: true },
];

/** Returns the active font family, auto-switching for CRT mode */
export function getActiveFont(): string {
  const { crtEnabled, fontFamily, crtFont } = useCosmeticStore.getState();
  return crtEnabled ? crtFont : fontFamily;
}

/** React hook version */
export function useFontFamily(): string {
  const crtEnabled = useCosmeticStore((s) => s.crtEnabled);
  const fontFamily = useCosmeticStore((s) => s.fontFamily);
  const crtFont = useCosmeticStore((s) => s.crtFont);
  return crtEnabled ? crtFont : fontFamily;
}

export function getPixelFonts(): FontInfo[] {
  return FONT_CATALOG.filter((f) => f.isPixel);
}
