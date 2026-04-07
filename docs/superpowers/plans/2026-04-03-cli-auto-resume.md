# CLI Auto-Resume — 落ちても勝手に続きから再開

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shellyのターミナルでclaude/gemini等のCLIで作業中に、bridge切断・pty-helper死亡・Termuxクラッシュが発生しても、復旧後に自動的に`claude --continue`/`gemini --resume latest`を実行し、ユーザーが何もしなくても作業の続きから再開される。

**Design Philosophy:** ゼロ状態のユーザーは`claude --continue`を知らない。Shellyが裏でやる。Termuxの存在もCLIの復帰コマンドの存在も見せない。

**Tech Stack:** TypeScript (React Native / Zustand), Kotlin (Expo Native Module)

---

## 既存インフラ（再利用可能）

| コンポーネント | ファイル | 状態 |
|---|---|---|
| `activeCli` フィールド | `store/types.ts:149` | TabSessionに存在。`'claude'|'gemini'|'codex'|'cody'|null` |
| `setActiveCli()` | `store/terminal-store.ts:179` | sendCommand時に自動検出・セット |
| `detectCli()` | `hooks/use-termux-bridge.ts:47` | コマンド文字列からCLI種別を検出 |
| `CLI_RESUME_COMMANDS` | `lib/tmux-manager.ts:11` | `claude: 'claude --continue'`, `gemini: 'gemini --resume latest'` |
| `buildRecoveryCommand()` | `lib/tmux-manager.ts:74` | cwd + resumeコマンドを構築（現在未使用） |
| `activeCli`永続化 | `store/terminal-store.ts:597,639` | AsyncStorageに保存・復元済み |
| `BridgeRecoveryBanner` | `components/BridgeRecoveryBanner.tsx:74` | 手動「Resume?」ボタンあり（claudeのみ） |

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| **Modify** | `app/(tabs)/terminal.tsx` | `createNativeSession`成功後にCLI復帰コマンドを自動送信 |
| **Modify** | `lib/tmux-manager.ts` | `CLI_RESUME_COMMANDS`にcodex/cody対応追加、関数名をリネーム |
| **Modify** | `store/terminal-store.ts` | `clearActiveCli()`追加、`resetSession`時にactiveCli保持 |
| **Modify** | `components/BridgeRecoveryBanner.tsx` | 手動バナーを削除（自動化するため不要に） |
| **Modify** | `hooks/use-termux-bridge.ts` | `recoveredFromCrash`フラグをセッション単位に変更 |

---

## Task 1: CLI復帰コマンドの自動送信

**Files:**
- Modify: `app/(tabs)/terminal.tsx`
- Modify: `lib/tmux-manager.ts`

**Why:** `createNativeSession()`成功後に、前回のactiveCLIの復帰コマンドを自動送信する。pty-helperが新規作成された場合（=シェルが新しい）のみ発動。再接続の場合（既存pty-helperに戻った）は不要。

### Step 1: `buildRecoveryCommand`をリネームして独立関数化

- [ ] `lib/tmux-manager.ts`の`buildRecoveryCommand`を`lib/cli-recovery.ts`に移動（tmux依存を外す）
- [ ] `CLI_RESUME_COMMANDS`も一緒に移動
- [ ] codex/cody用のresumeコマンドを調査して追加（nullのままでもOK）

```typescript
// lib/cli-recovery.ts
export const CLI_RESUME_COMMANDS: Record<string, string | null> = {
  claude: 'claude --continue',
  gemini: 'gemini --resume latest',
  codex: null,  // codex CLIに復帰コマンドがあれば追加
  cody: null,
};

/**
 * Build a command to resume the previous CLI session.
 * Returns null if no recovery is needed.
 */
export function buildCliResumeCommand(
  cwd: string,
  activeCli: string | null,
): string | null {
  if (!activeCli) return null;

  const resumeCmd = CLI_RESUME_COMMANDS[activeCli];
  if (!resumeCmd) return null;

  const escaped = cwd.replace(/'/g, "'\\''");
  return `cd '${escaped}' && ${resumeCmd}`;
}
```

### Step 2: `createNativeSession`にCLI自動復帰を追加

- [ ] `terminal.tsx`の`createNativeSession`の最後（sessionStatus='alive'設定後）に、CLI復帰ロジックを追加
- [ ] **条件：pty-helperを新規起動した場合のみ**（`ptyAlive`がfalseだった場合）
- [ ] **シェル準備待ち：** 新しいシェルのプロンプトが表示されるまで1秒待つ
- [ ] 復帰コマンドをpty-helperに直接writeする（`TerminalEmulator.writeToSession`）

```typescript
// createNativeSession() の最後、sessionStatus='alive' 設定後:

// CLI auto-resume: if this was a fresh pty-helper (not reconnect),
// and the session had an active CLI, resume it automatically.
if (!ptyAlive && session.activeCli) {
  const resumeCmd = buildCliResumeCommand(session.currentDir, session.activeCli);
  if (resumeCmd) {
    // Wait for shell prompt to be ready
    await new Promise(resolve => setTimeout(resolve, 1500));
    try {
      await TerminalEmulator.writeToSession(
        session.nativeSessionId,
        resumeCmd + '\n'
      );
      console.log('[Terminal] CLI auto-resume sent:', resumeCmd);
    } catch (e) {
      console.warn('[Terminal] CLI auto-resume failed:', e);
    }
  }
}
```

