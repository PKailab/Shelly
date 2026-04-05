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
