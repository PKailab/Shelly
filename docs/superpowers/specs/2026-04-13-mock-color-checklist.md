# Mock Color Parity Checklist — Section 2 of validation

実機で Shelly preset を active にした状態で、以下 16 箇所の色をモック画像
(`docs/images/mock-1..5.jpg`) と 1:1 で突き合わせる。致命度 ★★★ が NG なら
`lib/theme-presets.ts` の `shellyPalette` を直す。

画面キャプチャは**同じピクセル間隔**で比較する — `adb exec-out screencap -p > shot.png`
をモック画像の同サイズにリサイズしてから並べて目視。

| # | 場所 | 期待色 (HEX / RGBA) | ソース | 致命度 |
|---|---|---|---|---|
| 2.1 | AI ペイン `YOU` ラベル | `#60A5FA` + blue neon (`rgba(96,165,250,0.85)`, r=8) | `accentBlue` + `neonBlueGlow` | ★★★ |
| 2.2 | AI ペイン `CLAUDE` assistant ラベル | `#A78BFA` + purple neon (`rgba(167,139,250,0.75)`, r=7) | `accentPurple` | ★★★ |
| 2.3 | `+` diff 行文字 + 塗り | `#4ADE80` / `rgba(74,222,128,0.12)` | `addText` / `addBg` | ★★★ |
| 2.4 | `-` diff 行文字 + 塗り | `#F87171` / `rgba(248,113,113,0.12)` | `errorText` / `errorBg` | ★★★ |
| 2.5 | `⚠ BASH:` warning 行 | `#F59E0B` + amber bg (`rgba(245,158,11,0.10)`) | `accentAmber` | ★★ |
| 2.6 | `ALLOW` ボタン | bg `rgba(245,158,11,0.18)` / fg `#F59E0B` | amber allow | ★★ |
| 2.7 | `DENY` ボタン | bg `#111111` / fg `#6B7280` | `bgSurface` / `text3` | ★★ |
| 2.8 | TASKS `RUNNING` バッジ | bg `rgba(245,158,11,0.15)` / fg `#F59E0B` | `badgeRunningBg/Text` | ★★ |
| 2.9 | CLOUD `LINKED` バッジ | bg `rgba(74,222,128,0.15)` / fg `#4ADE80` | `badgeLinkedBg/Text` | ★★ |
| 2.10 | 未接続クラウド `CONNECT` バッジ | bg `#111111` / fg `#6B7280` | `badgeConnectBg/Text` | ★ |
| 2.11 | FileTree folder/file デフォルトアイコン | `#60A5FA` | `accentBlue` via `fileIconColor` | ★★★ |
| 2.12 | FileTree `README.MD` 行 | `#F87171` (アイコン + 文字両方) | `errorText` | ★★★ |
| 2.13 | Ports `:3000 NEXT.JS` ドット | `#4ADE80` | `accentGreen` | ★ |
| 2.14 | Ports `:8081 EXPO` ドット | `#38BDF8` | `accentSky` | ★ |
| 2.15 | Code preview の `import` / `from` / `const` キーワード | `#A78BFA` | `accentPurple` via CodeRenderer | ★★ |
| 2.16 | Code preview の `'react'` 文字列リテラル | `#EC4899` | `accentPink` | ★★ |

## NG 時の直し方

1. 該当トークンを `lib/theme-presets.ts` の `shellyPalette` で特定
2. HEX を spec (`2026-04-13-shelly-theme-design.md`) の値で上書き
3. `theme.config.ts` にも同じ値を seed しているので両方合わせる (静的 import
   不可のため 2 箇所に重複している)
4. `shellyPalette` / `theme.config.ts` の整合は TypeScript では検出できない。
   次回このチェックリストを回した時に差分が出るだけ
5. `npx tsc --noEmit` → commit → build

## スクショ比較コマンド

```bash
# 実機から最新キャプチャ (ワイヤレス ADB 前提)
adb exec-out screencap -p > /tmp/shelly-latest.png

# mock と並べて preview (Termux なら termux-open-url)
termux-open /tmp/shelly-latest.png
termux-open ~/Shelly/docs/images/mock-1.jpg
```
