# Shelly — CLAUDE.md

このファイルはClaude Codeがプロジェクトを理解するためのコンテキストです。

---

## プロジェクト概要

**Shelly** はAI搭載のAndroidターミナルIDE。Samsung Galaxy Z Fold6上で開発されている。

- **技術スタック**: Expo 54 / React Native 0.81 / TypeScript (strict)
- **UI**: NativeWind (TailwindCSS 3)
- **状態管理**: Zustand
- **パッケージマネージャ**: pnpm
- **ナビゲーション**: expo-router v6（ファイルベース）
- **アニメーション**: React Native Reanimated v4
- **i18n**: expo-localization + Zustand（日英対応）
- **Bundle ID**: `dev.shelly.terminal`
- **PTY**: JNI forkpty（`modules/terminal-emulator/` — Kotlin + C）。Termux不要
- **バンドルツール**: bash, Node.js, Python 3, git, curl, ssh, sqlite3, rg, jq（APK同梱、`LibExtractor`で自動展開）
- **コマンド実行**: `execCommand()` from `hooks/use-native-exec.ts`（JNI fork+exec+pipe）
- **APIキー**: `lib/secure-store.ts`（expo-secure-store暗号化保存）
- **設定**: ConfigTUI（歯車ボタン or `shelly config`）— 設定タブは廃止済み

---

## レイアウト構成（Superset UI v6）

タブ構成は廃止。`app/index.tsx` が `ShellLayout` を直接レンダリングする。

```
ShellLayout
├── AgentBar       (上部) — エージェント状態・通知・グローバルアクション
├── Sidebar        (左)   — Tasks / Repos / Files / Device / Ports / Profiles
├── PaneContainer  (中央) — ターミナル/AI/ブラウザ/Markdownのペイン群
└── ContextBar     (下部) — cwd・gitブランチ・接続状態
```

**ペインタイプ**: Terminal / AI / Browser / Markdown（always-on、オーバーレイではない）

---

## ディレクトリ構成

