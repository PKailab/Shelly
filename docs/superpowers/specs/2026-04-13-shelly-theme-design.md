# "Shelly" テーマプリセット — モック完全一致設計

**作成日**: 2026-04-13
**ステータス**: レビュー待ち
**スコープ**: モック画像 `docs/images/mock-1..5.jpg` と完全一致するテーマプリセット "Shelly" を追加し、デフォルトにする。既存の silkscreen / pixel / mono プリセットは現状維持。機能・レイアウトは一切変更しない。

---

## 目的

現在 Shelly は複数のフォント / 色プリセット(silkscreen / pixel / mono)を持ち、ユーザー設定 `settings.uiFont` から切り替えられる。これを拡張し、**モック画像と完全一致する "Shelly" プリセット**を追加して**新しいデフォルト**にする。

完全一致の意味:

- モック画像の **全テキストの色** がモックとピクセル単位で等価
- モック画像の **全フォント** がモックと等価(非等幅 Silkscreen をターミナル含む全箇所に)
- モック画像の **ネオン発光** が同強度
- モック画像の **バッジ色・ボーダー色・背景色** も全て同じ

---

## 非スコープ

以下には **一切手を加えない**:

- レイアウト(ペイン構造・ヘッダー構造・フッター構造)
- 機能追加・機能削除
- コンポーネントの配置
- ボタン・FAB・メニューの位置
- タブ・アイコン群の動作
- ネイティブ描画(TerminalView)のレンダリング方式
- **PTY セッション**(再起動させない、作業中の vim/tmux/claude を殺さない)

やるのは **色・フォントトークンの差し替えだけ**。

---

## モック色辞書(完全抽出)

### 背景階層

| トークン | HEX | 用途 |
|---|---|---|
| `bg.deep` | `#0A0A0A` | 画面最深部、ペイン内容領域 |
| `bg.surface` | `#111111` | カード・ブロック本体 |
| `bg.sidebar` | `#0D0D0D` | Sidebar / AgentBar / ContextBar |
| `bg.panel` | `#1A1A1A` | READ / EDIT ブロックの塗り |
| `bg.hover` | `#151515` | ホバー/フォーカス時 |

### ボーダー階層

| トークン | HEX | 用途 |
|---|---|---|
| `border.subtle` | `#1C1C1C` | 標準ボーダー |
| `border.strong` | `#2A2A2A` | セクションヘッダー下 |
| `border.accent` | `rgba(0,212,170,0.35)` | active 要素のボーダー |

### Accent パレット(8 色)

| トークン | HEX | 抽出元(モック) |
|---|---|---|
| `accent.teal` | `#00D4AA` | `CLAUDE` active タブ、`~$` プロンプト、`SHELLY` active、`READING TERMINAL` バッジ、`ACCEPT` 緑、`$` prompt |
| `accent.green` | `#4ADE80` | `+` diff 行、`LINKED` badge、`:3000` 緑ドット、`(main)` git branch |
| `accent.blue` | `#60A5FA` | `YOU` ラベル、folder/file アイコン、DEVICE アイコン、`APP/` ls-dir |
| `accent.sky` | `#38BDF8` | `COMPONENTS/` ls-dir、ポート `:8081 EXPO` |
| `accent.purple` | `#A78BFA` | `IMPORT`/`FROM`/`USESTATE` キーワード、`CLAUDE` ラベル |
| `accent.pink` | `#EC4899` | 文字列リテラル `'REACT'` `'REACT-NATIVE'` |
| `accent.amber` | `#F59E0B` | `⚠ BASH:` warning、`EDIT` 黄ドット、`ALLOW` ボタン、`RUNNING` バッジ |
| `accent.red` | `#F87171` | `-` diff 行、`README.MD` 赤 |

### Text 階層

| トークン | HEX | 用途 |
|---|---|---|
| `text.primary` | `#E5E7EB` | 主テキスト(SHELLY, NACRE, ファイル名) |
| `text.secondary` | `#9CA3AF` | サブ(version, date, ls サブ列) |
| `text.muted` | `#6B7280` | 極淡(section label, tagline, tip) |
| `text.disabled` | `#374151` | 無効状態 |

### Semantic

| トークン | HEX | 用途 |
|---|---|---|
| `semantic.add.bg` | `rgba(74,222,128,0.12)` | `+` diff 行の塗り |
| `semantic.add.fg` | `#4ADE80` | `+` diff 行の文字 |
| `semantic.remove.bg` | `rgba(248,113,113,0.12)` | `-` diff 行の塗り |
| `semantic.remove.fg` | `#F87171` | `-` diff 行の文字 |
| `semantic.warn.bg` | `rgba(245,158,11,0.10)` | warning ブロックの塗り |
| `semantic.warn.fg` | `#F59E0B` | warning 文字 |
| `semantic.allow.bg` | `rgba(245,158,11,0.18)` | `ALLOW` ボタン塗り |
| `semantic.allow.fg` | `#F59E0B` | `ALLOW` 文字 |
| `semantic.deny.bg` | `#111111` | `DENY` ボタン塗り(通常) |
| `semantic.deny.fg` | `#6B7280` | `DENY` 文字 |

