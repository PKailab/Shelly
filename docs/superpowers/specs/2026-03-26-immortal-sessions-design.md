# Immortal Sessions: セッション不死身化

## 問題

AndroidのOOM KillerがTermuxプロセスを殺すと、対話中のClaude Code / Gemini CLI / Codex等が全て消える。ユーザーが別アプリ（YouTube、電話等）を使って戻ると、ターミナルが空になっている。コンテキストが失われることがユーザーにとって最大の不安要素。

## 要件

### Must: 処理続行
- ターミナルで実行中のCLI（claude, gemini, codex等）が、アプリ離脱中も処理を続行する
- ユーザーがShellyに戻った時、何事もなかったかのように元の画面が表示される
- 手動操作ゼロ

### Should: 死亡復帰
- Termuxプロセスごと死んだ場合、コンテキストを引き継いで復帰できる導線がある
- ターミナルペインからもチャットペインからも復帰可能
- サイレント復帰: バナー1行のみ、確認ダイアログなし
- CLIの会話コンテキストが維持される（claude --continue, gemini --resume等）

## アーキテクチャ: 3層防御

```
Layer 1 (Must): tmux
  ttyd → tmux session → bash → claude/gemini/codex
  アプリ離脱 → WebView切断 → tmux内は動き続ける
  アプリ復帰 → WebView再接続 → tmux re-attach → 元の画面

Layer 2 (Should): CLI会話復帰
  Termuxごと死ぬ → tmuxも死ぬ
  → bridge再起動 → tmux死亡検出
  → 新tmuxセッション → cd + claude --continue 等を自動実行
  → バナー「セッション復帰しました」

Layer 3 (Should): コンテキスト永続化
  復帰に必要な状態を常時保存
  → cwd, activeCli, tmuxSession名, 最後のコマンド
```

### 各Layerの発動条件

| シナリオ | Layer 1 (tmux) | Layer 2 (CLI復帰) | Layer 3 (永続化) |
|---------|---------------|-------------------|-----------------|
| Shellyだけ死亡、Termux生存 | tmux生存 → ttyd re-attach で完全復帰 | 不要 | 不要 |
| Termuxごと死亡（OOM Kill） | tmuxも死亡 | bridge再起動後、CLI自動復帰 | 保存済みデータから復元 |
| デバイス再起動 | tmuxも死亡 | bridge再起動後、CLI自動復帰 | 保存済みデータから復元 |

## Layer 1: tmux統合 (Must)

### 現在の起動フロー

`start-shelly.sh` は現在存在しない（**新規作成が必要**）。
現在はuse-termux-bridge.tsのauto-recoveryが直接ttydを起動している:

```bash
# 現在（auto-recovery内のハードコード）
nohup ttyd -p 7681 -W bash > /dev/null 2>&1 &
```

WebViewが切断されると（アプリ離脱）、ttydがbashプロセスを管理しているため、bashの子プロセス（claude等）も道連れで死ぬ。

### 変更後の起動フロー

`start-shelly.sh` を新規作成し、tmux統合を含める:

```bash
#!/data/data/com.termux/files/usr/bin/bash
# start-shelly.sh — Shelly bridge + tmux + ttyd 起動スクリプト

# tmuxがなければインストール
command -v tmux >/dev/null || pkg install -y tmux

# tmuxスクロールバック拡大（デフォルト2000→10000行）
tmux set-option -g history-limit 10000 2>/dev/null

# tmuxセッション作成（既存なら何もしない）
for i in 1 2 3 4 5 6; do
  tmux has-session -t shelly-$i 2>/dev/null || tmux new-session -d -s shelly-$i
done

# ttyd起動（tmuxにattach）
nohup ttyd -p 7681 -W tmux attach-session -t shelly-1 > /dev/null 2>&1 &
# 追加タブのttydは必要時にShelly側から起動

# bridge server起動
cd ~/shelly-bridge && nohup node server.js > /dev/null 2>&1 &
```

- ttydはtmuxにattachするだけ。WebView切断 → ttydのattachが切れるだけ → tmux内のbash+claudeは生きている
- 再接続時、ttydが再度`tmux attach`すれば元の画面がそのまま出る
- tmuxの`-A`フラグ（attach-or-create）ではなく、明示的にnew-session + attachを分離する（ttyd再起動時に二重セッションを防ぐため）

