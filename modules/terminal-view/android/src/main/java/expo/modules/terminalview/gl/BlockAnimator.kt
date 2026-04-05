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