```
Shelly/
├── app/
│   ├── _layout.tsx             # ルートレイアウト
│   ├── index.tsx               # ShellLayout を直接レンダリング
│   └── (tabs)/
│       └── terminal.tsx        # Terminalペイン用コンテンツ（他タブは削除済み）
├── components/
│   ├── layout/
│   │   ├── ShellLayout.tsx         # 全体レイアウト（AgentBar+Sidebar+Pane+ContextBar）
│   │   ├── AgentBar.tsx            # 上部バー（エージェント切替+検索+設定）
│   │   ├── Sidebar.tsx             # 左サイドバー（Tasks/Repos/Files/Device/Ports/Profiles）
│   │   ├── SidebarSection.tsx      # アコーディオンセクション
│   │   ├── FileTree.tsx            # ファイルブラウザ
│   │   ├── ContextBar.tsx          # 下部ステータス（cwd・gitブランチ・接続状態）
│   │   └── ProfilesSection.tsx     # SSHプロファイル管理
│   ├── multi-pane/
│   │   ├── MultiPaneContainer.tsx  # ペイングリッド（inline、overlay廃止）
│   │   ├── PaneSlot.tsx            # 各ペインスロット（エージェント色ボーダー+フォーカス）
│   │   └── pane-registry.ts        # Terminal/AI/Browser/Markdownの登録
│   ├── panes/
│   │   ├── AIPane.tsx              # AIチャット+ストリーミング+インラインdiff
│   │   ├── BrowserPane.tsx         # WebView+ブックマーク+バックグラウンドメディア
│   │   ├── MarkdownPane.tsx        # Markdownプレビュー+editボタン
│   │   ├── PaneInputBar.tsx        # 共通入力バー（AI/Browser/Markdownペイン下部）
│   │   ├── InlineDiff.tsx          # diff Accept/Reject UI
│   │   └── VoiceWaveform.tsx       # インライン音声波形
│   ├── terminal/
│   │   ├── TerminalBlock.tsx       # コマンドブロック（インラインコンテンツ対応）
│   │   ├── AutocompletePopup.tsx   # Fig-style補完UI
│   │   ├── RichInputOverlay.tsx    # シンタックスハイライトオーバーレイ
│   │   ├── MarkdownBlock.tsx       # インラインMarkdownレンダラ
│   │   ├── JsonTreeBlock.tsx       # 折りたたみJSON表示
│   │   ├── ImagePreviewBlock.tsx   # インライン画像プレビュー
│   │   ├── TableBlock.tsx          # テーブル表示
│   │   └── LinkContextMenu.tsx     # パス/URL長押しメニュー
│   ├── config/
│   │   └── ConfigTUI.tsx           # 設定ボトムシート（全設定移植済み）
│   ├── CrtOverlay.tsx              # CRTエフェクト（scanlines+phosphor+flicker）
│   ├── ContextHint.tsx             # 行動トリガーヒント
│   ├── CommandPalette.tsx          # コマンドパレット（recent+suggested+search）
│   ├── AuthWizard.tsx              # CLI認証（ブラウザ認証+APIキー）
│   ├── WelcomeWizard.tsx           # セットアップウィザード（CLI自動インストール対応）
│   └── VoiceChat.tsx               # フルスクリーン音声モード
├── modules/
│   ├── terminal-emulator/          # JNI forkpty ネイティブモジュール
│   │   ├── android/src/main/java/  # Kotlin — TerminalEmulatorModule, LibExtractor, ShellyJNI
│   │   └── android/src/main/jni/   # C — shelly-pty.c (forkpty), shelly-exec.c (exec)
│   └── terminal-view/              # ネイティブターミナルビュー（Kotlin Canvas描画）
├── lib/
│   ├── autocomplete-engine.ts      # Fig-style補完エンジン（fuzzyスコアリング）
│   ├── syntax-highlighter.ts       # シェルコマンドシンタックスハイライト
│   ├── error-pattern-detector.ts   # file:line:col エラーパターン検出
│   ├── content-block-detector.ts   # 出力タイプ判定（markdown/json/image/table）
│   ├── cli-notification.ts         # コマンド完了通知イベント
│   ├── workflow-manager.ts         # `shelly workflow` CRUD
│   ├── ai-pane-context.ts          # AIペインへのターミナルコンテキスト注入
│   ├── feature-catalog.ts          # 167機能カタログ（AI Discovery用）
│   ├── context-hint-manager.ts     # 行動トリガーヒント管理
│   ├── font-manager.ts             # フォント選択（CRT連動）
│   ├── sound-profiles.ts           # Modern/Retro/Silent
│   ├── haptics.ts                  # ハプティクスフィードバック
│   ├── workspace-manager.ts        # リポジトリごとのワークスペース切替
│   ├── local-llm.ts                # ローカルLLMオーケストレーション
│   ├── groq.ts                     # Groq API (SSEストリーミング)
│   ├── gemini.ts                   # Gemini API
│   ├── perplexity.ts               # Perplexity API
│   ├── cli-runner.ts               # CLIツール管理（claude/gemini/codex）
│   ├── cli-auth.ts                 # CLI認証（SecureStore）
│   ├── secure-store.ts             # APIキー暗号化（expo-secure-store）
│   ├── pseudo-shell.ts             # `shelly` コマンドハンドラ
│   ├── command-safety.ts           # コマンド安全チェック（5段階）
│   ├── input-router.ts             # 自然言語→コマンドルーティング
│   ├── theme-engine.ts             # テーマエンジン（30種）
│   ├── debug-logger.ts             # [Shelly][Module] 形式のデバッグログ
│   └── i18n/
│       └── locales/ (en.ts, ja.ts)
├── store/
│   ├── terminal-store.ts      # セッション・ブロック管理
│   ├── settings-store.ts      # アプリ設定
│   ├── pane-store.ts          # ペインフォーカス・エージェントバインド
│   ├── sidebar-store.ts       # サイドバーモード・リポジトリ
│   ├── ai-pane-store.ts       # ペインごとのAI会話
│   ├── browser-store.ts       # ブックマーク
│   ├── cosmetic-store.ts      # CRT・フォント・ハプティクス
│   ├── agent-store.ts         # バックグラウンドエージェント
│   ├── profile-store.ts       # SSHプロファイル
│   ├── workspace-store.ts     # リポジトリごとのワークスペース分離
│   └── workflow-store.ts      # 保存済みワークフロー
├── hooks/
│   ├── use-device-layout.ts      # レスポンシブ（compact/standard/wide）
│   ├── use-native-exec.ts        # execCommand() — JNI経由コマンド実行
│   ├── use-multi-pane.ts         # ペインツリー管理（split/resize/remove）
│   ├── use-autocomplete.ts       # 補完フック（sync+async path/git）
│   ├── use-ai-pane-dispatch.ts   # AIペインストリーミング（Groq/Gemini/Perplexity/Local）
│   ├── use-pane-voice.ts         # ペイン内音声入力
│   ├── use-command-palette.ts    # コマンドパレット状態
│   └── use-speech-input.ts       # 録音+文字起こし
├── chelly/                    # Chat UI OSS切り出し（別リポ予定）
├── .github/workflows/
│   └── build-android.yml
└── CLAUDE.md
```

