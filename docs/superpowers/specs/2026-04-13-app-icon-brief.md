# Shelly App Icon — Brief for AI image gen

## Goal

1024×1024 の Android adaptive icon foreground 用画像。
背景は別レイヤで単色 (`#0A0A0A`) を使うので、透過 PNG で foreground のみ。

## Visual direction

シェル (貝殻) のシルエット + teal neon glow。"Shelly" の由来は
「shell」(UNIX シェル & 貝殻のダブルミーニング)。

**色**:
- primary: `#00D4AA` (teal accent, mock 通り)
- background-fade: `#0D0D0D` → `#0A0A0A`

**形**:
- 巻き貝もしくは 2 枚貝、どちらでも良い
- シルエット + 縁に teal neon glow (外側 radius 10 px)
- 内側に薄い scanline texture (CRT 風、控えめ)
- 下にターミナル `_` カーソルを 1 個

## Gemini 2.0 Flash プロンプト (AI Studio)

```
Create a 1024x1024 app icon for a mobile terminal IDE called "Shelly".
- Dark background (#0A0A0A)
- Centered silhouette of a seashell (nautilus or scallop), glowing teal neon edge (#00D4AA)
- A small blinking terminal cursor "_" below the shell in the same teal color
- Subtle horizontal CRT scanlines overlaying the shell, very low contrast
- No text, no logo, no watermark
- Android adaptive icon safe zone: main content must fit within the center 66% circle
- Output: transparent PNG, 1024x1024, foreground only (background will be solid dark in app)
```

## 配置

完成後:
- `assets/icon.png` — main 1024×1024
- `assets/adaptive-icon.png` — foreground layer
- `app.config.ts` の `expo.icon` / `expo.android.adaptiveIcon` を参照

## 検証

- Android ホーム長押し → アプリ一覧で周辺アプリと比較
- Material Theme の円形マスク・四角マスク・しずく型マスクすべてで violate しないか
- dark / light ランチャーテーマ両方で視認性
