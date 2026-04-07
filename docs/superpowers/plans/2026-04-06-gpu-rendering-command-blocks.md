# GPU Rendering + Command Blocks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Canvas-based terminal rendering with OpenGL ES 3.0 GPU rendering, then add native command block chrome (separators, badges, fold/unfold) on top.

**Architecture:** New `gl/` package under `terminal-view` module containing GLSurfaceView-based renderer. GlyphAtlas pre-rasterizes fonts to GPU textures, CellBatcher converts TerminalRow data to vertex buffers with dirty-row tracking, ShaderPipeline handles 3-pass rendering (background → glyphs → overlays). Command Blocks add a 4th pass for block chrome. Existing TerminalView.java kept as Canvas fallback.

**Tech Stack:** Kotlin, OpenGL ES 3.0, GLSL, Expo Native Module (existing terminal-view module)

**Constraints:**
- Kotlin compilation only runs in CI (GitHub Actions), not locally in Termux
- `/tmp/` is unavailable — use `$HOME/.shelly/tmp/`
- All new files go in `modules/terminal-view/` (NOT `terminal-emulator/`)
- JS side (`terminal.tsx`) has zero changes for GPU rendering; minimal changes for block long-press event

---

## File Structure

### New Files (GPU Rendering)
| File | Responsibility |
|------|---------------|
| `modules/terminal-view/android/src/main/java/expo/modules/terminalview/gl/GLTerminalView.kt` | GLSurfaceView + InputConnection + Gesture + TerminalViewClient delegation |
| `modules/terminal-view/android/src/main/java/expo/modules/terminalview/gl/GLTerminalRenderer.kt` | Renderer (onSurfaceCreated/Changed/DrawFrame), dirty flag management |
| `modules/terminal-view/android/src/main/java/expo/modules/terminalview/gl/GlyphAtlas.kt` | Font → texture atlas + LRU cache for CJK/emoji |
| `modules/terminal-view/android/src/main/java/expo/modules/terminalview/gl/CellBatcher.kt` | TerminalRow → vertex buffer, dirty row tracking, row skipping for collapsed blocks |
| `modules/terminal-view/android/src/main/java/expo/modules/terminalview/gl/ShaderProgram.kt` | GLSL load + compile + link + uniform helpers |
| `modules/terminal-view/android/src/main/java/expo/modules/terminalview/gl/PostProcessor.kt` | FBO management + CRT post-process |
| `modules/terminal-view/android/src/main/java/expo/modules/terminalview/gl/ScrollAnimator.kt` | Physics-based inertia scrolling |
| `modules/terminal-view/android/src/main/java/expo/modules/terminalview/gl/CursorAnimator.kt` | Cursor fade blink + slide animation |
| `modules/terminal-view/android/src/main/java/expo/modules/terminalview/gl/HighlightCache.kt` | Thread-safe SyntaxHighlighter result cache |
| `modules/terminal-view/android/src/main/java/expo/modules/terminalview/gl/HighlightWorker.kt` | Background syntax highlighting executor |

### New Files (Shaders)
| File | Responsibility |
|------|---------------|
| `modules/terminal-view/android/src/main/assets/shaders/terminal_vert.glsl` | Shared vertex shader with `u_scrollOffset` |
| `modules/terminal-view/android/src/main/assets/shaders/background_frag.glsl` | Cell background color |
| `modules/terminal-view/android/src/main/assets/shaders/glyph_frag.glsl` | Texture sampling from atlas + foreground tint |
| `modules/terminal-view/android/src/main/assets/shaders/cursor_frag.glsl` | Cursor with sine-wave fade blink |
| `modules/terminal-view/android/src/main/assets/shaders/selection_frag.glsl` | Selection highlight with pulse animation |
| `modules/terminal-view/android/src/main/assets/shaders/passthrough_vert.glsl` | Passthrough vertex shader for fullscreen CRT quad (no projection/scroll) |
| `modules/terminal-view/android/src/main/assets/shaders/crt_frag.glsl` | Post-process: scanlines + barrel distortion + phosphor glow |

### New Files (Command Blocks)
| File | Responsibility |
|------|---------------|
| `modules/terminal-view/android/src/main/java/expo/modules/terminalview/gl/BlockChromeRenderer.kt` | Separator lines, exit code badges, chevrons, copy button |
| `modules/terminal-view/android/src/main/java/expo/modules/terminalview/gl/BlockAnimator.kt` | Fold/unfold animation state machine |

### Modified Files
| File | Changes |
|------|---------|
| `modules/terminal-view/android/build.gradle` | Add `assets.srcDirs` for shaders |
| `modules/terminal-view/android/src/main/java/expo/modules/terminalview/ShellyTerminalView.kt` | Add GPU/Canvas switching, wire BlockDetector to GL renderer |
| `modules/terminal-view/android/src/main/java/expo/modules/terminalview/BlockDetector.kt` | Add `onBlockStarted` callback |
| `modules/terminal-view/android/src/main/java/expo/modules/terminalview/TerminalViewModule.kt` | Add `onBlockLongPress` event, `scrollToRow` function, `gpuRendering` prop |

---

## Task 1: ShaderProgram Utility

**Files:**
- Create: `modules/terminal-view/android/src/main/java/expo/modules/terminalview/gl/ShaderProgram.kt`

- [ ] **Step 1: Create ShaderProgram.kt**

```kotlin
package expo.modules.terminalview.gl

import android.content.Context
import android.opengl.GLES30
import android.util.Log

class ShaderProgram(private val context: Context, private val vertexAsset: String, private val fragmentAsset: String) {
    companion object {
        private const val TAG = "ShaderProgram"
    }

    var programId: Int = 0
        private set

    private val uniformLocations = HashMap<String, Int>()

    fun compile() {
        val vertSrc = context.assets.open(vertexAsset).bufferedReader().readText()
        val fragSrc = context.assets.open(fragmentAsset).bufferedReader().readText()

        val vertShader = compileShader(GLES30.GL_VERTEX_SHADER, vertSrc)
        val fragShader = compileShader(GLES30.GL_FRAGMENT_SHADER, fragSrc)

        programId = GLES30.glCreateProgram()
        GLES30.glAttachShader(programId, vertShader)
        GLES30.glAttachShader(programId, fragShader)
        GLES30.glLinkProgram(programId)

        val linkStatus = IntArray(1)
        GLES30.glGetProgramiv(programId, GLES30.GL_LINK_STATUS, linkStatus, 0)
        if (linkStatus[0] == 0) {
            val log = GLES30.glGetProgramInfoLog(programId)
            GLES30.glDeleteProgram(programId)
            throw RuntimeException("Program link failed: $log")
        }

        GLES30.glDeleteShader(vertShader)
        GLES30.glDeleteShader(fragShader)
        uniformLocations.clear()
    }

    fun use() {
        GLES30.glUseProgram(programId)
    }

    fun getUniformLocation(name: String): Int {
        return uniformLocations.getOrPut(name) {
            GLES30.glGetUniformLocation(programId, name)
        }
    }

    fun setUniform1f(name: String, value: Float) {
        GLES30.glUniform1f(getUniformLocation(name), value)
    }

    fun setUniform2f(name: String, x: Float, y: Float) {
        GLES30.glUniform2f(getUniformLocation(name), x, y)
    }

    fun setUniform4f(name: String, x: Float, y: Float, z: Float, w: Float) {
        GLES30.glUniform4f(getUniformLocation(name), x, y, z, w)
    }

    fun setUniformMatrix4fv(name: String, matrix: FloatArray) {
        GLES30.glUniformMatrix4fv(getUniformLocation(name), 1, false, matrix, 0)
    }

    fun setUniform1i(name: String, value: Int) {
        GLES30.glUniform1i(getUniformLocation(name), value)
    }

    fun destroy() {
        if (programId != 0) {
            GLES30.glDeleteProgram(programId)
            programId = 0
        }
        uniformLocations.clear()
    }

    private fun compileShader(type: Int, source: String): Int {
        val shader = GLES30.glCreateShader(type)
        GLES30.glShaderSource(shader, source)
        GLES30.glCompileShader(shader)

        val compileStatus = IntArray(1)
        GLES30.glGetShaderiv(shader, GLES30.GL_COMPILE_STATUS, compileStatus, 0)
        if (compileStatus[0] == 0) {
            val log = GLES30.glGetShaderInfoLog(shader)
            GLES30.glDeleteShader(shader)
            val typeName = if (type == GLES30.GL_VERTEX_SHADER) "vertex" else "fragment"
            throw RuntimeException("$typeName shader compile failed ($vertexAsset / $fragmentAsset): $log")
        }
        return shader
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add modules/terminal-view/android/src/main/java/expo/modules/terminalview/gl/ShaderProgram.kt
git commit -m "feat(gpu): add ShaderProgram utility for GLSL loading and compilation"
```

---

## Task 2: GLSL Shader Files + build.gradle Assets Config

**Files:**
- Create: `modules/terminal-view/android/src/main/assets/shaders/terminal_vert.glsl`
- Create: `modules/terminal-view/android/src/main/assets/shaders/background_frag.glsl`
- Create: `modules/terminal-view/android/src/main/assets/shaders/glyph_frag.glsl`
- Create: `modules/terminal-view/android/src/main/assets/shaders/cursor_frag.glsl`
- Create: `modules/terminal-view/android/src/main/assets/shaders/selection_frag.glsl`
- Create: `modules/terminal-view/android/src/main/assets/shaders/crt_frag.glsl`
- Modify: `modules/terminal-view/android/build.gradle`

- [ ] **Step 1: Create terminal_vert.glsl**

```glsl
#version 300 es
precision highp float;

layout(location = 0) in vec2 a_position;
layout(location = 1) in vec2 a_texCoord;
layout(location = 2) in vec4 a_color;

uniform mat4 u_projection;
uniform float u_scrollOffset;

out vec2 v_texCoord;
out vec4 v_color;

void main() {
    vec2 pos = a_position;
    pos.y += u_scrollOffset;
    gl_Position = u_projection * vec4(pos, 0.0, 1.0);
    v_texCoord = a_texCoord;
    v_color = a_color;
}
```

- [ ] **Step 2: Create background_frag.glsl**

```glsl
#version 300 es
precision mediump float;

in vec4 v_color;
out vec4 fragColor;

void main() {
    fragColor = v_color;
}
```

- [ ] **Step 3: Create glyph_frag.glsl**

```glsl
#version 300 es
precision mediump float;

in vec2 v_texCoord;
in vec4 v_color;

uniform sampler2D u_atlas;

out vec4 fragColor;

void main() {
    float alpha = texture(u_atlas, v_texCoord).r;
    fragColor = vec4(v_color.rgb, v_color.a * alpha);
}
```

- [ ] **Step 4: Create cursor_frag.glsl**

```glsl
#version 300 es
precision mediump float;

in vec4 v_color;

uniform float u_cursorAlpha;

out vec4 fragColor;

void main() {
    fragColor = vec4(v_color.rgb, v_color.a * u_cursorAlpha);
}
```

