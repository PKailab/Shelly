package expo.modules.terminalview.gl

import android.content.Context
import android.opengl.GLES30
import java.nio.ByteBuffer
import java.nio.ByteOrder

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
        GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, 0)
        GLES30.glViewport(0, 0, width, height)

        crtShader.use()
        GLES30.glActiveTexture(GLES30.GL_TEXTURE0)
        GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, colorTexId)
        crtShader.setUniform1i("u_screenTexture", 0)
        crtShader.setUniform2f("u_resolution", width.toFloat(), height.toFloat())
        crtShader.setUniform1f("u_scanlineIntensity", scanlineIntensity)
        crtShader.setUniform1f("u_curvature", curvature)

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
        if (::crtShader.isInitialized) crtShader.destroy()
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
        val data = floatArrayOf(
            -1f, -1f, 0f, 0f,
             1f, -1f, 1f, 0f,
            -1f,  1f, 0f, 1f,
             1f,  1f, 1f, 1f
        )
        val buf = ByteBuffer.allocateDirect(data.size * 4)
            .order(ByteOrder.nativeOrder())
            .asFloatBuffer()
        buf.put(data).flip()

        val ids = IntArray(1)
        GLES30.glGenBuffers(1, ids, 0)
        fullscreenVboId = ids[0]
        GLES30.glBindBuffer(GLES30.GL_ARRAY_BUFFER, fullscreenVboId)
        GLES30.glBufferData(GLES30.GL_ARRAY_BUFFER, data.size * 4, buf, GLES30.GL_STATIC_DRAW)
    }
}
