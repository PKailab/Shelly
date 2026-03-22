/**
 * Auto Savepoint — Git operations for game-like auto-save.
 * Users never see git terminology. All commands run via bridge.
 */

type RunCommandFn = (cmd: string) => Promise<{ stdout: string; exitCode: number }>;

/** Shell-escape a string for safe use in single-quoted arguments */
function shellEscape(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

export type SaveResult = {
  commitHash: string;
  message: string;
  filesChanged: number;
  filesCreated: number;
  filesDeleted: number;
};

const DEFAULT_GITIGNORE = `node_modules/
.expo/
*.log
.env
.env.*
*.key
*.pem
*.p12
*.jks
*.keystore
credentials.json
service-account*.json
dist/
build/
.DS_Store
`;

/** Check if directory has git repo, init if not */
export async function initGitIfNeeded(
  projectDir: string,
  runCommand: RunCommandFn,
): Promise<void> {
  const dir = shellEscape(projectDir);
  const { exitCode } = await runCommand(`git -C ${dir} rev-parse --git-dir`);
  if (exitCode !== 0) {
    await runCommand(`git -C ${dir} init`);
    const { exitCode: igExists } = await runCommand(`test -f ${dir}/.gitignore`);
    if (igExists !== 0) {
      const escaped = DEFAULT_GITIGNORE.replace(/'/g, "'\\''");
      await runCommand(`printf '%s' '${escaped}' > ${dir}/.gitignore`);
    }
    await runCommand(`git -C ${dir} add -A`);
    await runCommand(`git -C ${dir} commit -m "Auto: Initial savepoint" --allow-empty`);
  }
}

/** Check for uncommitted changes and commit if any */
export async function checkAndSave(
  projectDir: string,
  runCommand: RunCommandFn,
): Promise<SaveResult | null> {
  const dir = shellEscape(projectDir);
  const { stdout: status } = await runCommand(`git -C ${dir} status --porcelain`);
  if (!status.trim()) return null;

  const message = generateCommitMessage(status);

  await runCommand(`git -C ${dir} add -A`);
  const { exitCode } = await runCommand(
    `git -C ${dir} commit -m "${message.replace(/"/g, '\\"')}"`,
  );
  if (exitCode !== 0) return null;

  const { stdout: hash } = await runCommand(`git -C ${dir} rev-parse --short HEAD`);

  const lines = status.trim().split('\n').filter(Boolean);
  const created = lines.filter((l) => l.startsWith('?') || l.startsWith('A')).length;
  const deleted = lines.filter((l) => l.startsWith('D')).length;
  const modified = lines.length - created - deleted;

  return {
    commitHash: hash.trim(),
    message,
    filesChanged: modified,
    filesCreated: created,
    filesDeleted: deleted,
  };
}

/** Generate human-readable commit message from git status --porcelain */
export function generateCommitMessage(status: string): string {
  const lines = status.trim().split('\n').filter(Boolean);
  const created: string[] = [];
  const modified: string[] = [];
  const deleted: string[] = [];

  for (const line of lines) {
    const code = line.slice(0, 2).trim();
    const file = line.slice(3).trim();
    const name = file.split('/').pop() ?? file;
    if (code === '??' || code === 'A') created.push(name);
    else if (code === 'D') deleted.push(name);
    else modified.push(name);
  }

  if (created.length && !modified.length && !deleted.length) {
    return created.length === 1
      ? `Auto: Created ${created[0]}`
      : `Auto: Created ${created.length} files`;
  }
  if (modified.length && !created.length && !deleted.length) {
    return modified.length === 1
      ? `Auto: Updated ${modified[0]}`
      : `Auto: Updated ${modified.length} files`;
  }
  if (deleted.length && !created.length && !modified.length) {
    return deleted.length === 1
      ? `Auto: Removed ${deleted[0]}`
      : `Auto: Removed ${deleted.length} files`;
  }

  const parts: string[] = [];
  if (modified.length) parts.push(`modified ${modified.length}`);
  if (created.length) parts.push(`created ${created.length}`);
  if (deleted.length) parts.push(`removed ${deleted.length}`);
  return `Auto: ${parts.join(', ')} files`;
}

/** Revert the last commit */
export async function revertLastSavepoint(
  projectDir: string,
  runCommand: RunCommandFn,
): Promise<boolean> {
  const dir = shellEscape(projectDir);
  const { exitCode } = await runCommand(`git -C ${dir} revert HEAD --no-edit`);
  if (exitCode !== 0) {
    await runCommand(`git -C ${dir} revert --abort`);
    return false;
  }
  return true;
}

/** Get diff of last commit for "view changes" */
export async function getLastDiff(
  projectDir: string,
  runCommand: RunCommandFn,
): Promise<string> {
  const dir = shellEscape(projectDir);
  const { stdout } = await runCommand(`git -C ${dir} diff HEAD~1 HEAD`);
  return stdout;
}

/** Detect if a command likely modifies files */
export function isFileChangingCommand(command: string): boolean {
  const cmd = command.trim().split(/\s+/)[0];
  const changingCommands = [
    'npm', 'npx', 'pnpm', 'yarn', 'bun',
    'touch', 'mkdir', 'cp', 'mv', 'rm',
    'sed', 'awk',
    'vi', 'vim', 'nano', 'code',
    'pip', 'pip3', 'python', 'node',
    'make', 'cmake', 'cargo', 'go',
    'wget', 'curl',
    'tar', 'unzip', 'gzip',
    'chmod', 'chown',
  ];
  if (command.includes('>') || command.includes('>>')) return true;
  return changingCommands.includes(cmd);
}
