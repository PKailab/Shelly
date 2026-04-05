# GPU Terminal Rendering Design Spec

**Date:** 2026-04-05
**Goal:** Replace CPU Canvas rendering with OpenGL ES 3.0 GPU rendering for maximum performance, visual quality, and branding differentiation ("the only GPU-rendered mobile terminal").

**Scope:** Rendering layer only. TerminalEmulator/TerminalBuffer/TerminalRow data layer is unchanged. JS side (terminal.tsx) has zero changes.

---

## Architecture Overview

```
PTY output → TerminalEmulator (unchanged)
  → TerminalBuffer/TerminalRow (unchanged)
  → SyntaxHighlighter (moved to background worker, caches results per row)
  → GLTerminalRenderer (new)
    → GlyphAtlas: font → texture atlas (built at font load)
    → CellBatcher: TerminalRow + cached highlights → GPU vertex buffer
    → ShaderPipeline: vertex → fragment → post-process (CRT etc.)
  → GLTerminalView extends GLSurfaceView (new, replaces TerminalView)
    → InputConnection (ported from anonymous BaseInputConnection in TerminalView.onCreateInputConnection())
    → GestureHandler (ported from GestureAndScaleRecognizer)
    → TerminalViewClient delegation (for ShellyInputHandler)
```

### Key Principle
- Data layer (TerminalEmulator, TerminalBuffer, TerminalRow, TerminalSession) — **zero changes**
- SyntaxHighlighter — moved **out of draw loop** into background worker (see Section 11)
- Existing TerminalView.java / TerminalRenderer.java — **kept as Canvas fallback**

---

## 1. Glyph Atlas

Font glyphs are pre-rasterized to GPU textures. Each character cell becomes a textured quad.

### Build Strategy
- **ASCII (0x20-0x7E, 95 chars):** Bulk-rasterized at font load time (few ms)
- **Box-drawing, common symbols:** Pre-rasterized alongside ASCII
- **CJK / Emoji:** Lazy-rasterized on first appearance, stored in LRU cache
- **Texture size:** 1024x1024 per page. Additional pages auto-created as needed
- **UV coordinates:** Stored in `HashMap<Int, GlyphInfo>` (codepoint → UV rect + metrics)

### Font Variants
4 separate atlas textures: Regular, Bold, Italic, BoldItalic.

### Invalidation
- Font family or size change → full atlas rebuild (tens of ms, acceptable for rare operation)
- LRU eviction for CJK/emoji → re-rasterize on next appearance

### Implementation
```kotlin
class GlyphAtlas(private val typeface: Typeface, private val fontSize: Float) {
    data class GlyphInfo(val textureId: Int, val u0: Float, val v0: Float, val u1: Float, val v1: Float, val width: Float, val height: Float, val bearingX: Float, val bearingY: Float)
    
    private val glyphs = HashMap<Int, GlyphInfo>(256)
    private val pages = mutableListOf<Int>()  // GL texture IDs
    private var currentX = 0
    private var currentY = 0
    private var rowHeight = 0
    
    fun build()  // Rasterize ASCII + common symbols
    fun getGlyph(codepoint: Int): GlyphInfo  // Lookup or lazy-rasterize
    fun destroy()  // Delete GL textures
}
```

---

## 2. Cell Batcher

Converts TerminalRow data into GPU vertex buffers. Each cell = 2 quads (background + glyph).

### Vertex Format
```
struct Vertex {
    float x, y;        // position (2)
    float u, v;        // texture coordinate (2)
    float r, g, b, a;  // color (4)
}
// 32 bytes per vertex, 4 vertices per quad, 2 quads per cell
// 80x24 terminal = 80 * 24 * 2 * 4 * 32 = ~480KB vertex data
```

### Dirty Row Tracking
- `dirtyRows: BitSet(totalRows)` — set when TerminalRow content changes
- `updateDirtyRows()` — only recalculate vertex data for dirty rows
- `glBufferSubData()` — partial GPU buffer update (not full re-upload)

### Implementation
```kotlin
class CellBatcher(private val cols: Int, private val rows: Int, private val atlas: GlyphAtlas) {
    private var vboId: Int = 0
    private var iboId: Int = 0
    private val dirtyRows = BitSet(rows)
    
    fun init()  // Create VBO/IBO
    fun markDirty(row: Int)
    fun markAllDirty()
    fun updateDirtyRows(buffer: TerminalBuffer, topRow: Int, highlightCache: HighlightCache)
    fun draw(bgShader: ShaderProgram, glyphShader: ShaderProgram)
    fun destroy()
}
```

---

## 3. Rendering Loop and Dirty Management

### Dirty Flags
```kotlin
object DirtyFlags {
    const val NONE    = 0
    const val CURSOR  = 1 shl 0   // Cursor blink/move only
    const val SCROLL  = 1 shl 1   // Scroll offset changed
    const val CONTENT = 1 shl 2   // Row content changed
    const val ALL     = 1 shl 3   // Full rebuild (resize, font change)
}
```

