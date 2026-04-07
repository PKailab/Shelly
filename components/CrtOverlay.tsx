// components/CrtOverlay.tsx
// CRT display effect overlay — scanlines, phosphor tint, vignette, flicker
// pointerEvents="none" so it never blocks touch interactions

import React, { useEffect } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useCosmeticStore } from '@/store/cosmetic-store';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// Generate scanline data once — ~200 lines spaced 4px apart (1px line + 3px gap)
const SCANLINE_COUNT = Math.ceil(SCREEN_HEIGHT / 4) + 50; // extra buffer
const SCANLINES = Array.from({ length: SCANLINE_COUNT });

export function CrtOverlay() {
  const crtEnabled = useCosmeticStore((s) => s.crtEnabled);
  const crtIntensity = useCosmeticStore((s) => s.crtIntensity);

  // Flicker animation
  const flickerOpacity = useSharedValue(1);

  useEffect(() => {
    if (!crtEnabled) return;

    flickerOpacity.value = withRepeat(
      withSequence(
        withTiming(0.97, { duration: 100 }),
        withTiming(1, { duration: 100 }),
      ),
      -1, // infinite
      false,
    );
  }, [crtEnabled]);

  const flickerStyle = useAnimatedStyle(() => ({
    opacity: flickerOpacity.value,
  }));

  if (!crtEnabled) return null;

  // Scale all effect opacities by crtIntensity (0-100 → 0-1)
  const intensity = crtIntensity / 100;

  return (
    <Animated.View
      style={[styles.container, flickerStyle]}
      pointerEvents="none"
    >
      {/* ── Scanlines ── */}
      <View style={styles.scanlineContainer} pointerEvents="none">
        {SCANLINES.map((_, i) => (
          <View
            key={i}
            style={[
              styles.scanline,
              { opacity: 0.30 * intensity },
            ]}
          />
        ))}
      </View>

      {/* ── Phosphor green tint ── */}
      <View
        style={[
          styles.phosphorTint,
          { opacity: 0.03 * intensity },
        ]}
        pointerEvents="none"
      />

      {/* ── Vignette (4 edge gradients approximated via opaque-to-transparent Views) ── */}
      <View style={styles.vignetteContainer} pointerEvents="none">
        {/* Top */}
        <View
          style={[styles.vignetteTop, { opacity: 0.5 * intensity }]}
          pointerEvents="none"
        />
        {/* Bottom */}
        <View
          style={[styles.vignetteBottom, { opacity: 0.5 * intensity }]}
          pointerEvents="none"
        />
        {/* Left */}
        <View
          style={[styles.vignetteLeft, { opacity: 0.35 * intensity }]}
          pointerEvents="none"
        />
        {/* Right */}
        <View
          style={[styles.vignetteRight, { opacity: 0.35 * intensity }]}
          pointerEvents="none"
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
  },

  // ── Scanlines ──────────────────────────────
  scanlineContainer: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'column',
    overflow: 'hidden',
  },
  scanline: {
    height: 1,
    marginBottom: 3, // 1px line + 3px gap = 4px period
    backgroundColor: 'rgba(0,0,0,1)',
  },

  // ── Phosphor tint ──────────────────────────
  phosphorTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 255, 68, 1)', // fully opaque, opacity prop scales it
  },

  // ── Vignette ──────────────────────────────
  vignetteContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  vignetteTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 120,
    // Simulate gradient: darker shade at very top
    backgroundColor: 'rgba(0,0,0,0.45)',
    // The inner transparency is faked by layering — good enough for CRT look
  },
  vignetteBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 120,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  vignetteLeft: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: 80,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  vignetteRight: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 80,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
});
