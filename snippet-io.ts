/**
 * lib/snippet-io.ts
 *
 * Snippet Export / Import utilities.
 *
 * Export: serialize current snippets to a JSON payload and share via
 *         the system share sheet.
 * Import: read a JSON string, validate schema, resolve duplicates, and
 *         return a structured result without touching the store directly.
 *
 * Design goals:
 *  - Never crash on malformed input (all errors are returned, not thrown)
 *  - Non-destructive: existing data is never mutated until the caller
 *    explicitly applies the import result
 *  - Works on Android (Share API + DocumentPicker)
 */

import { Share, Platform } from 'react-native';
import { Snippet } from '@/store/types';

// ─── Export ───────────────────────────────────────────────────────────────────

export const SCHEMA_VERSION = 1;

export type SnippetExportPayload = {
  schemaVersion: number;
  exportedAt: string;       // ISO 8601
  device: string;           // platform info
  count: number;
  snippets: Snippet[];
};

/**
 * Build a JSON export payload from the given snippet list.
 */
export function buildExportPayload(snippets: Snippet[]): SnippetExportPayload {
  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    device: `${Platform.OS} ${Platform.Version ?? ''}`.trim(),
    count: snippets.length,
    snippets,
  };
}

/**
 * Serialize the payload to a formatted JSON string.
 */
export function serializePayload(payload: SnippetExportPayload): string {
  return JSON.stringify(payload, null, 2);
}

/**
 * Generate a recommended filename for the export.
 * Format: shelly-snippets-YYYYMMDD.json
 */
export function exportFilename(): string {
  const d = new Date();
  const ymd = [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('');
  return `shelly-snippets-${ymd}.json`;
}

/**
 * Export snippets via the system share sheet.
 * Returns true if the share sheet was shown, false if cancelled or failed.
 */
export async function exportSnippets(snippets: Snippet[]): Promise<boolean> {
  if (snippets.length === 0) {
    return false;
  }

  const payload = buildExportPayload(snippets);
  const json = serializePayload(payload);
  const filename = exportFilename();

  try {
    const result = await Share.share(
      {
        message: json,
        title: filename,
      },
      {
        dialogTitle: `Export ${snippets.length} snippet${snippets.length !== 1 ? 's' : ''}`,
        subject: filename,
      }
    );
    return result.action !== Share.dismissedAction;
  } catch {
    return false;
  }
}

// ─── Validation ───────────────────────────────────────────────────────────────

export type ValidationError =
  | 'INVALID_JSON'
  | 'MISSING_SCHEMA_VERSION'
  | 'UNSUPPORTED_SCHEMA_VERSION'
  | 'MISSING_SNIPPETS_ARRAY'
  | 'INVALID_SNIPPET_ENTRY';

export type ValidationResult =
  | { ok: true; payload: SnippetExportPayload }
  | { ok: false; error: ValidationError; detail?: string };

/**
 * Validate a raw JSON string as a Shelly snippet export.
 * Returns a typed result — never throws.
 */
export function validateSnippetJson(raw: string): ValidationResult {
  // 1. Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return { ok: false, error: 'INVALID_JSON', detail: String(e) };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: 'INVALID_JSON', detail: 'Root must be an object' };
  }

  const obj = parsed as Record<string, unknown>;

  // 2. schemaVersion
  if (!('schemaVersion' in obj)) {
    return { ok: false, error: 'MISSING_SCHEMA_VERSION' };
  }
  if (typeof obj.schemaVersion !== 'number' || obj.schemaVersion < 1) {
    return { ok: false, error: 'UNSUPPORTED_SCHEMA_VERSION', detail: String(obj.schemaVersion) };
  }
  if (obj.schemaVersion > SCHEMA_VERSION) {
    return {
      ok: false,
      error: 'UNSUPPORTED_SCHEMA_VERSION',
      detail: `File version ${obj.schemaVersion} > app version ${SCHEMA_VERSION}`,
    };
  }

  // 3. snippets array
  if (!Array.isArray(obj.snippets)) {
    return { ok: false, error: 'MISSING_SNIPPETS_ARRAY' };
  }

  // 4. Validate each snippet entry (minimal required fields)
  for (let i = 0; i < obj.snippets.length; i++) {
    const s = obj.snippets[i];
    if (
      typeof s !== 'object' ||
      s === null ||
      typeof (s as Record<string, unknown>).id !== 'string' ||
      typeof (s as Record<string, unknown>).command !== 'string' ||
      !(s as Record<string, unknown>).command
    ) {
      return {
        ok: false,
        error: 'INVALID_SNIPPET_ENTRY',
        detail: `Entry at index ${i} is missing required fields (id, command)`,
      };
    }
  }

  // Reconstruct a clean payload with defaults for optional fields
  const snippets: Snippet[] = (obj.snippets as Record<string, unknown>[]).map((s, i) => ({
    id: String(s.id ?? `imported-${Date.now()}-${i}`),
    title: typeof s.title === 'string' && s.title ? s.title : String(s.command).slice(0, 30),
    command: String(s.command).trim(),
    tags: Array.isArray(s.tags) ? (s.tags as unknown[]).map(String) : [],
    createdAt: typeof s.createdAt === 'number' ? s.createdAt : Date.now(),
    lastUsedAt: typeof s.lastUsedAt === 'number' ? s.lastUsedAt : Date.now(),
    useCount: typeof s.useCount === 'number' ? s.useCount : 0,
    scope: s.scope === 'session' ? 'session' : 'global',
  }));

  return {
    ok: true,
    payload: {
      schemaVersion: obj.schemaVersion as number,
      exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : new Date().toISOString(),
      device: typeof obj.device === 'string' ? obj.device : 'unknown',
      count: snippets.length,
      snippets,
    },
  };
}

