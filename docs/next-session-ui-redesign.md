# UI/UXをモックに忠実にリデザインする

## やること

ShellyのUI/UXを、デザインモックに忠実に合わせる。
機能は実装済み。見た目・レイアウト・情報密度が大幅に乖離しているので、ビジュアルを修正する。

## 最重要: モックのスクショを先に全部見ろ

**`docs/images/mock-*.jpg`を必ず最初にReadツールで全5枚開いて確認しろ。** これがターゲットデザインだ。全作業はこれらのスクショに合わせることが目的。

## 参照ファイル（必ず全部読め）

1. **モック画像（5枚、全部見ろ）**:
   - `docs/images/mock-1-full-layout.jpg` — **1+2 Split**: 上段(Claude Code + AI Chat) + 下段(Browser + Terminal 2)
   - `docs/images/mock-2.jpg` — **2 Col**: Claude Code左 + AI Chat右
   - `docs/images/mock-3.jpg` — **2 Row**: Claude Code上 + AI Chat下（縦分割）
   - `docs/images/mock-4.jpg` — **Single**: Claude Codeフルスクリーン
   - `docs/images/mock-5.jpg` — **4 Terminal**: 4ペイン（Claude Code + Terminal 2 + Terminal 3 + Terminal 2）npm test/docker ps/ls -la表示
2. `docs/superpowers/specs/2026-04-07-superset-ui-redesign.md` — 718行のデザインスペック（構成・挙動・色指定）
3. `CLAUDE.md` — アーキテクチャ全体像

## 現状のUIとモックの主な乖離（スクショと比較して確認せよ）

### 1. AgentBar（上部バー）
- **モック**: `● CLAUDE  ● Gemini  ● Codex  ● OpenCode  ● Copilot` — タブ形式でテキスト表示、右端に `CRT:ON  11%  EN/JA`
- **現状**: アイコン4つ + `+  🔍  ⚙` — 情報量が少なすぎる
- **ファイル**: `components/layout/AgentBar.tsx`

### 2. サイドバー（左）
- **モック**: テキストラベル付き展開状態、7セクション全表示
  - TASKS: `NPM RUN DEV (RUNNING)` / `GIT PUSH (25 AGO)` — リアルタイムステータス
  - REPOSITORIES: `SHELLY v9.2` / `NACRE` / `LLM-BENCH-V2` + `+ ADD REPOSITORY`
  - FILE TREE: 検索バー + 完全なツリー（app/, components/, lib/, store/...）
  - DEVICE: `~/` `DCIM` `DOWNLOAD` `DOCUMENTS` `MUSIC`
  - CLOUD: `GOOGLE DRIVE (LINKED)` / `DROPBOX (CONNECT)` / `ONEDRIVE (CONNECT)`
  - PORTS: `:3000 NEXT.JS ●` / `:8081 EXPO ●`
  - PROFILES: `PROD-SERVER` / `STAGING` + `+ ADD PROFILE`
- **現状**: アイコンのみの折りたたみ状態がデフォルト。Cloud未実装、Portsプレースホルダー
- **ファイル**: `components/layout/Sidebar.tsx`, `components/layout/SidebarSection.tsx`, `components/layout/FileTree.tsx`

### 3. メインペイン ヘッダー
- **モック**: `⊙ CLAUDE CODE — ~/Shelly  ⊙42K/1H  💾  👤  ⊞  ✕` — ツール名、パス、トークン数、保存/ユーザー/レイアウト/閉じるアイコン
- **現状**: `⊞ Terminal ▾` + `⊞ ✕` — 情報量不足
- **ファイル**: `components/multi-pane/PaneSlot.tsx`, `components/terminal/TerminalHeader.tsx`

### 4. ターミナル内のコマンド表示
- **モック**: Claude Codeの操作ログがリッチに表示
  - `● READ components/WelcomeWizard.tsx  0.5s 📋` — 色付きアクションバッジ
  - `● EDIT lib/input-router.ts ✏️` — 差分表示（赤/緑）+ `ACCEPT` / `REJECT` ボタン
  - `⚠ BASH: RM -RF NODE_MODULES/  CONFIRM?` — Allow/Denyの確認UI
  - `🔒 AUTO-SAVED · 3 FILES CHANGED  UNDO  VIEW DIFF` — 自動保存バー
  - `💡 TIP: SAY "SHELLY VOICE" FOR HANDS-FREE MODE` — ヒント
