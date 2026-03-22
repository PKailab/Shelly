# AIレビュー指摘修正 + 設計改善

> **このドキュメントは別セッションで実装する。**
> 4AI（Perplexity/GPT/Gemini/Claude）のレビュー結果を反映した修正項目。

**レビュー全文:** `docs/SHELLY-COMPLETE-SPEC.md` のReview Questionsに対する回答として実施。
**レビュー結果統合:** 前セッションで4AI並列レビューを実施済み。

---

## 修正項目一覧

### 1. FIFOバッファ拡張（Phase 2基盤）

**現状:** 設計上100行
**修正:** 1000行。ERROR/FAIL/Exception含む行を優先保持。

**実装方針:**
- `execution-log-store.ts` の `terminalOutput` を2層構造に:
  - **hotBuffer:** 直近100行（リアルタイムオーバーレイ用）
  - **sessionBuffer:** 直近1000行（クロスペインインテリジェンス用）
- エラーパターン優先保持ロジック:
  ```typescript
  const ERROR_PATTERNS = [
    /error/i, /fail/i, /exception/i, /fatal/i,
    /ENOENT/, /EACCES/, /EPERM/,
    /TypeError/, /SyntaxError/, /ReferenceError/,
    /exit code [1-9]/, /exit status [1-9]/,
    /command not found/i, /permission denied/i,
  ];
  ```
- 1000行超過時: エラーパターンにマッチしない行から先にFIFO破棄
- `getRecentOutput(lines)` はエラー行の前後5行もコンテキストとして含める

---

### 2. auto-savepoint.ts シェルインジェクション修正

**現状:** `git -C ${projectDir}` でprojectDirが未エスケープ
**問題:** projectDirにスペースや特殊文字が含まれるとシェルインジェクション可能

**修正方針:**
- シェルエスケープ関数を追加:
  ```typescript
  function shellEscape(s: string): string {
    return "'" + s.replace(/'/g, "'\\''") + "'";
  }
  ```
- 全ての `git -C ${projectDir}` を `git -C ${shellEscape(projectDir)}` に変更
- 対象箇所: `initGitIfNeeded`, `checkAndSave`, `revertLastSavepoint`, `getLastDiff`
- printf コマンドの引数も同様にエスケープ

---

### 3. 自動生成.gitignore強化

**現状:** `node_modules/`, `.expo/`, `*.log`, `.env` のみ
**修正:** セキュリティ関連パターンを追加

```
node_modules/
.expo/
*.log
.env
.env.*
*.key
*.pem
*.p12
*.jks
*.keystore
credentials.json
service-account*.json
dist/
build/
.DS_Store
```

**対象ファイル:** `lib/auto-savepoint.ts` の `DEFAULT_GITIGNORE` 定数

---

### 4. ActionBlock 言語判定

**現状:** 全コードブロックに [▶実行] ボタン（未実装、Phase 4で実装予定）
**修正:** 言語タグで実行可能性を判定

**ルール:**
| 言語タグ | ボタン |
|---------|--------|
| `bash`, `sh`, `zsh`, `shell`, タグなし | [▶ 実行] [コピー] |
| `typescript`, `javascript`, `python`, `json`, `html`, `css`, `yaml`, `toml`, その他 | [コピー] のみ |

**タグなしの判定:**
- 先頭が `$`, `#`, `sudo`, `npm`, `git`, `cd`, `mkdir`, `ls` 等で始まる → 実行可能
- それ以外 → コピーのみ

**実装箇所:** `components/chat/ActionBlock.tsx`（Phase 4で新規作成時に組み込む）

---

### 5. リアルタイム翻訳フォールバック順修正

**旧:** Cerebras API → Groq API → `gemini -p` (CLI) → ローカルLLM
**新:** Cerebras API → Groq API → Gemini CLI（アカウント認証、`gemini -p`） → ローカルLLM

