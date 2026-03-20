# SetupWizard & ブリッジ接続の根本修正 — 設計書

Date: 2026-03-21

## 問題の要約

SetupWizardは `runTermuxCommand()`（RUN_COMMAND Intent）で全操作をfire-and-forgetで実行するが、コマンドの完了も出力も受け取れない。固定秒数のsleepで「たぶん終わったはず」と仮定しているため、以下の状況で確実に失敗する：

1. **完全ゼロ状態の初回起動**: `pkg install`に数分かかるのに5秒しか待たない。`ws`パッケージ未インストール。
2. **Termux強制停止後**: bridgeサーバーが死に、再接続5回で諦めてユーザー放置。
3. **端末再起動後**: boot scriptが正しく設置されていなければ復帰手段なし。

## 対象ペルソナ

- **Persona A（完全初心者）**: Termuxもコマンドも知らない。ウィザードに従えば迷わず完了できること。
- **Persona B（エンジニア）**: ウィザードは邪魔にならず、Terminalタブで直接CLI操作。ブリッジ切断時は自分で復旧できる導線。

## 設計原則

1. **fire-and-forgetでの祈りを排除する** — 全コマンドは結果を確認してから次へ進む
2. **初回だけTermuxを開かせる** — 1コマンドのコピペで済ませる。以降はTermux不要
3. **壊れたら気づける・直せる** — 全タブで接続状態を可視化し、復旧導線を提示
4. **Persona Bの邪魔をしない** — バナーはdismiss可能。ウィザードはスキップ可能

---

## アーキテクチャ変更概要

### 現在
```
SetupWizard → runTermuxCommand() [fire-and-forget] → sleep → 祈る → 失敗
```

### 新設計
```
SetupWizard
  Phase 1: ユーザーがTermuxで1コマンド実行（Node.js + ws + bridge起動）
           → Shellyが接続成功を自動検知
  Phase 2: bridge WebSocket経由で全残作業を実行（結果確認付き）
           → boot script / ttyd / CLI検出 / LLM検出
```

---

## SetupWizard ステップ構成（新設計）

### Step 1: Welcome（変更なし）
機能紹介のスライド。「はじめる」ボタン。

### Step 2: アプリインストール
- **Termux** — 必須。F-Droidボタン。
- **Termux:Boot** — 推奨（端末再起動後の自動復帰用）。F-Droidボタン。
- **Termux:Tasker** — 削除。新設計ではRUN_COMMAND Intent不要。

変更点:
- Termux:Taskerを一覧から削除
- `isPackageInstalled`チェックは残す（Termux, Boot の2つ）
- 「Termuxをインストールした後、一度Termuxを開いて初期セットアップを完了してください」の注記追加
  - Termuxは初回起動時にbootstrapパッケージのインストール（1-2分）が必要
  - これをやらないとStep 3のコマンドが動かない

### Step 3: Termux初期化（★新規 — 2フェーズの核心）

**UI構成:**
```
┌─────────────────────────────────────┐
│  [Terminal icon]                    │
│                                     │
│  Termuxでコマンドを実行              │
│  以下のコマンドをTermuxに             │
│  貼り付けてください                   │
│                                     │
│  ┌─────────────────────────────┐    │
│  │ pkg install -y nodejs...    │ 📋 │
│  └─────────────────────────────┘    │
│                                     │
│  [Termuxを開く]  ← openTermux()    │
│                                     │
│  ┌─────────────────────────────┐    │
│  │ ⏳ 接続を待っています...     │    │
│  │    ブリッジが起動したら      │    │
│  │    自動で次に進みます        │    │
│  └─────────────────────────────┘    │
│                                     │
│  [スキップ]                         │
└─────────────────────────────────────┘
```

**コピーされるコマンド:**
```bash
pkg install -y nodejs-lts && mkdir -p ~/shelly-bridge && cd ~/shelly-bridge && npm init -y 2>/dev/null && npm install ws 2>&1 && node server.js
```

注意: `server.js` ファイルはこのコマンド実行前に存在する必要がある。
→ 「Termuxを開く」ボタン押下時に、RUN_COMMANDで`server.js`を書き込む（ファイル書き込みはfire-and-forgetでも問題ない — 一瞬で完了し、失敗してもStep 3のコマンドで`node server.js`がエラーになるだけ）。

**ただし、Termux:Taskerを削除する方針なのでRUN_COMMANDが使えない。**
→ 代替案: コマンド自体にserver.jsの書き込みも含める。ただし数百行のJSをコピーさせるのは非現実的。

