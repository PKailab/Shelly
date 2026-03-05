import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useMultiPaneStore } from '@/hooks/use-multi-pane';
import { useDeviceLayout } from '@/hooks/use-device-layout';

const ACCENT = '#00D4AA';

/**
 * Floating Action Button for multi-pane toggle.
 * Only visible on the inner (unfolded) screen.
 * Hidden completely on the outer (cover) screen.
 */
export function MultiPaneToggle() {
  const layout = useDeviceLayout();
  const { isMultiPane, toggleMultiPane } = useMultiPaneStore();

  // Only show on wide screens (tablet, foldable inner, desktop)
  if (!layout.isWide) return null;

  return (
    <Pressable
      style={styles.fab}
      onPress={toggleMultiPane}
      android_ripple={{ color: 'rgba(255,255,255,0.2)', borderless: true }}
    >
      <MaterialIcons
        name={isMultiPane ? 'fullscreen' : 'view-column'}
        size={24}
        color="#FFFFFF"
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 72, // above the tab bar
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    zIndex: 100,
  },
});
