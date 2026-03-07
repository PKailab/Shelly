/**
 * lib/ai-tool-agent.ts — v1.0
 *
 * AI Tool Agent: Gemini API の function calling を使い、
 * AIが自律的にファイル読み書き・コマンド実行を行うエージェントループ。
 *
 * Shellyが自分自身を改修できるための中核機能。
 *
 * フロー:
 * 1. ユーザーの指示 + ツール定義をGemini APIに送信
 * 2. Geminiが function_call を返す → bridgeで実行
 * 3. 結果をGeminiに返す → 次のアクション or 最終回答
 * 4. 最終回答が出るまでループ（最大10ラウンド）
 */

// ── Types ──────────────────────────────────────────────────────────────────

export type ToolCall = {
  name: string;
  args: Record<string, any>;
};

export type ToolResult = {
  name: string;
  result: string;
  error?: boolean;
};

export type AgentMessage = {
  role: 'user' | 'model' | 'function';
  text?: string;
  functionCall?: ToolCall;
  functionResponse?: { name: string; response: string };
};

export type BridgeTools = {
  readFile: (filePath: string, encoding?: string) => Promise<{ ok: true; content: string; filePath: string; size: number } | { ok: false; error: string }>;
  writeFile: (filePath: string, content: string) => Promise<{ ok: boolean; error?: string }>;
  editFile: (filePath: string, edits: { oldText: string; newText: string }[]) => Promise<{ ok: true; filePath: string; editsApplied: number } | { ok: false; error: string }>;
  listFiles: (dirPath?: string, opts?: { recursive?: boolean; maxDepth?: number; includeHidden?: boolean }) => Promise<{ ok: true; entries: any[]; dirPath: string; total: number } | { ok: false; error: string }>;
  runCommand: (cmd: string, opts?: { cwd?: string; env?: Record<string, string>; onStream?: (type: 'stdout' | 'stderr', data: string) => void; timeoutMs?: number }) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
};

export type OnStreamCallback = (text: string) => void;
export type OnToolCallCallback = (tool: string, args: Record<string, any>) => void;

// ── Tool Definitions (Gemini function declarations) ────────────────────────

export const TOOL_DECLARATIONS = [
  {
    name: 'readFile',
    description: 'ファイルの内容を読み取る。パスは現在の作業ディレクトリからの相対パスまたは絶対パス。',
    parameters: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'ファイルパス' },
      },
      required: ['filePath'],
    },
  },
  {
    name: 'writeFile',
    description: 'ファイルを新規作成または上書きする。ディレクトリは自動作成される。',
    parameters: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'ファイルパス' },
        content: { type: 'string', description: 'ファイルの全内容' },
      },
      required: ['filePath', 'content'],
    },
  },
  {
    name: 'editFile',
    description: '既存ファイルの一部を検索して置換する。oldTextは一意でなければならない。複数箇所を同時に編集可能。',
    parameters: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'ファイルパス' },
        edits: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              oldText: { type: 'string', description: '置換前のテキスト（一意であること）' },
              newText: { type: 'string', description: '置換後のテキスト' },
            },
            required: ['oldText', 'newText'],
          },
          description: '編集操作の配列',
        },
      },
      required: ['filePath', 'edits'],
    },
  },
  {
    name: 'listFiles',
    description: 'ディレクトリの内容を一覧表示する。node_modules等は自動除外される。',
    parameters: {
      type: 'object',
      properties: {
        dirPath: { type: 'string', description: 'ディレクトリパス（省略時はcwd）' },
        recursive: { type: 'boolean', description: '再帰的に探索するか' },
        maxDepth: { type: 'number', description: '最大深度（デフォルト3）' },
      },
    },
  },
  {
    name: 'runCommand',
    description: 'シェルコマンドを実行する。npm, git, tsc, grep等。破壊的コマンド（rm -rf等）はブロックされる。',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: '実行するコマンド' },
      },
      required: ['command'],
    },
  },
];