- [ ] **Step 5: Create selection_frag.glsl**

```glsl
#version 300 es
precision mediump float;

in vec4 v_color;

uniform float u_time;

out vec4 fragColor;

void main() {
    float pulse = 0.15 + 0.15 * sin(u_time * 2.0);
    fragColor = vec4(v_color.rgb, pulse);
}
```

- [ ] **Step 6: Create passthrough_vert.glsl (for CRT fullscreen quad)**

```glsl
#version 300 es
precision highp float;

layout(location = 0) in vec2 a_position;
layout(location = 1) in vec2 a_texCoord;

out vec2 v_texCoord;

void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = a_texCoord;
}
```

- [ ] **Step 7: Create crt_frag.glsl**

```glsl
#version 300 es
precision mediump float;

in vec2 v_texCoord;

uniform sampler2D u_screenTexture;
uniform vec2 u_resolution;
uniform float u_scanlineIntensity;
uniform float u_curvature;

out vec4 fragColor;

void main() {
    // Barrel distortion
    vec2 uv = v_texCoord * 2.0 - 1.0;
    float r2 = dot(uv, uv);
    uv *= 1.0 + u_curvature * r2;
    uv = (uv + 1.0) * 0.5;

    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
        fragColor = vec4(0.0);
        return;
    }

    vec4 color = texture(u_screenTexture, uv);

    // Scanlines
    float scanline = sin(uv.y * u_resolution.y * 3.14159) * 0.5 + 0.5;
    color.rgb *= 1.0 - u_scanlineIntensity * (1.0 - scanline);

    // Phosphor glow (simple bloom approximation)
    float brightness = dot(color.rgb, vec3(0.299, 0.587, 0.114));
    float glow = smoothstep(0.5, 1.0, brightness) * 0.15;
    color.rgb += glow;

    fragColor = color;
}
```

- [ ] **Step 8: Modify build.gradle to include assets**

In `modules/terminal-view/android/build.gradle`, add inside the `android {}` block:

```groovy
android {
  namespace "expo.modules.terminalview"

  defaultConfig {
    versionCode 1
    versionName "0.1.0"
  }

  sourceSets {
    main {
      assets.srcDirs += 'src/main/assets'
    }
  }

  lint {
    abortOnError false
  }
}
```

- [ ] **Step 9: Commit**

```bash
git add modules/terminal-view/android/src/main/assets/shaders/
git add modules/terminal-view/android/build.gradle
git commit -m "feat(gpu): add GLSL shader files (incl. passthrough vert) and configure assets in build.gradle"
```

---

## Task 3: GlyphAtlas

**Files:**
- Create: `modules/terminal-view/android/src/main/java/expo/modules/terminalview/gl/GlyphAtlas.kt`

- [ ] **Step 1: Create GlyphAtlas.kt**

```kotlin
package expo.modules.terminalview.gl

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.Typeface
import android.opengl.GLES30
import android.opengl.GLUtils
import android.util.Log

class GlyphAtlas(private var typeface: Typeface, private var fontSize: Float) {
    companion object {
        private const val TAG = "GlyphAtlas"
        private const val PAGE_SIZE = 1024
        private const val LRU_MAX_SIZE = 2048
    }

    data class GlyphInfo(
        val textureId: Int,
        val u0: Float, val v0: Float,
        val u1: Float, val v1: Float,
        val width: Float, val height: Float,
        val bearingX: Float, val bearingY: Float,
        val advance: Float
    )

    private val glyphs = HashMap<Int, GlyphInfo>(256)
    private val pages = mutableListOf<Int>()  // GL texture IDs
    private var currentX = 0
    private var currentY = 0
    private var rowHeight = 0

    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFFFFFFFF.toInt()
        textAlign = Paint.Align.LEFT
    }

    // Cell metrics (computed from font)
    var cellWidth: Float = 0f; private set
    var cellHeight: Float = 0f; private set
    var baseline: Float = 0f; private set

    fun build() {
        destroy()
        updatePaint()
        computeCellMetrics()
        allocateNewPage()

        // Pre-rasterize ASCII (0x20-0x7E)
        for (cp in 0x20..0x7E) {
            rasterizeGlyph(cp)
        }

        // Box-drawing characters (U+2500-U+257F)
        for (cp in 0x2500..0x257F) {
            rasterizeGlyph(cp)
        }

        Log.i(TAG, "build: ${glyphs.size} glyphs, cellWidth=$cellWidth, cellHeight=$cellHeight")
    }

    fun rebuild() {
        // Called on EGL context loss — re-create everything
        glyphs.clear()
        pages.clear()
        currentX = 0
        currentY = 0
        rowHeight = 0
        build()
    }

    fun getGlyph(codepoint: Int): GlyphInfo {
        return glyphs.getOrPut(codepoint) {
            rasterizeGlyph(codepoint)
        }
    }

    fun updateFont(newTypeface: Typeface, newFontSize: Float) {
        typeface = newTypeface
        fontSize = newFontSize
        rebuild()
    }

    fun destroy() {
        if (pages.isNotEmpty()) {
            val ids = pages.toIntArray()
            GLES30.glDeleteTextures(ids.size, ids, 0)
            pages.clear()
        }
        glyphs.clear()
        currentX = 0
        currentY = 0
        rowHeight = 0
    }

    private fun updatePaint() {
        paint.typeface = typeface
        paint.textSize = fontSize
    }

    private fun computeCellMetrics() {
        val fm = paint.fontMetrics
        cellHeight = fm.bottom - fm.top
        baseline = -fm.top
        // Use 'M' width as cell width (monospace font)
        cellWidth = paint.measureText("M")
    }

    private fun allocateNewPage(): Int {
        val texIds = IntArray(1)
        GLES30.glGenTextures(1, texIds, 0)
        val texId = texIds[0]

        GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, texId)
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_MIN_FILTER, GLES30.GL_LINEAR)
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_MAG_FILTER, GLES30.GL_LINEAR)
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_WRAP_S, GLES30.GL_CLAMP_TO_EDGE)
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_WRAP_T, GLES30.GL_CLAMP_TO_EDGE)

        // Allocate empty R8 texture (GL_ALPHA removed in ES 3.0)
        GLES30.glTexImage2D(
            GLES30.GL_TEXTURE_2D, 0, GLES30.GL_R8,
            PAGE_SIZE, PAGE_SIZE, 0,
            GLES30.GL_RED, GLES30.GL_UNSIGNED_BYTE, null
        )

        pages.add(texId)
        currentX = 0
        currentY = 0
        rowHeight = 0
        return texId
    }

    private fun rasterizeGlyph(codepoint: Int): GlyphInfo {
        val text = String(Character.toChars(codepoint))
        val charWidth = paint.measureText(text)
        val fm = paint.fontMetrics
        val glyphH = (fm.bottom - fm.top).toInt() + 2
        val glyphW = (charWidth + 2).toInt().coerceAtLeast(1)

        // Check if we need to wrap to next row or new page
        if (currentX + glyphW > PAGE_SIZE) {
            currentX = 0
            currentY += rowHeight
        }
        if (currentY + glyphH > PAGE_SIZE) {
            allocateNewPage()
        }
        rowHeight = maxOf(rowHeight, glyphH)

        // Rasterize to bitmap
        val bmp = Bitmap.createBitmap(glyphW, glyphH, Bitmap.Config.ALPHA_8)
        val canvas = Canvas(bmp)
        canvas.drawText(text, 1f, -fm.top + 1f, paint)

        // Upload to current texture page via raw bytes (GLUtils doesn't handle R8 correctly)
        val texId = pages.last()
        GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, texId)
        val pixelBuf = java.nio.ByteBuffer.allocateDirect(glyphW * glyphH)
        bmp.copyPixelsToBuffer(pixelBuf)
        pixelBuf.flip()
        GLES30.glTexSubImage2D(
            GLES30.GL_TEXTURE_2D, 0, currentX, currentY, glyphW, glyphH,
            GLES30.GL_RED, GLES30.GL_UNSIGNED_BYTE, pixelBuf
        )
        bmp.recycle()

        val info = GlyphInfo(
            textureId = texId,
            u0 = currentX.toFloat() / PAGE_SIZE,
            v0 = currentY.toFloat() / PAGE_SIZE,
            u1 = (currentX + glyphW).toFloat() / PAGE_SIZE,
            v1 = (currentY + glyphH).toFloat() / PAGE_SIZE,
            width = glyphW.toFloat(),
            height = glyphH.toFloat(),
            bearingX = 1f,
            bearingY = -fm.top + 1f,
            advance = charWidth
        )

        glyphs[codepoint] = info
        currentX += glyphW

        // LRU eviction for non-ASCII
        if (glyphs.size > LRU_MAX_SIZE) {
            val toRemove = glyphs.keys.filter { it > 0x7F }.take(glyphs.size - LRU_MAX_SIZE + 256)
            toRemove.forEach { glyphs.remove(it) }
        }

        return info
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add modules/terminal-view/android/src/main/java/expo/modules/terminalview/gl/GlyphAtlas.kt
git commit -m "feat(gpu): add GlyphAtlas for font-to-texture rasterization"
```

---

## Task 4: HighlightCache + HighlightWorker

**Files:**
- Create: `modules/terminal-view/android/src/main/java/expo/modules/terminalview/gl/HighlightCache.kt`
- Create: `modules/terminal-view/android/src/main/java/expo/modules/terminalview/gl/HighlightWorker.kt`

- [ ] **Step 1: Create HighlightCache.kt**

```kotlin
package expo.modules.terminalview.gl

import java.util.concurrent.ConcurrentHashMap

/**
 * Thread-safe cache for SyntaxHighlighter results.
 * GL thread reads, worker thread writes.
 * Read of stale data = one frame without highlight (acceptable).
 */
class HighlightCache {
    private val cache = ConcurrentHashMap<Int, IntArray>()

    fun getHighlights(row: Int): IntArray? = cache[row]

    fun put(row: Int, highlights: IntArray) {
        cache[row] = highlights
    }

    fun invalidateRow(row: Int) {
        cache.remove(row)
    }

    fun invalidateAll() {
        cache.clear()
    }
}
```

- [ ] **Step 2: Create HighlightWorker.kt**

```kotlin
package expo.modules.terminalview.gl

import com.termux.terminal.TerminalBuffer
import expo.modules.terminalview.SyntaxHighlighter
import java.util.concurrent.Executors

/**
 * Runs SyntaxHighlighter on a background thread.
 * Triggered by onScreenUpdated(), writes results to HighlightCache.
 */
class HighlightWorker(private val cache: HighlightCache) {
    private val executor = Executors.newSingleThreadExecutor { r ->
        Thread(r, "shelly-highlight").apply { isDaemon = true }
    }

    fun highlightRows(buffer: TerminalBuffer, startRow: Int, endRow: Int) {
        executor.submit {
            for (row in startRow..endRow) {
                val highlights = SyntaxHighlighter.highlightRow(buffer, row)
                cache.put(row, highlights)
            }
        }
    }

    fun shutdown() {
        executor.shutdownNow()
    }
}
```

