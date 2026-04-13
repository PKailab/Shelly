// store/ports-store.ts
//
// Active localhost ports poller. Runs a `ss -tlnp` scan every 20s and
// exposes the result as a Zustand store so the Sidebar Ports section
// can render one row per listener and tap-to-open a browser pane.
//
// We keep a single writer (Sidebar kicks off the poller once, same
// pattern as git-status-store) so the badge/list stays consistent
// without multiple components racing each other.

import { create } from 'zustand';

export type PortEntry = {
  port: number;
  /** Process label extracted from ss output, or '' if unknown. */
  name: string;
};

type PortsState = {
  entries: PortEntry[];
  setEntries: (entries: PortEntry[]) => void;
};

export const usePortsStore = create<PortsState>((set) => ({
  entries: [],
  setEntries: (entries) => set({ entries }),
}));

// ── Parser ──────────────────────────────────────────────────────────
// Parses `ss -tlnp` output. Example lines (header + data):
//
//   State  Recv-Q Send-Q Local Address:Port  Peer Address:Port Process
//   LISTEN 0      511          0.0.0.0:3000        0.0.0.0:*    users:(("node",pid=1234,fd=20))
//   LISTEN 0      4096       127.0.0.1:8081        0.0.0.0:*    users:(("expo",pid=1235,fd=20))
//
// We only care about IPv4/IPv6 LISTEN rows with a numeric port and,
// if possible, the inner process name from users:(("<name>"...)).
// Duplicate ports are collapsed because 0.0.0.0 and :: often appear
// for the same listener.
export function parseSsOutput(raw: string): PortEntry[] {
  if (!raw) return [];
  const byPort = new Map<number, string>();

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith('LISTEN')) continue;

    // Local address is the 4th whitespace-separated column. Port is
    // after the last ':' in that column (handles IPv6 like [::]:3000).
    const cols = trimmed.split(/\s+/);
    if (cols.length < 4) continue;
    const local = cols[3];
    const colonIdx = local.lastIndexOf(':');
    if (colonIdx === -1) continue;
    const portStr = local.slice(colonIdx + 1);
    const port = parseInt(portStr, 10);
    if (!Number.isFinite(port) || port <= 0) continue;

    // Only surface loopback / wildcard listeners. The user won't see
    // anything useful by opening a remote bind.
    const addr = local.slice(0, colonIdx);
    if (addr !== '0.0.0.0' && addr !== '*' && addr !== '[::]' && addr !== '127.0.0.1' && addr !== '[::1]') {
      continue;
    }

    // Process name from users:(("<name>",pid=...)) — optional.
    let name = '';
    const proc = trimmed.match(/users:\(\("([^"]+)"/);
    if (proc) name = proc[1];

    const existing = byPort.get(port);
    if (!existing || (!existing && name)) {
      byPort.set(port, name);
    } else if (existing === '' && name) {
      byPort.set(port, name);
    }
  }

  return [...byPort.entries()]
    .map(([port, name]) => ({ port, name }))
    .sort((a, b) => a.port - b.port);
}

// ── Well-known port → friendly label ────────────────────────────────
// Falls back to the process name from ss output, then to the numeric
// port if neither is known.
const WELL_KNOWN: Record<number, string> = {
  80:    'HTTP',
  443:   'HTTPS',
  3000:  'NEXT.JS',
  3001:  'DEV',
  4000:  'DEV',
  4200:  'ANGULAR',
  5000:  'FLASK',
  5173:  'VITE',
  5174:  'VITE',
  6006:  'STORYBOOK',
  8000:  'DEV',
  8080:  'HTTP',
  8081:  'EXPO',
  8787:  'WRANGLER',
  8888:  'JUPYTER',
  19000: 'EXPO',
  19001: 'EXPO',
  19002: 'EXPO',
};

export function portLabel(entry: PortEntry): string {
  const well = WELL_KNOWN[entry.port];
  if (well) return well;
  if (entry.name) return entry.name.toUpperCase();
  return '';
}
