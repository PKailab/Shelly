# Background Agents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Autonomous background task execution framework — agents run in Termux tmux sessions, collect information or execute workflows on a schedule, and deliver results to specified directories with Android notifications.

**Architecture:** AgentManager orchestrates CRUD + execution. AgentScheduler registers AlarmManager alarms (primary) with crond fallback. AgentExecutor generates per-agent shell scripts and runs them in tmux sessions. ToolRouter selects the right CLI/LLM. Chat UI uses `@agent` commands (already a registered RouteTarget in `input-router.ts`). Agent definitions stored as JSON in `~/.shelly/agents/`.

**Tech Stack:** TypeScript (Zustand store, lib modules), Kotlin (AgentAlarmReceiver BroadcastReceiver), React Native (UI components), expo-notifications

**Constraints:**
- `/tmp/` is unavailable — use `$HOME/.shelly/tmp/`
- Kotlin compilation only runs in CI
- `@agent` RouteTarget already exists in `input-router.ts` (line 16 + line 76-78)
- v1: Chat UI only (`@agent` commands). Terminal command interception deferred to v2.
- No new paid APIs except Perplexity (user-provided key)

---

## File Structure

### New Files (TypeScript)
| File | Responsibility |
|------|---------------|
| `lib/agent-manager.ts` | Agent CRUD, orchestration, @agent command parsing |
| `lib/agent-executor.ts` | tmux session management, script generation, output capture |
| `lib/agent-scheduler.ts` | AlarmManager registration via native module, cron conversion |
| `lib/agent-tool-router.ts` | Tool selection logic, availability check |
| `lib/agent-output-writer.ts` | Template rendering, file writing to outputPath |
| `store/agent-store.ts` | Zustand store for agent state + run history |

### New Files (Components)
| File | Responsibility |
|------|---------------|
| `components/agent/AgentListPanel.tsx` | Agent list in Settings |
| `components/agent/AgentCreateFlow.tsx` | Chat-based agent creation wizard |
| `components/agent/AgentStatusBadge.tsx` | Status indicator (✅/❌/⏭️) |

### New Files (Kotlin)
| File | Responsibility |
|------|---------------|
| `modules/terminal-emulator/android/src/main/java/expo/modules/terminalemulator/AgentAlarmReceiver.kt` | BroadcastReceiver for scheduled execution |

### Modified Files
| File | Changes |
|------|---------|
| `modules/terminal-emulator/android/src/main/java/expo/modules/terminalemulator/TerminalEmulatorModule.kt` | Add `scheduleAgent` / `cancelAgent` AsyncFunctions |
| `modules/terminal-emulator/src/TerminalEmulatorModule.ts` | Add TS type declarations for `scheduleAgent` / `cancelAgent` |
| `android/app/src/main/AndroidManifest.xml` | Add `SCHEDULE_EXACT_ALARM` permission + register AgentAlarmReceiver |
| `app/(tabs)/index.tsx` | Add explicit `@agent` target handler before `aiDispatch` fallthrough (~line 700) |
| `store/settings-store.ts` | Add `perplexityApiKey` to settings (sync to .env) |
| `store/types.ts` | Add Agent and related type definitions |
| `app/(tabs)/settings.tsx` (or wherever settings screen is) | Add "Background Agents" section |

---

## Task 1: Agent Type Definitions

**Files:**
- Modify: `store/types.ts`

- [ ] **Step 1: Add Agent types to store/types.ts**

Add at the end of the file:

```typescript
// ─── Background Agents ──────────────────────────────────────────────────────

export type ToolChoice =
  | { type: 'cli'; cli: 'claude' | 'gemini' | 'codex' }
  | { type: 'local' }
  | { type: 'perplexity' }
  | { type: 'auto' };

export interface Agent {
  id: string;
  name: string;
  description: string;
  prompt: string;
  schedule: string | null;     // cron expression, null = manual only
  tool: ToolChoice;
  outputPath: string;
  outputTemplate: string | null;
  enabled: boolean;
  lastRun: number | null;
  lastResult: 'success' | 'error' | null;
  createdAt: number;
  version: number;             // schema version (1 for v1)
}

export interface AgentRunLog {
  agentId: string;
  timestamp: number;
  status: 'success' | 'error' | 'skipped';
  outputPreview: string;       // first 500 chars
  durationMs: number;
  toolUsed: string;
  errorMessage?: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add store/types.ts
git commit -m "feat(agents): add Agent and AgentRunLog type definitions"
```

---

## Task 2: Agent Store (Zustand)

**Files:**
- Create: `store/agent-store.ts`

- [ ] **Step 1: Create agent-store.ts**

```typescript
/**
 * store/agent-store.ts — Zustand store for Background Agents.
 * Loads agent definitions from ~/.shelly/agents/*.json.
 * Persists changes back to filesystem via agent-manager.
 */
import { create } from 'zustand';
import { Agent, AgentRunLog } from './types';

interface AgentState {
  agents: Agent[];
  runHistory: Record<string, AgentRunLog[]>;  // agentId → last 30 logs
  isLoaded: boolean;

  setAgents: (agents: Agent[]) => void;
  addAgent: (agent: Agent) => void;
  updateAgent: (id: string, partial: Partial<Agent>) => void;
  removeAgent: (id: string) => void;

  addRunLog: (log: AgentRunLog) => void;
  getRunHistory: (agentId: string) => AgentRunLog[];

  getAgentByName: (name: string) => Agent | undefined;
}

export const useAgentStore = create<AgentState>((set, get) => ({
  agents: [],
  runHistory: {},
  isLoaded: false,

  setAgents: (agents) => set({ agents, isLoaded: true }),

  addAgent: (agent) =>
    set((state) => ({ agents: [...state.agents, agent] })),

  updateAgent: (id, partial) =>
    set((state) => ({
      agents: state.agents.map((a) =>
        a.id === id ? { ...a, ...partial } : a
      ),
    })),

  removeAgent: (id) =>
    set((state) => ({
      agents: state.agents.filter((a) => a.id !== id),
    })),

  addRunLog: (log) =>
    set((state) => {
      const history = { ...state.runHistory };
      const logs = [...(history[log.agentId] || []), log];
      history[log.agentId] = logs.slice(-30);
      return { runHistory: history };
    }),

  getRunHistory: (agentId) => get().runHistory[agentId] || [],

  getAgentByName: (name) =>
    get().agents.find(
      (a) => a.name.toLowerCase() === name.toLowerCase()
    ),
}));
```

- [ ] **Step 2: Commit**

```bash
git add store/agent-store.ts
git commit -m "feat(agents): add Zustand agent-store with CRUD and run history"
```

