/**
 * lib/package-manager.ts — Termux Package Manager abstraction
 *
 * Wraps `pkg` commands via the Termux WebSocket bridge.
 * Provides structured data for the Package Manager UI.
 */
import { create } from 'zustand';

// ── Types ────────────────────────────────────────────────────────────────────

export interface PackageInfo {
  name: string;
  version: string;
  description: string;
  installed: boolean;
  upgradable: boolean;
  size?: string;
  depends?: string[];
}

export type PackageFilter = 'all' | 'installed' | 'upgradable';

export type PackageCategory = {
  name: string;
  icon: string;
  packages: string[];
};

// ── Popular categories for quick browsing ────────────────────────────────────

export const PACKAGE_CATEGORIES: PackageCategory[] = [
  {
    name: 'Development',
    icon: 'code',
    packages: ['nodejs', 'python', 'ruby', 'golang', 'rust', 'clang', 'make', 'cmake', 'git'],
  },
  {
    name: 'Editors',
    icon: 'edit',
    packages: ['vim', 'neovim', 'nano', 'emacs', 'micro', 'helix'],
  },
  {
    name: 'Network',
    icon: 'wifi',
    packages: ['openssh', 'curl', 'wget', 'nmap', 'netcat-openbsd', 'iproute2'],
  },
  {
    name: 'Shell',
    icon: 'terminal',
    packages: ['zsh', 'fish', 'tmux', 'screen', 'fzf', 'ripgrep', 'fd', 'bat', 'exa'],
  },
  {
    name: 'AI/ML',
    icon: 'smart-toy',
    packages: ['python', 'numpy', 'scipy', 'cmake', 'clang'],
  },
  {
    name: 'Files',
    icon: 'folder',
    packages: ['zip', 'unzip', 'tar', 'gzip', 'p7zip', 'tree', 'ncdu'],
  },
];

// ── Store ────────────────────────────────────────────────────────────────────

type PkgState = {
  packages: PackageInfo[];
  filter: PackageFilter;
  searchQuery: string;
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  /** Active operation (installing/removing) */
  activeOp: { name: string; action: string } | null;

  setFilter: (filter: PackageFilter) => void;
  setSearch: (query: string) => void;
  setPackages: (pkgs: PackageInfo[]) => void;
  setLoading: (loading: boolean) => void;
  setRefreshing: (refreshing: boolean) => void;
  setError: (error: string | null) => void;
  setActiveOp: (op: { name: string; action: string } | null) => void;

  getFiltered: () => PackageInfo[];
};

export const usePackageStore = create<PkgState>((set, get) => ({
  packages: [],
  filter: 'installed',
  searchQuery: '',
  isLoading: false,
  isRefreshing: false,
  error: null,
  activeOp: null,

  setFilter: (filter) => set({ filter }),
  setSearch: (searchQuery) => set({ searchQuery }),
  setPackages: (packages) => set({ packages }),
  setLoading: (isLoading) => set({ isLoading }),
  setRefreshing: (isRefreshing) => set({ isRefreshing }),
  setError: (error) => set({ error }),
  setActiveOp: (activeOp) => set({ activeOp }),

  getFiltered: () => {
    const { packages, filter, searchQuery } = get();
    let list = packages;

    // Filter by status
    switch (filter) {
      case 'installed':
        list = list.filter((p) => p.installed);
        break;
      case 'upgradable':
        list = list.filter((p) => p.upgradable);
        break;
    }

    // Filter by search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q),
      );
    }

    return list.sort((a, b) => a.name.localeCompare(b.name));
  },
}));

// ── Command Builders ─────────────────────────────────────────────────────────

/**
 * Build command to list installed packages.
 */
export function buildListInstalledCmd(): string {
  return 'dpkg-query -W -f \'${Package}\\t${Version}\\t${Description}\\n\' 2>/dev/null';
}

/**
 * Build command to list all available packages.
 */
export function buildListAvailableCmd(): string {
  return 'apt list 2>/dev/null | tail -n +2';
}

/**
 * Build command to list upgradable packages.
 */
export function buildListUpgradableCmd(): string {
  return 'apt list --upgradable 2>/dev/null | tail -n +2';
}

/**
 * Build install command.
 */
export function buildInstallCmd(name: string): string {
  return `pkg install -y ${name}`;
}

/**
 * Build remove command.
 */
export function buildRemoveCmd(name: string): string {
  return `pkg uninstall -y ${name}`;
}

/**
 * Build upgrade command.
 */
export function buildUpgradeCmd(name?: string): string {
  return name ? `pkg upgrade -y ${name}` : 'pkg upgrade -y';
}

/**
 * Build search command.
 */
export function buildSearchCmd(query: string): string {
  return `pkg search ${query} 2>/dev/null`;
}

/**
 * Build repo update command.
 */
export function buildUpdateCmd(): string {
  return 'pkg update -y 2>/dev/null';
}

// ── Output Parsers ───────────────────────────────────────────────────────────

/**
 * Parse `dpkg-query -W` output into PackageInfo array.
 */
export function parseInstalledOutput(output: string): PackageInfo[] {
  return output
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => {
      const parts = line.split('\t');
      return {
        name: parts[0] || '',
        version: parts[1] || '',
        description: parts[2] || '',
        installed: true,
        upgradable: false,
      };
    })
    .filter((p) => p.name);
}

/**
 * Parse `apt list` output.
 */
export function parseAptListOutput(output: string, installedNames: Set<string>): PackageInfo[] {
  return output
    .split('\n')
    .filter((line) => line.trim() && !line.startsWith('Listing'))
    .map((line) => {
      // Format: package/stable version arch [installed]
      const match = line.match(/^([^/]+)\/\S+\s+(\S+)\s+\S+(?:\s+\[(.*?)\])?/);
      if (!match) return null;
      const name = match[1];
      const version = match[2];
      const status = match[3] || '';
      return {
        name,
        version,
        description: '',
        installed: installedNames.has(name) || status.includes('installed'),
        upgradable: status.includes('upgradable'),
      };
    })
    .filter(Boolean) as PackageInfo[];
}

/**
 * Parse `pkg search` output.
 */
export function parseSearchOutput(output: string): PackageInfo[] {
  return output
    .split('\n')
    .filter((line) => line.trim() && !line.startsWith('Sorting'))
    .map((line) => {
      // Format: package/stable version arch
      // Or: package - description
      const slashMatch = line.match(/^([^/]+)\/\S+\s+(\S+)/);
      if (slashMatch) {
        return {
          name: slashMatch[1],
          version: slashMatch[2],
          description: '',
          installed: false,
          upgradable: false,
        };
      }
      const dashMatch = line.match(/^(\S+)\s+-\s+(.+)/);
      if (dashMatch) {
        return {
          name: dashMatch[1],
          version: '',
          description: dashMatch[2],
          installed: false,
          upgradable: false,
        };
      }
      return null;
    })
    .filter(Boolean) as PackageInfo[];
}