**解決策: コマンドを2段構えにする。**

実際のコマンド:
```bash
pkg install -y nodejs-lts && npm install -g shelly-bridge-server 2>/dev/null; mkdir -p ~/shelly-bridge && cd ~/shelly-bridge && npm init -y 2>/dev/null && npm install ws 2>&1 && curl -sL https://raw.githubusercontent.com/RYOITABASHI/Shelly/main/scripts/bridge-server.js -o server.js 2>/dev/null && node server.js
```

**↑これも長すぎる。もっとシンプルにする。**

**最終解決策: セットアップスクリプト1行**
```bash
curl -sL https://raw.githubusercontent.com/RYOITABASHI/Shelly/main/scripts/setup.sh | bash
```

`scripts/setup.sh` の内容（リポジトリに配置）:
```bash
#!/bin/bash
set -e
echo "[Shelly] Setting up..."
pkg install -y nodejs-lts ttyd 2>&1
mkdir -p ~/shelly-bridge
cd ~/shelly-bridge
npm init -y 2>/dev/null
npm install ws 2>&1
# Download bridge server
curl -sL https://raw.githubusercontent.com/RYOITABASHI/Shelly/main/scripts/bridge-server.js -o server.js
# Write boot script
mkdir -p ~/.termux/boot
cat > ~/.termux/boot/start-shelly.sh << 'EOF'
#!/data/data/com.termux/files/usr/bin/sh
sleep 3
ttyd -p 7681 bash &
cd ~/shelly-bridge && node server.js &
EOF
chmod +x ~/.termux/boot/start-shelly.sh
echo "[Shelly] Starting bridge..."
node server.js
```

**↑しかしこれは `curl | bash` パターンで、セキュリティ的にりょうさんのcommand-safety.tsのDANGEROUS_PATTERNSに引っかかる。そしてオフラインでは動かない。**

**最終最終解決策: インラインの短いコマンド + bridge-bundle.tsを活用**

SetupWizard側で:
1. 「コマンドをコピー」ボタンでクリップボードにコマンドをコピー
2. 同時に、RUN_COMMANDで`server.js`の書き込みだけ先に実行（Termux:Taskerなしでも、Termuxが起動中ならRUN_COMMANDは動く — Termux自体がServiceを受け付ける）

**実は、Termux:Taskerが必要なのはTermuxが完全にバックグラウンドの場合のみ。ユーザーがStep 2でTermuxを一度開いて初期セットアップを完了していれば、TermuxはフォアグラウンドまたはService起動済みなので、RUN_COMMANDは到達する。**

→ Termux:Taskerなしでも `com.termux.permission.RUN_COMMAND` が使える（Termux本体にServiceがある）。Termux:Taskerはショートカットや自動化の拡張。

**結論:**

Step 2で「Termuxを開いて初期セットアップを完了してください」と指示 → ユーザーがTermuxを一度開く → Termuxのbootstrapが完了 → Shellyに戻る。

Step 3で:
1. 「セットアップ開始」ボタン押下
2. RUN_COMMANDで `server.js` 書き込み + `pkg install nodejs-lts` + `ws install` + `bridge起動` を一括送信
3. ただしfire-and-forgetなので、完了は接続テストで確認
4. ws://127.0.0.1:8765 を2秒間隔でポーリング
5. 接続成功 → Phase 2（bridge経由の残作業）へ

**しかし前述の通り、`pkg install nodejs-lts` が未完了のまま `npm install ws` や `node server.js` に進むとエラーになる。fire-and-forgetでは順序実行を保証できない。**

**→ シェルスクリプトとして `&&` チェインで送れば、シェル自体が順序保証する。RUN_COMMANDは1つのシェルセッションで実行される。**

```bash
pkg install -y nodejs-lts ttyd && mkdir -p ~/shelly-bridge && cd ~/shelly-bridge && npm init -y 2>/dev/null && npm install ws && node server.js
```

これを `runTermuxCommand()` で送る。`&&` チェインなのでpkg installが完了するまで次に進まない。fire-and-forgetだが、最終的に `node server.js` が実行されればbridgeが起動し、ShellyのWebSocketポーリングが成功する。

**ただし server.js がまだ存在しない！**

→ server.jsの書き込みもコマンドに含める:
```bash
pkg install -y nodejs-lts ttyd && mkdir -p ~/shelly-bridge && cd ~/shelly-bridge && npm init -y 2>/dev/null && npm install ws && cat << 'SHELLY_EOF' > server.js
[server.js content here]
SHELLY_EOF
node server.js
```