### Badge

| トークン | bg / border / fg | 用途 |
|---|---|---|
| `badge.running` | `rgba(245,158,11,0.15)` / `rgba(245,158,11,0.4)` / `#F59E0B` | `RUNNING` |
| `badge.linked` | `rgba(74,222,128,0.15)` / `rgba(74,222,128,0.4)` / `#4ADE80` | `LINKED` |
| `badge.connect` | `#111111` / `#2A2A2A` / `#6B7280` | `CONNECT`(未接続) |
| `badge.version` | `rgba(0,212,170,0.12)` / `rgba(0,212,170,0.35)` / `#00D4AA` | `V4.2` |

### Neon Glow (textShadow)

| 用途 | color | radius |
|---|---|---|
| teal accent | `rgba(0,212,170,0.95)` | `10` |
| blue (YOU) | `rgba(96,165,250,0.85)` | `8` |
| purple (CLAUDE/keywords) | `rgba(167,139,250,0.75)` | `7` |
| pink (strings) | `rgba(236,72,153,0.65)` | `6` |
| green (+ diff) | `rgba(74,222,128,0.75)` | `6` |
| red (- diff) | `rgba(248,113,113,0.75)` | `6` |
| amber (warn) | `rgba(245,158,11,0.75)` | `7` |
| sky (ports) | `rgba(56,189,248,0.70)` | `6` |

---

## フォント

### フォント特定

モック画像を拡大解析した結果:

- **全テキスト** が同一フォント
- **非等幅**(`ls -la` の数値列が揺れている)
- **ドット密度 / ベースライン** が **Silkscreen Regular** と完全一致
- `@expo-google-fonts/silkscreen` に収録、Shelly に既に同梱済み(`32KB .ttf`)

**結論**: フォントは Silkscreen を使う。追加フォント導入不要。

### フォント適用範囲

"Shelly" プリセット選択時に以下の全箇所で Silkscreen を使う:

1. React Native `<Text>` コンポーネント全て(UI 全体)
2. React Native `<TextInput>`(入力欄)
3. ネイティブ `ShellyTerminalView` の PTY 描画(既に 82102414 で対応済、`silkscreen` 文字列を渡す)
4. NativeWind `className="font-mono"` などの Tailwind ユーティリティ(既に a36d51ab の tailwind.config 修正で対応済)

### 注意: 非等幅によるターミナル列ズレ

Silkscreen は非等幅なので `ls -la` の縦列が完全一致しない。**モックもそうなっている**ので、**これはバグでなく意図的な見た目**。モック準拠という目的上、等幅化は行わない。

他のプリセット(mono)を選べば等幅フォントに戻せる(既に実装済み)。

---

## プリセット UX

既存の `Settings → Display → Font` セグメントコントロールを拡張:

| 値 | ラベル | フォント | 色パレット | 備考 |
|---|---|---|---|---|
| `shelly` | **Shelly** | Silkscreen | モック完全一致(本 spec) | **デフォルト** |
| `silkscreen` | `Silk` | Silkscreen | 現行パレット | 既存 |
| `pixel` | `8bit` | PressStart2P | 現行パレット | 既存 |
| `mono` | `Mono` | system monospace | 現行パレット | 既存 |

デフォルトは `shelly`。新規ユーザー初回起動、既存ユーザー(`settings.uiFont` が `silkscreen` で保存されている場合)はそのまま現行表示を維持する。

---

## 実装方針

### ランタイム切替 — PTY を殺さない

**PTY セッションは維持したい**(作業中の vim/tmux/claude が消えたら致命的)。つまり**アプリ再起動 NG**。

React Native の `import { colors as C } from '@/theme.config'` は全ファイルで静的 import されている。これを 100+ ファイル書き換えずにランタイム切替する方法:

#### 設計: mutable colors object + version bump

1. `theme.config.ts` で `colors` を **mutable な object として export**
2. プリセット切替時に `Object.assign(colors, newPalette)` でフィールドを上書き
3. Zustand の **theme version store** を 1 つ作り、切替時に version を bump
4. コンポーネントツリーのルート(`ShellLayout`)で `useThemeVersion()` を subscribe
5. version 変更で `ShellLayout` が再レンダー → 全子孫が新しい `colors.xxx` を読み込む
6. PTY / ネイティブモジュールは影響なし(JS の style だけ再計算)

```ts
// theme.config.ts
export const colors: Palette = { ...shellyPalette };  // mutable export

export function applyThemePreset(id: ThemePresetId) {
  Object.assign(colors, themePresets[id].colors);
  useThemeVersionStore.getState().bumpVersion();
  // Also re-inject native Text defaultProps.style.fontFamily
  (Text as any).defaultProps.style = {
    ...((Text as any).defaultProps?.style || {}),
    fontFamily: themePresets[id].font,
  };
}
```

```ts
// store/theme-version-store.ts
export const useThemeVersionStore = create<{ version: number; bumpVersion: () => void }>((set) => ({
  version: 0,
  bumpVersion: () => set((s) => ({ version: s.version + 1 })),
}));
```

