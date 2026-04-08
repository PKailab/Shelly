// lib/usage-parser.ts

// ── Types ────────────────────────────────────────────────────────────────────

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalCost: number;
}

export interface DailyUsage extends TokenUsage {
  date: string; // YYYY-MM-DD
}

export interface BlockUsage extends TokenUsage {
  blockStart: Date;
  blockEnd: Date;
  minutesRemaining: number;
}

export interface UsageData {
  daily: DailyUsage[];
  todayTotal: TokenUsage;
  monthTotal: TokenUsage;
  currentBlock: BlockUsage | null;
  lastUpdated: number;
}

// ── Pricing (USD per 1M tokens) ──────────────────────────────────────────────

const MODEL_PRICING: Record<string, { input: number; output: number; cacheWrite: number; cacheRead: number }> = {
  'claude-opus-4-6':            { input: 15,   output: 75,  cacheWrite: 18.75, cacheRead: 1.50 },
  'claude-sonnet-4-6':          { input: 3,    output: 15,  cacheWrite: 3.75,  cacheRead: 0.30 },
  'claude-haiku-4-5-20251001':  { input: 0.80, output: 4,   cacheWrite: 1.00,  cacheRead: 0.08 },
};
const DEFAULT_PRICING = MODEL_PRICING['claude-sonnet-4-6'];

function getPricing(model: string) {
  if (MODEL_PRICING[model]) return MODEL_PRICING[model];
  for (const key of Object.keys(MODEL_PRICING)) {
    if (model.startsWith(key)) return MODEL_PRICING[key];
  }
  return DEFAULT_PRICING;
}

function calcCost(model: string, input: number, output: number, cacheWrite: number, cacheRead: number): number {
  const p = getPricing(model);
  return (input * p.input + output * p.output + cacheWrite * p.cacheWrite + cacheRead * p.cacheRead) / 1_000_000;
}

// ── Zero usage helper ────────────────────────────────────────────────────────

function zeroUsage(): TokenUsage {
  return { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, totalCost: 0 };
}

// ── JSONL parsing ────────────────────────────────────────────────────────────

interface ParsedEntry {
  timestamp: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  requestId: string;
}

function parseJSONLContent(content: string): ParsedEntry[] {
  const entries: ParsedEntry[] = [];
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);
      if (obj.type !== 'assistant' || !obj.message?.usage) continue;
      const u = obj.message.usage;
      entries.push({
        timestamp: obj.timestamp,
        model: obj.message.model || 'unknown',
        inputTokens: u.input_tokens || 0,
        outputTokens: u.output_tokens || 0,
        cacheCreationTokens: u.cache_creation_input_tokens || 0,
        cacheReadTokens: u.cache_read_input_tokens || 0,
        requestId: obj.requestId || `${obj.timestamp}-${Math.random()}`,
      });
    } catch { /* skip malformed lines */ }
  }
  return entries;
}

// ── Aggregation ──────────────────────────────────────────────────────────────

