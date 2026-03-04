/**
 * Obsidian RAG (Retrieval-Augmented Generation) モジュール
 *
 * Obsidian Vault内のMarkdownノートをコンテキストとして読み込み、
 * AIクエリに付加することで、ユーザー固有の知識ベースを活用した
 * 回答生成を可能にします。
 *
 * 動作原理:
 *   1. Termux WebSocket経由でVaultディレクトリを再帰的に走査
 *   2. .mdファイルを読み込み、クエリとの関連度をキーワードマッチングで評価
 *   3. 上位N件のノートをコンテキストとしてプロンプトに付加
 *
 * 制約:
 *   - Termux接続が必要（ファイルシステムアクセスのため）
 *   - 大規模Vaultでは検索に時間がかかる場合がある
 *   - コンテキストサイズはLLMのトークン上限に依存
 */

// ─── 型定義 ──────────────────────────────────────────────────────────────────

export interface NoteChunk {
  /** Vault内の相対パス (例: 01_Articles/2025-01-15_ai-paper.md) */
  path: string;
  /** ノートのタイトル (frontmatterまたはファイル名から取得) */
  title: string;
  /** ノートの本文テキスト (最大MAX_CHUNK_CHARS文字) */
  content: string;
  /** クエリとの関連スコア (0.0〜1.0) */
  score: number;
  /** 最終更新日時 (Unix timestamp) */
  modifiedAt?: number;
}

export interface RagContext {
  /** 取得したノートチャンクの配列 */
  chunks: NoteChunk[];
  /** コンテキスト全体の文字数 */
  totalChars: number;
  /** 検索にかかった時間 (ms) */
  searchTimeMs: number;
}

export interface RagOptions {
  /** Vault のルートパス (例: /storage/emulated/0/ObsidianVault) */
  vaultPath: string;
  /** 最大取得ノート数 (default: 5) */
  maxChunks?: number;
  /** 1チャンクの最大文字数 (default: 1500) */
  maxChunkChars?: number;
  /** 検索対象サブディレクトリ (未指定=全体) */
  searchDirs?: string[];
  /** 最低スコア閾値 (default: 0.1) */
  minScore?: number;
}

// ─── 定数 ────────────────────────────────────────────────────────────────────

const DEFAULT_MAX_CHUNKS = 5;
const DEFAULT_MAX_CHUNK_CHARS = 1500;
const DEFAULT_MIN_SCORE = 0.1;

/** 検索対象として優先するディレクトリ（関連度が高い順） */
const PRIORITY_DIRS = [
  '00_Daily-Briefing',
  '01_Articles',
  '02_Papers',
  '03_Policy',
  '04_SNS-Drafts',
];

// ─── ユーティリティ関数 ────────────────────────────────────────────────────────

/**
 * Markdownのfrontmatterからタイトルを抽出する
 */
