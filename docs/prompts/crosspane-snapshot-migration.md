# CrossPane Intelligence — スナップショット方式への移行

## プロンプト（これをClaude Codeに投げる）

```
~/Shelly のCrossPane Intelligenceを修正してください。

## 現状の問題

スプリットビュー（左:チャット、右:ターミナル）で、チャットに「右のエラーを直して」と入力しても、チャット側がターミナルの出力を読めない場合がある。

### 再現手順
1. シングルビューのターミナルタブでコマンド実行（エラーが出る）
2. チャットタブに切り替え
3. スプリットビューにする
4. チャットに「fix the error on the right」と入力
5. → AIが「I don't see any error or code provided」と返す

### 原因
チャット側のターミナル出力読み取りが `onSessionOutput` イベント依存。
スプリットビューにする前に発火したイベントはキャプチャされない。

## 修正方針: スナップショット方式

イベント依存をやめて、**チャットがAI応答を生成する直前にターミナルの画面内容をスナップショット取得**する。

### 具体的な実装

1. チャットのdispatch処理（メッセージ送信時）で `TerminalEmulator.getTranscriptText(sessionId, 100)` を呼ぶ
2. 取得したテキストをシステムプロンプトまたはユーザーメッセージに注入:
   ```
   [Terminal Output - Session shelly-1]
   {transcriptText}
   ```
3. アクティブなターミナルセッション（スプリットビューで表示中のタブ）のtranscriptを取得

### APIは既に存在
- `TerminalEmulator.getTranscriptText(sessionId, maxLines)` — Kotlin側に実装済み
- `useTerminalStore` の `activeSessionId` でアクティブセッションを特定
- TypeScript型定義も `TerminalEmulatorModule.ts` にある

### 調査対象ファイル
- `lib/chat-dispatch.ts` または同等のチャット送信処理
- `hooks/use-terminal-output.ts` — 現在のターミナル出力キャプチャ
- `store/terminal-store.ts` — activeSessionId, sessions
- `modules/terminal-emulator/src/TerminalEmulatorModule.ts` — getTranscriptText API

### 注意点
- スプリットビューでなくても（シングルビューのチャットタブからでも）ターミナル出力を読めるべき
- transcriptは最新100行で十分（トークン節約）
- 既存のイベント依存のキャプチャがあれば、それは残してもいいが、スナップショットをプライマリにする
- ターミナルセッションが存在しない場合はスキップ（エラーにしない）
```

## 背景情報

- メモリ: `~/.claude/projects/.../memory/shelly-crosspane-snapshot-design.md`
- 設計仕様書: `docs/superpowers/specs/2026-03-23-cross-pane-intelligence-design.md`
- 前回確認: 2026-03-31、スプリットビューでCerebrasがターミナルエラーを検知できなかった
- ただし、スプリットビュー状態でコマンドを打った場合は正常に動作していた
