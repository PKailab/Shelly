#version 300 es
precision mediump float;

in vec4 v_color;

uniform float u_cursorAlpha;

out vec4 fragColor;

void main() {
    fragColor = vec4(v_color.rgb, v_color.a * u_cursorAlpha);
}
