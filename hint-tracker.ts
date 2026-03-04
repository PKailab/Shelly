/**
 * lib/hint-tracker.ts — v2.5
 *
 * ヒント表示回数管理。
 *
 * 設計方針:
 * - 同じヒントキーを3回見たら自動的に非表示（ガチ勢の邪魔にならない）
 * - AsyncStorageで永続化（アプリ再起動後も記憶）
 * - 初心者が @mention を自然に学べるよう、最初の数回だけ表示
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_PREFIX = 'shelly_hint_count_';
const MAX_SHOW_COUNT = 3;

// メモリキャッシュ（AsyncStorage呼び出しを減らす）
const memCache: Record<string, number> = {};

/**
 * 指定キーのヒントを表示すべきかどうかを返す。
 * 表示すべき場合はカウントをインクリメントする。
 */
export async function shouldShowHint(key: string): Promise<boolean> {
  try {
    // キャッシュ確認
    if (memCache[key] !== undefined) {
      if (memCache[key] >= MAX_SHOW_COUNT) return false;
      memCache[key]++;
      // 非同期でストレージ更新（awaitしない）
      AsyncStorage.setItem(`${STORAGE_PREFIX}${key}`, String(memCache[key])).catch(() => {});
      return true;
    }

    // AsyncStorageから読み込み
    const stored = await AsyncStorage.getItem(`${STORAGE_PREFIX}${key}`);
    const count = stored ? parseInt(stored, 10) : 0;
    memCache[key] = count;

    if (count >= MAX_SHOW_COUNT) return false;

    const newCount = count + 1;
    memCache[key] = newCount;
    await AsyncStorage.setItem(`${STORAGE_PREFIX}${key}`, String(newCount));
    return true;
  } catch {
    // ストレージエラー時は表示する（フォールバック）
    return true;
  }
}

/**
 * 指定キーのヒント表示回数をリセットする（デバッグ・設定リセット用）
 */
export async function resetHint(key: string): Promise<void> {
  try {
    delete memCache[key];
    await AsyncStorage.removeItem(`${STORAGE_PREFIX}${key}`);
  } catch {
    // ignore
  }
}

/**
 * すべてのヒント表示回数をリセットする
 */
export async function resetAllHints(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const hintKeys = keys.filter((k) => k.startsWith(STORAGE_PREFIX));
    if (hintKeys.length > 0) {
      await AsyncStorage.multiRemove(hintKeys);
    }
    // メモリキャッシュもクリア
    for (const key of Object.keys(memCache)) {
      delete memCache[key];
    }
  } catch {
    // ignore
  }
}

/**
 * 指定キーの現在の表示回数を返す（テスト・デバッグ用）
 */
export async function getHintCount(key: string): Promise<number> {
  if (memCache[key] !== undefined) return memCache[key];
  try {
    const stored = await AsyncStorage.getItem(`${STORAGE_PREFIX}${key}`);
    return stored ? parseInt(stored, 10) : 0;
  } catch {
    return 0;
  }
}

/**
 * 同期版: メモリキャッシュのみ参照（初回レンダリング用）
 * AsyncStorageが未ロードの場合はtrueを返す（表示する）
 */
export function shouldShowHintSync(key: string): boolean {
  const count = memCache[key] ?? 0;
  return count < MAX_SHOW_COUNT;
}
