import { COMMON, DEPTH_CHUNK } from "./core";

/** Exposure / overcast / white balance / contrast / saturation. Linear in, linear out. */
export const GRADE_FS = /* glsl */ `
${COMMON}
uniform sampler2D uScene;
uniform float uExposure;
uniform float uContrast;
uniform float uTemperature;
uniform float uSaturation;
uniform float uOvercast;
in vec2 vUv;
out vec4 fragColor;
void main() {
  vec3 c = texture(uScene, vUv).rgb;
  c *= exp2(uExposure);
  if (uOvercast > 0.0) {
    // Overcast is a tone treatment only (no cloud rendering): compress highlights,
    // lift shadows slightly, desaturate, and cool the neutrals.
    float l = luma(c);
    vec3 flat_ = c / (1.0 + 0.6 * c);
    flat_ = mix(vec3(l), flat_, 0.8);
    flat_ = flat_ * vec3(0.94, 0.97, 1.03) + 0.015;
    c = mix(c, flat_ * 1.08, uOvercast);
  }
  float t = uTemperature * 0.18;
  c *= vec3(1.0 + t, 1.0 + t * 0.15, 1.0 - t);
  c = 0.18 * pow(max(c, 0.0) / 0.18, vec3(uContrast));
  float l2 = luma(c);
  c = mix(vec3(l2), c, uSaturation);
  fragColor = vec4(max(c, 0.0), 1.0);
}
`;

export const BRIGHT_FS = /* glsl */ `
${COMMON}
uniform sampler2D uSrc;
uniform float uThreshold;
in vec2 vUv;
out vec4 fragColor;
void main() {
  vec3 c = texture(uSrc, vUv).rgb;
  float l = luma(c);
  float k = smoothstep(uThreshold - 0.15, uThreshold + 0.35, l);
  fragColor = vec4(c * k, 1.0);
}
`;

export const BLUR_FS = /* glsl */ `
precision highp float;
uniform sampler2D uSrc;
uniform vec2 uDir; // texel step
in vec2 vUv;
out vec4 fragColor;
void main() {
  float w[5] = float[5](0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216);
  vec3 c = texture(uSrc, vUv).rgb * w[0];
  for (int i = 1; i < 5; i++) {
    c += texture(uSrc, vUv + uDir * float(i)).rgb * w[i];
    c += texture(uSrc, vUv - uDir * float(i)).rgb * w[i];
  }
  fragColor = vec4(c, 1.0);
}
`;

/**
 * Final pass: composes graded scene + bloom, applies the optional "rain on glass" layer
 * (refracting the composed scene), and encodes to sRGB. Used identically for preview and export.
 */
