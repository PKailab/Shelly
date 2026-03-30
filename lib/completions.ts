/**
 * Static command completion database for Smart Autocomplete.
 * Covers common CLI tools used in Termux/Linux development.
 */

type CompletionEntry = {
  label: string;
  detail?: string;
  insertText: string;
};

// ── Top-level commands ─────────────────────────────────────────────────────────

const TOP_COMMANDS: CompletionEntry[] = [
  { label: 'git', detail: 'Version control', insertText: 'git ' },
  { label: 'npm', detail: 'Node package manager', insertText: 'npm ' },
  { label: 'npx', detail: 'Node package executor', insertText: 'npx ' },
  { label: 'pnpm', detail: 'Fast package manager', insertText: 'pnpm ' },
  { label: 'node', detail: 'Run JavaScript', insertText: 'node ' },
  { label: 'python3', detail: 'Python interpreter', insertText: 'python3 ' },
  { label: 'pip', detail: 'Python packages', insertText: 'pip ' },
  { label: 'cargo', detail: 'Rust package manager', insertText: 'cargo ' },
  { label: 'docker', detail: 'Container platform', insertText: 'docker ' },
  { label: 'ls', detail: 'List directory', insertText: 'ls ' },
  { label: 'cd', detail: 'Change directory', insertText: 'cd ' },
  { label: 'cat', detail: 'Display file', insertText: 'cat ' },
  { label: 'grep', detail: 'Search text', insertText: 'grep ' },
  { label: 'find', detail: 'Find files', insertText: 'find ' },
  { label: 'mkdir', detail: 'Create directory', insertText: 'mkdir ' },
  { label: 'rm', detail: 'Remove files', insertText: 'rm ' },
  { label: 'cp', detail: 'Copy files', insertText: 'cp ' },
  { label: 'mv', detail: 'Move/rename', insertText: 'mv ' },
  { label: 'chmod', detail: 'Change permissions', insertText: 'chmod ' },
  { label: 'curl', detail: 'HTTP client', insertText: 'curl ' },
  { label: 'wget', detail: 'Download files', insertText: 'wget ' },
  { label: 'ssh', detail: 'Secure shell', insertText: 'ssh ' },
  { label: 'tar', detail: 'Archive tool', insertText: 'tar ' },
  { label: 'pkg', detail: 'Termux packages', insertText: 'pkg ' },
  { label: 'apt', detail: 'Package manager', insertText: 'apt ' },
  { label: 'tmux', detail: 'Terminal multiplexer', insertText: 'tmux ' },
  { label: 'vim', detail: 'Text editor', insertText: 'vim ' },
  { label: 'nano', detail: 'Text editor', insertText: 'nano ' },
  { label: 'htop', detail: 'Process viewer', insertText: 'htop' },
  { label: 'clear', detail: 'Clear terminal', insertText: 'clear' },
  { label: 'echo', detail: 'Print text', insertText: 'echo ' },
  { label: 'export', detail: 'Set env variable', insertText: 'export ' },
  { label: 'which', detail: 'Locate command', insertText: 'which ' },
  { label: 'man', detail: 'Manual pages', insertText: 'man ' },
];

// ── Subcommand completions ─────────────────────────────────────────────────────