**Note:** The existing `SyntaxHighlighter` is an `object` singleton with **mutable state** (`colToTextIdx`, `textIdxToCol`, `lastExtractedColumns`). It is NOT thread-safe. A new overload for the background worker must:
1. Use **thread-local** mapping arrays (not the shared object fields)
2. Carry over the full `extractText` + `colToTextIdx`/`textIdxToCol` column mapping logic (required for CJK/wide chars)
3. Return `IntArray` of per-cell foreground color indices

- [ ] **Step 3: Add thread-safe `highlightRow(buffer, row): IntArray` to SyntaxHighlighter**

Add to `modules/terminal-view/android/src/main/java/expo/modules/terminalview/SyntaxHighlighter.kt`:

```kotlin
/**
 * Thread-safe overload for GPU rendering path (HighlightWorker).
 * Returns per-cell foreground color override array.
 * Each element is an ANSI color index (0-255), or -1 for "no override".
 *
 * IMPORTANT: This uses LOCAL arrays for column mapping (not the shared
 * mutable fields) to avoid data races with the main-thread Canvas path.
 */
fun highlightRow(buffer: TerminalBuffer, row: Int): IntArray {
    val cols = buffer.columns  // Use 'columns' property
    val result = IntArray(cols) { -1 }
    val terminalRow = buffer.getRow(row) ?: return result

    // Thread-local column mapping (NOT the shared object fields)
    val localColToTextIdx = IntArray(cols)
    val localTextIdxToCol = IntArray(cols * 2) // wide chars can expand
    val text = extractTextWithMapping(terminalRow, cols, localColToTextIdx, localTextIdxToCol)

    // Check if row has any explicit ANSI colors — if so, skip highlighting
    // (same logic as existing highlightRow — respect program-set colors)
    for (col in 0 until cols) {
        val style = terminalRow.getStyle(col)
        val fg = TextStyle.decodeForeColor(style)
        if (fg != TextStyle.COLOR_INDEX_FOREGROUND) {
            // Row has explicit colors — don't override
            return result
        }
    }

    // Apply highlighting rules using localColToTextIdx mapping
    applyHighlightRules(text, result, localColToTextIdx, cols)
    return result
}

/**
 * Extract text from a TerminalRow with column↔text index mapping.
 * Thread-safe: writes to provided arrays, not shared state.
 */
private fun extractTextWithMapping(
    row: TerminalRow, cols: Int,
    colToTextIdx: IntArray, textIdxToCol: IntArray
): String {
    val sb = StringBuilder(cols)
    var textIdx = 0
    for (col in 0 until cols) {
        colToTextIdx[col] = textIdx
        val cp = row.getCodePoint(col)
        if (cp == 0) {
            sb.append(' ')
        } else {
            sb.appendCodePoint(cp)
        }
        if (textIdx < textIdxToCol.size) {
            textIdxToCol[textIdx] = col
        }
        textIdx++
        // Wide character: next column is continuation, skip
        if (WcWidth.width(cp) > 1 && col + 1 < cols) {
            // col+1 maps to same text index (handled by caller)
        }
    }
    return sb.toString()
}

/**
 * Apply highlight rules to result array using column mapping.
 * Refactored from the existing inline logic to be reusable.
 * This is the core logic shared between Canvas and GPU paths.
 */
private fun applyHighlightRules(
    text: String, result: IntArray,
    colToTextIdx: IntArray, cols: Int
) {
    // Port the existing pattern matching logic from the current highlightRow method.
    // Key patterns: command names (green), options (cyan), paths (blue),
    // strings (yellow), errors (red), numbers (magenta).
    // Use colToTextIdx to map regex match positions back to terminal columns.
    // Read the full existing SyntaxHighlighter.kt and port each pattern.
}
```

**Implementation note:** The `applyHighlightRules` body must be ported from the existing `highlightRow` method's pattern matching logic. Read the full `SyntaxHighlighter.kt` (all ~300 lines) and refactor the regex matching section into this shared function. The mapping arrays ensure CJK/wide characters are handled correctly.

- [ ] **Step 4: Commit**

```bash
git add modules/terminal-view/android/src/main/java/expo/modules/terminalview/gl/HighlightCache.kt
git add modules/terminal-view/android/src/main/java/expo/modules/terminalview/gl/HighlightWorker.kt
git add modules/terminal-view/android/src/main/java/expo/modules/terminalview/SyntaxHighlighter.kt
git commit -m "feat(gpu): add HighlightCache, HighlightWorker, and SyntaxHighlighter buffer overload"
```

---

## Task 5: CellBatcher

**Files:**
- Create: `modules/terminal-view/android/src/main/java/expo/modules/terminalview/gl/CellBatcher.kt`

- [ ] **Step 1: Create CellBatcher.kt**

```kotlin
package expo.modules.terminalview.gl

import android.opengl.GLES30
import com.termux.terminal.TerminalBuffer
import com.termux.terminal.TextStyle
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer
import java.nio.ShortBuffer
import java.util.BitSet

/**
 * Converts TerminalRow data into GPU vertex buffers.
 * Each cell = 2 quads (background + glyph).
 *
 * Vertex format: x, y, u, v, r, g, b, a (8 floats = 32 bytes)
 * 4 vertices per quad, 2 quads per cell.
 */
class CellBatcher(private var cols: Int, private var rows: Int, private val atlas: GlyphAtlas) {
    companion object {
        private const val FLOATS_PER_VERTEX = 8  // x, y, u, v, r, g, b, a
        private const val VERTICES_PER_QUAD = 4
        private const val QUADS_PER_CELL = 2     // background + glyph
        private const val INDICES_PER_QUAD = 6   // 2 triangles
    }

    private var vboId = 0
    private var iboId = 0
    private val dirtyRows = BitSet(rows)
    private lateinit var vertexData: FloatBuffer
    private var totalCells = cols * rows

    // Collapsed block ranges — rows in these ranges are skipped
    private val collapsedRanges = mutableListOf<IntRange>()

    // Default ANSI 16 colors (updated from theme)
    private val ansiColors = IntArray(256) { defaultAnsiColor(it) }

    fun init() {
        totalCells = cols * rows
        val vertexCount = totalCells * QUADS_PER_CELL * VERTICES_PER_QUAD
        val indexCount = totalCells * QUADS_PER_CELL * INDICES_PER_QUAD

        // Allocate vertex buffer
        vertexData = ByteBuffer.allocateDirect(vertexCount * FLOATS_PER_VERTEX * 4)
            .order(ByteOrder.nativeOrder())
            .asFloatBuffer()

        // Generate index buffer (static — same triangle pattern for all quads)
        val indices = ShortBuffer.allocate(indexCount)
        for (i in 0 until totalCells * QUADS_PER_CELL) {
            val base = (i * 4).toShort()
            indices.put(base)
            indices.put((base + 1).toShort())
            indices.put((base + 2).toShort())
            indices.put((base + 2).toShort())
            indices.put((base + 3).toShort())
            indices.put(base)
        }
        indices.flip()

        // Create VBO
        val bufIds = IntArray(2)
        GLES30.glGenBuffers(2, bufIds, 0)
        vboId = bufIds[0]
        iboId = bufIds[1]

        // Upload index buffer (static)
        GLES30.glBindBuffer(GLES30.GL_ELEMENT_ARRAY_BUFFER, iboId)
        GLES30.glBufferData(GLES30.GL_ELEMENT_ARRAY_BUFFER, indexCount * 2, indices, GLES30.GL_STATIC_DRAW)

        // Allocate vertex buffer (dynamic)
        GLES30.glBindBuffer(GLES30.GL_ARRAY_BUFFER, vboId)
        GLES30.glBufferData(GLES30.GL_ARRAY_BUFFER, vertexCount * FLOATS_PER_VERTEX * 4, null, GLES30.GL_DYNAMIC_DRAW)

        markAllDirty()
    }

    fun resize(newCols: Int, newRows: Int) {
        cols = newCols
        rows = newRows
        destroy()
        init()
    }

    fun markDirty(row: Int) {
        if (row in 0 until rows) dirtyRows.set(row)
    }

    fun markAllDirty() {
        dirtyRows.set(0, rows)
    }

    fun updateDirtyRows(buffer: TerminalBuffer, topRow: Int, highlightCache: HighlightCache) {
        val cellW = atlas.cellWidth
        val cellH = atlas.cellHeight

        var row = dirtyRows.nextSetBit(0)
        while (row >= 0 && row < rows) {
            // Skip collapsed rows
            if (isRowCollapsed(topRow + row)) {
                row = dirtyRows.nextSetBit(row + 1)
                continue
            }

            val absRow = topRow + row
            val termRow = buffer.getRow(absRow)
            val highlights = highlightCache.getHighlights(absRow)

            for (col in 0 until cols) {
                val cellIndex = row * cols + col
                val codepoint = termRow?.getCodePoint(col) ?: ' '.code
                val style = termRow?.getStyle(col) ?: 0L

                // Decode colors from style (pass directly — matches existing SyntaxHighlighter usage)
                val fg = TextStyle.decodeForeColor(style)
                val bg = TextStyle.decodeBackColor(style)
                val highlightFg = highlights?.get(col) ?: -1

                val effectiveFg = if (highlightFg >= 0) highlightFg else fg
                val fgColor = resolveColor(effectiveFg)
                val bgColor = resolveColor(bg)

                val x = col * cellW
                val y = row * cellH

                // Background quad
                writeQuad(cellIndex * 2, x, y, cellW, cellH,
                    0f, 0f, 0f, 0f,  // no texture for bg
                    bgColor)

                // Glyph quad
                if (codepoint > 0x20) {
                    val glyph = atlas.getGlyph(codepoint)
                    writeQuad(cellIndex * 2 + 1,
                        x + glyph.bearingX, y + (atlas.baseline - glyph.bearingY),
                        glyph.width, glyph.height,
                        glyph.u0, glyph.v0, glyph.u1, glyph.v1,
                        fgColor)
                } else {
                    // Empty/space — zero-area glyph quad
                    writeQuad(cellIndex * 2 + 1, x, y, 0f, 0f, 0f, 0f, 0f, 0f, 0)
                }
            }

            // Upload this row's vertex data via glBufferSubData
            val rowStart = row * cols * QUADS_PER_CELL * VERTICES_PER_QUAD * FLOATS_PER_VERTEX
            val rowSize = cols * QUADS_PER_CELL * VERTICES_PER_QUAD * FLOATS_PER_VERTEX
            vertexData.position(rowStart)
            GLES30.glBindBuffer(GLES30.GL_ARRAY_BUFFER, vboId)
            GLES30.glBufferSubData(GLES30.GL_ARRAY_BUFFER, rowStart * 4, rowSize * 4, vertexData)

            dirtyRows.clear(row)
            row = dirtyRows.nextSetBit(row + 1)
        }
    }

    fun draw(pass: Int) {
        // pass 0 = backgrounds, pass 1 = glyphs
        GLES30.glBindBuffer(GLES30.GL_ARRAY_BUFFER, vboId)
        GLES30.glBindBuffer(GLES30.GL_ELEMENT_ARRAY_BUFFER, iboId)

        // Setup vertex attribs
        val stride = FLOATS_PER_VERTEX * 4
        GLES30.glEnableVertexAttribArray(0) // position
        GLES30.glVertexAttribPointer(0, 2, GLES30.GL_FLOAT, false, stride, 0)
        GLES30.glEnableVertexAttribArray(1) // texCoord
        GLES30.glVertexAttribPointer(1, 2, GLES30.GL_FLOAT, false, stride, 8)
        GLES30.glEnableVertexAttribArray(2) // color
        GLES30.glVertexAttribPointer(2, 4, GLES30.GL_FLOAT, false, stride, 16)

        val indicesPerRow = cols * INDICES_PER_QUAD
        for (row in 0 until rows) {
            if (isRowCollapsed(row)) continue
            val offset = row * cols * QUADS_PER_CELL * INDICES_PER_QUAD
            val quadOffset = if (pass == 0) 0 else cols * INDICES_PER_QUAD
            GLES30.glDrawElements(
                GLES30.GL_TRIANGLES,
                indicesPerRow,
                GLES30.GL_UNSIGNED_SHORT,
                ((offset + quadOffset) * 2).toLong()
            )
        }
    }

    fun setCollapsedRanges(ranges: List<IntRange>) {
        collapsedRanges.clear()
        collapsedRanges.addAll(ranges)
    }

    fun updateAnsiColors(colors: IntArray) {
        colors.copyInto(ansiColors, 0, 0, minOf(colors.size, 256))
        markAllDirty()
    }

    fun destroy() {
        if (vboId != 0) {
            GLES30.glDeleteBuffers(2, intArrayOf(vboId, iboId), 0)
            vboId = 0
            iboId = 0
        }
    }

    private fun isRowCollapsed(absRow: Int): Boolean {
        return collapsedRanges.any { absRow in it }
    }

    private fun writeQuad(
        quadIndex: Int,
        x: Float, y: Float, w: Float, h: Float,
        u0: Float, v0: Float, u1: Float, v1: Float,
        color: Int
    ) {
        val r = ((color shr 16) and 0xFF) / 255f
        val g = ((color shr 8) and 0xFF) / 255f
        val b = (color and 0xFF) / 255f
        val a = ((color shr 24) and 0xFF) / 255f

        val base = quadIndex * VERTICES_PER_QUAD * FLOATS_PER_VERTEX
        vertexData.position(base)

        // Top-left
        vertexData.put(x); vertexData.put(y)
        vertexData.put(u0); vertexData.put(v0)
        vertexData.put(r); vertexData.put(g); vertexData.put(b); vertexData.put(a)

        // Top-right
        vertexData.put(x + w); vertexData.put(y)
        vertexData.put(u1); vertexData.put(v0)
        vertexData.put(r); vertexData.put(g); vertexData.put(b); vertexData.put(a)

        // Bottom-right
        vertexData.put(x + w); vertexData.put(y + h)
        vertexData.put(u1); vertexData.put(v1)
        vertexData.put(r); vertexData.put(g); vertexData.put(b); vertexData.put(a)

        // Bottom-left
        vertexData.put(x); vertexData.put(y + h)
        vertexData.put(u0); vertexData.put(v1)
        vertexData.put(r); vertexData.put(g); vertexData.put(b); vertexData.put(a)
    }

    private fun resolveColor(colorIndex: Int): Int {
        return if (colorIndex in 0..255) ansiColors[colorIndex]
        else 0xFFFFFFFF.toInt() // default white
    }

    private fun defaultAnsiColor(index: Int): Int {
        // Standard ANSI 16 colors (ARGB)
        val base16 = intArrayOf(
            0xFF000000.toInt(), 0xFFCD0000.toInt(), 0xFF00CD00.toInt(), 0xFFCDCD00.toInt(),
            0xFF0000EE.toInt(), 0xFFCD00CD.toInt(), 0xFF00CDCD.toInt(), 0xFFE5E5E5.toInt(),
            0xFF7F7F7F.toInt(), 0xFFFF0000.toInt(), 0xFF00FF00.toInt(), 0xFFFFFF00.toInt(),
            0xFF5C5CFF.toInt(), 0xFFFF00FF.toInt(), 0xFF00FFFF.toInt(), 0xFFFFFFFF.toInt()
        )
        return when {
            index < 16 -> base16[index]
            index < 232 -> {
                // 6x6x6 color cube
                val i = index - 16
                val r = (i / 36) * 51
                val g = ((i / 6) % 6) * 51
                val b = (i % 6) * 51
                (0xFF shl 24) or (r shl 16) or (g shl 8) or b
            }
            else -> {
                // Grayscale ramp
                val v = 8 + (index - 232) * 10
                (0xFF shl 24) or (v shl 16) or (v shl 8) or v
            }
        }
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add modules/terminal-view/android/src/main/java/expo/modules/terminalview/gl/CellBatcher.kt
git commit -m "feat(gpu): add CellBatcher for TerminalRow to vertex buffer conversion"
```

