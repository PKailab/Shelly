# llama.cpp UI Wiring — Design (v2)

**日付**: 2026-04-14
**親 spec**: `docs/superpowers/specs/2026-04-14-coming-soon-design.md` 機能 5
**ステータス**: 設計

---

## v1 からの変更

- **`lib/llamacpp-setup.ts` は既に 386 行で存在**。v1 は "新規 `lib/llama-setup.ts`" と書いていたが誤り。lib 層はほぼ既存利用、**UI とランタイム状態 store だけ**新規で足す
- `$HOME` パスの扱い、`unzip` 有無、`--log-disable` 矛盾、`pkill -f` 誤爆を **実装前検証ステップ** として明記
- llama-server PID 管理を PID ファイル方式に

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

## Ports monitor 連携

現状 `store/ports-store.ts` は Sidebar が mount されたときにポーラーを起動する設計 (Sidebar.tsx 側の useEffect)。

**問題**: Settings Modal を全画面表示すると Sidebar が unmount → ポーラー停止 → `:8080` 検出が止まる。

**対応**: Settings 画面で llama-server 起動するとき、`llama-setup-store.stage === 'starting'` の間だけ **LocalLlmSection 側でも独立した poller を起動** する。最大 20 秒の polling、見つかれば `setStage('running')`、タイムアウトで `setStage('error')`。

```ts
// LocalLlmSection 内の useEffect
useEffect(() => {
  if (stage !== 'starting') return;
  let attempts = 0;
  const iv = setInterval(async () => {
    attempts++;
    const r = await execCommand('ss -tlnp 2>/dev/null | grep :8080', 3_000);
    if (r.stdout.includes(':8080')) {
      setStage('running');
      clearInterval(iv);
    } else if (attempts >= 20) {
      setError('llama-server failed to start. Check server.log');
      setStage('error');
      clearInterval(iv);
    }
  }, 1_000);
  return () => clearInterval(iv);
}, [stage]);
```

---

## PID ファイル方式

v1 の `pkill -f llama-server` は誤爆リスク (grep/tail/journalctl が llama-server を含むと kill される)。

**修正**: 起動コマンドを以下に変更:

```bash
nohup ~/.shelly/llama/llama-server \
  -m ~/.shelly/llama/models/<selected>.gguf \
  --port 8080 \
  --host 127.0.0.1 \
  -c 4096 \
  > ~/.shelly/llama/server.log 2>&1 &
echo $! > ~/.shelly/llama/server.pid
disown
```

停止は:
```bash
if [ -f ~/.shelly/llama/server.pid ]; then
  kill $(cat ~/.shelly/llama/server.pid) 2>/dev/null
  sleep 3
  kill -9 $(cat ~/.shelly/llama/server.pid) 2>/dev/null || true
  rm -f ~/.shelly/llama/server.pid
fi
```

`lib/llamacpp-setup.ts` に `buildServerStartCommandWithPid(model)` と `buildStopCommandPidBased()` を**追加**する (既存の `buildServerStartCommand` と `buildStopCommand` はそのまま残す、旧挙動の呼び出し元互換のため)。

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
- `components/settings/LocalLlmSection.tsx` (新規, ~300 行)
- `components/layout/SettingsDropdown.tsx` (編集 — Local LLM row 追加 ~10 行)
- `lib/llamacpp-setup.ts` (編集 — `buildServerStartCommandWithPid` + `buildStopCommandPidBased` 追加、`--log-disable` 削除)

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
