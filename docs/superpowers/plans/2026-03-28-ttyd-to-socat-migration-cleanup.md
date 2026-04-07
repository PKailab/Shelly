# ttyd → socat 移行残り整理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 起動・復旧・セットアップ系の全コードをttyd前提からsocat+NativeTerminalView前提に統一し、Termux再起動やクラッシュ後にターミナルが自動復帰するようにする

**Architecture:** ターミナル接続はsocat(TCP loopback) + tmux + NativeTerminalViewで動作する。ttydはもう使わない。boot script、auto-setup Phase 2、auto-recovery、terminal.tsxの4箇所を修正する。

**Tech Stack:** TypeScript (React Native/Expo), Shell script, socat, tmux

---

## 修正箇所マップ

| # | ファイル | 変更内容 |
|---|---------|---------|
| 1 | `lib/auto-setup.ts` L87-98 | `buildBootScript()`: ttyd起動 → socat不要（bridge server + tmuxだけで十分。socatはアプリ側のcreateNativeSessionが起動する） |
| 2 | `lib/auto-setup.ts` L103-132 | `buildSetupCommand()`: パッケージリストからttyd削除、socat追加。末尾のttyd起動行を削除 |
| 3 | `lib/auto-setup.ts` L209-220 | `runPhase2Setup()`: ttydステップ → socat+tmuxの確認に変更 |
| 4 | `hooks/use-termux-bridge.ts` L341-353 | `attemptAutoRecovery()`: フォールバックのttyd起動を削除 |
| 5 | `app/(tabs)/terminal.tsx` L187+ | bridge復帰時にexitedセッションを自動recover（**済み**） |
| 6 | `shelly-bridge/start-shelly.sh` | ttyd行を削除、socat/tmux確認を追加 |
| 7 | `lib/i18n/locales/en.ts` | ttyd文言をterminal serverに汎化 |
| 8 | `lib/i18n/locales/ja.ts` | 同上（日本語） |
| 9 | `store/types.ts` or `store/terminal-store.ts` | `ttyUrl`フィールドがTermuxSettingsに残っていれば削除 |

---

### Task 1: boot script を socat 不要の形に修正

**Files:**
- Modify: `lib/auto-setup.ts:87-98` (`buildBootScript`)
- Modify: `shelly-bridge/start-shelly.sh`

boot scriptとstart-shelly.shからttyd行を削除。socatはアプリ側(createNativeSession)がオンデマンドで起動するので、boot時はbridge server + tmuxだけで良い。

- [ ] **Step 1: `buildBootScript()` を修正**

```typescript
function buildBootScript(): string {
  return `#!/data/data/com.termux/files/usr/bin/sh
# Shelly auto-start script
sleep 3
# Create tmux sessions (used by NativeTerminalView via socat)
tmux has-session -t shelly-1 2>/dev/null || tmux new-session -d -s shelly-1
tmux has-session -t shelly-2 2>/dev/null || tmux new-session -d -s shelly-2
# Start bridge server
cd ~/shelly-bridge && node server.js &
# Auto-start llama-server if model exists
MODEL=$((find ~/models ~/llama.cpp/models -maxdepth 2 -name "qwen*.gguf" -o -name "Qwen*.gguf" -size +100M 2>/dev/null; find ~/models ~/llama.cpp/models -maxdepth 2 -name "*.gguf" -size +100M 2>/dev/null) | awk '!seen[$0]++' | head -1)
if [ -n "$MODEL" ] && which llama-server >/dev/null 2>&1; then
  llama-server -m "$MODEL" --host 127.0.0.1 --port 8080 -ngl 0 -c 2048 -t 6 &
fi
`;
}
```

- [ ] **Step 2: `start-shelly.sh` からttyd行を削除し、既にある内容と一致させる**

start-shelly.shは既にttyd行がないので変更不要（確認のみ）。

- [ ] **Step 3: Commit**

```bash
git add lib/auto-setup.ts
git commit -m "fix: remove ttyd from boot script, use tmux+bridge only"
```

---

### Task 2: `buildSetupCommand()` のパッケージと起動コマンドを修正

**Files:**
- Modify: `lib/auto-setup.ts:103-132` (`buildSetupCommand`)

- [ ] **Step 1: パッケージリストからttydを削除し、socatを追加**

