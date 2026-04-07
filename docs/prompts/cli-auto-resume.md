# CLI Auto-Resume 実装プロンプト

以下をコピーして次のClaude Codeセッションに貼り付けてください。

---

Shellyプロジェクト（~/Shelly）でCLI自動復帰機能を実装してください。

## 設計計画
`docs/superpowers/plans/2026-04-03-cli-auto-resume.md` に詳細な実装計画があります。まずこれを読んでください。

## 概要
Shellyのターミナルでclaude/geminiなどのCLIで作業中に、bridge切断やpty-helper死亡が発生した場合、復旧後に自動的に`claude --continue`や`gemini --resume latest`を実行し、ユーザーが何もしなくても作業の続きから再開されるようにする。

## 重要な設計原則
- **ゼロ状態のユーザーは`claude --continue`を知らない。Shellyが裏でやる。**
- Termuxの存在もCLIの復帰コマンドの存在も見せない
- 自動復帰はpty-helperが**新規作成**された場合のみ発動（再接続の場合はCLIプロセスが生きているので不要）

## 既存インフラ
- `activeCli`フィールド：TabSessionに存在、AsyncStorageに永続化済み
- `detectCli()`：コマンドからCLI種別を自動検出
- `CLI_RESUME_COMMANDS`：lib/tmux-manager.tsに定義済み
- `buildRecoveryCommand()`：lib/tmux-manager.tsに存在（未使用）

## 実装タスク（計画書のTask 1〜5）
1. CLI復帰コマンドの自動送信（`createNativeSession`に組み込み）
2. activeCli状態管理の改善（CLI終了時のクリア）
3. BridgeRecoveryBannerの簡素化（手動バナー→自動化）
4. シェル準備完了の検出強化（プロンプト検出）
5. E2Eテスト

## ビルド前にデバッグ環境を準備すること
adb接続済み（`adb connect localhost:接続ポート`）。logcatでShellyのログを確認してから修正する。推測でビルドを繰り返さない。
