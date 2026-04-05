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
