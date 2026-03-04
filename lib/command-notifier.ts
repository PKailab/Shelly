/**
 * Push notification for long-running command completion.
 * Fires if a command took >= THRESHOLD_MS and the app is backgrounded.
 */
import * as Notifications from 'expo-notifications';
import { AppState } from 'react-native';

const THRESHOLD_MS = 10_000; // 10 seconds

// Set notification handler (silent in foreground)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Request notification permissions (call once at app startup).
 */
export async function requestNotificationPermission(): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

/**
 * Notify user that a long-running command has completed.
 * Only fires if the command took >= 10s.
 */
export async function notifyCommandComplete(
  command: string,
  exitCode: number | null,
  durationMs: number,
): Promise<void> {
  if (durationMs < THRESHOLD_MS) return;

  // Only notify when app is in background
  if (AppState.currentState === 'active') return;

  const success = exitCode === 0;
  const icon = success ? '✓' : '✗';
  const truncated = command.length > 60 ? command.slice(0, 57) + '...' : command;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: `${icon} Command ${success ? 'completed' : 'failed'}`,
      body: `$ ${truncated}\n${success ? 'Exit 0' : `Exit ${exitCode}`} (${Math.round(durationMs / 1000)}s)`,
      data: { command, exitCode },
    },
    trigger: null, // Immediate
  });
}
