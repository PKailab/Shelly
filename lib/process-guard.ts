/**
 * lib/process-guard.ts — Android phantom process killer detection & device-specific fix guides
 *
 * Detects SIGKILL (signal 9) from Android 12+ phantom process killer.
 * Provides manufacturer-specific battery optimization guides.
 */

import { Platform } from 'react-native';

export type KillFixStep = {
  title: string;
  titleJa: string;
  description: string;
  descriptionJa: string;
  intentUri?: string;
  adbCommand?: string;
};

export type DeviceProfile = {
  androidVersion: number;
  manufacturer: string;
  fixSteps: KillFixStep[];
};

export function getDeviceProfile(): DeviceProfile {
  const ver = Platform.Version as number;
  let mfr = '';
  try {
    // expo-device may not be available in all builds
    const Device = require('expo-device');
    mfr = (Device.manufacturer ?? '').toLowerCase();
  } catch {
    mfr = 'unknown';
  }

  const steps: KillFixStep[] = [];

  // Android version-specific phantom process fix
  if (ver >= 34) {
    steps.push({
      title: 'Disable process restrictions',
      titleJa: 'プロセス制限を無効化',
      description: 'Open Developer Options and turn OFF "Disable child process restrictions" (or set background process limit to "Standard limit").',
      descriptionJa: '開発者向けオプションを開いて「子プロセスの制限を無効にする」をOFFに（またはバックグラウンドプロセス制限を「標準の制限」に）してください。',
      intentUri: 'android.settings.APPLICATION_DEVELOPMENT_SETTINGS',
    });
  } else if (ver >= 31) {
    steps.push({
      title: 'Disable phantom process killer (ADB required)',
      titleJa: 'ファントムプロセスキラーを無効化（ADB必要）',
      description: 'Connect your phone to a PC with USB debugging enabled and run this command:',
      descriptionJa: 'USBデバッグを有効にしてPCに接続し、以下のコマンドを実行してください:',
      adbCommand: ver >= 32
        ? 'adb shell settings put global settings_enable_monitor_phantom_procs false'
        : 'adb shell "device_config set_sync_disabled_for_tests persistent && device_config put activity_manager max_phantom_processes 2147483647"',
    });
  }

  // Manufacturer-specific battery optimization
  if (mfr.includes('samsung')) {
    steps.push({
      title: 'Samsung battery optimization',
      titleJa: 'Samsung バッテリー最適化',
      description: 'Settings > Battery > App battery usage > Shelly > Unrestricted',
      descriptionJa: '設定 > バッテリー > アプリのバッテリー使用 > Shelly > 制限なし',
      intentUri: 'android.settings.BATTERY_SAVER_SETTINGS',
    });
  } else if (mfr.includes('xiaomi') || mfr.includes('redmi') || mfr.includes('poco')) {
    steps.push({
      title: 'Xiaomi battery optimization',
      titleJa: 'Xiaomi バッテリー最適化',
      description: 'Settings > Battery & performance > App battery saver > Shelly > No restrictions',
      descriptionJa: '設定 > バッテリー > アプリバッテリーセーバー > Shelly > 制限なし',
      intentUri: 'android.settings.BATTERY_SAVER_SETTINGS',
    });
  } else if (mfr.includes('huawei') || mfr.includes('honor')) {
    steps.push({
      title: 'Huawei battery optimization',
      titleJa: 'Huawei バッテリー最適化',
      description: 'Settings > Battery > App launch > Shelly > Manage manually (all toggles ON)',
      descriptionJa: '設定 > バッテリー > アプリ起動 > Shelly > 手動管理（すべてON）',
      intentUri: 'android.settings.BATTERY_SAVER_SETTINGS',
    });
  } else if (mfr.includes('oppo') || mfr.includes('realme') || mfr.includes('oneplus')) {
    steps.push({
      title: 'OPPO/OnePlus battery optimization',
      titleJa: 'OPPO/OnePlus バッテリー最適化',
      description: 'Settings > Battery > Battery optimization > Shelly > Not optimized',
      descriptionJa: '設定 > バッテリー > バッテリー最適化 > Shelly > 最適化しない',
      intentUri: 'android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS',
    });
  } else {
    steps.push({
      title: 'Disable battery optimization',
      titleJa: 'バッテリー最適化を無効化',
      description: 'Settings > Battery > Battery optimization > Shelly > Not optimized',
      descriptionJa: '設定 > バッテリー > バッテリー最適化 > Shelly > 最適化しない',
      intentUri: 'android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS',
    });
  }

  return { androidVersion: ver, manufacturer: mfr, fixSteps: steps };
}

/** Signal 9 = SIGKILL = Android killed the process */
export function isProcessKill(signal: number, exitCode: number): boolean {
  return signal === 9 || exitCode === 137;
}
