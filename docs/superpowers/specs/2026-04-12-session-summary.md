# 2026-04-12 Shelly セッションサマリ

ターミナル入力経路の根本治療と Superset UI の最終仕上げを 1 セッションで実施。
30 コミット弱、tsc 0 維持。次セッションが「今どこにいるか」を 1 分で把握するための要点だけまとめる。

## 何が変わったか（カテゴリ別)

### Plan B (JNI forkpty) 周辺の名残掃除
- `'termux'` ルーティングラベルを `'shell'` にリネーム (`e6c07ef7`)
- i18n 28 文字列を「Termuxに接続してください」系から「設定でAPIキー」系に刷新 (`53f017ef`)
- pkg/apt 補完候補を削除 (`1f552f7f`)
- コメントの古い Termux 言及を整理 (`caee4cd0`)
- chelly/ tsconfig exclude + デッドコード3ファイル削除 → tsc 13→0 (`c5657834`)

### Superset UI Step 1-6
- **設定ドロップダウン新設** (`387d60fa`) — CRT/Lang/Font/Agents/API Keys を歯車ボタンに集約
- **ペインヘッダー ⊞/⤢/✕ 整理** (`7ac8708e`) — split / maximize / close を1セットに
- **12px ドラッグハンドル + ダブルタップで均等分割** (`4bc9a4dc`)
- **AddPaneSheet** (AgentBar `+`) (`22039926`)
- **LayoutPresetSheet** (左端 dashboard アイコン) (`09d1f02d`)
- **Z Fold6 折り畳み自動切替** (`75faccb4`)
- **Modal 化** Settings/AddPane/Layout を React Native Modal でラップ (`41fc3ddb`) — Z Fold6 で親 View に閉じ込められて表示されない問題を解決

### ターミナル入力系の3度目の根本治療
4日前から再発し続けていた「Enter 2回問題 + コピペ1文字目消失 + BackSpace 効かない + Enter後にカーソルだけ進んで新プロンプトが出ない」を完全解決：

- **MockClaudeSession オーバーレイ削除** (`3cab26a6`) — 実 PTY が画面に出るようになった
- **TerminalView IME composing 削除 + PS1 OSC 133 削除** (`0dff463b`) — `mLastComposingSent` の delta 検出が PTY echo と drift していた根本原因を撤廃
- **`primeImeBuffer()` で BackSpace 復活** (`20481eb7`) — `getEditable().clear()` で空 Editable になっていた状態を「常にスペース1文字を保持」に変更し、Gboard が BackSpace を `deleteSurroundingText` に変換し続ける
- **`flushOutputBuffer` の重複 callback 削除 + redraw 即時化** (`097c8b3f`) — 2回目の Enter まで新プロンプトが出ない原因は **`onScreenUpdateCallback` が 16ms delay の flush でも呼ばれていて、後発の delayed redraw が古い snapshot で上書きしていた** ため。`onTextChanged` の最初に同期で invalidate するよう変更
- **`HomeInitializer.kt` `BASHRC_VERSION` 13 → 14** (今コミット予定) — `0dff463b` で PS1 を直したが BASHRC_VERSION を上げ忘れていたので、ユーザー端末の `~/.bashrc` が古いまま。次のビルドで自動再生成される

### AIPane / クロスペインインテリジェンス
- **MockClaudeSession 削除と引き換えに `lib/claude-cli.ts` 新設** (`fc4c6665`) — `claude --print` を JNI execCommand 経由でストリーム呼び出し、AIPane の Claude TODO 実装
- **AIPane Claude default + FAB 重なり解消 + フォント縮小** (`641778d9`)
- **AIPane の boundAgent 自動選択を Cerebras 優先** (`03850438`)
   - `cerebras > groq > gemini > claude` のフォールバック優先順位
- **`use-ai-pane-dispatch.ts` に Cerebras ハンドラ追加** (`03850438`) — 死コードだった Cerebras agent を実装、クロスペイン インテリジェンスが本来の Cerebras Qwen3-235B で動くように
- **PreviewPane を専用ペインとして登録** (`f1baf507`) — pane-registry に `preview` 追加、AddPaneSheet にも追加、PreviewTabs.onClose を optional 化して standalone でも使える
- **`teamMembers` 型に cerebras/groq 追加** (`f1baf507`) — AgentMenu で7種類の agent (Claude/Gemini/Codex/Cerebras/Groq/Perplexity/Local) を選べるように
- **AGENT_COLORS** に Cerebras (`#FF6B35`) / Groq (`#F97316`) を追加 (`f1baf507`)
- **AgentMenu 起動トリガー追加** (`97681669`) — agentMenuVisible state はあったが setAgentMenuVisible(true) を呼ぶ場所がない死コードだった。AI ペインヘッダーに **`[● CEREBRAS ▾]` の agent badge** を追加してタップで AgentMenu を開く
- **`settings.defaultAgent` 型に cerebras/groq 追加** (今コミット予定)
- **SettingsDropdown の Default Agent をドロップダウン化** (今コミット予定) — 5択から選べる

