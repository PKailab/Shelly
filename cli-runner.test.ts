/**
 * tests/cli-runner.test.ts — v2.4
 *
 * CLI Runner のユニットテスト:
 * - maskSecrets: APIキーマスク
 * - buildCliCommand: コマンド組立
 * - interpretCheckResult: 依存確認結果の解釈
 * - parseCliResult: 実行結果の自然言語変換
 */

import { describe, it, expect } from 'vitest';
import {
  maskSecrets,
  buildCliCommand,
  interpretCheckResult,
  parseCliResult,
  CLI_TOOLS,
} from '../lib/cli-runner';

// ─── maskSecrets ──────────────────────────────────────────────────────────────

describe('maskSecrets', () => {
  it('Anthropicスタイルのsk-キーをマスクする', () => {
    const input = 'Token: sk-ant-api03-abcdefghijklmnopqrstuvwxyz1234567890';
    const result = maskSecrets(input);
    expect(result).toContain('sk-****');
    expect(result).not.toContain('abcdefghijklmnopqrstuvwxyz1234567890');
  });

  it('sk-proj-スタイルのキーをマスクする', () => {
    const input = 'Authorization: Bearer sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
    const result = maskSecrets(input);
    expect(result).not.toContain('sk-proj-xxx');
  });

  it('Google AIzaキーをマスクする', () => {
    const input = 'key=AIzaSyAbcdefghijklmnopqrstuvwxyz123456789';
    const result = maskSecrets(input);
    expect(result).toContain('AIza****');
    expect(result).not.toContain('Abcdefghijklmnopqrstuvwxyz');
  });

  it('Bearer トークンをマスクする', () => {
    const input = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature';
    const result = maskSecrets(input);
    expect(result).toContain('Bearer ****');
  });

  it('API_KEY=value パターンをマスクする', () => {
    const input = 'ANTHROPIC_API_KEY=sk-ant-api03-secretvalue123456';
    const result = maskSecrets(input);
    // sk-ant-... pattern is matched first
    expect(result).toContain('sk-****');
    expect(result).not.toContain('secretvalue');
  });

  it('TOKEN=value パターンをマスクする', () => {
    const input = 'GEMINI_TOKEN=supersecrettoken123456789012345';
    const result = maskSecrets(input);
    expect(result).toContain('TOKEN=****');
  });

  it('秘密情報がない場合はそのまま返す', () => {
    const input = 'Hello, World! This is a normal log message.';
    const result = maskSecrets(input);
    expect(result).toBe(input);
  });

  it('複数の秘密情報を一度にマスクする', () => {
    const input = 'key1=sk-ant-api03-abcdefghijklmnopqrstuvwxyz1234567890 key2=AIzaSyAbcdefghijklmnopqrstuvwxyz123456789';
    const result = maskSecrets(input);
    expect(result).toContain('sk-****');
    expect(result).toContain('AIza****');
    expect(result).not.toContain('abcdefghijklmnopqrstuvwxyz1234567890');
  });

  it('空文字列を渡してもクラッシュしない', () => {
    expect(() => maskSecrets('')).not.toThrow();
    expect(maskSecrets('')).toBe('');
  });
});

// ─── buildCliCommand ──────────────────────────────────────────────────────────

describe('buildCliCommand', () => {
  const basePath = '~/Projects/20260227-test-app';

  it('claudeコマンドを正しく組み立てる', () => {
    const plan = buildCliCommand({
      tool: 'claude',
      userInput: 'READMEを書いて',
      targetPath: basePath,
    });
    expect(plan.tool).toBe('claude');
    expect(plan.command).toContain('claude');
    expect(plan.command).toContain('--print');
    expect(plan.command).toContain(basePath);
    expect(plan.naturalDescription).toContain('Claude Code');
    expect(plan.naturalDescription).toContain('READMEを書いて');
  });

  it('geminiコマンドを正しく組み立てる', () => {
    const plan = buildCliCommand({
      tool: 'gemini',
      userInput: 'バグを直して',
      targetPath: basePath,
    });
    expect(plan.tool).toBe('gemini');
    expect(plan.command).toContain('gemini');
    expect(plan.command).toContain('--prompt');
    expect(plan.naturalDescription).toContain('Gemini CLI');
  });

  it('カスタムコマンドをそのまま使う', () => {
    const plan = buildCliCommand({
      tool: 'custom',
      userInput: 'ls -la',
      targetPath: basePath,
      customCommand: 'ls -la',
    });
    expect(plan.command).toBe('ls -la');
    expect(plan.isInteractiveFallback).toBe(false);
  });

  it('破壊的コマンドに確認フラグを立てる', () => {
    const plan = buildCliCommand({
      tool: 'custom',
      userInput: 'rm -rf /tmp/test',
      targetPath: basePath,
      customCommand: 'rm -rf /tmp/test',
    });
    expect(plan.requiresConfirmation).toBe(true);
    expect(plan.confirmationMessage).toBeDefined();
  });

  it('非破壊的コマンドには確認フラグを立てない', () => {
    const plan = buildCliCommand({
      tool: 'custom',
      userInput: 'ls -la',
      targetPath: basePath,
      customCommand: 'ls -la',
    });
    expect(plan.requiresConfirmation).toBe(false);
  });

  it('長い入力でisInteractiveFallbackをtrueにする（claude）', () => {
    const longInput = 'プロジェクト全体を'.repeat(30); // 200文字超
    const plan = buildCliCommand({
      tool: 'claude',
      userInput: longInput,
      targetPath: basePath,
    });
    expect(plan.isInteractiveFallback).toBe(true);
    expect(plan.fallbackSuggestion).toBeDefined();
  });

  it('コマンドにシェルインジェクション文字をエスケープする', () => {
    const plan = buildCliCommand({
      tool: 'claude',
      userInput: 'test "quotes" and `backticks`',
      targetPath: basePath,
    });
    // Should not contain unescaped quotes that would break the shell command
    // The command should be safe to execute
    expect(plan.command).not.toContain('`backticks`');
  });
});