// ── System Prompt ──────────────────────────────────────────────────────────

const AGENT_SYSTEM_PROMPT = `あなたはShellyアプリ内のAIコーディングエージェントです。
ユーザーの指示に従い、ファイルの読み書き・編集・コマンド実行を行います。

重要なルール:
- ファイルを編集する前に必ず readFile で現在の内容を確認すること
- editFile の oldText は元ファイルに存在する正確なテキストを指定すること
- 大きな変更は複数の editFile に分けること
- writeFile は新規ファイル作成時のみ使用し、既存ファイルの変更には editFile を使うこと
- コマンド実行結果を確認し、エラーがあれば修正すること
- 最終的にユーザーへの報告は日本語で行うこと
- 1回のセッションで最大10回までツールを呼び出せる`;

// ── Gemini API Tool Call Agent ─────────────────────────────────────────────

const MAX_ROUNDS = 10;

/**
 * Gemini APIのfunction callingを使ったエージェントループ。
 *
 * @param apiKey Gemini APIキー
 * @param userPrompt ユーザーの指示
 * @param tools bridge経由のツール群
 * @param onStream テキストストリーミング用コールバック
 * @param onToolCall ツール呼び出し通知用コールバック
 * @param model Geminiモデル名
 * @param signal AbortSignal
 * @returns 最終的なテキスト応答
 */
export async function runAgentLoop(
  apiKey: string,
  userPrompt: string,
  tools: BridgeTools,
  onStream?: OnStreamCallback,
  onToolCall?: OnToolCallCallback,
  model = 'gemini-2.0-flash',
  signal?: AbortSignal,
): Promise<{ response: string; toolCallCount: number; error?: string }> {
  const contents: any[] = [
    { role: 'user', parts: [{ text: userPrompt }] },
  ];

  let toolCallCount = 0;
  let finalResponse = '';

  for (let round = 0; round < MAX_ROUNDS; round++) {
    if (signal?.aborted) {
      return { response: finalResponse || '中断されました。', toolCallCount, error: 'aborted' };
    }

    // Call Gemini API
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

    let res: Response;
    try {
      res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents,
          systemInstruction: { parts: [{ text: AGENT_SYSTEM_PROMPT }] },
          tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 4096,
          },
        }),
        signal,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { response: finalResponse || `APIエラー: ${msg}`, toolCallCount, error: msg };
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      return { response: finalResponse || `API HTTP ${res.status}: ${errText}`, toolCallCount, error: errText };
    }

    const data = await res.json();
    const candidate = data.candidates?.[0];
    if (!candidate?.content?.parts) {
      return { response: finalResponse || 'AIからの応答がありませんでした。', toolCallCount };
    }

    const parts = candidate.content.parts;
    contents.push({ role: 'model', parts });

    // Check if any part is a function call
    const functionCalls = parts.filter((p: any) => p.functionCall);

    if (functionCalls.length === 0) {
      // No function calls — extract text response
      const textParts = parts.filter((p: any) => p.text).map((p: any) => p.text);
      finalResponse = textParts.join('\n');
      onStream?.(finalResponse);
      return { response: finalResponse, toolCallCount };
    }

    // Execute all function calls
    const functionResponses: any[] = [];

    for (const part of functionCalls) {
      const { name, args } = part.functionCall;
      toolCallCount++;
      onToolCall?.(name, args);
      onStream?.(`\n🔧 ${name}(${summarizeArgs(name, args)})...\n`);

      let result: any;
      try {
        result = await executeTool(name, args, tools);
      } catch (err) {
        result = { error: `Tool execution failed: ${err instanceof Error ? err.message : String(err)}` };
      }
      const resultStr = typeof result === 'string' ? result : JSON.stringify(result);

      // Truncate large results
      const truncated = resultStr.length > 8000 ? resultStr.slice(0, 8000) + '\n...(truncated)' : resultStr;

      functionResponses.push({
        functionResponse: {
          name,
          response: { result: truncated },
        },
      });
    }

    // Add function responses — Gemini API expects role: 'user' for function responses
    contents.push({ role: 'user', parts: functionResponses });
  }

  return {
    response: finalResponse || 'ツール呼び出し回数の上限に達しました。',
    toolCallCount,
    error: 'max_rounds',
  };
}

