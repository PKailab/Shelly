# ターミナルセッション永続化 — Termux並みの体験を実現する

## プロンプト（これをClaude Codeに投げる）

```
~/Shelly のターミナルセッションを修正してください。

## ゴール

Termux純正アプリと同じ体験を実現する。具体的には：

1. アプリをバックグラウンドに回して戻ってきたとき、**全く同じ画面がそのまま残っている**
2. セッション切断・再接続の「Connecting to terminal...」表示が出ない
3. ユーザーから見たら「何も起きていない」

## 設計思想（必ず守ること）

- **ターゲットユーザー**: 非エンジニア（自然言語オンリーで使える人）
- **Termuxの存在を消す** — ユーザーにTermuxを意識させない
- ゼロ状態のユーザーが作業中にYouTubeや別のアプリを起動して、再度戻ってきたときに、
  それまでのCLI会話内容や開発の過程が消えているのは**致命的**
- 「接続中...」の表示は失敗体験。出さないのが正解

## アーキテクチャ制約（重要：UDS移行は不可能）

ShellyとTermuxは別のAndroidアプリ（別UID）。Unix Domain SocketはSELinux +
ファイル権限でクロスアプリアクセスがブロックされる。TCP localhostが唯一の
正解であり、これは妥協ではなく設計上の正解。

現在のアーキテクチャ:
```
KeyInput → TerminalView (Kotlin) → ShellyTerminalSession (Kotlin) → TCP Socket → pty-helper (C, forkpty) → shell
```

**TCPを維持した上で、Termux並みの体験を実現する。**

## 現状の問題と原因

### 問題1: バックグラウンド復帰で描画が消える（最重要）
- **原因**: AndroidのDoze/App StandbyがTCP接続を切る。
  Kotlin `ShellyTerminalSession` のTCPソケットが切断される。
  現在のフォアグラウンド復帰ロジック(`ensureNativeSessions`)が
  `destroySession()` → `createSession()` で完全再作成するため、
  Kotlin側の `TerminalEmulator` のスクロールバッファが破棄される。
- **Termuxとの違い**: Termuxは自プロセス内でforkpty()しているので、
  Viewが非表示になってもプロセスもバッファもメモリ上に残る。
  Shellyはpty-helperとTCPで繋いでいるため、ソケット切断→再作成＝バッファ喪失。

### 問題2: フォアグラウンド復帰で「Connecting to terminal...」が表示される
- **原因**: `ensureNativeSessions()` が全セッションに対して
  `isSessionAlive()` → false → `createNativeSession()` を直列で実行。
  createNativeSessionはpty-helper生死確認→Kotlin session作成で数秒かかる。

### 問題3: pty-helperは生きているのにKotlinセッションを破棄している
- **原因**: `createNativeSession()` の冒頭で必ず `destroySession()` を呼んでいる。
  pty-helperがバックグラウンド中もTCPポートでacceptし続けているのに、
  Kotlin側がセッション（＝TerminalEmulatorバッファ）を捨てて再作成している。

## 修正方針

### A. Kotlin側: TCPソケットの自動再接続 + バッファ保持（核心）

`ShellyTerminalSession.kt` を修正:

1. **TCP Keep-Alive を有効にする**
   ```kotlin
   socket.keepAlive = true
   socket.tcpNoDelay = true // 既に設定済みだが確認
   ```

2. **ソケット切断時にTerminalEmulatorを破棄しない**
   - 現在: ソケットが切れる → セッション全体が死ぬ
   - 修正: ソケットが切れても `TerminalEmulator` インスタンスは保持
   - 読み取りスレッド(`readerThread`)がEOF/Exceptionを検知したら、
     ソケットだけ閉じて `TerminalEmulator` は保持したまま再接続を試みる

3. **バックグラウンド中の自動再接続ループ**
   - ソケット切断検知 → 1秒間隔で再接続を試みる（最大30回）
   - 再接続成功時: 新しいソケットのInputStream/OutputStreamを
     既存の `TerminalEmulator` に接続し直す
   - `TerminalSession.java` の `initializeWithStreams()` を参考に、
     ストリームの差し替えメソッドを追加するか、
     readerThread/writerThreadを再起動する

4. **再接続成功後にCtrl+L（画面リフレッシュ）を送信**
   - シェル側にreadlineのリドロー要求を送ることで、
     プロンプトと最終行が正しく再表示される

### B. TypeScript側: ensureNativeSessions()の改善

`app/(tabs)/terminal.tsx` を修正:

1. **isAlive() = true なら何もしない（最重要）**
   - 現在: フォアグラウンド復帰時に全セッションを確認して再作成
   - 修正: `TerminalEmulator.isSessionAlive(sessionId)` が true なら、
     そのセッションはKotlinメモリ上にバッファが残っているので**何もしない**
   - これだけで「画面がそのまま残る」ケースが大幅に増える

2. **isAlive() = false の場合のみ再作成**
   - pty-helperが生きているか確認
   - 生きていれば新しいKotlinセッションを作成
   - **その後 `tmux capture-pane` でpty-helper側のスクロールバッファを取得**
   - 取得したテキストを `TerminalEmulator.writeToEmulator(sessionId, text)` で注入
   - これにより過去の出力が復元される

3. **createNativeSession() の冒頭のdestroySession()を条件付きに**
   - 現在: 無条件で `destroySession()` 呼び出し
   - 修正: `isSessionAlive()` が false の場合のみ destroy

### C. Kotlin側: isAlive()の精度向上

`ShellyTerminalSession.kt` の `isAlive()` を修正:

- 現在: TCPソケットの `sendUrgentData(0xFF)` で判定
- 問題: ソケットが切れた瞬間に false になり、再接続中も false
- 修正: **TerminalEmulatorインスタンスが存在するかどうか**も判定に含める
  - ソケットが切れていても、Emulatorが生きていればバッファは残っている
  - `isAlive()` = ソケットOK && エミュレータあり
  - 新メソッド `hasEmulator()` = エミュレータインスタンスが非null
  - TypeScript側はまず `hasEmulator()` をチェックし、true なら描画は残っている

### D. tmux依存のセッションモニターを更新

`lib/terminal-session-monitor.ts` を修正:

- 現在: `tmux has-session` でセッション生死を判定
- 修正: TCPポートチェック（`/dev/tcp/127.0.0.1/${port}`）に変更
- tmuxが使われなくなった将来にも対応

## 調査対象ファイル

### Kotlin (Native Module) — 最重要
- `modules/terminal-emulator/android/src/main/java/expo/modules/terminalemulator/`
  - `ShellyTerminalSession.kt` — TCPソケット管理、TerminalEmulatorラッパー
    - `connectToServer()` — TCP接続
    - `readerThread` — 入力読み取りループ
    - `isAlive()` — 生死判定
  - `TerminalEmulatorModule.kt` — JS↔Kotlin ブリッジ、セッションレジストリ
    - `sessionRegistry` — グローバルセッション保持
    - `createSession()` / `destroySession()` — ライフサイクル
  - `TerminalSessionService.kt` — Foreground Service

### Java (Termux移植、参考用)
- `modules/terminal-emulator/android/src/main/java/com/termux/terminal/`
  - `TerminalEmulator.java` — VT100エミュレータ（スクロールバッファ管理）
  - `TerminalSession.java` — initializeWithStreams()が参考になる

### TypeScript
- `app/(tabs)/terminal.tsx` — `createNativeSession()`, `ensureNativeSessions()`
- `store/terminal-store.ts` — セッション状態管理
- `lib/terminal-session-monitor.ts` — tmux依存のヘルスチェック

### C (PTYヘルパー)
- `~/shelly-bridge/pty-helper.c` — TCP版、クライアント再接続対応

## 注意事項

- **既存の動作ロジックを壊さない** — OSSとして公開済み（v4.2.0）
- **Bundle ID、EAS ID、デフォルト設定値は変えない**
- Kotlinファイルのパスは長い: `modules/terminal-emulator/android/src/main/java/expo/modules/terminalemulator/`
- TerminalEmulator.java はTermuxから移植した大きなファイル。変更は最小限に
- `TerminalSession.java` のforkpty()パスは使わない（Shelly+Termuxは別UIDのため）
- pty-helperはTermux側で実行され、TCPでacceptループしている。クライアント再接続に対応済み
- Foreground Service (`TerminalSessionService`) はShelly側のプロセス保持用。
  pty-helper（Termux側）の保持はTermux自身のForeground Serviceが担当
```

## 背景情報

- 設計思想メモリ: `~/.claude/projects/.../memory/shelly-design-philosophy.md`
- PTY改修設計メモリ: `~/.claude/projects/.../memory/shelly-pty-architecture-overhaul.md`
  - ※ UDS移行は不可能と判明。TCPを維持する方針に変更
- CLAUDE.md: `~/Shelly/CLAUDE.md` — プロジェクト全体のコンテキスト
- OSS公開ルール: `~/.claude/projects/.../memory/feedback-oss-prep-rules.md`
- 最新リリース: v4.2.0 (2026-04-02)
- 直前の修正: clearSession()のcwdリセット、接続タイムアウト短縮（済）

## 成功基準

修正後、以下のシナリオが全て通ること:

1. ターミナルでClaude Codeを起動 → YouTube起動 → 30秒後にShelly復帰 → **Claude Codeの画面がそのまま残っている**
2. ターミナルでnpm run build → ホーム画面に戻る → 1分後にShelly復帰 → **ビルドログがそのまま残っている**
3. スプリットビューでエラーを出す → 別アプリに切り替え → Shelly復帰 → **エラー表示もチャットもそのまま**
4. 上記すべてで「Connecting to terminal...」が**表示されない**