### tmuxセッション管理

- Shellyのタブ1〜6 → tmuxセッション `shelly-1`〜`shelly-6`
- `lib/tmux-manager.ts` で管理:
  - `ensureSession(name)`: セッション存在確認、なければ作成
  - `isSessionAlive(name)`: `tmux has-session -t <name>` の結果
  - `listSessions()`: 全shellyセッション一覧
  - `killSession(name)`: セッション削除（タブ閉じ時）

### ttyd接続フックの変更

`use-ttyd-connection.ts` のttyd自動起動コマンドを変更:

```typescript
// 変更前
`nohup ttyd -p ${port} -W bash > /dev/null 2>&1 &`

// 変更後
`tmux has-session -t shelly-${n} 2>/dev/null || tmux new-session -d -s shelly-${n}; nohup ttyd -p ${port} -W tmux attach-session -t shelly-${n} > /dev/null 2>&1 &`
```

### tmuxのインストール

`start-shelly.sh` の冒頭で `pkg install -y tmux` を追加（冪等: 既にあればスキップ）。
SetupWizardのTermuxセットアップステップにも追加。

## Layer 2: CLI会話復帰 (Should)

### activeCli検出

ターミナルでCLIが起動されたことを検出し、`activeCli`として保存する。

検出方法:
1. **bridgeのrunコマンド経由**: コマンド文字列が `claude`, `gemini`, `codex`, `cody` で始まるかチェック
2. **ttyd直接入力**: ttydはWebView経由なので入力をキャプチャできない。代わりに、bridgeの`run`コマンドでCLI起動を検出する。ttydで直接打った場合は検出不可だが、Shellyの入力欄経由なら検出可能
3. **将来の改善案**: `tmux list-panes -t shelly-N -F "#{pane_current_command}"` でtmux内の実行中プロセス名を取得すれば、ttyd直接入力でも検出可能。ただし初期実装では対応しない

**activeCli は各タブごとに1つ**: 同じタブでclaudeを終了してgeminiを起動した場合、最後に起動したCLIのみが追跡される（復帰時は最後のCLIを復帰するのが正しい動作）

保存タイミング: CLI起動検出時にAsyncStorageへ即時保存

### 復帰コマンドマップ

```typescript
const CLI_RESUME_COMMANDS: Record<string, string | null> = {
  claude: 'claude --continue',
  gemini: 'gemini --resume latest',
  codex: null,   // 会話復帰機能なし → CLIを起動するだけ
  cody: null,    // 同上
};
```

**注意**: `claude --continue` は「現在のディレクトリ」の最新会話を復帰する。そのため復帰フローの `cd /前回のcwd` は必須。cwdが一致しないと別の会話が復帰されるか、会話が見つからない。

### 復帰フロー（ターミナルペイン）

1. Shelly復帰 → bridge再起動成功
2. 各タブのtmuxセッション生死確認: `tmux has-session -t shelly-N`
3. **tmuxが生きている** → 何もしない（ttyd再接続で自動復帰）
4. **tmuxが死んでいる** → 新tmuxセッション作成 → bridge経由で以下を自動実行:
   ```bash
   cd /前回のcwd
   # activeCli に応じて:
   claude --continue    # or gemini --resume latest, or codex, etc.
   ```
5. ターミナルにバナー表示: `セッション復帰しました`

### 復帰フロー（チャットペイン）

チャットペインからの復帰は、既存の`@claude`/`@gemini`ルーティングを拡張:

1. ユーザーが `@claude 続きをやって` 等と入力
2. `activeCliSession`が保存されていれば、`--continue`付きで起動
3. 保存されていなければ通常の新規セッションとして起動

既存の`use-ai-dispatch.ts`の`@claude`ハンドラに、`activeCliSession`チェックを追加するだけ。

## Layer 3: コンテキスト永続化 (Should)

### TabSession型の拡張

```typescript
// store/types.ts
type TabSession = {
  // 既存フィールド（変更なし）
  id: string;
  name: string;
  connectionStatus: string;
  currentDir: string;
  port: number;
  ttyUrl: string;
  blocks: CommandBlock[];
  entries: TerminalEntry[];
  commandHistory: string[];
  historyIndex: number;

  // 新規追加
  activeCli: 'claude' | 'gemini' | 'codex' | 'cody' | null;
  tmuxSession: string;  // "shelly-1"
};
```

