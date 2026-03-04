/**
 * Parse unified diff output into structured data for rendering.
 */

export type DiffLineType = 'added' | 'removed' | 'context' | 'header' | 'hunk';

export type DiffLine = {
  text: string;
  type: DiffLineType;
  lineNum?: number;
};

export type DiffFile = {
  filename: string;
  lines: DiffLine[];
  additions: number;
  deletions: number;
};

/**
 * Check if output text looks like a git diff.
 */
export function isDiffOutput(command: string, output: string): boolean {
  if (command.includes('diff')) return true;
  // Heuristic: contains diff markers
  return output.includes('--- a/') && output.includes('+++ b/');
}

/**
 * Parse unified diff text into structured DiffFile array.
 */
export function parseDiff(text: string): DiffFile[] {
  const lines = text.split('\n');
  const files: DiffFile[] = [];
  let current: DiffFile | null = null;

  for (const line of lines) {
    // File header: diff --git a/file b/file
    if (line.startsWith('diff --git')) {
      const match = line.match(/b\/(.+)$/);
      current = {
        filename: match?.[1] ?? 'unknown',
        lines: [{ text: line, type: 'header' }],
        additions: 0,
        deletions: 0,
      };
      files.push(current);
      continue;
    }

    if (!current) {
      // Before first diff marker — header/metadata
      if (line.startsWith('---') || line.startsWith('+++') || line.startsWith('index ')) {
        // Create implicit file
        current = {
          filename: line.replace(/^[+-]{3}\s+[ab]\//, '').replace(/^[+-]{3}\s+/, '') || 'diff',
          lines: [{ text: line, type: 'header' }],
          additions: 0,
          deletions: 0,
        };
        files.push(current);
      }
      continue;
    }

    // --- a/file, +++ b/file
    if (line.startsWith('---') || line.startsWith('+++') || line.startsWith('index ')) {
      current.lines.push({ text: line, type: 'header' });
      continue;
    }

    // Hunk header: @@ -1,5 +1,7 @@
    if (line.startsWith('@@')) {
      current.lines.push({ text: line, type: 'hunk' });
      continue;
    }

    // Added line
    if (line.startsWith('+')) {
      current.lines.push({ text: line, type: 'added' });
      current.additions++;
      continue;
    }

    // Removed line
    if (line.startsWith('-')) {
      current.lines.push({ text: line, type: 'removed' });
      current.deletions++;
      continue;
    }

    // Context line
    current.lines.push({ text: line, type: 'context' });
  }

  return files;
}