### onDrawFrame Logic
```
1. Check dirtyFlags
   - NONE + CRT ON → re-run post-process only (scanline animation)
   - NONE + CRT OFF → skip (requestRender not called)
   - CURSOR → update cursor alpha uniform only
   - SCROLL → update u_scrollOffset uniform + batch new rows
   - CONTENT → CellBatcher.updateDirtyRows()
   - ALL → full vertex buffer rebuild

2. Draw calls (3 passes):
   Pass 1: Background quads (single glDrawElements, bg shader)
   Pass 2: Glyph quads (single glDrawElements, glyph shader, atlas texture bound)
   Pass 3: Overlays (selection highlight, cursor)

3. Post-process (CRT ON only):
   → Render to FBO
   → Fullscreen quad with CRT shader

4. Idle detection:
   → 2s since last dirty → RENDERMODE_WHEN_DIRTY
   → Input/output received → RENDERMODE_CONTINUOUSLY
   → CRT ON + idle → 5fps (skip bloom pass, scanlines only)
```

---

## 4. Shader Programs

### Files (modules/terminal-view/android/src/main/assets/shaders/)

| File | Purpose |
|------|---------|
| `terminal_vert.glsl` | Shared vertex shader. `u_scrollOffset` (float) for sub-pixel scroll |
| `background_frag.glsl` | Cell background color |
| `glyph_frag.glsl` | Texture sampling from atlas + foreground color tint |
| `cursor_frag.glsl` | Cursor with `u_cursorAlpha` (0.0-1.0 sine wave for fade blink) |
| `selection_frag.glsl` | Selection highlight with `u_time` for pulse animation |
| `crt_frag.glsl` | Post-process: scanlines + barrel distortion + phosphor glow |

### Shader Loading
Shaders are loaded from the module's `assets/shaders/` directory. The `terminal-view` module's `build.gradle` must include:
```groovy
android {
    sourceSets {
        main {
            assets.srcDirs += 'src/main/assets'
        }
    }
}
```

### Uniforms
```glsl
// Vertex shader
uniform mat4 u_projection;      // Orthographic projection
uniform float u_scrollOffset;   // Sub-pixel scroll Y offset

// Cursor shader
uniform float u_cursorAlpha;    // 0.0-1.0, sine wave animation

// Selection shader  
uniform float u_time;           // Elapsed time for pulse

// CRT shader
uniform sampler2D u_screenTexture;  // FBO color attachment
uniform vec2 u_resolution;          // Screen size
uniform float u_scanlineIntensity;  // User-adjustable
uniform float u_curvature;          // Barrel distortion amount
```

---

## 5. Visual Effects

### 5.1 Sub-pixel Smooth Scrolling
- Scroll offset is a `float` (not `int` row index)
- Vertex shader applies `u_scrollOffset` to all Y positions
- `ScrollAnimator` provides physics-based deceleration (fling velocity → exponential decay)
- Touch drag maps directly to offset change (no row-snapping)

### 5.2 Cursor Animation
- **Fade blink:** `u_cursorAlpha = (sin(time * blinkSpeed) + 1.0) / 2.0`
- **Move slide:** When cursor position changes, animate from old position to new over 80ms (lerp)
- `CursorAnimator` manages both animations, calls `requestRender()` only when animating

### 5.3 Selection Highlight
- Semi-transparent overlay quad on selected cells
- Pulse animation: alpha oscillates 0.15-0.3 via `u_time` sine wave
- Selection range communicated via uniform buffer or vertex color

### 5.4 Block Fold/Unfold Animation
- `BlockDetector.kt` detects command boundaries via OSC 133
- Block boundary rows (start/end) are stored in `GLTerminalRenderer.blockRanges: List<IntRange>`
- `BlockDetector.onBlockCompleted` callback pushes to `blockRanges` (thread-safe via `synchronized`)
- When Command Block collapses: affected rows slide up with easing (200ms)
- When expanding: rows slide down
- Implemented as temporary per-block Y offset in vertex data
- After animation completes, vertex buffer is rebuilt to final state

### 5.5 CRT / Retro Effect (Settings toggle, default OFF)
Post-process shader applied to fullscreen quad:
- **Scanlines:** Horizontal dark lines at every other pixel row, intensity adjustable
- **Barrel distortion:** Slight screen curvature (fisheye)
- **Phosphor glow:** Bloom effect on bright characters
- **Power management:** 
  - Active: full post-process at 60fps
  - Idle (2s+): reduce to 5fps, skip bloom pass (scanlines + distortion only)
  - Background/screen off: 0fps (rendering paused)

---

## 6. File Structure