RUN_COMMANDは文字列長に制限がある可能性あるが、server.jsは約15KB程度なのでIntent extras制限（通常1MB）内に収まる。現在のauto-setup.tsでも同じ方式で書き込んでいるので実績あり。

---

### 最終設計: Step 3（確定版）

**Termux:Tasker不要。RUN_COMMANDはTermux本体のRunCommandServiceで動く。**

1. ユーザーがStep 2でTermuxを一度開きbootstrapを完了（ここがユーザーの唯一の手動操作）
2. Step 3の「セットアップ開始」ボタン押下時:
   - `runTermuxCommand()` で以下の一括コマンドを送信:
     ```
     pkg install -y nodejs-lts ttyd &&
     mkdir -p ~/shelly-bridge && cd ~/shelly-bridge &&
     npm init -y 2>/dev/null && npm install ws &&
     cat << 'SHELLY_EOF' > server.js
     [BRIDGE_SERVER_JS from bridge-bundle.ts]
     SHELLY_EOF
     node server.js
     ```
   - これはfire-and-forgetだが、`&&`チェインで全ステップが順序実行される
   - 最後の `node server.js` が成功すればbridgeが起動する
3. ShellyはStep 3画面で `ws://127.0.0.1:8765` をポーリング（2秒間隔）
4. 接続成功 → 自動でStep 4へ

**タイムアウト:** 5分（`pkg install`が遅いデバイス対応）。タイムアウト後は「Termuxでコマンドを直接実行してください」にフォールバック（コピーボタン付き）。

**Persona B対応:** RUN_COMMANDが使えない場合（パーミッション拒否等）、コマンドをコピーしてTermuxに貼り付けるフォールバック画面を即座に表示。

---

### Step 4: 自動セットアップ（bridge経由 — 結果確認付き）

bridgeのWebSocketが繋がっている状態。`use-termux-bridge.ts` の `runRawCommand()` を使って全コマンドを実行し、exit codeと出力を確認する。

実行内容:
1. **boot script設置**: `~/.termux/boot/start-shelly.sh` を書き込み（`writeFile` API経由）
2. **ttyd起動確認**: `pgrep ttyd || ttyd -p 7681 bash &` → exitCode確認
3. **CLI検出**: `which claude 2>/dev/null && echo CC:1 || echo CC:0; which gemini 2>/dev/null && echo GC:1 || echo GC:0; which codex 2>/dev/null && echo CX:1 || echo CX:0` → stdout解析
4. **LLM検出**: port 8080/11434 への接続テスト（既存の`checkOllamaConnection`）

各ステップの成否をUIに反映（チェックマーク / 警告 / エラー）。

### Step 5: 完了
- bridge接続: ✅（Step 3で確認済み）
- TTY接続: ✅ or ⚠（ttydの有無）
- CLI: 検出結果表示 + 未検出時はGemini CLIインストールボタン
- LLM: 検出結果表示
- boot script: ✅（Step 4で設置済み）
- 「始める」ボタン

---

## ブリッジ切断時の復帰UI（全タブ共通）

### BridgeRecoveryBanner コンポーネント（★新規）

**表示条件:**
- `connectionMode === 'termux'` かつ `bridgeStatus === 'error' || bridgeStatus === 'disconnected'`
- かつ再接続リトライが上限（5回）に達した後

**UI:**
```
┌──────────────────────────────────────────┐
│ ⚠ Termuxブリッジが切断されています        │
│                                          │
│ [Termuxで再起動]  [再接続]  [×]          │
└──────────────────────────────────────────┘
```

**挙動:**
- 「Termuxで再起動」: Termuxを開く + 復帰コマンドをクリップボードにコピー
  ```bash
  cd ~/shelly-bridge && node server.js
  ```
  短いコマンドなのでコピペの負担は最小限。
- 「再接続」: `reconnectAttemptsRef`をリセットして再試行
- 「×」(dismiss): バナーを閉じる（Persona B向け — 自分で対処する人は邪魔にならないように）

**表示場所:** Chat / Terminal / Projects の各タブの上部。`_layout.tsx` レベルで条件表示。

### ChatHeader の接続ドット改善

現在: 緑/グレーのドットのみ。
改善: ドットをタップすると接続状態の詳細ポップアップ表示（Persona B向け）。
- 「接続中」「切断」「エラー: xxx」のテキスト
- bridge URLの確認
- 「Termuxで再起動」のクイックアクション