const SUBCOMMANDS: Record<string, CompletionEntry[]> = {
  git: [
    { label: 'status', detail: 'Show status', insertText: 'status' },
    { label: 'add', detail: 'Stage files', insertText: 'add ' },
    { label: 'commit', detail: 'Create commit', insertText: 'commit ' },
    { label: 'push', detail: 'Push to remote', insertText: 'push ' },
    { label: 'pull', detail: 'Pull from remote', insertText: 'pull ' },
    { label: 'checkout', detail: 'Switch branch', insertText: 'checkout ' },
    { label: 'branch', detail: 'Manage branches', insertText: 'branch ' },
    { label: 'merge', detail: 'Merge branches', insertText: 'merge ' },
    { label: 'rebase', detail: 'Rebase commits', insertText: 'rebase ' },
    { label: 'log', detail: 'View history', insertText: 'log ' },
    { label: 'diff', detail: 'Show changes', insertText: 'diff ' },
    { label: 'stash', detail: 'Stash changes', insertText: 'stash ' },
    { label: 'clone', detail: 'Clone repository', insertText: 'clone ' },
    { label: 'init', detail: 'Initialize repo', insertText: 'init' },
    { label: 'remote', detail: 'Manage remotes', insertText: 'remote ' },
    { label: 'fetch', detail: 'Fetch from remote', insertText: 'fetch ' },
    { label: 'reset', detail: 'Reset changes', insertText: 'reset ' },
    { label: 'tag', detail: 'Manage tags', insertText: 'tag ' },
    { label: 'cherry-pick', detail: 'Apply commit', insertText: 'cherry-pick ' },
  ],
  npm: [
    { label: 'install', detail: 'Install packages', insertText: 'install ' },
    { label: 'run', detail: 'Run script', insertText: 'run ' },
    { label: 'start', detail: 'Start project', insertText: 'start' },
    { label: 'test', detail: 'Run tests', insertText: 'test' },
    { label: 'build', detail: 'Build project', insertText: 'build' },
    { label: 'init', detail: 'Initialize package', insertText: 'init' },
    { label: 'publish', detail: 'Publish package', insertText: 'publish' },
    { label: 'uninstall', detail: 'Remove package', insertText: 'uninstall ' },
    { label: 'update', detail: 'Update packages', insertText: 'update ' },
    { label: 'list', detail: 'List packages', insertText: 'list' },
    { label: 'outdated', detail: 'Check outdated', insertText: 'outdated' },
    { label: 'audit', detail: 'Security audit', insertText: 'audit' },
  ],
  docker: [
    { label: 'build', detail: 'Build image', insertText: 'build ' },
    { label: 'run', detail: 'Run container', insertText: 'run ' },
    { label: 'ps', detail: 'List containers', insertText: 'ps' },
    { label: 'images', detail: 'List images', insertText: 'images' },
    { label: 'pull', detail: 'Pull image', insertText: 'pull ' },
    { label: 'push', detail: 'Push image', insertText: 'push ' },
    { label: 'stop', detail: 'Stop container', insertText: 'stop ' },
    { label: 'rm', detail: 'Remove container', insertText: 'rm ' },
    { label: 'rmi', detail: 'Remove image', insertText: 'rmi ' },
    { label: 'exec', detail: 'Execute in container', insertText: 'exec ' },
    { label: 'logs', detail: 'View logs', insertText: 'logs ' },
    { label: 'compose', detail: 'Docker Compose', insertText: 'compose ' },
  ],
  cargo: [
    { label: 'build', detail: 'Compile project', insertText: 'build' },
    { label: 'run', detail: 'Build & run', insertText: 'run' },
    { label: 'test', detail: 'Run tests', insertText: 'test' },
    { label: 'check', detail: 'Check errors', insertText: 'check' },
    { label: 'new', detail: 'Create project', insertText: 'new ' },
    { label: 'add', detail: 'Add dependency', insertText: 'add ' },
    { label: 'fmt', detail: 'Format code', insertText: 'fmt' },
    { label: 'clippy', detail: 'Lint code', insertText: 'clippy' },
  ],
  pkg: [
    { label: 'install', detail: 'Install package', insertText: 'install ' },
    { label: 'uninstall', detail: 'Remove package', insertText: 'uninstall ' },
    { label: 'update', detail: 'Update packages', insertText: 'update' },
    { label: 'upgrade', detail: 'Upgrade packages', insertText: 'upgrade' },
    { label: 'search', detail: 'Search packages', insertText: 'search ' },
    { label: 'list-installed', detail: 'List installed', insertText: 'list-installed' },
  ],
  tmux: [
    { label: 'new-session', detail: 'Create session', insertText: 'new-session -s ' },
    { label: 'attach', detail: 'Attach to session', insertText: 'attach -t ' },
    { label: 'ls', detail: 'List sessions', insertText: 'ls' },
    { label: 'kill-session', detail: 'Kill session', insertText: 'kill-session -t ' },
    { label: 'detach', detail: 'Detach session', insertText: 'detach' },
  ],
  pnpm: [
    { label: 'install', detail: 'Install packages', insertText: 'install ' },
    { label: 'add', detail: 'Add dependency', insertText: 'add ' },
    { label: 'remove', detail: 'Remove package', insertText: 'remove ' },
    { label: 'run', detail: 'Run script', insertText: 'run ' },
    { label: 'dev', detail: 'Start dev server', insertText: 'dev' },
    { label: 'build', detail: 'Build project', insertText: 'build' },
    { label: 'test', detail: 'Run tests', insertText: 'test' },
    { label: 'dlx', detail: 'Execute package', insertText: 'dlx ' },
    { label: 'update', detail: 'Update packages', insertText: 'update' },
    { label: 'store', detail: 'Manage store', insertText: 'store ' },
  ],
  python3: [
    { label: '-m', detail: 'Run module', insertText: '-m ' },
    { label: '-c', detail: 'Run code', insertText: '-c "' },
    { label: '-i', detail: 'Interactive', insertText: '-i ' },
    { label: '--version', detail: 'Show version', insertText: '--version' },
  ],
  pip: [
    { label: 'install', detail: 'Install package', insertText: 'install ' },
    { label: 'uninstall', detail: 'Remove package', insertText: 'uninstall ' },
    { label: 'list', detail: 'List installed', insertText: 'list' },
    { label: 'freeze', detail: 'Output requirements', insertText: 'freeze' },
    { label: 'show', detail: 'Package info', insertText: 'show ' },
    { label: 'search', detail: 'Search PyPI', insertText: 'search ' },
  ],
  apt: [
    { label: 'install', detail: 'Install package', insertText: 'install ' },
    { label: 'remove', detail: 'Remove package', insertText: 'remove ' },
    { label: 'update', detail: 'Update list', insertText: 'update' },
    { label: 'upgrade', detail: 'Upgrade packages', insertText: 'upgrade' },
    { label: 'search', detail: 'Search packages', insertText: 'search ' },
    { label: 'list', detail: 'List packages', insertText: 'list --installed' },
    { label: 'autoremove', detail: 'Remove unused', insertText: 'autoremove' },
  ],
};