```
modules/terminal-view/android/src/main/java/
  expo/modules/terminalview/
    gl/
      GLTerminalView.kt        — GLSurfaceView + InputConnection + Gesture + TerminalViewClient
      GLTerminalRenderer.kt    — Renderer (onSurfaceCreated/Changed/DrawFrame)
      GlyphAtlas.kt            — Font → texture atlas + LRU cache
      CellBatcher.kt           — TerminalRow → vertex buffer
      ShaderProgram.kt         — GLSL load + compile + link + uniform helpers
      PostProcessor.kt         — FBO management + CRT post-process
      ScrollAnimator.kt        — Physics-based inertia scrolling
      CursorAnimator.kt        — Cursor fade/slide animation
      HighlightCache.kt        — SyntaxHighlighter result cache (thread-safe)
      HighlightWorker.kt       — Background syntax highlighting executor

modules/terminal-view/android/src/main/assets/shaders/
  terminal_vert.glsl
  background_frag.glsl
  glyph_frag.glsl
  cursor_frag.glsl
  selection_frag.glsl
  crt_frag.glsl
```

Note: All GL code lives in `terminal-view` module (where rendering code belongs), NOT in `terminal-emulator` (which contains session/PTY logic). `BlockDetector.kt` already exists in `expo/modules/terminalview/` and is reused as-is for block boundary detection.

---

## 7. IME / Input Integration

- `GLTerminalView` overrides `onCreateInputConnection()` and returns a `BaseInputConnection` subclass ported from the anonymous implementation in `TerminalView.java:329-409`
- Key events handled identically to current implementation
- Japanese input (inline composition) works through the same `commitText` / `setComposingText` path

### TerminalViewClient Callback Flow

`GLTerminalView` implements `TerminalViewClient` interface to receive key events from the system and delegate to `ShellyInputHandler`:

```kotlin
class GLTerminalView(...) : GLSurfaceView(...), TerminalViewClient {
    private lateinit var inputHandler: ShellyInputHandler
    
    fun attachSession(session: ShellyTerminalSession, handler: ShellyInputHandler) {
        this.inputHandler = handler
        // Wire TerminalViewClient callbacks → ShellyInputHandler
    }
    
    // TerminalViewClient implementation
    override fun onKeyDown(keyCode: Int, event: KeyEvent, session: TerminalSession): Boolean {
        return inputHandler.onKeyDown(keyCode, event, session)
    }
    override fun onKeyUp(keyCode: Int, event: KeyEvent): Boolean {
        return inputHandler.onKeyUp(keyCode, event)
    }
    override fun readControlKey(): Boolean = inputHandler.readControlKey()
    override fun readAltKey(): Boolean = inputHandler.readAltKey()
    override fun readFnKey(): Boolean = inputHandler.readFnKey()
    // ... other TerminalViewClient methods
}
```

`ShellyTerminalView.kt` passes the same `ShellyInputHandler` instance to either `GLTerminalView` or `TerminalView` depending on the GPU rendering setting. No changes to `ShellyInputHandler.kt`.

---

## 8. Migration Strategy and Fallback

```kotlin
// In ShellyTerminalView.kt
val useGPU = settings.gpuRendering  // Default: true
val gpuCapable = checkGLES30Support()

if (useGPU && gpuCapable) {
    terminalView = GLTerminalView(context, ...)
    terminalView.attachSession(session, inputHandler)
} else {
    terminalView = TerminalView(context, ...)  // Existing Canvas fallback
}
```

- **Settings toggle:** Users can switch GPU rendering ON/OFF
- **Auto-fallback:** GLES 3.0 not supported → Canvas mode (Android 4.3 and below, effectively nonexistent)
- **Existing code preserved:** TerminalView.java and TerminalRenderer.java are NOT deleted
- **JS side:** Zero changes to terminal.tsx. NativeTerminalView props are identical regardless of GL or Canvas backend
- **Prop forwarding:** GLTerminalView exposes the same props (colorScheme, fontFamily, fontSize, cursorShape, cursorBlink) as TerminalView
- **Emulator access:** `GLTerminalView` accesses `TerminalSession.emulator` (public field) for reading TerminalBuffer data during rendering. Same accessor pattern as existing `TerminalView`.

---

## 9. Performance Targets

| Metric | Canvas (current) | GPU (target) |
|--------|-----------------|--------------|
| Frame time (idle) | 0ms (no render) | 0ms (WHEN_DIRTY) |
| Frame time (output burst) | 8-16ms (full redraw) | <2ms (dirty rows only) |
| Frame time (fast scroll) | 8-16ms (full redraw) | <1ms (uniform update) |
| Memory overhead | ~0 | ~4MB (atlas textures + VBO) |
| Battery (idle) | Minimal | Minimal (WHEN_DIRTY) |
| Battery (CRT ON idle) | N/A | Low (5fps, scanlines only, no bloom) |