// ─── Import ───────────────────────────────────────────────────────────────────

export type DuplicateStrategy = 'skip' | 'overwrite' | 'keepBoth';

export type ImportResult = {
  added: number;
  updated: number;
  skipped: number;
  failed: number;
  /** The final merged snippet list to persist */
  mergedSnippets: Snippet[];
};

/**
 * Merge incoming snippets into the existing list according to the chosen strategy.
 *
 * Duplicate definition: same `command` (trimmed, case-sensitive) AND same `scope`.
 *
 * This function is pure — it does NOT touch AsyncStorage or any store.
 * The caller is responsible for persisting `mergedSnippets`.
 */
export function mergeSnippets(
  existing: Snippet[],
  incoming: Snippet[],
  strategy: DuplicateStrategy
): ImportResult {
  const result: ImportResult = {
    added: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    mergedSnippets: [...existing],
  };

  for (const inc of incoming) {
    // Basic sanity check
    if (!inc.command?.trim()) {
      result.failed++;
      continue;
    }

    const dupIdx = result.mergedSnippets.findIndex(
      (e) => e.command === inc.command.trim() && e.scope === inc.scope
    );

    if (dupIdx === -1) {
      // No duplicate — always add
      result.mergedSnippets.push({
        ...inc,
        id: `snip-${Date.now()}-${Math.random().toString(36).slice(2, 7)}-imp`,
        command: inc.command.trim(),
      });
      result.added++;
    } else {
      // Duplicate found — apply strategy
      switch (strategy) {
        case 'skip':
          result.skipped++;
          break;

        case 'overwrite':
          result.mergedSnippets[dupIdx] = {
            ...result.mergedSnippets[dupIdx],
            title: inc.title,
            command: inc.command.trim(),
            tags: inc.tags,
            scope: inc.scope,
            // Preserve original createdAt; update lastUsedAt to now
            lastUsedAt: Date.now(),
          };
          result.updated++;
          break;

        case 'keepBoth': {
          // Append with a disambiguating suffix in the title
          const existingTitles = new Set(result.mergedSnippets.map((s) => s.title));
          let newTitle = inc.title;
          let suffix = 2;
          while (existingTitles.has(newTitle)) {
            newTitle = `${inc.title} (${suffix++})`;
          }
          result.mergedSnippets.push({
            ...inc,
            id: `snip-${Date.now()}-${Math.random().toString(36).slice(2, 7)}-dup`,
            title: newTitle,
            command: inc.command.trim(),
          });
          result.added++;
          break;
        }
      }
    }
  }

  return result;
}

/**
 * Human-readable summary of an import result.
 */
export function importSummaryText(result: ImportResult): string {
  const parts: string[] = [];
  if (result.added > 0) parts.push(`${result.added} 件追加`);
  if (result.updated > 0) parts.push(`${result.updated} 件更新`);
  if (result.skipped > 0) parts.push(`${result.skipped} 件スキップ`);
  if (result.failed > 0) parts.push(`${result.failed} 件失敗`);
  return parts.length > 0 ? parts.join(' / ') : '変更なし';
}

/**
 * Human-readable label for a ValidationError.
 */
export function validationErrorLabel(error: ValidationError): string {
  switch (error) {
    case 'INVALID_JSON':
      return 'JSONの形式が正しくありません';
    case 'MISSING_SCHEMA_VERSION':
      return 'schemaVersion が見つかりません（Shelly形式ではない可能性があります）';
    case 'UNSUPPORTED_SCHEMA_VERSION':
      return 'このファイルのバージョンには対応していません';
    case 'MISSING_SNIPPETS_ARRAY':
      return 'snippets 配列が見つかりません';
    case 'INVALID_SNIPPET_ENTRY':
      return 'スニペットのデータに不正なエントリが含まれています';
  }
}
