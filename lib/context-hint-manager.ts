import AsyncStorage from '@react-native-async-storage/async-storage';

export type HintTrigger = {
  id: string;
  condition: string; // description of when to show
  hint: string;      // the hint text to display
};

export const HINT_TRIGGERS: HintTrigger[] = [
  { id: 'git-diff-fold', condition: 'git diff 3+ times', hint: 'Tip: tap any diff block to fold/unfold' },
  { id: 'error-fixer', condition: 'error output detected', hint: 'Tap the error to send to AI Error Fixer' },
  { id: 'multiline', condition: 'long command pasted', hint: 'Shift+Enter or ↵ for multi-line editing' },
  { id: 'workflow-save', condition: 'same command 3+ times', hint: 'Save as workflow: shelly workflow save' },
  { id: 'clickable-path', condition: 'file path typed manually', hint: 'Tap file paths in output to open them' },
  { id: 'ai-context', condition: 'first AI pane use', hint: 'AI reads your terminal output automatically' },
  { id: 'layout-save', condition: 'manual pane resize', hint: 'Your layout is preserved between sessions' },
  { id: 'ssh-profile', condition: 'ssh command used', hint: 'Save as profile in sidebar for quick access' },
];

const SEEN_KEY = 'shelly_hints_seen';
let seenSet: Set<string> | null = null;
let lastHintTime = 0;

export async function loadSeenHints() {
  try {
    const raw = await AsyncStorage.getItem(SEEN_KEY);
    seenSet = new Set(raw ? JSON.parse(raw) : []);
  } catch { seenSet = new Set(); }
}

export async function shouldShowHint(hintId: string): Promise<boolean> {
  if (!seenSet) await loadSeenHints();
  if (seenSet!.has(hintId)) return false;
  if (Date.now() - lastHintTime < 60000) return false; // max 1/60s
  return true;
}

export async function markHintSeen(hintId: string) {
  if (!seenSet) await loadSeenHints();
  seenSet!.add(hintId);
  lastHintTime = Date.now();
  await AsyncStorage.setItem(SEEN_KEY, JSON.stringify([...seenSet!]));
}

export function getHint(id: string): HintTrigger | undefined {
  return HINT_TRIGGERS.find(h => h.id === id);
}
