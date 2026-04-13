# Shelly Coming Soon — 6 機能統括設計 (v2)

**日付**: 2026-04-14
**ステータス**: 設計完了、実装は別セッションで `writing-plans` → `subagent-driven-development` 経由
**対象コミットベース**: `5045a231` 以降の main (`ca428062` ベース)
**関連**:
- `docs/superpowers/specs/2026-04-13-handoff.md` — 全体の引き継ぎ
- `docs/superpowers/specs/2026-04-14-llama-cpp-setup-design.md` — 機能 5 の詳細
- `docs/superpowers/specs/2026-04-14-cloud-oauth-design.md` — 機能 6 の詳細

---

## v1 からの変更

初版の spec は棚卸しが甘く spec-document-reviewer 3 本から NEEDS CHANGES。以下を修正:

1. **機能 1**: `uiFont` rename を **廃止**。6 ファイルに参照があり rename 影響範囲が大きすぎる。preset id を増やすだけ
2. **機能 2**: `store/mcp-store.ts` と `lib/mcp-manager.ts` は**既存**。新規作成せず UI だけ追加
3. **機能 3**: Sidebar Tasks は既に `useAgentStore` 購読済。empty-state placeholder を置き換える作業
4. **機能 5**: `lib/llamacpp-setup.ts` (386 行) は**既存**で十分な関数群あり。UI を追加するだけで lib 層は未タッチ
5. **機能 6**: scheme は `shelly` (`dev.shelly.terminal` ではない)。redirect は `shelly://oauth/callback`。`expo-auth-session` 追加必須、prebuild/rebuild 必要

---

## ゴール

README `Coming Soon` の 6 機能を main に載せる。既存モジュールを極力活かし、新規作成は必要最小限。

---

## スコープ外