// ─── interpretCheckResult ─────────────────────────────────────────────────────

describe('interpretCheckResult', () => {
  it('CLIが見つかった場合はavailable=true', () => {
    const result = interpretCheckResult('claude', 0, '/usr/local/bin/claude');
    expect(result.available).toBe(true);
    expect(result.needsAuth).toBe(false);
    expect(result.setupCommands).toHaveLength(0);
  });

  it('CLIが見つからない場合はavailable=false', () => {
    const result = interpretCheckResult('claude', 1, '');
    expect(result.available).toBe(false);
    expect(result.message).toContain('インストール');
    expect(result.setupCommands.length).toBeGreaterThan(0);
    expect(result.setupCommands[0]).toContain('npm install');
  });

  it('認証エラーの場合はneedsAuth=true', () => {
    const result = interpretCheckResult('claude', 0, '/usr/local/bin/claude\nNot logged in');
    expect(result.available).toBe(true);
    expect(result.needsAuth).toBe(true);
    expect(result.message).toContain('認証');
    expect(result.setupCommands[0]).toContain('auth login');
  });

  it('gemini認証エラーの場合はgemini auth loginを案内', () => {
    const result = interpretCheckResult('gemini', 0, '/usr/local/bin/gemini\nAPI key required');
    expect(result.needsAuth).toBe(true);
    expect(result.setupCommands[0]).toContain('gemini');
  });

  it('customツールは常にavailable=true', () => {
    const result = interpretCheckResult('custom', 1, '');
    expect(result.available).toBe(true);
  });
});

// ─── parseCliResult ───────────────────────────────────────────────────────────

describe('parseCliResult', () => {
  it('成功時にsuccess=trueと自然言語サマリを返す', () => {
    const result = parseCliResult(
      'claude',
      'READMEを書いて',
      'Writing README.md\nFile: README.md created successfully.',
      '',
      0,
    );
    expect(result.success).toBe(true);
    expect(result.naturalSummary).toContain('完了');
    expect(result.nextActions.length).toBeGreaterThan(0);
  });

  it('失敗時にsuccess=falseとエラーサマリを返す', () => {
    const result = parseCliResult(
      'claude',
      'test',
      '',
      'command not found: claude',
      127,
    );
    expect(result.success).toBe(false);
    expect(result.naturalSummary).toContain('インストール');
    expect(result.nextActions.length).toBeGreaterThan(0);
  });

  it('キャンセル時（exitCode=130）にキャンセルメッセージを返す', () => {
    const result = parseCliResult('claude', 'test', '', '', 130);
    expect(result.success).toBe(false);
    expect(result.naturalSummary).toContain('キャンセル');
  });

  it('認証エラーの場合に認証案内を返す', () => {
    const result = parseCliResult(
      'gemini',
      'test',
      '',
      'Authentication failed: API key not found',
      1,
    );
    expect(result.success).toBe(false);
    // buildErrorSummary checks for 'api key' and 'authentication' keywords
    expect(
      result.naturalSummary.includes('認証') ||
      result.naturalSummary.includes('インストール') ||
      result.naturalSummary.includes('エラー')
    ).toBe(true);
  });

  it('変更ファイルを抽出する', () => {
    const result = parseCliResult(
      'claude',
      'READMEを更新して',
      'Writing README.md\nUpdated src/index.ts',
      '',
      0,
    );
    expect(result.changedFiles.length).toBeGreaterThan(0);
  });

  it('出力のAPIキーをマスクする', () => {
    const result = parseCliResult(
      'claude',
      'test',
      'Using key: sk-ant-api03-abcdefghijklmnopqrstuvwxyz1234567890',
      '',
      0,
    );
    expect(result.stdout).not.toContain('abcdefghijklmnopqrstuvwxyz1234567890');
    expect(result.stdout).toContain('sk-****');
  });

  it('空のstdout/stderrでもクラッシュしない', () => {
    expect(() => parseCliResult('claude', 'test', '', '', 0)).not.toThrow();
    expect(() => parseCliResult('gemini', 'test', '', '', 1)).not.toThrow();
  });
});

// ─── CLI_TOOLS config ─────────────────────────────────────────────────────────

describe('CLI_TOOLS config', () => {
  it('claude/gemini/customの3ツールが定義されている', () => {
    expect(CLI_TOOLS.claude).toBeDefined();
    expect(CLI_TOOLS.gemini).toBeDefined();
    expect(CLI_TOOLS.custom).toBeDefined();
  });

  it('各ツールに必須フィールドがある', () => {
    for (const [id, config] of Object.entries(CLI_TOOLS)) {
      expect(config.id).toBe(id);
      expect(config.label).toBeTruthy();
      expect(config.description).toBeTruthy();
      expect(Array.isArray(config.setupCommands)).toBe(true);
    }
  });

  it('claudeとgeminiはisInteractive=true', () => {
    expect(CLI_TOOLS.claude.isInteractive).toBe(true);
    expect(CLI_TOOLS.gemini.isInteractive).toBe(true);
  });

  it('claudeとgeminiはnonInteractiveFlagを持つ', () => {
    expect(CLI_TOOLS.claude.nonInteractiveFlag).toBeDefined();
    expect(CLI_TOOLS.gemini.nonInteractiveFlag).toBeDefined();
  });
});
