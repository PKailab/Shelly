import { type SoundProfile } from '@/store/cosmetic-store';

export type SoundEvent = 'keypress' | 'complete' | 'error' | 'notification';

type SoundConfig = {
  frequency: number;
  duration: number;
  waveform: 'sine' | 'square' | 'sawtooth' | 'triangle';
  volume: number;
};

export const SOUND_PROFILES: Record<SoundProfile, Record<SoundEvent, SoundConfig>> = {
  modern: {
    keypress: { frequency: 800, duration: 30, waveform: 'sine', volume: 0.3 },
    complete: { frequency: 1200, duration: 100, waveform: 'sine', volume: 0.5 },
    error: { frequency: 300, duration: 150, waveform: 'sine', volume: 0.5 },
    notification: { frequency: 1000, duration: 80, waveform: 'triangle', volume: 0.4 },
  },
  retro: {
    keypress: { frequency: 440, duration: 20, waveform: 'square', volume: 0.2 },
    complete: { frequency: 880, duration: 150, waveform: 'square', volume: 0.4 },
    error: { frequency: 220, duration: 200, waveform: 'sawtooth', volume: 0.4 },
    notification: { frequency: 660, duration: 100, waveform: 'square', volume: 0.3 },
  },
  silent: {
    keypress: { frequency: 0, duration: 0, waveform: 'sine', volume: 0 },
    complete: { frequency: 0, duration: 0, waveform: 'sine', volume: 0 },
    error: { frequency: 0, duration: 0, waveform: 'sine', volume: 0 },
    notification: { frequency: 0, duration: 0, waveform: 'sine', volume: 0 },
  },
};

/** Get sound config for current profile */
export function getSoundConfig(event: SoundEvent): SoundConfig {
  const { useCosmeticStore } = require('@/store/cosmetic-store');
  const profile = useCosmeticStore.getState().soundProfile;
  return SOUND_PROFILES[profile][event];
}
