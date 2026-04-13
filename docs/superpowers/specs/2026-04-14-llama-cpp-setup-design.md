# llama.cpp UI Wiring — Design (v3)

**日付**: 2026-04-14
**親 spec**: `docs/superpowers/specs/2026-04-14-coming-soon-design.md` 機能 5
**ステータス**: 設計

---

## v1 → v2 → v3 の変更

### v1 → v2
- `lib/llamacpp-setup.ts` が既に 386 行で存在することを認識、UI + state store だけ新規に
- `$HOME` / `unzip` pre-flight チェックを明記
- PID ファイル方式への移行を宣言

### v2 → v3 (この版)
- **`buildDaemonStartScript` / `buildStartAllScript` は既に PID ファイル (`echo $! > "${pidFile}"`) を書いている** — v2 の `buildServerStartCommandWithPid` 新規追加は不要、既存関数を再利用する
- **パスは `$HOME/models/`** (既存 `MODELS_DIR` 定数) を採用、v2 の `~/.shelly/llama/` は廃止
- `--log-disable` は既存 `buildServerStartCommand` (L222) に存在、削除 edit が `buildRecommendedStartCommand` → `buildDaemonStartScript` → `buildStartAllScript` に cascade することを明示
- `buildStartAllScript` は既に `curl /health` のヘルスチェックループを含む — v2 の JS 側 polling は冗長、既存スクリプト内の health check に一任する
- polling / health-check タイムアウトを 20s → 60s に延長 (Snapdragon 8 Gen3 の 1.6GB Q4 mmap warmup は 15-40s)

---

## ゴール

ユーザーが Settings → Local LLM セクションを開いて数タップで:
1. llama-server バイナリ + 選んだモデルを `execCommand` 経由で DL
2. llama-server を backgrounding 起動
3. AI pane で `@local` 経路が動く

既存 `lib/llamacpp-setup.ts` の関数をそのまま叩く UI + 状態 store を追加するだけ。

---

## 非ゴール

- APK にバイナリ同梱
- GPU / Vulkan バックエンド選択
- モデル 3 個以上
- 量子化方式選択 (Q4_K_M 固定)
- 複数モデル同時起動

---

## 既存コードの棚卸し

`lib/llamacpp-setup.ts` から使える関数:

```ts
// 型
interface LlamaCppModel { id, name, sizeGB, ramGB, downloadUrl, filename, ... }
interface LlamaCppServerConfig { ... }
type SetupPhase = 'idle' | 'downloading' | 'installed' | 'running' | 'error'

// データ
const MODEL_CATALOG: LlamaCppModel[]  // 既定モデル一覧 (Gemma / Qwen etc)

// コマンド生成
buildDownloadCommand(model) → string  // wget コマンド
buildServerStartCommand(config) → string
buildRecommendedStartCommand(model) → string
buildDaemonStartScript(model) → string  // nohup + disown
buildStopCommand() → string  // pkill -f llama-server
buildStatusCommand() → string
buildDeleteModelCommand(model) → string
buildListModelsCommand() → string

// 情報
getModelById(id)
getRecommendedModel()
getLlamaCppLocalLlmConfig(model) → LocalLlmConfig
checkRamRequirement(model) → { ok, warning? }
buildSetupSteps() → LlamaCppSetupStep[]
estimateTotalSetupTime(steps) → seconds
```

つまり **lib 層は 90% 完成済み**。mini-spec の実装作業は次のように縮小する:

1. `store/llama-setup-store.ts` (新規) — UI 状態機
2. `components/settings/LocalLlmSection.tsx` (新規) — UI
3. `components/layout/SettingsDropdown.tsx` (編集) — Local LLM row 追加
4. `lib/llamacpp-setup.ts` (編集) — PID 管理とログ出力の整合性を取る 1-2 関数追加

---

## 実装前に検証するコマンド

着手時に**必ずこれを実行して Plan B ランタイムを確認**:

```bash
# 1. $HOME が何を指すか
execCommand("echo HOME=$HOME")

# 2. unzip があるか
execCommand("which unzip || busybox --list-applets 2>/dev/null | grep unzip")

# 3. tar / gzip のフォールバック可能性
execCommand("which tar gzip")

# 4. 書き込みテスト
execCommand("mkdir -p ~/.shelly/llama/test && touch ~/.shelly/llama/test/probe && rm -rf ~/.shelly/llama/test && echo OK")
```

### 期待される結果に応じた分岐

