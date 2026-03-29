/**
 * lib/preview-file-detector.ts — File scanning and type detection for preview
 */

// --- Shell Escape ---------------------------------------------------------------

export function shellEscape(path: string): string {
  return "'" + path.replace(/'/g, "'\\''") + "'";
}

// --- File Type Detection --------------------------------------------------------

export type PreviewFileType =
  | 'html' | 'markdown' | 'image' | 'code' | 'json' | 'pdf' | 'csv' | 'plaintext' | 'binary';

const EXTENSION_MAP: Record<string, PreviewFileType> = {
  // HTML
  '.html': 'html', '.htm': 'html',
  // Markdown
  '.md': 'markdown', '.markdown': 'markdown', '.mdx': 'markdown',
  // Images
  '.png': 'image', '.jpg': 'image', '.jpeg': 'image', '.gif': 'image',
  '.svg': 'image', '.webp': 'image', '.bmp': 'image',
  // Code
  '.ts': 'code', '.tsx': 'code', '.js': 'code', '.jsx': 'code',
  '.py': 'code', '.kt': 'code', '.java': 'code', '.go': 'code',
  '.rs': 'code', '.rb': 'code', '.sh': 'code', '.bash': 'code',
  '.css': 'code', '.scss': 'code', '.less': 'code',
  '.yml': 'code', '.yaml': 'code', '.toml': 'code', '.xml': 'code',
  '.sql': 'code', '.graphql': 'code', '.proto': 'code',
  '.c': 'code', '.cpp': 'code', '.h': 'code',
  '.swift': 'code', '.dart': 'code',
  // JSON
  '.json': 'json', '.jsonl': 'json',
  // PDF
  '.pdf': 'pdf',
  // CSV
  '.csv': 'csv', '.tsv': 'csv',
  // Plain text (use code renderer for line numbers)
  '.txt': 'code', '.log': 'code', '.env': 'code',
  '.gitignore': 'code', '.editorconfig': 'code',
};

export function detectFileType(filename: string): PreviewFileType {
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
  return EXTENSION_MAP[ext] ?? 'plaintext';
}

// --- File Entry -----------------------------------------------------------------

export type FileEntry = {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  type: PreviewFileType;
};

// --- Language Detection (for syntax highlighting) -------------------------------

const LANGUAGE_MAP: Record<string, string> = {
  '.ts': 'typescript', '.tsx': 'typescript',
  '.js': 'javascript', '.jsx': 'javascript',
  '.py': 'python', '.kt': 'kotlin', '.java': 'java',
  '.go': 'go', '.rs': 'rust', '.rb': 'ruby',
  '.sh': 'bash', '.bash': 'bash',
  '.css': 'css', '.scss': 'css',
  '.html': 'html', '.htm': 'html',
  '.json': 'json', '.yml': 'yaml', '.yaml': 'yaml',
  '.sql': 'sql', '.xml': 'xml',
  '.c': 'c', '.cpp': 'cpp', '.h': 'c',
  '.swift': 'swift', '.dart': 'dart',
  '.md': 'markdown',
};

export function detectLanguage(filename: string): string {
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
  return LANGUAGE_MAP[ext] ?? 'text';
}

// --- Size Formatting ------------------------------------------------------------

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const MAX_PREVIEW_SIZE = 1024 * 1024; // 1MB