- **現状**: プレーンテキスト出力
- **ファイル**: `components/terminal/TerminalBlock.tsx`, `lib/content-block-detector.ts`

### 5. 右ペイン（AIチャット）
- **モック**: `CLAUDE CODE` ヘッダー、`READING TERMINAL 1` ステータス、会話（YOU / CLAUDE）、インラインdiff + `ACCEPT` / `REJECT`、入力欄
- **現状**: AIPane実装済みだがこのレベルのUIではない
- **ファイル**: `components/panes/AIPane.tsx`

### 6. 下段ペイン
- **モック**: 左に `BROWSER`（YouTube + ブックマークタブ）、右に `TERMINAL 2`（ls -la出力 + `~/Shelly (main)` gitプロンプト）
- **現状**: ペイン分割は実装済みだがデフォルトでは1ペインのみ表示
- **ファイル**: `components/panes/BrowserPane.tsx`, `components/multi-pane/MultiPaneContainer.tsx`

### 7. レイアウト切替バー（画面下部）
- **モック**: `[1+2 Split] [2 Col] [2 Row] [Single] [2x2 Grid] [4 Terminal]` — プリセットボタン
  - 選択中のプリセットはアクセント色でハイライト
  - 各プリセットのペイン構成（モック画像参照）:
    - **1+2 Split**: 上段2ペイン(大+中) + 下段2ペイン(中+中)
    - **2 Col**: 左右2カラム均等分割
    - **2 Row**: 上下2段均等分割
    - **Single**: 1ペインフルスクリーン
    - **2x2 Grid**: 4ペイン均等グリッド
    - **4 Terminal**: 4ペイン全部ターミナル
- **現状**: 存在しない
- **ファイル**: 新規作成 `components/multi-pane/LayoutPresetBar.tsx` + `MultiPaneContainer.tsx` に組み込み

### 8. ContextBar（最下部）
- **モック**: 明示的には見えないが、スペックに記載あり
- **現状**: 実装済み
- **ファイル**: `components/layout/ContextBar.tsx`

## 技術的な前提

- **技術スタック**: Expo 54 / React Native 0.81 / TypeScript / NativeWind (TailwindCSS 3)
- **状態管理**: Zustand
- **アニメーション**: React Native Reanimated v4
- **テーマ**: `useTheme()` の `colors` オブジェクトを使用（ハードコード色は使わない）
- **i18n**: `en.ts` / `ja.ts` 両方に追加

## 注意: モックとスペック表の関係

- **モックの方がスペック表より詳細**。レイアウトプリセットバー（1+2 Split / 2 Col / 2 Row / Single / 2x2 Grid / 4 Terminal）はモックにあるがスペック表には記載がない
- **ビジュアルデザイン（余白、色の濃淡、ボーダー、フォントサイズ）はモックが正**。スペック表はロジックと構成の参照
- **迷ったらモックのスクショを見ろ。スペック表はサブ資料**

## 作業方針

1. **モックのスクショを常に参照しながら作業する** — 「このコンポーネントはモックでどう見えているか」を毎回確認
2. **コンポーネント単位で修正** — 1コンポーネントずつ、モックに合わせて見た目を変える
3. **機能は触らない** — ロジック・ストア・フックは変更不要。スタイルとJSXの構造だけ変える
4. **情報密度を上げる** — モックの特徴は「一画面に大量の情報が整理されて表示される」こと
5. **フォント**: モノスペース（JetBrains Mono）、色は`#00D4AA`（アクセント）ベース
6. **ダーク基調**: 背景`#0D0D0D`〜`#1A1A1A`、テキスト`#E5E7EB`、ミュート`#6B7280`

## 優先順（上から順にやれ）

1. AgentBar — タブ形式に変更、CRT/バッテリー/言語インジケータ追加
2. サイドバー — ワイド画面でデフォルト展開、全セクションのデザイン刷新
3. ペインヘッダー — リッチ情報表示（ツール名、トークン数、アクションアイコン）
4. レイアウト切替バー — プリセットボタン新規作成
5. ターミナルブロック — CLI操作のリッチ表示（Read/Edit/Bashバッジ、diff、Allow/Deny）
6. AIペイン — 会話UIのデザイン改善
7. ブラウザペイン — ブックマークタブのデザイン
