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
