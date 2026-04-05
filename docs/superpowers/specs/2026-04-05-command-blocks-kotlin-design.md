# Command Blocks Kotlin Canvas (GL) Design Spec

**Date:** 2026-04-05
**Goal:** Render command block boundaries, fold/unfold, exit code badges, and copy affordances natively in the GPU rendering layer. Coexists with the RN BlockList panel for detailed operations.

**Dependency:** GPU Rendering (2026-04-05-gpu-rendering-design.md) must be implemented first. This spec extends `GLTerminalRenderer` and `CellBatcher`.

**Scope:** GL drawing layer only. Existing RN components (`TerminalBlock.tsx`, `BlockList.tsx`) remain unchanged and continue to serve as the detailed operation panel.

---

## Architecture Overview

```
BlockDetector.kt (existing, OSC 133 parser)
  → detects command start/end/exit code
  → pushes BlockRange to GLTerminalRenderer.blockRanges

GLTerminalRenderer.onDrawFrame():
  Pass 1: Background quads (existing)
  Pass 2: Glyph quads (existing)
  Pass 3: Overlays (existing — selection, cursor)
  Pass 4: Block chrome (NEW)
    → Block separator lines
    → Exit code badges
    → Fold/unfold chevrons
    → Copy button hit areas

User taps block chrome → GLTerminalView routes to:
  → Fold/unfold: toggle block visibility in CellBatcher
  → Copy: copy block output to clipboard
  → Long-press: open RN BlockList panel for full operations
```

### Role Split
| Layer | Responsibility |
|-------|---------------|
| GL (this spec) | Visual rendering: separator lines, badges, chevrons, fold animation |
| RN (existing) | Detailed operations: rerun, save snippet, LLM interpretation, diff viewer |

---

## 1. Block Data Model

### BlockRange
```kotlin
data class BlockRange(
    val commandStartRow: Int,     // Row where command prompt starts
    val outputStartRow: Int,      // First row of output (commandStartRow + 1 typically)
    val endRow: Int,              // Last row of output (-1 if still running)
    val exitCode: Int,            // -1 if still running
    val command: String,          // The command text
    val isCollapsed: Boolean,     // Fold state
    val isRunning: Boolean        // True until endRow is set
)
```

### Storage in GLTerminalRenderer
```kotlin
class GLTerminalRenderer : GLSurfaceView.Renderer {
    val blockRanges = mutableListOf<BlockRange>()
    private val blockLock = Any()
    
    fun addBlock(block: BlockRange) {
        synchronized(blockLock) { blockRanges.add(block) }
    }
    
    fun updateBlock(index: Int, update: (BlockRange) -> BlockRange) {
        synchronized(blockLock) { blockRanges[index] = update(blockRanges[index]) }
    }
}
```

### Integration with BlockDetector

`BlockDetector.kt` currently has `onBlockCompleted` as a constructor parameter that receives a `CommandBlock` (text-based, no row numbers). Two changes are needed:

**Change 1:** Add a settable `onBlockStarted` callback to `BlockDetector.kt`:
```kotlin
class BlockDetector(
    private val onBlockCompleted: (block: CommandBlock) -> Unit,
    private val idleTimeoutMs: Long = 2000L
) {
    var onBlockStarted: ((command: String) -> Unit)? = null
    // Fire this when OSC 133;B (command start) is detected
}
```

**Change 2:** In `ShellyTerminalView.kt`, snapshot the emulator's cursor row when BlockDetector fires, since BlockDetector itself has no concept of row positions:

```kotlin
// In ShellyTerminalView.kt
blockDetector.onBlockStarted = { command ->
    val cursorRow = terminalView.currentSession?.emulator?.mCursorRow ?: return@let
    val totalRows = terminalView.topRow + cursorRow  // absolute row in transcript
    glRenderer.addBlock(BlockRange(
        commandStartRow = totalRows, outputStartRow = totalRows + 1,
        endRow = -1, exitCode = -1, command = command,
        isCollapsed = false, isRunning = true
    ))
}

// onBlockCompleted is already a constructor param — wrap it to also update GL
val originalCallback = { block: CommandBlock ->
    // Existing JS event emission (onBlockCompleted → terminal.tsx → addEntryBlock)
    emitBlockCompletedEvent(block)
    // GL update: find the running block and close it
    val cursorRow = terminalView.currentSession?.emulator?.mCursorRow ?: return@let
    val totalRows = terminalView.topRow + cursorRow
    val idx = glRenderer.blockRanges.indexOfLast { it.isRunning }
    if (idx >= 0) {
        glRenderer.updateBlock(idx) { it.copy(endRow = totalRows, exitCode = block.exitCode ?: 0, isRunning = false) }
    }
}
```