| 結果 | 対応 |
|---|---|
| `$HOME = /data/data/com.termux/files/home` | 既存 `llamacpp-setup.ts` の相対パス `~/.shelly/` がそのまま使える |
| `$HOME = /data/user/0/dev.shelly.terminal/files` (またはそれ以外) | install path を `~/.shelly/` ではなく `$HOME/shelly-llama/` に変更、`llamacpp-setup.ts` の関数群を呼ぶ前に env で置き換え |
| `$HOME` が空 | `FileSystem.documentDirectory` (React Native Expo) を取って JS から `execCommand` に渡す、環境依存を回避 |
| `unzip` 無し、`tar` あり | llama.cpp リリースは zip のみなので、`busybox unzip` を試す、ダメなら**機能 5 自体をスキップ** して handoff に "runtime blocker" と記録 |
| 書き込みテスト失敗 | Plan B の SELinux ポリシーに問題あり、**機能 5 を中断** |

v1 spec と違い、この mini-spec は **"まず確認してから分岐する"** ことを明文化する。実装は確認結果次第。

---

## 状態機

```ts
// store/llama-setup-store.ts
type InstallStage =
  | 'not-installed'
  | 'downloading-binary'
  | 'downloading-model'
  | 'installed'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'error';

type LlamaSetupState = {
  stage: InstallStage;
  binaryVersion: string | null;   // 'b4562'
  selectedModelId: string | null; // 'gemma-2-2b-it'
  errorMessage: string | null;

  setStage: (s: InstallStage) => void;
  setBinaryVersion: (v: string | null) => void;
  setSelectedModelId: (id: string | null) => void;
  setError: (e: string | null) => void;
};
```

persist: AsyncStorage (テキストのみ)。

---

## 起動と readiness 判定

### v3 方針: `buildStartAllScript` の既存 health-check ループに任せる

v2 は JS 側で 20 秒 polling を書いていたが、**既存 `buildStartAllScript` (L337 付近) には `curl /health` のヘルスチェックループが既に組み込まれている**。JS 側の polling と重複するので削除し、以下のフローに統一:

1. UI の `[Start]` tap → `buildStartAllScript(model)` を `execCommand` に送信 (this is a long-running call — blocks until the script exits)
2. スクリプト内部で llama-server を nohup 起動 → PID ファイル書き込み → `curl http://127.0.0.1:8080/health` を 60 秒まで retry
3. スクリプトが exit 0 なら `setStage('running')`、exit != 0 なら `setStage('error')` + errorMessage に `tail -n 20 $HOME/logs/llama-server.log`
4. UI 側は `execCommand` の結果を await するだけ、独自の `setInterval` 不要

### 実装上の注意

- `execCommand` のタイムアウトは **最大 90 秒** に設定 (スクリプト内部の 60 秒 health check + buffer)
- UI は "Starting..." スピナー表示を出したまま blocking await
- ユーザーが Cancel したい場合は `execCommand` を abort する経路が必要 (`pkill -f curl && kill $(cat $HOME/models/llama-server.pid)` を別コマンドで送る)

### `buildStartAllScript` の readiness timeout 調整

既存のスクリプトの retry 回数が 20 秒相当 (1秒 × 20回) の場合、**60 秒 (1秒 × 60回)** に延長する。理由: Snapdragon 8 Gen3 での 1.6 GB Gemma-2-2B Q4_K_M cold start (mmap + warmup) は 15-40 秒、Qwen2.5-1.5B でも 10-25 秒かかる。20 秒タイムアウトは楽観的すぎる。

実装時に `buildStartAllScript` の中身を Read して該当する retry/sleep 定数を特定 → 60 秒相当に書き換え。

---

## PID ファイル方式

**v3 の更新**: 既存 `buildDaemonStartScript` と `buildStartAllScript` は既に `echo $! > "${pidFile}"` パターンで PID を保存している (確認済)。新規関数追加は不要。

ただし `buildStopCommand` (L269) が `pkill -f llama-server` を使っている可能性がある — 実装時に Read して確認し、`pkill -f` なら以下に差し替える 1 行 edit:

```bash
# 差し替え後
if [ -f "$HOME/models/llama-server.pid" ]; then
  kill $(cat "$HOME/models/llama-server.pid") 2>/dev/null || true
  sleep 3
  kill -9 $(cat "$HOME/models/llama-server.pid") 2>/dev/null || true
  rm -f "$HOME/models/llama-server.pid"
fi
```

既に PID ファイル方式なら edit 不要。

---

## `--log-disable` 矛盾の解消

既存 `buildServerStartCommand` が `--log-disable` を付けていたらエラーログが取れない。**外す**。`> server.log 2>&1` で冗長ログを捕捉。

実装時にまず `grep "log-disable" lib/llamacpp-setup.ts` で確認、付いてたら削除または flag 化。

---

## モデル取得

