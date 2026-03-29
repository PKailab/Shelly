# Universal Preview Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Manus-style tabbed preview panel (Web/Code/Files) with 7 format renderers and a persistent Preview button in the terminal header.

**Architecture:** Extend existing preview-store with tab/file state, extract PreviewPanel into WebTab, add CodeTab (git diff + PTY detection) and FilesTab (file tree + multi-format renderers). Terminal header gets a persistent Preview button. Wide screens: split view. Compact: full screen overlay.

**Tech Stack:** React Native, Zustand, WebView, react-native-markdown-display, custom syntax highlighter, bridge commands for file I/O.

**Spec:** `docs/superpowers/specs/2026-03-30-universal-preview-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `components/preview/PreviewTabs.tsx` | Tab container (Web/Code/Files), tab bar, switching logic |
| `components/preview/WebTab.tsx` | WebView for localhost/HTML (extracted from PreviewPanel) |
| `components/preview/CodeTab.tsx` | Recent changes viewer with syntax HL + diff toggle |
| `components/preview/FilesTab.tsx` | File tree browser + router to renderers |
| `components/preview/renderers/CodeRenderer.tsx` | Syntax highlighted code with line numbers |
| `components/preview/renderers/MarkdownRenderer.tsx` | Markdown rich text display |
| `components/preview/renderers/ImageRenderer.tsx` | Pinch-zoom image viewer |
| `components/preview/renderers/JsonTreeRenderer.tsx` | Collapsible JSON tree |
| `components/preview/renderers/HtmlRenderer.tsx` | WebView for HTML file content |
| `components/preview/renderers/CsvTableRenderer.tsx` | Scrollable table grid |
| `components/preview/renderers/PdfRenderer.tsx` | PDF or "open externally" fallback |
| `components/preview/renderers/PlainTextRenderer.tsx` | Monospace text fallback |
| `lib/preview-file-detector.ts` | cwd scan, file type detection, shell escaping |
| `lib/syntax-highlight.ts` | Keyword-based syntax highlighting |

### Modified Files

| File | Changes |
|------|---------|
| `store/preview-store.ts` | Add activeTab, recentFiles, currentDir, hasNewContent, openPreview contract change |
| `components/terminal/TerminalHeader.tsx:254` | Add Preview button |
| `hooks/use-terminal-output.ts:22-28,67-74` | Extract file paths from change patterns |
| `app/(tabs)/terminal.tsx:49,539-543,548-550` | Replace PreviewPanel with PreviewTabs |

### Deleted Files

| File | Reason |
|------|--------|
| `components/terminal/PreviewPanel.tsx` | Logic extracted to WebTab.tsx |

---

## Task 1: Extend preview-store with tab/file state

**Files:**
- Modify: `store/preview-store.ts` (full rewrite, currently 78 lines)

- [ ] **Step 1: Add new types and fields to preview-store**

```typescript
// store/preview-store.ts — full replacement

import { create } from 'zustand';

export type PreviewTabId = 'web' | 'code' | 'files';

export type RecentFile = {
  path: string;
  detectedAt: number;
  source: 'git' | 'pty';
};

interface PreviewState {
  // Existing
  previewUrl: string | null;
  previewType: 'localhost' | 'file' | null;
  isOpen: boolean;
  splitRatio: number;
  detectedUrls: string[];
  bannerVisible: boolean;
  bannerUrl: string | null;

  // New: tabs
  activeTab: PreviewTabId;
  setActiveTab: (tab: PreviewTabId) => void;

  // New: code tab
  recentFiles: RecentFile[];
  activeCodeFile: string | null;
  notifyFileChange: (path: string) => void;
  setActiveCodeFile: (path: string) => void;

  // New: files tab
  currentDir: string;
  setCurrentDir: (dir: string) => void;

  // New: badge
  hasNewContent: boolean;
  clearNewContent: () => void;

  // Existing actions (modified)
  offerPreview: (url: string, type: 'localhost' | 'file') => void;
  openPreview: (url?: string) => void;
  closePreview: () => void;
  dismissBanner: () => void;
  setSplitRatio: (ratio: number) => void;
  clearDetectedUrls: () => void;
}

export const usePreviewStore = create<PreviewState>((set, get) => ({
  previewUrl: null,
  previewType: null,
  isOpen: false,
  splitRatio: 0.5,
  detectedUrls: [],
  bannerVisible: false,
  bannerUrl: null,
  activeTab: 'files',
  recentFiles: [],
  activeCodeFile: null,
  currentDir: '',
  hasNewContent: false,

  setActiveTab: (tab) => set({ activeTab: tab }),

  notifyFileChange: (path) => {
    const { isOpen, recentFiles } = get();
    const entry: RecentFile = { path, detectedAt: Date.now(), source: 'pty' };
    const updated = [entry, ...recentFiles.filter((f) => f.path !== path)].slice(0, 20);
    set({
      recentFiles: updated,
      activeCodeFile: path,
      hasNewContent: isOpen ? get().hasNewContent : true,
    });
  },

  setActiveCodeFile: (path) => set({ activeCodeFile: path }),

  setCurrentDir: (dir) => set({ currentDir: dir }),

  clearNewContent: () => set({ hasNewContent: false }),

  offerPreview: (url, type) => {
    const { detectedUrls, isOpen, previewUrl } = get();
    const normalized = url.replace(/https?:\/\/(127\.0\.0\.1|0\.0\.0\.0|\[::\])/, 'http://localhost');
    if (detectedUrls.includes(normalized)) return;
    const updated = [normalized, ...detectedUrls].slice(0, 10);
    set({
      detectedUrls: updated,
      previewType: type,
      hasNewContent: isOpen ? get().hasNewContent : true,
    });
    if (isOpen) {
      set({ previewUrl: normalized, activeTab: 'web' });
    } else {
      set({ bannerVisible: true, bannerUrl: normalized });
    }
  },

  // CHANGED: always opens, even without URL
  openPreview: (url) => {
    const { bannerUrl, detectedUrls } = get();
    const targetUrl = url ?? bannerUrl ?? detectedUrls[0] ?? null;
    const tab: PreviewTabId = targetUrl ? 'web' : (get().recentFiles.length > 0 ? 'code' : 'files');
    set({
      isOpen: true,
      previewUrl: targetUrl,
      bannerVisible: false,
      activeTab: tab,
      hasNewContent: false,
    });
  },

  // CHANGED: preserves previewUrl on close
  closePreview: () => set({ isOpen: false }),

  dismissBanner: () => set({ bannerVisible: false }),

  setSplitRatio: (ratio) => set({ splitRatio: Math.max(0.3, Math.min(0.7, ratio)) }),

  clearDetectedUrls: () => set({ detectedUrls: [], bannerVisible: false, bannerUrl: null }),
}));
```

- [ ] **Step 2: Verify existing imports still work**

Run: `cd ~/Shelly && grep -rn "usePreviewStore\|preview-store" --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".superpowers"`

Check all existing usages are compatible with new store shape (all existing fields preserved).

- [ ] **Step 3: Commit**

```bash
git add store/preview-store.ts
git commit -m "refactor: extend preview-store with tabs, file tracking, badge state"
```

---

## Task 2: Shell escape utility + file type detection

**Files:**
- Create: `lib/preview-file-detector.ts`

- [ ] **Step 1: Create preview-file-detector.ts**

```typescript
/**
 * lib/preview-file-detector.ts — File scanning and type detection for preview
 */