// ── Tool Executor ──────────────────────────────────────────────────────────

async function executeTool(name: string, args: Record<string, any>, tools: BridgeTools): Promise<any> {
  switch (name) {
    case 'readFile': {
      const result = await tools.readFile(args.filePath);
      if (result.ok === false) return { error: result.error };
      return { content: result.content };
    }
    case 'writeFile': {
      const result = await tools.writeFile(args.filePath, args.content);
      if (!result.ok) return { error: result.error };
      return { success: true };
    }
    case 'editFile': {
      const result = await tools.editFile(args.filePath, args.edits);
      if (result.ok === false) return { error: result.error };
      return { success: true, editsApplied: result.editsApplied };
    }
    case 'listFiles': {
      const result = await tools.listFiles(args.dirPath, {
        recursive: args.recursive,
        maxDepth: args.maxDepth,
      });
      if (result.ok === false) return { error: result.error };
      return { entries: result.entries };
    }
    case 'runCommand': {
      // Safety: block dangerous patterns from AI-generated commands
      const cmd = args.command as string;
      if (isBlockedAgentCommand(cmd)) {
        return { error: `Blocked: command not allowed in agent mode: ${cmd.slice(0, 60)}` };
      }
      const result = await tools.runCommand(cmd);
      return {
        stdout: result.stdout.slice(-4000),
        stderr: result.stderr.slice(-2000),
        exitCode: result.exitCode,
      };
    }
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Block dangerous commands from AI-generated runCommand calls.
 * Prevents prompt injection attacks where Gemini generates malicious commands.
 */
const BLOCKED_AGENT_PATTERNS = [
  /curl\s.*\|.*(?:bash|sh)/i,         // curl | bash (remote code exec)
  /wget\s.*-O\s/i,                    // wget -O (file overwrite)
  /\|\s*(?:bash|sh|zsh)\b/i,          // pipe to shell
  />\s*~\/\.(?:bashrc|profile|zshrc)/i, // overwrite shell config
  /ssh\s/i,                           // SSH connections
  /scp\s/i,                           // SCP transfers
  /nc\s.*-[el]/i,                     // netcat listeners
  /python.*-c.*import\s+(?:os|subprocess|socket)/i, // Python code exec
  /node.*-e.*(?:child_process|exec|spawn)/i,        // Node code exec
  /(?:^|[;&|])\s*eval[\s(]/i,         // eval (including eval( and ;eval)
  /base64\s.*-d/i,                    // base64 decode (obfuscation)
  /\bdd\s+.*of=/i,                    // dd overwrite
  /mkfs/i,                            // format filesystem
  /rm\s+-[^\s]*r[^\s]*f/i,            // rm -rf (any target)
  /rm\s+-[^\s]*f[^\s]*r/i,            // rm -fr (any target)
  /chmod\s+[0-7]*7[0-7]*\s/i,         // world-writable permissions
  /\$\(/,                             // subshell expansion $(...)
  /`[^`]*`/,                          // backtick command substitution
];

function isBlockedAgentCommand(cmd: string): boolean {
  return BLOCKED_AGENT_PATTERNS.some(p => p.test(cmd));
}

function summarizeArgs(toolName: string, args: Record<string, any>): string {
  switch (toolName) {
    case 'readFile': return args.filePath;
    case 'writeFile': return `${args.filePath}, ${args.content?.length ?? 0}文字`;
    case 'editFile': return `${args.filePath}, ${args.edits?.length ?? 0}箇所`;
    case 'listFiles': return args.dirPath || '.';
    case 'runCommand': return args.command?.slice(0, 60) ?? '(no command)';
    default: return JSON.stringify(args).slice(0, 60);
  }
}
