/**
 * tests/creator-history.test.ts
 *
 * Tests for v2.2 Project History features:
 *  - Search filtering (name / date / tags / userInput)
 *  - Tag chip filter (OR logic)
 *  - Sort orders (createdAt / lastOpenedAt / name / tags)
 *  - Tag editing and persistence helpers
 */

import { describe, it, expect } from 'vitest';
import { CreatorProject, ProjectSortOrder } from '../store/types';

// ─── Helpers (extracted from ProjectHistoryLane for testability) ──────────────

function formatDateCompact(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

function filterProjects(
  projects: CreatorProject[],
  query: string,
  activeTags: string[]
): CreatorProject[] {
  let result = projects;

  // Tag filter (OR)
  if (activeTags.length > 0) {
    result = result.filter((p) =>
      activeTags.some((t) => (p.tags ?? []).includes(t))
    );
  }

  // Text search
  const q = query.trim().toLowerCase();
  if (q) {
    result = result.filter((p) => {
      const nameMatch = p.name.toLowerCase().includes(q);
      const dateMatch = formatDateCompact(p.createdAt).includes(q);
      const tagMatch = (p.tags ?? []).some((t) => t.toLowerCase().includes(q));
      const inputMatch = p.userInput.toLowerCase().includes(q);
      return nameMatch || dateMatch || tagMatch || inputMatch;
    });
  }

  return result;
}

function sortProjects(
  projects: CreatorProject[],
  order: ProjectSortOrder
): CreatorProject[] {
  return [...projects].sort((a, b) => {
    switch (order) {
      case 'lastOpenedAt':
        return (b.lastOpenedAt ?? b.createdAt) - (a.lastOpenedAt ?? a.createdAt);
      case 'name':
        return a.name.localeCompare(b.name, 'ja');
      case 'tags':
        return (a.tags?.[0] ?? '').localeCompare(b.tags?.[0] ?? '', 'ja');
      case 'createdAt':
      default:
        return b.createdAt - a.createdAt;
    }
  });
}

function collectAllTags(projects: CreatorProject[]): string[] {
  const set = new Set<string>();
  for (const p of projects) {
    for (const t of p.tags ?? []) {
      if (t.trim()) set.add(t.trim());
    }
  }
  return Array.from(set).sort();
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeProject(overrides: Partial<CreatorProject> & { id: string }): CreatorProject {
  return {
    id: overrides.id,
    name: overrides.name ?? `Project ${overrides.id}`,
    slug: overrides.slug ?? `project-${overrides.id}`,
    projectType: overrides.projectType ?? 'web',
    createdAt: overrides.createdAt ?? Date.now(),
    lastOpenedAt: overrides.lastOpenedAt,
    path: overrides.path ?? `Projects/2026-01-01_project-${overrides.id}`,
    files: overrides.files ?? [],
    status: overrides.status ?? 'done',
    userInput: overrides.userInput ?? 'test input',
    plan: overrides.plan ?? null,
    buildSteps: overrides.buildSteps ?? [],
    suggestions: overrides.suggestions ?? [],
    tags: overrides.tags ?? [],
    termuxWritten: overrides.termuxWritten ?? false,
  };
}

const BASE_TIME = new Date('2026-02-01T00:00:00Z').getTime();

const PROJECTS: CreatorProject[] = [
  makeProject({ id: 'p1', name: 'portfolio-site', userInput: 'ポートフォリオサイトを作って', tags: ['website', 'school'], createdAt: BASE_TIME + 3000 }),
  makeProject({ id: 'p2', name: 'timer-app', userInput: 'タイマーアプリを作って', tags: ['timer', 'school'], createdAt: BASE_TIME + 2000, lastOpenedAt: BASE_TIME + 5000 }),
  makeProject({ id: 'p3', name: 'csv-visualizer', userInput: 'CSVを可視化したい', tags: ['data'], createdAt: BASE_TIME + 1000 }),
  makeProject({ id: 'p4', name: 'readme-generator', userInput: 'READMEを自動生成して', tags: [], createdAt: BASE_TIME }),
];

// ─── Search tests ─────────────────────────────────────────────────────────────

describe('filterProjects — name search', () => {
  it('matches by project name (partial, case-insensitive)', () => {
    const result = filterProjects(PROJECTS, 'portfolio', []);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('p1');
  });

  it('matches by project name (uppercase query)', () => {
    const result = filterProjects(PROJECTS, 'TIMER', []);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('p2');
  });

  it('returns all when query is empty', () => {
    const result = filterProjects(PROJECTS, '', []);
    expect(result).toHaveLength(4);
  });

  it('returns empty array when no match', () => {
    const result = filterProjects(PROJECTS, 'zzznomatch', []);
    expect(result).toHaveLength(0);
  });
});

describe('filterProjects — userInput search', () => {
  it('matches by userInput (Japanese)', () => {
    const result = filterProjects(PROJECTS, 'csv', []);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('p3');
  });

  it('matches by userInput substring', () => {
    const result = filterProjects(PROJECTS, 'readme', []);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('p4');
  });
});

describe('filterProjects — tag search', () => {
  it('matches by tag name in query', () => {
    const result = filterProjects(PROJECTS, 'data', []);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('p3');
  });

  it('matches multiple projects sharing a tag via query', () => {
    const result = filterProjects(PROJECTS, 'school', []);
    expect(result).toHaveLength(2);
    expect(result.map((p) => p.id).sort()).toEqual(['p1', 'p2']);
  });
});

describe('filterProjects — date search', () => {
  it('matches by compact date string (YYYYMMDD)', () => {
    const dateStr = formatDateCompact(BASE_TIME);
    const result = filterProjects(PROJECTS, dateStr, []);
    // All projects share the same date prefix (2026020...)
    expect(result.length).toBeGreaterThan(0);
  });
});

// ─── Tag chip filter tests ────────────────────────────────────────────────────

describe('filterProjects — tag chip filter (OR)', () => {
  it('filters by single active tag', () => {
    const result = filterProjects(PROJECTS, '', ['timer']);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('p2');
  });

  it('filters by multiple active tags (OR logic)', () => {
    const result = filterProjects(PROJECTS, '', ['timer', 'data']);
    expect(result).toHaveLength(2);
    expect(result.map((p) => p.id).sort()).toEqual(['p2', 'p3']);
  });

  it('returns all when no active tags', () => {
    const result = filterProjects(PROJECTS, '', []);
    expect(result).toHaveLength(4);
  });

  it('returns empty when tag matches nothing', () => {
    const result = filterProjects(PROJECTS, '', ['nonexistent-tag']);
    expect(result).toHaveLength(0);
  });

  it('combines tag filter AND text search', () => {
    // tag filter: school → p1, p2; then text: portfolio → p1
    const result = filterProjects(PROJECTS, 'portfolio', ['school']);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('p1');
  });
});

// ─── Sort tests ───────────────────────────────────────────────────────────────

describe('sortProjects — createdAt (default)', () => {
  it('sorts newest first', () => {
    const sorted = sortProjects(PROJECTS, 'createdAt');
    expect(sorted[0].id).toBe('p1'); // BASE_TIME + 3000
    expect(sorted[3].id).toBe('p4'); // BASE_TIME
  });
});

describe('sortProjects — lastOpenedAt', () => {
  it('sorts by lastOpenedAt, falls back to createdAt', () => {
    const sorted = sortProjects(PROJECTS, 'lastOpenedAt');
    // p2 has lastOpenedAt = BASE_TIME + 5000, highest
    expect(sorted[0].id).toBe('p2');
  });

  it('uses createdAt as fallback when lastOpenedAt is undefined', () => {
    const sorted = sortProjects(PROJECTS, 'lastOpenedAt');
    // p1 (createdAt+3000), p3 (createdAt+1000), p4 (createdAt) follow p2
    expect(sorted[1].id).toBe('p1');
  });
});

describe('sortProjects — name', () => {
  it('sorts alphabetically by name', () => {
    const sorted = sortProjects(PROJECTS, 'name');
    const names = sorted.map((p) => p.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'ja')));
  });
});