---

## Task 3: Agent Tool Router

**Files:**
- Create: `lib/agent-tool-router.ts`

- [ ] **Step 1: Create agent-tool-router.ts**

```typescript
/**
 * lib/agent-tool-router.ts — Selects the appropriate CLI/LLM for agent tasks.
 * When tool.type === 'auto', analyzes the prompt keywords and suggests.
 */
import { ToolChoice } from '@/store/types';

export interface ToolSuggestion {
  tool: ToolChoice;
  label: string;
  reason: string;
}

const ACADEMIC_KEYWORDS = [
  'paper', 'research', 'study', 'evidence', 'journal', 'academic',
  '論文', '研究', '学術',
];

const CODE_KEYWORDS = [
  'pr', 'issue', 'commit', 'repo', 'code review', 'github',
  'pull request', 'merge',
];

const TRANSFORM_KEYWORDS = [
  'summarize', 'format', 'translate', 'rewrite',
  '要約', '整形', '翻訳', '書き直',
];

export function suggestTool(prompt: string): ToolSuggestion {
  const lower = prompt.toLowerCase();

  // Priority 1: Academic
  if (ACADEMIC_KEYWORDS.some((kw) => lower.includes(kw))) {
    return {
      tool: { type: 'perplexity' },
      label: 'Perplexity API',
      reason: 'Academic/research content — Perplexity provides search-backed results with citations',
    };
  }

  // Priority 2: Code/GitHub
  if (CODE_KEYWORDS.some((kw) => lower.includes(kw))) {
    return {
      tool: { type: 'cli', cli: 'claude' },
      label: 'Claude Code CLI',
      reason: 'Code/GitHub tasks — Claude Code has native GitHub integration',
    };
  }

  // Priority 3: Text transformation
  if (TRANSFORM_KEYWORDS.some((kw) => lower.includes(kw))) {
    return {
      tool: { type: 'local' },
      label: 'Local LLM',
      reason: 'Text processing — local LLM is free and fast for transformation tasks',
    };
  }

  // Default: Gemini (free, general-purpose)
  return {
    tool: { type: 'cli', cli: 'gemini' },
    label: 'Gemini CLI',
    reason: 'General-purpose — Gemini CLI is free and handles most tasks well',
  };
}

/**
 * Check if a CLI tool is available in the system PATH.
 * Runs via Termux bridge.
 */
export async function checkToolAvailability(
  runCommand: (cmd: string) => Promise<string>
): Promise<Record<string, boolean>> {
  const tools = ['claude', 'gemini', 'codex'];
  const results: Record<string, boolean> = {};

  for (const tool of tools) {
    try {
      const output = await runCommand(`which ${tool} 2>/dev/null && echo "found" || echo "notfound"`);
      results[tool] = output.trim().includes('found');
    } catch {
      results[tool] = false;
    }
  }

  // Check local LLM
  try {
    const output = await runCommand(
      'curl -s --max-time 2 http://127.0.0.1:8080/health 2>/dev/null || echo "notfound"'
    );
    results['local'] = !output.includes('notfound');
  } catch {
    results['local'] = false;
  }

  return results;
}

export function toolChoiceToLabel(tool: ToolChoice): string {
  switch (tool.type) {
    case 'cli':
      return `${tool.cli.charAt(0).toUpperCase()}${tool.cli.slice(1)} CLI`;
    case 'local':
      return 'Local LLM';
    case 'perplexity':
      return 'Perplexity API';
    case 'auto':
      return 'Auto';
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/agent-tool-router.ts
git commit -m "feat(agents): add tool router with keyword-based auto-selection"
```

---

## Task 4: Agent Output Writer

**Files:**
- Create: `lib/agent-output-writer.ts`

- [ ] **Step 1: Create agent-output-writer.ts**

```typescript
/**
 * lib/agent-output-writer.ts — Saves agent results to user-specified locations.
 * Handles template rendering and directory creation.
 */
import { Agent } from '@/store/types';

const DEFAULT_TEMPLATE = `---
date: {{date}}
agent: {{agent_name}}
tool: {{tool_used}}
---

# {{agent_name}} — {{date}}

{{content}}

---
*Generated by Shelly Background Agent at {{timestamp}}*
`;

export interface OutputContext {
  date: string;        // YYYY-MM-DD
  timestamp: string;   // ISO 8601
  agentName: string;
  toolUsed: string;
  content: string;
}

export function renderTemplate(template: string | null, ctx: OutputContext): string {
  const tmpl = template || DEFAULT_TEMPLATE;
  return tmpl
    .replace(/\{\{date\}\}/g, ctx.date)
    .replace(/\{\{timestamp\}\}/g, ctx.timestamp)
    .replace(/\{\{agent_name\}\}/g, ctx.agentName)
    .replace(/\{\{tool_used\}\}/g, ctx.toolUsed)
    .replace(/\{\{content\}\}/g, ctx.content);
}

export function generateFilename(agent: Agent): string {
  const date = new Date().toISOString().slice(0, 10);
  const slug = agent.name
    .toLowerCase()
    .replace(/[^a-z0-9\u3040-\u9fff]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${date}-${slug}.md`;
}

/**
 * Generate the shell commands to write agent output.
 * Called by agent-executor to build the run-agent.sh script.
 */