function extractTitle(content: string, filePath: string): string {
  // frontmatter の title フィールド
  const frontmatterMatch = content.match(/^---\s*\n(?:.*\n)*?title:\s*["']?([^"'\n]+)["']?\s*\n/m);
  if (frontmatterMatch) return frontmatterMatch[1].trim();

  // 最初の # 見出し
  const h1Match = content.match(/^#\s+(.+)$/m);
  if (h1Match) return h1Match[1].trim();

  // ファイル名からタイトルを生成
  const fileName = filePath.split('/').pop() ?? filePath;
  return fileName.replace(/\.md$/, '').replace(/[-_]/g, ' ');
}

/**
 * frontmatterを除いた本文テキストを返す
 */
function stripFrontmatter(content: string): string {
  return content.replace(/^---\s*\n[\s\S]*?---\s*\n/, '').trim();
}

/**
 * クエリとノートの関連スコアを計算する（キーワードマッチング）
 *
 * スコアリング基準:
 * - タイトルへのキーワード一致: 重み 3.0
 * - 本文への一致: 重み 1.0
 * - 複数キーワード一致でボーナス
 */
export function computeRelevanceScore(query: string, title: string, content: string): number {
  // クエリをトークン化（日本語・英語両対応）
  const tokens = query
    .toLowerCase()
    .split(/[\s　、。，．・\-_/]+/)
    .filter(t => t.length >= 2);

  if (tokens.length === 0) return 0;

  const titleLower = title.toLowerCase();
  const contentLower = content.toLowerCase();

  let score = 0;
  let matchCount = 0;

  for (const token of tokens) {
    const inTitle = titleLower.includes(token);
    const inContent = contentLower.includes(token);

    if (inTitle) {
      score += 3.0;
      matchCount++;
    }
    if (inContent) {
      // 出現頻度も考慮（最大5回分）
      const occurrences = Math.min(
        (contentLower.match(new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? []).length,
        5,
      );
      score += occurrences * 1.0;
      if (!inTitle) matchCount++;
    }
  }

  // 複数キーワードが一致した場合のボーナス
  if (matchCount >= 2) score *= 1.2;
  if (matchCount >= 3) score *= 1.1;

  // 正規化（0.0〜1.0）
  const maxPossibleScore = tokens.length * (3.0 + 5.0) * 1.2 * 1.1;
  return Math.min(score / maxPossibleScore, 1.0);
}

/**
 * Termux WebSocket経由でファイルを読み込む
 * sendCommandはindex.tsxから注入されるコールバック
 */
export type CommandRunner = (cmd: string) => Promise<string>;

/**
 * Termux経由でVaultのmdファイル一覧を取得する
 */
export async function listVaultFiles(
  vaultPath: string,
  runCmd: CommandRunner,
  searchDirs?: string[],
): Promise<string[]> {
  const dirsToSearch = searchDirs && searchDirs.length > 0
    ? searchDirs.map(d => `${vaultPath}/${d}`)
    : [vaultPath];

  const allFiles: string[] = [];

  for (const dir of dirsToSearch) {
    try {
      // find コマンドで .md ファイルを再帰的に列挙（最大深度3）
      const result = await runCmd(
        `find "${dir}" -maxdepth 3 -name "*.md" -type f 2>/dev/null | head -100`,
      );
      const files = result
        .split('\n')
        .map(f => f.trim())
        .filter(f => f.length > 0 && f.endsWith('.md'));
      allFiles.push(...files);
    } catch {
      // ディレクトリが存在しない場合はスキップ
    }
  }

  return [...new Set(allFiles)]; // 重複除去
}

/**
 * Termux経由でファイルの内容を読み込む
 */
export async function readVaultFile(
  filePath: string,
  runCmd: CommandRunner,
  maxChars: number = DEFAULT_MAX_CHUNK_CHARS,
): Promise<string> {
  // head コマンドで先頭部分のみ取得（大きなファイルへの対策）
  const charLimit = maxChars * 2; // UTF-8のマルチバイト考慮
  const result = await runCmd(
    `head -c ${charLimit} "${filePath}" 2>/dev/null`,
  );
  return result.slice(0, maxChars);
}

// ─── メイン関数 ───────────────────────────────────────────────────────────────

/**
 * クエリに関連するObsidianノートを検索してコンテキストを返す
 *
 * @param query - AIへのクエリテキスト
 * @param runCmd - Termuxコマンド実行関数
 * @param options - RAGオプション
 * @returns 関連ノートのコンテキスト
 */
export async function retrieveObsidianContext(
  query: string,
  runCmd: CommandRunner,
  options: RagOptions,
): Promise<RagContext> {
  const startTime = Date.now();
  const {
    vaultPath,
    maxChunks = DEFAULT_MAX_CHUNKS,
    maxChunkChars = DEFAULT_MAX_CHUNK_CHARS,
    searchDirs,
    minScore = DEFAULT_MIN_SCORE,
  } = options;

  // 1. Vaultファイル一覧を取得
  const files = await listVaultFiles(vaultPath, runCmd, searchDirs);

  if (files.length === 0) {
    return { chunks: [], totalChars: 0, searchTimeMs: Date.now() - startTime };
  }

  // 2. 各ファイルを読み込んでスコアリング
  const scoredChunks: NoteChunk[] = [];

  // 並列読み込み（最大20ファイルまで）
  const filesToRead = files.slice(0, 50);
  const readPromises = filesToRead.map(async (filePath) => {
    try {
      const raw = await readVaultFile(filePath, runCmd, maxChunkChars);
      if (!raw || raw.trim().length < 50) return null; // 短すぎるファイルはスキップ

      const title = extractTitle(raw, filePath);
      const body = stripFrontmatter(raw);
      const score = computeRelevanceScore(query, title, body);

      if (score < minScore) return null;

      // Vault相対パスを計算
      const relativePath = filePath.startsWith(vaultPath)
        ? filePath.slice(vaultPath.length + 1)
        : filePath;

      return {
        path: relativePath,
        title,
        content: body.slice(0, maxChunkChars),
        score,
      } as NoteChunk;
    } catch {
      return null;
    }
  });

  const results = await Promise.all(readPromises);
  for (const chunk of results) {
    if (chunk) scoredChunks.push(chunk);
  }

  // 3. スコア降順でソートして上位N件を返す
  scoredChunks.sort((a, b) => b.score - a.score);
  const topChunks = scoredChunks.slice(0, maxChunks);

  const totalChars = topChunks.reduce((sum, c) => sum + c.content.length, 0);

  return {
    chunks: topChunks,
    totalChars,
    searchTimeMs: Date.now() - startTime,
  };
}

/**
 * RAGコンテキストをAIプロンプト用の文字列に変換する
 *
 * @param context - retrieveObsidianContextの戻り値
 * @returns プロンプトに付加するコンテキスト文字列
 */
export function formatRagContext(context: RagContext): string {
  if (context.chunks.length === 0) return '';

  const lines: string[] = [
    '## 📚 Obsidian Vault コンテキスト',
    `（${context.chunks.length}件のノートを参照 / 検索時間: ${context.searchTimeMs}ms）`,
    '',
  ];

  for (const chunk of context.chunks) {
    lines.push(`### ${chunk.title}`);
    lines.push(`> パス: \`${chunk.path}\` | 関連度: ${(chunk.score * 100).toFixed(0)}%`);
    lines.push('');
    lines.push(chunk.content);
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  lines.push('## ユーザーの質問');

  return lines.join('\n');
}

/**
 * クエリにObsidianコンテキストを付加したプロンプトを生成する
 *
 * @param query - 元のユーザークエリ
 * @param context - RAGコンテキスト
 * @returns コンテキスト付きプロンプト
 */
export function buildRagPrompt(query: string, context: RagContext): string {
  if (context.chunks.length === 0) return query;

  return `${formatRagContext(context)}\n${query}`;
}

// ─── 設定ヘルパー ─────────────────────────────────────────────────────────────

/**
 * RAGが利用可能かどうかを確認する
 * （Termux接続済み + Vault設定済みの場合のみ有効）
 */
export function isRagAvailable(
  isBridgeConnected: boolean,
  vaultPath: string | undefined,
): boolean {
  return isBridgeConnected && !!vaultPath && vaultPath.trim().length > 0;
}

/**
 * Vault内の優先ディレクトリ一覧を返す（設定UIで使用）
 */
export function getPriorityDirs(): string[] {
  return [...PRIORITY_DIRS];
}
