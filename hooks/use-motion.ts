import { useCallback, useMemo } from 'react';
import {
  withSpring,
  withTiming,
  withRepeat,
  withSequence,
  useReducedMotion,
  Easing,
  type SharedValue,
  type WithSpringConfig,
  type WithTimingConfig,
} from 'react-native-reanimated';

// ─── Spring Configurations ──────────────────────────────────────────────────

export const SPRING_CONFIGS = {
  /** Buttons, toggles — fast and responsive */
  snappy: { damping: 15, stiffness: 200, mass: 0.8 } satisfies WithSpringConfig,
  /** Panels, modals — smooth and natural */
  gentle: { damping: 20, stiffness: 120, mass: 1.0 } satisfies WithSpringConfig,
  /** Success effects, playful bounce */
  bouncy: { damping: 10, stiffness: 180, mass: 0.6 } satisfies WithSpringConfig,
  /** Micro-interactions — near-instant */
  quick: { damping: 18, stiffness: 300, mass: 0.5 } satisfies WithSpringConfig,
} as const;

// ─── Timing Configurations ──────────────────────────────────────────────────

export const TIMING_CONFIGS = {
  fast: {
    duration: 150,
    easing: Easing.out(Easing.cubic),
  } satisfies WithTimingConfig,
  normal: {
    duration: 250,
    easing: Easing.out(Easing.cubic),
  } satisfies WithTimingConfig,
  slow: {
    duration: 400,
    easing: Easing.out(Easing.cubic),
  } satisfies WithTimingConfig,
  enter: {
    duration: 300,
    easing: Easing.out(Easing.back(1.2)),
  } satisfies WithTimingConfig,
  exit: {
    duration: 200,
    easing: Easing.in(Easing.cubic),
  } satisfies WithTimingConfig,
} as const;

// ─── useMotion Hook ─────────────────────────────────────────────────────────

type MotionHelpers = {
  /** Whether reduce motion is enabled */
  reduceMotion: boolean;
  /** Animate with spring — returns target value directly if reduceMotion */
  animateSpring: (sv: SharedValue<number>, target: number, config?: keyof typeof SPRING_CONFIGS) => void;
  /** Animate with timing — returns target value directly if reduceMotion */
  animateTiming: (sv: SharedValue<number>, target: number, config?: keyof typeof TIMING_CONFIGS) => void;
  /** Create a repeating pulse animation */
  pulse: (sv: SharedValue<number>, from: number, to: number, duration?: number) => void;
  /** Stop animation and set to value */
  snap: (sv: SharedValue<number>, value: number) => void;
};

/**
 * Hook that provides animation utilities respecting reduceMotion.
 * When reduceMotion is enabled, all animations snap to their target instantly.
 */
export function useMotion(): MotionHelpers {
  const reduceMotion = useReducedMotion();

  const animateSpring = useCallback(
    (sv: SharedValue<number>, target: number, config: keyof typeof SPRING_CONFIGS = 'snappy') => {
      if (reduceMotion) {
        sv.value = target;
        return;
      }
      sv.value = withSpring(target, SPRING_CONFIGS[config]);
    },
    [reduceMotion],
  );

  const animateTiming = useCallback(
    (sv: SharedValue<number>, target: number, config: keyof typeof TIMING_CONFIGS = 'normal') => {
      if (reduceMotion) {
        sv.value = target;
        return;
      }
      sv.value = withTiming(target, TIMING_CONFIGS[config]);
    },
    [reduceMotion],
  );

  const pulse = useCallback(
    (sv: SharedValue<number>, from: number, to: number, duration: number = 800) => {
      if (reduceMotion) {
        sv.value = from;
        return;
      }
      sv.value = withRepeat(
        withSequence(
          withTiming(to, { duration: duration / 2, easing: Easing.inOut(Easing.ease) }),
          withTiming(from, { duration: duration / 2, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      );
    },
    [reduceMotion],
  );

  const snap = useCallback(
    (sv: SharedValue<number>, value: number) => {
      sv.value = value;
    },
    [],
  );

  return useMemo(
    () => ({ reduceMotion, animateSpring, animateTiming, pulse, snap }),
    [reduceMotion, animateSpring, animateTiming, pulse, snap],
  );
}