export const FINAL_FS = /* glsl */ `
${COMMON}
uniform sampler2D uGraded;
uniform sampler2D uBloomA;
uniform sampler2D uBloomB;
uniform float uBloom;
uniform vec2 uRes;
uniform float uTime;
uniform int uSeed;
uniform int uGlassOn;
uniform float uCoverage;
uniform float uDropR;
uniform float uDropVar;
uniform float uRefract;
uniform float uGHighlight;
uniform float uEdgeSoft;
uniform float uSlide;
uniform float uTrail;
uniform float uCoalesce;
uniform float uGlassFog;
uniform vec3 uKeyDir;
uniform vec3 uKeyColor;
uniform float uKeyIntensity;
in vec2 vUv;
out vec4 fragColor;

vec3 sampleScene(vec2 uv, float lod) {
  return textureLod(uGraded, uv, lod).rgb
       + (texture(uBloomA, uv).rgb * 0.65 + texture(uBloomB, uv).rgb * 0.35) * uBloom;
}

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (a - b) / k, 0.0, 1.0);
  return mix(a, b, h) - k * h * (1.0 - h);
}

// Signed distance to the merged droplet field. p is in image-height units (x scaled by aspect).
// Also returns the radius and centre of the nearest droplet (used for the shading normal).
float dropField(vec2 p, float cs, out float rOut, out vec2 cOut) {
  float d = 1e3;
  rOut = uDropR;
  cOut = p + vec2(0.0, 1.0);
  float k = uCoalesce * cs * 0.3 + 1e-5;
  uint seed = uint(uSeed);
  float cw = cs * 1.5;
  float H = 1.0 + 4.0 * cs;
  float colActive = clamp(uCoverage * 0.8 + 0.1, 0.0, 1.0);
  vec2 g = p / cs;
  ivec2 c = ivec2(floor(g));
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    ivec2 cc = c + ivec2(i, j);
    vec4 h = hash4(cellKey(cc, seed + 51u));
    if (h.x > uCoverage) continue;
    vec2 center = (vec2(cc) + 0.5 + (h.yz - 0.5) * 0.55) * cs;
    float r = uDropR * (1.0 + (h.w - 0.5) * 2.0 * uDropVar) * mix(0.55, 1.0, hashF(cellKey(cc, seed + 99u)));
    if (uSlide > 0.0) {
      // Coalescence: a passing slider absorbs static droplets in its path; they regrow slowly.
      float col = floor(center.x / cw);
      vec4 hk = hash4(cellKey(ivec2(int(col), 0), seed + 7u));
      if (hk.x < colActive) {
        float v = uSlide * (0.05 + 0.1 * hk.y);
        float ys = 1.0 + 2.0 * cs - mod(uTime * v + hk.z * H, H);
        float xs = (col + 0.5) * cw + sin(center.y * 40.0 + hk.w * 6.2831853) * cw * 0.15;
        float rs = uDropR * 1.35;
        float hit = step(abs(xs - center.x), rs + r * 0.6);
        float passed = step(ys, center.y);
        float age = (center.y - ys) / max(v, 1e-4);
        float regrow = smoothstep(0.0, 0.5 * H / max(v, 1e-4), age);
        r *= 1.0 - uCoalesce * hit * passed * (1.0 - regrow);
      }
    }
    if (r < 1e-5) continue;
    float di = length(p - center) - r;
    if (di < d) { rOut = r; cOut = center; }
    d = smin(d, di, k);
  }
  if (uSlide > 0.0) {
    float colP = floor(p.x / cw);
    for (int i = -1; i <= 1; i++) {
      float col = colP + float(i);
      vec4 hk = hash4(cellKey(ivec2(int(col), 0), seed + 7u));
      if (hk.x > colActive) continue;
      float v = uSlide * (0.05 + 0.1 * hk.y);
      float ys = 1.0 + 2.0 * cs - mod(uTime * v + hk.z * H, H);
      float progress = clamp((1.0 + 2.0 * cs - ys) / H, 0.0, 1.0);
      float xs = (col + 0.5) * cw + sin(ys * 40.0 + hk.w * 6.2831853) * cw * 0.15;
      float rs = uDropR * 1.35 * (1.0 + uCoalesce * 0.5 * progress);
      vec2 dp = p - vec2(xs, ys);
      dp.y = dp.y > 0.0 ? dp.y * 0.75 : dp.y;
      float ds = length(dp) - rs;
      if (ds < d) { rOut = rs; cOut = vec2(xs, ys); }
      d = smin(d, ds, k);
      if (uTrail > 0.0) {
        float tc = cs * 0.45;
        float m = floor(p.y / tc);
        for (int jj = -1; jj <= 1; jj++) {
          float mm = m + float(jj);
          float yt = (mm + 0.5) * tc;
          if (yt <= ys + rs) continue;
          vec4 ht = hash4(cellKey(ivec2(int(col), int(mm)), seed + 33u));
          if (ht.x > uTrail) continue;
          float age = (yt - ys) / max(v, 1e-4);
          float life = 0.35 * H / max(v, 1e-4);
          float rt = uDropR * 0.4 * mix(0.6, 1.0, ht.y) * (1.0 - clamp(age / life, 0.0, 1.0));
          if (rt < 1e-5) continue;
          float xt = (col + 0.5) * cw + sin(yt * 40.0 + hk.w * 6.2831853) * cw * 0.15 + (ht.z - 0.5) * rs * 0.8;
          float dt = length(p - vec2(xt, yt)) - rt;
          if (dt < d) { rOut = rt; cOut = vec2(xt, yt); }
          d = smin(d, dt, k);
        }
      }
    }
  }
  return d;
}

void main() {
  vec2 uv = vUv;
  vec3 col;
  if (uGlassOn == 1) {
    float aspect = uRes.x / uRes.y;
    vec2 p = vec2(uv.x * aspect, uv.y);
    float cs = uDropR * 3.2;
    float r0; vec2 c0;
    float d0 = dropField(p, cs, r0, c0);
    // Shading normal from the nearest droplet centre (analytic; avoids extra field evaluations).
    vec2 toC = p - c0;
    float tl = length(toC);
    vec2 gdir = tl > 1e-5 ? toC / tl : vec2(0.0, 1.0);
    float rr = max(r0, 1e-4);
    float q = clamp(-d0 / rr, 0.0, 1.0);
    float inside = smoothstep(0.0, uEdgeSoft * rr * 0.6 + 1.0 / uRes.y, -d0);
    vec3 base = sampleScene(uv, uGlassFog * 3.0);
    if (inside > 0.001) {
      vec2 n2 = gdir * (1.0 - q);
      float nz = sqrt(max(1.0 - dot(n2, n2), 0.0));
      vec2 off = -n2 * uRefract * rr * 2.2;
      off.x /= aspect;
      vec3 refr = sampleScene(clamp(uv + off, 0.002, 0.998), 0.0);
      float rim = smoothstep(0.28, 0.0, q) * 0.3;
      vec3 L = normalize(vec3(uKeyDir.xy * 1.5, 1.0));
      vec3 Hh = normalize(L + vec3(0.0, 0.0, 1.0));
      float spec = pow(max(dot(vec3(n2, nz), Hh), 0.0), 48.0) * uGHighlight;
      vec3 dropCol = refr * (1.0 - rim) * (1.05 + 0.08 * q) + uKeyColor * spec * 0.6 * (0.3 + uKeyIntensity * 0.7);
      col = mix(base, dropCol, inside);
    } else {
      col = base;
    }
  } else {
    col = sampleScene(uv, 0.0);
  }
  fragColor = vec4(toSRGB(col), 1.0);
}
`;