// ─── Shell Escape ───────────────────────────────────────────────────────────

export function shellEscape(path: string): string {
  return "'" + path.replace(/'/g, "'\\''") + "'";
}

// ─── File Type Detection ────────────────────────────────────────────────────

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
  // Plain text
  '.txt': 'code', '.log': 'code', '.env': 'code',
  '.gitignore': 'code', '.editorconfig': 'code',
};

export function detectFileType(filename: string): PreviewFileType {
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
  return EXTENSION_MAP[ext] ?? 'plaintext';
}

// ─── File Entry ─────────────────────────────────────────────────────────────

export type FileEntry = {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  type: PreviewFileType;
};

// ─── Language Detection (for syntax highlighting) ───────────────────────────

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

// ─── Size Formatting ────────────────────────────────────────────────────────

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const MAX_PREVIEW_SIZE = 1024 * 1024; // 1MB
```

- [ ] **Step 2: Commit**

```bash
git add lib/preview-file-detector.ts
git commit -m "feat: add file type detection and shell escape for preview"
```

---

## Task 3: Syntax highlighter

**Files:**
- Create: `lib/syntax-highlight.ts`

- [ ] **Step 1: Create syntax-highlight.ts**

```typescript
/**
 * lib/syntax-highlight.ts — Lightweight keyword-based syntax highlighting
 *
 * Returns an array of styled segments for a single line of code.
 * No heavy library — regex-based keyword/string/comment detection.
 */

export type TokenType = 'keyword' | 'string' | 'comment' | 'number' | 'punctuation' | 'default';

export type Token = {
  text: string;
  type: TokenType;
};

// ─── Color Map ──────────────────────────────────────────────────────────────

export const TOKEN_COLORS: Record<TokenType, string> = {
  keyword: '#22C55E',     // green
  string: '#F59E0B',      // yellow
  comment: '#6B7280',     // gray
  number: '#D946EF',      // magenta
  punctuation: '#888',     // dim
  default: '#E8E8E8',     // foreground
};

// ─── Keyword Sets ───────────────────────────────────────────────────────────

const JS_KEYWORDS = new Set([
  'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while',
  'class', 'extends', 'import', 'export', 'from', 'default', 'new', 'this',
  'async', 'await', 'try', 'catch', 'throw', 'typeof', 'instanceof',
  'true', 'false', 'null', 'undefined', 'void', 'type', 'interface',
  'enum', 'implements', 'readonly', 'as', 'in', 'of', 'switch', 'case', 'break',
]);

const PYTHON_KEYWORDS = new Set([
  'def', 'class', 'return', 'if', 'elif', 'else', 'for', 'while', 'import',
  'from', 'as', 'try', 'except', 'finally', 'raise', 'with', 'yield',
  'True', 'False', 'None', 'and', 'or', 'not', 'in', 'is', 'lambda',
  'pass', 'break', 'continue', 'global', 'nonlocal', 'async', 'await',
]);

const KOTLIN_KEYWORDS = new Set([
  'fun', 'val', 'var', 'class', 'object', 'interface', 'return', 'if', 'else',
  'when', 'for', 'while', 'import', 'package', 'override', 'open', 'abstract',
  'data', 'sealed', 'companion', 'suspend', 'null', 'true', 'false',
  'is', 'as', 'in', 'by', 'private', 'public', 'internal', 'protected',
]);

const CSS_KEYWORDS = new Set([
  'display', 'flex', 'grid', 'position', 'margin', 'padding', 'border',
  'color', 'background', 'font-size', 'font-weight', 'width', 'height',
  'top', 'left', 'right', 'bottom', 'z-index', 'overflow', 'opacity',
  'transition', 'animation', 'transform', 'box-shadow', 'text-align',
]);

const LANGUAGE_KEYWORDS: Record<string, Set<string>> = {
  typescript: JS_KEYWORDS,
  javascript: JS_KEYWORDS,
  python: PYTHON_KEYWORDS,
  kotlin: KOTLIN_KEYWORDS,
  java: KOTLIN_KEYWORDS, // close enough
  css: CSS_KEYWORDS,
};

// ─── Tokenizer ──────────────────────────────────────────────────────────────

