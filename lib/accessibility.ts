/**
 * lib/accessibility.ts — Accessibility utilities & configuration
 *
 * Provides:
 * - Screen reader announcement helpers
 * - Focus management utilities
 * - Accessibility props generators for common patterns
 * - Reduced motion detection
 * - Font scale support
 */
import { AccessibilityInfo, Platform } from 'react-native';
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { t } from '@/lib/i18n';

// ── Types ────────────────────────────────────────────────────────────────────

export interface A11yConfig {
  /** Enable screen reader optimizations */
  screenReaderEnabled: boolean;
  /** Respect system reduced motion setting */
  reduceMotion: boolean;
  /** Minimum touch target size (dp) */
  minTouchTarget: number;
  /** Enable extra verbose descriptions */
  verboseMode: boolean;
  /** Font scale multiplier (1.0 = default) */
  fontScale: number;
}

// ── Store ────────────────────────────────────────────────────────────────────

const STORAGE_KEY = '@shelly/a11y';

type A11yState = A11yConfig & {
  loadConfig: () => Promise<void>;
  updateConfig: (partial: Partial<A11yConfig>) => void;
};

export const useA11yStore = create<A11yState>((set, get) => ({
  screenReaderEnabled: false,
  reduceMotion: false,
  minTouchTarget: 44,
  verboseMode: false,
  fontScale: 1.0,

  loadConfig: async () => {
    // Detect system settings
    const [srEnabled, rmEnabled] = await Promise.all([
      AccessibilityInfo.isScreenReaderEnabled(),
      AccessibilityInfo.isReduceMotionEnabled(),
    ]);

    // Load user preferences
    const json = await AsyncStorage.getItem(STORAGE_KEY);
    const saved = json ? JSON.parse(json) : {};

    set({
      screenReaderEnabled: srEnabled,
      reduceMotion: rmEnabled,
      ...saved,
    });

    // Listen for system changes
    const srSub = AccessibilityInfo.addEventListener(
      'screenReaderChanged',
      (enabled) => set({ screenReaderEnabled: enabled }),
    );
    const rmSub = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (enabled) => set({ reduceMotion: enabled }),
    );

    // Cleanup would happen on app unmount (effectively never for a store)
  },

  updateConfig: (partial) => {
    const current = get();
    const updated = { ...current, ...partial };
    set(partial);
    AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        minTouchTarget: updated.minTouchTarget,
        verboseMode: updated.verboseMode,
        fontScale: updated.fontScale,
      }),
    );
  },
}));

// ── Announcement Helpers ─────────────────────────────────────────────────────

/**
 * Announce text to screen readers.
 */
export function announce(message: string) {
  if (Platform.OS === 'web') return;
  AccessibilityInfo.announceForAccessibility(message);
}

/**
 * Announce command execution result.
 */
export function announceCommandResult(command: string, exitCode: number) {
  const status = exitCode === 0 ? 'succeeded' : `failed with code ${exitCode}`;
  announce(`Command "${command}" ${status}`);
}

/**
 * Announce AI response availability.
 */
export function announceAIResponse(providerName: string) {
  announce(`${providerName} response ready`);
}

// ── Accessibility Props Generators ───────────────────────────────────────────

/**
 * Generate a11y props for a button-like element.
 */
export function buttonA11y(label: string, hint?: string) {
  return {
    accessible: true,
    accessibilityRole: 'button' as const,
    accessibilityLabel: label,
    ...(hint ? { accessibilityHint: hint } : {}),
  };
}

/**
 * Generate a11y props for a text input.
 */
export function inputA11y(label: string, hint?: string) {
  return {
    accessible: true,
    accessibilityRole: 'search' as const,
    accessibilityLabel: label,
    ...(hint ? { accessibilityHint: hint } : {}),
  };
}

/**
 * Generate a11y props for a terminal output block.
 */
export function terminalBlockA11y(command: string, isRunning: boolean) {
  return {
    accessible: true,
    accessibilityRole: 'text' as const,
    accessibilityLabel: isRunning
      ? `Running command: ${command}`
      : `Command output for: ${command}`,
    accessibilityState: { busy: isRunning },
  };
}

/**
 * Generate a11y props for expandable/collapsible sections.
 */
export function expandableA11y(label: string, isExpanded: boolean) {
  return {
    accessible: true,
    accessibilityRole: 'button' as const,
    accessibilityLabel: label,
    accessibilityState: { expanded: isExpanded },
    accessibilityHint: isExpanded ? t('a11y.collapse') : t('a11y.expand'),
  };
}

/**
 * Generate a11y props for tab items.
 */
export function tabA11y(label: string, isSelected: boolean, index: number, total: number) {
  return {
    accessible: true,
    accessibilityRole: 'tab' as const,
    accessibilityLabel: label,
    accessibilityState: { selected: isSelected },
    accessibilityHint: `Tab ${index + 1} of ${total}`,
  };
}

/**
 * Generate a11y props for live region (auto-announces changes).
 */
export function liveRegionA11y(polite: boolean = true) {
  return {
    accessibilityLiveRegion: (polite ? 'polite' : 'assertive') as 'polite' | 'assertive',
  };
}

// ── Scaled font size ─────────────────────────────────────────────────────────

/**
 * Apply user font scale to a base size.
 */
export function scaledFontSize(base: number): number {
  const { fontScale } = useA11yStore.getState();
  return Math.round(base * fontScale);
}