### マルチペイン自由化（最終形）
今のコードベースでユーザーができること：

1. **AgentBar 左端 dashboard アイコン** → LayoutPresetSheet → 6プリセット (Single / 1+2 Split / 2 Col / 2 Row / 2×2 Grid / 4 Terminal) から選択
2. **AgentBar `+` ボタン** → AddPaneSheet → 5種類のペインタイプ + File Tree から選択して focused leaf に追加
3. **PaneSlot ヘッダー左の pane-type pill** `[TERMINAL ▾]` → タップで Terminal / AI / Browser / Markdown / Preview に即切替
4. **AI ペインのヘッダー中央 agent badge** `[● CEREBRAS ▾]` → タップで AgentMenu → 7種類の agent から選択
5. **歯車** → SettingsDropdown → DISPLAY/LANGUAGE/AI AGENTS/API KEYS。Default Agent もドロップダウンで5択から
6. **ペインヘッダー右の ⊞/⤢/✕** → split / maximize / close
7. **12px ドラッグハンドル** → 境界線をドラッグでリサイズ、ダブルタップで均等

### ビジュアル仕上げ
- **CRT エフェクト数値チューニング** (`8dca2ce5`) — scanline 1px+3px gap 0.15、phosphor rgba(0,255,68,0.03)×intensity、vignette 周辺20%×0.85
- **Cloud CONNECT → BrowserPane で OAuth URL** (`27462c4e`) — Dropbox/OneDrive の認可エンドポイント
- **ブックマークプリセット** (`c57779e3`) — YouTube/X/GitHub/localhost をブランド色アイコン付き固定プリセットとして
- **AgentBar dashboard ボタン強化** (今コミット予定 = `03850438` 含み) — size 15→18, accent color, accent border で「タップできるボタン」と分かりやすく
- **フォント全体縮小** (`641778d9` + `4469bc10`) — Sidebar/AgentBar/ペイン内すべて
   - Terminal: settings.fontSize 連動 (S/M/L = 8/10/12)
   - AIPane: 12 → 8、role label 9 → 7
   - PaneInputBar: 13 → 8

## tsc 状態
**0 エラー** (`c5657834` 以降ずっと維持)
- exclude: `chelly/**`, `components/chat/ChatHeader.tsx`, `hooks/use-ai-dispatch.ts`
- modules/* は `@ts-expect-error` で expo-modules-core 型解決問題を抑制

## ビルド履歴 (最終 4つ)
| Build run | コミット | 主な内容 | 結果 |
|---|---|---|---|
| `24306342668` | `4469bc10` | フォント縮小 | ✅ success |
| `24306643832` | `03850438` | Cerebras + pill + dashboard polish | ✅ success |
| `24307015878` | `f1baf507` | Preview ペイン化 + teamMembers | ✅ success |
| `24307305265` | `97681669` | AgentMenu 起動トリガー + Preview close 修正 | 🔄 in_progress |

## 既知問題（次セッション）
1. **`~/.bashrc` 古い PS1** — `BASHRC_VERSION 13 → 14` を入れたので次回起動で自動再生成される **はず** (実機検証必要)
2. **古い APK で動作確認したユーザーは `~/.bashrc_version` ファイルが残っている** — `BASHRC_VERSION` チェックは `_version.toInt() < BASHRC_VERSION` で動くので 13 < 14 で再生成 OK
3. **LocalLLM (llama.cpp) は未バンドル** — Cerebras 優先のフォールバック順なので影響少ないが、Local LLM デフォルト派には未対応

## 次セッションの最優先 (in priority order)
1. **最新ビルド (`24307305265` または後続) の APK で実機検証**
   - フォント縮小の見え方
   - Preview ペインが実際に動くか
   - AgentMenu からの agent 切替（Cerebras 含む）が動くか
   - Enter / コピペ / BackSpace の継続検証（再発していないか）
   - PS1 が新しい単純版になっているか（OSC 133 が消えているか）
2. **Local LLM デフォルト派対応** — `lib/llama-server` 起動 + AIPane で local 選択時のセットアップガイド
3. **`hooks/use-ai-dispatch.ts` (1500行) の物理削除** — Chelly OSS 切り出しと同時にやる
4. **Z Fold6 ヒンジ折り畳みハードウェアでのレイアウト自動切替の実機検証**

## 削除済みファイル
- `components/terminal/MockClaudeSession.tsx`
- `components/terminal/ClaudeActionBlock.tsx`
- `components/multi-pane/LayoutPresetBar.tsx`

## このセッションの教訓
- IME composing キャッシュは PTY echo と非同期、自前で持つと必ず drift する → 持たない
- 「修正したのに直らない」時は **キャッシュファイル (`.bashrc`)** を疑え。バージョン管理は最初から仕込む
- 死コード (`agentMenuVisible` のようなトリガーなしの state) は気づかれにくい。**実装したら必ずトリガーまで配線**
- マルチペイン UI は **「ペインタイプの切替」と「ペイン内 agent の切替」を別の UI** にすべき。pane-type pill と agent badge の二段構えで両立