---

## Task 6: ScrollAnimator + CursorAnimator

**Files:**
- Create: `modules/terminal-view/android/src/main/java/expo/modules/terminalview/gl/ScrollAnimator.kt`
- Create: `modules/terminal-view/android/src/main/java/expo/modules/terminalview/gl/CursorAnimator.kt`

- [ ] **Step 1: Create ScrollAnimator.kt**

```kotlin
package expo.modules.terminalview.gl

/**
 * Physics-based inertia scrolling.
 * Touch drag maps directly to offset. Fling uses exponential decay.
 */
class ScrollAnimator {
    private var offset = 0f
    private var velocity = 0f
    private var isFlinging = false

    companion object {
        private const val FRICTION = 0.95f  // per-frame velocity decay
        private const val MIN_VELOCITY = 0.5f
    }

    val scrollOffset: Float get() = offset

    fun setOffset(newOffset: Float) {
        offset = newOffset
        isFlinging = false
    }

    fun fling(initialVelocity: Float) {
        velocity = initialVelocity
        isFlinging = true
    }

    fun scrollToRow(row: Int, cellHeight: Float) {
        offset = -row * cellHeight
        isFlinging = false
    }

    /**
     * Call each frame. Returns true if still animating (needs another requestRender).
     */
    fun update(): Boolean {
        if (!isFlinging) return false
        offset += velocity
        velocity *= FRICTION
        if (kotlin.math.abs(velocity) < MIN_VELOCITY) {
            isFlinging = false
            velocity = 0f
        }
        return isFlinging
    }

    fun clamp(minOffset: Float, maxOffset: Float) {
        offset = offset.coerceIn(minOffset, maxOffset)
    }
}
```

- [ ] **Step 2: Create CursorAnimator.kt**

```kotlin
package expo.modules.terminalview.gl

/**
 * Cursor animation: fade blink + slide.
 * - Fade: sine wave on alpha (0.0 - 1.0)
 * - Slide: lerp from old position to new over 80ms
 */
class CursorAnimator {
    var alpha = 1.0f; private set
    var posX = 0f; private set
    var posY = 0f; private set

    private var blinkEnabled = true
    private var blinkSpeed = 3.0f  // radians per second

    // Slide animation
    private var slideStartX = 0f
    private var slideStartY = 0f
    private var slideTargetX = 0f
    private var slideTargetY = 0f
    private var slideStartTime = 0L
    private var isSliding = false

    companion object {
        private const val SLIDE_DURATION_MS = 80L
    }

    fun setBlinkEnabled(enabled: Boolean) {
        blinkEnabled = enabled
        if (!enabled) alpha = 1.0f
    }

    fun moveTo(x: Float, y: Float) {
        if (x != slideTargetX || y != slideTargetY) {
            slideStartX = posX
            slideStartY = posY
            slideTargetX = x
            slideTargetY = y
            slideStartTime = System.nanoTime()
            isSliding = true
        }
    }

    /**
     * Call each frame with elapsed time in seconds.
     * Returns true if animating (needs another requestRender).
     */
    fun update(elapsedSeconds: Float): Boolean {
        var animating = false

        // Blink
        if (blinkEnabled) {
            alpha = (kotlin.math.sin(elapsedSeconds * blinkSpeed) + 1.0f) / 2.0f
            animating = true
        }

        // Slide
        if (isSliding) {
            val elapsed = (System.nanoTime() - slideStartTime) / 1_000_000f
            val t = (elapsed / SLIDE_DURATION_MS).coerceIn(0f, 1f)
            posX = slideStartX + (slideTargetX - slideStartX) * t
            posY = slideStartY + (slideTargetY - slideStartY) * t
            if (t >= 1f) {
                isSliding = false
                posX = slideTargetX
                posY = slideTargetY
            }
            animating = true
        }

        return animating
    }
}
```

- [ ] **Step 3: Commit**

```bash
git add modules/terminal-view/android/src/main/java/expo/modules/terminalview/gl/ScrollAnimator.kt
git add modules/terminal-view/android/src/main/java/expo/modules/terminalview/gl/CursorAnimator.kt
git commit -m "feat(gpu): add ScrollAnimator and CursorAnimator"
```

---

## Task 7: PostProcessor (CRT Effect)

**Files:**
- Create: `modules/terminal-view/android/src/main/java/expo/modules/terminalview/gl/PostProcessor.kt`

- [ ] **Step 1: Create PostProcessor.kt**