- unit test のセットアップ (Jest 未導入、別 issue #5)
- Dropbox / OneDrive の OAuth — Browser pane 直リンクのみ
- llama.cpp のバイナリ APK 同梱 — 既存 `lib/llamacpp-setup.ts` が `pendingCommand` ルートで解決済み
- Background agent の**作成** UI — `@agent` syntax 経由のみ、一覧/run-now/delete UI だけ対応
- Google Docs / Sheets の file export (v1 では `application/vnd.google-apps.*` を filter out)

---

## 実装順 (合理的最適解)

| # | 機能 | 所要 | 依存 | 効果 |
|---|---|---|---|---|
| 1 | Additional theme presets | 30 分 | 既存 `theme-presets.ts` | 見た目即効 |
| 2 | MCP manager UI | 30 分 | 既存 `mcp-store.ts` + `mcp-manager.ts` | 既存機能に UI |
| 3 | Background agent UI | 40 分 | 既存 `agent-store` + `agent-manager.ts` | Sidebar Tasks 完成 |
| 4 | SSH Profiles (key auth only) | 60 分 | なし (新規 store) | Profiles セクション充実 |
| 5 | llama.cpp UI (既存 lib 上) | 75 分 | 既存 `llamacpp-setup.ts` + Ports monitor | プライバシー訴求 |
| 6 | Google Drive OAuth + 直リンク | 120 分 | `expo-auth-session` 追加 | Cloud セクション完成 |

**合計: 約 6 時間**

---

## 機能 1: Additional theme presets

### 要件
既存 4 preset id (`shelly / silkscreen / pixel / mono`) に加えて、**色テーマを 4 個追加**する:
- `dracula`
- `nord`
- `gruvbox`
- `tokyo-night`

**font は Silkscreen 固定**。`uiFont` という名前は変更せず、意味を「UI テーマ preset」に拡張する (field rename は影響範囲大で YAGNI)。

### データモデル
```ts
// lib/theme-presets.ts
export type ThemePresetId =
  | 'shelly'
  | 'silkscreen'
  | 'pixel'
  | 'mono'
  | 'dracula'
  | 'nord'
  | 'gruvbox'
  | 'tokyo-night';
```

各 preset の `font` フィールドは:
- `shelly / silkscreen / dracula / nord / gruvbox / tokyo-night` → `Silkscreen`
- `pixel` → `PressStart2P`
- `mono` → `monospace`

### パレット (実装時に微調整)
Dracula / Nord / Gruvbox / Tokyo Night は**公式スキームから neon-glow 映えする飽和度を選ぶ**。完全準拠ではなく "flavor" として実装。実装時は公式 HEX をベースに `accent` / `text1` / `bgDeep` の 3 要素を優先して抽出、残りは `shellyPalette` からの推論でよい。

### 参照箇所 (rename 禁止の根拠)
`uiFont` は以下 6 ファイルに存在:
- `app/_layout.tsx` (applyThemePreset 呼び出し)
- `store/settings-store.ts` (default 値)
- `store/types.ts` (型定義)
- `components/CommandPalette.tsx` (font swap action)
- `components/layout/SettingsDropdown.tsx` (FontFamilyRow)
- `components/panes/TerminalPane.tsx` (native terminal font マッピング)

`store/types.ts` の `uiFont?: 'shelly' | 'silkscreen' | 'pixel' | 'mono'` に 4 id 追加、他は自動的に union 拡張されるだけで動くはず。`TerminalPane` の font マッピングだけ新規 id が追加されるので明示対応が必要。

### UI 変更
- `SettingsDropdown` の `FontFamilyRow` (既存) に Dracula/Nord/Gruvbox/Tokyo Night の 4 タイル追加、合計 8 タイル 2×4 or 4×2 配置
- `CommandPalette` に `Theme: Dracula` `Theme: Nord` `Theme: Gruvbox` `Theme: Tokyo Night` の 4 行追加
- `TerminalPane` の `fontFamily` マッピングに新 id 4 個 → すべて `silkscreen` (native)

### ファイル
- `lib/theme-presets.ts` (編集 — palette 4 個 + themePresets map 4 個追加)
- `store/types.ts` (編集 — union 拡張)
- `components/layout/SettingsDropdown.tsx` (編集 — タイル追加)
- `components/CommandPalette.tsx` (編集 — 4 行追加)
- `components/panes/TerminalPane.tsx` (編集 — native font マッピング)

### 検証
- Dracula 選択 → accent が紫、bg が `#282A36`
- vim 実行中に Nord に切り替え → vim セッション継続 (既存 runtime swap が動く)
- `TerminalPane` の native 描画色が追従 (`silkscreen` native font)

---

## 機能 2: MCP manager UI

### 現状把握 (重要)
以下は**既に存在する**:
- `store/mcp-store.ts` (4242 bytes): `servers: Record<string, {enabled, status, …}>`、`toggleServer(id)`、`getEnabledIds()` を提供、AsyncStorage persist 済
- `lib/mcp-manager.ts` (6259 bytes): `MCP_CATALOG` 定義、`generateClaudeConfig()`、`buildClaudeSettingsMcpBlock()` で Claude settings.json 同期まで実装

つまり **UI のみ追加する**。lib/store 層は**触らない**。

### UI
新規 `components/settings/MCPSection.tsx` (~150 行):
- `MCP_CATALOG` を list, 各 row で `useMcpStore((s) => s.servers[id]?.enabled)` を購読
- Tap で `toggleServer(id)` 呼ぶ
- 各 row の左に server name (`Context7`, `DeepWiki` …), 右に `[TOGGLE]` (カスタム Switch コンポーネントか NativeWind の border box)
- 各 row 下に 1 行 description を small text で

### どこから開けるか
`SettingsDropdown` に新規 row `MCP Servers` を追加、tap で MCPSection を Modal 表示。既存 `setShowConfigTUI` と同じパターン。

### ファイル
- `components/settings/MCPSection.tsx` (新規)
- `components/layout/SettingsDropdown.tsx` (編集 — 1 行追加)

### 検証
- toggle ON → `useMcpStore` の状態変更 → AsyncStorage に persist
- Claude settings.json 同期は既存 `buildClaudeSettingsMcpBlock` が勝手にやる (確認のみ)

---

## 機能 3: Background agent scheduler UI

### 現状把握 (重要)
- `components/layout/Sidebar.tsx` の Tasks section は **既に `useAgentStore((s) => s.agents)` と `runHistory` を購読している**
- 現在表示されている `NPM RUN DEV` `GIT PUSH` は `runningAgents` と `recentTasks` が両方空のときだけ出る **empty state placeholder**
- `lib/agent-manager.ts` は `createAgent` / `deleteAgent` / `loadAgentsFromDisk` / `notifyAgentResult` を export 済

### 不足しているもの
1. `store/agent-store.ts` に `runAgent(id)` がない
2. Sidebar Tasks の empty state を、agents が登録されていれば「登録済 agents 一覧」に切り替える分岐

### `runAgent(id)` の設計
既存 `lib/agent-manager.ts` を追いかけて実装方式を選ぶ:
- **A**: `lib/agent-executor.ts` が in-process で走る経路があれば、それを呼ぶ
- **B**: 無ければ `pendingCommand` に `shelly agent run <id>` を送って terminal に任せる

**実装時に `lib/agent-executor.ts` の有無を grep で確認**、なければ B を採用。B の場合 shelly CLI 側にも run サブコマンドが必要だが、最悪 `agent-manager.ts` を直接呼ぶスクリプトを `~/.shelly/bin/run-agent.sh` に置いて使う。

### UI
Sidebar Tasks section を以下のロジックに変更:
```
if (runningAgents.length > 0 || recentTasks.length > 0) {
  // 既存の running + recent 表示 (変更なし)
}
if (allAgents.length > 0) {
  // 追加: "SCHEDULED AGENTS" subheader + 登録済 agents list
  // 各 row: [● name] [▶] [🗑]
}
if (allAgents.length === 0 && runningAgents.length === 0 && recentTasks.length === 0) {
  // 既存の empty state (NPM RUN DEV / GIT PUSH ダミー) を残す or 消す
}
```
empty state は**削除**して、本当に何もないときは何も出さない方針 (モック準拠を一部犠牲にしてでも実データ優先)。

### ファイル
- `store/agent-store.ts` (編集 — `runAgent(id)` 追加)
- `lib/agent-manager.ts` (編集 — runner 関数追加 / 再検証)
- `components/layout/Sidebar.tsx` (編集 — Tasks section の分岐ロジック)

### 検証
- `@agent create perplexity-daily "..."` → Sidebar Tasks に現れる
- `▶` tap → agent が走る (terminal 出力 or notification)
- `🗑` tap → Alert 確認 → store から消える、再起動後も消えたまま

---

## 機能 4: SSH Profiles UI (key auth only)

### セキュリティ方針
**秘密情報を一切保存しない**:
- 秘密鍵本体は `~/.ssh/` にあり、アプリはパスのみ参照
- パスワード認証 / passphrase 保存は**禁止**
- `AsyncStorage` で persist (SecureStore は不要、保存値は公開可能なメタのみ)

### データモデル
```ts
// store/ssh-profiles-store.ts (新規)
type SshProfile = {
  id: string;
  label: string;      // 'prod-vps'
  host: string;       // 'example.com'
  port: number;       // 22
  user: string;       // 'ryo'
  keyPath: string;    // '~/.ssh/id_ed25519'
};

type SshProfilesState = {
  profiles: SshProfile[];
  addProfile: (p: Omit<SshProfile, 'id'>) => void;
  updateProfile: (id: string, patch: Partial<SshProfile>) => void;
  deleteProfile: (id: string) => void;
};
```

### UI
- 既存 `components/layout/ProfilesSection.tsx` を拡張
- 既存の profile list 表示に加えて、各 row tap → `ssh -i <keyPath> <user>@<host> -p <port>` を組み立て、`useTerminalStore.setState({ pendingCommand: cmd })`
- 長押し → Alert `[Edit | Delete | Cancel]`
- セクション末尾の `[+ ADD PROFILE]` tap → 新規 `components/profiles/SshProfileModal.tsx`
- モーダルは 5 TextInput (label/host/user/port/keyPath)、`keyPath` placeholder `~/.ssh/id_ed25519`

### 空ペイン処理
`pendingCommand` 送信時に active terminal pane が無ければ **Toast で警告** (`useMultiPaneStore` で leaf count をチェック)。`addPane('terminal')` を自動呼び出しで解決する手もあるが、ユーザーが意図しない挙動になるので警告で止める。

### ファイル
- `store/ssh-profiles-store.ts` (新規)
- `components/profiles/SshProfileModal.tsx` (新規)
- `components/layout/ProfilesSection.tsx` (編集)
- `lib/ssh-cmd.ts` (新規 — pure function でコマンド組み立て、後続の unit test 用)

### 検証
- ADD → 再起動後も残る
- tap → terminal pane に `ssh -i ~/.ssh/id_ed25519 ryo@example.com -p 22` が表示 (Enter は自動送信しない)
- 長押し → Edit / Delete
- terminal pane なしで tap → warning toast

---

## 機能 5: llama.cpp UI (既存 lib 上)

詳細は `docs/superpowers/specs/2026-04-14-llama-cpp-setup-design.md` を参照。要点:

### 現状把握 (重要)
`lib/llamacpp-setup.ts` (386 行) は**既存**で、以下を提供:
- `MODEL_CATALOG: LlamaCppModel[]` — モデル定義
- `buildDownloadCommand(model)` — wget コマンド生成
- `buildServerStartCommand(config)` / `buildRecommendedStartCommand` / `buildDaemonStartScript`
- `buildStopCommand()` / `buildStatusCommand()` / `buildDeleteModelCommand`
- `getLlamaCppLocalLlmConfig(model)` — LocalLlmConfig 返却
- `checkRamRequirement(model)`

### 不足しているもの
1. UI (`components/settings/LocalLlmSection.tsx`)
2. 状態 store (`store/llama-setup-store.ts`) — install / downloading / running / error
3. Ports monitor 連携 (`:8080` 検出時に `running` 状態に遷移)

### 設計上の懸念 (mini-spec で解決)
- `$HOME` 問題: `dev.shelly.terminal` の `$HOME` は `~/.shelly/` 前提で動かない可能性。**実装時に `execCommand("echo $HOME")` でまず確認**、必要なら install path を `FileSystem.documentDirectory + 'llama/'` に変更
- `unzip` 無い可能性: llama.cpp リリースは zip 形式、Plan B ランタイムに unzip が無ければ失敗。**実装前に `execCommand("which unzip")` を確認**、無ければ `.tar.gz` へフォールバック or busybox bundle
- `pkill -f` 誤爆: PID ファイル方式に変更。`echo $! > ~/.shelly/llama/server.pid` → `kill $(cat …)` → 3 秒待って残っていれば `-9`
- `--log-disable` と `tail server.log` が矛盾 → **`--log-disable` を削除**、`server.log` は残す

### 判断ポイント
既存 `buildServerStartCommand` の挙動を**実装時に再読**して、PID 保存と log 出力が両立するか確認。必要なら `lib/llamacpp-setup.ts` に `buildServerStartCommandWithPid` を追加。

### ファイル
- `store/llama-setup-store.ts` (新規)
- `components/settings/LocalLlmSection.tsx` (新規)
- `components/layout/SettingsDropdown.tsx` (編集 — Local LLM row 追加)
- `lib/llamacpp-setup.ts` (編集 — `buildServerStartCommandWithPid` 追加の可能性)

---

## 機能 6: Google Drive OAuth + Dropbox/OneDrive 直リンク

詳細は `docs/superpowers/specs/2026-04-14-cloud-oauth-design.md` を参照。要点:

### 重要修正 (v1 からの変更)
- **scheme は `shelly`**、`dev.shelly.terminal` ではない (`app.config.ts:4`)
- redirect_uri は `shelly://oauth/callback`
- `AuthSession.makeRedirectUri({ scheme: 'shelly', path: 'oauth/callback' })` で組む
- `expo-auth-session` + `expo-crypto` は**未インストール**、pnpm add 必要 + prebuild/rebuild 必要
- Sidebar Cloud section には**既に `handleCloudConnect` + Alert.alert stub がある**、これを置き換える
- file DL は `blob + base64` ではなく **`FileSystem.createDownloadResumable`** (with Authorization header) で OOM 回避
- Google Docs (`application/vnd.google-apps.*`) は v1 では**filter out して list に出さない**

### Google Drive 本格 OAuth
- PKCE flow via `expo-auth-session`
- scope: `https://www.googleapis.com/auth/drive.readonly`
- access/refresh token は `expo-secure-store` に保存
- CLIENT_ID は `process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID`、README に setup guide
- 未設定時は Cloud section に警告バナー + Dropbox/OneDrive の 2 行のみ

### Dropbox / OneDrive 直リンク
- `useBrowserStore.openUrl('https://www.dropbox.com/home')` / `https://onedrive.live.com`
- OAuth なし、file API なし

### ファイル
- `lib/google-drive.ts` (新規 — auth/list/download の純関数)
- `store/google-drive-store.ts` (新規)
- `components/cloud/GoogleDriveAuthModal.tsx` (新規)
- `components/cloud/GoogleDriveList.tsx` (新規)
- `components/layout/Sidebar.tsx` (編集 — `handleCloudConnect` 削除、Cloud section 書き換え)
- `README.md` (編集 — CLIENT_ID setup guide 追記)
- `.env.example` (新規)
- `package.json` (編集 — `expo-auth-session`, `expo-crypto` 追加)

---

## 共通方針

### コミット粒度
1 機能 1 コミット原則。機能 5/6 は step ごとに分けてよい。

### ブランチ
main に直接 push 継続。

### 検証
各機能の完了基準は **実機で smoke test 1 回通ればよし**。unit test はスコープ外。

### ドキュメント同期
各機能の着地時に:
1. `README.md` の Status テーブルを更新 (Coming Soon → ✅ shipping)
2. `README.md` の Coming Soon セクションから該当項目を削除
3. `docs/superpowers/specs/2026-04-13-handoff.md` に commit hash を追記
4. `~/storage/downloads/README.md` にも `cp` で同期

---

## リスクと対応

| リスク | 機能 | 対応 |
|---|---|---|
| `uiFont` 参照を追加する 6 ファイル全てに theme id を反映し忘れる | 1 | 実装時に `grep -rn uiFont` で全部確認、未対応箇所は TypeScript エラーで検出 |
| `store/mcp-store.ts` の既存 toggleServer が UI の期待と異なる shape | 2 | 実装時に `store/mcp-store.ts` を先に Read して API を確認 |
| `runAgent(id)` の実装方式が未確定 | 3 | 実装時に `lib/agent-executor.ts` 有無を確認、無ければ `pendingCommand` fallback |
| 秘密鍵パス入力ミス | 4 | Terminal にエラーが出るので UI 側は何もしない、placeholder で標準パスを明示 |
| `$HOME` / `unzip` の Plan B ランタイム未検証 | 5 | 実装着手時に 1 分で確認コマンドを流す (`echo $HOME; which unzip`) |
| Google Drive OAuth の scheme 設定漏れ | 6 | `AuthSession.makeRedirectUri({scheme:'shelly'})` で動的生成、hardcode しない |
| Google Docs を DL しようとして 400 | 6 | `files.list` の `q` に `mimeType != 'application/vnd.google-apps.document'` 追加 |
| 大ファイル DL で OOM | 6 | `FileSystem.createDownloadResumable` を使う |
| llama.cpp PID 管理ミスで pkill 誤爆 | 5 | PID ファイル方式、mini-spec で詳細 |
| 機能 5/6 の所要時間超過 | 5, 6 | 超過時は `executing-plans` skill の stop-and-ask ルールに従い、部分実装で commit して残りは次セッションへ |

---

## 成功判定

6 機能すべてが以下を満たせば成功:
1. `npx tsc --noEmit` 0 エラー
2. main に push 済み
3. `README.md` Status テーブルで該当行が ✅ shipping
4. 実機で UI smoke test 済み
5. `docs/superpowers/specs/2026-04-13-handoff.md` 更新済み

---

## 次アクション

1. ~~このファイルを commit~~ (済み — v2 で上書き)
2. ~~mini-spec を 2 本書く~~ (済み — v2 で別途更新)
3. spec review loop 再実行 (umbrella + 2 mini-spec)
4. ユーザー承認
5. `writing-plans` skill で `2026-04-14-coming-soon-plan.md` を生成
6. 新セッションで `executing-plans` or `subagent-driven-development` で実装開始
