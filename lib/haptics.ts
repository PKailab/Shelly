// lib/haptics.ts
import * as Haptics from 'expo-haptics';
import { useCosmeticStore } from '@/store/cosmetic-store';

/** Trigger light haptic feedback if enabled */
export function triggerHaptic(style: 'light' | 'medium' | 'heavy' = 'light') {
  const enabled = useCosmeticStore.getState().hapticEnabled;
  if (!enabled) return;

  switch (style) {
    case 'light':
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      break;
    case 'medium':
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      break;
    case 'heavy':
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      break;
  }
}

/** Trigger selection feedback */
export function triggerSelection() {
  const enabled = useCosmeticStore.getState().hapticEnabled;
  if (!enabled) return;
  Haptics.selectionAsync();
}

/** Trigger notification feedback */
export function triggerNotification(type: 'success' | 'warning' | 'error' = 'success') {
  const enabled = useCosmeticStore.getState().hapticEnabled;
  if (!enabled) return;
  Haptics.notificationAsync(
    type === 'success' ? Haptics.NotificationFeedbackType.Success :
    type === 'warning' ? Haptics.NotificationFeedbackType.Warning :
    Haptics.NotificationFeedbackType.Error
  );
}
