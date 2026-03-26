# Immortal Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ターミナルセッションがアプリ離脱・OOM Kill・デバイス再起動を超えて永続化し、CLI会話コンテキストを自動復帰する。

**Architecture:** tmuxをttydとbashの間に挟み、プロセスをWebView接続から分離する（Layer 1）。Termuxごと死んだ場合は`claude --continue`/`gemini --resume latest`で会話復帰する（Layer 2）。復帰に必要なメタデータはAsyncStorageに常時保存する（Layer 3）。

**Tech Stack:** tmux, ttyd, React Native (Expo), Zustand, AsyncStorage, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-26-immortal-sessions-design.md`

---

## Task 1: start-shelly.sh 新規作成 (Must)

**Files:**
- Create: `~/shelly-bridge/start-shelly.sh`

- [ ] **Step 1: スクリプト作成**

```bash
#!/data/data/com.termux/files/usr/bin/bash
# start-shelly.sh — Shelly bridge + tmux + ttyd startup

PREFIX=/data/data/com.termux/files/usr
HOME_DIR=/data/data/com.termux/files/home
export PATH="$PREFIX/bin:$PATH"
export HOME="$HOME_DIR"

# Install tmux if missing
command -v tmux >/dev/null 2>&1 || pkg install -y tmux

# Kill stale processes
pkill -f "node.*server.js" 2>/dev/null
pkill -f ttyd 2>/dev/null
sleep 1

# Configure tmux scrollback (10000 lines)
tmux set-option -g history-limit 10000 2>/dev/null

# Create tmux sessions (idempotent)
for i in 1 2 3 4 5 6; do
  tmux has-session -t "shelly-$i" 2>/dev/null || tmux new-session -d -s "shelly-$i"
done

# Launch ttyd for session 1 (additional tabs launched on demand by Shelly)
nohup ttyd -p 7681 -W tmux attach-session -t shelly-1 > /dev/null 2>&1 &

# Launch bridge server
cd "$HOME_DIR/shelly-bridge" && nohup node server.js > /dev/null 2>&1 &
```

- [ ] **Step 2: 実行権限付与**

Run: `chmod +x ~/shelly-bridge/start-shelly.sh`

- [ ] **Step 3: 動作確認**

Run: `~/shelly-bridge/start-shelly.sh && sleep 3 && tmux has-session -t shelly-1 && echo "OK"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
cd ~/Shelly && git add ~/shelly-bridge/start-shelly.sh
git commit -m "feat: add start-shelly.sh with tmux session management"
```

---

## Task 2: tmux-manager.ts 新規作成 (Must)

**Files:**
- Create: `~/Shelly/lib/tmux-manager.ts`

- [ ] **Step 1: tmux-manager.ts を作成**

```typescript
/**
 * lib/tmux-manager.ts — tmuxセッション管理ユーティリティ
 *
 * Shellyの各ターミナルタブに対応するtmuxセッション(shelly-1〜6)を管理する。
 * 全てのコマンドはbridgeのrunRawCommand経由で実行する。
 */

type RunCommand = (cmd: string, opts: { timeoutMs: number; reason: string }) => Promise<any>;

/** CLI復帰コマンドマップ */
export const CLI_RESUME_COMMANDS: Record<string, string | null> = {
  claude: 'claude --continue',
  gemini: 'gemini --resume latest',
  codex: null,
  cody: null,
};

/** ポート番号からtmuxセッション名を導出 */
export function tmuxSessionName(port: number): string {
  return `shelly-${port - 7681 + 1}`;
}

/** セッションが生きているか確認 */
export async function isSessionAlive(
  name: string,
  runCmd: RunCommand,
): Promise<boolean> {
  try {
    const result = await runCmd(
      `tmux has-session -t "${name}" 2>/dev/null && echo "ALIVE" || echo "DEAD"`,
      { timeoutMs: 5000, reason: 'tmux-check' },
    );
    const output = typeof result === 'string' ? result : result?.output || '';
    return output.trim().includes('ALIVE');
  } catch {
    return false;
  }
}

/** セッションが存在しなければ作成 */
export async function ensureSession(
  name: string,
  runCmd: RunCommand,
): Promise<void> {
  try {
    await runCmd(
      `tmux has-session -t "${name}" 2>/dev/null || tmux new-session -d -s "${name}"`,
      { timeoutMs: 5000, reason: 'tmux-ensure' },
    );
  } catch {
    // best-effort
  }
}