// ── Flag completions ───────────────────────────────────────────────────────────

const FLAGS: Record<string, CompletionEntry[]> = {
  'git commit': [
    { label: '-m', detail: 'Commit message', insertText: '-m "' },
    { label: '-a', detail: 'Stage all modified', insertText: '-a ' },
    { label: '--amend', detail: 'Amend last commit', insertText: '--amend ' },
    { label: '--no-edit', detail: 'Keep message', insertText: '--no-edit' },
  ],
  'git log': [
    { label: '--oneline', detail: 'Single line', insertText: '--oneline' },
    { label: '-n', detail: 'Limit count', insertText: '-n ' },
    { label: '--graph', detail: 'ASCII graph', insertText: '--graph' },
    { label: '--all', detail: 'All branches', insertText: '--all' },
  ],
  'git add': [
    { label: '.', detail: 'All files', insertText: '.' },
    { label: '-p', detail: 'Patch mode', insertText: '-p' },
    { label: '-A', detail: 'All changes', insertText: '-A' },
  ],
  'npm install': [
    { label: '--save-dev', detail: 'Dev dependency', insertText: '--save-dev ' },
    { label: '-g', detail: 'Global install', insertText: '-g ' },
    { label: '--force', detail: 'Force install', insertText: '--force' },
  ],
  'ls': [
    { label: '-la', detail: 'Long + hidden', insertText: '-la' },
    { label: '-lh', detail: 'Human readable', insertText: '-lh' },
    { label: '-R', detail: 'Recursive', insertText: '-R' },
  ],
  'grep': [
    { label: '-r', detail: 'Recursive', insertText: '-r ' },
    { label: '-i', detail: 'Case insensitive', insertText: '-i ' },
    { label: '-n', detail: 'Line numbers', insertText: '-n ' },
    { label: '-l', detail: 'Files only', insertText: '-l ' },
    { label: '--include', detail: 'File pattern', insertText: '--include=' },
  ],
  'curl': [
    { label: '-X', detail: 'HTTP method', insertText: '-X ' },
    { label: '-H', detail: 'Add header', insertText: '-H "' },
    { label: '-d', detail: 'POST data', insertText: '-d \'' },
    { label: '-o', detail: 'Output file', insertText: '-o ' },
    { label: '-s', detail: 'Silent mode', insertText: '-s ' },
    { label: '-v', detail: 'Verbose', insertText: '-v ' },
  ],
};

/**
 * Get completions for the current input.
 * Returns up to `limit` suggestions.
 */
export function getCompletions(input: string, limit = 8): CompletionEntry[] {
  const trimmed = input.trimStart();
  if (!trimmed) return [];

  const parts = trimmed.split(/\s+/);

  // Single word → match top-level commands
  if (parts.length === 1) {
    const prefix = parts[0].toLowerCase();
    return TOP_COMMANDS.filter((c) =>
      c.label.startsWith(prefix) && c.label !== prefix,
    ).slice(0, limit);
  }

  // Two words → match subcommands
  const cmd = parts[0].toLowerCase();
  if (parts.length === 2 && SUBCOMMANDS[cmd]) {
    const prefix = parts[1].toLowerCase();
    return SUBCOMMANDS[cmd]
      .filter((s) => s.label.startsWith(prefix) && s.label !== prefix)
      .slice(0, limit);
  }

  // Check for flag completions
  const lastPart = parts[parts.length - 1];
  if (lastPart.startsWith('-')) {
    // Try "cmd subcmd" first, then just "cmd"
    const fullKey = parts.slice(0, 2).join(' ');
    const flagList = FLAGS[fullKey] ?? FLAGS[cmd];
    if (flagList) {
      return flagList
        .filter((f) => f.label.startsWith(lastPart) && f.label !== lastPart)
        .slice(0, limit);
    }
  }

  // Subcommand completion when cursor is at empty 2nd position
  if (parts.length === 2 && parts[1] === '' && SUBCOMMANDS[cmd]) {
    return SUBCOMMANDS[cmd].slice(0, limit);
  }

  return [];
}
