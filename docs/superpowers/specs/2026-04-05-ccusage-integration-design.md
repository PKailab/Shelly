# ccusage Integration Design — Shelly

**Date:** 2026-04-05
**Status:** Reviewed

## Overview

Visualize Claude Code token usage and costs in Shelly's StatusIndicator header bar. An expandable panel shows daily/monthly/5H-block summaries with a 7-day bar chart. Usage data is parsed directly from Claude Code's JSONL log files via the bridge's `readFile` handler — no dependency on the ccusage CLI at runtime.

## Why Not Shell Out to ccusage CLI?

Testing revealed that `ccusage daily --json` times out on this device (829 JSONL files, >30s). The ccusage CLI is designed for desktop — scanning hundreds of files is too slow on mobile. Instead, we read JSONL files directly via the bridge and parse them in TypeScript. This also avoids the bridge's single-process constraint (can't run ccusage while a terminal session is active).

ccusage is still credited as the inspiration and ecosystem — this integration demonstrates ccusage's value proposition on mobile.

## Goals

1. Real-time cost awareness while coding on mobile
2. 5-hour billing block tracking (Anthropic's rate limit window)
3. Visual daily usage chart (screenshot-worthy for ccusage author PR)
4. Optional notification alerts for usage thresholds
5. Zero background battery drain

## Non-Goals

- Running ccusage CLI (too slow on mobile, bridge conflict)
- Gemini CLI usage tracking (no JSONL logs)
- Complex historical analysis (keep it simple: 7 days + current month)

## Architecture

```
┌─────────────────────────────────────────────────┐
│                   Shelly App                     │
│                                                  │
│  StatusIndicator ─── UsageIndicator ($2.30)      │
│       │ tap                                      │
│       ▼                                          │
│  UsagePanel (expandable)                         │
│  ┌────────┐ ┌──────────┐ ┌─────────────┐        │
│  │ TODAY  │ │  MONTH   │ │  5H BLOCK   │        │
│  │ $2.30  │ │  $47.80  │ │    62%      │        │
│  │ 89K tk │ │  1.8M tk │ │  1h42m left │        │
│  └────────┘ └──────────┘ └─────────────┘        │
│  ┌──────────────────────────────────────┐        │
│  │ ▁▃▅▂▇▁▄  (7-day bar chart, SVG)     │        │
│  └──────────────────────────────────────┘        │
│                                                  │
│  usage-store.ts ◄── usage-parser.ts              │
│                          │                       │
│                    bridge readFile                │
│                          │                       │
└──────────────────────────┼───────────────────────┘
                           │
              ~/.claude/projects/*/JSONL files
```

## JSONL File Format (Verified)

**Location:** `~/.claude/projects/<project-dir>/<session-id>.jsonl`

Each line is a JSON object. We only care about `type: "assistant"` entries with `message.usage`:

```typescript
interface JournalEntry {
  type: 'assistant' | 'user' | 'queue-operation' | string;
  timestamp: string; // ISO 8601
  sessionId: string;
  message?: {
    model: string; // e.g. "claude-opus-4-6", "claude-sonnet-4-6"
    usage?: {
      input_tokens: number;
      output_tokens: number;
      cache_creation_input_tokens: number;
      cache_read_input_tokens: number;
    };
  };
  requestId?: string; // for deduplication
}
```

## Cost Calculation

Model pricing (hardcoded, updated periodically):

| Model | Input $/1M | Output $/1M | Cache Write $/1M | Cache Read $/1M |
|-------|-----------|------------|-------------------|-----------------|
| claude-opus-4-6 | $15.00 | $75.00 | $18.75 | $1.50 |
| claude-sonnet-4-6 | $3.00 | $15.00 | $3.75 | $0.30 |
| claude-haiku-4-5 | $0.80 | $4.00 | $1.00 | $0.08 |

Fallback: if model unknown, use sonnet pricing.

## Components

### 1. `lib/usage-parser.ts`

Pure TypeScript JSONL parser. No network, no CLI dependency.

```typescript
interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalCost: number; // USD
}

interface DailyUsage extends TokenUsage {
  date: string; // YYYY-MM-DD
}

interface BlockUsage extends TokenUsage {
  blockStart: Date;
  blockEnd: Date;
  percentUsed: number; // 0-100 (estimated)
  minutesRemaining: number;
}

interface UsageData {
  daily: DailyUsage[]; // past 7 days
  todayTotal: TokenUsage;
  monthTotal: TokenUsage;
  currentBlock: BlockUsage | null;
  lastUpdated: number;
}

// Reads JSONL files via bridge, filters by date range, aggregates
async function parseUsage(
  readFile: (path: string) => Promise<string>,
  listFiles: (dir: string) => Promise<string[]>,
  since: Date
): Promise<UsageData>
```

**Optimization strategy:**
- List JSONL files in `~/.claude/projects/`
- Filter by file mtime (skip files older than 30 days)
- Read only recent files (bridge readFile)
- Parse line-by-line, deduplicate by `requestId`
- Aggregate by date for daily, by 5H window for blocks

### 2. `store/usage-store.ts`

Zustand store with AsyncStorage persistence (for cold-start display).

```typescript
interface UsageStore {
  // Data
  usageData: UsageData | null;
  isLoading: boolean;
  error: string | null;
  isExpanded: boolean;

  // Alert settings (persisted)
  alertEnabled: boolean;
  alertBlockThreshold: number;   // 0-100, default 80
  alertDailyCostLimit: number;   // USD, default 10
  lastAlertedBlock: string | null; // prevent duplicate alerts

  // Actions
  refresh: () => Promise<void>;
  toggleExpanded: () => void;
  setAlertSettings: (s: Partial<AlertSettings>) => void;
}
```

### 3. `components/UsageIndicator.tsx`

Inline badge in StatusIndicator.

- Shows: `$2.30` in accent color
- Tap: toggles panel expand
- States: loading (`...`), no data (`$0`), error (`--`)
- Color: green (<$5), yellow ($5-15), red (>$15)

### 4. `components/UsagePanel.tsx`

Expandable panel with `LayoutAnimation` (no extra deps).

**3 cards:**

| Card | Label | Primary | Secondary | Border Color |
|------|-------|---------|-----------|-------------|
| TODAY | TODAY | `$2.30` | `89K tokens` | `#00D4AA` |
| MONTH | THIS MONTH | `$47.80` | `1.8M tokens` | `#A78BFA` |
| BLOCK | 5H BLOCK | `62%` | `1h 42m left` | `#FFD700` |

**Below cards:** UsageBarChart (7 days)

**Refresh:** Refresh icon button in panel header (not pull-to-refresh, per review feedback).

### 5. `components/UsageBarChart.tsx`

`react-native-svg` bar chart. 7 bars, today highlighted in gold.

- Bar height proportional to daily totalCost
- Labels: Mon/Tue/... (localized via `Intl.DateTimeFormat`)
- Footer: `Input: 245K  Output: 89K  Cache: 156K`

### 6. Settings — Usage Alerts Section

In `settings.tsx`, new section:

- Toggle: `Usage Alerts` (default OFF)
- When ON:
  - Slider: `5H Block Alert` — threshold % (default 80)
  - Text input: `Daily Cost Limit` — $ amount (default 10)

### 5H Block Calculation

Anthropic's rate limiting uses 5-hour rolling windows. Calculation:

```typescript
function getCurrentBlock(entries: JournalEntry[]): BlockUsage {
  const now = new Date();
  // Block starts at most recent 5h boundary
  const blockStart = new Date(now.getTime() - (now.getTime() % (5 * 60 * 60 * 1000)));
  const blockEnd = new Date(blockStart.getTime() + 5 * 60 * 60 * 1000);

  // Sum tokens in [blockStart, blockEnd)
  const blockEntries = entries.filter(e =>
    new Date(e.timestamp) >= blockStart && new Date(e.timestamp) < now
  );

  const usage = aggregateTokens(blockEntries);
  const elapsed = now.getTime() - blockStart.getTime();
  const total = 5 * 60 * 60 * 1000;
  const minutesRemaining = Math.round((total - elapsed) / 60000);

  // Percentage is estimated based on typical limits
  // (Anthropic doesn't publish exact token limits per block)
  // We show raw token count + time remaining instead of a true %
  return { ...usage, blockStart, blockEnd, percentUsed: 0, minutesRemaining };
}
```

Note: Since Anthropic doesn't publish exact per-block token limits, the "%" is cosmetic. We show token count + time remaining as the primary metric.

## Update Timing

| Trigger | Action |
|---------|--------|
| App foreground resume | Refresh if >60s since last |
| Tab switch | Refresh if >60s since last |
| Panel expand | Refresh if >60s since last |
| Refresh button tap | Force refresh (ignore TTL) |

No background polling. No timers. Zero battery impact.

## Alert Flow

1. During each refresh, check thresholds if `alertEnabled`
2. If daily cost > `alertDailyCostLimit`: notify (once per day)
3. If 5H block time < 1h remaining and high usage: notify (once per block)
4. Uses existing `expo-notifications` infrastructure

## File Structure

```
lib/
  usage-parser.ts            # JSONL reader + aggregator
store/
  usage-store.ts             # Zustand state + alert settings
components/
  UsageIndicator.tsx         # StatusIndicator inline badge
  UsagePanel.tsx             # Expandable detail panel
  UsageBarChart.tsx          # SVG bar chart
app/(tabs)/
  settings.tsx               # + Usage Alerts section
```

## Error Handling

| Scenario | Behavior |
|----------|----------|
| No JSONL files | Show `$0` in indicator |
| Bridge disconnected | Show `--`, use cached data |
| File read error | Skip file, continue with others |
| Parse error on line | Skip line, continue |
| Cold start (no cache) | Show `...` until first load |

## Design Tokens

| Element | Color |
|---------|-------|
| Today cost badge | `#00D4AA` |
| Month card border | `#A78BFA` |
| Block card border | `#FFD700` |
| Chart bars | `#00D4AA55` |
| Today's bar | `#FFD70088` |
| Cost high warning | `#FF6B6B` |

## Credits

This feature is inspired by and designed to complement [ccusage](https://github.com/ryoppippi/ccusage) by @ryoppippi. The JSONL parsing logic follows ccusage's approach of reading Claude Code's local journal files. On desktop, users can install ccusage CLI for richer analysis; Shelly provides the mobile-optimized visualization layer.
