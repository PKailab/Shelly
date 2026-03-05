/**
 * Obsidian Collector
 *
 * 毎朝 STEAM/EdTech 関連の記事・論文を自動収集し、
 * Obsidian Vault（Google Drive同期）に Markdown ノートとして保存する。
 *
 * 収集ソース:
 *   1. arXiv API          — AI×教育・STEAM系プレプリント論文（無料）
 *   2. Semantic Scholar   — 査読済み論文（引用数・DOI付き、無料）
 *   3. Perplexity Sonar   — Web記事・政策文書（全言語、過去30日）
 *
 * コスト最適化:
 *   - 論文収集は無料API（arXiv/SemanticScholar）を優先
 *   - Perplexity は記事収集のみ（要約には使わない）
 *   - 要約・翻訳・タグ生成は Gemini Flash（無料枠内）
 *   - 重複排除で不要なAPI呼び出しを削減
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

// ─── 型定義 ──────────────────────────────────────────────────────────────────

export type ItemType = 'paper' | 'article' | 'policy';
export type CredibilityLevel = 1 | 2 | 3 | 4 | 5;

export interface BriefingItem {
  id: string;                    // URLまたはDOIのハッシュ
  type: ItemType;
  title: string;                 // 日本語タイトル
  originalTitle: string;         // 原文タイトル
  summary: string;               // 日本語要約（300〜500字）
  originalLanguage: string;      // 原文言語コード (en, zh, de, ...)
  source: string;                // ソース名（arXiv, Nature, UNESCO, etc.）
  url: string;                   // 元記事URL
  doi?: string;                  // 論文DOI
  authors?: string[];            // 著者名
  publishedAt: string;           // 発行日（ISO8601）
  collectedAt: string;           // 収集日時（ISO8601）
  tags: string[];                // タグ（日本語）
  credibility: CredibilityLevel; // 信頼度（1〜5）
  citationCount?: number;        // 引用数（論文のみ）
  vaultPath?: string;            // Vault内のファイルパス
  japaneseSummary?: string;       // Gemini生成の日本語要約
}

export interface CollectionResult {
  success: boolean;
  items: BriefingItem[];
  errors: string[];
  totalFetched: number;
  duplicatesSkipped: number;
  tokenUsage?: {
    geminiTokens: number;
    perplexityRequests: number;
  };
}

export interface CollectorConfig {
  geminiApiKey: string;
  perplexityApiKey?: string;
  vaultPath: string;             // 例: /storage/emulated/0/ObsidianVault
  maxItems?: number;             // デフォルト: 8
  daysBack?: number;             // デフォルト: 30
}

// ─── 定数 ────────────────────────────────────────────────────────────────────

const DEDUP_INDEX_KEY = 'obsidian_dedup_index_v1';
const DEDUP_RETENTION_DAYS = 90;
const DEFAULT_MAX_ITEMS = 8;
const DEFAULT_DAYS_BACK = 30;

// arXiv カテゴリ（教育・AI・STEAM関連）
const ARXIV_CATEGORIES = [
  'cs.AI',    // Artificial Intelligence
  'cs.CY',    // Computers and Society（教育含む）
  'cs.HC',    // Human-Computer Interaction
  'stat.ML',  // Machine Learning
];

// Semantic Scholar 検索クエリ
const SEMANTIC_SCHOLAR_QUERIES = [
  'STEAM education',
  'EdTech artificial intelligence',
  'K-12 programming education',
  'computational thinking',
  'AI literacy education',
];

// Perplexity 検索クエリ（多言語・全世界対象）
const PERPLEXITY_QUERIES = [
  'STEAM education latest research 2026',
  'EdTech policy government 2026',
  'AI education classroom implementation 2026',
];

// ─── 重複排除インデックス ────────────────────────────────────────────────────

interface DedupEntry {
  id: string;
  collectedAt: string;
}

async function loadDedupIndex(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(DEDUP_INDEX_KEY);
    if (!raw) return new Set();
    const entries: DedupEntry[] = JSON.parse(raw);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - DEDUP_RETENTION_DAYS);
    // 期限切れエントリを除外
    const valid = entries.filter(e => new Date(e.collectedAt) > cutoff);
    return new Set(valid.map(e => e.id));
  } catch {
    return new Set();
  }
}

async function saveDedupIndex(existingIds: Set<string>, newIds: string[]): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(DEDUP_INDEX_KEY);
    const existing: DedupEntry[] = raw ? JSON.parse(raw) : [];
    const now = new Date().toISOString();
    const newEntries: DedupEntry[] = newIds.map(id => ({ id, collectedAt: now }));
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - DEDUP_RETENTION_DAYS);
    const filtered = existing.filter(e => new Date(e.collectedAt) > cutoff);
    await AsyncStorage.setItem(DEDUP_INDEX_KEY, JSON.stringify([...filtered, ...newEntries]));
  } catch {
    // 保存失敗は無視（次回再収集になるだけ）
  }
}

function generateId(url: string, doi?: string): string {
  const key = doi || url;
  // 簡易ハッシュ（CRC32風）
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    const char = key.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

// ─── arXiv API ───────────────────────────────────────────────────────────────

interface ArxivEntry {
  title: string;
  summary: string;
  authors: string[];
  published: string;
  url: string;
  doi?: string;
}

async function fetchArxivPapers(daysBack: number): Promise<ArxivEntry[]> {
  const results: ArxivEntry[] = [];
  const dateFrom = new Date();
  dateFrom.setDate(dateFrom.getDate() - daysBack);
  const dateStr = dateFrom.toISOString().split('T')[0].replace(/-/g, '');

  for (const category of ARXIV_CATEGORIES.slice(0, 2)) {
    try {
      const query = encodeURIComponent(
        `cat:${category} AND (STEAM OR "education" OR "EdTech" OR "learning") AND submittedDate:[${dateStr}0000 TO 99991231235959]`
      );
      const url = `https://export.arxiv.org/api/query?search_query=${query}&max_results=5&sortBy=submittedDate&sortOrder=descending`;

      const resp = await fetch(url, {
        headers: { 'User-Agent': 'ShellyApp/4.0 (research tool)' },
      });
      if (!resp.ok) continue;

      const xml = await resp.text();
      // 簡易XMLパース（entry要素を抽出）
      const entryMatches = xml.match(/<entry>([\s\S]*?)<\/entry>/g) || [];

      for (const entry of entryMatches.slice(0, 3)) {
        const title = entry.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.trim().replace(/\n\s+/g, ' ') || '';
        const summary = entry.match(/<summary>([\s\S]*?)<\/summary>/)?.[1]?.trim().replace(/\n\s+/g, ' ') || '';
        const published = entry.match(/<published>(.*?)<\/published>/)?.[1]?.trim() || '';
        const entryUrl = entry.match(/<id>(.*?)<\/id>/)?.[1]?.trim() || '';
        const authorMatches = entry.match(/<name>(.*?)<\/name>/g) || [];
        const authors = authorMatches.map(a => a.replace(/<\/?name>/g, '').trim());
        const doiMatch = entry.match(/arxiv\.org\/abs\/([\d.]+)/);
        const doi = doiMatch ? `10.48550/arXiv.${doiMatch[1]}` : undefined;

        if (title && summary && entryUrl) {
          results.push({ title, summary, authors, published, url: entryUrl, doi });
        }
      }
    } catch {
      // カテゴリ取得失敗は無視して次へ
    }
  }

  return results;
}

// ─── Semantic Scholar API ────────────────────────────────────────────────────

interface SemanticPaper {
  title: string;
  abstract: string;
  authors: { name: string }[];
  year: number;
  citationCount: number;
  externalIds: { DOI?: string; ArXiv?: string };
  url: string;
  publicationDate?: string;
}

async function fetchSemanticScholarPapers(daysBack: number): Promise<SemanticPaper[]> {
  const results: SemanticPaper[] = [];
  const yearFrom = new Date().getFullYear();

  for (const query of SEMANTIC_SCHOLAR_QUERIES.slice(0, 2)) {
    try {
      const encoded = encodeURIComponent(query);
      const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encoded}&fields=title,abstract,authors,year,citationCount,externalIds,url,publicationDate&limit=5&year=${yearFrom - 1}-${yearFrom}`;

      const resp = await fetch(url, {
        headers: {
          'User-Agent': 'ShellyApp/4.0',
        },
      });
      if (!resp.ok) continue;

      const data = await resp.json();
      const papers: SemanticPaper[] = data.data || [];

      // 過去N日以内に絞り込み
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - daysBack);

      for (const paper of papers) {
        if (!paper.abstract || !paper.title) continue;
        if (paper.publicationDate) {
          const pubDate = new Date(paper.publicationDate);
          if (pubDate < cutoff) continue;
        }
        results.push(paper);
      }
    } catch {
      // クエリ失敗は無視
    }
  }

  return results;
}

// ─── Perplexity API（記事収集専用） ─────────────────────────────────────────

interface PerplexityArticle {
  title: string;
  content: string;
  url: string;
  source: string;
}

async function fetchPerplexityArticles(
  apiKey: string,
): Promise<PerplexityArticle[]> {
  if (!apiKey) return [];
  const results: PerplexityArticle[] = [];

  // コスト削減: 1クエリのみ実行（最も包括的なクエリ）
  const query = PERPLEXITY_QUERIES[0];

  try {
    const resp = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar',  // 軽量モデルでコスト削減
        messages: [
          {
            role: 'system',
            content: 'You are a research assistant. Return a JSON array of recent articles. Each item: {title, summary, url, source, language}. Max 5 items. Focus on last 30 days only.',
          },
          {
            role: 'user',
            content: `Find the 5 most recent and important articles/news about: ${query}. Return only JSON array, no markdown.`,
          },
        ],
        max_tokens: 1500,
        return_citations: true,
        search_recency_filter: 'month',
      }),
    });

    if (!resp.ok) return results;
    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content || '';
    const citations: string[] = data.citations || [];

    // JSONを抽出してパース
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      try {
        const articles = JSON.parse(jsonMatch[0]);
        for (let i = 0; i < Math.min(articles.length, 5); i++) {
          const a = articles[i];
          results.push({
            title: a.title || '',
            content: a.summary || '',
            url: a.url || citations[i] || '',
            source: a.source || 'Web',
          });
        }
      } catch {
        // パース失敗: citationsから簡易生成
        for (const url of citations.slice(0, 3)) {
          results.push({
            title: 'STEAM/EdTech Article',
            content: content.slice(0, 300),
            url,
            source: new URL(url).hostname,
          });
        }
      }
    }
  } catch {
    // Perplexity失敗は無視（arXiv/SemanticScholarで補完）
  }

  return results;
}

// ─── Gemini 翻訳・要約・タグ生成 ─────────────────────────────────────────────

interface GeminiProcessResult {
  japaneseTitle: string;
  japaneseSummary: string;
  tags: string[];
  originalLanguage: string;
  credibility: CredibilityLevel;
  tokenCount: number;
}

async function processWithGemini(
  apiKey: string,
  title: string,
  content: string,
  type: ItemType,
  source: string,
): Promise<GeminiProcessResult> {
  const prompt = `あなたはSTEAM教育・EdTech分野の研究者アシスタントです。
以下の${type === 'paper' ? '論文' : '記事'}を処理してください。

タイトル: ${title}
ソース: ${source}
内容: ${content.slice(0, 1500)}

以下のJSONを返してください（他のテキスト不要）:
{
  "japaneseTitle": "日本語タイトル（自然な翻訳、原文が日本語なら原文のまま）",
  "japaneseSummary": "日本語要約（300〜400字。研究者・大学教員が読んで価値を判断できる内容。背景・手法・結果・意義を含む）",
  "tags": ["タグ1", "タグ2", "タグ3", "タグ4", "タグ5"],
  "originalLanguage": "言語コード（en/ja/zh/de/fr/ko等）",
  "credibility": 信頼度スコア（1〜5の整数。査読論文=5、政府機関=4、主要メディア=3、ブログ=2、不明=1）
}

タグは日本語で。例: STEAM教育, 生成AI, K-12, 教育政策, プログラミング教育, 認知科学`;

  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 600,
          },
        }),
      }
    );

    if (!resp.ok) throw new Error(`Gemini API error: ${resp.status}`);
    const data = await resp.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const tokenCount = data.usageMetadata?.totalTokenCount || 0;

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('JSON not found in response');

    const result = JSON.parse(jsonMatch[0]);
    return {
      japaneseTitle: result.japaneseTitle || title,
      japaneseSummary: result.japaneseSummary || content.slice(0, 300),
      tags: Array.isArray(result.tags) ? result.tags.slice(0, 6) : ['STEAM教育'],
      originalLanguage: result.originalLanguage || 'en',
      credibility: (result.credibility >= 1 && result.credibility <= 5)
        ? result.credibility as CredibilityLevel
        : 3,
      tokenCount,
    };
  } catch {
    // Gemini失敗時のフォールバック
    return {
      japaneseTitle: title,
      japaneseSummary: content.slice(0, 300),
      tags: ['STEAM教育', 'EdTech'],
      originalLanguage: 'en',
      credibility: 3,
      tokenCount: 0,
    };
  }
}

// ─── Obsidian Vault 書き込み ──────────────────────────────────────────────────

function credibilityStars(level: CredibilityLevel): string {
  return '★'.repeat(level) + '☆'.repeat(5 - level);
}

function generateNoteContent(item: BriefingItem): string {
  const typeLabel = item.type === 'paper' ? '論文' : item.type === 'policy' ? '政策文書' : '記事';
  const authorsStr = item.authors?.join(', ') || '';

  return `---
title: "${item.title}"
original_title: "${item.originalTitle}"
type: ${item.type}
source: ${item.source}
url: ${item.url}${item.doi ? `\ndoi: ${item.doi}` : ''}${authorsStr ? `\nauthors: [${authorsStr}]` : ''}
published: ${item.publishedAt.split('T')[0]}
collected: ${item.collectedAt.split('T')[0]}
language: ${item.originalLanguage}
tags: [${item.tags.map(t => `"${t}"`).join(', ')}]
credibility: ${credibilityStars(item.credibility)}${item.citationCount !== undefined ? `\ncitation_count: ${item.citationCount}` : ''}
---

# ${item.title}

> **原題:** ${item.originalTitle}
> **ソース:** ${item.source}${item.doi ? ` | **DOI:** [${item.doi}](https://doi.org/${item.doi})` : ''}
> **信頼度:** ${credibilityStars(item.credibility)} (${item.credibility}/5)${item.citationCount !== undefined ? ` | **引用数:** ${item.citationCount}` : ''}

## 要約

${item.japaneseSummary || item.summary}

## 原文リンク

[${item.source} で読む](${item.url})

## メモ

<!-- ここに議論・考察を記録 -->

## SNS下書き

<!-- X用・Threads用・note用の下書きがここに追記されます -->

---
*収集日: ${new Date(item.collectedAt).toLocaleDateString('ja-JP')} | Shelly v4.0*
`;
}

async function writeToVault(
  item: BriefingItem,
  vaultPath: string,
): Promise<string | null> {
  try {
    const date = new Date(item.publishedAt);
    const dateStr = date.toISOString().split('T')[0];
    const typeDir = item.type === 'paper' ? '02_Papers' : item.type === 'policy' ? '03_Policy' : '01_Articles';

    // ファイル名: 日付_日本語タイトル（安全な文字のみ）
    const safeTitle = item.title
      .replace(/[/\\:*?"<>|]/g, '')
      .replace(/\s+/g, '_')
      .slice(0, 40);
    const fileName = `${dateStr}_${safeTitle}.md`;

    // Vault内のパス
    const dirPath = `${vaultPath}/${typeDir}`;
    const filePath = `${dirPath}/${fileName}`;

    // ディレクトリ作成
    const dirInfo = await FileSystem.getInfoAsync(dirPath);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(dirPath, { intermediates: true });
    }

    // ファイル書き込み
    const content = generateNoteContent(item);
    await FileSystem.writeAsStringAsync(filePath, content, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    return `${typeDir}/${fileName}`;
  } catch {
    return null;
  }
}

async function writeDailyBriefing(
  items: BriefingItem[],
  vaultPath: string,
): Promise<void> {
  try {
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];
    const monthDir = `${vaultPath}/00_Daily-Briefing/${dateStr.slice(0, 7)}`;

    const dirInfo = await FileSystem.getInfoAsync(monthDir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(monthDir, { intermediates: true });
    }

    const paperItems = items.filter(i => i.type === 'paper');
    const articleItems = items.filter(i => i.type === 'article' || i.type === 'policy');

    const content = `---
date: ${dateStr}
collected: ${today.toISOString()}
total: ${items.length}
tags: ["Daily Briefing", "STEAM教育", "EdTech"]
---

# 📚 Daily Briefing — ${today.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })}

> 収集件数: **${items.length}件**（論文 ${paperItems.length}件 / 記事・政策 ${articleItems.length}件）

---

## 🔬 論文・研究

${paperItems.map((item, i) => `### ${i + 1}. [[${item.vaultPath?.replace(/^02_Papers\//, '').replace(/\.md$/, '') || item.title}|${item.title}]]

- **ソース:** ${item.source}${item.doi ? ` | DOI: ${item.doi}` : ''}
- **信頼度:** ${credibilityStars(item.credibility)}${item.citationCount !== undefined ? ` | 引用数: ${item.citationCount}` : ''}
- **タグ:** ${item.tags.slice(0, 4).join(', ')}

> ${item.summary.slice(0, 150)}...

`).join('')}
---

## 📰 記事・政策文書

${articleItems.map((item, i) => `### ${i + 1}. [[${item.vaultPath?.replace(/^01_Articles\/|^03_Policy\//, '').replace(/\.md$/, '') || item.title}|${item.title}]]

- **ソース:** ${item.source}
- **信頼度:** ${credibilityStars(item.credibility)}
- **タグ:** ${item.tags.slice(0, 4).join(', ')}

> ${item.summary.slice(0, 150)}...

`).join('')}
---

*Shelly v4.0 により自動生成 | ${today.toLocaleString('ja-JP')}*
`;

    await FileSystem.writeAsStringAsync(`${monthDir}/${dateStr}.md`, content, {
      encoding: FileSystem.EncodingType.UTF8,
    });
  } catch {
    // Daily Briefing書き込み失敗は無視
  }
}

// ─── メイン収集関数 ───────────────────────────────────────────────────────────

export async function collectBriefing(config: CollectorConfig): Promise<CollectionResult> {
  const maxItems = config.maxItems ?? DEFAULT_MAX_ITEMS;
  const daysBack = config.daysBack ?? DEFAULT_DAYS_BACK;
  const errors: string[] = [];
  const rawItems: BriefingItem[] = [];
  let totalFetched = 0;
  let duplicatesSkipped = 0;
  let totalGeminiTokens = 0;
  let perplexityRequests = 0;

  // 重複排除インデックスを読み込み
  const dedupIndex = await loadDedupIndex();

  // ── 1. arXiv 論文収集 ────────────────────────────────────────────────────
  try {
    const arxivPapers = await fetchArxivPapers(daysBack);
    totalFetched += arxivPapers.length;

    for (const paper of arxivPapers) {
      const id = generateId(paper.url, paper.doi);
      if (dedupIndex.has(id)) { duplicatesSkipped++; continue; }

      rawItems.push({
        id,
        type: 'paper',
        title: paper.title,
        originalTitle: paper.title,
        summary: paper.summary.slice(0, 400),
        originalLanguage: 'en',
        source: 'arXiv',
        url: paper.url,
        doi: paper.doi,
        authors: paper.authors.slice(0, 5),
        publishedAt: paper.published || new Date().toISOString(),
        collectedAt: new Date().toISOString(),
        tags: [],
        credibility: 4,
      });
    }
  } catch (e) {
    errors.push(`arXiv: ${e}`);
  }

  // ── 2. Semantic Scholar 論文収集 ─────────────────────────────────────────
  try {
    const ssPapers = await fetchSemanticScholarPapers(daysBack);
    totalFetched += ssPapers.length;

    for (const paper of ssPapers) {
      const doi = paper.externalIds?.DOI;
      const id = generateId(paper.url, doi);
      if (dedupIndex.has(id)) { duplicatesSkipped++; continue; }

      rawItems.push({
        id,
        type: 'paper',
        title: paper.title,
        originalTitle: paper.title,
        summary: paper.abstract?.slice(0, 400) || '',
        originalLanguage: 'en',
        source: 'Semantic Scholar',
        url: paper.url,
        doi,
        authors: paper.authors?.slice(0, 5).map(a => a.name) || [],
        publishedAt: paper.publicationDate || `${paper.year}-01-01`,
        collectedAt: new Date().toISOString(),
        tags: [],
        credibility: 5,
        citationCount: paper.citationCount,
      });
    }
  } catch (e) {
    errors.push(`SemanticScholar: ${e}`);
  }

  // ── 3. Perplexity 記事収集（APIキーがある場合のみ） ──────────────────────
  if (config.perplexityApiKey) {
    try {
      const articles = await fetchPerplexityArticles(config.perplexityApiKey);
      totalFetched += articles.length;
      perplexityRequests = 1;

      for (const article of articles) {
        if (!article.url) continue;
        const id = generateId(article.url);
        if (dedupIndex.has(id)) { duplicatesSkipped++; continue; }

        rawItems.push({
          id,
          type: 'article',
          title: article.title,
          originalTitle: article.title,
          summary: article.content.slice(0, 400),
          originalLanguage: 'en',
          source: article.source,
          url: article.url,
          publishedAt: new Date().toISOString(),
          collectedAt: new Date().toISOString(),
          tags: [],
          credibility: 3,
        });
      }
    } catch (e) {
      errors.push(`Perplexity: ${e}`);
    }
  }

  // ── 4. 上位maxItems件を選択（信頼度・新鮮度でソート） ───────────────────
  const sorted = rawItems
    .sort((a, b) => {
      // 信頼度優先、同じなら新しい順
      if (b.credibility !== a.credibility) return b.credibility - a.credibility;
      return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    })
    .slice(0, maxItems);

  // ── 5. Gemini で翻訳・要約・タグ生成 ────────────────────────────────────
  const processedItems: BriefingItem[] = [];

  for (const item of sorted) {
    try {
      const geminiResult = await processWithGemini(
        config.geminiApiKey,
        item.originalTitle,
        item.summary,
        item.type,
        item.source,
      );
      totalGeminiTokens += geminiResult.tokenCount;

      processedItems.push({
        ...item,
        title: geminiResult.japaneseTitle,
        summary: geminiResult.japaneseSummary,
        japaneseSummary: geminiResult.japaneseSummary,
        tags: geminiResult.tags,
        originalLanguage: geminiResult.originalLanguage,
        credibility: geminiResult.credibility,
      });

      // API制限対策: 500ms待機
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (e) {
      errors.push(`Gemini processing: ${e}`);
      processedItems.push(item);
    }
  }

  // ── 6. Vault に書き込み ──────────────────────────────────────────────────
  const finalItems: BriefingItem[] = [];
  const newIds: string[] = [];

  for (const item of processedItems) {
    const vaultFilePath = await writeToVault(item, config.vaultPath);
    const finalItem: BriefingItem = {
      ...item,
      vaultPath: vaultFilePath || undefined,
    };
    finalItems.push(finalItem);
    newIds.push(item.id);
  }

  // Daily Briefing サマリーを書き込み
  if (finalItems.length > 0) {
    await writeDailyBriefing(finalItems, config.vaultPath);
  }

  // 重複排除インデックスを更新
  await saveDedupIndex(dedupIndex, newIds);

  return {
    success: finalItems.length > 0,
    items: finalItems,
    errors,
    totalFetched,
    duplicatesSkipped,
    tokenUsage: {
      geminiTokens: totalGeminiTokens,
      perplexityRequests,
    },
  };
}

// ─── 今日のブリーフィングをVaultから読み込み ─────────────────────────────────

export async function loadTodayBriefing(vaultPath: string): Promise<BriefingItem[]> {
  try {
    const today = new Date().toISOString().split('T')[0];
    const monthDir = `${vaultPath}/00_Daily-Briefing/${today.slice(0, 7)}`;
    const filePath = `${monthDir}/${today}.md`;

    const info = await FileSystem.getInfoAsync(filePath);
    if (!info.exists) return [];

    // AsyncStorageからキャッシュを読む
    const cacheKey = `briefing_cache_${today}`;
    const cached = await AsyncStorage.getItem(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    return [];
  } catch {
    return [];
  }
}

// ─── キャッシュ保存 ───────────────────────────────────────────────────────────

export async function saveBriefingCache(items: BriefingItem[]): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  const cacheKey = `briefing_cache_${today}`;
  await AsyncStorage.setItem(cacheKey, JSON.stringify(items));
}

export async function loadBriefingCache(date?: string): Promise<BriefingItem[]> {
  const targetDate = date || new Date().toISOString().split('T')[0];
  const cacheKey = `briefing_cache_${targetDate}`;
  try {
    const cached = await AsyncStorage.getItem(cacheKey);
    return cached ? JSON.parse(cached) : [];
  } catch {
    return [];
  }
}
