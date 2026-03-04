/**
 * lib/plugin-api.ts — Plugin/Extension system
 *
 * Provides registration APIs for:
 * 1. Custom AI providers
 * 2. Custom shortcut bar buttons
 * 3. Command hooks (pre/post execution)
 * 4. Custom command palette actions
 *
 * Plugins are defined via a manifest and registered at runtime.
 */
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Types ────────────────────────────────────────────────────────────────────

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  /** Icon name from MaterialIcons */
  icon?: string;
}

export interface CustomAIProvider {
  id: string;
  name: string;
  /** @mention trigger (e.g., "@myai") */
  mentionTrigger: string;
  /** Color for the routing dot */
  color: string;
  /** Icon name */
  icon: string;
  /**
   * Handler: receives prompt, returns response text.
   * Can be async for API calls.
   */
  handler: (prompt: string, options?: {
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
  }) => Promise<string>;
  /** Optional streaming handler */
  streamHandler?: (
    prompt: string,
    onToken: (token: string) => void,
    onDone: () => void,
    options?: { systemPrompt?: string; temperature?: number },
  ) => Promise<void>;
}

export interface ShortcutButton {
  id: string;
  label: string;
  icon: string;
  /** Position in bar */
  position?: 'start' | 'end';
  onPress: () => void;
}

export type HookPhase = 'pre' | 'post';

export interface CommandHook {
  id: string;
  /** Which commands to hook (regex or '*' for all) */
  pattern: string | RegExp;
  phase: HookPhase;
  /**
   * Hook handler.
   * Pre-hooks can return modified command or null to cancel.
   * Post-hooks receive the output.
   */
  handler: (context: {
    command: string;
    phase: HookPhase;
    output?: string;
    exitCode?: number;
  }) => Promise<string | null | void>;
}

export interface PaletteAction {
  id: string;
  label: string;
  hint?: string;
  icon: string;
  category: string;
  onExecute: () => void;
}

export interface PluginRegistration extends PluginManifest {
  enabled: boolean;
  providers?: CustomAIProvider[];
  shortcuts?: ShortcutButton[];
  hooks?: CommandHook[];
  paletteActions?: PaletteAction[];
}

// ── Plugin Store ─────────────────────────────────────────────────────────────

const STORAGE_KEY = '@shelly/plugins';

type PluginState = {
  plugins: PluginRegistration[];
  loadPlugins: () => Promise<void>;

  // Registration
  registerPlugin: (plugin: PluginRegistration) => void;
  unregisterPlugin: (id: string) => void;
  enablePlugin: (id: string) => void;
  disablePlugin: (id: string) => void;

  // Queries
  getActiveProviders: () => CustomAIProvider[];
  getActiveShortcuts: () => ShortcutButton[];
  getActiveHooks: (phase: HookPhase, command: string) => CommandHook[];
  getActivePaletteActions: () => PaletteAction[];
};

export const usePluginStore = create<PluginState>((set, get) => ({
  plugins: [],

  loadPlugins: async () => {
    const json = await AsyncStorage.getItem(STORAGE_KEY);
    if (json) {
      try {
        // Only restore enabled/disabled state, not handlers
        const saved: Array<{ id: string; enabled: boolean }> = JSON.parse(json);
        set((state) => ({
          plugins: state.plugins.map((p) => {
            const savedState = saved.find((s) => s.id === p.id);
            return savedState ? { ...p, enabled: savedState.enabled } : p;
          }),
        }));
      } catch {}
    }
  },

  registerPlugin: (plugin) => {
    set((state) => ({
      plugins: [...state.plugins.filter((p) => p.id !== plugin.id), plugin],
    }));
    persistState(get);
  },

  unregisterPlugin: (id) => {
    set((state) => ({
      plugins: state.plugins.filter((p) => p.id !== id),
    }));
    persistState(get);
  },

  enablePlugin: (id) => {
    set((state) => ({
      plugins: state.plugins.map((p) => (p.id === id ? { ...p, enabled: true } : p)),
    }));
    persistState(get);
  },

  disablePlugin: (id) => {
    set((state) => ({
      plugins: state.plugins.map((p) => (p.id === id ? { ...p, enabled: false } : p)),
    }));
    persistState(get);
  },

  getActiveProviders: () => {
    return get()
      .plugins.filter((p) => p.enabled)
      .flatMap((p) => p.providers ?? []);
  },

  getActiveShortcuts: () => {
    return get()
      .plugins.filter((p) => p.enabled)
      .flatMap((p) => p.shortcuts ?? []);
  },

  getActiveHooks: (phase, command) => {
    return get()
      .plugins.filter((p) => p.enabled)
      .flatMap((p) => p.hooks ?? [])
      .filter((h) => {
        if (h.phase !== phase) return false;
        if (h.pattern === '*') return true;
        if (typeof h.pattern === 'string') return command.startsWith(h.pattern);
        return h.pattern.test(command);
      });
  },

  getActivePaletteActions: () => {
    return get()
      .plugins.filter((p) => p.enabled)
      .flatMap((p) => p.paletteActions ?? []);
  },
}));

function persistState(get: () => PluginState) {
  const data = get().plugins.map((p) => ({ id: p.id, enabled: p.enabled }));
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

// ── Hook Execution Helpers ───────────────────────────────────────────────────

/**
 * Run pre-hooks for a command. Returns modified command or null if cancelled.
 */
export async function runPreHooks(command: string): Promise<string | null> {
  const hooks = usePluginStore.getState().getActiveHooks('pre', command);
  let cmd: string | null = command;

  for (const hook of hooks) {
    const result = await hook.handler({ command: cmd!, phase: 'pre' });
    if (result === null) return null; // Cancelled
    if (typeof result === 'string') cmd = result; // Modified
  }

  return cmd;
}

/**
 * Run post-hooks after command execution.
 */
export async function runPostHooks(
  command: string,
  output: string,
  exitCode: number,
): Promise<void> {
  const hooks = usePluginStore.getState().getActiveHooks('post', command);

  for (const hook of hooks) {
    await hook.handler({ command, phase: 'post', output, exitCode });
  }
}

// ── Built-in Plugin Examples ─────────────────────────────────────────────────

/**
 * Example: Register an OpenAI-compatible provider.
 * Usage:
 *   registerOpenAIProvider({
 *     id: 'openai',
 *     name: 'OpenAI GPT-4',
 *     mentionTrigger: '@gpt',
 *     apiKey: 'sk-...',
 *     model: 'gpt-4o',
 *     baseUrl: 'https://api.openai.com/v1',
 *   });
 */
export function createOpenAIProvider(config: {
  id: string;
  name: string;
  mentionTrigger: string;
  apiKey: string;
  model: string;
  baseUrl?: string;
  color?: string;
  icon?: string;
}): CustomAIProvider {
  const baseUrl = config.baseUrl || 'https://api.openai.com/v1';

  return {
    id: config.id,
    name: config.name,
    mentionTrigger: config.mentionTrigger,
    color: config.color || '#74AA9C',
    icon: config.icon || 'smart-toy',
    handler: async (prompt, options) => {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages: [
            ...(options?.systemPrompt
              ? [{ role: 'system', content: options.systemPrompt }]
              : []),
            { role: 'user', content: prompt },
          ],
          temperature: options?.temperature ?? 0.7,
          max_tokens: options?.maxTokens ?? 4096,
        }),
      });
      const data = await res.json();
      return data.choices?.[0]?.message?.content ?? 'No response';
    },
  };
}