---

## Gemini CLI インストール修正

### パッケージ名修正
`@anthropic-ai/gemini-cli` → `@google/gemini-cli`

### インストール方式変更
fire-and-forget → bridge経由の `runRawCommand()` に変更。
```typescript
const result = await runRawCommand(
  'npm install -g @google/gemini-cli 2>&1',
  { timeoutMs: 120_000, onStream: (type, data) => setInstallLog(prev => prev + data) }
);
if (result.exitCode === 0) {
  setGeminiInstalled(true);
}
```

---

## AndroidManifest.xml / app.config.ts 修正

### AndroidManifest.xml（modules/termux-bridge/android/src/main/）
```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <uses-permission android:name="com.termux.permission.RUN_COMMAND" />
</manifest>
```

### app.config.ts
```typescript
android: {
  permissions: ["POST_NOTIFICATIONS"],
  // Termuxパッケージの可視性（isPackageInstalled用）
  queries: {
    packages: ["com.termux", "com.termux.boot"],
  },
}
```

注: Android 11以降はqueries宣言がないと`getPackageInfo()`が失敗する。

---

## use-ttyd-connection.ts の修正

現在: `runTermuxCommand()`（fire-and-forget）でttydを起動。
変更: bridge接続中なら `runRawCommand()` 経由で起動し結果確認。bridge未接続時のみfallbackとしてRUN_COMMANDを使用。

---

## Termux再起動後のシナリオ

### Termux:Boot インストール済み
1. 端末起動 → Termux:Bootが`~/.termux/boot/start-shelly.sh`を実行
2. ttyd + bridge server が自動起動
3. Shelly起動 → WebSocket接続成功 → 正常動作

### Termux:Boot 未インストール
1. 端末起動 → Termux未起動 → bridge未起動
2. Shelly起動 → WebSocket接続失敗 → 再接続5回失敗
3. BridgeRecoveryBanner表示:
   - 「Termuxで再起動」→ Termux開く + `cd ~/shelly-bridge && node server.js` コピー
   - ユーザーがTermuxでコマンド実行 → bridge起動 → Shelly自動再接続

### Termux強制停止
- シナリオは「Termux:Boot未インストール」と同一フロー
- BridgeRecoveryBannerが復帰を案内

---

## ファイル変更一覧

| ファイル | 変更内容 |
|---------|---------|
| `lib/auto-setup.ts` | Phase 1/2分離。Phase 1はRUN_COMMANDで一括送信、Phase 2はbridge経由 |
| `components/SetupWizard.tsx` | Step構成変更（3→5ステップ）。Termux初期化画面追加。Gemini CLIパッケージ名修正 |
| `components/BridgeRecoveryBanner.tsx` | ★新規。切断時の復帰案内UI |
| `app/(tabs)/_layout.tsx` | BridgeRecoveryBannerの条件表示追加 |
| `hooks/use-termux-bridge.ts` | 再接続上限到達を外部から検知可能にする（state追加） |
| `hooks/use-ttyd-connection.ts` | bridge経由のttyd起動に変更 |
| `modules/termux-bridge/android/src/main/AndroidManifest.xml` | パーミッション追加 |
| `app.config.ts` | queries追加（Android 11+対応） |
| `lib/i18n/locales/en.ts` | 新規キー追加 |
| `lib/i18n/locales/ja.ts` | 新規キー追加 |
| `scripts/bridge-server.js` | ★新規（bridge-bundle.tsから抽出、セットアップスクリプトからcurl用…は不採用。不要） |

---

## 影響範囲の確認

- **既存の `runTermuxCommand()` 呼び出し元**: auto-setup.ts, SetupWizard.tsx, use-ttyd-connection.ts — 全て修正対象
- **bridge-bundle.ts**: 変更なし（server.jsの中身はそのまま）
- **store/terminal-store.ts**: 変更なし（wsUrl/ttyUrlのデフォルト値はそのまま）
- **use-termux-bridge.ts**: 再接続失敗の検知用に `reconnectExhausted` state追加のみ

---

## りょうさんの日常利用への影響

- **Bundle ID・EAS ID**: 変更なし
- **デフォルト値・動作ロジック**: wsUrl/ttyUrl/connectionModeは変更なし
- **既にセットアップ済みの環境**: SetupWizardは`AsyncStorage`のフラグで非表示。boot scriptが上書きされるが内容は同等
- **設定画面からの再セットアップ**: 新フローが適用される（改善のみ）