export function tokenizeLine(line: string, language: string): Token[] {
  const keywords = LANGUAGE_KEYWORDS[language];
  if (!keywords) {
    return [{ text: line, type: 'default' }];
  }

  const tokens: Token[] = [];
  let i = 0;

  while (i < line.length) {
    // Comments: // or #
    if ((line[i] === '/' && line[i + 1] === '/') || (language === 'python' && line[i] === '#')) {
      tokens.push({ text: line.slice(i), type: 'comment' });
      break;
    }

    // Strings: "..." or '...' or `...`
    if (line[i] === '"' || line[i] === "'" || line[i] === '`') {
      const quote = line[i];
      let j = i + 1;
      while (j < line.length && line[j] !== quote) {
        if (line[j] === '\\') j++; // skip escaped
        j++;
      }
      tokens.push({ text: line.slice(i, j + 1), type: 'string' });
      i = j + 1;
      continue;
    }

    // Numbers
    if (/\d/.test(line[i]) && (i === 0 || /[\s(,=:+\-*/]/.test(line[i - 1]))) {
      let j = i;
      while (j < line.length && /[\d.xXa-fA-F]/.test(line[j])) j++;
      tokens.push({ text: line.slice(i, j), type: 'number' });
      i = j;
      continue;
    }

    // Words (potential keywords)
    if (/[a-zA-Z_$]/.test(line[i])) {
      let j = i;
      while (j < line.length && /[a-zA-Z0-9_$]/.test(line[j])) j++;
      const word = line.slice(i, j);
      tokens.push({ text: word, type: keywords.has(word) ? 'keyword' : 'default' });
      i = j;
      continue;
    }

    // Punctuation
    if (/[{}()\[\];:,.<>=+\-*/&|!?@%^~]/.test(line[i])) {
      tokens.push({ text: line[i], type: 'punctuation' });
      i++;
      continue;
    }

    // Whitespace and other
    let j = i;
    while (j < line.length && !/[a-zA-Z0-9_$"'`{}()\[\];:,.<>=+\-*/&|!?@%^~#/]/.test(line[j])) j++;
    if (j > i) {
      tokens.push({ text: line.slice(i, j), type: 'default' });
      i = j;
    } else {
      tokens.push({ text: line[i], type: 'default' });
      i++;
    }
  }

  return tokens;
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/syntax-highlight.ts
git commit -m "feat: add lightweight keyword-based syntax highlighter"
```

---

## Task 4: File renderers (7 renderers + fallback)

**Files:**
- Create: `components/preview/renderers/CodeRenderer.tsx`
- Create: `components/preview/renderers/MarkdownRenderer.tsx`
- Create: `components/preview/renderers/ImageRenderer.tsx`
- Create: `components/preview/renderers/JsonTreeRenderer.tsx`
- Create: `components/preview/renderers/CsvTableRenderer.tsx`
- Create: `components/preview/renderers/PdfRenderer.tsx`
- Create: `components/preview/renderers/PlainTextRenderer.tsx`

- [ ] **Step 1: Create CodeRenderer.tsx**

Line numbers + syntax highlighting. Shared between CodeTab and FilesTab.

```typescript
// components/preview/renderers/CodeRenderer.tsx
import React, { memo } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useTheme } from '@/hooks/use-theme';
import { withAlpha } from '@/lib/theme-utils';
import { tokenizeLine, TOKEN_COLORS } from '@/lib/syntax-highlight';

type Props = {
  content: string;
  language: string;
  maxLines?: number;
};

export const CodeRenderer = memo(function CodeRenderer({ content, language, maxLines }: Props) {
  const { colors } = useTheme();
  const lines = content.split('\n');
  const displayLines = maxLines ? lines.slice(0, maxLines) : lines;
  const truncated = maxLines && lines.length > maxLines;
  const gutterWidth = String(displayLines.length).length * 9 + 16;

  return (
    <ScrollView style={styles.container} horizontal={false}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.codeBlock}>
          {displayLines.map((line, i) => {
            const tokens = tokenizeLine(line, language);
            return (
              <View key={i} style={styles.lineRow}>
                <Text style={[styles.lineNumber, { color: colors.muted, width: gutterWidth }]}>
                  {i + 1}
                </Text>
                <Text style={styles.lineContent}>
                  {tokens.map((token, j) => (
                    <Text key={j} style={{ color: TOKEN_COLORS[token.type] }}>
                      {token.text}
                    </Text>
                  ))}
                </Text>
              </View>
            );
          })}
          {truncated && (
            <Text style={[styles.truncatedNotice, { color: colors.muted }]}>
              ... truncated ({lines.length} total lines)
            </Text>
          )}
        </View>
      </ScrollView>
    </ScrollView>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D0D0D' },
  codeBlock: { padding: 8 },
  lineRow: { flexDirection: 'row', minHeight: 18 },
  lineNumber: {
    fontFamily: 'monospace', fontSize: 11, textAlign: 'right',
    paddingRight: 8, opacity: 0.5,
  },
  lineContent: { fontFamily: 'monospace', fontSize: 12, flex: 1 },
  truncatedNotice: { fontFamily: 'monospace', fontSize: 11, padding: 8, textAlign: 'center' },
});
```

- [ ] **Step 2: Create MarkdownRenderer.tsx**

```typescript
// components/preview/renderers/MarkdownRenderer.tsx
import React, { memo } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { useTheme } from '@/hooks/use-theme';
import { withAlpha } from '@/lib/theme-utils';

type Props = { content: string };

export const MarkdownRenderer = memo(function MarkdownRenderer({ content }: Props) {
  const { colors } = useTheme();
  const mdStyles = {
    body: { color: colors.foreground, fontSize: 14, fontFamily: 'monospace', lineHeight: 20 },
    heading1: { color: colors.foreground, fontSize: 20, fontWeight: '700' as const, marginVertical: 8 },
    heading2: { color: colors.foreground, fontSize: 17, fontWeight: '700' as const, marginVertical: 6 },
    heading3: { color: colors.foreground, fontSize: 15, fontWeight: '600' as const, marginVertical: 4 },
    code_inline: { backgroundColor: withAlpha(colors.foreground, 0.08), color: colors.accent, fontFamily: 'monospace', fontSize: 13 },
    code_block: { backgroundColor: '#0D0D0D', color: '#E8E8E8', fontFamily: 'monospace', fontSize: 12, padding: 10, borderRadius: 6 },
    fence: { backgroundColor: '#0D0D0D', color: '#E8E8E8', fontFamily: 'monospace', fontSize: 12, padding: 10, borderRadius: 6 },
    link: { color: colors.accent },
    blockquote: { borderLeftColor: colors.accent, borderLeftWidth: 3, paddingLeft: 10, opacity: 0.85 },
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Markdown style={mdStyles}>{content}</Markdown>
    </ScrollView>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16 },
});
```

- [ ] **Step 3: Create ImageRenderer.tsx**

```typescript
// components/preview/renderers/ImageRenderer.tsx
import React, { memo, useState } from 'react';
import { View, Image, ScrollView, StyleSheet, Text, useWindowDimensions } from 'react-native';
import { useTheme } from '@/hooks/use-theme';

type Props = { uri: string; filename: string };

export const ImageRenderer = memo(function ImageRenderer({ uri, filename }: Props) {
  const { colors } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const [error, setError] = useState(false);

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Text style={[styles.errorText, { color: colors.muted }]}>Cannot load image: {filename}</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      maximumZoomScale={5}
      minimumZoomScale={1}
      bouncesZoom
    >
      <Image
        source={{ uri }}
        style={{ width: screenWidth - 32, height: screenWidth - 32 }}
        resizeMode="contain"
        onError={() => setError(true)}
      />
    </ScrollView>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { alignItems: 'center', padding: 16 },
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { fontFamily: 'monospace', fontSize: 13 },
});
```

- [ ] **Step 4: Create JsonTreeRenderer.tsx**

```typescript
// components/preview/renderers/JsonTreeRenderer.tsx
import React, { memo, useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '@/hooks/use-theme';

type Props = { content: string };

const JsonNode = memo(function JsonNode({ keyName, value, depth }: { keyName?: string; value: any; depth: number }) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(depth < 2);

  if (value === null) return <JsonLeaf keyName={keyName} value="null" color="#D946EF" />;
  if (typeof value === 'boolean') return <JsonLeaf keyName={keyName} value={String(value)} color="#D946EF" />;
  if (typeof value === 'number') return <JsonLeaf keyName={keyName} value={String(value)} color="#D946EF" />;
  if (typeof value === 'string') return <JsonLeaf keyName={keyName} value={`"${value}"`} color="#F59E0B" />;

  const isArray = Array.isArray(value);
  const entries = isArray ? value.map((v: any, i: number) => [String(i), v]) : Object.entries(value);
  const bracket = isArray ? ['[', ']'] : ['{', '}'];

  return (
    <View style={{ paddingLeft: depth > 0 ? 16 : 0 }}>
      <TouchableOpacity onPress={() => setExpanded(!expanded)} activeOpacity={0.7}>
        <Text style={[styles.nodeText, { color: colors.foreground }]}>
          {keyName ? <Text style={{ color: '#3B82F6' }}>"{keyName}": </Text> : null}
          <Text style={{ color: colors.muted }}>{expanded ? bracket[0] : `${bracket[0]}...${bracket[1]} (${entries.length})`}</Text>
        </Text>
      </TouchableOpacity>
      {expanded && entries.map(([k, v]: [string, any]) => (
        <JsonNode key={k} keyName={isArray ? undefined : k} value={v} depth={depth + 1} />
      ))}
      {expanded && <Text style={[styles.nodeText, { color: colors.muted }]}>{bracket[1]}</Text>}
    </View>
  );
});

function JsonLeaf({ keyName, value, color }: { keyName?: string; value: string; color: string }) {
  return (
    <Text style={styles.nodeText}>
      {keyName ? <Text style={{ color: '#3B82F6' }}>"{keyName}": </Text> : null}
      <Text style={{ color }}>{value}</Text>
    </Text>
  );
}

export const JsonTreeRenderer = memo(function JsonTreeRenderer({ content }: Props) {
  const { colors } = useTheme();
  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    return <Text style={[styles.errorText, { color: colors.muted }]}>Invalid JSON</Text>;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <JsonNode value={parsed} depth={0} />
    </ScrollView>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D0D0D' },
  content: { padding: 12 },
  nodeText: { fontFamily: 'monospace', fontSize: 12, lineHeight: 20 },
  errorText: { fontFamily: 'monospace', fontSize: 13, padding: 16 },
});
```

- [ ] **Step 5: Create CsvTableRenderer.tsx**

```typescript
// components/preview/renderers/CsvTableRenderer.tsx
import React, { memo } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useTheme } from '@/hooks/use-theme';
import { withAlpha } from '@/lib/theme-utils';

type Props = { content: string; delimiter?: string };

export const CsvTableRenderer = memo(function CsvTableRenderer({ content, delimiter = ',' }: Props) {
  const { colors } = useTheme();
  const rows = content.split('\n').filter(Boolean).map((line) => line.split(delimiter));
  const header = rows[0] ?? [];
  const body = rows.slice(1);

  return (
    <ScrollView style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View>
          {/* Header */}
          <View style={[styles.row, { backgroundColor: withAlpha(colors.accent, 0.1) }]}>
            {header.map((cell, i) => (
              <Text key={i} style={[styles.cell, styles.headerCell, { color: colors.accent }]}>{cell.trim()}</Text>
            ))}
          </View>
          {/* Body */}
          {body.slice(0, 500).map((row, ri) => (
            <View key={ri} style={[styles.row, ri % 2 === 0 ? { backgroundColor: withAlpha(colors.foreground, 0.02) } : {}]}>
              {row.map((cell, ci) => (
                <Text key={ci} style={[styles.cell, { color: colors.foreground }]}>{cell.trim()}</Text>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </ScrollView>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  row: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#222' },
  cell: { fontFamily: 'monospace', fontSize: 11, padding: 6, minWidth: 80, maxWidth: 200 },
  headerCell: { fontWeight: '600', fontSize: 11 },
});
```

- [ ] **Step 6: Create PdfRenderer.tsx**

```typescript
// components/preview/renderers/PdfRenderer.tsx
import React, { memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useTheme } from '@/hooks/use-theme';
import { withAlpha } from '@/lib/theme-utils';

type Props = { filePath: string };

export const PdfRenderer = memo(function PdfRenderer({ filePath }: Props) {
  const { colors } = useTheme();

  return (
    <View style={styles.container}>
      <MaterialIcons name="picture-as-pdf" size={48} color="#EF4444" />
      <Text style={[styles.text, { color: colors.foreground }]}>PDF Preview</Text>
      <Text style={[styles.subtext, { color: colors.muted }]}>{filePath.split('/').pop()}</Text>
      <TouchableOpacity
        style={[styles.button, { backgroundColor: withAlpha(colors.accent, 0.15) }]}
        onPress={() => Linking.openURL(`file://${filePath}`).catch(() => {})}
        activeOpacity={0.7}
      >
        <MaterialIcons name="open-in-new" size={16} color={colors.accent} />
        <Text style={[styles.buttonText, { color: colors.accent }]}>Open externally</Text>
      </TouchableOpacity>
    </View>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  text: { fontFamily: 'monospace', fontSize: 16, fontWeight: '600' },
  subtext: { fontFamily: 'monospace', fontSize: 12 },
  button: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  buttonText: { fontFamily: 'monospace', fontSize: 13, fontWeight: '600' },
});
```

- [ ] **Step 7: Create PlainTextRenderer.tsx**

```typescript
// components/preview/renderers/PlainTextRenderer.tsx
import React, { memo } from 'react';
import { ScrollView, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/hooks/use-theme';

type Props = { content: string };

export const PlainTextRenderer = memo(function PlainTextRenderer({ content }: Props) {
  const { colors } = useTheme();
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={[styles.text, { color: colors.foreground }]} selectable>{content}</Text>
    </ScrollView>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 12 },
  text: { fontFamily: 'monospace', fontSize: 12, lineHeight: 18 },
});
```

- [ ] **Step 8: Create HtmlRenderer.tsx**

```typescript
// components/preview/renderers/HtmlRenderer.tsx
import React, { memo } from 'react';
import { StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

type Props = { html: string };

export const HtmlRenderer = memo(function HtmlRenderer({ html }: Props) {
  return (
    <WebView
      source={{ html }}
      style={styles.webview}
      javaScriptEnabled
      domStorageEnabled
      originWhitelist={['*']}
    />
  );
});

const styles = StyleSheet.create({
  webview: { flex: 1, backgroundColor: 'transparent' },
});
```

- [ ] **Step 9: Commit all renderers**

```bash
mkdir -p components/preview/renderers
git add components/preview/renderers/
git commit -m "feat: add 8 preview renderers (code, markdown, image, json, csv, pdf, html, plaintext)"
```

---

## Task 5: WebTab (extract from PreviewPanel)

**Files:**
- Create: `components/preview/WebTab.tsx`
- Delete: `components/terminal/PreviewPanel.tsx`

- [ ] **Step 1: Create WebTab.tsx**

Copy `components/terminal/PreviewPanel.tsx` verbatim, then apply these specific changes:

**Props interface change** (line 12-16 of original):
```typescript
// FROM:
interface PreviewPanelProps {
  url: string;
  onClose: () => void;
  onEditSubmit?: (prompt: string) => void;
}
// TO:
interface WebTabProps {
  url: string | null;
  onClose: () => void;
  onEditSubmit?: (prompt: string) => void;
}
```

**Component rename** (line 18): `PreviewPanel` → `WebTab`

**Add early return for null URL** (insert after hooks, before `const shortUrl`):
```typescript
  // Empty state when no URL
  if (!url) {
    return (
      <View style={[styles.container, { backgroundColor: c.background }]}>
        <View style={styles.placeholder}>
          <MaterialIcons name="language" size={32} color={c.muted} />
          <Text style={[styles.placeholderText, { color: c.muted }]}>
            Start a dev server or open an HTML file
          </Text>
        </View>
      </View>
    );
  }
```

**Remove borderLeftWidth** from container style (line ~97):
```typescript
// FROM: container: { flex: 1, borderLeftWidth: 1 }
// TO:   container: { flex: 1 }
```

**Add placeholder styles:**
```typescript
placeholder: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
placeholderText: { fontFamily: 'monospace', fontSize: 13 },
```

All other logic (WebView, Click-to-Edit, EditSheet, error handling, loading) remains identical to PreviewPanel.tsx lines 1-231. Full imports preserved:
- `react-native-webview` (WebView, WebViewMessageEvent)
- `@/lib/click-to-edit` (getClickToEditScript, buildSetEditModeMessage, SelectedElement)
- `@/components/chat/EditSheet`
- `expo-haptics`, `expo-linking`, MaterialIcons, useTheme, withAlpha

- [ ] **Step 2: Delete PreviewPanel.tsx**

```bash
git rm components/terminal/PreviewPanel.tsx
```

- [ ] **Step 3: Commit**

```bash
git add components/preview/WebTab.tsx
git commit -m "refactor: extract PreviewPanel to WebTab in preview directory"
```

---

## Task 6: CodeTab

**Files:**
- Create: `components/preview/CodeTab.tsx`

- [ ] **Step 1: Create CodeTab.tsx**

```typescript
// components/preview/CodeTab.tsx
import React, { memo, useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useTheme } from '@/hooks/use-theme';
import { withAlpha } from '@/lib/theme-utils';
import { usePreviewStore } from '@/store/preview-store';
import { useTermuxBridge } from '@/hooks/use-termux-bridge';
import { CodeRenderer } from '@/components/preview/renderers/CodeRenderer';
import { detectLanguage, shellEscape, MAX_PREVIEW_SIZE } from '@/lib/preview-file-detector';

type Props = {};

export const CodeTab = memo(function CodeTab({}: Props) {
  const { colors } = useTheme();
  const recentFiles = usePreviewStore((s) => s.recentFiles);
  const activeFile = usePreviewStore((s) => s.activeCodeFile);
  const setActiveFile = usePreviewStore((s) => s.setActiveCodeFile);
  const { runRawCommand } = useTermuxBridge();

  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [showDiff, setShowDiff] = useState(false);

  // Load file content
  const loadFile = useCallback(async (path: string) => {
    setLoading(true);
    try {
      // Size check
      const sizeResult = await runRawCommand(`stat -c %s ${shellEscape(path)} 2>/dev/null`);
      const size = parseInt(sizeResult.stdout?.trim() || '0', 10);
      const cmd = size > MAX_PREVIEW_SIZE
        ? `head -n 1000 ${shellEscape(path)}`
        : `cat ${shellEscape(path)}`;
      const result = await runRawCommand(cmd);
      setContent(result.stdout || '');
    } catch {
      setContent('// Error loading file');
    }
    setLoading(false);
  }, [runRawCommand]);

  // Load diff
  const loadDiff = useCallback(async (path: string) => {
    setLoading(true);
    try {
      const result = await runRawCommand(`git diff ${shellEscape(path)} 2>/dev/null`);
      setContent(result.stdout || '// No diff available');
    } catch {
      setContent('// git diff failed');
    }
    setLoading(false);
  }, [runRawCommand]);

  // Refresh git file list on mount
  useEffect(() => {
    (async () => {
      try {
        const result = await runRawCommand(
          `cd $(pwd) && { git diff --name-only HEAD 2>/dev/null; git diff --name-only 2>/dev/null; } | sort -u`
        );
        const paths = (result.stdout || '').split('\n').filter(Boolean);
        const store = usePreviewStore.getState();
        for (const p of paths) {
          if (!store.recentFiles.some((f) => f.path === p)) {
            store.notifyFileChange(p);
          }
        }
      } catch {}
    })();
  }, [runRawCommand]);

  // Load active file
  useEffect(() => {
    if (!activeFile) return;
    if (showDiff) loadDiff(activeFile);
    else loadFile(activeFile);
  }, [activeFile, showDiff, loadFile, loadDiff]);

  if (recentFiles.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <MaterialIcons name="code" size={32} color={colors.muted} />
        <Text style={[styles.emptyText, { color: colors.muted }]}>No recent changes</Text>
      </View>
    );
  }

  const language = activeFile ? detectLanguage(activeFile) : 'text';

  return (
    <View style={styles.container}>
      {/* File selector + diff toggle */}
      <View style={[styles.toolbar, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.fileChip, { backgroundColor: withAlpha(colors.accent, 0.1) }]}
          activeOpacity={0.7}
        >
          <Text style={[styles.filePath, { color: colors.accent }]} numberOfLines={1}>
            {activeFile || 'Select file'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleBtn, showDiff && { backgroundColor: withAlpha(colors.accent, 0.15) }]}
          onPress={() => setShowDiff(!showDiff)}
          activeOpacity={0.7}
        >
          <Text style={[styles.toggleText, { color: showDiff ? colors.accent : colors.muted }]}>
            {showDiff ? 'Diff' : 'Full'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* File list (horizontal scroll) */}
      {recentFiles.length > 1 && (
        <View style={styles.fileList}>
          {recentFiles.slice(0, 10).map((f) => (
            <TouchableOpacity
              key={f.path}
              style={[styles.fileTab, f.path === activeFile && { borderBottomColor: colors.accent, borderBottomWidth: 2 }]}
              onPress={() => setActiveFile(f.path)}
              activeOpacity={0.7}
            >
              <Text style={[styles.fileTabText, { color: f.path === activeFile ? colors.foreground : colors.muted }]} numberOfLines={1}>
                {f.path.split('/').pop()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Content */}
      {loading ? (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="small" color={colors.accent} />
        </View>
      ) : (
        <CodeRenderer content={content} language={language} />
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  toolbar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderBottomWidth: 1, gap: 8 },
  fileChip: { flex: 1, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  filePath: { fontFamily: 'monospace', fontSize: 11 },
  toggleBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  toggleText: { fontFamily: 'monospace', fontSize: 11, fontWeight: '600' },
  fileList: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#222' },
  fileTab: { paddingHorizontal: 10, paddingVertical: 6 },
  fileTabText: { fontFamily: 'monospace', fontSize: 10 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8 },
  emptyText: { fontFamily: 'monospace', fontSize: 13 },
});
```

- [ ] **Step 2: Commit**

```bash
git add components/preview/CodeTab.tsx
git commit -m "feat: add CodeTab with git diff + PTY detection + syntax highlighting"
```

---

## Task 7: FilesTab

**Files:**
- Create: `components/preview/FilesTab.tsx`

- [ ] **Step 1: Create FilesTab.tsx**

```typescript
// components/preview/FilesTab.tsx
import React, { memo, useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useTheme } from '@/hooks/use-theme';
import { withAlpha } from '@/lib/theme-utils';
import { usePreviewStore } from '@/store/preview-store';
import { useTermuxBridge } from '@/hooks/use-termux-bridge';
import {
  shellEscape, detectFileType, detectLanguage, formatFileSize,
  MAX_PREVIEW_SIZE, type FileEntry, type PreviewFileType,
} from '@/lib/preview-file-detector';
// Renderers
import { CodeRenderer } from '@/components/preview/renderers/CodeRenderer';
import { MarkdownRenderer } from '@/components/preview/renderers/MarkdownRenderer';
import { ImageRenderer } from '@/components/preview/renderers/ImageRenderer';
import { JsonTreeRenderer } from '@/components/preview/renderers/JsonTreeRenderer';
import { CsvTableRenderer } from '@/components/preview/renderers/CsvTableRenderer';
import { PdfRenderer } from '@/components/preview/renderers/PdfRenderer';
import { PlainTextRenderer } from '@/components/preview/renderers/PlainTextRenderer';
import { HtmlRenderer } from '@/components/preview/renderers/HtmlRenderer';

export const FilesTab = memo(function FilesTab() {
  const { colors } = useTheme();
  const currentDir = usePreviewStore((s) => s.currentDir);
  const setCurrentDir = usePreviewStore((s) => s.setCurrentDir);
  const { runRawCommand } = useTermuxBridge();

  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<FileEntry | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [fileLoading, setFileLoading] = useState(false);

  // Scan directory
  const scanDir = useCallback(async (dir: string) => {
    setLoading(true);
    try {
      const result = await runRawCommand(
        `find ${shellEscape(dir)} -maxdepth 1 -not -name '.' -exec stat -c '%n\t%s\t%F' {} \\;`,
        { reason: 'preview-files-scan' },
      );
      const entries: FileEntry[] = (result.stdout || '').split('\n').filter(Boolean).map((line) => {
        const [fullPath, sizeStr, typeStr] = line.split('\t');
        const name = fullPath.split('/').pop() || fullPath;
        const isDir = typeStr?.includes('directory') ?? false;
        return {
          name,
          path: fullPath,
          isDirectory: isDir,
          size: parseInt(sizeStr || '0', 10),
          type: isDir ? 'plaintext' as PreviewFileType : detectFileType(name),
        };
      }).sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name);
      }).filter((f) => !f.name.startsWith('.') || f.name === '.gitignore');
      setFiles(entries);
    } catch {
      setFiles([]);
    }
    setLoading(false);
  }, [runRawCommand]);

  // Init: get cwd if not set
  useEffect(() => {
    (async () => {
      let dir = currentDir;
      if (!dir) {
        try {
          const r = await runRawCommand('pwd', { reason: 'preview-files-cwd' });
          dir = r.stdout?.trim() || '/data/data/com.termux/files/home';
          setCurrentDir(dir);
        } catch {
          dir = '/data/data/com.termux/files/home';
          setCurrentDir(dir);
        }
      }
      scanDir(dir);
    })();
  }, [currentDir, scanDir, setCurrentDir, runRawCommand]);

  // Open file
  const openFile = useCallback(async (entry: FileEntry) => {
    if (entry.isDirectory) {
      setCurrentDir(entry.path);
      setSelectedFile(null);
      return;
    }
    setSelectedFile(entry);
    if (entry.type === 'image') {
      setFileLoading(true);
      try {
        const r = await runRawCommand(`base64 ${shellEscape(entry.path)}`, { reason: 'preview-files-image' });
        const ext = entry.name.split('.').pop()?.toLowerCase() || 'png';
        const mime = ext === 'svg' ? 'svg+xml' : ext;
        setFileContent(`data:image/${mime};base64,${r.stdout?.replace(/\s/g, '') || ''}`);
      } catch { setFileContent(''); }
      setFileLoading(false);
      return;
    }
    if (entry.type === 'pdf') return; // PdfRenderer handles its own display
    // Text-based files
    setFileLoading(true);
    try {
      const cmd = entry.size > MAX_PREVIEW_SIZE
        ? `head -n 1000 ${shellEscape(entry.path)}`
        : `cat ${shellEscape(entry.path)}`;
      const r = await runRawCommand(cmd, { reason: 'preview-files-read' });
      setFileContent(r.stdout || '');
    } catch { setFileContent('// Error reading file'); }
    setFileLoading(false);
  }, [runRawCommand, setCurrentDir]);

  // Back button
  const goBack = useCallback(() => {
    if (selectedFile) { setSelectedFile(null); return; }
    const parent = currentDir.split('/').slice(0, -1).join('/') || '/';
    setCurrentDir(parent);
  }, [selectedFile, currentDir, setCurrentDir]);

  // ── File Preview ──
  if (selectedFile) {
    if (fileLoading) {
      return <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>;
    }
    return (
      <View style={styles.container}>
        <TouchableOpacity style={styles.backRow} onPress={goBack}>
          <MaterialIcons name="arrow-back" size={16} color={colors.accent} />
          <Text style={[styles.backText, { color: colors.accent }]}>{selectedFile.name}</Text>
        </TouchableOpacity>
        {renderFileContent(selectedFile, fileContent, colors)}
      </View>
    );
  }

  // ── File Tree ──
  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backRow} onPress={goBack}>
        <MaterialIcons name="arrow-back" size={14} color={colors.muted} />
        <Text style={[styles.breadcrumb, { color: colors.muted }]} numberOfLines={1}>{currentDir}</Text>
      </TouchableOpacity>
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>
      ) : (
        <FlatList
          data={files}
          keyExtractor={(item) => item.path}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.fileRow} onPress={() => openFile(item)} activeOpacity={0.7}>
              <MaterialIcons
                name={item.isDirectory ? 'folder' : 'insert-drive-file'}
                size={16}
                color={item.isDirectory ? '#F59E0B' : colors.muted}
              />
              <Text style={[styles.fileName, { color: colors.foreground }]} numberOfLines={1}>{item.name}</Text>
              {!item.isDirectory && (
                <Text style={[styles.fileSize, { color: colors.muted }]}>{formatFileSize(item.size)}</Text>
              )}
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
});

// ─── Renderer Router ────────────────────────────────────────────────────────

function renderFileContent(file: FileEntry, content: string, colors: any) {
  switch (file.type) {
    case 'html':      return <HtmlRenderer html={content} />;
    case 'markdown':  return <MarkdownRenderer content={content} />;
    case 'image':     return <ImageRenderer uri={content} filename={file.name} />;
    case 'code':      return <CodeRenderer content={content} language={detectLanguage(file.name)} />;
    case 'json':      return <JsonTreeRenderer content={content} />;
    case 'csv':       return <CsvTableRenderer content={content} delimiter={file.name.endsWith('.tsv') ? '\t' : ','} />;
    case 'pdf':       return <PdfRenderer filePath={file.path} />;
    default:          return <PlainTextRenderer content={content} />;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8, borderBottomWidth: 1, borderBottomColor: '#222' },
  backText: { fontFamily: 'monospace', fontSize: 12, fontWeight: '600' },
  breadcrumb: { fontFamily: 'monospace', fontSize: 10, flex: 1 },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#111' },
  fileName: { fontFamily: 'monospace', fontSize: 12, flex: 1 },
  fileSize: { fontFamily: 'monospace', fontSize: 10 },
});
```

- [ ] **Step 2: Commit**

```bash
git add components/preview/FilesTab.tsx
git commit -m "feat: add FilesTab with file tree browser and multi-format preview"
```

---

## Task 8: PreviewTabs container

**Files:**
- Create: `components/preview/PreviewTabs.tsx`

- [ ] **Step 1: Create PreviewTabs.tsx**

Tab container with Web/Code/Files tabs. Tab bar at top with active indicator. Close button. Lazy-mounts only the active tab's content.

```typescript
// components/preview/PreviewTabs.tsx
import React, { memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Pressable } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useTheme } from '@/hooks/use-theme';
import { withAlpha } from '@/lib/theme-utils';
import { usePreviewStore, type PreviewTabId } from '@/store/preview-store';
import { WebTab } from '@/components/preview/WebTab';
import { CodeTab } from '@/components/preview/CodeTab';
import { FilesTab } from '@/components/preview/FilesTab';

type Props = {
  onClose: () => void;
  onEditSubmit?: (prompt: string) => void;
};

const TABS: Array<{ id: PreviewTabId; label: string; icon: string }> = [
  { id: 'web', label: 'Web', icon: 'language' },
  { id: 'code', label: 'Code', icon: 'code' },
  { id: 'files', label: 'Files', icon: 'folder' },
];

export const PreviewTabs = memo(function PreviewTabs({ onClose, onEditSubmit }: Props) {
  const { colors } = useTheme();
  const activeTab = usePreviewStore((s) => s.activeTab);
  const setActiveTab = usePreviewStore((s) => s.setActiveTab);
  const previewUrl = usePreviewStore((s) => s.previewUrl);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Tab bar */}
      <View style={[styles.tabBar, { backgroundColor: colors.surfaceHigh, borderBottomColor: colors.border }]}>
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab.id}
            style={[styles.tab, activeTab === tab.id && { borderBottomColor: colors.accent, borderBottomWidth: 2 }]}
            onPress={() => setActiveTab(tab.id)}
            activeOpacity={0.7}
          >
            <MaterialIcons name={tab.icon as any} size={14} color={activeTab === tab.id ? colors.accent : colors.muted} />
            <Text style={[styles.tabLabel, { color: activeTab === tab.id ? colors.accent : colors.muted }]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
        <View style={{ flex: 1 }} />
        <Pressable onPress={onClose} hitSlop={8} style={styles.closeBtn}>
          <MaterialIcons name="close" size={16} color={colors.muted} />
        </Pressable>
      </View>

      {/* Tab content (lazy mount) */}
      {activeTab === 'web' && <WebTab url={previewUrl} onClose={onClose} onEditSubmit={onEditSubmit} />}
      {activeTab === 'code' && <CodeTab />}
      {activeTab === 'files' && <FilesTab />}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabBar: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, paddingHorizontal: 4 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8 },
  tabLabel: { fontFamily: 'monospace', fontSize: 12, fontWeight: '600' },
  closeBtn: { padding: 8 },
});
```

- [ ] **Step 2: Commit**

```bash
git add components/preview/PreviewTabs.tsx
git commit -m "feat: add PreviewTabs container with Web/Code/Files tab switching"
```

---

## Task 9: Terminal header Preview button

**Files:**
- Modify: `components/terminal/TerminalHeader.tsx:254`

- [ ] **Step 1: Add Preview button to TerminalHeader**

Insert after line 253 (after multi-pane toggle), before line 255 (fullscreen button):

```typescript
// Add import at top:
import { usePreviewStore } from '@/store/preview-store';

// Inside component, add:
const previewOpen = usePreviewStore((s) => s.isOpen);
const hasNewContent = usePreviewStore((s) => s.hasNewContent);
const togglePreview = useCallback(() => {
  const store = usePreviewStore.getState();
  if (store.isOpen) store.closePreview();
  else store.openPreview();
}, []);

// In JSX, after multi-pane toggle (line ~254):
<Pressable
  onPress={togglePreview}
  hitSlop={6}
  style={[styles.previewButton, previewOpen && { backgroundColor: withAlpha(colors.accent, 0.15) }]}
>
  <MaterialIcons name="open_in_new" size={14} color={previewOpen ? colors.accent : colors.muted} />
  <Text style={[styles.previewLabel, { color: previewOpen ? colors.accent : colors.muted }]}>Preview</Text>
  {hasNewContent && !previewOpen && (
    <View style={styles.previewBadge} />
  )}
</Pressable>

// Add to StyleSheet:
previewButton: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
previewLabel: { fontFamily: 'monospace', fontSize: 11, fontWeight: '600' },
previewBadge: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#22C55E', position: 'absolute', top: 2, right: 2 },
```

- [ ] **Step 2: Commit**

```bash
git add components/terminal/TerminalHeader.tsx
git commit -m "feat: add persistent Preview button to terminal header"
```

---

## Task 10: Integrate PreviewTabs into terminal.tsx

**Files:**
- Modify: `app/(tabs)/terminal.tsx:49,539-543,548-550`

- [ ] **Step 1: Replace PreviewPanel with PreviewTabs**

```typescript
// Line 49: change import
// FROM: import { PreviewPanel } from '@/components/terminal/PreviewPanel';
// TO:
import { PreviewTabs } from '@/components/preview/PreviewTabs';

// Lines 539-543 (split view): replace PreviewPanel
// FROM: <PreviewPanel url={previewUrl} onClose={closePreview} onEditSubmit={handleEditSubmit} />
// TO:
<PreviewTabs onClose={closePreview} onEditSubmit={handleEditSubmit} />

// Lines 548-550 (fullscreen): replace PreviewPanel
// FROM: <PreviewPanel url={previewUrl} onClose={closePreview} onEditSubmit={handleEditSubmit} />
// TO:
<PreviewTabs onClose={closePreview} onEditSubmit={handleEditSubmit} />

// Also update the condition on line 548:
// FROM: {previewIsOpen && previewUrl && !showSplitPreview && isConnected && (
// TO: (remove previewUrl requirement — panel can open without URL now)
// {previewIsOpen && !showSplitPreview && isConnected && (

// Same for line 539:
// FROM: {showSplitPreview && previewUrl && (
// TO:
// {showSplitPreview && (
// (showSplitPreview already checks isOpen && layout.isWide)
```

- [ ] **Step 2: Update showSplitPreview derivation**

```typescript
// Line 128: remove previewUrl requirement
// FROM: const showSplitPreview = previewIsOpen && previewUrl && layout.isWide;
// TO:
const showSplitPreview = previewIsOpen && layout.isWide;
```

- [ ] **Step 3: Run TypeScript check**

Run: `cd ~/Shelly && npx tsc --noEmit --pretty 2>&1 | grep -v "expo-modules-core"`

Expected: Only existing expo-modules-core errors.

- [ ] **Step 4: Commit**

```bash
git add app/(tabs)/terminal.tsx
git commit -m "feat: integrate PreviewTabs into terminal, replace PreviewPanel"
```

---

## Task 11: Enhance file change detection in use-terminal-output

**Files:**
- Modify: `hooks/use-terminal-output.ts:22-28,67-74`

- [ ] **Step 1: Add file path extraction patterns**

```typescript
// Replace FILE_CHANGE_OUTPUT (lines 22-28) with capturing groups:
const FILE_CHANGE_OUTPUT = [
  /(?:wrote|created|saved|modified|updated|generated)\s+(\S+)/i,
  /(?:^|\$\s+|#\s+)(?:vim|nano|code)\s+(\S+)/,
  /(?:^|\$\s+|#\s+)(?:mv|cp)\s+\S+\s+(\S+)/,
  /(?:^|\$\s+|#\s+)rm\s+(\S+)/,
  /(?:^|\$\s+|#\s+)git\s+(?:checkout|reset|merge|rebase)/,
  /(?:^|\$\s+|#\s+)(?:npm|pnpm|yarn)\s+(?:install|add|remove)/,
];

// In the detection loop (around line 67-74), add file path notification:
for (const pattern of FILE_CHANGE_OUTPUT) {
  if (pattern.test(line)) {
    // Extract file path if pattern has capture group
    const match = pattern.exec(line);
    if (match?.[1]) {
      usePreviewStore.getState().notifyFileChange(match[1]);
    }
    // Existing savepoint logic...
  }
}
```

- [ ] **Step 2: Add import**

```typescript
import { usePreviewStore } from '@/store/preview-store';
```

(Already imported in current version — verify.)

- [ ] **Step 3: Commit**

```bash
git add hooks/use-terminal-output.ts
git commit -m "feat: extract file paths from terminal output for preview Code tab"
```

---

## Task 12: Add i18n keys

**Files:**
- Modify: `lib/i18n/locales/en.ts`
- Modify: `lib/i18n/locales/ja.ts`

- [ ] **Step 1: Add preview keys to en.ts**

Add to the preview section (or create one):

```typescript
preview: {
  button: 'Preview',
  tab_web: 'Web',
  tab_code: 'Code',
  tab_files: 'Files',
  no_url: 'Start a dev server or open an HTML file',
  no_changes: 'No recent changes',
  connect_termux: 'Connect Termux to enable preview',
  truncated: 'File truncated (showing first 1000 lines)',
  binary: 'Binary file — cannot preview',
  pdf_unavailable: 'PDF preview unavailable',
  open_external: 'Open externally',
  back_terminal: 'Back to Terminal',
  diff_view: 'Diff view',
  full_file: 'Full file',
},
```

- [ ] **Step 2: Add preview keys to ja.ts**

```typescript
preview: {
  button: 'プレビュー',
  tab_web: 'Web',
  tab_code: 'コード',
  tab_files: 'ファイル',
  no_url: 'サーバー起動かHTMLファイルを開いてください',
  no_changes: '変更なし',
  connect_termux: 'Termuxに接続してください',
  truncated: 'ファイル省略（先頭1000行）',
  binary: 'バイナリファイル',
  pdf_unavailable: 'PDF非対応',
  open_external: '外部で開く',
  back_terminal: 'ターミナルに戻る',
  diff_view: '差分表示',
  full_file: '全体表示',
},
```

- [ ] **Step 3: Commit**

```bash
git add lib/i18n/locales/en.ts lib/i18n/locales/ja.ts
git commit -m "feat: add i18n keys for universal preview panel"
```

---

## Task 13: Final verification + cleanup

- [ ] **Step 1: TypeScript check**

Run: `cd ~/Shelly && npx tsc --noEmit --pretty 2>&1 | grep -v "expo-modules-core"`

Expected: Only 3 existing expo-modules-core errors.

- [ ] **Step 2: Verify all imports resolve**

Run: `grep -rn "PreviewPanel" ~/Shelly/app ~/Shelly/components ~/Shelly/hooks --include="*.tsx" --include="*.ts" | grep -v node_modules | grep -v ".superpowers"`

Expected: No remaining references to old PreviewPanel.

- [ ] **Step 3: Add .superpowers/ to .gitignore (if not already)**

```bash
echo ".superpowers/" >> ~/Shelly/.gitignore
```

- [ ] **Step 4: Update worklog memory**

Update `shelly-pty-overhaul-worklog.md` with all commits from this implementation.

- [ ] **Step 5: Final commit**

```bash
git add .gitignore
git commit -m "chore: add .superpowers/ to gitignore, cleanup"
```