```kotlin
package expo.modules.terminalview.gl

import android.content.Context
import android.opengl.GLES30

/**
 * FBO management + CRT post-process effect.
 * Renders the terminal to an offscreen FBO, then draws a fullscreen quad
 * with the CRT shader (scanlines + barrel distortion + phosphor glow).
 */
class PostProcessor(private val context: Context) {
    private var fboId = 0
    private var colorTexId = 0
    private var fullscreenVboId = 0
    private var width = 0
    private var height = 0
    var enabled = false
    var scanlineIntensity = 0.3f
    var curvature = 0.02f

    private lateinit var crtShader: ShaderProgram

    fun init(screenWidth: Int, screenHeight: Int) {
        width = screenWidth
        height = screenHeight
        crtShader = ShaderProgram(context, "shaders/passthrough_vert.glsl", "shaders/crt_frag.glsl")
        crtShader.compile()
        createFBO()
        createFullscreenQuad()
    }

    fun beginRender() {
        if (!enabled) return
        GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, fboId)
        GLES30.glViewport(0, 0, width, height)
        GLES30.glClear(GLES30.GL_COLOR_BUFFER_BIT)
    }

    fun endRenderAndApply() {
        if (!enabled) return
        // Unbind FBO — render to screen
        GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, 0)
        GLES30.glViewport(0, 0, width, height)

        crtShader.use()
        GLES30.glActiveTexture(GLES30.GL_TEXTURE0)
        GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, colorTexId)
        crtShader.setUniform1i("u_screenTexture", 0)
        crtShader.setUniform2f("u_resolution", width.toFloat(), height.toFloat())
        crtShader.setUniform1f("u_scanlineIntensity", scanlineIntensity)
        crtShader.setUniform1f("u_curvature", curvature)

        // Draw fullscreen quad
        GLES30.glBindBuffer(GLES30.GL_ARRAY_BUFFER, fullscreenVboId)
        GLES30.glEnableVertexAttribArray(0)
        GLES30.glVertexAttribPointer(0, 2, GLES30.GL_FLOAT, false, 16, 0)
        GLES30.glEnableVertexAttribArray(1)
        GLES30.glVertexAttribPointer(1, 2, GLES30.GL_FLOAT, false, 16, 8)
        GLES30.glDrawArrays(GLES30.GL_TRIANGLE_STRIP, 0, 4)
    }

    fun resize(newWidth: Int, newHeight: Int) {
        if (newWidth == width && newHeight == height) return
        width = newWidth
        height = newHeight
        destroyFBO()
        createFBO()
    }

    fun destroy() {
        destroyFBO()
        if (fullscreenVboId != 0) {
            GLES30.glDeleteBuffers(1, intArrayOf(fullscreenVboId), 0)
            fullscreenVboId = 0
        }
        crtShader.destroy()
    }

    private fun createFBO() {
        val fboIds = IntArray(1)
        GLES30.glGenFramebuffers(1, fboIds, 0)
        fboId = fboIds[0]

        val texIds = IntArray(1)
        GLES30.glGenTextures(1, texIds, 0)
        colorTexId = texIds[0]

        GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, colorTexId)
        GLES30.glTexImage2D(GLES30.GL_TEXTURE_2D, 0, GLES30.GL_RGBA, width, height, 0,
            GLES30.GL_RGBA, GLES30.GL_UNSIGNED_BYTE, null)
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_MIN_FILTER, GLES30.GL_LINEAR)
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_MAG_FILTER, GLES30.GL_LINEAR)

        GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, fboId)
        GLES30.glFramebufferTexture2D(GLES30.GL_FRAMEBUFFER, GLES30.GL_COLOR_ATTACHMENT0,
            GLES30.GL_TEXTURE_2D, colorTexId, 0)
        GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, 0)
    }

    private fun destroyFBO() {
        if (fboId != 0) {
            GLES30.glDeleteFramebuffers(1, intArrayOf(fboId), 0)
            fboId = 0
        }
        if (colorTexId != 0) {
            GLES30.glDeleteTextures(1, intArrayOf(colorTexId), 0)
            colorTexId = 0
        }
    }

    private fun createFullscreenQuad() {
        // positions (x,y) + texcoords (u,v) for a triangle strip
        val data = floatArrayOf(
            -1f, -1f, 0f, 0f,
             1f, -1f, 1f, 0f,
            -1f,  1f, 0f, 1f,
             1f,  1f, 1f, 1f
        )
        val buf = java.nio.ByteBuffer.allocateDirect(data.size * 4)
            .order(java.nio.ByteOrder.nativeOrder())
            .asFloatBuffer()
        buf.put(data).flip()

        val ids = IntArray(1)
        GLES30.glGenBuffers(1, ids, 0)
        fullscreenVboId = ids[0]
        GLES30.glBindBuffer(GLES30.GL_ARRAY_BUFFER, fullscreenVboId)
        GLES30.glBufferData(GLES30.GL_ARRAY_BUFFER, data.size * 4, buf, GLES30.GL_STATIC_DRAW)
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add modules/terminal-view/android/src/main/java/expo/modules/terminalview/gl/PostProcessor.kt
git commit -m "feat(gpu): add PostProcessor for CRT effect (FBO + scanlines + barrel distortion)"
```

---

## Task 8: GLTerminalRenderer

**Files:**
- Create: `modules/terminal-view/android/src/main/java/expo/modules/terminalview/gl/GLTerminalRenderer.kt`

- [ ] **Step 1: Create GLTerminalRenderer.kt**

```kotlin
package expo.modules.terminalview.gl

import android.content.Context
import android.opengl.GLES30
import android.opengl.GLSurfaceView
import android.opengl.Matrix
import android.util.Log
import com.termux.terminal.TerminalSession
import expo.modules.terminalemulator.ShellyTerminalSession
import javax.microedition.khronos.egl.EGLConfig
import javax.microedition.khronos.opengles.GL10

/**
 * OpenGL ES 3.0 terminal renderer.
 *
 * Rendering passes:
 *   1. Background quads (bg shader)
 *   2. Glyph quads (glyph shader + atlas texture)
 *   3. Overlays (cursor, selection)
 *   4. Block chrome (separators, badges, chevrons) — added by Command Blocks
 *
 * Post-process (CRT):
 *   Render to FBO → fullscreen quad with CRT shader
 */
class GLTerminalRenderer(private val context: Context) : GLSurfaceView.Renderer {
    companion object {
        private const val TAG = "GLTerminalRenderer"
        private const val IDLE_TIMEOUT_MS = 2000L
    }

    // Data model
    data class BlockRange(
        val commandStartRow: Int,
        val outputStartRow: Int,
        val endRow: Int,           // -1 if still running
        val exitCode: Int,         // -1 if still running
        val command: String,
        val isCollapsed: Boolean,
        val isRunning: Boolean
    )

    // Dirty flags
    object DirtyFlags {
        const val NONE    = 0
        const val CURSOR  = 1 shl 0
        const val SCROLL  = 1 shl 1
        const val CONTENT = 1 shl 2
        const val ALL     = 1 shl 3
    }

    // Core components
    private lateinit var bgShader: ShaderProgram
    private lateinit var glyphShader: ShaderProgram
    private lateinit var cursorShader: ShaderProgram
    private lateinit var selectionShader: ShaderProgram
    lateinit var atlas: GlyphAtlas; private set
    private lateinit var cellBatcher: CellBatcher
    lateinit var postProcessor: PostProcessor; private set
    val scrollAnimator = ScrollAnimator()
    val cursorAnimator = CursorAnimator()
    val highlightCache = HighlightCache()
    private lateinit var highlightWorker: HighlightWorker

    // Block ranges (synchronized access)
    val blockRanges = mutableListOf<BlockRange>()
    private val blockLock = Any()

    // Block chrome renderer (set by Task 12)
    var blockChromeRenderer: BlockChromeRenderer? = null

    // State
    private var dirtyFlags = DirtyFlags.ALL
    private var viewWidth = 0
    private var viewHeight = 0
    private var cols = 80
    private var rows = 24
    private var startTime = 0L
    private var lastDirtyTime = 0L
    private val projectionMatrix = FloatArray(16)

    // Session reference (set from GLTerminalView)
    var session: ShellyTerminalSession? = null

    // Callback for requesting renders from non-GL threads
    var requestRenderCallback: (() -> Unit)? = null

    fun addBlock(block: BlockRange) {
        synchronized(blockLock) { blockRanges.add(block) }
        markDirty(DirtyFlags.CONTENT)
    }

    fun updateBlock(index: Int, update: (BlockRange) -> BlockRange) {
        synchronized(blockLock) {
            if (index in blockRanges.indices) {
                blockRanges[index] = update(blockRanges[index])
            }
        }
        markDirty(DirtyFlags.CONTENT)
    }

    fun markDirty(flags: Int) {
        dirtyFlags = dirtyFlags or flags
        lastDirtyTime = System.currentTimeMillis()
        requestRenderCallback?.invoke()
    }

    fun onScreenUpdated() {
        markDirty(DirtyFlags.CONTENT)
        // Trigger background highlighting for visible rows
        val emulator = session?.terminalSession?.emulator ?: return
        val topRow = -(emulator.screen.activeTranscriptRows)
        highlightWorker.highlightRows(emulator.screen, topRow, topRow + rows)
    }

    // === GLSurfaceView.Renderer ===

    override fun onSurfaceCreated(gl: GL10?, config: EGLConfig?) {
        Log.i(TAG, "onSurfaceCreated")
        startTime = System.nanoTime()

        GLES30.glClearColor(0f, 0f, 0f, 1f)
        GLES30.glEnable(GLES30.GL_BLEND)
        GLES30.glBlendFunc(GLES30.GL_SRC_ALPHA, GLES30.GL_ONE_MINUS_SRC_ALPHA)

        // Compile shaders
        bgShader = ShaderProgram(context, "shaders/terminal_vert.glsl", "shaders/background_frag.glsl")
        glyphShader = ShaderProgram(context, "shaders/terminal_vert.glsl", "shaders/glyph_frag.glsl")
        cursorShader = ShaderProgram(context, "shaders/terminal_vert.glsl", "shaders/cursor_frag.glsl")
        selectionShader = ShaderProgram(context, "shaders/terminal_vert.glsl", "shaders/selection_frag.glsl")
        bgShader.compile()
        glyphShader.compile()
        cursorShader.compile()
        selectionShader.compile()

        // Build atlas with default font
        atlas = GlyphAtlas(
            android.graphics.Typeface.MONOSPACE,
            context.resources.displayMetrics.scaledDensity * 14f
        )
        atlas.build()

        // Init batcher
        cellBatcher = CellBatcher(cols, rows, atlas)
        cellBatcher.init()

        // Init highlight worker
        highlightWorker = HighlightWorker(highlightCache)

        // Init post-processor
        postProcessor = PostProcessor(context)

        dirtyFlags = DirtyFlags.ALL
    }

    override fun onSurfaceChanged(gl: GL10?, width: Int, height: Int) {
        Log.i(TAG, "onSurfaceChanged: ${width}x${height}")
        viewWidth = width
        viewHeight = height

        GLES30.glViewport(0, 0, width, height)

        // Orthographic projection: (0,0) top-left, (width, height) bottom-right
        Matrix.orthoM(projectionMatrix, 0, 0f, width.toFloat(), height.toFloat(), 0f, -1f, 1f)

        // Recalculate terminal dimensions
        cols = (width / atlas.cellWidth).toInt().coerceAtLeast(1)
        rows = (height / atlas.cellHeight).toInt().coerceAtLeast(1)
        cellBatcher.resize(cols, rows)

        postProcessor.init(width, height)

        dirtyFlags = DirtyFlags.ALL
    }

    override fun onDrawFrame(gl: GL10?) {
        val elapsed = (System.nanoTime() - startTime) / 1_000_000_000f
        val emulator = session?.terminalSession?.emulator

        // Idle detection
        if (dirtyFlags == DirtyFlags.NONE && !postProcessor.enabled) {
            return
        }

        // Post-process: begin
        postProcessor.beginRender()

        GLES30.glClear(GLES30.GL_COLOR_BUFFER_BIT)

        if (emulator != null) {
            // Update vertex data for dirty rows
            if (dirtyFlags and (DirtyFlags.CONTENT or DirtyFlags.ALL) != 0) {
                synchronized(emulator) {
                    val topRow = emulator.screen.activeTranscriptRows
                    cellBatcher.updateDirtyRows(emulator.screen, -topRow, highlightCache)
                }
            }

            // Update scroll
            if (dirtyFlags and DirtyFlags.SCROLL != 0) {
                scrollAnimator.update()
            }

            // Update cursor
            cursorAnimator.update(elapsed)

            // Pass 1: Background quads
            bgShader.use()
            bgShader.setUniformMatrix4fv("u_projection", projectionMatrix)
            bgShader.setUniform1f("u_scrollOffset", scrollAnimator.scrollOffset)
            cellBatcher.draw(0)

            // Pass 2: Glyph quads
            glyphShader.use()
            glyphShader.setUniformMatrix4fv("u_projection", projectionMatrix)
            glyphShader.setUniform1f("u_scrollOffset", scrollAnimator.scrollOffset)
            GLES30.glActiveTexture(GLES30.GL_TEXTURE0)
            // Bind atlas texture (first page — multi-page support: bind per-page in CellBatcher)
            glyphShader.setUniform1i("u_atlas", 0)
            cellBatcher.draw(1)

            // Pass 3: Cursor overlay
            cursorShader.use()
            cursorShader.setUniformMatrix4fv("u_projection", projectionMatrix)
            cursorShader.setUniform1f("u_scrollOffset", scrollAnimator.scrollOffset)
            cursorShader.setUniform1f("u_cursorAlpha", cursorAnimator.alpha)
            // Draw cursor quad at cursor position
            val cursorCol = emulator.cursorCol
            val cursorRow = emulator.cursorRow
            cursorAnimator.moveTo(cursorCol * atlas.cellWidth, cursorRow * atlas.cellHeight)
            // (cursor quad drawing delegated to a small helper — omitted for brevity,
            //  uses same vertex format as CellBatcher)

            // Pass 4: Block chrome (added by Command Blocks task)
            synchronized(blockLock) {
                blockChromeRenderer?.draw(
                    blockRanges, atlas, projectionMatrix,
                    scrollAnimator.scrollOffset, elapsed, cols
                )
            }
        }

        // Post-process: end
        postProcessor.endRenderAndApply()

        dirtyFlags = DirtyFlags.NONE
    }

    fun updateFont(typeface: android.graphics.Typeface, fontSize: Float) {
        atlas.updateFont(typeface, fontSize)
        cellBatcher.markAllDirty()
        markDirty(DirtyFlags.ALL)
    }

    fun destroy() {
        highlightWorker.shutdown()
        cellBatcher.destroy()
        atlas.destroy()
        postProcessor.destroy()
        bgShader.destroy()
        glyphShader.destroy()
        cursorShader.destroy()
        selectionShader.destroy()
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add modules/terminal-view/android/src/main/java/expo/modules/terminalview/gl/GLTerminalRenderer.kt
git commit -m "feat(gpu): add GLTerminalRenderer with 4-pass rendering pipeline"
```

