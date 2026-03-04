/**
 * llm-interpreter.ts
 *
 * Termuxコマンド出力をLocal LLMで自然言語に通訳するモジュール。
 *
 * 機能:
 * 1. コマンド完了後の出力をLocal LLMで解説（成功/エラー）
 * 2. エラー時は原因と修正コマンドを提案
 * 3. ストリーミング表示対応
 */

import type { OutputLine } from '@/store/types';

export type InterpretType = 'success' | 'error' | 'progress';

export type InterpretResult = {
  type: InterpretType;
  text: string;
  suggestedCommand?: string;
};

export type StreamingCallback = (chunk: string) => void;

/** Local LLM設定 */
export type LlmConfig = {
  baseUrl: string;   // e.g. "http://127.0.0.1:8080"
  model: string;     // e.g. "qwen2.5-3b-instruct-q4_k_m"
  enabled: boolean;
};

/**
 * Termuxコマンドの出力をLocal LLMで通訳する。
 * ストリーミングでコールバックに逐次チャンクを渡す。
 *
 * @param command   実行されたコマンド
 * @param output    OutputLine配列
 * @param exitCode  終了コード（null = まだ実行中）
 * @param config    Local LLM設定
 * @param onChunk   ストリーミングコールバック
 * @returns         通訳結果（完了後）
 */
export async function interpretTermuxOutput(
  command: string,
  output: OutputLine[],
  exitCode: number | null,
  config: LlmConfig,
  onChunk: StreamingCallback,
  options?: { verbosity?: 'verbose' | 'minimal' },
): Promise<InterpretResult> {
  if (!config.enabled || !config.baseUrl) {
    return { type: 'progress', text: '' };
  }

  const isError = exitCode !== null && exitCode !== 0;
  const verbosity = options?.verbosity ?? 'verbose';

  // 高速モード: 成功時はスキップ（エラー時のみ通訳）
  if (verbosity === 'minimal' && !isError) {
    return { type: 'success', text: '' };
  }

  const stdout = output
    .filter((l) => l.type === 'stdout' || l.type === 'info')
    .map((l) => l.text)
    .join('\n')
    .slice(-2000); // 最大2000文字
  const stderr = output
    .filter((l) => l.type === 'stderr')
    .map((l) => l.text)
    .join('\n')
    .slice(-1000);

  const verboseError = `あなたはTermuxターミナルのエラー解説AIです。
コマンドのエラー出力を見て、以下を必ず日本語で答えてください：
1. エラーの背景と原因（2〜3文で詳しく）
2. 修正方法（具体的なコマンドがあれば必ず提示）
3. 再発防止のヒント
回答は5〜8文。コードブロックは使わず、修正コマンドは「修正: コマンド」の形式で末尾に書く。`;

  const minimalError = `あなたはTermuxターミナルのエラー解説AIです。
コマンドのエラー出力を見て、以下を必ず日本語で簡潔に答えてください：
1. エラーの原因（1〜2文）
2. 修正方法（具体的なコマンドがあれば必ず提示）
回答は3〜5文以内。コードブロックは使わず、修正コマンドは「修正: コマンド」の形式で末尾に書く。`;

  const verboseSuccess = `あなたはTermuxターミナルの通訳AIです。
コマンドの実行結果を見て、何が起きたかを必ず日本語で3〜5文で丁寧に説明してください。
初心者にも分かるよう、結果の意味や次にできることも触れてください。`;

  const minimalSuccess = `あなたはTermuxターミナルの通訳AIです。
コマンドの実行結果を見て、何が起きたかを必ず日本語で1〜3文で簡潔に説明してください。
専門用語は避け、ユーザーが理解しやすい言葉で。`;

  const systemPrompt = isError
    ? (verbosity === 'verbose' ? verboseError : minimalError)
    : (verbosity === 'verbose' ? verboseSuccess : minimalSuccess);

  const userContent = isError
    ? `コマンド: ${command}\n終了コード: ${exitCode}\n\nstdout:\n${stdout || '(なし)'}\n\nstderr:\n${stderr || '(なし)'}`
    : `コマンド: ${command}\n\n出力:\n${stdout || '(出力なし)'}`;

  // llama-server (OpenAI互換) のストリーミングAPI
  const apiUrl = `${config.baseUrl.replace(/\/$/, '')}/v1/chat/completions`;

  let fullText = '';
  let suggestedCommand: string | undefined;

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        max_tokens: 256,
        temperature: 0.3,
        stream: true,
      }),
    });

    if (!response.ok) {
      return { type: isError ? 'error' : 'success', text: '' };
    }

    const reader = response.body?.getReader();
    if (!reader) return { type: isError ? 'error' : 'success', text: '' };

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') break;

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content ?? '';
          if (delta) {
            fullText += delta;
            onChunk(delta);
          }
        } catch {
          // JSON parse error — skip
        }
      }
    }

    // 修正コマンドを抽出（「修正: コマンド」形式）
    const fixMatch = fullText.match(/修正[:：]\s*(.+)/);
    if (fixMatch) {
      suggestedCommand = fixMatch[1].trim();
    }

    return {
      type: isError ? 'error' : 'success',
      text: fullText,
      suggestedCommand,
    };
  } catch {
    return { type: isError ? 'error' : 'success', text: '' };
  }
}

/**
 * コマンド実行前に意図を説明する。
 * ストリーミングでコールバックに逐次チャンクを渡す。
 *
 * @param command  実行予定のコマンド
 * @param config   Local LLM設定
 * @param onChunk  ストリーミングコールバック
 * @returns        説明テキスト（完了後）。LLM無効時は空文字。
 */
export async function explainCommandIntent(
  command: string,
  config: LlmConfig,
  onChunk?: StreamingCallback,
): Promise<string> {
  if (!config.enabled || !config.baseUrl) {
    return '';
  }

  const systemPrompt = `あなたはTermuxコマンド解説AIです。
ユーザーが実行しようとしているコマンドが何をするか、1文で日本語で説明してください。
危険性がある場合は、短い警告も含めてください。
回答は1〜2文以内。`;

  const apiUrl = `${config.baseUrl.replace(/\/$/, '')}/v1/chat/completions`;
  let fullText = '';

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `コマンド: ${command}` },
        ],
        max_tokens: 128,
        temperature: 0.2,
        stream: true,
      }),
    });

    if (!response.ok) return '';

    const reader = response.body?.getReader();
    if (!reader) return '';

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') break;

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content ?? '';
          if (delta) {
            fullText += delta;
            onChunk?.(delta);
          }
        } catch {
          // JSON parse error — skip
        }
      }
    }

    return fullText;
  } catch {
    return '';
  }
}