/** セッション削除（タブ閉じ時） */
export async function killSession(
  name: string,
  runCmd: RunCommand,
): Promise<void> {
  try {
    await runCmd(
      `tmux kill-session -t "${name}" 2>/dev/null`,
      { timeoutMs: 5000, reason: 'tmux-kill' },
    );
  } catch {
    // best-effort
  }
}

/**
 * tmuxが死んでいた場合の復帰コマンドを組み立てる。
 * cwdに移動し、activeCliに応じた復帰コマンドを実行する。
 */
export function buildRecoveryCommand(
  cwd: string,
  activeCli: string | null,
): string | null {
  if (!cwd) return null;

  const escaped = cwd.replace(/'/g, "'\\''");
  const cdCmd = `cd '${escaped}'`;

  if (!activeCli) return cdCmd;

  const resumeCmd = CLI_RESUME_COMMANDS[activeCli];
  if (resumeCmd) {
    return `${cdCmd} && ${resumeCmd}`;
  }
  // CLI without resume support — just launch it
  return `${cdCmd} && ${activeCli}`;
}

/**
 * tmuxセッション内でコマンドを送信する（復帰時に使用）。
 * tmux send-keys でセッション内のbashにコマンドを送る。
 */
export async function sendKeysToSession(
  name: string,
  command: string,
  runCmd: RunCommand,
): Promise<void> {
  const escaped = command.replace(/"/g, '\\"');
  try {
    await runCmd(
      `tmux send-keys -t "${name}" "${escaped}" Enter`,
      { timeoutMs: 5000, reason: 'tmux-send-keys' },
    );
  } catch {
    // best-effort
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd ~/Shelly && git add lib/tmux-manager.ts
git commit -m "feat: add tmux-manager.ts for session lifecycle management"
```

---

## Task 3: ttyd起動コマンドをtmux経由に変更 (Must)

**Files:**
- Modify: `~/Shelly/hooks/use-ttyd-connection.ts:65-79` (autoLaunchTtyd)

- [ ] **Step 1: autoLaunchTtyd を tmux経由に変更**

`use-ttyd-connection.ts` の `autoLaunchTtyd` コールバックを修正する。

変更前 (line 71-73):
```typescript
        await runRawCommand(
          `nohup ttyd -p ${port} -W bash > /dev/null 2>&1 & sleep 2 && echo OK`,
          { timeoutMs: 10000, reason: 'ttyd-auto-launch' },
        );
```

変更後:
```typescript
        const n = parseInt(port, 10) - 7681 + 1;
        const sessionName = `shelly-${n}`;
        await runRawCommand(
          `tmux has-session -t "${sessionName}" 2>/dev/null || tmux new-session -d -s "${sessionName}"; nohup ttyd -p ${port} -W tmux attach-session -t "${sessionName}" > /dev/null 2>&1 & sleep 2 && echo OK`,
          { timeoutMs: 10000, reason: 'ttyd-auto-launch' },
        );
```

- [ ] **Step 2: 動作確認**

アプリをビルド前に、bridgeが接続された状態でターミナルタブを開き、ttydが起動されることを確認。
Run: `tmux has-session -t shelly-1 && echo "tmux OK"`
Expected: `tmux OK`

- [ ] **Step 3: Commit**

```bash
cd ~/Shelly && git add hooks/use-ttyd-connection.ts
git commit -m "feat: launch ttyd via tmux session instead of bare bash"
```

---

## Task 4: auto-recoveryをstart-shelly.sh経由に統一 (Must)

**Files:**
- Modify: `~/Shelly/hooks/use-termux-bridge.ts:326-342` (attemptAutoRecovery startCmd)

- [ ] **Step 1: startCmdをstart-shelly.sh呼び出しに変更**

`use-termux-bridge.ts` の `attemptAutoRecovery` 内の `startCmd` を修正する。

変更前 (line 330-342):
```typescript
    const startCmd = [
      `export PATH=${PREFIX}/bin:$PATH; `,
      `export HOME=${HOME}; `,
      `pkill -f "node.*server.js" 2>/dev/null; `,
      `pkill -f ttyd 2>/dev/null; `,
      `sleep 1; `,
      `if [ -x ${HOME}/shelly-bridge/start-shelly.sh ]; then `,
      `  nohup ${PREFIX}/bin/bash ${HOME}/shelly-bridge/start-shelly.sh > /dev/null 2>&1 & `,
      `else `,
      `  nohup ${PREFIX}/bin/ttyd -p 7681 -W ${PREFIX}/bin/bash > /dev/null 2>&1 & `,
      `  cd ${HOME}/shelly-bridge && nohup ${PREFIX}/bin/node server.js > /dev/null 2>&1 & `,
      `fi`,
    ].join('');
```

変更後:
```typescript
    const startCmd = [
      `export PATH=${PREFIX}/bin:$PATH; `,
      `export HOME=${HOME}; `,
      `if [ -x ${HOME}/shelly-bridge/start-shelly.sh ]; then `,
      `  nohup ${PREFIX}/bin/bash ${HOME}/shelly-bridge/start-shelly.sh > /dev/null 2>&1 & `,
      `else `,
      `  nohup ${PREFIX}/bin/ttyd -p 7681 -W ${PREFIX}/bin/bash > /dev/null 2>&1 & `,
      `  cd ${HOME}/shelly-bridge && nohup ${PREFIX}/bin/node server.js > /dev/null 2>&1 & `,
      `fi`,
    ].join('');
```

start-shelly.sh がある場合はそれに委譲（tmux統合込み）。無い場合は従来のフォールバック（bare bash）で最低限の復旧を保証する。

- [ ] **Step 2: Commit**

```bash
cd ~/Shelly && git add hooks/use-termux-bridge.ts
git commit -m "feat: simplify auto-recovery to delegate to start-shelly.sh"
```

---

## Task 5: TabSession型にactiveCli / tmuxSession追加 (Should)

**Files:**
- Modify: `~/Shelly/store/types.ts:138-150` (TabSession)

- [ ] **Step 1: TabSession型に新フィールド追加**

`store/types.ts` の `TabSession` 型末尾（`historyIndex` の後）に追加:

```typescript
  /** 現在実行中のCLI（復帰用） */
  activeCli: 'claude' | 'gemini' | 'codex' | 'cody' | null;
  /** 対応するtmuxセッション名 */
  tmuxSession: string;
```

- [ ] **Step 2: Commit**

```bash
cd ~/Shelly && git add store/types.ts
git commit -m "feat: add activeCli and tmuxSession to TabSession type"
```

---

## Task 6: terminal-store のcreateSession / 永続化を更新 (Should)

**Files:**
- Modify: `~/Shelly/store/terminal-store.ts:90-103` (createSession)
- Modify: `~/Shelly/store/terminal-store.ts:624-661` (saveSessionState)
- Modify: `~/Shelly/store/terminal-store.ts:663-684` (loadSessionState)

- [ ] **Step 1: createSession に新フィールド追加**

`terminal-store.ts` の `createSession` 関数を修正:

変更前 (line 90-103):
```typescript
function createSession(id: string, name: string, port: number = TTYD_PORT_BASE): TabSession {
  return {
    id,
    name,
    connectionStatus: 'local',
    currentDir: '/home/user',
    port,
    ttyUrl: `http://localhost:${port}`,
    blocks: [],
    entries: [],
    commandHistory: [],
    historyIndex: -1,
  };
}
```

変更後:
```typescript
function createSession(id: string, name: string, port: number = TTYD_PORT_BASE): TabSession {
  return {
    id,
    name,
    connectionStatus: 'local',
    currentDir: '/home/user',
    port,
    ttyUrl: `http://localhost:${port}`,
    blocks: [],
    entries: [],
    commandHistory: [],
    historyIndex: -1,
    activeCli: null,
    tmuxSession: `shelly-${port - TTYD_PORT_BASE + 1}`,
  };
}
```

- [ ] **Step 2: saveSessionState にactiveCli / tmuxSession追加**

`saveSessionState` のserializable mapperに追加:

```typescript
      const serializable = sessions.map((s) => ({
        // ...既存フィールド
        activeCli: s.activeCli ?? null,
        tmuxSession: s.tmuxSession ?? `shelly-${s.port - TTYD_PORT_BASE + 1}`,
      }));
```

具体的には、`saveSessionState` 内の `sessions.map((s) => ({` ブロックで `entries:` の後に以下2行を追加:

```typescript
        activeCli: s.activeCli ?? null,
        tmuxSession: s.tmuxSession ?? `shelly-${s.port - TTYD_PORT_BASE + 1}`,
```

- [ ] **Step 3: loadSessionState にactiveCli / tmuxSession復元追加**

`loadSessionState` の `restored` mapperに追加:

`loadSessionState` 内の `data.sessions.map((s: any, index: number) => ({` ブロックで `entries:` の後に以下2行を追加:

```typescript
        activeCli: s.activeCli ?? null,
        tmuxSession: s.tmuxSession ?? `shelly-${(s.port || TTYD_PORT_BASE + index) - TTYD_PORT_BASE + 1}`,
```

- [ ] **Step 4: activeCli setterアクションを追加**

ストアの型定義とimplementation部分に `setActiveCli` アクションを追加。

型（`TerminalState` 内に追加）:
```typescript
  /** Set the active CLI for the current session (for recovery) */
  setActiveCli: (cli: TabSession['activeCli']) => void;
```

実装（`create<TerminalState>((set, get) => ({` 内に追加）:
```typescript
  setActiveCli: (cli) => {
    const { sessions, activeSessionId } = get();
    set({
      sessions: sessions.map((s) =>
        s.id === activeSessionId ? { ...s, activeCli: cli } : s
      ),
    });
    get().saveSessionState();
  },
```

- [ ] **Step 5: Commit**

```bash
cd ~/Shelly && git add store/terminal-store.ts
git commit -m "feat: persist activeCli and tmuxSession in terminal store"
```

---

## Task 7: session-persistence.ts の永続化データ拡張 (Should)

**Files:**
- Modify: `~/Shelly/lib/session-persistence.ts:16-25` (PersistedSession type)
- Modify: `~/Shelly/lib/session-persistence.ts:34-45` (sessionToJson)

- [ ] **Step 1: PersistedSession型に新フィールド追加**

`session-persistence.ts` の `PersistedSession` 型に追加（`lastActiveAt` の後）:

```typescript
  activeCli: 'claude' | 'gemini' | 'codex' | 'cody' | null;
  tmuxSession: string;
```

- [ ] **Step 2: sessionToJson に新フィールド追加**

`sessionToJson` 関数の return object に追加（`lastActiveAt` の後）:

```typescript
    activeCli: session.activeCli ?? null,
    tmuxSession: session.tmuxSession ?? '',
```

（注: `session` は `TabSession` 型なので、Task 5で追加したフィールドを参照できる）

- [ ] **Step 3: Commit**

```bash
cd ~/Shelly && git add lib/session-persistence.ts
git commit -m "feat: add activeCli/tmuxSession to file-based session persistence"
```

---

## Task 8: CLI起動検出とactiveCli自動設定 (Should)

**Files:**
- Modify: `~/Shelly/hooks/use-termux-bridge.ts:489-500` (sendCommand area)

- [ ] **Step 1: CLI検出ヘルパーを追加**

`use-termux-bridge.ts` のファイル先頭（import群の後、型定義の前）に追加:

```typescript
/** コマンド文字列からCLI種別を検出する */
function detectCli(command: string): 'claude' | 'gemini' | 'codex' | 'cody' | null {
  const trimmed = command.trim();
  if (/^claude(\s|$)/.test(trimmed)) return 'claude';
  if (/^gemini(\s|$)/.test(trimmed)) return 'gemini';
  if (/^codex(\s|$)/.test(trimmed)) return 'codex';
  if (/^cody(\s|$)/.test(trimmed)) return 'cody';
  return null;
}
```

- [ ] **Step 2: sendCommand内でactiveCli自動設定**

`sendCommand` コールバック内（`queueRef.current.push(...)` の直後）に追加:

```typescript
    // Detect CLI launch and track for recovery
    const cli = detectCli(command);
    if (cli) {
      useTerminalStore.getState().setActiveCli(cli);
    }
```

- [ ] **Step 3: exitハンドラでactiveCli解除**

`handleMessage` の `case 'exit':` ブロック内（`finalizeBlock` 呼び出しの後）に、CLI終了時のactiveCli解除を追加:

```typescript
          // Clear activeCli when the CLI process exits
          const { sessions, activeSessionId } = useTerminalStore.getState();
          const currentSession = sessions.find((s) => s.id === activeSessionId);
          if (currentSession?.activeCli && active.command.trim().startsWith(currentSession.activeCli)) {
            useTerminalStore.getState().setActiveCli(null);
          }
```

- [ ] **Step 4: Commit**

```bash
cd ~/Shelly && git add hooks/use-termux-bridge.ts
git commit -m "feat: auto-detect CLI launches and track activeCli for recovery"
```

---

## Task 9: tmux死亡時のCLI自動復帰フロー (Should)

**Files:**
- Modify: `~/Shelly/hooks/use-termux-bridge.ts` (attemptAutoRecovery success path)

- [ ] **Step 1: import追加**

`use-termux-bridge.ts` のimport部分に追加:

```typescript
import { isSessionAlive, ensureSession, sendKeysToSession, buildRecoveryCommand } from '@/lib/tmux-manager';
```

- [ ] **Step 2: auto-recovery成功後にtmux復帰フローを追加**

`attemptAutoRecovery` のポーリング成功パス（`// Recovery succeeded!` コメントの後、既存の `return;` の**前**）に復帰ロジックを追加。既存の `return;` はそのまま残す:

```typescript
          // Recovery succeeded!
          setIsAutoRecovering(false);
          setAutoRecoveryFailed(false);
          setIsReconnectExhausted(false);

          // === Layer 2: CLI session recovery ===
          const { sessions } = useTerminalStore.getState();
          for (const session of sessions) {
            const tmuxName = session.tmuxSession || `shelly-${session.port - 7681 + 1}`;
            const alive = await isSessionAlive(tmuxName, runRawCommand);
            if (!alive && (session.activeCli || session.currentDir !== '/home/user')) {
              // tmux died — create new session and auto-resume
              await ensureSession(tmuxName, runRawCommand);
              const recoveryCmd = buildRecoveryCommand(session.currentDir, session.activeCli);
              if (recoveryCmd) {
                await sendKeysToSession(tmuxName, recoveryCmd, runRawCommand);
              }
            }
          }
```

（注: `runRawCommand` は既存の関数。この時点でbridge接続が復旧しているので使える）

- [ ] **Step 3: Commit**

```bash
cd ~/Shelly && git add hooks/use-termux-bridge.ts
git commit -m "feat: auto-resume CLI sessions when tmux dies (Layer 2 recovery)"
```

---

## Task 10: タブ削除時のtmux kill-session (Should)

**Files:**
- Modify: `~/Shelly/store/terminal-store.ts:230-237` (removeSession)

- [ ] **Step 1: removeSessionにtmux cleanup hookを追加**

現在の`removeSession`はストアのstateのみ更新している。tmuxセッションの削除はbridge経由が必要なので、ストア側では**フラグのみ立てる**アプローチをとる。

`removeSession` の最後に、削除されたセッションのtmuxSession名を保存するグローバル配列を追加:

ファイル先頭（import群の後）に追加:
```typescript
/** Pending tmux sessions to kill (consumed by useTermuxBridge on next tick) */
export const _pendingTmuxKills: string[] = [];
```

`removeSession` の `set(...)` の後、`get().saveSessionState()` の前に追加:
```typescript
    const removed = sessions.find((s) => s.id === id);
    if (removed?.tmuxSession) {
      _pendingTmuxKills.push(removed.tmuxSession);
    }
```

- [ ] **Step 2: useTermuxBridge側でpendingKillsを処理**

`use-termux-bridge.ts` に import追加:
```typescript
import { _pendingTmuxKills } from '@/store/terminal-store';
import { killSession as killTmuxSession } from '@/lib/tmux-manager';
```

`processQueue` コールバックの先頭に追加:
```typescript
    // Clean up tmux sessions for removed tabs
    while (_pendingTmuxKills.length > 0) {
      const name = _pendingTmuxKills.shift()!;
      killTmuxSession(name, runRawCommand);
    }
```

- [ ] **Step 3: Commit**

```bash
cd ~/Shelly && git add store/terminal-store.ts hooks/use-termux-bridge.ts
git commit -m "feat: kill tmux session when terminal tab is removed"
```

---

## Task 11: cli-runner.ts にcodex/cody追加 (Should)

**Files:**
- Modify: `~/Shelly/lib/cli-runner.ts:15,65-101` (CliTool type, CLI_TOOLS)

- [ ] **Step 1: CliTool型を拡張**

変更前 (line 15):
```typescript
export type CliTool = 'claude' | 'gemini' | 'custom';
```

変更後:
```typescript
export type CliTool = 'claude' | 'gemini' | 'codex' | 'cody' | 'custom';
```

- [ ] **Step 2: CLI_TOOLSにcodex/codyを追加**

`CLI_TOOLS` オブジェクト内、`custom` の前に追加:

```typescript
  codex: {
    id: 'codex',
    label: 'Codex CLI',
    description: 'OpenAIのAI CLIツール',
    checkCommand: 'which codex',
    installGuide:
      'Codex CLIがインストールされていないよ。\n' +
      'Termuxで以下を実行してインストールしてね：\n' +
      'npm install -g @openai/codex',
    setupCommands: ['npm install -g @openai/codex'],
    isInteractive: true,
  },
  cody: {
    id: 'cody',
    label: 'Cody CLI',
    description: 'SourcegraphのAI CLIツール',
    checkCommand: 'which cody',
    installGuide:
      'Cody CLIがインストールされていないよ。\n' +
      'インストール方法はSourcegraphの公式ドキュメントを確認してね。',
    setupCommands: [],
    isInteractive: true,
  },
```

- [ ] **Step 3: Commit**

```bash
cd ~/Shelly && git add lib/cli-runner.ts
git commit -m "feat: add codex and cody to CLI tool registry"
```

---

## Task 12: チャットペインからのCLI復帰対応 (Should)

**Files:**
- Modify: `~/Shelly/hooks/use-ai-dispatch.ts` (@claude/@geminiルーティング部分)

- [ ] **Step 1: use-ai-dispatch.tsでactiveCli確認を追加**

`use-ai-dispatch.ts` の `@claude` / `@gemini` ルーティングハンドラ内で、アクティブなターミナルタブに `activeCli` が保存されている場合、CLI復帰コマンドを使うようにする。

import追加:
```typescript
import { CLI_RESUME_COMMANDS } from '@/lib/tmux-manager';
```

`@claude` でCLI実行するコード付近で、`--print` でのワンショット実行の前にチェックを追加:

```typescript
    // Check if there's an active CLI session to resume (Layer 2 chat-pane recovery)
    const { sessions, activeSessionId } = useTerminalStore.getState();
    const currentTab = sessions.find((s) => s.id === activeSessionId);
    if (currentTab?.activeCli === tool && CLI_RESUME_COMMANDS[tool]) {
      // Suggest resuming the existing session instead of --print
      // Insert a resume command into the terminal tab
      const resumeCmd = CLI_RESUME_COMMANDS[tool];
      // Route to terminal execution instead of --print
    }
```

具体的な挿入位置は `use-ai-dispatch.ts` のCLI実行パスに依存するため、実装時にファイルを読んで正確な場所を特定する。基本方針: `activeCli` が保存されている場合は `--print` ワンショットではなく、ターミナルタブで `claude --continue` を送信する。

- [ ] **Step 2: Commit**

```bash
cd ~/Shelly && git add hooks/use-ai-dispatch.ts
git commit -m "feat: chat pane CLI recovery via activeCli check"
```

---

## Task 13: 実機テスト (Must)

- [ ] **Step 1: tmuxインストール確認**

Run: `pkg install -y tmux && tmux -V`
Expected: `tmux X.X` (バージョン表示)

- [ ] **Step 2: start-shelly.sh動作確認**

Run: `pkill -f ttyd; pkill -f "node.*server.js"; sleep 1 && bash ~/shelly-bridge/start-shelly.sh && sleep 3 && tmux ls`
Expected: `shelly-1` 〜 `shelly-6` が表示される

- [ ] **Step 3: ttyd + tmux接続確認**

ブラウザで `http://localhost:7681` にアクセス。tmuxセッション内のbashプロンプトが表示されることを確認。

- [ ] **Step 4: プロセス永続化テスト**

1. ttyd WebViewでclaude（または任意のコマンド）を起動
2. Shellyアプリを閉じる（バックグラウンドに移す）
3. 別アプリ（YouTube等）を開いて30秒待つ
4. Shellyに戻る
5. ターミナルが元の状態で表示されることを確認

- [ ] **Step 5: 最終Commit（テスト結果に応じた修正があれば）**

```bash
cd ~/Shelly && git status
# 変更があるファイルのみ個別にadd
git commit -m "fix: adjustments from immortal sessions integration test"
```
