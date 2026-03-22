# Shelly 大型改修 — クロスペインインテリジェンス 完全仕様

## この改修が何を実現するか

Shellyの最大の差別化機能を実装する。

**問題:** CLIベースのAIツール（Claude Code, Gemini CLI, Codex）を使う全開発者は、毎日この地獄を繰り返している:
1. ターミナルでエラーが出る
2. エラーをコピー
3. ChatGPT/Claudeのブラウザタブに切り替え
4. ペーストして「何が間違ってる？」と聞く
5. 回答を読む
6. 修正コマンドをコピー
7. ターミナルに戻る
8. ペーストして実行

**Shellyの解決策:** ChatとTerminalを並べて、「右のエラー直して」と言うだけ。AIがターミナル出力を読み取り、自然言語で説明し、実行可能なコマンドを生成し、「▶ 実行」タップでTerminalに送信される。コピペゼロ。タブ切り替えゼロ。

**Shellyの3段階の価値:**
- Level 1: Chatだけで開発できる（初心者の入口）
- Level 2: Terminalだけで開発できる（パワーユーザーの居場所）
- Level 3: 両方を並べたとき、全く新しい開発体験になる（Shellyの真の価値）

---

## 実装フェーズ一覧

```
Phase 1: Terminalタブのクリーンアップ（Activity Log削除）
Phase 2: Terminal出力キャプチャ（クロスペインの基盤）
Phase 3: クロスペインインテリジェンス（コア機能）
Phase 4: ActionBlock（実行可能コマンドの分離表示 + ワンタップ実行）
Phase 5: CLI実行時リアルタイムアシスト
Phase 6: CommandExecBubbleに「Terminalで開く」ボタン
Phase 7: 冗長機能の整理（3件）
Phase 8: README・ドキュメント全面更新
```

Phase 1→2→3→4 は依存関係があるため順番厳守。
Phase 5 はPhase 2完了後に着手可能（Phase 3と並行可）。
Phase 6 はPhase 4完了後。
Phase 7 の3件は独立しているためPhase 6以降に並行可能。
Phase 8 は全実装完了後。
**各Phase完了ごとにコミットすること。**

---

## Phase 1: Terminalタブのクリーンアップ

### やること
- `app/(tabs)/terminal.tsx` から Activity Log パネル（execution-log-storeに依存する表示部分）を完全に削除
- Terminalタブは **ttyd WebView + ShortcutBar + TerminalHeader のみ**
- Terminalタブの役割を「純粋なTermux TTY」に限定

### やらないこと
- `store/execution-log-store.ts` 自体は削除しない（Phase 2で再利用）
- ChatタブのCommandExecBubbleは変更しない

### 確認
- [ ] Terminalタブが ttyd WebView + ShortcutBar + TerminalHeader のみ
- [ ] Chatでのコマンド実行がTerminalタブに一切表示されない

---

## Phase 2: Terminal出力キャプチャ

### やること
- Terminalタブ内のttyd WebViewからターミナル出力テキストをキャプチャ
- キャプチャ方法: WebSocketメッセージ傍受 または WebViewの`onMessage`
- `execution-log-store` に以下を追加:

```typescript
terminalOutput: string[]  // 直近100行のターミナル出力
addTerminalOutput: (line: string) => void  // 追加（100行超えたらFIFOで破棄）
getRecentOutput: (lines?: number) => string  // 直近N行を結合して返す（デフォルト50行）
clearTerminalOutput: () => void
```

- ANSIエスケープコードはストリップしてプレーンテキストで保存

### 確認
- [ ] Terminalでコマンドを打つと `terminalOutput` に出力が入る
- [ ] ANSIエスケープコードが除去されている
- [ ] 100行超過で古い行が自動破棄される

---

## Phase 3: クロスペインインテリジェンス

### 3-1. input-router.ts にターミナル参照インテントを追加

```typescript
const TERMINAL_REFERENCE_PATTERNS = [
  // 日本語
  /右の(画面|エラー|出力)/,
  /ターミナル(の|にある|に出てる)(エラー|出力|結果|ログ)/,
  /さっきの(エラー|出力|結果)/,
  /このエラー(を|)(直して|修正して|説明して|教えて)/,
  // 英語
  /right\s*(panel|screen|side|pane)/i,
  /(fix|explain|what('s| is))\s*(the|this)\s*(error|output|result)/i,
  /terminal\s*(output|error|result|log)/i,
  /(look at|check|see|read)\s*(the\s*)?(terminal|right)/i,
];
```