---

## 10. Testing Strategy

- **Unit:** GlyphAtlas UV correctness, CellBatcher vertex generation, ShaderProgram compilation
- **Visual:** Side-by-side Canvas vs GL rendering comparison (same TerminalBuffer, screenshot diff)
- **Performance:** Frame time profiling with `Choreographer.FrameCallback`
- **Compatibility:** Test on: Z Fold6 (Snapdragon 8 Gen 3), low-end Snapdragon 4 series, MediaTek devices
- **Regression:** Existing TerminalView tests still pass (Canvas path unchanged)
- **Edge cases:** CJK mixed with ASCII, emoji, wide characters, extremely long lines, rapid resize
- **Lifecycle:** App background/foreground, Z Fold fold/unfold, screen rotation — verify EGL context recovery

---

## 11. SyntaxHighlighter Background Worker

### Problem
Currently `SyntaxHighlighter.highlightRow()` is called inside `TerminalRenderer.render()` during the Canvas `onDraw()` — O(rows × columns) per frame on the UI thread.

### Solution
Move highlighting to a background worker triggered by PTY output. Cache results per row.

```kotlin
class HighlightCache {
    // Row index → array of per-cell style overrides
    private val cache = ConcurrentHashMap<Int, IntArray>()
    
    fun getHighlights(row: Int): IntArray?  // Called from GL thread during draw
    fun invalidateRow(row: Int)             // Called when row content changes
    fun invalidateAll()                     // Called on resize/clear
}

class HighlightWorker(private val cache: HighlightCache) {
    private val executor = Executors.newSingleThreadExecutor()
    
    fun highlightRows(buffer: TerminalBuffer, startRow: Int, endRow: Int) {
        executor.submit {
            for (row in startRow..endRow) {
                val highlights = SyntaxHighlighter.highlightRow(buffer, row)
                cache.put(row, highlights)
            }
        }
    }
}
```

- **Thread safety:** `ConcurrentHashMap` for cache. GL thread reads, worker thread writes. No locking needed (read of stale data = one frame without highlight, acceptable).
- **Trigger:** `onScreenUpdated()` callback triggers `highlightWorker.highlightRows()` for visible rows.
- **GL thread reads cache:** `CellBatcher.updateDirtyRows()` calls `cache.getHighlights(row)` to apply colors during vertex generation.

---

## 12. Thread Safety: GL Thread vs I/O Thread

### Problem
- PTY I/O thread writes to `TerminalBuffer` via `TerminalEmulator.processInput()`
- GL thread reads `TerminalBuffer` in `CellBatcher.updateDirtyRows()`
- Concurrent read/write without synchronization = data corruption

### Solution
Snapshot approach — same strategy as existing `TerminalView`:

```kotlin
// In GLTerminalRenderer.onDrawFrame():
val emulator = session.emulator ?: return
synchronized(emulator) {
    // Read all needed data while holding the lock
    cellBatcher.updateDirtyRows(emulator.screen, topRow, highlightCache)
}
```

- The existing `TerminalView.onDraw()` already synchronizes on the emulator via `mMainThreadHandler` (all reads happen on main thread after MSG_NEW_INPUT). The GL thread equivalent is a `synchronized(emulator)` block during draw.
- The lock is held only for vertex data extraction (< 1ms for dirty rows), not for the entire draw call.
- `requestRender()` (called from any thread) is thread-safe on GLSurfaceView by design.

---

## 13. EGL Context Loss Recovery

### Problem
Android can destroy the EGL context when:
- App goes to background and system needs GPU memory
- Z Fold6 fold/unfold transitions (surface recreation)
- Screen rotation
- `GLSurfaceView.setPreserveEGLContextOnPause(true)` helps but is not guaranteed

### Solution
`onSurfaceCreated()` is called whenever the EGL context is (re)created. All GPU resources must be rebuildable:

```kotlin
class GLTerminalRenderer : GLSurfaceView.Renderer {
    override fun onSurfaceCreated(gl: GL10?, config: EGLConfig?) {
        // Rebuild everything from scratch
        shaderPrograms.forEach { it.compile() }   // Recompile shaders
        glyphAtlas.rebuild()                        // Re-rasterize + re-upload textures
        cellBatcher.init()                          // Recreate VBO/IBO
        cellBatcher.markAllDirty()                  // Force full rebuild
        postProcessor.init()                        // Recreate FBO
    }
}
```

- **setPreserveEGLContextOnPause(true)** — set in `GLTerminalView.init{}` to minimize context loss
- **All GPU resources track their own state** — each class knows whether its GL objects are valid
- **Atlas rebuild is fast** — ASCII re-rasterize is < 10ms, CJK LRU cache is repopulated lazily
- **No user-visible glitch** — `onSurfaceCreated` runs before the first `onDrawFrame` after recovery
