# Timeline View — プロジェクトカード内セーブポイント表示

## 概要

Projectsタブのgitリポジトリカードにアコーディオン展開型のタイムラインを追加。
auto-savepointで自動作成されたコミット履歴を「ゲームのセーブデータ一覧」として可視化し、
任意の時点への巻き戻し・差分確認をワンタップで実現する。

## アーキテクチャ

### 新規ファイル
- `components/ProjectTimeline.tsx` — タイムラインUI

### 変更ファイル
- `app/(tabs)/projects.tsx` — プロジェクトカードにタイムライン展開を追加
- `lib/auto-savepoint.ts` — `getTimeline()` 関数を追加
- `lib/i18n/locales/ja.ts` / `en.ts` — タイムライン関連の翻訳キー

## データ取得

`lib/auto-savepoint.ts` に追加:

```typescript
export type TimelineEntry = {
  hash: string;
  message: string;
  relativeTime: string;
};

export async function getTimeline(
  projectDir: string,
  runCommand: RunCommandFn,
  limit: number = 20,
): Promise<TimelineEntry[]> {
  const dir = shellEscape(projectDir);
  const { stdout, exitCode } = await runCommand(
    `git -C ${dir} log --oneline --format='%h|%s|%cr' -${limit} 2>/dev/null`
  );
  if (exitCode !== 0 || !stdout.trim()) return [];
  return stdout.trim().split('\n').map((line) => {
    const [hash, message, relativeTime] = line.split('|');
    return { hash, message, relativeTime };
  });
}

export async function checkoutSavepoint(
  projectDir: string,
  hash: string,
  runCommand: RunCommandFn,
): Promise<boolean> {
  const dir = shellEscape(projectDir);
  const { exitCode } = await runCommand(`git -C ${dir} checkout ${hash}`);
  return exitCode === 0;
}

export async function getDiffFromSavepoint(
  projectDir: string,
  hash: string,
  runCommand: RunCommandFn,
): Promise<string> {
  const dir = shellEscape(projectDir);
  const { stdout } = await runCommand(`git -C ${dir} diff ${hash} HEAD`);
  return stdout;
}
```

## UI: ProjectTimeline.tsx

### Props
```typescript
type Props = {
  projectPath: string;
  runCommand: RunCommandFn;
};
```

### 表示構造
```
┌─ portfolio-site ──────────────────────┐
│ 📁  portfolio-site       [▼ Timeline] │  ← 既存カード + トグルボタン
│ ├── 5min ago   「Auto: Updated app.ts」│
│ ├── 1hr ago    「Auto: Created 3 files」│
│ ├── yesterday  「Auto: Initial save」  │
│ └── (show more...)                     │
└────────────────────────────────────────┘
```

### エントリタップ時
`Alert.alert` で2択:
1. 「差分を見る」→ `getDiffFromSavepoint()` → DiffViewerModal表示
2. 「この時点に戻す」→ 確認ダイアログ → `checkoutSavepoint()`

### スタイル
- 左ボーダー: `colors.accent` (2px) で縦線
- 各エントリ: ドット + 時間 + メッセージ
- 「Auto: 」プレフィックスは表示から除去（ユーザーに見せない）
- 背景: `colors.surface`

## i18n追加キー

```typescript
// ja.ts
timeline: {
  title: 'タイムライン',
  view_diff: '差分を見る',
  revert: 'この時点に戻す',
  revert_confirm: 'この時点に戻しますか？現在の未保存の変更は失われます。',
  revert_success: '戻しました',
  revert_fail: '戻せませんでした',
  empty: 'セーブポイントがありません',
  show_more: 'もっと見る',
},

// en.ts
timeline: {
  title: 'Timeline',
  view_diff: 'View changes',
  revert: 'Revert to this point',
  revert_confirm: 'Revert to this point? Unsaved changes will be lost.',
  revert_success: 'Reverted successfully',
  revert_fail: 'Failed to revert',
  empty: 'No savepoints yet',
  show_more: 'Show more',
},
```

## 注意点
- `checkoutSavepoint` はdetached HEAD状態になる。ユーザーにはその概念を見せず「戻しました」とだけ表示
- Timeline表示は展開時に1回だけfetch。pull-to-refreshは不要（アコーディオン閉じて開けばリフレッシュ）
- 非gitプロジェクトにはタイムラインボタンを表示しない