### 3-2. 検出後の処理
1. `execution-log-store.getRecentOutput(50)` でターミナル出力を取得
2. 出力が空 → 通常のAI応答にフォールバック
3. 出力あり → AIリクエストのシステムプロンプトに注入:

```
--- Terminal Output (last 50 lines) ---
<terminalOutputの内容>
---
The user is referring to the terminal output shown above. Analyze it and respond to their request.
If your response includes commands or code that can fix the issue, format them as fenced code blocks (```) so the user can execute them directly.
```

### 3-3. 有効条件
- マルチペイン時（`isWide === true`）: 常に有効
- シングルペイン時: `terminalOutput` にデータがある場合のみ有効
- `terminalOutput` が空: パターンマッチしても通常応答にフォールバック

### 確認
- [ ] マルチペインで「右のエラー直して」→ AIがターミナル出力を参照して回答
- [ ] バリエーション（「fix the error」「ターミナルの出力を見て」等）が動作
- [ ] シングルペインでTerminal→Chat切替後「さっきのエラー」→ 動作
- [ ] ターミナル出力が空のときは通常応答にフォールバック

---

## Phase 4: ActionBlock（実行可能コマンドの分離表示）

### コンセプト
AIの自然言語回答の後に、実行可能なコマンドブロックを分離表示。ユーザーはワンタップでTerminalに送信・実行。

### 実装: `components/chat/ActionBlock.tsx`

AIの応答テキスト内のマークダウンコードブロック（```で囲まれた部分）を検出・分離。

**表示構造:**
```
[ChatBubble — AI自然言語の説明テキスト]

┌─ 実行コマンド ──────────────────┐
│ sed -i 's/get/post/' src/app.ts │
│                    [▶ 実行] [コピー] │
└──────────────────────────────────┘
```

**[▶ 実行]の挙動:**
- マルチペイン時 → `use-termux-bridge` 経由でTerminalペインにコマンド送信・実行
- シングルペイン時 → Bridge経由で裏で実行 → 結果をChat内のCommandExecBubbleで表示
- 実行前に `command-safety.ts` で危険度チェック。HIGH以上なら確認ダイアログ

**[コピー]の挙動:**
- クリップボードにコピー + トースト表示