---

## 2. GL Drawing — Block Chrome

Added as Pass 4 in `GLTerminalRenderer.onDrawFrame()`, after overlays.

### 2.1 Block Separator Lines
Thin horizontal line between blocks. Drawn as a 1px-height quad spanning the terminal width.

```
Position: Y = blockRange.commandStartRow * cellHeight - 1px
Color: theme.dimForeground at 30% alpha
Width: full terminal width
```

For the currently-running block, use a pulsing accent color (same `u_time` sine wave as selection highlight).

### 2.2 Exit Code Badge
Small colored rectangle at the right edge of the command row.

```
Position: top-right of commandStartRow
Size: 3 cells wide × 1 cell high
Color: 
  - exitCode == 0 → green (#4CAF50) at 80% alpha
  - exitCode != 0 → red (#F44336) at 80% alpha
  - isRunning → accent color, pulsing alpha
Text: "✓" or exit code number (rendered as glyph from atlas)
```

### 2.3 Fold/Unfold Chevron
Small triangle indicator at the left edge of the command row.

```
Position: left margin of commandStartRow (before the prompt)
Size: 1 cell × 1 cell
Glyph: "▶" (collapsed) or "▼" (expanded) from atlas
Color: theme.dimForeground
```

### 2.4 Copy Button
Small icon at the rightmost column. Exit code badge is immediately to its left.

```
Position: rightmost column (terminalCols - 1) of commandStartRow
Size: 1 cell × 1 cell  
Glyph: clipboard icon (Unicode 📋 or custom glyph in atlas)
Color: theme.dimForeground, brightens on hover/press

Layout (right edge): ... | badge (3 cells) | copy (1 cell) |
                          cols-4 to cols-2    col cols-1
```

### Shader
Block chrome uses the existing `glyph_frag.glsl` (for text glyphs like ▶, ✓) and `background_frag.glsl` (for separator lines and badge backgrounds). No new shaders needed.

---

## 3. Fold/Unfold Mechanism

### Collapsed State
When a block is collapsed:
- Output rows (outputStartRow to endRow) are **skipped** in `CellBatcher.updateDirtyRows()`
- Command row shows: `$ command_text ... [▶ 42 lines]`
- The "[42 lines]" count is rendered as dimmed text using the glyph atlas

### Fold Animation (GPU-native)
From GPU rendering spec Section 5.4:
- Collapse: output rows slide up with easing over 200ms
- Expand: rows slide down
- Implemented as per-block Y offset in vertex data during animation
- After animation: vertex buffer rebuilt to final state (skipping/including rows)

### Implementation
```kotlin
class BlockAnimator {
    data class Animation(
        val blockIndex: Int,
        val collapsing: Boolean,
        val startTime: Long,
        val duration: Long = 200L,
        val rowCount: Int
    )
    
    private var active: Animation? = null
    
    fun startCollapse(blockIndex: Int, rowCount: Int)
    fun startExpand(blockIndex: Int, rowCount: Int)
    fun getYOffset(blockIndex: Int): Float  // Returns animated offset for vertex shader
    fun isAnimating(): Boolean
    fun update(): Boolean  // Returns true if still animating (needs requestRender)
}
```

---

## 4. Touch Handling

GLTerminalView intercepts taps on block chrome areas before passing to the terminal emulator.

### Hit Testing
```kotlin
fun onTouchEvent(event: MotionEvent): Boolean {
    if (event.action == MotionEvent.ACTION_UP) {
        val row = (event.y / cellHeight).toInt()
        val col = (event.x / cellWidth).toInt()
        
        val block = findBlockAtRow(row) ?: return super.onTouchEvent(event)
        
        if (row == block.commandStartRow) {
            when {
                col == 0 -> {
                    // Chevron area — toggle fold
                    toggleFold(block)
                    return true
                }
                col >= terminalCols - 4 && col < terminalCols - 1 -> {
                    // Exit code badge area — no action (informational)
                    return true
                }
                col >= terminalCols - 1 -> {
                    // Copy button area
                    copyBlockOutput(block)
                    return true
                }
            }
        }
    }
    
    // Long-press on any block row → open RN BlockList panel
    if (event.action == MotionEvent.ACTION_DOWN) {
        longPressHandler.startTracking(event)
    }
    
    return super.onTouchEvent(event)
}
```

### Long-press → RN Panel
Long-press (500ms) on any row within a block opens the existing RN `BlockList` panel (already wired in `terminal.tsx`). The GL layer sends a JS event:

