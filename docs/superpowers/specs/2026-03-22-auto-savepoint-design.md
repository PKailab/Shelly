# Auto Savepoint + Undo — Design Spec

## Overview

Shellyにゲームのオートセーブ機能を導入する。ユーザーはGitという概念を知らなくても、作業が自動で保存され、失敗したら「元に戻す」ボタンで戻せる。

裏ではgit add/commit/revertが走るが、ユーザーにはGitの用語を一切見せない。

## Triggers

自動セーブには3つのトリガーがある:

1. **AI応答完了後** — `@claude`, `@gemini`等のAI応答が完了したら即座にdiffチェック→セーブ
2. **ファイル変更系コマンド完了後** — `npm init`, `touch`, `mkdir`, `cp`, `mv`, エディタ系コマンドの完了後にdiffチェック→セーブ
3. **30秒アイドルタイマー** — 最後のコマンドから30秒間操作がなければdiffチェック。変更あればセーブ、なければ何もしない（通知なし）

## Save Process

```
1. bridge経由で git -C <projectDir> status --porcelain
2. 空なら何もしない（return silently）
3. git -C <projectDir> add -A
4. git -C <projectDir> commit -m "Auto: <自動生成メッセージ>"
5. ChatHeaderに💾バッジを2秒間表示（フェードイン→フェードアウト）
```

### Commit Message Auto-Generation

- 新規ファイルのみ → `Auto: Created <filename>` (複数: `Auto: Created 5 files`)
- 変更のみ → `Auto: Updated <filename>` (複数: `Auto: Updated 3 files`)
- 削除のみ → `Auto: Removed <filename>`
- 混在 → `Auto: Modified 3 files, created 2, removed 1`

### Git Initialization

プロジェクトを開いた時に`.git`がなければ自動初期化:
```
git init
echo "node_modules/\n.expo/\n*.log\n.env" > .gitignore
git add -A
git commit -m "Auto: Initial savepoint"
```
ユーザーには何も表示しない（初回セーブポイントとして静かに作成）。

## Undo UI

AIまたはコマンドがファイルを変更したら、チャットバブル下部に表示:

```
📁 ファイルを5個変更しました
[元に戻す]  [変更を見る]
```

- **「元に戻す」** → `git -C <dir> revert HEAD --no-edit` → 「元に戻しました」トースト
- **「変更を見る」** → モーダルで `git -C <dir> diff HEAD~1` の結果を表示

### Revert Edge Cases

- 初回コミット（Initial savepoint）には「元に戻す」ボタンを表示しない
- revert失敗時（コンフリクト等）→ `git revert --abort` してエラートースト「元に戻せませんでした」
- 既にrevertしたコミットに再度revertは不可（ボタンをdisabled化）

## Components

### `lib/auto-savepoint.ts`
- `checkAndSave(projectDir: string, trigger: 'ai' | 'command' | 'idle'): Promise<SaveResult | null>`
- `generateCommitMessage(status: string): string`
- `initGitIfNeeded(projectDir: string): Promise<void>`
- `revertLastSavepoint(projectDir: string): Promise<boolean>`
- `getLastDiff(projectDir: string): Promise<string>`

### `store/savepoint-store.ts` (Zustand)
```typescript
{
  isEnabled: boolean,           // auto-savepoint ON/OFF
  lastSaveTime: number | null,
  isSaving: boolean,
  showBadge: boolean,           // 💾 badge visibility
  lastSavepointInfo: {          // for undo UI
    commitHash: string,
    message: string,
    filesChanged: number,
    reverted: boolean,
  } | null,
}
```

### `components/SavepointBubble.tsx`
チャットバブルの下に表示するセーブポイント情報+元に戻すボタン。

### `components/SaveBadge.tsx`
ChatHeader右端の💾アイコン。セーブ完了時に2秒間表示。Animated.Viewでフェードイン/アウト。

### `components/DiffViewerModal.tsx`
「変更を見る」で表示するモーダル。diff出力をaddition(緑)/deletion(赤)でハイライト。

## Integration Points

- `hooks/use-termux-bridge.ts` — コマンド完了時のコールバックでトリガー
- `hooks/use-ai-dispatch.ts` — AI応答完了時のコールバックでトリガー
- `components/chat/ChatHeader.tsx` — SaveBadge組み込み
- `app/(tabs)/index.tsx` — アイドルタイマー管理、SavepointBubble表示

## Scope Exclusions (v1)

- ブランチ操作
- GitHub連携 / push
- タイムライン表示 (Projects tab)
- コンフリクト解決UI
- `.gitignore` のカスタマイズUI
- セーブポイント一覧の閲覧UI