export function generateOutputCommands(
  agent: Agent,
  resultFile: string,
  toolLabel: string
): string {
  const outputDir = agent.outputPath.replace(/^~/, '$HOME');
  const filename = generateFilename(agent);
  const date = new Date().toISOString().slice(0, 10);
  const timestamp = new Date().toISOString();

  // Build the template rendering in bash (simple sed replacement)
  const template = (agent.outputTemplate || DEFAULT_TEMPLATE)
    .replace(/"/g, '\\"');

  return `
# Create output directory
mkdir -p "${outputDir}"

# Read raw result
CONTENT=$(cat "${resultFile}")

# Render template
cat > "${outputDir}/${filename}" << 'TEMPLATE_EOF'
${renderTemplate(agent.outputTemplate, {
    date,
    timestamp,
    agentName: agent.name,
    toolUsed: toolLabel,
    content: '${CONTENT}',
  })}
TEMPLATE_EOF

# Replace content placeholder with actual content
# (template was written with literal placeholder, now substitute)
`.trim();
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/agent-output-writer.ts
git commit -m "feat(agents): add output writer with template rendering"
```

---

## Task 5: Agent Executor

**Files:**
- Create: `lib/agent-executor.ts`

- [ ] **Step 1: Create agent-executor.ts**

All values are pre-computed in TypeScript and embedded as string literals in bash.
Each agent gets its own script file (`run-agent-{id}.sh`) to avoid overwrite conflicts.
Global concurrency enforced via counting active lock files.

```typescript
/**
 * lib/agent-executor.ts — Runs agent tasks in isolated tmux sessions.
 * Generates per-agent shell scripts and manages execution lifecycle.
 */
import { Agent, ToolChoice } from '@/store/types';
import { toolChoiceToLabel } from './agent-tool-router';

const HOME = '/data/data/com.termux/files/home';
const SHELLY_DIR = `${HOME}/.shelly`;
const AGENTS_DIR = `${SHELLY_DIR}/agents`;
const TMP_DIR = `${SHELLY_DIR}/tmp`;
const LOCKS_DIR = `${AGENTS_DIR}/locks`;
const LOGS_DIR = `${AGENTS_DIR}/logs`;
const ENV_FILE = `${AGENTS_DIR}/.env`;
const MAX_CONCURRENT = 2;

const DEFAULT_TIMEOUT_SEC = 600; // 10 minutes

/**
 * Generate a per-agent script: run-agent-{id}.sh
 * All values pre-computed in TypeScript, embedded as bash string literals.
 */
export function generateRunScript(agent: Agent): string {
  const agentId = agent.id;
  const resultFile = `${TMP_DIR}/agent-result-${agentId}.md`;
  const lockFile = `${LOCKS_DIR}/${agentId}.pid`;
  const logDir = `${LOGS_DIR}/${agentId}`;
  const toolLabel = toolChoiceToLabel(agent.tool);

  // Pre-compute slug in TypeScript (NOT in bash)
  const slug = agent.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const outputDir = agent.outputPath.replace(/^~/, HOME);

  // Escape prompt for single-quoted bash string
  const escapedPrompt = agent.prompt.replace(/'/g, "'\\''");

  const toolCommand = generateToolCommand(agent.tool, escapedPrompt);

  // Pure bash script — no TypeScript expressions inside
  return `#!/bin/bash
# run-agent-${agentId}.sh — Auto-generated by Shelly for agent: ${agent.name}
# Do not edit manually.
set -euo pipefail

AGENT_ID='${agentId}'
RESULT_FILE='${resultFile}'
LOCK_FILE='${lockFile}'
LOG_DIR='${logDir}'
TIMEOUT=${DEFAULT_TIMEOUT_SEC}
OUTPUT_DIR='${outputDir}'
SLUG='${slug}'
TOOL_LABEL='${toolLabel}'
ENV_FILE='${ENV_FILE}'
LOCKS_DIR='${LOCKS_DIR}'
MAX_CONCURRENT=${MAX_CONCURRENT}

START_TIME=$(date +%s)

# Source environment
[ -f "$ENV_FILE" ] && source "$ENV_FILE"
export PATH="/data/data/com.termux/files/usr/bin:$PATH"
export HOME="${HOME}"

# Create directories
mkdir -p '${TMP_DIR}' '${LOCKS_DIR}' "$LOG_DIR"

# Global concurrency check
ACTIVE_COUNT=$(find "$LOCKS_DIR" -name '*.pid' -exec sh -c 'kill -0 $(cat "{}") 2>/dev/null && echo 1' \\; | wc -l)
if [ "$ACTIVE_COUNT" -ge "$MAX_CONCURRENT" ]; then
  echo '{"status":"skipped","error":"global concurrency limit reached"}' > "$LOG_DIR/$(date +%s).json"
  exit 0
fi

# Per-agent concurrency lock
if [ -f "$LOCK_FILE" ]; then
  OLD_PID=$(cat "$LOCK_FILE")
  if kill -0 "$OLD_PID" 2>/dev/null; then
    echo '{"status":"skipped","error":"previous run still active"}' > "$LOG_DIR/$(date +%s).json"
    exit 0
  fi
  rm -f "$LOCK_FILE"
fi

# Acquire lock
echo $$ > "$LOCK_FILE"
cleanup() {
  rm -f "$LOCK_FILE"
}
trap cleanup EXIT

# Execute tool
${toolCommand}

# Check result
END_TIME=$(date +%s)
DURATION=$(( (END_TIME - START_TIME) * 1000 ))

if [ -f "$RESULT_FILE" ] && [ -s "$RESULT_FILE" ]; then
  PREVIEW=$(head -c 500 "$RESULT_FILE" | tr '\\n' ' ' | tr '"' "'")
  STATUS="success"

  # Copy to output directory
  mkdir -p "$OUTPUT_DIR"
  DATE=$(date +%Y-%m-%d)
  cp "$RESULT_FILE" "$OUTPUT_DIR/$DATE-$SLUG.md"
else
  PREVIEW=""
  STATUS="error"
fi

# Log run result
TS=$(date +%s)
cat > "$LOG_DIR/$TS.json" << LOGEOF
{"agentId":"$AGENT_ID","timestamp":${'\${TS}000'},"status":"$STATUS","outputPreview":"$PREVIEW","durationMs":$DURATION,"toolUsed":"$TOOL_LABEL"}
LOGEOF

# Prune old logs (keep last 30)
ls -t "$LOG_DIR"/*.json 2>/dev/null | tail -n +31 | xargs rm -f 2>/dev/null || true

# Cleanup temp
rm -f "$RESULT_FILE"
`;
}

function generateToolCommand(tool: ToolChoice, escapedPrompt: string): string {
  const resultVar = '"$RESULT_FILE"';
  switch (tool.type) {
    case 'cli':
      return `timeout "$TIMEOUT" ${tool.cli} --print '${escapedPrompt}' > ${resultVar} 2>&1 || true`;
    case 'local':
      // Prompt is passed via a temp file to avoid shell quoting issues
      return `PROMPT_FILE="${'$HOME/.shelly/tmp/agent-prompt-$AGENT_ID.txt'}"
echo '${escapedPrompt}' > "$PROMPT_FILE"
PROMPT_JSON=$(jq -Rs '.' < "$PROMPT_FILE")
timeout "$TIMEOUT" curl -s http://127.0.0.1:8080/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -d "{\\"messages\\":[{\\"role\\":\\"user\\",\\"content\\":$PROMPT_JSON}],\\"max_tokens\\":4096}" \\
  | jq -r '.choices[0].message.content // "Error: no response"' > ${resultVar} 2>&1 || true
rm -f "$PROMPT_FILE"`;
    case 'perplexity':
      return `PROMPT_FILE="${'$HOME/.shelly/tmp/agent-prompt-$AGENT_ID.txt'}"
echo '${escapedPrompt}' > "$PROMPT_FILE"
PROMPT_JSON=$(jq -Rs '.' < "$PROMPT_FILE")
timeout "$TIMEOUT" curl -s https://api.perplexity.ai/chat/completions \\
  -H "Authorization: Bearer $PERPLEXITY_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d "{\\"model\\":\\"sonar\\",\\"messages\\":[{\\"role\\":\\"user\\",\\"content\\":$PROMPT_JSON}]}" \\
  | jq -r '.choices[0].message.content // "Error: no response"' > ${resultVar} 2>&1 || true
rm -f "$PROMPT_FILE"`;
    case 'auto':
      return `timeout "$TIMEOUT" gemini --print '${escapedPrompt}' > ${resultVar} 2>&1 || true`;
  }
}

/**
 * Get the per-agent script path.
 */
export function getScriptPath(agentId: string): string {
  return `${AGENTS_DIR}/run-agent-${agentId}.sh`;
}

/**
 * Shell commands to install an agent. Creates dirs + writes script.
 */
export function generateInstallCommands(agent: Agent): string[] {
  const scriptPath = getScriptPath(agent.id);
  return [
    `mkdir -p ${AGENTS_DIR} ${TMP_DIR} ${LOCKS_DIR} ${LOGS_DIR}/${agent.id}`,
    `chmod +x '${scriptPath}'`,
  ];
}

/**
 * Run an agent now in a tmux session.
 */
export function generateRunNowCommand(agentId: string): string {
  const sessionName = `shelly-agent-${agentId}`;
  const scriptPath = getScriptPath(agentId);
  return `tmux new-session -d -s "${sessionName}" "bash '${scriptPath}'" 2>/dev/null || tmux send-keys -t "${sessionName}" "bash '${scriptPath}'" Enter`;
}

/**
 * Stop a running agent.
 */
export function generateStopCommand(agentId: string): string {
  const sessionName = `shelly-agent-${agentId}`;
  return `tmux kill-session -t "${sessionName}" 2>/dev/null; rm -f '${LOCKS_DIR}/${agentId}.pid'`;
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/agent-executor.ts
git commit -m "feat(agents): add executor with tmux session management and script generation"
```

---

## Task 6: Agent Scheduler (AlarmManager + crond)

**Files:**
- Create: `lib/agent-scheduler.ts`
- Create: `modules/terminal-emulator/android/src/main/java/expo/modules/terminalemulator/AgentAlarmReceiver.kt`
- Modify: `modules/terminal-emulator/android/src/main/java/expo/modules/terminalemulator/TerminalEmulatorModule.kt`

- [ ] **Step 1: Create AgentAlarmReceiver.kt**

```kotlin
package expo.modules.terminalemulator

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * BroadcastReceiver for scheduled agent execution.
 * Triggered by AlarmManager, starts Termux RunCommandService to run the agent script.
 */
class AgentAlarmReceiver : BroadcastReceiver() {
    companion object {
        private const val TAG = "AgentAlarmReceiver"
    }

    override fun onReceive(context: Context, intent: Intent) {
        val agentId = intent.getStringExtra("agent_id") ?: return
        Log.i(TAG, "Alarm triggered for agent: $agentId")

        try {
            val home = "/data/data/com.termux/files/home"
            val scriptPath = "$home/.shelly/agents/run-agent-$agentId.sh"

            val runIntent = Intent("com.termux.RUN_COMMAND").apply {
                setClassName("com.termux", "com.termux.app.RunCommandService")
                putExtra("com.termux.RUN_COMMAND_PATH", scriptPath)
                putExtra("com.termux.RUN_COMMAND_ARGUMENTS", emptyArray<String>())
                putExtra("com.termux.RUN_COMMAND_BACKGROUND", true)
            }
            context.startService(runIntent)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start agent $agentId", e)
        }
    }
}
```

- [ ] **Step 2: Add scheduleAgent/cancelAgent to TerminalEmulatorModule**

Add these AsyncFunctions inside the `definition()` block of `TerminalEmulatorModule.kt`:

```kotlin
// Helper: get a stable integer ID for each agent (avoids hashCode collision)
private fun getAgentRequestCode(context: Context, agentId: String): Int {
    val prefs = context.getSharedPreferences("shelly_agent_ids", Context.MODE_PRIVATE)
    val existing = prefs.getInt(agentId, -1)
    if (existing >= 0) return existing
    val nextId = prefs.getInt("_next_id", 1000)
    prefs.edit().putInt(agentId, nextId).putInt("_next_id", nextId + 1).apply()
    return nextId
}

AsyncFunction("scheduleAgent") { agentId: String, intervalMs: Long, triggerAtMs: Long ->
    val context = appContext.reactContext ?: return@AsyncFunction null
    val requestCode = getAgentRequestCode(context, agentId)
    val am = context.getSystemService(Context.ALARM_SERVICE) as android.app.AlarmManager
    val intent = Intent(context, AgentAlarmReceiver::class.java).apply {
        putExtra("agent_id", agentId)
    }
    val pi = android.app.PendingIntent.getBroadcast(
        context, requestCode, intent,
        android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE
    )
    am.setRepeating(android.app.AlarmManager.RTC_WAKEUP, triggerAtMs, intervalMs, pi)
    Log.i("TerminalEmulator", "Scheduled agent $agentId (reqCode=$requestCode): interval=${intervalMs}ms")
    null
}

AsyncFunction("cancelAgent") { agentId: String ->
    val context = appContext.reactContext ?: return@AsyncFunction null
    val requestCode = getAgentRequestCode(context, agentId)
    val intent = Intent(context, AgentAlarmReceiver::class.java).apply {
        putExtra("agent_id", agentId)
    }
    val pi = android.app.PendingIntent.getBroadcast(
        context, requestCode, intent,
        android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE
    )
    val am = context.getSystemService(Context.ALARM_SERVICE) as android.app.AlarmManager
    am.cancel(pi)
    Log.i("TerminalEmulator", "Cancelled agent $agentId")
    null
}
```

Add the import at the top of the file:

```kotlin
import android.content.Intent
```

(Already imported — verify.)

- [ ] **Step 3: Add TS type declarations for scheduleAgent/cancelAgent**

In `modules/terminal-emulator/src/TerminalEmulatorModule.ts`, add inside the `TerminalEmulatorModuleType` class:

```typescript
scheduleAgent(agentId: string, intervalMs: number, triggerAtMs: number): Promise<void>;
cancelAgent(agentId: string): Promise<void>;
```

- [ ] **Step 4: Register receiver + SCHEDULE_EXACT_ALARM permission in AndroidManifest**

In `android/app/src/main/AndroidManifest.xml`, add the permission (before `<application>`):

```xml
<uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM"/>
```

And inside the `<application>` block, add the receiver:

```xml
<receiver
    android:name="expo.modules.terminalemulator.AgentAlarmReceiver"
    android:exported="false" />
```

- [ ] **Step 6: Create agent-scheduler.ts**

```typescript
/**
 * lib/agent-scheduler.ts — Manages scheduled execution.
 * Primary: AlarmManager (via native module).
 * Fallback: crond (Termux crontab).
 */
import { Agent } from '@/store/types';
import * as TerminalEmulator from '@/modules/terminal-emulator';

/**
 * Convert cron expression to AlarmManager interval.
 * Simple cases only — complex cron needs crond fallback.
 */
function cronToIntervalMs(cron: string): number | null {
  // Simple patterns only:
  // "0 9 * * *"        → daily at 9am → 86400000
  // "0 9 * * 1,3,5"    → 3x/week → not expressible as interval → null
  // "*/30 * * * *"     → every 30 min → 1800000

  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return null;

  const [min, hour, dom, mon, dow] = parts;

  // Every N minutes
  const everyMinMatch = min.match(/^\*\/(\d+)$/);
  if (everyMinMatch && hour === '*' && dom === '*' && mon === '*' && dow === '*') {
    return parseInt(everyMinMatch[1]) * 60 * 1000;
  }

  // Daily at fixed time
  if (/^\d+$/.test(min) && /^\d+$/.test(hour) && dom === '*' && mon === '*' && dow === '*') {
    return 24 * 60 * 60 * 1000;
  }

  // Cannot express as interval — use crond
  return null;
}

/**
 * Calculate next trigger time from cron expression.
 */
function nextTriggerMs(cron: string): number {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return Date.now() + 60000;

  const [min, hour] = parts;
  const now = new Date();
  const target = new Date();

  if (/^\d+$/.test(min)) target.setMinutes(parseInt(min));
  if (/^\d+$/.test(hour)) target.setHours(parseInt(hour));
  target.setSeconds(0);
  target.setMilliseconds(0);

  // If target is in the past, move to next day
  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1);
  }

  return target.getTime();
}

export async function installSchedule(agent: Agent): Promise<void> {
  if (!agent.schedule) return;

  const intervalMs = cronToIntervalMs(agent.schedule);

  if (intervalMs !== null) {
    // AlarmManager path
    const triggerAt = nextTriggerMs(agent.schedule);
    await TerminalEmulator.scheduleAgent(agent.id, intervalMs, triggerAt);
  }

  // Always install crond as backup (if available)
  // This is a best-effort — crond may not be installed
  // The crontab command is run via the existing bridge
}

export async function uninstallSchedule(agentId: string): Promise<void> {
  await TerminalEmulator.cancelAgent(agentId);
}

export async function runNow(agentId: string): Promise<void> {
  // Direct execution via bridge — no AlarmManager needed
  // Handled by agent-manager calling agent-executor
}
```

- [ ] **Step 5: Commit**

```bash
git add modules/terminal-emulator/android/src/main/java/expo/modules/terminalemulator/AgentAlarmReceiver.kt
git add modules/terminal-emulator/android/src/main/java/expo/modules/terminalemulator/TerminalEmulatorModule.kt
git add modules/terminal-emulator/src/TerminalEmulatorModule.ts
git add android/app/src/main/AndroidManifest.xml
git add lib/agent-scheduler.ts
git commit -m "feat(agents): add AlarmManager scheduler with AgentAlarmReceiver and SCHEDULE_EXACT_ALARM"
```

---

## Task 7: Agent Manager (Orchestrator + @agent Command Parser)

**Files:**
- Create: `lib/agent-manager.ts`

- [ ] **Step 1: Create agent-manager.ts**

```typescript
/**
 * lib/agent-manager.ts — Agent CRUD, orchestration, and @agent command parsing.
 * Entry point for all agent operations from the chat UI.
 */
import { useAgentStore } from '@/store/agent-store';
import { Agent, ToolChoice } from '@/store/types';
import { suggestTool, toolChoiceToLabel } from './agent-tool-router';
import { generateRunScript, generateRunNowCommand, generateStopCommand } from './agent-executor';
import { installSchedule, uninstallSchedule } from './agent-scheduler';
import * as Notifications from 'expo-notifications';

const AGENTS_DIR = '$HOME/.shelly/agents';

/**
 * Parse @agent commands from chat input.
 *
 * Supported commands:
 *   @agent list               — List all agents
 *   @agent run <name>         — Manual trigger
 *   @agent stop <name>        — Stop running agent
 *   @agent delete <name>      — Delete agent
 *   @agent edit <name>        — Edit agent (opens creation flow)
 *   @agent history <name>     — Show run history
 *   @agent status             — All agents status summary
 *   @agent <natural language> — Create new agent via wizard
 */
export interface AgentCommandResult {
  type: 'list' | 'run' | 'stop' | 'delete' | 'history' | 'status' | 'create' | 'error';
  message: string;
  data?: any;
}

export function parseAgentCommand(input: string): AgentCommandResult {
  const trimmed = input.trim();
  const parts = trimmed.split(/\s+/);
  const subcommand = parts[0]?.toLowerCase();
  const nameArg = parts.slice(1).join(' ');

  const store = useAgentStore.getState();

  switch (subcommand) {
    case 'list':
      return listAgents(store.agents);

    case 'run': {
      const agent = store.getAgentByName(nameArg);
      if (!agent) return { type: 'error', message: `Agent "${nameArg}" not found` };
      return { type: 'run', message: `Running ${agent.name}...`, data: { agentId: agent.id } };
    }

    case 'stop': {
      const agent = store.getAgentByName(nameArg);
      if (!agent) return { type: 'error', message: `Agent "${nameArg}" not found` };
      return { type: 'stop', message: `Stopping ${agent.name}...`, data: { agentId: agent.id } };
    }

    case 'delete': {
      const agent = store.getAgentByName(nameArg);
      if (!agent) return { type: 'error', message: `Agent "${nameArg}" not found` };
      return { type: 'delete', message: `Delete ${agent.name}?`, data: { agent } };
    }

    case 'history': {
      const agent = store.getAgentByName(nameArg);
      if (!agent) return { type: 'error', message: `Agent "${nameArg}" not found` };
      const logs = store.getRunHistory(agent.id);
      return { type: 'history', message: formatHistory(agent, logs), data: { logs } };
    }

    case 'status':
      return statusAll(store.agents);

    default:
      // Natural language — trigger creation flow
      return {
        type: 'create',
        message: trimmed,
        data: { suggestion: suggestTool(trimmed) },
      };
  }
}

function listAgents(agents: Agent[]): AgentCommandResult {
  if (agents.length === 0) {
    return { type: 'list', message: 'No agents configured. Describe a task to create one.' };
  }
  const lines = agents.map((a) => {
    const status = a.lastResult === 'success' ? '✅' : a.lastResult === 'error' ? '❌' : '⏸️';
    const schedule = a.schedule || 'manual';
    return `${status} **${a.name}** — ${schedule} — ${toolChoiceToLabel(a.tool)}`;
  });
  return { type: 'list', message: lines.join('\n') };
}

function statusAll(agents: Agent[]): AgentCommandResult {
  if (agents.length === 0) {
    return { type: 'status', message: 'No agents configured.' };
  }
  const lines = agents.map((a) => {
    const status = a.enabled ? (a.lastResult === 'success' ? '✅' : a.lastResult === 'error' ? '❌' : '⏳') : '⏸️';
    const lastRun = a.lastRun ? new Date(a.lastRun).toLocaleString('ja-JP') : 'never';
    return `${status} **${a.name}** — last: ${lastRun}`;
  });
  return { type: 'status', message: lines.join('\n') };
}

function formatHistory(agent: Agent, logs: any[]): string {
  if (logs.length === 0) return `No run history for ${agent.name}.`;
  const lines = logs.slice(-10).reverse().map((log) => {
    const date = new Date(log.timestamp).toLocaleString('ja-JP');
    const icon = log.status === 'success' ? '✅' : log.status === 'error' ? '❌' : '⏭️';
    const duration = `${(log.durationMs / 1000).toFixed(0)}s`;
    return `${icon} ${date} — ${duration} — ${log.toolUsed}`;
  });
  return `**${agent.name}** — Last ${lines.length} runs:\n${lines.join('\n')}`;
}

/**
 * Create a new agent from parsed creation data.
 */
export function createAgent(params: {
  name: string;
  description: string;
  prompt: string;
  schedule: string | null;
  tool: ToolChoice;
  outputPath: string;
  outputTemplate?: string;
}): Agent {
  const agent: Agent = {
    id: `agent-${Date.now().toString(36)}`,
    name: params.name,
    description: params.description,
    prompt: params.prompt,
    schedule: params.schedule,
    tool: params.tool,
    outputPath: params.outputPath,
    outputTemplate: params.outputTemplate || null,
    enabled: true,
    lastRun: null,
    lastResult: null,
    createdAt: Date.now(),
    version: 1,
  };

  useAgentStore.getState().addAgent(agent);
  return agent;
}

/**
 * Delete an agent and clean up.
 */
export async function deleteAgent(agentId: string): Promise<void> {
  await uninstallSchedule(agentId);
  useAgentStore.getState().removeAgent(agentId);
}

/**
 * Send notification for agent result.
 */
export async function notifyAgentResult(
  agent: Agent,
  status: 'success' | 'error' | 'skipped',
  summary: string
): Promise<void> {
  const icon = status === 'success' ? '✅' : status === 'error' ? '❌' : '⏭️';
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `${icon} ${agent.name}`,
      body: summary,
      data: { agentId: agent.id },
    },
    trigger: null,
  });
}