### 既存の `activeCliSession` との関係

ストアに既存の `activeCliSession: string | null` がある（グローバル）。これはチャットペインの入力ルーティング用。

新規の `activeCli`（タブごと）は復帰専用で、用途が異なる:
- **`activeCliSession`** (グローバル): チャットペインで `@claude` 等のルーティングに使用。変更なし
- **`activeCli`** (タブごと): 各タブで実行中のCLI種別。Layer 2の復帰コマンド決定に使用

### 永続化パス

2つの永続化機構がある。両方に新フィールドを追加:

1. **AsyncStorage** (`terminal-store.ts` の `saveSessionState()`): 主要な復帰パス。アプリ再起動時に即座に読み込まれる
2. **ファイルベース** (`session-persistence.ts` の `saveSessionsToProject()`): プロジェクト単位のバックアップ。bridge経由でファイルに書き出す

### 永続化タイミング

- **activeCli設定時**: CLI起動検出 → 即時AsyncStorage保存
- **activeCli解除時**: CLI終了検出（exitイベント） → null に戻して保存
- **アプリ背景遷移時**: 既存のAppState listenerで自動保存（変更なし）
- **30秒間隔**: 既存のauto-saveで自動保存（変更なし）

### createSession ファクトリ関数の更新

```typescript
function createSession(id: string, name: string, port: number = TTYD_PORT_BASE): TabSession {
  return {
    // ...既存フィールド
    activeCli: null,
    tmuxSession: `shelly-${port - TTYD_PORT_BASE + 1}`,
  };
}
```

## 変更ファイル一覧

| ファイル | 変更内容 | 優先度 |
|---------|---------|--------|
| `~/shelly-bridge/start-shelly.sh` | **新規作成**: tmux起動統合、ttydコマンド変更、`pkg install tmux` | Must |
| `~/Shelly/lib/tmux-manager.ts` | **新規**: tmuxセッション管理（ensure/check/list/kill） | Must |
| `~/Shelly/hooks/use-ttyd-connection.ts` | ttyd起動コマンドをtmux経由に変更 | Must |
| `~/Shelly/hooks/use-termux-bridge.ts` | auto-recoveryで`start-shelly.sh`を使用するよう変更 | Must |
| `~/Shelly/store/types.ts` | `TabSession`に`activeCli`, `tmuxSession`追加 | Should |
| `~/Shelly/store/terminal-store.ts` | 新フィールドの初期化・保存・復元、`createSession`更新 | Should |
| `~/Shelly/lib/session-persistence.ts` | `PersistedSession`に新フィールド追加 | Should |
| `~/Shelly/lib/cli-runner.ts` | `CliTool`に`'codex'\|'cody'`追加（CliToolConfig含む）、`CLI_RESUME_COMMANDS`マップ | Should |
| `~/Shelly/hooks/use-ai-dispatch.ts` | チャットペインからの復帰対応（`activeCli`チェック） | Should |

## 前提条件

- Termuxに`tmux`パッケージがインストールされていること（start-shelly.shで自動インストール）
- Claude Code v2.x の `--continue` フラグが利用可能であること（確認済み）
- Gemini CLI の `--resume latest` フラグが利用可能であること（確認済み）

## UX補足

- tmux re-attach時、WebView（xterm.js）は新しいページを読み込む。tmuxのスクロールバックバッファ（10000行に設定）に残っている出力は上スクロールで確認可能
- `removeSession`（タブ閉じ）時は `tmux kill-session -t shelly-N` を呼ぶ必要がある
- 長時間CLI実行中の省電力対策として、将来的に `termux-wake-lock` の自動取得を検討（初期実装では対応しない）

## やらないこと

- tmuxのキーバインド変更やカスタマイズ（Shellyがtmuxを透過的に扱い、ユーザーにtmuxの存在を意識させない）
- Codex/Codyの会話復帰（これらのCLIに会話復帰機能がないため、新規セッション起動のみ）
- チャットペインのワンショット実行（`@claude --print`）のセッション永続化（不要: 実行完了まで待つだけ）
- ttyd直接入力のactiveCli検出（将来 `tmux list-panes` で対応予定）