---

## Task 9: GLTerminalView

**Files:**
- Create: `modules/terminal-view/android/src/main/java/expo/modules/terminalview/gl/GLTerminalView.kt`

- [ ] **Step 1: Create GLTerminalView.kt**

```kotlin
package expo.modules.terminalview.gl

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.opengl.GLSurfaceView
import android.text.InputType
import android.util.Log
import android.view.GestureDetector
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.inputmethod.BaseInputConnection
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputConnection
import android.view.inputmethod.InputMethodManager
import com.termux.terminal.TerminalSession
import com.termux.view.TerminalViewClient
import expo.modules.terminalemulator.ShellyTerminalSession
import expo.modules.terminalview.ShellyInputHandler

/**
 * GLSurfaceView-based terminal view with GPU rendering.
 * Replaces TerminalView when GPU rendering is enabled.
 *
 * Handles:
 * - InputConnection (IME, keyboard)
 * - Gesture detection (tap to focus, long-press for block panel)
 * - TerminalViewClient delegation to ShellyInputHandler
 * - Block chrome touch handling (fold/unfold, copy)
 */
class GLTerminalView(context: Context) : GLSurfaceView(context) {
    companion object {
        private const val TAG = "GLTerminalView"
        private const val LONG_PRESS_MS = 500L
    }

    val renderer = GLTerminalRenderer(context)
    private var inputHandler: ShellyInputHandler? = null
    private var shellySession: ShellyTerminalSession? = null
    private lateinit var gestureDetector: GestureDetector

    // Event callbacks (set by ShellyTerminalView)
    var onBlockLongPressEvent: ((command: String, startRow: Int, endRow: Int, exitCode: Int) -> Unit)? = null

    init {
        setEGLContextClientVersion(3)
        setRenderer(renderer)
        renderMode = RENDERMODE_WHEN_DIRTY
        preserveEGLContextOnPause = true

        isFocusable = true
        isFocusableInTouchMode = true

        renderer.requestRenderCallback = { requestRender() }

        gestureDetector = GestureDetector(context, object : GestureDetector.SimpleOnGestureListener() {
            override fun onSingleTapUp(e: MotionEvent): Boolean {
                requestFocus()
                val imm = context.getSystemService(Context.INPUT_METHOD_SERVICE) as? InputMethodManager
                imm?.showSoftInput(this@GLTerminalView, 0)
                return true
            }

            override fun onLongPress(e: MotionEvent) {
                handleLongPress(e)
            }

            override fun onScroll(e1: MotionEvent?, e2: MotionEvent, distX: Float, distY: Float): Boolean {
                renderer.scrollAnimator.setOffset(renderer.scrollAnimator.scrollOffset - distY)
                renderer.markDirty(GLTerminalRenderer.DirtyFlags.SCROLL)
                return true
            }

            override fun onFling(e1: MotionEvent?, e2: MotionEvent, velX: Float, velY: Float): Boolean {
                renderer.scrollAnimator.fling(-velY * 0.01f)
                renderer.markDirty(GLTerminalRenderer.DirtyFlags.SCROLL)
                return true
            }
        })
    }

    fun attachSession(session: ShellyTerminalSession, handler: ShellyInputHandler) {
        shellySession = session
        inputHandler = handler
        renderer.session = session

        session.onScreenUpdateCallback = {
            post { renderer.onScreenUpdated() }
        }
    }

    fun detachSession() {
        shellySession?.onScreenUpdateCallback = null
        shellySession = null
        renderer.session = null
    }

    // === InputConnection (IME support) ===

    override fun onCreateInputConnection(outAttrs: EditorInfo): InputConnection {
        outAttrs.inputType = InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD
        outAttrs.imeOptions = EditorInfo.IME_FLAG_NO_FULLSCREEN

        return object : BaseInputConnection(this, true) {
            override fun commitText(text: CharSequence, newCursorPosition: Int): Boolean {
                val session = shellySession?.terminalSession ?: return false
                val bytes = text.toString().toByteArray(Charsets.UTF_8)
                session.write(bytes, 0, bytes.size)
                return true
            }

            override fun deleteSurroundingText(beforeLength: Int, afterLength: Int): Boolean {
                val session = shellySession?.terminalSession ?: return false
                for (i in 0 until beforeLength) {
                    session.write(byteArrayOf(0x7F), 0, 1) // DEL
                }
                return true
            }

            override fun sendKeyEvent(event: KeyEvent): Boolean {
                if (event.action == KeyEvent.ACTION_DOWN) {
                    val session = shellySession?.terminalSession
                    inputHandler?.onKeyDown(event.keyCode, event, session) ?: return false
                } else if (event.action == KeyEvent.ACTION_UP) {
                    inputHandler?.onKeyUp(event.keyCode, event) ?: return false
                }
                return true
            }
        }
    }

    override fun onCheckIsTextEditor(): Boolean = true

    // === Touch Handling ===

    override fun onTouchEvent(event: MotionEvent): Boolean {
        // Check block chrome hit areas first
        if (event.action == MotionEvent.ACTION_UP) {
            if (handleBlockChromeTap(event)) return true
        }
        return gestureDetector.onTouchEvent(event) || super.onTouchEvent(event)
    }

    private fun handleBlockChromeTap(event: MotionEvent): Boolean {
        val cellW = renderer.atlas.cellWidth
        val cellH = renderer.atlas.cellHeight
        if (cellW == 0f || cellH == 0f) return false

        val row = (event.y / cellH).toInt()
        val col = (event.x / cellW).toInt()
        val cols = (width / cellW).toInt()

        synchronized(renderer) {
            val block = renderer.blockRanges.find { row == it.commandStartRow } ?: return false

            return when {
                col == 0 -> {
                    // Chevron — toggle fold
                    val idx = renderer.blockRanges.indexOf(block)
                    renderer.updateBlock(idx) { it.copy(isCollapsed = !it.isCollapsed) }
                    true
                }
                col >= cols - 1 -> {
                    // Copy button
                    copyBlockOutput(block)
                    true
                }
                else -> false
            }
        }
    }

    private fun handleLongPress(event: MotionEvent) {
        val cellH = renderer.atlas.cellHeight
        if (cellH == 0f) return
        val row = (event.y / cellH).toInt()

        synchronized(renderer) {
            val block = renderer.blockRanges.find {
                row in it.commandStartRow..(if (it.endRow >= 0) it.endRow else it.commandStartRow)
            } ?: return

            onBlockLongPressEvent?.invoke(block.command, block.commandStartRow, block.endRow, block.exitCode)
        }
    }

    private fun copyBlockOutput(block: GLTerminalRenderer.BlockRange) {
        val session = shellySession?.terminalSession?.emulator ?: return
        val sb = StringBuilder()
        val startRow = block.outputStartRow
        val endRow = if (block.endRow >= 0) block.endRow else startRow
        synchronized(session) {
            for (r in startRow..endRow) {
                val row = session.screen.getRow(r) ?: continue
                for (c in 0 until session.mColumns) {
                    val cp = row.getCodePoint(c)
                    if (cp > 0) sb.appendCodePoint(cp)
                }
                if (r < endRow) sb.append('\n')
            }
        }
        val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
        clipboard?.setPrimaryClip(ClipData.newPlainText("Block Output", sb.toString()))
    }

    fun scrollToRow(row: Int) {
        renderer.scrollAnimator.scrollToRow(row, renderer.atlas.cellHeight)
        renderer.markDirty(GLTerminalRenderer.DirtyFlags.SCROLL)
    }

    fun destroy() {
        detachSession()
        renderer.destroy()
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add modules/terminal-view/android/src/main/java/expo/modules/terminalview/gl/GLTerminalView.kt
git commit -m "feat(gpu): add GLTerminalView with IME, gesture, and block touch handling"
```

---

## Task 10: Wire GPU/Canvas Switching in ShellyTerminalView

**Files:**
- Modify: `modules/terminal-view/android/src/main/java/expo/modules/terminalview/ShellyTerminalView.kt`

- [ ] **Step 1: Add GPU rendering support to ShellyTerminalView**

The key changes to `ShellyTerminalView.kt`:
1. Add `gpuRendering` property (settable from JS prop)
2. Check GLES 3.0 support
3. When `gpuRendering=true`, create `GLTerminalView` instead of (or alongside) `TerminalView`
4. Wire `BlockDetector.onBlockStarted` callback to push `BlockRange` to GL renderer
5. Wrap `onBlockCompleted` to also update GL blockRanges