---

## レスポンシブデザイン方針

### ブレークポイント（`hooks/use-device-layout.ts`）

| 区分 | 幅 | 対象デバイス | ペイン数上限 |
|------|-----|-------------|-------------|
| Compact | < 380dp | Z Fold6カバー、小型スマホ | 1 |
| Standard | 380-599dp | 一般スマホ | 1 |
| Wide | >= 600dp | タブレット、Z Fold6展開 | 最大4 |

- **Z Fold6展開（wide）**: 左サイドバー常時表示 + 最大4ペイン分割
- **折りたたみ（standard/compact）**: サイドバー非表示、スワイプでペイン切替
- サブ画面（Z Fold6カバー ≒ 一般スマホ）をベースUIとして設計。ワイド画面は追加機能のみ

---

## Architecture Decisions（変更時は必ず更新）

| 判断 | 理由 | 影響範囲 |
|------|------|----------|
| タブ廃止 → ShellLayout一本化 | ターミナルをプライマリUIとするため | app/index.tsx, ShellLayout.tsx |
| PTYをJNI forkptyに移行 | Termux不要、IPC境界ゼロ | modules/terminal-emulator/ |
| バイナリAPK同梱（LibExtractor） | bash/node/git/python等をAPK内に.soとして同梱、初回起動時に展開 | LibExtractor.kt |
| NativeTerminalView = PTY直結 | ユーザー入力はPTY fd直接。terminal-storeは補助（ブロック記録、cwd追跡） | terminal.tsx, terminal-store.ts |
| execCommand = 別fork+exec | runCommandとは別系統。非インタラクティブコマンド用 | use-native-exec.ts |
| shellyコマンド → pseudo-shell | `shelly config/workflow/voice`等はアプリ内処理 | pseudo-shell.ts |
| 設定タブ廃止 → ConfigTUI | 歯車ボタン or `shelly config`。全設定をボトムシートに集約 | ConfigTUI.tsx |
| APIキーはSecureStore | settings-store.updateSettingsが自動ルーティング | secure-store.ts, settings-store.ts |
| AI PaneルーティングはGroq > Gemini > Perplexity > Local | use-ai-pane-dispatch.tsで分岐 | use-ai-pane-dispatch.ts |
| ウェブ認証が正規ルート | APIキーより定額プランのOAuth推奨 | AuthWizard.tsx |
| CLI自動インストール | WelcomeWizardで`npm install -g`を自動実行 | WelcomeWizard.tsx |
| Chat UIをchelly/に分離 | OSS公開予定。ランタイム依存なし | chelly/ |
| デバッグログ全箇所 | `[Shelly][Module]`形式、logcat対応 | debug-logger.ts |

---

## 開発ルール

- **言語**: コード内コメント・変数名は英語、UIテキストはi18nキー経由、コミットメッセージは英語
- **状態管理**: 新しい状態はZustand storeに追加。React stateはコンポーネントローカルのみ
- **テーマ**: ハードコードの色は使わない。`useTheme()`の`colors`オブジェクトを使用
- **アニメーション**: `useReducedMotion()`を尊重。`SPRING_CONFIGS`/`TIMING_CONFIGS`を使用
- **i18n**: 新しいUI文字列は`en.ts`と`ja.ts`の両方にキーを追加
- **安全性**: `lib/command-safety.ts`のパターンを更新する場合はCRITICALレベルのテストを実施

---

## ビルド & デプロイ

```bash
# ローカル開発（Web）
pnpm start --web

# APKビルド（GitHub Actions）
git add . && git commit -m "description" && git push
# → .github/workflows/build-android.yml が自動実行
# → gh run list で確認、gh run download でAPK取得

# EAS Build（代替）
npx eas build --platform android --profile preview
```

**GitHub**: https://github.com/RYOITABASHI/Shelly
**EAS Project ID**: `e0d124cb-e18f-46c4-aca2-e19e48ba04fc`

---

## Termux環境の注意事項

Claude Codeの`cli.js`が`/tmp/claude`をハードコードしているため、Termuxでは以下が必要：

```bash
sed -i "s|/tmp/claude|/data/data/com.termux/files/usr/tmp/claude|g" \
  /data/data/com.termux/files/usr/lib/node_modules/@anthropic-ai/claude-code/cli.js
mkdir -p /data/data/com.termux/files/usr/tmp/claude
```

Claude Codeアップデート時に再度実行が必要。v2.1.5以降は `export CLAUDE_CODE_TMPDIR="$HOME/.claude-tmp"` でも対応可。
