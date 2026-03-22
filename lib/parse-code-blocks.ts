/**
 * lib/parse-code-blocks.ts — AI応答テキストからコードブロックを検出・分割
 */

export type ContentSegment =
  | { type: 'text'; content: string }
  | { type: 'code'; content: string; language?: string };

/**
 * マークダウンのfenced code blocks (```) を検出し、
 * テキスト部分とコードブロック部分に分割する。
 */
export function parseCodeBlocks(text: string): ContentSegment[] {
  const segments: ContentSegment[] = [];
  const regex = /```(\w*)\r?\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const textContent = text.slice(lastIndex, match.index).trim();
      if (textContent) {
        segments.push({ type: 'text', content: textContent });
      }
    }
    const language = match[1] || undefined;
    const code = match[2].trim();
    if (code) {
      segments.push({ type: 'code', content: code, language });
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    const remaining = text.slice(lastIndex).trim();
    if (remaining) {
      segments.push({ type: 'text', content: remaining });
    }
  }

  return segments;
}

/**
 * テキストにfenced code blocksが含まれるかチェック。
 */
export function hasCodeBlocks(text: string): boolean {
  return /```\w*\r?\n[\s\S]*?```/.test(text);
}
