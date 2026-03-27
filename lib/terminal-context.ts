/**
 * lib/terminal-context.ts — Cross-pane intelligence: terminal context for chat
 *
 * Detects @terminal mentions or terminal references in user messages,
 * builds context from captured terminal output for AI injection.
 */

import { useExecutionLogStore } from '@/store/execution-log-store';
import { hasTerminalReference, getTerminalIntent } from '@/lib/input-router';

const TERMINAL_MENTION_RE = /@terminal[-\s]?(\d)?/i;

function getTerminalMentionSessionId(text: string): string | null {
  const m = text.match(TERMINAL_MENTION_RE);
  if (!m) return null;
  const n = m[1] ? parseInt(m[1], 10) : 1;
  return `shelly-${n}`;
}

export function buildTerminalContext(userMessage: string): string | null {
  if (!hasTerminalReference(userMessage) && !TERMINAL_MENTION_RE.test(userMessage)) {
    return null;
  }

  const store = useExecutionLogStore.getState();

  // Specific session mentioned
  const mentionedSession = getTerminalMentionSessionId(userMessage);
  if (mentionedSession) {
    const output = store.getRecentOutput(50, 5, mentionedSession);
    if (!output.trim()) return null;
    return `Terminal [${mentionedSession}] output:\n${output}`;
  }

  // General terminal reference — include all sessions
  const sessions = store.getRecentOutputForAllSessions(50);
  if (sessions.length === 0) return null;

  let context = '--- Terminal Output ---\n';
  for (const s of sessions) {
    if (!s.output.trim()) continue;
    context += `[${s.sessionId}]\n${s.output}\n\n`;
  }
  context += '--- End Terminal Output ---';

  const intent = getTerminalIntent(userMessage);
  if (intent === 'reference') {
    return `The user is referencing terminal output:\n\n${context}`;
  }
  if (intent === 'second-opinion') {
    return `The user wants you to review/analyze this terminal output:\n\n${context}`;
  }
  if (intent === 'session-summary') {
    return `Summarize what happened in these terminal sessions:\n\n${context}`;
  }
  return context;
}
