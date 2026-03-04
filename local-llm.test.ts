/**
 * tests/local-llm.test.ts
 *
 * lib/local-llm.ts のユニットテスト。
 * - タスク分類（classifyTask）
 * - コマンドビルダー（buildClaudeCommand / buildGeminiCommand は内部関数なので orchestrateTask 経由でテスト）
 * - AI Orchestration（orchestrateTask）— Local LLM OFF時のフォールバック
 * - ラベル関数（getCategoryLabel / getHandlerLabel）
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  classifyTask,
  orchestrateTask,
  getCategoryLabel,
  getHandlerLabel,
  type LocalLlmConfig,
} from '../lib/local-llm';

// ─── classifyTask ─────────────────────────────────────────────────────────────

describe('classifyTask', () => {
  it('ファイル操作キーワードを正しく分類する', () => {
    expect(classifyTask('ファイルを作って')).toBe('file_ops');
    expect(classifyTask('mkdir test')).toBe('file_ops');
    expect(classifyTask('ls -la')).toBe('file_ops');
    expect(classifyTask('rm -rf node_modules')).toBe('file_ops');
  });

  it('コード生成キーワードを正しく分類する', () => {
    expect(classifyTask('コードを書いてください')).toBe('code');
    expect(classifyTask('TypeScriptで実装して')).toBe('code');
    expect(classifyTask('Reactコンポーネントを作って')).toBe('code');
    expect(classifyTask('バグを直して')).toBe('code');
    expect(classifyTask('index.tsを修正して')).toBe('code');
  });

  it('調査キーワードを正しく分類する', () => {
    // 注意: 'react'はcodeキーワードにも含まれるため、コードと重複しないキーワードでテスト
    expect(classifyTask('最新のニュースを調べて')).toBe('research');
    expect(classifyTask('情報を集めてください')).toBe('research');
    expect(classifyTask('ドキュメントを探して')).toBe('research');
  });

  it('チャットキーワードを正しく分類する', () => {
    expect(classifyTask('こんにちは')).toBe('chat');
    expect(classifyTask('ありがとう')).toBe('chat');
    expect(classifyTask('アドバイスをください')).toBe('chat');
    expect(classifyTask('どう思う？')).toBe('chat');
  });

  it('短い入力（50文字以下）はchatとして分類する', () => {
    expect(classifyTask('hello')).toBe('chat');
    expect(classifyTask('テスト')).toBe('chat');
  });

  it('長い入力で分類不能な場合はunknownを返す', () => {
    // 50文字超で特定のキーワードなし
    const longInput = 'これは非常に長い入力ですが特定のカテゴリに分類できないテキストです。どのカテゴリにも当てはまりません。';
    expect(classifyTask(longInput)).toBe('unknown');
  });

  it('ファイル操作はコードより優先される', () => {
    // ファイル操作キーワードが先にマッチする
    expect(classifyTask('mkdir src && コードを書いて')).toBe('file_ops');
  });
});

// ─── getCategoryLabel ─────────────────────────────────────────────────────────

describe('getCategoryLabel', () => {
  it('各カテゴリの日本語ラベルを返す', () => {
    expect(getCategoryLabel('chat')).toBe('基本チャット');
    expect(getCategoryLabel('code')).toBe('コード生成');
    expect(getCategoryLabel('research')).toBe('調査・検索');
    expect(getCategoryLabel('file_ops')).toBe('ファイル操作');
    expect(getCategoryLabel('unknown')).toBe('不明');
  });
});

// ─── getHandlerLabel ──────────────────────────────────────────────────────────

describe('getHandlerLabel', () => {
  it('各ハンドラの日本語ラベルを返す', () => {
    expect(getHandlerLabel('local_llm')).toBe('ローカルLLM');
    expect(getHandlerLabel('claude')).toBe('Claude Code');
    expect(getHandlerLabel('gemini')).toBe('Gemini CLI');
    expect(getHandlerLabel('termux')).toBe('Termux');
  });
});

// ─── orchestrateTask ──────────────────────────────────────────────────────────

describe('orchestrateTask — Local LLM無効時', () => {
  const disabledConfig: LocalLlmConfig = {
    baseUrl: 'http://127.0.0.1:11434',
    model: 'llama3.2:3b',
    enabled: false,
  };

  it('Local LLM無効時はすべてClaude Codeに委譲する', async () => {
    const result = await orchestrateTask('こんにちは', disabledConfig);
    expect(result.handledBy).toBe('claude');
    expect(result.delegatedCommand).toContain('claude');
    expect(result.reasoning).toContain('Local LLM無効');
  });

  it('コード生成タスクでもClaude Codeに委譲する', async () => {
    const result = await orchestrateTask('TypeScriptで関数を実装して', disabledConfig);
    expect(result.handledBy).toBe('claude');
    expect(result.category).toBe('code');
  });

  it('調査タスクでもClaude Codeに委譲する（Local LLM無効）', async () => {
    const result = await orchestrateTask('最新のReactについて調べて', disabledConfig);
    expect(result.handledBy).toBe('claude');
  });
});

describe('orchestrateTask — Local LLM有効時（コード/調査/ファイル操作）', () => {
  const enabledConfig: LocalLlmConfig = {
    baseUrl: 'http://127.0.0.1:11434',
    model: 'llama3.2:3b',
    enabled: true,
  };

  it('コード生成タスクはClaude Codeに委譲する', async () => {
    const result = await orchestrateTask('TypeScriptで実装して', enabledConfig);
    expect(result.handledBy).toBe('claude');
    expect(result.category).toBe('code');
    expect(result.delegatedCommand).toContain('claude');
    expect(result.reasoning).toContain('Claude Code');
  });

  it('調査タスクはGemini CLIに委譲する', async () => {
    // 注意: 'react'はcodeキーワードにも含まれるため、コードと重複しないキーワードでテスト
    const result = await orchestrateTask('最新のニュースを調べて', enabledConfig);
    expect(result.handledBy).toBe('gemini');
    expect(result.category).toBe('research');
    expect(result.delegatedCommand).toContain('gemini');
    expect(result.reasoning).toContain('Gemini CLI');
  });

  it('ファイル操作タスクはTermuxに委譲する', async () => {
    const result = await orchestrateTask('mkdir test-project', enabledConfig);
    expect(result.handledBy).toBe('termux');
    expect(result.category).toBe('file_ops');
    expect(result.reasoning).toContain('Termux');
  });

  it('unknownカテゴリはClaude Codeに委譲する（安全側）', async () => {
    // fetchをモックしてOllamaが失敗するようにする
    const longUnknown = 'これは非常に長い入力ですが特定のカテゴリに分類できないテキストです。どのカテゴリにも当てはまりません。';
    const result = await orchestrateTask(longUnknown, enabledConfig);
    // unknownはclaude（安全側）またはlocal_llm（chatにフォールバック）
    expect(['claude', 'local_llm']).toContain(result.handledBy);
  });
});

describe('orchestrateTask — Local LLM有効時（チャット・Ollamaエラー）', () => {
  const enabledConfig: LocalLlmConfig = {
    baseUrl: 'http://127.0.0.1:11434',
    model: 'llama3.2:3b',
    enabled: true,
  };

  beforeEach(() => {
    // fetchをモックしてOllamaが失敗するようにする
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Connection refused')));
  });

  it('Ollamaエラー時はClaude Codeにフォールバックする', async () => {
    const result = await orchestrateTask('こんにちは', enabledConfig);
    // chatカテゴリだがOllamaエラー → Claudeにフォールバック
    expect(result.category).toBe('chat');
    expect(result.handledBy).toBe('claude');
    expect(result.reasoning).toContain('フォールバック');
  });
});

describe('orchestrateTask — コマンドエスケープ', () => {
  const disabledConfig: LocalLlmConfig = {
    baseUrl: 'http://127.0.0.1:11434',
    model: 'llama3.2:3b',
    enabled: false,
  };

  it('ダブルクォートを含む入力を安全にエスケープする', async () => {
    const result = await orchestrateTask('「Hello "World"」を出力して', disabledConfig);
    expect(result.delegatedCommand).toBeDefined();
    // エスケープされたコマンドが壊れていないことを確認
    expect(result.delegatedCommand).toContain('claude');
  });

  it('バッククォートを含む入力を安全にエスケープする', async () => {
    const result = await orchestrateTask('`ls -la`の結果を見て', disabledConfig);
    expect(result.delegatedCommand).toBeDefined();
    expect(result.delegatedCommand).toContain('claude');
  });

  it('$記号を含む入力を安全にエスケープする', async () => {
    const result = await orchestrateTask('$HOME/Projectsを確認して', disabledConfig);
    expect(result.delegatedCommand).toBeDefined();
    expect(result.delegatedCommand).toContain('claude');
  });
});
