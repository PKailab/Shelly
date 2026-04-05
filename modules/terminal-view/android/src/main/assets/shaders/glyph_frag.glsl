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