/**
 * Load agents from filesystem on app startup.
 * Called from app initialization.
 */
export async function loadAgentsFromDisk(
  runCommand: (cmd: string) => Promise<string>
): Promise<void> {
  try {
    const output = await runCommand(
      `ls ${AGENTS_DIR}/*.json 2>/dev/null | while read f; do cat "$f"; echo "---SEPARATOR---"; done`
    );

    if (!output.trim()) {
      useAgentStore.getState().setAgents([]);
      return;
    }

    const agents: Agent[] = [];
    const chunks = output.split('---SEPARATOR---').filter((c) => c.trim());
    for (const chunk of chunks) {
      try {
        const agent = JSON.parse(chunk.trim()) as Agent;
        agents.push(agent);
      } catch {
        // Skip malformed agent files
      }
    }
    useAgentStore.getState().setAgents(agents);
  } catch {
    useAgentStore.getState().setAgents([]);
  }
}

/**
 * Persist a single agent to disk.
 */
export function generateSaveCommand(agent: Agent): string {
  const json = JSON.stringify(agent, null, 2);
  const escaped = json.replace(/'/g, "'\\''");
  return `mkdir -p ${AGENTS_DIR} && echo '${escaped}' > ${AGENTS_DIR}/${agent.id}.json`;
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/agent-manager.ts
git commit -m "feat(agents): add agent-manager with CRUD, @agent command parser, and notifications"
```

---

## Task 8: API Key Management (.env Sync)

**Files:**
- Modify: `store/settings-store.ts`

- [ ] **Step 1: Add Perplexity API key sync to settings**

In `store/settings-store.ts`, add to the `updateSettings` method — after the existing `saveApiKey` loop, add .env file sync:

```typescript
// In updateSettings, after the SecureStore save loop:
if ('perplexityApiKey' in newSettings && typeof newSettings.perplexityApiKey === 'string') {
  // Also sync to ~/.shelly/agents/.env for headless execution
  syncApiKeyToEnvFile('PERPLEXITY_API_KEY', newSettings.perplexityApiKey);
}
```

Add helper function that queues the sync command in the agent store:

```typescript
import { useAgentStore } from '@/store/agent-store';

async function syncApiKeyToEnvFile(envKey: string, value: string): Promise<void> {
  // Queue the command for execution by the next available bridge session
  const cmd = `mkdir -p ~/.shelly/agents && (grep -v "^${envKey}=" ~/.shelly/agents/.env 2>/dev/null || true; echo "${envKey}=${value}") > ~/.shelly/agents/.env.tmp && mv ~/.shelly/agents/.env.tmp ~/.shelly/agents/.env && chmod 600 ~/.shelly/agents/.env`;
  useAgentStore.getState().setPendingEnvSync(cmd);
}
```

And add `pendingEnvSync` to the agent store:

```typescript
// In agent-store.ts, add to AgentState:
pendingEnvSync: string | null;
setPendingEnvSync: (cmd: string | null) => void;
consumePendingEnvSync: () => string | null;

// In the store implementation:
pendingEnvSync: null,
setPendingEnvSync: (cmd) => set({ pendingEnvSync: cmd }),
consumePendingEnvSync: () => {
  const cmd = get().pendingEnvSync;
  set({ pendingEnvSync: null });
  return cmd;
},
```

The pending sync command is consumed by `agent-manager.ts` whenever a bridge session executes a command — it checks and drains the queue first.

Also add `perplexityApiKey` to the `DEFAULT_SETTINGS`:

```typescript
perplexityApiKey: '',
```

And ensure `perplexityApiKey` is treated as an API key field in `lib/secure-store.ts` (check if `isApiKeyField` already handles it).

- [ ] **Step 2: Commit**

```bash
git add store/settings-store.ts
git commit -m "feat(agents): add Perplexity API key .env sync for headless agent execution"
```

---

## Task 9: Wire @agent Route in app/(tabs)/index.tsx

**Files:**
- Modify: `app/(tabs)/index.tsx`

The `@agent` RouteTarget already exists in `input-router.ts` (line 16, 76-78). The parsed input flows to `app/(tabs)/index.tsx` where `parsed.target` is consumed around line 661-743. Currently `'agent'` falls through to the generic `aiDispatch()` call at line 743. We need to intercept it before that.

- [ ] **Step 1: Add agent command handler**

In `app/(tabs)/index.tsx`, add import:

```typescript
import { parseAgentCommand, AgentCommandResult } from '@/lib/agent-manager';
import { generateRunNowCommand, generateStopCommand, generateRunScript, getScriptPath } from '@/lib/agent-executor';
```

Around line 700 (after the `if (target === 'actions')` block and before the `if (target === 'browser')` block), add:

```typescript
    // @agent commands — dispatch to agent manager
    if (target === 'agent') {
      const result = parseAgentCommand(parsed.prompt);

      switch (result.type) {
        case 'list':
        case 'status':
        case 'history':
        case 'error':
          // Display as bot message
          addBotMessage(result.message);
          return;

        case 'run': {
          addBotMessage(`Running ${result.data.agentId}...`);
          const cmd = generateRunNowCommand(result.data.agentId);
          await bridgeRunCommand(cmd);
          return;
        }

        case 'stop': {
          const cmd = generateStopCommand(result.data.agentId);
          await bridgeRunCommand(cmd);
          addBotMessage(`Stopped ${result.data.agentId}.`);
          return;
        }

        case 'delete': {
          const { deleteAgent } = await import('@/lib/agent-manager');
          await deleteAgent(result.data.agent.id);
          addBotMessage(`Deleted agent "${result.data.agent.name}".`);
          return;
        }

        case 'create':
          // Show AgentCreateFlow component (set state to render it)
          setAgentCreateData({
            prompt: result.message,
            suggestion: result.data.suggestion,
          });
          return;
      }
      return;
    }
```

Also add state for the create flow:

```typescript
const [agentCreateData, setAgentCreateData] = useState<{
  prompt: string;
  suggestion: any;
} | null>(null);
```

And render `AgentCreateFlow` when `agentCreateData` is set (in the JSX, near other modal/overlay components).

- [ ] **Step 2: Add `edit` case to parseAgentCommand**

In `lib/agent-manager.ts`, add in the `switch(subcommand)` block:

```typescript
    case 'edit': {
      const agent = store.getAgentByName(nameArg);
      if (!agent) return { type: 'error', message: `Agent "${nameArg}" not found` };
      return { type: 'create', message: nameArg, data: { suggestion: suggestTool(agent.prompt), editAgent: agent } };
    }
```

- [ ] **Step 3: Commit**

```bash
git add app/\(tabs\)/index.tsx
git add lib/agent-manager.ts
git commit -m "feat(agents): wire @agent command dispatch in index.tsx with explicit handler"
```

---

## Task 10: Agent UI Components

**Files:**
- Create: `components/agent/AgentStatusBadge.tsx`
- Create: `components/agent/AgentListPanel.tsx`
- Create: `components/agent/AgentCreateFlow.tsx`

- [ ] **Step 1: Create AgentStatusBadge.tsx**

```tsx
/**
 * components/agent/AgentStatusBadge.tsx
 * Small status indicator for an agent (✅/❌/⏸️).
 */
import React from 'react';
import { View, Text } from 'react-native';
import { Agent } from '@/store/types';

interface Props {
  agent: Agent;
}

export function AgentStatusBadge({ agent }: Props) {
  const icon = !agent.enabled
    ? '⏸️'
    : agent.lastResult === 'success'
    ? '✅'
    : agent.lastResult === 'error'
    ? '❌'
    : '⏳';

  const lastRun = agent.lastRun
    ? new Date(agent.lastRun).toLocaleString('ja-JP', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Not run yet';

  return (
    <View className="flex-row items-center gap-2">
      <Text className="text-base">{icon}</Text>
      <View>
        <Text className="text-white font-medium">{agent.name}</Text>
        <Text className="text-gray-400 text-xs">{lastRun}</Text>
      </View>
    </View>
  );
}
```

- [ ] **Step 2: Create AgentListPanel.tsx**

```tsx
/**
 * components/agent/AgentListPanel.tsx
 * Agent list in Settings screen.
 */
import React from 'react';
import { View, Text, FlatList, TouchableOpacity, Alert } from 'react-native';
import { useAgentStore } from '@/store/agent-store';
import { AgentStatusBadge } from './AgentStatusBadge';
import { deleteAgent } from '@/lib/agent-manager';
import { toolChoiceToLabel } from '@/lib/agent-tool-router';

export function AgentListPanel() {
  const agents = useAgentStore((s) => s.agents);

  if (agents.length === 0) {
    return (
      <View className="p-4">
        <Text className="text-gray-400 text-center">
          No background agents configured.{'\n'}
          Use @agent in chat to create one.
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={agents}
      keyExtractor={(a) => a.id}
      renderItem={({ item }) => (
        <TouchableOpacity
          className="flex-row items-center justify-between p-3 border-b border-gray-800"
          onLongPress={() => {
            Alert.alert(
              'Delete Agent',
              `Delete "${item.name}"?`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: () => deleteAgent(item.id),
                },
              ]
            );
          }}
        >
          <AgentStatusBadge agent={item} />
          <View className="items-end">
            <Text className="text-gray-400 text-xs">
              {item.schedule || 'Manual'}
            </Text>
            <Text className="text-gray-500 text-xs">
              {toolChoiceToLabel(item.tool)}
            </Text>
          </View>
        </TouchableOpacity>
      )}
    />
  );
}
```

- [ ] **Step 3: Create AgentCreateFlow.tsx**

```tsx
/**
 * components/agent/AgentCreateFlow.tsx
 * Chat-based agent creation wizard.
 * Renders as a chat bubble with confirmation buttons.
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { ToolSuggestion } from '@/lib/agent-tool-router';
import { createAgent, generateSaveCommand } from '@/lib/agent-manager';
import { installSchedule } from '@/lib/agent-scheduler';
import { ToolChoice } from '@/store/types';

interface Props {
  prompt: string;
  suggestion: ToolSuggestion;
  onConfirm: (message: string) => void;
  onCancel: () => void;
  runCommand: (cmd: string) => Promise<string>;
}

export function AgentCreateFlow({ prompt, suggestion, onConfirm, onCancel, runCommand }: Props) {
  const [confirmed, setConfirmed] = useState(false);

  const agentName = extractAgentName(prompt);
  const schedule = extractSchedule(prompt);
  const outputPath = extractOutputPath(prompt);

  const handleConfirm = async () => {
    setConfirmed(true);

    const agent = createAgent({
      name: agentName,
      description: prompt,
      prompt: prompt,
      schedule: schedule,
      tool: suggestion.tool,
      outputPath: outputPath,
    });

    // Save to disk
    await runCommand(generateSaveCommand(agent));

    // Install schedule
    if (agent.schedule) {
      await installSchedule(agent);
    }

    onConfirm(`✅ Agent "${agent.name}" created. ${schedule ? `Next run: scheduled.` : 'Run manually with @agent run ' + agentName}`);
  };

  if (confirmed) {
    return (
      <View className="bg-green-900/30 rounded-lg p-3 m-2">
        <Text className="text-green-400">✅ Agent created</Text>
      </View>
    );
  }

  return (
    <View className="bg-gray-800 rounded-lg p-4 m-2">
      <Text className="text-white font-bold mb-2">Create Background Agent</Text>

      <View className="gap-1 mb-3">
        <Text className="text-gray-300">📋 Name: {agentName}</Text>
        <Text className="text-gray-300">🔍 Tool: {suggestion.label}</Text>
        <Text className="text-gray-400 text-xs ml-5">{suggestion.reason}</Text>
        <Text className="text-gray-300">📅 Schedule: {schedule || 'Manual trigger only'}</Text>
        <Text className="text-gray-300">📁 Output: {outputPath}</Text>
      </View>

      <View className="flex-row gap-3">
        <TouchableOpacity
          className="bg-emerald-600 rounded-lg px-4 py-2 flex-1"
          onPress={handleConfirm}
        >
          <Text className="text-white text-center font-medium">Create</Text>
        </TouchableOpacity>
        <TouchableOpacity
          className="bg-gray-600 rounded-lg px-4 py-2"
          onPress={onCancel}
        >
          <Text className="text-white text-center">Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// Simple extraction helpers — these parse natural language for common patterns
function extractAgentName(prompt: string): string {
  // Take first meaningful noun phrase, fallback to first 30 chars
  const cleaned = prompt.replace(/毎|週|月|日|朝|夕|に|を|して|の|で|から/g, ' ').trim();
  const words = cleaned.split(/\s+/).filter(w => w.length > 1).slice(0, 3);
  return words.join(' ') || prompt.slice(0, 30);
}

function extractSchedule(prompt: string): string | null {
  // Common patterns
  if (/毎日|every\s*day|daily/i.test(prompt)) return '0 9 * * *';
  if (/毎週|weekly|every\s*week/i.test(prompt)) return '0 9 * * 1';
  if (/月水金/i.test(prompt)) return '0 9 * * 1,3,5';
  if (/火木/i.test(prompt)) return '0 9 * * 2,4';
  return null; // Manual trigger
}

function extractOutputPath(prompt: string): string {
  // Look for explicit paths in the prompt
  const pathMatch = prompt.match(/[~\/][\w\/.-]+\//);
  if (pathMatch) return pathMatch[0];
  return '~/.shelly/agents/output/';
}
```

- [ ] **Step 4: Commit**

```bash
git add components/agent/AgentStatusBadge.tsx
git add components/agent/AgentListPanel.tsx
git add components/agent/AgentCreateFlow.tsx
git commit -m "feat(agents): add agent UI components (list panel, create flow, status badge)"
```

---

## Task 11: App Startup Integration + Lifecycle

**Files:**
- Modify: App initialization file (find where `loadSettings` is called on startup)

- [ ] **Step 1: Add agent loading to app startup**

Find the app initialization point (likely `app/_layout.tsx` or similar). Add after settings are loaded:

```typescript
import { loadAgentsFromDisk } from '@/lib/agent-manager';

// In the app startup useEffect:
useEffect(() => {
  // ... existing settings load ...
  
  // Load background agents
  loadAgentsFromDisk(async (cmd) => {
    // Use the bridge to execute shell commands
    // This depends on how the existing bridge works —
    // likely via TerminalEmulatorModule or a bridge utility
    return ''; // placeholder — wire to actual bridge
  });
}, []);
```

Also add lifecycle cleanup — on session disconnect, clean up orphaned tmux agent sessions:

```typescript
// Optional: cleanup on app startup
const cleanupCmd = `for s in $(tmux ls -F '#{session_name}' 2>/dev/null | grep '^shelly-agent-'); do
  tmux kill-session -t "$s" 2>/dev/null
done`;
```

- [ ] **Step 2: Commit**

```bash
git add app/_layout.tsx  # or wherever the startup code lives
git commit -m "feat(agents): add agent loading on app startup"
```

---

## Task 12: CI Build Verification

**Files:** None (verification only)

- [ ] **Step 1: Push and verify CI build**

```bash
cd ~/Shelly
git push origin HEAD
```

- [ ] **Step 2: Check CI results**

```bash
gh run list --limit 1
gh run view <run-id>
```

Expected: Build succeeds. Key things to verify:
- AgentAlarmReceiver compiles and is registered in manifest
- scheduleAgent/cancelAgent native functions compile
- TypeScript files have no type errors
- All imports resolve correctly

- [ ] **Step 3: Test on device**

If build passes:
- `@agent list` → shows "No agents configured"
- `@agent status` → shows "No agents configured"
- Create an agent via natural language in chat → creation wizard appears
- Confirm → agent JSON saved to `~/.shelly/agents/`
- `@agent run <name>` → tmux session created, script executes
- Check output file in specified path
- Notification appears on completion

---

## Summary

| Task | Component | Est. LOC |
|------|-----------|----------|
| 1 | Type definitions | ~40 |
| 2 | Agent store (Zustand) | ~60 |
| 3 | Tool router | ~80 |
| 4 | Output writer | ~70 |
| 5 | Executor | ~160 |
| 6 | Scheduler (Kotlin + TS) | ~130 |
| 7 | Manager (orchestrator) | ~200 |
| 8 | API key .env sync | ~30 |
| 9 | input-router wiring | ~15 |
| 10 | UI components | ~180 |
| 11 | App startup integration | ~20 |
| 12 | CI verification | 0 |
| **Total** | | **~985** |