```kotlin
// Add imports at top of ShellyTerminalView.kt:
import android.app.ActivityManager
import android.opengl.GLSurfaceView
import expo.modules.terminalview.gl.GLTerminalView
import expo.modules.terminalview.gl.GLTerminalRenderer

// Add properties after existing properties:
private var glTerminalView: GLTerminalView? = null
private var useGPU = false

// Add method:
fun setGpuRendering(enabled: Boolean) {
    if (enabled == useGPU) return
    useGPU = enabled && checkGLES30Support()

    if (useGPU) {
        // Create GL view, hide Canvas view
        if (glTerminalView == null) {
            glTerminalView = GLTerminalView(context).apply {
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.MATCH_PARENT
                )
            }
            addView(glTerminalView)
        }
        terminalView.visibility = View.GONE
        glTerminalView?.visibility = View.VISIBLE

        // Re-attach session if we have one
        currentShellySession?.let { session ->
            glTerminalView?.attachSession(session, inputHandler)
        }

        // Wire block long-press event → Expo EventDispatcher → JS
        glTerminalView?.onBlockLongPressEvent = { command, startRow, endRow, exitCode ->
            onBlockLongPress(mapOf(
                "command" to command,
                "startRow" to startRow,
                "endRow" to endRow,
                "exitCode" to exitCode
            ))
        }
    } else {
        // Use Canvas, hide GL view
        terminalView.visibility = View.VISIBLE
        glTerminalView?.visibility = View.GONE
    }
}

private fun checkGLES30Support(): Boolean {
    val am = context.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager
    return (am?.deviceConfigurationInfo?.reqGlEsVersion ?: 0) >= 0x30000
}
```

Add the EventDispatcher for onBlockLongPress (alongside existing `onResize` and `onScrollStateChanged` at line 382-383):

```kotlin
private val onBlockLongPress by EventDispatcher()
```

Also modify the `blockDetector` initialization to add `onBlockStarted`:

```kotlin
// After the existing blockDetector initialization, add:
init {
    // ... existing init code ...

    // Wire block start detection for GL renderer
    blockDetector.onBlockStarted = lambda@{ command ->
        val gl = glTerminalView ?: return@lambda
        val emulator = terminalView.mEmulator ?: glTerminalView?.renderer?.session?.terminalSession?.emulator ?: return@lambda
        val cursorRow = emulator.mCursorRow
        val topRow = emulator.screen.activeTranscriptRows
        val absoluteRow = topRow + cursorRow

        gl.renderer.addBlock(GLTerminalRenderer.BlockRange(
            commandStartRow = absoluteRow,
            outputStartRow = absoluteRow + 1,
            endRow = -1, exitCode = -1,
            command = command,
            isCollapsed = false, isRunning = true
        ))
    }
}
```

And modify `attachShellySession` to handle GL path:

```kotlin
fun attachShellySession(shellySession: ShellyTerminalSession, sessionId: String) {
    currentShellySession = shellySession
    currentSessionId = sessionId

    if (useGPU && glTerminalView != null) {
        glTerminalView?.attachSession(shellySession, inputHandler)
        shellySession.onScreenUpdateCallback = {
            glTerminalView?.post { glTerminalView?.renderer?.onScreenUpdated() }
        }
    } else {
        terminalView.attachSession(shellySession.terminalSession)
        shellySession.onScreenUpdateCallback = {
            terminalView.post { terminalView.onScreenUpdated() }
        }
    }
    // ... rest of existing post-attach logic
}
```

- [ ] **Step 2: Commit**

```bash
git add modules/terminal-view/android/src/main/java/expo/modules/terminalview/ShellyTerminalView.kt
git commit -m "feat(gpu): wire GPU/Canvas switching in ShellyTerminalView"
```

---

## Task 11: Add onBlockStarted to BlockDetector + TerminalViewModule Changes

**Files:**
- Modify: `modules/terminal-view/android/src/main/java/expo/modules/terminalview/BlockDetector.kt`
- Modify: `modules/terminal-view/android/src/main/java/expo/modules/terminalview/TerminalViewModule.kt`

- [ ] **Step 1: Add onBlockStarted callback to BlockDetector**

Add a settable callback property to `BlockDetector`:

```kotlin
// After the existing constructor, add property:
var onBlockStarted: ((command: String) -> Unit)? = null
```

Then fire it when OSC 133;B is detected. In the `processOsc133` method, inside the `OSC_133_B` block, add:

```kotlin
if (text.contains(OSC_133_B_BEL) || text.contains(OSC_133_B_ST)) {
    state = State.COMMAND
    val cleaned = text
        .replace(OSC_133_A_BEL, "")
        .replace(OSC_133_A_ST, "")
        .replace(OSC_133_B_BEL, "")
        .replace(OSC_133_B_ST, "")
        .trim()
    if (cleaned.isNotEmpty()) {
        currentCommand.append(cleaned)
    }
    // NEW: fire onBlockStarted
    onBlockStarted?.invoke(currentCommand.toString().trim())
    found = true
}
```

- [ ] **Step 2: Add new events and props to TerminalViewModule**

In `TerminalViewModule.kt`:

Add `"onBlockLongPress"` to the Events list:

```kotlin
Events(
    "onOutput",
    "onBlockCompleted",
    "onBlockLongPress",   // NEW
    "onSelectionChanged",
    "onUrlDetected",
    "onBell",
    "onTitleChanged",
    "onResize",
    "onScrollStateChanged"
)
```

Add `gpuRendering` prop:

```kotlin
Prop("gpuRendering") { view: ShellyTerminalView, enabled: Boolean? ->
    view.setGpuRendering(enabled ?: false)
}
```

Add `scrollToRow` async function:

```kotlin
AsyncFunction("scrollToRow") { viewTag: Int, row: Int ->
    val view = findView(viewTag) ?: return@AsyncFunction
    // Delegate to GL view if present
    // This requires ShellyTerminalView to expose scrollToRow
    view.scrollToRowCommand(row)
}
```

- [ ] **Step 3: Add scrollToRowCommand to ShellyTerminalView**

```kotlin
fun scrollToRowCommand(row: Int) {
    glTerminalView?.scrollToRow(row) ?: run {
        // Canvas fallback: use existing setTopRow
        terminalView.setTopRow(-row)
        terminalView.invalidate()
    }
}
```

- [ ] **Step 4: Commit**

```bash
git add modules/terminal-view/android/src/main/java/expo/modules/terminalview/BlockDetector.kt
git add modules/terminal-view/android/src/main/java/expo/modules/terminalview/TerminalViewModule.kt
git add modules/terminal-view/android/src/main/java/expo/modules/terminalview/ShellyTerminalView.kt
git commit -m "feat(gpu): add onBlockStarted, onBlockLongPress event, gpuRendering prop, scrollToRow"
```

---

## Task 12: BlockChromeRenderer + BlockAnimator (Command Blocks)

**Files:**
- Create: `modules/terminal-view/android/src/main/java/expo/modules/terminalview/gl/BlockChromeRenderer.kt`
- Create: `modules/terminal-view/android/src/main/java/expo/modules/terminalview/gl/BlockAnimator.kt`

- [ ] **Step 1: Create BlockAnimator.kt**

```kotlin
package expo.modules.terminalview.gl

/**
 * Fold/unfold animation state machine.
 * Collapse: output rows slide up over 200ms with ease-out.
 * Expand: rows slide down.
 */
class BlockAnimator {
    data class Animation(
        val blockIndex: Int,
        val collapsing: Boolean,
        val startTime: Long,
        val duration: Long = 200L,
        val rowCount: Int
    )

    private var active: Animation? = null

    fun startCollapse(blockIndex: Int, rowCount: Int) {
        active = Animation(blockIndex, collapsing = true, startTime = System.nanoTime() / 1_000_000, rowCount = rowCount)
    }

    fun startExpand(blockIndex: Int, rowCount: Int) {
        active = Animation(blockIndex, collapsing = false, startTime = System.nanoTime() / 1_000_000, rowCount = rowCount)
    }

    /**
     * Returns Y offset in pixels for the block at the given index.
     * 0 = no animation / animation complete.
     */
    fun getYOffset(blockIndex: Int, cellHeight: Float): Float {
        val anim = active ?: return 0f
        if (anim.blockIndex != blockIndex) return 0f

        val now = System.nanoTime() / 1_000_000
        val elapsed = now - anim.startTime
        val t = (elapsed.toFloat() / anim.duration).coerceIn(0f, 1f)
        val eased = 1f - (1f - t) * (1f - t) // ease-out quadratic

        val totalOffset = anim.rowCount * cellHeight
        return if (anim.collapsing) {
            -totalOffset * eased
        } else {
            -totalOffset * (1f - eased)
        }
    }

    fun isAnimating(): Boolean = active != null

    /**
     * Returns true if still animating (needs requestRender).
     */
    fun update(): Boolean {
        val anim = active ?: return false
        val now = System.nanoTime() / 1_000_000
        val elapsed = now - anim.startTime
        if (elapsed >= anim.duration) {
            active = null
            return false
        }
        return true
    }
}
```

- [ ] **Step 2: Create BlockChromeRenderer.kt**

