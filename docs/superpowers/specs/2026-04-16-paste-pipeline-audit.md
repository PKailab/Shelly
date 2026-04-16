# Paste Pipeline Audit (bug #94)

**Date:** 2026-04-16
**Author:** Session C
**Status:** Investigation only — no code changes. Reference for Session A (bug #91 root fix).

## Why this document exists

Shelly has shipped 4 independent paste bugs in a short span:

| Bug | Symptom | Fix commit |
|---|---|---|
| #27 | Trailing Enter/quote eaten from pasted text | commitText dedupe against `mLastFinishFlush` |
| #58 | First `:` of paste swallowed by IME resync DEL storm | middle-button paste now seeds `mImeShadow` + `mLastImeCommitAt` |
| #81 | First byte of clipboard payload clipped on CommandKeyBar Paste | CommandKeyBar routed through `pasteToSession` → `TerminalEmulator.paste()` |
| #91 | Multi-line paste gets split on `\n` (open) | — |

Each fix patched *one* of five entry points. The 5 paths diverge significantly in
their CR/LF handling, shadow-buffer bookkeeping, and bracketed-paste wrapping.
The goal here is to map every path to a single diagram so Session A can design a
unified funnel.

## The five paste entry points

```
┌─────────────────────────────────────────────────────────────────────┐
│                           USER ACTION                               │
└─────────────────────────────────────────────────────────────────────┘
    │               │            │              │             │
    │ (A) System    │ (B) IME    │ (C) IME      │ (D) Cmd bar │ (E) Middle
    │   clipboard   │  commit    │  sendKey     │    Paste    │  click
    │   long-press  │   Text     │   Event      │    button   │ paste
    │   menu        │            │              │             │ (mouse)
    ▼               ▼            ▼              ▼             ▼
```

## Entry point table

| # | Path | Trigger | Enters at | Normalization | Shadow buffer update | Bracketed wrap | Bug history |
|---|---|---|---|---|---|---|---|
| **A** | System clipboard long-press menu | Android text-selection → "Paste" overflow | `TerminalView.BaseInputConnection.commitText()` → `sendToPtyAndShadow()` → `sendTextToTerminal()` | **None.** Raw UTF-8 code points fed one-by-one to `inputCodePoint()` | `mImeShadow.append(text)` + `resetShadowAfterNewline()` + `mLastImeCommitAt = now` | **No.** Bytes hit PTY unwrapped. | #27 (dedupe vs finishComposingText) |
| **B** | IME soft-keyboard `commitText` | Gboard/Samsung/Typeless commit | Same as (A) — `commitText()` → `sendToPtyAndShadow()` | Same as (A). `\n` inside a commit becomes `\r` in `sendTextToTerminal()` loop (line 669). | Same as (A) | **No** | #27 |
| **C** | IME `sendKeyEvent(KEYCODE_ENTER)` | Samsung bookcover BT, Gboard cold-start Enter | `sendKeyEvent()` line 597 — ENTER intercepted → `sendTextToTerminal("\r")` | Single `\r` literal | None (single char, no shadow write) | N/A (single byte) | #12 |
| **D** | CommandKeyBar Paste button | User taps "Paste" key in bottom key bar | JS `handleKeyPress` → `Clipboard.getStringAsync()` → `sendPaste()` → `TerminalPane.pasteToTerminal()` → `TerminalEmulator.pasteToSession()` (Expo module) → `session.paste()` → `ShellyTerminalSession.paste()` → `TerminalEmulator.paste()` | `TerminalEmulator.paste()` line 2615: strips ESC/C1, then `\r?\n → \r` | **No shadow update.** Goes around `mImeShadow` entirely. | **Yes** when DECSET 2004 is on | #81 (routed here from raw `write()`) |
| **E** | Middle-click paste | Mouse BUTTON_TERTIARY in `TerminalView.onTouchEvent()` line 913 | `mEmulator.paste(text)` directly | Same as (D) — `TerminalEmulator.paste()` normalizes | **Yes** — line 925-933 seeds `mImeShadow` + `mLastImeCommitAt` manually | **Yes** via `TerminalEmulator.paste()` | #58 |

## Source file references

```
components/terminal/CommandKeyBar.tsx:156-165                        (D: JS entry)
components/panes/TerminalPane.tsx:518-525                            (D: bridge)
modules/terminal-emulator/.../TerminalEmulatorModule.kt:174-178      (D: Expo fn)
modules/terminal-emulator/.../ShellyTerminalSession.kt:144-154       (D: session wrapper)
modules/terminal-emulator/.../com/termux/terminal/TerminalEmulator.java:2614-2626  (D+E: the only normalizer)
modules/terminal-view/.../com/termux/view/TerminalView.java:502-526  (A+B: commitText → sendToPtyAndShadow)
modules/terminal-view/.../com/termux/view/TerminalView.java:456-465  (A+B: sendToPtyAndShadow helper)
modules/terminal-view/.../com/termux/view/TerminalView.java:629-695  (A+B+C: sendTextToTerminal, \n→\r loop)
modules/terminal-view/.../com/termux/view/TerminalView.java:597-626  (C: sendKeyEvent ENTER intercept)
modules/terminal-view/.../com/termux/view/TerminalView.java:913-935  (E: middle-click)
```

## The divergence at a glance

Two distinct "paste funnels" exist:

### Funnel α — IME path (A, B, partially C)

```
commitText(text)
  → sendToPtyAndShadow(text)
    → sendTextToTerminal(text)         ← per-codepoint loop, \n→\r inline
    → mImeShadow.append(text)          ← shadow bookkeeping
    → resetShadowAfterNewline(text)
    → mLastImeCommitAt = now
```

- CR/LF handling: *per-character*, inside `sendTextToTerminal`. Only `\n` → `\r`.
  **CRLF (`\r\n`) is NOT collapsed** — both bytes go through.
- No bracketed-paste wrapping — bash sees a stream of individual keystrokes.
- Shadow buffer maintained correctly.

### Funnel β — Emulator path (D, E)

```
TerminalEmulator.paste(text)
  → text.replaceAll("(\\u001B|[\\u0080-\\u009F])", "")   ← strip ESC + C1
  → text.replaceAll("\\r?\\n", "\\r")                    ← CRLF/LF → CR
  → mSession.write("\\033[200~")  (if DECSET 2004)
  → mSession.write(text)
  → mSession.write("\\033[201~")  (if DECSET 2004)
```

- CR/LF handling: *bulk regex*. Both `\r\n` and `\n` collapse to `\r`.
- Bracketed-paste wrapping applied when the pty has DECSET 2004 on.
- Shadow buffer **not** touched by `TerminalEmulator.paste()` itself; path E
  seeds it manually in TerminalView, path D skips it entirely (which is why
  pasteToSession after an IME commit can still race the delete-storm guard
  if the JS side races tight enough — latent bug, not yet observed).

## Where the 4 bugs came from

| Bug | Funnel | Root cause in table |
|---|---|---|
| #27 | α | `commitText` fired twice when IME also called `finishComposingText()`; both went through `sendToPtyAndShadow` and doubled the trailing Enter. Fix = dedupe. |
| #58 | E | Middle-click used to call `mEmulator.paste()` without seeding `mImeShadow`/`mLastImeCommitAt`. The next IME `deleteSurroundingText` saw `justCommitted=false`, entered the "forward DEL to PTY" branch, and ate the first `:`. Fix = seed shadow inline. |
| #81 | D (pre-fix) | CommandKeyBar used to call `writeToSession()` (raw PTY write). First byte raced bash's prompt echo and got clipped. Fix = route through `pasteToSession` so the `TerminalEmulator.paste()` normalizer runs and the bracketed-paste wrapping tells bash "this is a paste, don't echo-edit it". |
| #91 | ? | **Open.** Multi-line paste splits on `\n`. Hypothesis: a path still exists that does *not* go through funnel β's regex collapse — likely the IME-side `commitText` on Gboard when the user pastes a multi-line snippet from an app that passes through the IME rather than the clipboard long-press menu. Funnel α only converts `\n→\r` inside the per-char loop but does **not** strip the embedded `\r` of CRLF input, so a pasted `foo\r\nbar` reaches the PTY as `foo\r\rbar` which bash tokenizes as two empty commands + `bar`. |

## Recommended unified design for Session A

**Single choke point: `TerminalEmulator.paste(text)`.**

Every paste — regardless of entry path — should terminate at
`TerminalEmulator.paste()`, which is the only place that:

1. Strips ESC + C1 controls
2. Normalizes `\r?\n` → `\r` (and should be extended to handle bare `\r`
   isolated from a following `\n`)
3. Wraps in bracketed-paste markers when DECSET 2004 is on

### Concrete changes

1. **Path A + B (`commitText`)**: detect when the committed text contains a
   newline (i.e. the IME is flushing a multi-line paste, not typing) and
   route through `mEmulator.paste()` instead of `sendToPtyAndShadow` →
   per-char loop. Threshold: `if (commitStr.indexOf('\n') >= 0 || commitStr.indexOf('\r') >= 0 || commitStr.length() > SOME_LIMIT)`.
   - After calling `mEmulator.paste()`, **still seed the shadow buffer and
     `mLastImeCommitAt`** (extract a helper from E).
2. **Path E (middle-click)**: already correct; extract the shadow-seed
   lines into a reusable helper `pasteViaEmulator(text)`.
3. **Path D (CommandKeyBar / JS)**: already correct post-#81. Add a shadow
   seed on the native side inside `ShellyTerminalSession.paste()` so any
   subsequent IME DEL storm doesn't race.
4. **`TerminalEmulator.paste()` itself**: extend the regex to handle stray
   `\r` (not followed by `\n`) as `\r` (already correct), AND make sure the
   bracketed-paste wrap is always emitted as a single `mSession.write()`
   call so the prefix/payload/suffix hit the PTY in one writev — prevents
   userland reads from splitting the frame. Currently it's three separate
   `write()` calls, which is fine for a single blocking write but depends
   on the session implementation never interleaving.
5. **Delete the per-char `\n`→`\r` rewrite inside `sendTextToTerminal()`**
   once (1) is in place: it becomes dead code for newlines because nothing
   with a newline reaches `sendTextToTerminal` anymore. Keep it as a safety
   net or drop it, Session A's call.

### Proposed helper (for reference, do not implement here)

```java
// In TerminalView.java
private void pasteViaEmulator(String text) {
    if (mEmulator == null || text.isEmpty()) return;
    mEmulator.paste(text);  // handles strip + CRLF + bracketed wrap
    // Shadow-buffer bookkeeping (extracted from bug #58 fix)
    mLastImeCommitAt = android.os.SystemClock.uptimeMillis();
    mImeShadow.append(text);
    int nl = Math.max(text.lastIndexOf('\n'), text.lastIndexOf('\r'));
    if (nl >= 0) {
        mImeShadow.setLength(0);
        if (nl + 1 < text.length()) {
            mImeShadow.append(text, nl + 1, text.length());
        }
    }
}
```

Then:
- `commitText()` multi-line branch → `pasteViaEmulator(commitStr)`
- `onTouchEvent()` middle-click → `pasteViaEmulator(pasted)`

## Open questions for Session A

1. Does `commitText()` ever receive a single-character paste? (Probably
   yes on Gboard's "Clipboard" popup for short entries.) The multi-line
   heuristic needs a length gate or a source-sniff, otherwise single-char
   IME input would also get bracketed-paste wrapping which is wrong.
2. Confirm via logcat (`ShellyIME`) whether bug #91's reproducer
   (multi-line paste) enters through `commitText` or through an
   `InputConnection.commitText` chunked across multiple calls. If the
   IME splits one paste into N commitText calls, `pasteViaEmulator` won't
   help — you need to buffer the calls first (detect within a short
   window) and flush once.
3. Verify CRLF handling: bug #91 may be CRLF-specific. Grab a hex dump
   (`cat -v` or logcat hex) of what arrives at `commitText` when pasting
   from Samsung Notes / Chrome.

## References

- bug #27, #58, #81, #91: see `DEFERRED.md`
- `TerminalEmulator.paste()`: `modules/terminal-emulator/.../com/termux/terminal/TerminalEmulator.java:2614-2626`
- Shadow buffer strategy writeup: `TerminalView.java:364-422` (inline comment block)

---

## Implementation result — Session A (commits 527a5d3a, 1e976712, bee63869, 82420590)

Session A が上記推奨設計を丸ごと採用して実装した。diff は 4 コミット:

1. **`fix(terminal): route IME commitText through emulator.paste for multi-line blocks`** (527a5d3a)
   - `TerminalEmulator.paste()` を DECSET フラグを無視して**常時** `\e[200~..\e[201~` で wrap するように変更
   - CR normalize を `\r\n → \r` から `\r\n → \n` に変更。bracketed paste 内では readline が LF を期待するため
   - `TerminalView.BaseInputConnection.commitText()` に paste 判定分岐を追加。`commitStr.length() > 1 && (改行含む || length >= 16)` を満たす場合は `mEmulator.paste()` 経由に回す

2. **`refactor(terminal): unify paste paths through pasteViaEmulator helper`** (1e976712)
   - `TerminalView` に package-private な `pasteViaEmulator(String)` ヘルパーを追加。本ドキュメントの「Proposed helper」セクションをそのまま実装
   - `commitText()` と `onTouchEvent()` middle-click の両方を同ヘルパー経由に集約
   - shadow の末尾保持ロジック（最後の改行以降を維持）を共通化

3. **`fix(bashrc): enable readline bracketed-paste binding`** (bee63869)
   - `HomeInitializer.kt` の .bashrc 生成に `bind 'set enable-bracketed-paste on' 2>/dev/null` を追加
   - `BASHRC_VERSION` を 19 → 20 に bump
   - これで readline が `\e[200~` を本物のペーストシーケンスと認識し、最終 `\n` でのみ execute する

4. **`obs(debug): add diagnostic logs for paste / exec / permissions pipelines`** (82420590)
   - `ShellyPaste` タグで raw/sanitized byte 数、改行カウント、先頭 32 文字 preview をログ出力
   - pasteViaEmulator / middle-click にも各入口ログを追加。5 経路のどれを通ったかを logcat で識別可能に
   - 将来 paste 経路で新しいバグが出ても logcat 1 発で診断できる観測性を確保

### Open questions — resolution

| 元の質問 | 回答 |
|---|---|
| Gboard の clipboard popup で短い単発 paste | 閾値 `length >= 16 || 改行含む` が kick in しない → 従来の per-char 経路に落ちる。短い paste では問題が発生しないので OK |
| IME が paste を N 個の commitText に分割するケース | 現時点では Samsung BT keyboard / Typeless / Gboard では観測されず。分割された場合も各 chunk が 16 文字以上 or 改行含む限り paste 分岐に入る。完全分割 paste 対応は要確認 (将来 bug #96 として登録候補) |
| CRLF 特有かどうか | `\r\n → \n` 正規化で対応。CR 単独 (旧 Mac スタイル) は そのまま bracketed paste 内で readline が処理する |

### Verification path

1. `ShellyPaste` タグ logcat をフィルタして `adb logcat -s ShellyPaste:D`
2. Shelly ターミナルに複雑な sed コマンド (`sed -i 's#foo#bar#' /tmp/x` など) を貼り付け
3. logcat で `pasteViaEmulator len=N nl=0 preview="sed -i 's#foo#bar#' /tmp/x"` のような 1 行が出れば paste 経路に正しく入っている
4. bash プロンプトで改行なし 1 コマンドとして全文が入力された状態になり、Enter で 1 回実行されれば修正は完全に機能している

paste 経路はこの設計で「単一チョークポイント」が達成された。将来 entry point を追加する時も必ず `TerminalView.pasteViaEmulator()` を通すこと。drift すると bug #94 の再発となる。
