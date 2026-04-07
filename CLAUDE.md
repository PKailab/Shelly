# Shelly — CLAUDE.md

このファイルはClaude Codeがプロジェクトを理解するためのコンテキストです。
Shelly上のTermuxからClaude Codeを起動した際にも自動で読み込まれます。

---

## プロジェクト概要

**Shelly** はAI搭載のAndroidターミナルIDE。Samsung Galaxy Z Fold6上で、Termux + Claude Codeを使って開発されている。

- **技術スタック**: Expo 54 / React Native 0.81 / TypeScript (strict)
- **UI**: NativeWind (TailwindCSS 3)
- **状態管理**: Zustand
- **API**: tRPC + TanStack React Query
- **パッケージマネージャ**: pnpm 9.12
- **ナビゲーション**: expo-router v6（ファイルベース）
- **アニメーション**: React Native Reanimated v4
- **i18n**: expo-localization + Zustand（日英対応）
- **PTY**: JNI forkpty（`modules/terminal-emulator/` — Kotlin + C）。TCP/Termux bridge廃止済み

---

## レイアウト構成（Superset UI v6）

タブ構成は廃止。`app/index.tsx` が `ShellLayout` を直接レンダリングする。

```
ShellLayout
├── AgentBar       (上部) — エージェント状態・通知・グローバルアクション
├── Sidebar        (左)   — Tasks / Repos / Files / Device / Ports / Profiles
├── PaneContainer  (中央) — ターミナル/AI/ブラウザ/Markdownのペイン群
└── ContextBar     (下部) — 入力・補完・ショートカット
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
│   ├── shell/
│   │   ├── ShellLayout.tsx         # 全体レイアウト（AgentBar+Sidebar+Pane+ContextBar）
│   │   ├── AgentBar.tsx            # 上部バー
│   │   ├── Sidebar.tsx             # 左サイドバー
│   │   ├── ContextBar.tsx          # 下部入力エリア
│   │   └── PaneContainer.tsx       # ペイン管理コンテナ
│   ├── panes/
│   │   ├── TerminalPane.tsx        # TTYターミナルペイン
│   │   ├── AiPane.tsx              # AIチャット+ストリーミング+インラインdiff
│   │   ├── BrowserPane.tsx         # ブックマーク+バックグラウンドメディア
│   │   └── MarkdownPane.tsx        # Markdownプレビュー
│   ├── terminal/
│   │   ├── ShortcutBar.tsx         # Ctrl/Esc/Tab等ショートカット
│   │   ├── AutocompletePopup.tsx   # Fig-style補完UI
│   │   └── InlineBlock.tsx         # インラインコンテンツブロック
│   ├── config/
│   │   └── ConfigTUI.tsx           # 設定ボトムシート（設定タブ廃止済み）
│   ├── CommandPalette.tsx
│   └── Onboarding.tsx
├── modules/
│   └── terminal-emulator/          # JNI forkpty ネイティブモジュール
│       ├── android/src/            # Kotlin — execCommand(), forkPty()
│       └── src/shelly-exec.c       # fork+exec+pipe実装
├── lib/
│   ├── autocomplete-engine.ts      # Fig-style補完エンジン
│   ├── syntax-highlighter.ts       # 出力シンタックスハイライト
│   ├── workflow-manager.ts         # `shelly workflow` コマンド管理
│   ├── local-llm.ts                # ローカルLLMオーケストレーション
│   ├── groq.ts                     # Groq API (Llama 3.3 70B + Whisper)
│   ├── gemini.ts                   # Gemini API
│   ├── perplexity.ts               # Perplexity API
│   ├── pro.ts                      # Pro/Freeフラグ
│   ├── secure-store.ts             # APIキー暗号化（expo-secure-store）
│   ├── project-context.ts          # プロジェクトコンテキスト自動生成
│   ├── user-profile.ts             # ユーザープロファイル自動学習
│   ├── command-safety.ts           # コマンド安全チェック（5段階）
│   ├── theme-engine.ts             # テーマエンジン（30種）
│   ├── sounds.ts                   # サウンドプロファイル
│   └── i18n/
│       ├── index.ts
│       └── locales/
│           ├── en.ts
│           └── ja.ts
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
│   ├── use-device-layout.ts   # レスポンシブ（compact/standard/wide）
│   ├── use-native-exec.ts     # execCommand() — JNI経由コマンド実行
│   ├── use-pane.ts            # ペイン状態
│   ├── use-theme.ts
│   ├── use-motion.ts
│   └── use-speech-input.ts
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
| PTYをJNI forkptyに移行 | TCP/Termux bridge依存ゼロ、IPC境界なし | modules/terminal-emulator/, use-native-exec.ts |
| 設定タブ廃止 → ConfigTUI（ギアボタン） | 設定は使用頻度が低い。UIを単純化 | ConfigTUI.tsx, settings-store.ts |
| Chat UIをchelly/に分離 | ターミナル特化とチャットUIを疎結合化、OSSで公開予定 | chelly/ |
| APIキーはSecureStore暗号化保存 | AsyncStorageに平文保存しない | secure-store.ts |
| APIキーはヘッダーで送信（URLパラメータ禁止） | ログ/キャッシュへの漏洩防止 | gemini.ts, groq.ts |
| localLlmModel はファイル名ベース | llama-server APIのmodel名と一致させるため | terminal-store.ts |
| 推奨モデル = Gemma 3 4B Q4_K_M | 3-4B日本語最強、Z Fold6 RAM 12GBで余裕 | local-llm.ts |
| Pro/Free = ビルドタイムフラグ（SHELLY_PRO env） | ソース全公開、フラグで制御 | pro.ts, app.config.ts |
| Pro機能: API統合, Local LLM, AI Pane, Workflow | CLIベースの基本機能は無料 | pro.ts |
| Groq = デフォルトAIプロバイダ | 1,000回/日無料、爆速、日本語○ | groq.ts |
| チャットルーティング: Groq > Local LLM > Gemini | 速度順フォールバック | ai-pane-store.ts |
| GitHub連携: PAT認証 + push + CI提案 | Phase 1-5実装済み | lib/github-*.ts |

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
