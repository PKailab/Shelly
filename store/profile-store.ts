// store/profile-store.ts
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { execCommand } from '@/hooks/use-native-exec';

export type SSHProfile = {
  id: string;
  name: string;
  host: string;
  port: number;
  user: string;
  keyFile?: string;
  jumpHost?: string;
};

const STORAGE_KEY = 'shelly_ssh_profiles';

interface ProfileState {
  profiles: SSHProfile[];
  addProfile: (p: SSHProfile) => void;
  removeProfile: (id: string) => void;
  updateProfile: (id: string, partial: Partial<SSHProfile>) => void;
  loadProfiles: () => Promise<void>;
  importFromSSHConfig: () => Promise<number>;
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  profiles: [],

  addProfile: (p) => {
    set((s) => ({ profiles: [...s.profiles, p] }));
    // Persist async — fire and forget
    const updated = [...get().profiles];
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
  },

  removeProfile: (id) => {
    set((s) => ({ profiles: s.profiles.filter((p) => p.id !== id) }));
    const updated = get().profiles;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
  },

  updateProfile: (id, partial) => {
    set((s) => ({
      profiles: s.profiles.map((p) => (p.id === id ? { ...p, ...partial } : p)),
    }));
    const updated = get().profiles;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
  },

  loadProfiles: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: SSHProfile[] = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          set({ profiles: parsed });
        }
      }
    } catch {
      // Silent — store stays empty
    }
  },

  importFromSSHConfig: async () => {
    try {
      const result = await execCommand('cat ~/.ssh/config 2>/dev/null', 10_000);
      if (result.exitCode !== 0 || !result.stdout.trim()) return 0;

      const lines = result.stdout.split('\n');

      // State machine: accumulate one block per "Host <alias>" stanza
      const parsed: Omit<SSHProfile, 'id'>[] = [];
      let current: Partial<Omit<SSHProfile, 'id'>> | null = null;

      function flushCurrent() {
        if (current && current.name && current.host) {
          parsed.push({
            name: current.name,
            host: current.host,
            port: current.port ?? 22,
            user: current.user ?? '',
            keyFile: current.keyFile,
            jumpHost: current.jumpHost,
          });
        }
        current = null;
      }

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;

        const [key, ...rest] = line.split(/\s+/);
        const value = rest.join(' ').trim();
        const lkey = key.toLowerCase();

        if (lkey === 'host') {
          flushCurrent();
          // Skip wildcard patterns
          if (!value.includes('*') && !value.includes('?')) {
            current = { name: value };
          }
        } else if (current) {
          if (lkey === 'hostname') current.host = value;
          else if (lkey === 'port') current.port = parseInt(value, 10) || 22;
          else if (lkey === 'user') current.user = value;
          else if (lkey === 'identityfile') current.keyFile = value;
          else if (lkey === 'proxyjump') current.jumpHost = value;
        }
      }
      flushCurrent();

      if (parsed.length === 0) return 0;

      const existing = get().profiles;
      const existingNames = new Set(existing.map((p) => p.name));
      const newProfiles = parsed
        .filter((p) => !existingNames.has(p.name))
        .map((p) => ({ ...p, id: `ssh-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }));

      if (newProfiles.length === 0) return 0;

      const merged = [...existing, ...newProfiles];
      set({ profiles: merged });
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      return newProfiles.length;
    } catch {
      return 0;
    }
  },
}));
