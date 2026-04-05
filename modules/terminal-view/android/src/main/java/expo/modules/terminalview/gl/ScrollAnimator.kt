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
        private const val FRICTION = 0.95f
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
