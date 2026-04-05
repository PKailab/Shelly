# ccusage Integration Design — Shelly

**Date:** 2026-04-05
**Status:** Draft

## Overview

Integrate [ccusage](https://github.com/ryoppippi/ccusage) into Shelly to visualize Claude Code / Codex CLI token usage and costs. Usage data is displayed in the StatusIndicator header bar, with an expandable panel showing detailed metrics and charts.

## Goals

1. Real-time cost awareness while coding on mobile
2. 5-hour billing block tracking (Anthropic's rate limit window)
3. Visual daily usage chart (screenshot-worthy for ccusage author PR)
4. Optional notification alerts for usage thresholds
5. Zero background battery drain

## Non-Goals

- Building a ccusage alternative (we use ccusage CLI directly)
- Gemini CLI usage tracking (ccusage doesn't support it yet)
- Historical data beyond what ccusage provides

## Architecture

```
┌─────────────────────────────────────────────────┐
│                   Shelly App                     │
│                                                  │
│  ┌──────────────────────────────────────────┐    │
│  │ StatusIndicator                           │    │
│  │ ┌──────┐ ┌───────────┐ ┌──────────────┐  │    │
│  │ │● Brdg│ │Claude Code│ │ $2.30 today  │  │    │
│  │ └──────┘ └───────────┘ └──────┬───────┘  │    │
│  └───────────────────────────────┼──────────┘    │
│                                  │ tap            │
│  ┌───────────────────────────────▼──────────┐    │
│  │ UsagePanel (expandable)                   │    │
│  │ ┌────────┐ ┌──────────┐ ┌─────────────┐  │    │
│  │ │ TODAY  │ │  MONTH   │ │  5H BLOCK   │  │    │
│  │ │ $2.30  │ │  $47.80  │ │    62%      │  │    │
│  │ │ 89K tk │ │  1.8M tk │ │  1h42m left │  │    │
│  │ └────────┘ └──────────┘ └─────────────┘  │    │
│  │ ┌──────────────────────────────────────┐  │    │
│  │ │ ▁▃▅▂▇▁▄  (7-day bar chart)          │  │    │
│  │ └──────────────────────────────────────┘  │    │
│  └──────────────────────────────────────────┘    │
│                                                  │
│  store/usage-store.ts ◄── lib/ccusage-client.ts  │
│                               │                  │
└───────────────────────────────┼──────────────────┘
                                │ bridge exec
                    ┌───────────▼───────────┐
                    │  ccusage daily --json  │
                    │  ccusage blocks --json │
                    │  (Termux CLI)          │
                    └───────────────────────┘
```

## Components

### 1. `lib/ccusage-client.ts`

Executes ccusage CLI via Shelly's WebSocket bridge and parses JSON output.

```typescript
interface CcusageDailyEntry {
  date: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalCost: number;
}

interface CcusageBlockEntry {
  blockStart: string;
  blockEnd: string;
  inputTokens: number;
  outputTokens: number;
  totalCost: number;
}

interface UsageData {
  daily: CcusageDailyEntry[];
  dailyTotals: CcusageDailyEntry;  // sum
  monthly: CcusageDailyEntry[];
  monthlyTotals: CcusageDailyEntry;
  currentBlock: CcusageBlockEntry | null;
  lastUpdated: number;  // timestamp
}

async function fetchUsage(): Promise<UsageData>
async function isCcusageInstalled(): Promise<boolean>
```

**Execution strategy:**
- Run `ccusage daily --json --since <7 days ago> --offline` for daily data
- Run `ccusage blocks --json --offline` for 5H block data
- Parse JSON stdout, handle errors gracefully (ccusage not installed, no data, etc.)
- Cache results in Zustand store with TTL (avoid redundant calls within 60s)

### 2. `store/usage-store.ts`

Zustand store for usage state and notification settings.

```typescript
interface UsageStore {
  // Data
  usageData: UsageData | null;
  isLoading: boolean;
  error: string | null;
  isExpanded: boolean;

  // Notification settings (persisted to AsyncStorage)
  alertEnabled: boolean;
  alertBlockThreshold: number;   // 0-100, default 80
  alertDailyCostLimit: number;   // USD, default 10

  // Actions
  refresh: () => Promise<void>;
  toggleExpanded: () => void;
  updateAlertSettings: (settings: Partial<AlertSettings>) => void;
}
```

### 3. `components/UsageIndicator.tsx`

Compact display embedded in StatusIndicator. Shows today's cost.

- Renders: `$2.30 today` in accent color
- Tappable: toggles `isExpanded` in store
- Shows `--` if ccusage not installed or no data
- Shows loading spinner during first fetch
- Color coding: green (<$5), yellow ($5-15), red (>$15)

### 4. `components/UsagePanel.tsx`

Expandable panel below StatusIndicator with animated slide-down.

**Layout (3 cards + chart):**

| Card | Data | Color |
|------|------|-------|
| TODAY | Cost + total tokens | `#00D4AA` (accent) |
| THIS MONTH | Cost + total tokens | `#A78BFA` (purple) |
| 5H BLOCK | Usage % + time remaining | `#FFD700` (gold) |

Below cards: 7-day mini bar chart (UsageBarChart component).

**Interactions:**
- Pull-to-refresh to update data
- Tap a card for breakdown (input/output/cache tokens)

### 5. `components/UsageBarChart.tsx`

Pure `react-native-svg` bar chart. No external chart library.

- 7 bars for past 7 days
- Today's bar highlighted in gold (#FFD700)
- Bar height proportional to daily cost
- Day labels below (Mon, Tue, ...)
- Token breakdown below chart (Input / Output / Cache)

### 6. Settings — Usage Alerts Section

Added to `settings.tsx` under a new "Usage Alerts" section:

- Toggle: Enable usage alerts (default: OFF)
- Slider: 5H block threshold (default: 80%)
- Input: Daily cost limit (default: $10)
- Info text explaining what each alert does

## Update Timing

| Trigger | Action |
|---------|--------|
| App foreground resume | Refresh if >60s since last update |
| Tab switch | Refresh if >60s since last update |
| Panel expand | Refresh if >60s since last update |
| Panel pull-to-refresh | Force refresh (ignore TTL) |

No background polling. No timers. Zero battery impact.

## Alert Check Flow

Alerts are checked during each refresh cycle (not separately):

1. Refresh usage data
2. If `alertEnabled` and data available:
   - Check 5H block % against `alertBlockThreshold`
   - Check today's cost against `alertDailyCostLimit`
3. If threshold exceeded and not already notified this period:
   - Send local notification via `expo-notifications`
   - Mark as notified (prevent duplicate alerts until next period)

## Prerequisites

- `ccusage` must be installed in Termux: `npm i -g ccusage`
- If not installed, UsageIndicator shows "Install ccusage" hint
- Setup can be added to Shelly's onboarding or setup wizard

## Supported CLIs

| CLI | ccusage package | Status |
|-----|----------------|--------|
| Claude Code | `ccusage` | Supported |
| Codex CLI | `ccusage` (apps/codex) | Supported |
| Gemini CLI | — | Not supported by ccusage |

## File Structure

```
lib/
  ccusage-client.ts          # CLI execution + JSON parsing
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
| ccusage not installed | Show "Install ccusage" in indicator, link to setup |
| No JSONL data | Show "$0.00 today" |
| Bridge disconnected | Show "--" in indicator |
| ccusage command fails | Show last cached data, log error |
| JSON parse error | Fall back to cached data |

## Design Tokens

| Element | Color | Usage |
|---------|-------|-------|
| Today cost | `#00D4AA` | Primary accent |
| Month cost | `#A78BFA` | Purple accent |
| Block usage | `#FFD700` | Gold/warning |
| Bar chart default | `#00D4AA55` | Translucent accent |
| Bar chart today | `#FFD70088` | Translucent gold |
| Cost warning | `#FF6B6B` | Red when high |
