import * as Notifications from 'expo-notifications';

export async function sendUsageAlert(body: string) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Shelly — Usage Alert',
      body,
      sound: 'default',
    },
    trigger: null,
  });
}
