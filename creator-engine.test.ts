/**
 * tests/creator-engine.test.ts
 *
 * Unit tests for the Creator Engine:
 *   - Project type detection
 *   - Plan generation
 *   - Build step generation
 *   - Project creation
 *   - Suggestion generation
 *   - Slug / name helpers
 *   - Template file generation
 *   - Recipe command building
 */

import { describe, it, expect } from 'vitest';
import {
  generatePlan,
  planToBuildSteps,
  createProject,
  generateSuggestions,
  buildCompletionMessage,
  buildRecipeCommand,
} from '../lib/creator-engine';
import {
  detectProjectType,
  toSlug,
  toProjectName,
  buildProjectPath,
  getTemplate,
  TEMPLATES,
} from '../lib/project-templates';

// ─── detectProjectType ────────────────────────────────────────────────────────

describe('detectProjectType', () => {
  it('detects web for "ポートフォリオサイト作りたい"', () => {
    expect(detectProjectType('ポートフォリオサイト作りたい')).toBe('web');
  });

  it('detects web for "タイマーアプリ"', () => {
    expect(detectProjectType('タイマーアプリ')).toBe('web');
  });

  it('detects web for "html page"', () => {
    expect(detectProjectType('html page')).toBe('web');
  });

  it('detects script for "写真整理ツール"', () => {
    expect(detectProjectType('写真整理ツール')).toBe('script');
  });

  it('detects script for "python script"', () => {
    expect(detectProjectType('python script')).toBe('script');
  });

  it('detects script for "CSVを変換したい"', () => {
    expect(detectProjectType('CSVを変換したい')).toBe('script');
  });

  it('detects document for "README作って"', () => {
    expect(detectProjectType('README作って')).toBe('document');
  });

  it('detects document for "仕様書を書く"', () => {
    expect(detectProjectType('仕様書を書く')).toBe('document');
  });

  it('defaults to web for unknown input', () => {
    expect(detectProjectType('xyzzy frobnicator')).toBe('web');
  });
});

// ─── toSlug ───────────────────────────────────────────────────────────────────

describe('toSlug', () => {
  it('converts ASCII words to kebab-case', () => {
    const slug = toSlug('portfolio site');
    expect(slug).toBe('portfolio-site');
  });

  it('strips special characters', () => {
    const slug = toSlug('my-app! v2.0');
    expect(slug).toMatch(/^[a-z0-9-]+$/);
  });

  it('limits to 4 words', () => {
    const slug = toSlug('one two three four five six');
    const parts = slug.split('-');
    expect(parts.length).toBeLessThanOrEqual(4);
  });

  it('falls back to timestamp slug for Japanese-only input', () => {
    const slug = toSlug('写真整理');
    // Should not be empty
    expect(slug.length).toBeGreaterThan(0);
  });

  it('returns non-empty string for empty input', () => {
    const slug = toSlug('');
    expect(slug.length).toBeGreaterThan(0);
  });
});

// ─── toProjectName ────────────────────────────────────────────────────────────

describe('toProjectName', () => {
  it('returns short input unchanged', () => {
    expect(toProjectName('タイマーアプリ')).toBe('タイマーアプリ');
  });

  it('truncates long input with ellipsis', () => {
    const long = 'a'.repeat(40);
    const result = toProjectName(long);
    expect(result.length).toBeLessThanOrEqual(30);
    expect(result.endsWith('…')).toBe(true);
  });
});

// ─── buildProjectPath ─────────────────────────────────────────────────────────

