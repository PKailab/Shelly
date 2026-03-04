import { create } from 'zustand';
import { AccessibilityInfo } from 'react-native';

// ─── Sound IDs ──────────────────────────────────────────────────────────────

export type SoundId =
  | 'send'
  | 'success'
  | 'error'
  | 'tab_switch'
  | 'key_press'
  | 'ctrl_c'
  | 'copy'
  | 'ai_start'
  | 'ai_complete'
  | 'connect'
  | 'disconnect'
  | 'mode_switch'
  | 'quick_open'
  | 'quick_close';

// ─── Sound metadata (for future WAV asset mapping) ──────────────────────────

const SOUND_META: Record<SoundId, { frequency: number; duration: number }> = {
  send:         { frequency: 880,  duration: 80  },
  success:      { frequency: 1047, duration: 120 },
  error:        { frequency: 220,  duration: 150 },
  tab_switch:   { frequency: 660,  duration: 60  },
  key_press:    { frequency: 1200, duration: 40  },
  ctrl_c:       { frequency: 440,  duration: 100 },
  copy:         { frequency: 1320, duration: 70  },
  ai_start:     { frequency: 523,  duration: 150 },
  ai_complete:  { frequency: 784,  duration: 200 },
  connect:      { frequency: 587,  duration: 180 },
  disconnect:   { frequency: 330,  duration: 150 },
  mode_switch:  { frequency: 698,  duration: 90  },
  quick_open:   { frequency: 740,  duration: 120 },
  quick_close:  { frequency: 494,  duration: 100 },
};

// ─── Sound Store (Zustand) ──────────────────────────────────────────────────

type SoundStore = {
  enabled: boolean;
  volume: number;
  reduceMotion: boolean;
  setEnabled: (enabled: boolean) => void;
  setVolume: (volume: number) => void;
  initReduceMotion: () => void;
};

export const useSoundStore = create<SoundStore>((set) => ({
  enabled: true,
  volume: 0.6,
  reduceMotion: false,
  setEnabled: (enabled) => set({ enabled }),
  setVolume: (volume) => set({ volume: Math.max(0, Math.min(1, volume)) }),
  initReduceMotion: () => {
    AccessibilityInfo.isReduceMotionEnabled().then((isEnabled) => {
      set({ reduceMotion: isEnabled });
    });
    AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (isEnabled) => set({ reduceMotion: isEnabled }),
    );
  },
}));

// ─── Imperative playSound ───────────────────────────────────────────────────

/**
 * Play a sound effect by ID.
 * Respects enabled state, volume, and reduceMotion settings.
 * Can be called from anywhere (not just React components).
 *
 * Currently a no-op stub — the sound infrastructure is wired through all
 * components and ready to play real WAV assets once they are added to
 * assets/sounds/. Until then, haptic feedback provides the primary
 * tactile response.
 *
 * To enable real sounds:
 * 1. Place WAV files in assets/sounds/ (e.g., assets/sounds/send.wav)
 * 2. Import { Audio } from 'expo-audio' and load sources
 * 3. Replace the stub below with actual playback
 */
export function playSound(id: SoundId): void {
  const { enabled, reduceMotion } = useSoundStore.getState();
  if (!enabled || reduceMotion) return;

  // Stub — ready for WAV assets
  const _meta = SOUND_META[id];
}

/**
 * Clean up audio resources (call on app background/unmount).
 */
export function unloadSounds(): void {
  // No-op until WAV assets are loaded
}