```tsx
// ShellLayout.tsx root
const version = useThemeVersionStore(s => s.version);
return <View key={`theme-${version}`} style={styles.root}>…</View>;
```

#### ネイティブ TerminalView への反映

`ShellyTerminalView` は `fontFamily` prop を受け取って native 側で Typeface を切り替える(既存実装済)。`TerminalPane` から `settings.uiFont` に応じて `'silkscreen'` / `'jetbrains-mono'` / `'pixel-mplus'` を渡せばよい(既に 82102414 で配線済)。

また `colorScheme` prop も同様に `settings.uiFont` に応じて変更する。Shelly プリセットの colorScheme を新規追加する:

```ts
// lib/theme-to-terminal-colors.ts
export function presetToTerminalColors(id: ThemePresetId): TerminalColorScheme {
  switch (id) {
    case 'shelly': return shellyTerminalColors; // 本 spec の色から生成
    case 'silkscreen': return existingTerminalColors;
    // ...
  }
}
```

これで PTY の ANSI カラー(ls -la の directory 青、file 白、等)もモック準拠になる。

---

## 実装単位(ファイル別変更)

### 新規ファイル

1. **`lib/theme-presets.ts`** — `shellyPalette`、`themePresets` map、`applyThemePreset(id)` 関数
2. **`store/theme-version-store.ts`** — 1 フィールド版 Zustand store

### 変更ファイル

3. **`theme.config.ts`** — `colors` を mutable export に変更、既存の静的値を `shellyPalette` として `lib/theme-presets.ts` に移動
4. **`store/types.ts`** — `uiFont: 'shelly' | 'silkscreen' | 'pixel' | 'mono'`
5. **`store/settings-store.ts`** — デフォルト `'shelly'`
6. **`app/_layout.tsx`** — 起動時 `applyThemePreset(settings.uiFont ?? 'shelly')`、`settings.uiFont` 変更を watch して `applyThemePreset` 呼び出し
7. **`components/layout/ShellLayout.tsx`** — `useThemeVersion` を subscribe、`key={themeVersion}` でルート View を強制再マウント
8. **`components/layout/SettingsDropdown.tsx`** — Font セグメントに **`Shelly`** オプション(最左)
9. **`components/panes/TerminalPane.tsx`** — ネイティブ TerminalView に渡す `fontFamily` と `colorScheme` を `settings.uiFont` から決定
10. **`lib/theme-to-terminal-colors.ts`** — `presetToTerminalColors(id)` を export
11. **`lib/neon-glow.ts`** — プリセット別の glow 定数を生成する関数追加

### 変更しないファイル

100+ 個の `import { colors as C } from '@/theme.config'` を書いているコンポーネント — **一切触らない**。mutable export なので参照は同じ object、値だけ差し替わる。

---

## 検証方法

1. 新規インストール後、起動 → **デフォルトで Shelly プリセット**で描画される
2. モック画像 `mock-1` と実機スクショを並べて比較
3. 以下を確認:
   - 背景 3 階層(`bg.deep` / `bg.surface` / `bg.sidebar`)
   - `~$` / `SHELLY` / `CLAUDE タブ` の teal ネオン
   - `YOU` の青、`CLAUDE` の紫、string の pink
   - `+` / `-` diff の緑/赤
   - `RUNNING` / `LINKED` / `CONNECT` バッジ
   - `ALLOW` / `DENY` 琥珀
   - folder/file icon が blue
   - ls -la の directory が sky、`APR 7` が muted
   - ネオン glow が `radius 7-10` で発光
   - フォントが Silkscreen(非等幅、ドット状)
4. `Settings → Display → Font` を `Silk` に切替 → **Shelly アプリ全体の色とフォントが切替え直される** / **PTY セッションは生きたまま** / **ターミナル作業内容(履歴・プロンプト)が消えない**
5. `Shelly` に戻す → モック準拠に戻る
6. `8bit` / `Mono` も同様に切替確認、既存の見た目が壊れていないか確認

---

## リスク

| リスク | 緩和 |
|---|---|
| `colors` を mutable にすると既存の const 想定と不整合 | object の identity は保持、field だけ上書き |
| `Text.defaultProps.style` の再設定が古い Text インスタンスに伝播しない | `key={version}` でルート再マウント、保険付き |
| ネイティブ TerminalView が prop 変更を拾わない | 既存の `fontFamily` prop は native side で watch 済み、`clearCache()` + `setTypeface()` で切替可能 |
| Silkscreen の非等幅でターミナル列が崩れて怒られる | spec に明記。不満なら `mono` プリセットに切替可能 |
| Zustand の version bump で重い再レンダーが走る | key による強制 unmount は重いので、通常の subscribe だけでも視覚的にほぼ同等 |

---

## 未決定

なし(ユーザー合意済み)

---

## 次のステップ

1. ユーザーに本 spec を確認してもらい承認を得る
2. 承認後 `writing-plans` skill で実装プランを作成
3. 実装プランに沿って実装
4. 実機で検証、モック画像と並べて比較