/** Display pass: maps the final composition onto the canvas with zoom/pan; overlays are preview-only. */
export const DISPLAY_FS = /* glsl */ `
${COMMON}
${DEPTH_CHUNK}
uniform sampler2D uFinal;
uniform sampler2D uImage;
uniform sampler2D uOverlayMask;
uniform int uOverlayMode; // 0 none, 1 wet mask, 2 protect mask, 3 depth guide
uniform vec4 uViewRect;   // x, y, w, h in device pixels (origin bottom-left)
uniform float uSplit;     // -1 = off, else image-space x of the wipe
uniform int uShowOriginal;
uniform vec3 uBg;
out vec4 fragColor;
void main() {
  vec2 px = gl_FragCoord.xy;
  vec2 uv = (px - uViewRect.xy) / uViewRect.zw;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) { fragColor = vec4(uBg, 1.0); return; }
  vec3 c = texture(uFinal, uv).rgb;
  bool original = uShowOriginal == 1 || (uSplit >= 0.0 && uv.x < uSplit);
  if (original) c = toSRGB(texture(uImage, uv).rgb);
  if (uSplit >= 0.0 && abs(uv.x - uSplit) * uViewRect.z < 1.0) c = vec3(1.0);
  if (uOverlayMode == 1 || uOverlayMode == 2) {
    float m = texture(uOverlayMask, uv).r;
    vec3 tint = uOverlayMode == 1 ? vec3(0.2, 0.75, 1.0) : vec3(1.0, 0.45, 0.2);
    c = mix(c, tint, m * 0.45);
  } else if (uOverlayMode == 3) {
    float d = sceneDepth01(uv);
    c = mix(c, vec3(1.0 - d, 0.5, d), 0.55);
  }
  fragColor = vec4(c, 1.0);
}
`;