**パースロジック:**
- AI応答を正規表現でテキスト部分とコードブロック部分に分割、交互にレンダリング
- 言語ヒント（```bash等）があればシンタックスハイライト
- 複数コードブロックはそれぞれ独立したActionBlock

**スタイル:**
- 背景: テーマ `surface`、左ボーダー: テーマ `accent`（2px）
- コマンドテキスト: モノスペースフォント
- ボタン: テキストリンク風、小さく右寄せ

### 確認
- [ ] AI応答にコードブロックが含まれる → ActionBlockとして分離表示
- [ ] コードブロックなし → 通常のChatBubble
- [ ] [▶ 実行]でTerminalにコマンド送信・実行
- [ ] マルチペイン時はTerminalペインで実行が見える
- [ ] シングルペイン時はChat内に結果バブル
- [ ] command-safety.tsの危険度チェックが走る
- [ ] [コピー]でクリップボードにコピー
- [ ] 複数コードブロックがそれぞれ独立ActionBlock

---

## Phase 5: CLI実行時リアルタイムアシスト

### 5-1. CLI出力のリアルタイム翻訳・解説

**トリガー:** Settings内の「リアルタイム翻訳」トグル（デフォルト: OFF）

**フォールバック順:**
1. Cerebras API（高速推論、無料枠あり）
2. Groq API（同上）
3. `gemini -p "..."` — Gemini CLI（Shellyの推奨CLI、全ユーザーに存在する可能性が最も高い。TerminalでClaude Code実行中の場合、暗黙的なセカンドオピニオンとしても機能する。Shellyの設計思想「APIキーをユーザーから預からない」とも一致する）
4. ローカルLLM

**翻訳だけでなく、実行中の内容の自然言語化も行う。**

- ONの場合、`terminalOutput` の新しい行が追加されるたびに、上記フォールバック順でLLMに送信
- 翻訳結果はChatバブルではなく、**Chat画面上部の半透明オーバーレイ**に表示（チャット履歴を汚さない）
- 新しい翻訳が来たら前の翻訳を上書き（常に最新の1ブロックのみ表示）
- 全フォールバックが使えない場合はトグル自体をグレーアウト

### 5-2. 承認プロンプトの翻訳とリスク解説

**トリガー:** `terminalOutput` の新しい行に以下のパターンを検出:

```typescript
const CLI_APPROVAL_PATTERNS = [
  /Allow.*\?\s*\(Y\/n\)/i,
  /Do you want to (proceed|continue)\?/i,
  /Confirm.*\(y\/N\)/i,
  /Press (y|enter) to continue/i,
  /\[Y\/n\]/,
  /\[y\/N\]/,
];
```

検出時の処理:
1. 承認プロンプトの前の数行（コンテキスト）をLLMに送信（フォールバック順はPhase 5-1と同じ）
2. 日本語で「何をしようとしているか」「リスクは何か」を翻訳
3. Chat側にアラートバブルとして表示

### 5-3. セカンドオピニオン

**トリガー:** ユーザーがChat側で明示的に依頼

ターミナル参照パターン（Phase 3）の拡張:

```typescript
const SECOND_OPINION_PATTERNS = [
  /右で(やってる|やっている)こと(を|)(レビュー|評価|確認|チェック)/,
  /Claudeが(やってる|やっている)こと(どう|どう思う)/,
  /(別の|他の)AI(に|で)(聞|確認|レビュー)/,
  /review what('s| is) (happening|going on) (on the|in the) (right|terminal)/i,
  /second opinion/i,
  /what do you think (about|of) (the|this) (approach|code|change)/i,
];
```

### 5-4. セッションサマリー

**トリガー:** ユーザーがChat側で明示的に依頼

```typescript
const SESSION_SUMMARY_PATTERNS = [
  /さっきの作業(を|)(まとめ|要約|サマリ)/,
  /作業(内容|ログ|履歴)(を|)(まとめ|教えて)/,
  /summarize (the|this|my) (session|work|changes)/i,
  /what did (I|we) (do|change|modify)/i,
];
```

### 5-5. 実装の優先順位

| 機能 | 優先度 | 条件 |
|------|--------|------|
| 5-3. セカンドオピニオン | **高** | 常に有効 |
| 5-4. セッションサマリー | **高** | 常に有効 |
| 5-2. 承認プロンプト翻訳 | **中** | LLM利用可能時のみ |
| 5-1. リアルタイム翻訳・解説 | **必須** | Settings内トグルでON |

---

## Phase 6: CommandExecBubbleに「Terminalで開く」ボタン

### やること
- `components/chat/CommandExecBubble.tsx` に「Terminalで開く」テキストリンク追加
- タップ → Terminalタブに切替 + そのコマンドのcwdに `cd`

---

## Phase 7: 冗長機能の整理

### 7-1. Quick Terminal（条件付き非表示）
- Wide画面: CommandPaletteからQuick Terminal非表示 + Ctrl+`無効化
- Compact/Standard: 変更なし

### 7-2. LLM出力通訳（デフォルトOFF化）
- `terminal-store.ts` に `llmInterpreterEnabled: boolean`（デフォルト: `false`）
- Settings「学習モード」トグル追加

### 7-3. ShortcutBar（条件付き非表示）
- Settings「外部キーボードのショートカットを使用する」トグル（デフォルト: OFF）

---

## Phase 8: README・ドキュメント全面更新

### ヒーローのサブタイトル
```
Chat and Terminal, side by side. Connected by AI.
Say "fix the error on the right" — and it's done.
```

### The Story — 全面書き換え（copypasteの痛み → Shellyの解決策 → 3モード）
### Features — クロスペイン機能を最上位に
### Architecture — クロスペイン図 + CLI Co-Pilot図
### Design Philosophy — 追記
### About the Creator — 追記
### PRESENTATION.md — Copy-Paste Problemセクション追加
### Onboarding — Wide画面でクロスペインヒント表示
### CLAUDE.md — Architecture Decisionsテーブル更新

（各セクションの詳細テキストはユーザーの原文仕様書に記載済み）

---

## セッションローテーション計画

| セッション | Phase | 目標 |
|-----------|-------|------|
| Session 1 | Phase 1-3 | Terminal整理 + 出力キャプチャ + クロスペイン基盤 |
| Session 2 | Phase 4-5 | ActionBlock + リアルタイムアシスト |
| Session 3 | Phase 6-8 | 仕上げ + ドキュメント |

各Session開始時にこのファイルとCLAUDE.mdを読み込み、コンテキストを即座に復元する。
