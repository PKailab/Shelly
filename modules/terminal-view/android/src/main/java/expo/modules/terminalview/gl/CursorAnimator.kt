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
    private var blinkSpeed = 3.0f

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

    fun update(elapsedSeconds: Float): Boolean {
        var animating = false

        if (blinkEnabled) {
            alpha = (kotlin.math.sin(elapsedSeconds * blinkSpeed) + 1.0f) / 2.0f
            animating = true
        }

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