**変更理由:**
- Gemini APIではなくGemini CLI（`gemini -p`）を使用
- Gemini CLIはGoogle OAuthで認証済み（Shellyセットアップ時に推奨インストール）
- APIキー不要でShellyの「APIキーを預からない」思想と一致
- プロセス起動オーバーヘッドはデバウンス（項目7）で緩和
- TerminalでClaude Code実行中の場合、暗黙的セカンドオピニオンとしても機能

**注意点（Claudeレビュー指摘）:**
- Gemini CLIはNode.jsプロセスを毎回起動するためコールドスタート1-3秒
- デバウンス（5秒バッチ）で呼び出し頻度を制限することで緩和
- Terminalで既にGemini CLIが対話実行中の場合はスキップしてローカルLLMにフォールバック

---

### 6. Timeline View をv1.0スコープに昇格

**旧:** Future Design (v2.0+)
**新:** v1.0スコープ（P0）

**理由（GPT/Claude共通指摘）:**
- 自動セーブポイントは既に実装済み。Timeline Viewはその可視化UIであり、実装基盤は揃っている
- Timeline Viewなしではセーブポイントがユーザーに見えず、機能の存在を認知できない
- 「ゲームのセーブ/ロード」メタファーの完成にはロード画面（=Timeline）が不可欠
- 実装コスト: `git log --oneline` + `git diff` + UIのみ。1-2セッションで実装可能

**実装場所:** Projectsタブのプロジェクトカード内

**表示例:**
```
portfolio-site
├── 今日 15:30  「CSSを修正」
├── 今日 14:00  「ページ追加」
├── 昨日 20:00  「初回作成」
```

**操作:**
- タップ → 「この時点に戻す」「この時点との差分を見る」
- 裏: `git checkout <hash>` / `git diff <hash> HEAD`

---

### 7. リアルタイム翻訳に5秒デバウンス

**問題:** ターミナル出力の各行ごとにLLM呼び出しするとAPI消費・レート制限・OOMリスク
**修正:** 5秒間の出力を蓄積してバッチ翻訳

**実装方針:**
```typescript
// 5秒デバウンスタイマー
let translateBuffer: string[] = [];
let translateTimer: ReturnType<typeof setTimeout> | null = null;

function onNewTerminalLine(line: string) {
  translateBuffer.push(line);
  if (translateTimer) clearTimeout(translateTimer);
  translateTimer = setTimeout(() => {
    const batch = translateBuffer.join('\n');
    translateBuffer = [];
    translateAndDisplay(batch); // フォールバック順でLLMに送信
  }, 5000);
}
```

- 出力が止まって5秒後に翻訳実行
- 連続出力中は蓄積のみ（呼び出しなし）
- 最大バッチサイズ: 50行（超過分は切り捨て、直近50行のみ翻訳）

---

## 実装順序

```
1. auto-savepoint.ts シェルインジェクション修正（セキュリティ、即座に）
2. auto-savepoint.ts .gitignore強化（セキュリティ、即座に）
3. FIFOバッファ2層化（Phase 2実装時に組み込む）
4. ActionBlock言語判定（Phase 4実装時に組み込む）
5. フォールバック順修正（Phase 5実装時に組み込む）
6. リアルタイム翻訳デバウンス（Phase 5-1実装時に組み込む）
7. Timeline View（クロスペイン実装完了後、別セッションで）
```

項目1-2はクロスペイン開発と独立しているため、どのセッションでも着手可能。
項目3-6はクロスペイン各Phase実装時に設計に反映する。
項目7はクロスペイン完了後。

---

## 未解決の判断事項（りょうさんが決める）

- **GitHub連携のv1.0スコープ:** Geminiは「必須」、Claudeは「v1.1で」。現時点では保留
- **MCPの言い回し:** 「除外」→「将来ロードマップ」に言い換えるかどうか
- **公式サポートAI数:** Geminiは「3つに絞れ」と提案（Claude Code, Gemini CLI, 高速推論API）。残りは「実験的」表記