### Step 3: Commit

```bash
git add lib/cli-recovery.ts app/\(tabs\)/terminal.tsx
git commit -m "feat: auto-resume CLI sessions after crash recovery

When pty-helper is newly created (not reconnected), Shelly checks
the session's activeCli field and automatically sends the resume
command (e.g. 'claude --continue'). Zero user interaction required."
```

---

## Task 2: activeCli状態管理の改善

**Files:**
- Modify: `store/terminal-store.ts`

**Why:** `resetSession()`でactiveCli情報が消えないようにする。また、CLIが正常終了した場合にactiveCLIをクリアする仕組みが必要。

- [ ] **Step 1:** `clearSession()`でactiveCLIを消さない（現在`clearSession`はblocks/entries/commandHistoryをクリアするがactiveCLIは触れていない — 確認して必要なら修正）

- [ ] **Step 2:** CLI終了検出 — `use-termux-bridge.ts`の`handleMessage`でexitイベント受信時、現在のコマンドがCLI起動コマンドだった場合にactiveCLIをnullにリセット

```typescript
// handleMessage内のexit処理:
case 'exit': {
  // ... existing code ...
  // If the exited command was a CLI, clear activeCli
  if (active && detectCli(active.command)) {
    useTerminalStore.getState().setActiveCli(null);
  }
  break;
}
```

- [ ] **Step 3:** Commit

---

## Task 3: BridgeRecoveryBannerの簡素化

**Files:**
- Modify: `components/BridgeRecoveryBanner.tsx`

**Why:** CLI復帰が自動化されたため、「セッションを引き継ぎますか？」の手動バナーは不要。ただし「復旧しました」の通知は残す。

- [ ] **Step 1:** `showSessionResume`ロジックを削除（Lines 36-103）
- [ ] **Step 2:** 代わりに復旧成功時に一瞬だけ「セッションを復旧しました」バナーを表示（3秒で自動消去）
- [ ] **Step 3:** `activeCliSession`チェックを`activeCli`に修正（既存バグ修正）
- [ ] **Step 4:** Commit

---

## Task 4: シェル準備完了の検出強化

**Files:**
- Modify: `app/(tabs)/terminal.tsx`

**Why:** Task 1の`setTimeout(1500)`は固定値で不安定。シェルのプロンプト文字列（`$`や`❯`）を検出してから復帰コマンドを送る方が確実。

- [ ] **Step 1:** `TerminalEmulator`のtranscript取得を使って、プロンプト文字列の出現を検出
- [ ] **Step 2:** 最大3秒まで250msポーリングでプロンプトを待つ。見つからなくても3秒後に送信（フォールバック）

```typescript
// Wait for shell prompt before sending CLI resume command
let promptDetected = false;
for (let i = 0; i < 12; i++) { // 12 * 250ms = 3s max
  await new Promise(resolve => setTimeout(resolve, 250));
  try {
    const transcript = await TerminalEmulator.getTranscriptText(session.nativeSessionId);
    if (transcript && (transcript.includes('$ ') || transcript.includes('❯ '))) {
      promptDetected = true;
      break;
    }
  } catch {}
}
```

- [ ] **Step 3:** Commit

---

## Task 5: 復帰フロー全体のE2Eテスト

- [ ] **テスト1:** Claude Code実行中 → bridgeを`kill` → Shellyのターミナル画面を確認 → 自動復旧 → `claude --continue`が自動実行されるか
- [ ] **テスト2:** Gemini実行中 → 同上 → `gemini --resume latest`が自動実行されるか
- [ ] **テスト3:** CLI未使用時 → bridge kill → 復旧 → 復帰コマンドが送信されないことを確認
- [ ] **テスト4:** pty-helper再接続（bridgeだけ死んだ場合）→ 既存セッション維持 → 復帰コマンドが送信されないことを確認（ptyAlive=true）

---

## Design Notes

### ゼロ状態ユーザーの体験

1. ShellyでClaude Codeを使って開発中
2. 何らかの理由でアプリ/bridge/Termuxが落ちる
3. Shellyを再度開く
4. 「ターミナルに再接続中...」が数秒表示される
5. ターミナルが復帰し、**Claude Codeが自動的に前回の続きから再開される**
6. ユーザーは何も操作していない

### パワーユーザーの体験

1. `claude --continue`が自動実行されたことがターミナルに表示される
2. Claude Codeが前回のコンテキストを保持して応答を再開する
3. 「おっ、勝手にcontinueしてくれるのか」と感心する

### エッジケース

- **CLIが復帰コマンドをサポートしていない場合（codex/cody）:** nullなので何も送信しない。新しいシェルが開くだけ。
- **activeCLIが古い場合（数日前にclaudeを使った後、普通のシェルを使っていた）:** activeCLIはCLI正常終了時にnullにリセットされるので問題ない。
- **復帰コマンドが失敗した場合（セッションが消えている）:** CLIが「セッションが見つかりません」と表示するだけ。ユーザーに害はない。