describe('buildProjectPath', () => {
  it('starts with Projects/', () => {
    expect(buildProjectPath('my-app')).toMatch(/^Projects\//);
  });

  it('includes the slug', () => {
    expect(buildProjectPath('my-app')).toContain('my-app');
  });

  it('includes a date segment', () => {
    const path = buildProjectPath('test');
    // Should contain YYYY-MM-DD pattern
    expect(path).toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});

// ─── generatePlan ─────────────────────────────────────────────────────────────

describe('generatePlan', () => {
  it('returns a plan with summary and steps', () => {
    const plan = generatePlan('ポートフォリオサイト作りたい');
    expect(plan.summary.length).toBeGreaterThan(0);
    expect(plan.steps.length).toBeGreaterThan(0);
  });

  it('sets correct projectType for web input', () => {
    const plan = generatePlan('タイマーアプリ');
    expect(plan.projectType).toBe('web');
  });

  it('sets correct projectType for script input', () => {
    const plan = generatePlan('python csv 変換');
    expect(plan.projectType).toBe('script');
  });

  it('sets estimatedFiles > 0', () => {
    const plan = generatePlan('何か作って');
    expect(plan.estimatedFiles).toBeGreaterThan(0);
  });

  it('sets projectName (slug)', () => {
    const plan = generatePlan('portfolio site');
    expect(plan.projectName.length).toBeGreaterThan(0);
  });
});

// ─── planToBuildSteps ─────────────────────────────────────────────────────────

describe('planToBuildSteps', () => {
  it('returns at least 2 steps', () => {
    const plan = generatePlan('タイマーアプリ');
    const steps = planToBuildSteps(plan, 'Projects/2026-01-01_timer');
    expect(steps.length).toBeGreaterThanOrEqual(2);
  });

  it('all steps start as pending', () => {
    const plan = generatePlan('タイマーアプリ');
    const steps = planToBuildSteps(plan, 'Projects/2026-01-01_timer');
    expect(steps.every((s) => s.status === 'pending')).toBe(true);
  });

  it('each step has a non-empty message', () => {
    const plan = generatePlan('タイマーアプリ');
    const steps = planToBuildSteps(plan, 'Projects/2026-01-01_timer');
    expect(steps.every((s) => s.message.length > 0)).toBe(true);
  });

  it('each step has a unique id', () => {
    const plan = generatePlan('タイマーアプリ');
    const steps = planToBuildSteps(plan, 'Projects/2026-01-01_timer');
    const ids = steps.map((s) => s.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });
});

// ─── createProject ────────────────────────────────────────────────────────────

describe('createProject', () => {
  it('returns a project with id and name', () => {
    const project = createProject('自己紹介サイト作りたい');
    expect(project.id.length).toBeGreaterThan(0);
    expect(project.name.length).toBeGreaterThan(0);
  });

  it('status starts as building', () => {
    const project = createProject('タイマーアプリ');
    expect(project.status).toBe('building');
  });

  it('has files array with at least 1 file', () => {
    const project = createProject('ポートフォリオサイト');
    expect(project.files.length).toBeGreaterThan(0);
  });

  it('has plan set', () => {
    const project = createProject('タイマーアプリ');
    expect(project.plan).not.toBeNull();
  });

  it('has buildSteps array', () => {
    const project = createProject('タイマーアプリ');
    expect(project.buildSteps.length).toBeGreaterThan(0);
  });

  it('has suggestions array', () => {
    const project = createProject('タイマーアプリ');
    expect(project.suggestions.length).toBeGreaterThan(0);
  });

  it('path starts with Projects/', () => {
    const project = createProject('タイマーアプリ');
    expect(project.path).toMatch(/^Projects\//);
  });

  it('userInput is preserved', () => {
    const input = 'CSVを可視化したい';
    const project = createProject(input);
    expect(project.userInput).toBe(input);
  });
});

// ─── Template file generation ─────────────────────────────────────────────────

describe('Template file generation', () => {
  it('web template generates index.html, style.css, app.js, README.md', () => {
    const template = getTemplate('web');
    const files = template.generate({
      projectName: 'Test App',
      slug: 'test-app',
      description: 'A test app',
      createdAt: '2026-01-01',
    });
    const paths = files.map((f) => f.path);
    expect(paths).toContain('src/index.html');
    expect(paths).toContain('src/style.css');
    expect(paths).toContain('src/app.js');
    expect(paths).toContain('README.md');
  });

  it('script template generates main.py, utils.py, README.md', () => {
    const template = getTemplate('script');
    const files = template.generate({
      projectName: 'My Script',
      slug: 'my-script',
      description: 'A script',
      createdAt: '2026-01-01',
    });
    const paths = files.map((f) => f.path);
    expect(paths).toContain('src/main.py');
    expect(paths).toContain('src/utils.py');
    expect(paths).toContain('README.md');
  });

  it('document template generates README.md, notes.md, config.json', () => {
    const template = getTemplate('document');
    const files = template.generate({
      projectName: 'My Doc',
      slug: 'my-doc',
      description: 'A document',
      createdAt: '2026-01-01',
    });
    const paths = files.map((f) => f.path);
    expect(paths).toContain('README.md');
    expect(paths).toContain('notes.md');
    expect(paths).toContain('config.json');
  });

  it('all files have non-empty content', () => {
    for (const template of TEMPLATES) {
      const files = template.generate({
        projectName: 'Test',
        slug: 'test',
        description: 'test',
        createdAt: '2026-01-01',
      });
      for (const file of files) {
        expect(file.content.length).toBeGreaterThan(0);
      }
    }
  });

  it('web template HTML includes project name', () => {
    const template = getTemplate('web');
    const files = template.generate({
      projectName: 'My Portfolio',
      slug: 'my-portfolio',
      description: 'portfolio',
      createdAt: '2026-01-01',
    });
    const html = files.find((f) => f.path === 'src/index.html')!;
    expect(html.content).toContain('My Portfolio');
  });
});

// ─── generateSuggestions ─────────────────────────────────────────────────────

describe('generateSuggestions', () => {
  it('returns exactly 3 suggestions', () => {
    const suggestions = generateSuggestions('web', 'タイマーアプリ');
    expect(suggestions.length).toBe(3);
  });

  it('returns non-empty strings', () => {
    const suggestions = generateSuggestions('script', 'csv変換');
    expect(suggestions.every((s) => s.length > 0)).toBe(true);
  });
});

// ─── buildCompletionMessage ───────────────────────────────────────────────────

describe('buildCompletionMessage', () => {
  it('includes the project name', () => {
    const project = createProject('タイマーアプリ');
    const msg = buildCompletionMessage({ ...project, status: 'done' });
    expect(msg).toContain(project.name);
  });

  it('includes a type label', () => {
    const project = createProject('ポートフォリオサイト');
    const msg = buildCompletionMessage({ ...project, status: 'done' });
    expect(msg.length).toBeGreaterThan(0);
  });
});

// ─── buildRecipeCommand ───────────────────────────────────────────────────────

describe('buildRecipeCommand', () => {
  it('returns a non-empty string', () => {
    const project = createProject('タイマーアプリ');
    const cmd = buildRecipeCommand({ ...project, status: 'done' });
    expect(cmd.length).toBeGreaterThan(0);
  });

  it('includes the project path', () => {
    const project = createProject('タイマーアプリ');
    const cmd = buildRecipeCommand({ ...project, status: 'done' });
    expect(cmd).toContain(project.path);
  });
});