```typescript
const packages = [
  'nodejs-lts', 'socat', 'tmux', 'git', 'python',
  'openssh', 'curl', 'wget', 'jq', 'tree',
  'vim-python', 'nano',
].join(' ');
```

- [ ] **Step 2: 末尾のttyd起動行を削除**

変更前:
```typescript
'ttyd -p 7681 -W bash &',
'node server.js',
```

変更後:
```typescript
'node server.js',
```

- [ ] **Step 3: コメントを更新**

`// - ttyd: WebSocket terminal server for Terminal tab` →
`// - socat: TCP-PTY bridge for NativeTerminalView`
`// - tmux: session persistence across app restarts`

- [ ] **Step 4: Commit**

```bash
git add lib/auto-setup.ts
git commit -m "fix: replace ttyd with socat+tmux in setup command"
```

---

### Task 3: auto-setup Phase 2 の ttyd ステップを socat/tmux 確認に変更

**Files:**
- Modify: `lib/auto-setup.ts:27-31` (Phase2Step type)
- Modify: `lib/auto-setup.ts:209-220` (ttyd step in runPhase2Setup)
- Modify: `components/SetupWizard.tsx:76` (step label key)

- [ ] **Step 1: Phase2Step type を修正**

`'ttyd'` → `'terminal'` に変更（型名を汎化）

```typescript
export type Phase2Step = 'boot_script' | 'terminal' | 'cli_detect' | 'llm_detect' | 'complete';
```

- [ ] **Step 2: Phase2Results の ttyd フィールドを terminal に変更**

```typescript
export type Phase2Results = {
  bootScript?: boolean;
  terminal?: boolean;
  cli?: { claudeCode: boolean; geminiCli: boolean; codex: boolean };
  llm?: boolean;
};
```

- [ ] **Step 3: runPhase2Setup の ttyd ステップを socat/tmux 確認に置換**

```typescript
  // 2. Terminal server (socat + tmux)
  onProgress({ step: 'terminal', results });
  const socatInstalled = await exec('which socat >/dev/null 2>&1 && echo YES || echo NO', { timeoutMs: 5000 });
  if (socatInstalled.stdout.includes('NO')) {
    await exec('pkg install -y socat 2>&1', { timeoutMs: 120000 });
  }
  const tmuxInstalled = await exec('which tmux >/dev/null 2>&1 && echo YES || echo NO', { timeoutMs: 5000 });
  if (tmuxInstalled.stdout.includes('NO')) {
    await exec('pkg install -y tmux 2>&1', { timeoutMs: 120000 });
  }
  // Create default tmux session
  await exec('tmux has-session -t shelly-1 2>/dev/null || tmux new-session -d -s shelly-1', { timeoutMs: 5000 });
  const tmuxCheck = await exec('tmux has-session -t shelly-1 2>/dev/null && echo OK || echo FAIL', { timeoutMs: 5000 });
  results.terminal = tmuxCheck.stdout.includes('OK');
```

- [ ] **Step 4: SetupWizard のステップラベルキーを更新**

```typescript
{ key: 'terminal', labelKey: 'setup2.auto_step_terminal' },
```

- [ ] **Step 5: SetupWizard の setupResult 参照を更新**

`results.ttyd` → `results.terminal`
`ttyConnected` → `terminalReady` (変数名)

- [ ] **Step 6: Commit**

```bash
git add lib/auto-setup.ts components/SetupWizard.tsx
git commit -m "fix: replace ttyd setup step with socat+tmux verification"
```

---

### Task 4: auto-recovery のフォールバックからttydを削除

**Files:**
- Modify: `hooks/use-termux-bridge.ts:341-353` (`attemptAutoRecovery`)

- [ ] **Step 1: startCmd のフォールバック分岐を修正**

変更前:
```typescript
`pkill -f ttyd 2>/dev/null; `,
...
`  nohup ${PREFIX}/bin/ttyd -p 7681 -W ${PREFIX}/bin/bash > /dev/null 2>&1 & `,
```