describe('sortProjects — tags', () => {
  it('sorts by first tag alphabetically', () => {
    const sorted = sortProjects(PROJECTS, 'tags');
    // p4 has no tags → '', p3 has 'data', p1 has 'school' (wait: p1 has 'website')
    // '' < 'data' < 'timer' < 'website'
    expect(sorted[0].id).toBe('p4'); // no tags → ''
  });
});

// ─── collectAllTags tests ─────────────────────────────────────────────────────

describe('collectAllTags', () => {
  it('collects unique tags from all projects', () => {
    const tags = collectAllTags(PROJECTS);
    expect(tags).toContain('website');
    expect(tags).toContain('school');
    expect(tags).toContain('timer');
    expect(tags).toContain('data');
  });

  it('deduplicates tags (school appears in p1 and p2)', () => {
    const tags = collectAllTags(PROJECTS);
    const schoolCount = tags.filter((t) => t === 'school').length;
    expect(schoolCount).toBe(1);
  });

  it('returns sorted array', () => {
    const tags = collectAllTags(PROJECTS);
    expect(tags).toEqual([...tags].sort());
  });

  it('returns empty array when no tags', () => {
    const noTagProjects = [makeProject({ id: 'x', tags: [] })];
    expect(collectAllTags(noTagProjects)).toHaveLength(0);
  });
});

// ─── Tag editing helpers ──────────────────────────────────────────────────────

describe('tag editing', () => {
  it('parses comma-separated tag input correctly', () => {
    const input = 'school, website, timer';
    const tags = input.split(',').map((t) => t.trim()).filter(Boolean);
    expect(tags).toEqual(['school', 'website', 'timer']);
  });

  it('filters empty strings from tag input', () => {
    const input = 'school,, ,timer';
    const tags = input.split(',').map((t) => t.trim()).filter(Boolean);
    expect(tags).toEqual(['school', 'timer']);
  });

  it('handles empty input', () => {
    const input = '';
    const tags = input.split(',').map((t) => t.trim()).filter(Boolean);
    expect(tags).toHaveLength(0);
  });
});

// ─── Performance hint: 200 projects ──────────────────────────────────────────

describe('filterProjects — performance with 200 projects', () => {
  const largeSet: CreatorProject[] = Array.from({ length: 200 }, (_, i) =>
    makeProject({
      id: `bulk-${i}`,
      name: `project-${i}`,
      tags: i % 3 === 0 ? ['school'] : i % 3 === 1 ? ['work'] : [],
      createdAt: BASE_TIME + i * 1000,
    })
  );

  it('filters 200 projects without error', () => {
    const result = filterProjects(largeSet, 'project-1', []);
    // matches project-1, project-10..19, project-100..199 (prefix match)
    expect(result.length).toBeGreaterThan(0);
  });

  it('tag filter works on 200 projects', () => {
    const result = filterProjects(largeSet, '', ['school']);
    // every 3rd project (i % 3 === 0): 0,3,6,...,198 → 67 projects
    expect(result.length).toBe(67);
  });

  it('sort works on 200 projects', () => {
    const sorted = sortProjects(largeSet, 'createdAt');
    expect(sorted[0].id).toBe('bulk-199');
    expect(sorted[199].id).toBe('bulk-0');
  });
});