```kotlin
package expo.modules.terminalview.gl

import android.opengl.GLES30
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Draws block chrome elements in Pass 4:
 * - Separator lines between blocks
 * - Exit code badges (green ✓ / red exit code)
 * - Fold/unfold chevrons (▶/▼)
 * - Copy button icon
 */
class BlockChromeRenderer(private val atlas: GlyphAtlas) {
    companion object {
        // Colors (ARGB)
        private const val COLOR_SEPARATOR = 0x4DFFFFFF.toInt()      // dim white 30%
        private const val COLOR_BADGE_SUCCESS = 0xCC4CAF50.toInt()  // green 80%
        private const val COLOR_BADGE_ERROR = 0xCCF44336.toInt()    // red 80%
        private const val COLOR_CHEVRON = 0x80FFFFFF.toInt()        // dim white 50%
        private const val COLOR_COPY = 0x80FFFFFF.toInt()           // dim white 50%
        private const val COLOR_COLLAPSED_HINT = 0x66FFFFFF.toInt() // dim white 40%

        // Codepoints
        private const val CP_CHEVRON_RIGHT = 0x25B6  // ▶
        private const val CP_CHEVRON_DOWN = 0x25BC    // ▼
        private const val CP_CHECK = 0x2713           // ✓
        private const val CP_CLIPBOARD = 0x1F4CB      // 📋 (will fallback to atlas glyph)

        private const val FLOATS_PER_VERTEX = 8
        private const val MAX_CHROME_QUADS = 1024  // Enough for ~250 blocks
    }

    private var vboId = 0
    private var quadCount = 0
    // 6 vertices per quad (2 triangles, GL_TRIANGLES), 8 floats per vertex, 4 bytes per float
    private val vertexData = ByteBuffer.allocateDirect(MAX_CHROME_QUADS * 6 * FLOATS_PER_VERTEX * 4)
        .order(ByteOrder.nativeOrder())
        .asFloatBuffer()

    val animator = BlockAnimator()

    fun init() {
        val ids = IntArray(1)
        GLES30.glGenBuffers(1, ids, 0)
        vboId = ids[0]
    }

    fun draw(
        blocks: List<GLTerminalRenderer.BlockRange>,
        atlas: GlyphAtlas,
        projectionMatrix: FloatArray,
        scrollOffset: Float,
        elapsedSeconds: Float,
        cols: Int
    ) {
        if (blocks.isEmpty()) return

        vertexData.clear()
        quadCount = 0
        val cellW = atlas.cellWidth
        val cellH = atlas.cellHeight

        for ((index, block) in blocks.withIndex()) {
            if (block.isCollapsed && !block.isRunning) {
                drawCollapsedBlock(block, index, cellW, cellH, cols, elapsedSeconds)
            } else {
                drawExpandedBlock(block, index, cellW, cellH, cols, elapsedSeconds)
            }
        }

        if (quadCount == 0) return

        // Upload and draw
        vertexData.flip()
        GLES30.glBindBuffer(GLES30.GL_ARRAY_BUFFER, vboId)
        GLES30.glBufferData(GLES30.GL_ARRAY_BUFFER, quadCount * 4 * FLOATS_PER_VERTEX * 4, vertexData, GLES30.GL_DYNAMIC_DRAW)

        val stride = FLOATS_PER_VERTEX * 4
        GLES30.glEnableVertexAttribArray(0)
        GLES30.glVertexAttribPointer(0, 2, GLES30.GL_FLOAT, false, stride, 0)
        GLES30.glEnableVertexAttribArray(1)
        GLES30.glVertexAttribPointer(1, 2, GLES30.GL_FLOAT, false, stride, 8)
        GLES30.glEnableVertexAttribArray(2)
        GLES30.glVertexAttribPointer(2, 4, GLES30.GL_FLOAT, false, stride, 16)

        GLES30.glDrawArrays(GLES30.GL_TRIANGLES, 0, quadCount * 6)

        animator.update()
    }

    private fun drawExpandedBlock(
        block: GLTerminalRenderer.BlockRange, index: Int,
        cellW: Float, cellH: Float, cols: Int, elapsed: Float
    ) {
        val y = block.commandStartRow * cellH

        // Separator line (1px height, full width)
        val separatorColor = if (block.isRunning) {
            // Pulsing accent for running block
            val alpha = (0.3f + 0.2f * kotlin.math.sin(elapsed * 4f))
            colorWithAlpha(0xFF00D4AA.toInt(), alpha)
        } else {
            COLOR_SEPARATOR
        }
        addQuad(0f, y - 1f, cols * cellW, 1f, separatorColor)

        // Chevron (col 0)
        val chevronCp = CP_CHEVRON_DOWN
        val chevronGlyph = atlas.getGlyph(chevronCp)
        addTexturedQuad(0f, y, cellW, cellH, chevronGlyph, COLOR_CHEVRON)

        // Exit code badge (right side, 3 cells wide)
        val badgeX = (cols - 4) * cellW
        if (!block.isRunning) {
            val badgeColor = if (block.exitCode == 0) COLOR_BADGE_SUCCESS else COLOR_BADGE_ERROR
            addQuad(badgeX, y, 3 * cellW, cellH, badgeColor)

            // Badge text: ✓ or exit code
            val badgeText = if (block.exitCode == 0) CP_CHECK else ('0'.code + (block.exitCode % 10))
            val badgeGlyph = atlas.getGlyph(badgeText)
            addTexturedQuad(badgeX + cellW, y, cellW, cellH, badgeGlyph, 0xFFFFFFFF.toInt())
        } else {
            // Pulsing accent badge for running
            val alpha = (0.4f + 0.3f * kotlin.math.sin(elapsed * 3f))
            addQuad(badgeX, y, 3 * cellW, cellH, colorWithAlpha(0xFF00D4AA.toInt(), alpha))
        }

        // Copy button (rightmost column)
        val copyGlyph = atlas.getGlyph(CP_CLIPBOARD)
        addTexturedQuad((cols - 1) * cellW, y, cellW, cellH, copyGlyph, COLOR_COPY)
    }

    private fun drawCollapsedBlock(
        block: GLTerminalRenderer.BlockRange, index: Int,
        cellW: Float, cellH: Float, cols: Int, elapsed: Float
    ) {
        val y = block.commandStartRow * cellH

        // Separator line
        addQuad(0f, y - 1f, cols * cellW, 1f, COLOR_SEPARATOR)

        // Collapsed chevron (▶)
        val chevronGlyph = atlas.getGlyph(CP_CHEVRON_RIGHT)
        addTexturedQuad(0f, y, cellW, cellH, chevronGlyph, COLOR_CHEVRON)

        // "[N lines]" hint text
        val lineCount = if (block.endRow >= 0) block.endRow - block.outputStartRow + 1 else 0
        val hintText = "[$lineCount lines]"
        var hintX = (cols / 2) * cellW // center-ish
        for (ch in hintText) {
            val glyph = atlas.getGlyph(ch.code)
            addTexturedQuad(hintX, y, cellW, cellH, glyph, COLOR_COLLAPSED_HINT)
            hintX += cellW
        }

        // Exit code badge + copy button (inline, NOT calling drawExpandedBlock to avoid double-draw)
        val badgeX = (cols - 4) * cellW
        if (!block.isRunning) {
            val badgeColor = if (block.exitCode == 0) COLOR_BADGE_SUCCESS else COLOR_BADGE_ERROR
            addQuad(badgeX, y, 3 * cellW, cellH, badgeColor)
            val badgeText = if (block.exitCode == 0) CP_CHECK else ('0'.code + (block.exitCode % 10))
            val badgeGlyph = atlas.getGlyph(badgeText)
            addTexturedQuad(badgeX + cellW, y, cellW, cellH, badgeGlyph, 0xFFFFFFFF.toInt())
        }
        val copyGlyph = atlas.getGlyph(CP_CLIPBOARD)
        addTexturedQuad((cols - 1) * cellW, y, cellW, cellH, copyGlyph, COLOR_COPY)
    }

    private fun addQuad(x: Float, y: Float, w: Float, h: Float, color: Int) {
        if (quadCount >= MAX_CHROME_QUADS) return
        val r = ((color shr 16) and 0xFF) / 255f
        val g = ((color shr 8) and 0xFF) / 255f
        val b = (color and 0xFF) / 255f
        val a = ((color shr 24) and 0xFF) / 255f

        // Two triangles for one quad
        fun vertex(vx: Float, vy: Float) {
            vertexData.put(vx); vertexData.put(vy)
            vertexData.put(0f); vertexData.put(0f) // no texture
            vertexData.put(r); vertexData.put(g); vertexData.put(b); vertexData.put(a)
        }

        vertex(x, y); vertex(x + w, y); vertex(x + w, y + h)
        vertex(x, y); vertex(x + w, y + h); vertex(x, y + h)
        quadCount++
    }

    private fun addTexturedQuad(x: Float, y: Float, w: Float, h: Float, glyph: GlyphAtlas.GlyphInfo, color: Int) {
        if (quadCount >= MAX_CHROME_QUADS) return
        val r = ((color shr 16) and 0xFF) / 255f
        val g = ((color shr 8) and 0xFF) / 255f
        val b = (color and 0xFF) / 255f
        val a = ((color shr 24) and 0xFF) / 255f

        fun vertex(vx: Float, vy: Float, u: Float, v: Float) {
            vertexData.put(vx); vertexData.put(vy)
            vertexData.put(u); vertexData.put(v)
            vertexData.put(r); vertexData.put(g); vertexData.put(b); vertexData.put(a)
        }

        vertex(x, y, glyph.u0, glyph.v0)
        vertex(x + w, y, glyph.u1, glyph.v0)
        vertex(x + w, y + h, glyph.u1, glyph.v1)
        vertex(x, y, glyph.u0, glyph.v0)
        vertex(x + w, y + h, glyph.u1, glyph.v1)
        vertex(x, y + h, glyph.u0, glyph.v1)
        quadCount++
    }

    private fun colorWithAlpha(color: Int, alpha: Float): Int {
        val a = (alpha * 255).toInt().coerceIn(0, 255)
        return (color and 0x00FFFFFF) or (a shl 24)
    }

    fun destroy() {
        if (vboId != 0) {
            GLES30.glDeleteBuffers(1, intArrayOf(vboId), 0)
            vboId = 0
        }
    }
}
```

- [ ] **Step 3: Wire BlockChromeRenderer into GLTerminalRenderer**

In `GLTerminalRenderer.onSurfaceCreated()`, add after post-processor init:

```kotlin
// Init block chrome renderer
val chrome = BlockChromeRenderer(atlas)
chrome.init()
blockChromeRenderer = chrome
```

- [ ] **Step 4: Commit**

```bash
git add modules/terminal-view/android/src/main/java/expo/modules/terminalview/gl/BlockAnimator.kt
git add modules/terminal-view/android/src/main/java/expo/modules/terminalview/gl/BlockChromeRenderer.kt
git add modules/terminal-view/android/src/main/java/expo/modules/terminalview/gl/GLTerminalRenderer.kt
git commit -m "feat(blocks): add BlockChromeRenderer and BlockAnimator for native command block chrome"
```

---

## Task 13: CI Build Verification

**Files:** None (verification only)

- [ ] **Step 1: Trigger CI build**

```bash
cd ~/Shelly
git push origin HEAD
```

Wait for GitHub Actions to run the Android build workflow.

- [ ] **Step 2: Check CI results**

```bash
gh run list --limit 1
gh run view <run-id>
```

Expected: Build succeeds. If Kotlin compilation errors occur, fix them and push again.

- [ ] **Step 3: Download and test APK**

If build passes, download the APK artifact and install on device for visual verification:
- GPU rendering toggle in settings works
- Terminal displays text correctly with GPU renderer
- Block separators, badges, and chevrons render
- Fold/unfold animation works
- CRT effect toggles on/off
- Canvas fallback works when GPU is disabled
- IME input (Japanese) works in GL mode

---

## Summary

| Task | Component | Est. LOC |
|------|-----------|----------|
| 1 | ShaderProgram | ~80 |
| 2 | GLSL shaders + build.gradle | ~90 |
| 3 | GlyphAtlas | ~180 |
| 4 | HighlightCache + HighlightWorker + SyntaxHighlighter | ~60 |
| 5 | CellBatcher | ~250 |
| 6 | ScrollAnimator + CursorAnimator | ~100 |
| 7 | PostProcessor | ~130 |
| 8 | GLTerminalRenderer | ~200 |
| 9 | GLTerminalView | ~180 |
| 10 | ShellyTerminalView GPU wiring | ~80 |
| 11 | BlockDetector + TerminalViewModule changes | ~40 |
| 12 | BlockChromeRenderer + BlockAnimator | ~250 |
| 13 | CI verification | 0 |
| **Total** | | **~1,640** |
