/**
 * lib/project-io.ts
 *
 * Creator Projectのエクスポート/インポートロジック。
 * - exportProjects: CreatorProject[] → JSON文字列（Share API用）
 * - resolveProjectImport: インポート時の重複解決
 * - applyProjectImport: ストアへの適用
 */

import { Share } from 'react-native';
import { CreatorProject } from '@/store/types';

// ─── Types ────────────────────────────────────────────────────────────────────

export type DuplicateAction = 'skip' | 'overwrite' | 'keep-both';

export interface ExportedProject {
  id: string;
  name: string;
  slug: string;
  projectType: string;
  createdAt: number;
  lastOpenedAt?: number;
  path: string;
  status: string;
  userInput: string;
  planSummary?: string;
  planSteps?: string[];
  filesManifest?: string[];
  resultSuggestions?: string[];
  tags?: string[];
  termuxWritten?: boolean;
}

export interface ProjectExportPayload {
  version: number;
  exportedAt: number;
  projects: ExportedProject[];
}

export type ProjectImportAction = 'add' | 'overwrite' | 'skip' | 'keep-both' | 'error';

export interface ProjectImportItem {
  exported: ExportedProject;
  action: ProjectImportAction;
  existingId?: string;
  errorMessage?: string;
}

export interface ProjectImportResult {
  items: ProjectImportItem[];
  addCount: number;
  updateCount: number;
  skipCount: number;
  failCount: number;
}

// ─── Export ───────────────────────────────────────────────────────────────────

export async function exportProjects(projects: CreatorProject[]): Promise<boolean> {
  if (projects.length === 0) return false;
  const json = exportProjectsToJson(projects);
  try {
    const result = await Share.share({ message: json, title: 'shelly-projects.json' });
    return result.action !== Share.dismissedAction;
  } catch {
    return false;
  }
}

export function exportProjectsToJson(projects: CreatorProject[]): string {
  const payload: ProjectExportPayload = {
    version: 1,
    exportedAt: Date.now(),
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      projectType: p.projectType,
      createdAt: p.createdAt,
      lastOpenedAt: p.lastOpenedAt,
      path: p.path,
      status: p.status,
      userInput: p.userInput,
      planSummary: p.plan?.summary,
      planSteps: p.plan?.steps,
      filesManifest: p.files.map((f) => f.path),
      resultSuggestions: p.suggestions,
      tags: p.tags,
      termuxWritten: p.termuxWritten,
    })),
  };
  return JSON.stringify(payload, null, 2);
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validateExportedProject(e: unknown): string | null {
  if (!e || typeof e !== 'object') return 'Invalid project data';
  const p = e as Record<string, unknown>;
  if (typeof p.id !== 'string') return 'Missing id';
  if (typeof p.name !== 'string') return 'Missing name';
  if (typeof p.slug !== 'string') return 'Missing slug';
  if (typeof p.userInput !== 'string') return 'Missing userInput';
  return null;
}

function findDuplicate(exported: ExportedProject, existing: CreatorProject[]): CreatorProject | undefined {
  return existing.find((p) => p.id === exported.id || p.slug === exported.slug);
}

// ─── Conversion ───────────────────────────────────────────────────────────────

function toCreatorProject(e: ExportedProject): CreatorProject {
  return {
    id: e.id,
    name: e.name,
    slug: e.slug,
    projectType: (e.projectType as CreatorProject['projectType']) ?? 'unknown',
    createdAt: e.createdAt,
    lastOpenedAt: e.lastOpenedAt,
    path: e.path,
    files: [],
    status: (e.status as CreatorProject['status']) ?? 'done',
    userInput: e.userInput,
    plan: e.planSummary
      ? {
          summary: e.planSummary,
          steps: e.planSteps ?? [],
          projectType: (e.projectType as CreatorProject['projectType']) ?? 'unknown',
          projectName: e.slug,
          estimatedFiles: e.filesManifest?.length ?? 0,
        }
      : null,
    buildSteps: [],
    suggestions: e.resultSuggestions ?? [],
    tags: e.tags ?? [],
    termuxWritten: e.termuxWritten ?? false,
  };
}

// ─── Resolve Import ───────────────────────────────────────────────────────────

export function resolveProjectImport(
  payload: ProjectExportPayload,
  existing: CreatorProject[],
  duplicateAction: DuplicateAction
): ProjectImportResult {
  const items: ProjectImportItem[] = [];
  let addCount = 0;
  let updateCount = 0;
  let skipCount = 0;
  let failCount = 0;

  for (const raw of payload.projects) {
    const validationError = validateExportedProject(raw);
    if (validationError) {
      items.push({ exported: raw, action: 'error', errorMessage: validationError });
      failCount++;
      continue;
    }

    const duplicate = findDuplicate(raw, existing);

    if (!duplicate) {
      items.push({ exported: raw, action: 'add' });
      addCount++;
    } else {
      switch (duplicateAction) {
        case 'skip':
          items.push({ exported: raw, action: 'skip', existingId: duplicate.id });
          skipCount++;
          break;
        case 'overwrite':
          items.push({ exported: raw, action: 'overwrite', existingId: duplicate.id });
          updateCount++;
          break;
        case 'keep-both': {
          const newId = `${raw.id}-copy-${Date.now()}`;
          const renamed: ExportedProject = {
            ...raw,
            id: newId,
            name: `${raw.name}(2)`,
            slug: `${raw.slug}-copy`,
          };
          items.push({ exported: renamed, action: 'keep-both', existingId: duplicate.id });
          addCount++;
          break;
        }
      }
    }
  }

  return { items, addCount, updateCount, skipCount, failCount };
}

// ─── Apply Import ─────────────────────────────────────────────────────────────

export function applyProjectImport(
  result: ProjectImportResult,
  existing: CreatorProject[]
): CreatorProject[] {
  let projects = [...existing];

  for (const item of result.items) {
    if (item.action === 'skip' || item.action === 'error') continue;

    const project = toCreatorProject(item.exported);

    if (item.action === 'add' || item.action === 'keep-both') {
      projects = [project, ...projects];
    } else if (item.action === 'overwrite' && item.existingId) {
      projects = projects.map((p) => (p.id === item.existingId ? project : p));
    }
  }

  return projects;
}

// ─── Parse payload from JSON string ──────────────────────────────────────────

export function parseProjectExportPayload(json: string): ProjectExportPayload | null {
  try {
    const data = JSON.parse(json);
    if (!data || typeof data !== 'object') return null;
    if (!Array.isArray(data.projects)) return null;
    return data as ProjectExportPayload;
  } catch {
    return null;
  }
}