function aggregateDaily(entries: ParsedEntry[]): DailyUsage[] {
  const byDate = new Map<string, TokenUsage>();

  for (const e of entries) {
    const date = e.timestamp.slice(0, 10);
    if (!byDate.has(date)) byDate.set(date, zeroUsage());
    const d = byDate.get(date)!;
    d.inputTokens += e.inputTokens;
    d.outputTokens += e.outputTokens;
    d.cacheCreationTokens += e.cacheCreationTokens;
    d.cacheReadTokens += e.cacheReadTokens;
    d.totalCost += calcCost(e.model, e.inputTokens, e.outputTokens, e.cacheCreationTokens, e.cacheReadTokens);
  }

  return Array.from(byDate.entries())
    .map(([date, usage]) => ({ date, ...usage }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function aggregateBlock(entries: ParsedEntry[], now: Date): BlockUsage | null {
  const msIn5h = 5 * 60 * 60 * 1000;
  const dayStart = new Date(now);
  dayStart.setUTCHours(0, 0, 0, 0);
  const msSinceDayStart = now.getTime() - dayStart.getTime();
  const blockIndex = Math.floor(msSinceDayStart / msIn5h);
  const blockStart = new Date(dayStart.getTime() + blockIndex * msIn5h);
  const blockEnd = new Date(blockStart.getTime() + msIn5h);

  const blockEntries = entries.filter(e => {
    const t = new Date(e.timestamp).getTime();
    return t >= blockStart.getTime() && t < now.getTime();
  });

  if (blockEntries.length === 0) return null;

  const usage = zeroUsage();
  for (const e of blockEntries) {
    usage.inputTokens += e.inputTokens;
    usage.outputTokens += e.outputTokens;
    usage.cacheCreationTokens += e.cacheCreationTokens;
    usage.cacheReadTokens += e.cacheReadTokens;
    usage.totalCost += calcCost(e.model, e.inputTokens, e.outputTokens, e.cacheCreationTokens, e.cacheReadTokens);
  }

  const minutesRemaining = Math.max(0, Math.round((blockEnd.getTime() - now.getTime()) / 60000));

  return { ...usage, blockStart, blockEnd, minutesRemaining };
}

// ── Main entry point ─────────────────────────────────────────────────────────

export type ReadFileFn = (path: string) => Promise<string | null>;
export type ListFilesFn = (dir: string) => Promise<{ name: string; mtime?: number }[]>;

export async function parseUsage(
  readFile: ReadFileFn,
  listFiles: ListFilesFn,
): Promise<UsageData> {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const sinceDate = monthStart < sevenDaysAgo ? monthStart : sevenDaysAgo;

  const { getHomePath } = require('@/lib/home-path');
  const claudeProjectsDir = `${getHomePath()}/.claude/projects`;
  let projectDirs: { name: string }[];
  try {
    projectDirs = await listFiles(claudeProjectsDir);
  } catch {
    return { daily: [], todayTotal: zeroUsage(), monthTotal: zeroUsage(), currentBlock: null, lastUpdated: Date.now() };
  }

  const allEntries: ParsedEntry[] = [];
  const seenRequestIds = new Set<string>();

  for (const dir of projectDirs) {
    const dirPath = `${claudeProjectsDir}/${dir.name}`;
    let files: { name: string; mtime?: number }[];
    try {
      files = await listFiles(dirPath);
    } catch { continue; }

    const jsonlFiles = files.filter(f => f.name.endsWith('.jsonl'));
    const recentFiles = jsonlFiles.filter(f =>
      !f.mtime || f.mtime * 1000 > sinceDate.getTime()
    );

    for (const file of recentFiles) {
      try {
        const content = await readFile(`${dirPath}/${file.name}`);
        if (!content) continue;
        const entries = parseJSONLContent(content);
        for (const e of entries) {
          if (new Date(e.timestamp) < sinceDate) continue;
          if (seenRequestIds.has(e.requestId)) continue;
          seenRequestIds.add(e.requestId);
          allEntries.push(e);
        }
      } catch { continue; }
    }
  }

  const daily = aggregateDaily(allEntries);
  const todayStr = now.toISOString().slice(0, 10);
  const todayDaily = daily.find(d => d.date === todayStr);
  const todayTotal: TokenUsage = todayDaily
    ? { inputTokens: todayDaily.inputTokens, outputTokens: todayDaily.outputTokens, cacheCreationTokens: todayDaily.cacheCreationTokens, cacheReadTokens: todayDaily.cacheReadTokens, totalCost: todayDaily.totalCost }
    : zeroUsage();

  const monthStr = now.toISOString().slice(0, 7);
  const monthEntries = daily.filter(d => d.date.startsWith(monthStr));
  const monthTotal = monthEntries.reduce((acc, d) => ({
    inputTokens: acc.inputTokens + d.inputTokens,
    outputTokens: acc.outputTokens + d.outputTokens,
    cacheCreationTokens: acc.cacheCreationTokens + d.cacheCreationTokens,
    cacheReadTokens: acc.cacheReadTokens + d.cacheReadTokens,
    totalCost: acc.totalCost + d.totalCost,
  }), zeroUsage());

  const last7: DailyUsage[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const dateStr = d.toISOString().slice(0, 10);
    const existing = daily.find(x => x.date === dateStr);
    last7.push(existing || { date: dateStr, ...zeroUsage() });
  }

  const currentBlock = aggregateBlock(allEntries, now);

  return { daily: last7, todayTotal, monthTotal, currentBlock, lastUpdated: Date.now() };
}
