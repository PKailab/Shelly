/**
 * lib/tts.ts — TTS (Text-to-Speech) ユーティリティ
 *
 * expo-speech を使用してAI応答テキストを日本語で読み上げる。
 * マークダウン記法を除去し、コードブロックは「コードブロック省略」に変換。
 */

import * as Speech from 'expo-speech';

/**
 * マークダウンをプレーンテキストに変換する（TTS用）
 */
function stripMarkdown(text: string): string {
  let result = text;

  // コードブロック（```...```）を「コードブロック省略」に置換
  result = result.replace(/```[\s\S]*?```/g, 'コードブロック省略。');

  // インラインコード（`...`）を除去
  result = result.replace(/`([^`]+)`/g, '$1');

  // 見出し（# ## ### etc）
  result = result.replace(/^#{1,6}\s+/gm, '');

  // 太字・斜体
  result = result.replace(/\*\*([^*]+)\*\*/g, '$1');
  result = result.replace(/\*([^*]+)\*/g, '$1');
  result = result.replace(/__([^_]+)__/g, '$1');
  result = result.replace(/_([^_]+)_/g, '$1');

  // リンク [text](url) → text
  result = result.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  // 箇条書きマーカー
  result = result.replace(/^[\s]*[-*+]\s+/gm, '');
  result = result.replace(/^[\s]*\d+\.\s+/gm, '');

  // 水平線
  result = result.replace(/^[-*_]{3,}$/gm, '');

  // 引用
  result = result.replace(/^>\s*/gm, '');

  // 連続改行を1つに
  result = result.replace(/\n{3,}/g, '\n\n');

  return result.trim();
}

/**
 * テキストを日本語で読み上げる
 */
export async function speakText(text: string): Promise<void> {
  const plainText = stripMarkdown(text);
  if (!plainText) return;

  // 長すぎるテキストは切り詰め（TTS制限対策）
  const truncated = plainText.length > 3000 ? plainText.slice(0, 3000) + '。以下省略。' : plainText;

  return new Promise<void>((resolve) => {
    Speech.speak(truncated, {
      language: 'ja-JP',
      rate: 1.0,
      pitch: 1.0,
      onDone: () => resolve(),
      onStopped: () => resolve(),
      onError: () => resolve(),
    });
  });
}

/**
 * 読み上げを停止する
 */
export function stopSpeaking(): void {
  Speech.stop();
}

/**
 * 現在読み上げ中かどうか
 */
export async function isSpeaking(): Promise<boolean> {
  return Speech.isSpeakingAsync();
}
