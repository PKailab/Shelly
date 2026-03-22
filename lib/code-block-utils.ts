/**
 * lib/code-block-utils.ts — コードブロックの言語判定ユーティリティ
 *
 * Phase 4 ActionBlock実装時に使用。
 * コードブロックの言語タグから実行可能性を判定する。
 */

/** 実行可能な言語タグ */
const EXECUTABLE_LANGS = new Set(['bash', 'sh', 'zsh', 'shell']);

/** タグなし時にシェルコマンドと判定するプレフィックス */
const SHELL_PREFIXES = [
  '$', '#', 'sudo ', 'npm ', 'npx ', 'pnpm ', 'yarn ',
  'git ', 'cd ', 'mkdir ', 'ls ', 'rm ', 'cp ', 'mv ',
  'touch ', 'cat ', 'echo ', 'export ', 'source ',
  'apt ', 'pkg ', 'pip ', 'python ', 'node ',
  'curl ', 'wget ', 'chmod ', 'chown ', 'tar ',
  'make ', 'cargo ', 'go ', 'docker ', 'brew ',
];

export type CodeBlockAction = 'execute' | 'copy-only';

/**
 * コードブロックの言語タグと内容から、実行可能かどうかを判定する。
 *
 * @param lang  言語タグ（"bash", "typescript", undefined等）
 * @param code  コードブロックの内容
 * @returns     'execute' = [▶実行] + [コピー]、'copy-only' = [コピー]のみ
 */
export function classifyCodeBlock(lang: string | undefined, code: string): CodeBlockAction {
  const normalizedLang = lang?.trim().toLowerCase();

  // 明示的に実行可能な言語
  if (normalizedLang && EXECUTABLE_LANGS.has(normalizedLang)) {
    return 'execute';
  }

  // 明示的に非実行言語（タグあり）
  if (normalizedLang) {
    return 'copy-only';
  }

  // タグなし → 内容からシェルコマンドかどうかを推定
  const firstLine = code.trimStart().split('\n')[0].trim();
  const isShellLike = SHELL_PREFIXES.some((prefix) => firstLine.startsWith(prefix));

  return isShellLike ? 'execute' : 'copy-only';
}
