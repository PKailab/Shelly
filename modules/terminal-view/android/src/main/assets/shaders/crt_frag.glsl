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
