/**
 * Customizable keybinding system (WezTerm-style).
 * Maps key combinations to actions for physical keyboard users.
 */

export type KeyAction =
  | 'command_palette'
  | 'quick_terminal'
  | 'multi_pane_toggle'
  | 'clear_terminal'
  | 'new_session'
  | 'close_session'
  | 'next_tab'
  | 'prev_tab'
  | 'copy'
  | 'paste'
  | 'cancel'
  | 'search'
  | 'workflow';

export type KeyBinding = {
  action: KeyAction;
  key: string;     // e.g. 'p', 'l', 'k'
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  label: string;   // Human-readable display
};

/** Default keybindings (Ghostty-inspired) */
export const DEFAULT_KEYBINDINGS: KeyBinding[] = [
  { action: 'command_palette', key: 'p', ctrl: true, shift: true, label: 'Ctrl+Shift+P' },
  { action: 'quick_terminal',  key: '`', ctrl: true, label: 'Ctrl+`' },
  { action: 'multi_pane_toggle', key: '\\', ctrl: true, label: 'Ctrl+\\' },
  { action: 'clear_terminal',  key: 'l', ctrl: true, label: 'Ctrl+L' },
  { action: 'new_session',     key: 't', ctrl: true, shift: true, label: 'Ctrl+Shift+T' },
  { action: 'close_session',   key: 'w', ctrl: true, shift: true, label: 'Ctrl+Shift+W' },
  { action: 'next_tab',        key: 'Tab', ctrl: true, label: 'Ctrl+Tab' },
  { action: 'prev_tab',        key: 'Tab', ctrl: true, shift: true, label: 'Ctrl+Shift+Tab' },
  { action: 'copy',            key: 'c', ctrl: true, shift: true, label: 'Ctrl+Shift+C' },
  { action: 'paste',           key: 'v', ctrl: true, shift: true, label: 'Ctrl+Shift+V' },
  { action: 'cancel',          key: 'c', ctrl: true, label: 'Ctrl+C' },
  { action: 'search',          key: 'f', ctrl: true, label: 'Ctrl+F' },
  { action: 'workflow',        key: 'r', ctrl: true, shift: true, label: 'Ctrl+Shift+R' },
];

/**
 * Match a keyboard event against the keybinding list.
 * Returns the matched action or null.
 */
export function matchKeybinding(
  key: string,
  ctrlKey: boolean,
  shiftKey: boolean,
  altKey: boolean,
  bindings: KeyBinding[] = DEFAULT_KEYBINDINGS,
): KeyAction | null {
  for (const b of bindings) {
    const matchKey = key.toLowerCase() === b.key.toLowerCase();
    const matchCtrl = !!b.ctrl === ctrlKey;
    const matchShift = !!b.shift === shiftKey;
    const matchAlt = !!b.alt === altKey;
    if (matchKey && matchCtrl && matchShift && matchAlt) {
      return b.action;
    }
  }
  return null;
}

/**
 * Format a keybinding for display.
 */
export function formatKeybinding(binding: KeyBinding): string {
  const parts: string[] = [];
  if (binding.ctrl) parts.push('Ctrl');
  if (binding.shift) parts.push('Shift');
  if (binding.alt) parts.push('Alt');
  parts.push(binding.key.length === 1 ? binding.key.toUpperCase() : binding.key);
  return parts.join('+');
}

/** Action labels for settings UI */
export const ACTION_LABELS: Record<KeyAction, string> = {
  command_palette: 'Command Palette',
  quick_terminal: 'Quick Terminal',
  multi_pane_toggle: 'Toggle Multi-Pane',
  clear_terminal: 'Clear Terminal',
  new_session: 'New Session',
  close_session: 'Close Session',
  next_tab: 'Next Tab',
  prev_tab: 'Previous Tab',
  copy: 'Copy',
  paste: 'Paste',
  cancel: 'Cancel Command',
  search: 'Search History',
  workflow: 'Run Workflow',
};