```kotlin
// Fire event to JS side
emitEvent("onBlockLongPress", mapOf(
    "command" to block.command,
    "startRow" to block.commandStartRow,
    "endRow" to block.endRow,
    "exitCode" to block.exitCode
))
```

---

## 5. Scroll Interaction with Blocks

### Auto-collapse for off-screen blocks
When a block scrolls completely off the top of the viewport and has >50 output lines, auto-collapse it to save memory in the vertex buffer. Expand when scrolled back into view.

### Scroll-to-block
When user taps a block in the RN BlockList panel, GLTerminalView scrolls to that block's `commandStartRow` with smooth animation (via `ScrollAnimator`).

---

## 6. File Structure (additions to GPU rendering spec)

```
modules/terminal-view/android/src/main/java/
  expo/modules/terminalview/
    gl/
      BlockAnimator.kt       — Fold/unfold animation state machine
      BlockChromeRenderer.kt — Separator lines, badges, chevrons, copy button
      
      # Modified (from GPU spec):
      GLTerminalView.kt      — Add block touch handling
      GLTerminalRenderer.kt  — Add Pass 4 (block chrome), blockRanges storage
      CellBatcher.kt         — Add row skipping for collapsed blocks
```

No new shaders. Block chrome reuses existing background and glyph shaders.

---

## 7. Integration with Existing RN Components

### Data Flow
```
BlockDetector.kt
  ├→ GLTerminalRenderer.blockRanges (GL drawing)
  └→ onBlockCompleted event → terminal.tsx → addEntryBlock() → terminal-store (RN BlockList)
```

Both paths receive the same data. GL draws the visual chrome. RN stores the structured data for the panel.

### Event Flow
```
GL tap on chevron → toggleFold() → GL re-renders (no JS involvement)
GL tap on copy → copyBlockOutput() → Android ClipboardManager (no JS involvement)
GL long-press → emitEvent("onBlockLongPress") → terminal.tsx → setShowBlockHistory(true)
RN BlockList "Rerun" → sendToTerminal(command) → pty-helper (existing)
RN BlockList "Scroll to" → TerminalViewModule.scrollToRow(row) → GLTerminalView.scrollToRow()
```

### RN Components — Unchanged
- `TerminalBlock.tsx` — unchanged
- `BlockList.tsx` — unchanged

### Small RN/Kotlin Additions Required
- **`TerminalViewModule.kt`:** Register `onBlockLongPress` as a new event in the Expo module's `Events()` list
- **`terminal.tsx`:** Add `onBlockLongPress` handler that calls `setShowBlockHistory(true)` — mirrors existing `onBlockCompleted` wiring pattern
- **`GLTerminalView.kt`:** Emit `onBlockLongPress` event via `sendEvent()` on long-press detection

---

## 8. Performance Considerations

- Block chrome is drawn once and cached in vertex buffer (not per-frame recalculation)
- Separator lines: 4 vertices each (negligible)
- Badges/chevrons: reuse glyph atlas (no additional texture)
- Fold animation: only active blocks animate (200ms bursts)
- Auto-collapse off-screen blocks reduces vertex buffer size for long sessions
- Hit testing is O(n) on blockRanges but n is typically <100 (acceptable)

---

## 9. Theming

Block chrome colors derive from the terminal color scheme:

```kotlin
object BlockColors {
    fun separator(theme: TerminalTheme) = theme.dimForeground.withAlpha(0.3f)
    fun separatorRunning(theme: TerminalTheme) = theme.accent.withAlpha(0.5f)
    fun badgeSuccess() = Color(0x4CAF50).withAlpha(0.8f)
    fun badgeError() = Color(0xF44336).withAlpha(0.8f)
    fun badgeRunning(theme: TerminalTheme) = theme.accent  // pulsing alpha
    fun chevron(theme: TerminalTheme) = theme.dimForeground
    fun copyButton(theme: TerminalTheme) = theme.dimForeground
    fun collapsedHint(theme: TerminalTheme) = theme.dimForeground.withAlpha(0.5f)
}
```

---

## 10. Limitations (v1)

- **No block sharing** — copy to clipboard only, no URL/link sharing
- **No block search** — find-in-block deferred to v2
- **No block drag-reorder** — blocks are in terminal order, cannot be rearranged
- **OSC 133 dependency** — blocks are only detected if the shell emits OSC 133 sequences. Fallback to idle-timeout detection (existing in BlockDetector.kt)
- **Auto-collapse threshold fixed** — >50 lines, not configurable in v1
