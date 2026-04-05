#version 300 es
precision mediump float;

in vec4 v_color;

uniform float u_time;

out vec4 fragColor;

void main() {
    float pulse = 0.15 + 0.15 * sin(u_time * 2.0);
    fragColor = vec4(v_color.rgb, pulse);
}