既存 `MODEL_CATALOG` をそのまま使う。v1 で書いた HF URL は既に `llamacpp-setup.ts` 側で定義されている想定。**実装時に `MODEL_CATALOG` の `downloadUrl` を Read してバリデーションする** (HF の URL 変更がないか curl --head で 1 回だけ検証)。

ユーザーに見せるのは **RAM 要件が通る** モデルだけ:

```ts
const availableModels = MODEL_CATALOG.filter(m => checkRamRequirement(m).ok);
```

`checkRamRequirement` は既存。

---

## UI (LocalLlmSection.tsx)

### ステージごとの表示

#### not-installed
```
┌─ Local LLM ─────────────────────┐
│ Status: Not installed           │
│                                 │
│ Select a model:                 │
│ ○ Gemma-2-2B-IT (~1.6 GB)       │
│ ○ Qwen2.5-1.5B-Instruct (~1.1)  │
│                                 │
│ [ Install ]                      │
└─────────────────────────────────┘
```
モデル未選択時は Install disabled。

#### downloading-binary / downloading-model
```
│ Status: Downloading...           │
│ (binary / model)                 │
│ this may take 1-3 min            │
│ [ Cancel ]                       │
```
進捗バーなし (execCommand は synchronous return)。Cancel は `pkill wget` で対応。

#### installed
```
│ Status: Installed (b4562)        │
│ Model: gemma-2-2b-it-Q4_K_M      │
│                                  │
│ [ Start server ]                 │
│ [ Re-install ]                   │
│ [ Change model ]                 │
```

#### starting
```
│ Status: Starting...              │
│ Waiting for :8080 (max 20s)      │
```

#### running
```
│ Status: Running on :8080         │
│ Model: gemma-2-2b-it-Q4_K_M      │
│                                  │
│ Use @local in AI pane to chat.   │
│                                  │
│ [ Stop server ]                  │
│ [ View log ]                     │
```

#### error
```
│ Status: Error                    │
│ <errorMessage>                   │
│                                  │
│ [ Retry ]                        │
│ [ View full log ]                │
│ [ Reset ]                        │
```

`View log` は `cat ~/.shelly/llama/server.log | tail -30` を Modal で表示。`Reset` は stage を `installed` に戻す。

---

## エラーハンドリング

| ケース | 対応 |
|---|---|
| ネット未接続 | wget exit code != 0 → "No network. Connect and retry." |
| GitHub API rate limit | JSON に `"message": "API rate limit"` → fallback URL へ |
| zip 破損 | `unzip -q` exit != 0 → "Download corrupted, retry" |
| モデル DL 失敗 | バイナリ保持、モデル選択に戻す |
| 起動後 20 秒 :8080 無し | `tail -n 20 server.log` を errorMessage に入れる |
| ポート競合 | `ss -tlnp \| grep :8080` で他プロセスを検出、起動前に警告 |
| OOM kill | server.log に "killed" → "Out of memory — try Qwen (smaller model)" |
| crash (SIGSEGV) | server.log 末尾を error message に、Retry ボタン |

---

## ファイル

- `store/llama-setup-store.ts` (新規, ~80 行)
- `components/settings/LocalLlmSection.tsx` (新規, ~250 行)
- `components/layout/SettingsDropdown.tsx` (編集 — Local LLM row 追加 ~10 行)
- `lib/llamacpp-setup.ts` (編集 — `--log-disable` 削除 1 行、`buildStartAllScript` の readiness retry を 60 秒に延長、`buildStopCommand` が PID 方式でなければ差し替え)

---

## セキュリティ

- バイナリは GitHub Releases からのみ (他 mirror 禁止)
- SHA256 検証は **v1 ではやらない**。GitHub の `.assets[].digest` から取るのが望ましいが実装コストで見送り。README に「GitHub 公式 Releases のみから取得」と明記
- llama-server は `--host 127.0.0.1` 明示 (ループバック only)
- モデルファイルの HF URL は HTTPS 固定

---

## 検証チェックリスト

- [ ] クリーンインストールから Gemma / Qwen どちらでも設置できる
- [ ] インストール後、再起動しても Installed 状態が維持される
- [ ] Start → 20 秒以内に Running 表示
- [ ] AI pane で `@local こんにちは` に応答
- [ ] Stop → Ports list から :8080 が消える
- [ ] Re-install → バイナリ/モデル両方上書き
- [ ] Change model → バイナリはそのまま、モデルだけ切替
- [ ] ネット未接続で Install → エラー表示
- [ ] 起動中に Re-install ボタン disabled
- [ ] `server.pid` で止まる (grep/tail を同時に走らせても誤爆しない)
