# 2026-04-14 セッションハンドオフ

v0.1.0 スモークテスト中のセッションを途中で終了。次セッションへの引き継ぎメモ。

## 最初に読むもの

1. **`docs/superpowers/DEFERRED.md`** — bug #27/#28/#29/#30 が最新。必ず P0 / P1 を確認
2. **`docs/superpowers/specs/2026-04-14-smoke-test-v0.1.0.md`** — スモークテスト進捗
3. この文書

## スモークテスト進捗

| Task | 状態 | 備考 |
|------|------|------|
| 1. Themes | ✅ OK | |
| 2. MCP Servers | ✅ OK | |
| 3. Scheduled agents | N/A | by design |
| 4. SSH Profiles | ✅ OK | Silkscreen 表示バグあり (bug #28) |
| 5. Local LLM | ✅ OK | 自動検出 OK、軽微な status bar overlap |
| 6. Cloud removed | ✅ OK | |
| 7. Ports monitor | ⏭ スキップ | bug #27 (ペースト + Enter 不発) でブロック |
| 8.1 Terminal pane | ✅ OK | タイプ経路のみ |
| 8.2 AI pane | ✅ OK | 応答 OK、表示 bug #28 |
| 8.3 Browser pane | ❌ NG | bug #29 で詰まる → 修正 part 1 済、実機未検証 |
| 8.4-8.8 | 未実施 | bug #29 解消後に継続 |
| 9. AI Edit | 未実施 | |
| 10. tmux immortal | 未実施 | |
| 11. Voice | 未実施 (optional) | |

## 次セッション冒頭でやること

1. 本セッションの最後のコミットを確認
   ```bash
   cd ~/Shelly && git log --oneline -5
   ```
2. APK がビルド済なら実機にインストール
3. **Task 8.3 Browser pane を再テスト** — Add Pane → Browser が反映されるか
4. 反映されれば 8.4-8.8 を一気に通す
5. 反映されなければ bug #29 part 2 (`splitPane` の `makeLeaf` 経由の leaf 再生成問題) を調査

## 今セッションで修正した内容

### bug #29 part 1 — AddPaneSheet の stale focusedPaneId

**ファイル**: `components/multi-pane/AddPaneSheet.tsx`

**変更**:
- `focusedPaneId` がツリーに存在するか `leafExists(root, id)` で検証
- 存在しなければ `findLastLeafId(root)` にフォールバック
- `findFirstLeafId` → `findLastLeafId` にリネーム (右側の子を優先探索)

**根本原因**:
`splitPane` は `makeLeaf(...)` で新 ID の leaf を 2 つ作り、元 leaf を置き換えるため、分割後の `focusedPaneId` はツリーに存在しない ID を指すようになる。2 回目以降の `splitPane(staleId, ...)` は `findNode(root, staleId) === null` で silent fail → `replaceNode` もマッチしないため root が変わらない。

### 変更なし (次セッション持ち越し)

- bug #27: ペースト + Enter
- bug #28: UI 全面 Silkscreen 置換
- bug #29 part 2: `splitPane` の `makeLeaf` 経由 leaf state 喪失
- bug #30: splitter drag 不発

## 調査メモ

### splitPane の挙動 (use-multi-pane.ts:225)

```js
splitPane: (leafId, direction, newTab) => {
  const oldLeaf = makeLeaf(f.node.tab);  // ← 新 ID の leaf を作る
  const newLeaf = makeLeaf(newTab);
  const split = makeSplit(direction, oldLeaf, newLeaf);
  const newRoot = replaceNode(cloneTree(root), leafId, split);
  set({ root: newRoot });
}
```

part 2 の修正案: 元 leaf の ID をそのまま保持するか、`oldLeaf = cloneNode(f.node)` にする。
AI ペインや Terminal ペインは leafId に紐付く native state を持つ可能性が高いので、ID 維持が重要。

### splitter drag (bug #30)

`MultiPaneContainer.tsx:99` の `Gesture.Pan()` は `react-native-gesture-handler`。
`GestureHandlerRootView` は `app/_layout.tsx:144` に存在 → 祖先 OK。
`containerSize.current` は `onLayout` で更新される。
drag が効かない原因は未特定。Gesture activation threshold, Modal の上に splitter があるケース, z-index 衝突あたりが要調査。

## 作業推奨順序 (次セッション)

1. **APK インストール** → Task 8.3 実機確認 (10 分)
2. **bug #29 part 1 OK なら** → 8.4-8.8 通し (30 分)
3. **bug #30 splitter drag 調査 + 修正** (60-90 分)
4. **Task 9 AI Edit** (20 分)
5. **Task 10 tmux immortal** (10 分)
6. **bug #27 / #28 の根本修正** — 最後にまとめて (3-4 時間)
7. **全 APK リビルド + 最終スモークテスト** (60 分)
8. **v0.1.0 タグ打ち + リリース** (30 分)

## 備考

- ワイヤレス ADB は接続可能 (`192.168.3.5:38977`)
- adb logcat は `--pid=$(adb shell pidof dev.shelly.terminal)` で絞るのが高速
- スクショは `~/storage/dcim/Screenshots/` に保存