変更後（フォールバックでもbridge server + tmuxのみ起動）:
```typescript
const startCmd = [
  `export PATH=${PREFIX}/bin:$PATH; `,
  `export HOME=${HOME}; `,
  `pkill -f "node.*server.js" 2>/dev/null; `,
  `sleep 1; `,
  `${PREFIX}/bin/tmux has-session -t shelly-1 2>/dev/null || ${PREFIX}/bin/tmux new-session -d -s shelly-1; `,
  `${PREFIX}/bin/tmux has-session -t shelly-2 2>/dev/null || ${PREFIX}/bin/tmux new-session -d -s shelly-2; `,
  `if [ -x ${HOME}/shelly-bridge/start-shelly.sh ]; then `,
  `  nohup ${PREFIX}/bin/bash ${HOME}/shelly-bridge/start-shelly.sh > /dev/null 2>&1 & `,
  `else `,
  `  cd ${HOME}/shelly-bridge && nohup ${PREFIX}/bin/node server.js > /dev/null 2>&1 & `,
  `fi`,
].join('');
```

- [ ] **Step 2: Commit**

```bash
git add hooks/use-termux-bridge.ts
git commit -m "fix: remove ttyd from auto-recovery fallback, use tmux+bridge"
```

---

### Task 5: i18n 文言を汎化

**Files:**
- Modify: `lib/i18n/locales/en.ts`
- Modify: `lib/i18n/locales/ja.ts`

- [ ] **Step 1: en.ts の ttyd 文言を更新**

| キー | 旧 | 新 |
|------|-----|-----|
| `setup2.auto_step_ttyd` | → 削除（`setup2.auto_step_terminal` に置換） |
| `terminal.connecting_ttyd` | `'Connecting to ttyd...'` | `'Connecting to terminal...'` |
| `terminal.cannot_connect` | `'Cannot connect to ttyd'` | `'Cannot connect to terminal'` |
| `terminal.install_ttyd` | `'Install ttyd'` | `'Install terminal tools'` |
| 新規追加 `setup2.auto_step_terminal` | — | `'Setting up terminal server'` |

- [ ] **Step 2: ja.ts の対応する文言を更新**

| キー | 旧 | 新 |
|------|-----|-----|
| `setup2.auto_step_ttyd` | → 削除 |
| `terminal.connecting_ttyd` | `'ttydに接続中...'` | `'ターミナルに接続中...'` |
| `terminal.cannot_connect` | `'ttydに接続できません'` | `'ターミナルに接続できません'` |
| `terminal.install_ttyd` | `'ttydをインストール'` | `'ターミナルツールをインストール'` |
| 新規追加 `setup2.auto_step_terminal` | — | `'ターミナルサーバーを設定中'` |

- [ ] **Step 3: Commit**

```bash
git add lib/i18n/locales/en.ts lib/i18n/locales/ja.ts
git commit -m "fix: replace ttyd references with generic terminal wording in i18n"
```

---

### Task 6: TermuxSettings の ttyUrl 残骸を整理

**Files:**
- Modify: `store/terminal-store.ts:76-80` (DEFAULT_TERMUX_SETTINGS)
- Modify: `store/types.ts` (TermuxSettings type)

- [ ] **Step 1: TermuxSettings type から ttyUrl を削除**

確認: `ttyUrl` が他で参照されていないことをgrepで確認してから削除。

- [ ] **Step 2: DEFAULT_TERMUX_SETTINGS から ttyUrl 行を削除**

- [ ] **Step 3: Commit**

```bash
git add store/terminal-store.ts store/types.ts
git commit -m "cleanup: remove unused ttyUrl from TermuxSettings"
```

---

### Task 7: terminal.tsx の bridge 復帰時 auto-recover を確認（済み）

**Files:**
- Verify: `app/(tabs)/terminal.tsx`

- [ ] **Step 1: 既に追加済みの useEffect を確認**

```typescript
// Auto-recover exited sessions when bridge reconnects
useEffect(() => {
  if (bridgeStatus !== 'connected') return;
  for (const session of sessions) {
    if (session.sessionStatus === 'exited') {
      recoverSession(session);
    }
  }
}, [bridgeStatus]);
```

- [ ] **Step 2: 動作確認 — アプリでReloadボタンが不要になっていること**

---

## 実行順序

Task 1 → 2 → 3 → 4 → 5 → 6 → 7（順番に。各タスク内は上から順に）

Task 7は既に完了。Task 1-6を実装する。
