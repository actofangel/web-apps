/**
 * GLSL ES 3.00 shader sources (used with THREE.RawShaderMaterial + GLSL3).
 *
 * Research notes
 * - Streak geometry: length = projected velocity × exposure time (Garg & Nayar, "Photorealistic
 *   Rendering of Rain Streaks", 2006; "Vision and Rain", 2007). Implemented directly.
 * - Streak opacity: a pixel sees a drop only for a fraction of the exposure; that fraction
 *   (~ drop width / streak length) scales how much the drop replaces the background
 *   (Garg & Nayar, "Vision and Rain", Sec. 4). Implemented as `expFrac`, plus an artistic gain.
 * - Drop radiance: drops refract a wide field of view (mostly the sky/environment) and are usually
 *   brighter than their local background (Garg & Nayar). Approximated with a wide-neighbourhood
 *   average of the photo + a global average + a forward-peaked phase function for the key light.
 *   This is an approximation; it does not reconstruct the drop's refraction geometry.
 * - Terminal velocity: Atlas, Srivastava & Sekhon (1973) fit  v = 9.65 − 10.3·exp(−0.6·D)  [m/s, D in mm].
 * - Drop size spread: exponential (Marshall–Palmer-shaped) distribution around a user-set mean.
 * - Brightness oscillation along the streak: inspired by drop-shape oscillations in Garg & Nayar's
 *   streak database, approximated here with a per-drop sinusoidal modulation (artistic).
 */

export const COMMON = /* glsl */ `
precision highp float;
precision highp int;

uint hashU(uint x) {
  x ^= x >> 16u; x *= 0x7feb352du; x ^= x >> 15u; x *= 0x846ca68bu; x ^= x >> 16u;
  return x;
}
float hashF(uint x) { return float(hashU(x)) * (1.0 / 4294967296.0); }
vec4 hash4(uint n) {
  return vec4(hashF(n), hashF(n ^ 0x68bc21ebu), hashF(n ^ 0x02e5be93u), hashF(n ^ 0x967a889bu));
}
uint cellKey(ivec2 c, uint salt) {
  return (uint(c.x + 65536) * 0x8da6b343u) ^ (uint(c.y + 65536) * 0xd8163841u) ^ (salt * 0x9e3779b9u);
}
float vnoise(vec2 p, uint salt) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  ivec2 c = ivec2(i);
  float a = hashF(cellKey(c, salt));
  float b = hashF(cellKey(c + ivec2(1, 0), salt));
  float cc = hashF(cellKey(c + ivec2(0, 1), salt));
  float d = hashF(cellKey(c + ivec2(1, 1), salt));
  return mix(mix(a, b, f.x), mix(cc, d, f.x), f.y);
}
float fbm(vec2 p, uint salt) {
  float v = 0.0; float a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * vnoise(p, salt + uint(i) * 7919u); p = p * 2.03 + 17.1; a *= 0.5; }
  return v;
}
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 toSRGB(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
float hg(float c, float g) {
  float d = 1.0 + g * g - 2.0 * g * c;
  return (1.0 - g * g) / (12.566371 * pow(max(d, 1e-4), 1.5));
}
vec2 rot2(vec2 p, float a) { float s = sin(a), c = cos(a); return vec2(p.x * c - p.y * s, p.x * s + p.y * c); }
`;

export const CAMERA_CHUNK = /* glsl */ `
uniform vec2 uRes;
uniform float uFocal;
uniform float uTime;
uniform int uSeed;
vec3 viewDirFromUV(vec2 uv) { vec2 p = (uv - 0.5) * uRes; return normalize(vec3(p.x, p.y, uFocal)); }
`;

export const LIGHT_CHUNK = /* glsl */ `
uniform float uAmbient;
uniform vec3 uKeyDir;
uniform vec3 uKeyColor;
uniform float uKeyIntensity;
uniform float uBacklight;
`;

export const DEPTH_CHUNK = /* glsl */ `
uniform sampler2D uDepthMap;
uniform int uHasDepth;
uniform int uDepthInvert;
uniform float uDepthNear;
uniform float uDepthFar;
uniform float uGradHorizon;
float sceneDepth01(vec2 uv) {
  if (uHasDepth == 1) {
    float v = textureLod(uDepthMap, uv, 0.0).r;
    float near01 = (uDepthInvert == 1) ? (1.0 - v) : v;
    return 1.0 - near01;
  }
  return smoothstep(0.0, max(uGradHorizon, 0.02), uv.y);
}
float sceneDepthMeters(vec2 uv) { return mix(uDepthNear, uDepthFar, sceneDepth01(uv)); }
`;

export const MIST_CHUNK = /* glsl */ `
uniform int uAtmoOn;
uniform float uMistDensity;
uniform vec3 uMistColor;
uniform float uNearHaze;
uniform float uFarHaze;
uniform float uDrift;
float mistFactor(float d01, vec2 uv) {
  if (uAtmoOn == 0) return 0.0;
  float haze = mix(uNearHaze, uFarHaze, d01);
  float n = fbm(uv * vec2(2.2, 1.6) + vec2(uTime * 0.013, uTime * 0.004), uint(uSeed) + 77u);
  float drift = 1.0 + uDrift * 1.2 * (n - 0.5);
  float dens = uMistDensity * 2.0 * haze * drift;
  return 1.0 - exp(-max(dens, 0.0));
}
vec3 mistRadiance(vec3 viewDir) {
  float c = dot(viewDir, uKeyDir);
  float glow = hg(c, 0.65) / hg(1.0, 0.65);
  return uMistColor * (0.35 + 0.65 * uAmbient) + uKeyColor * uKeyIntensity * 0.12 * glow * (1.0 + uBacklight);
}
`;

export const FULLSCREEN_VS = /* glsl */ `
precision highp float;
in vec3 position;
out vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

/** Scene pass: image → wet surfaces (masked) → atmosphere. Linear output. */
export const SCENE_FS = /* glsl */ `
${COMMON}
${CAMERA_CHUNK}
${LIGHT_CHUNK}
${DEPTH_CHUNK}
${MIST_CHUNK}
uniform sampler2D uImage;
uniform sampler2D uWetMask;
uniform int uWetOn;
uniform float uWetness;
uniform float uReflStrength;
uniform float uRoughness;
uniform float uReflBlur;
uniform float uRippleAmt;
uniform float uRippleScale;
uniform float uWetHighlight;
uniform float uHorizonY;
uniform float uTilt;
uniform float uMaskFeather;
uniform float uSoftness;
in vec2 vUv;
out vec4 fragColor;

// Expanding ring wave packets on a perspective ground grid (deterministic in time).
float rippleHeight(vec2 q, uint salt) {
  float h = 0.0;
  ivec2 c = ivec2(floor(q));
  float density = clamp(uRippleAmt * 1.5, 0.0, 1.0);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    ivec2 cc = c + ivec2(i, j);
    vec4 r = hash4(cellKey(cc, salt));
    if (r.x > density) continue;
    vec2 center = vec2(cc) + 0.2 + 0.6 * r.yz;
    float period = 0.7 + 1.1 * r.w;
    float ph = fract(uTime / period + r.x * 7.31);
    float dist = length(q - center);
    float R = ph * 1.5;
    float amp = (1.0 - ph); amp *= amp;
    float x = (dist - R) * 10.0;
    h += amp * sin(x) * exp(-x * x * 0.12);
  }
  return h;
}

vec3 wetSurface(vec3 base, vec2 uv, out float maskOut) {
  float m = textureLod(uWetMask, uv, uMaskFeather * 4.0).r;
  maskOut = m;
  if (m < 0.002) return base;
  float tilt = radians(uTilt);
  vec2 p = rot2(uv - vec2(0.5, uHorizonY), -tilt);
  float below = -p.y;
  float groundFade = smoothstep(0.0, 0.06, below);
  float bh = max(below, 0.02);
  // Perspective ground coordinates relative to the horizon guide.
  vec2 g = vec2(p.x / bh, 1.0 / bh) * (2.2 / max(uRippleScale, 0.05));
  uint salt = uint(uSeed) + 913u;
  float e = 0.03;
  float h0 = rippleHeight(g, salt);
  float hx = rippleHeight(g + vec2(e, 0.0), salt);
  float hy = rippleHeight(g + vec2(0.0, e), salt);
  vec2 grad = vec2(hx - h0, hy - h0) / e * uRippleAmt * groundFade;
  // Screen-space reflection: mirror about the horizon guide (artistic approximation).
  vec2 pr = vec2(p.x, -p.y);
  vec2 uvR = rot2(pr, tilt) + vec2(0.5, uHorizonY);
  uvR += grad * 0.012 * bh;
  float valid = (uvR.y <= 1.0 && uvR.y >= 0.0 && uvR.x >= 0.0 && uvR.x <= 1.0) ? 1.0 : 0.0;
  valid *= smoothstep(1.0, 0.96, uvR.y);
  uvR = clamp(uvR, 0.0, 1.0);
  float lod = uReflBlur * 3.5 + uRoughness * (1.5 + 2.0 * below);
  float stretch = uRoughness * 0.05 * below;
  vec3 refl = textureLod(uImage, uvR, lod).rgb * 0.5
            + textureLod(uImage, uvR + vec2(0.0, stretch), lod).rgb * 0.25
            + textureLod(uImage, uvR - vec2(0.0, stretch), lod).rgb * 0.25;
  float l = luma(base);
  vec3 wetBase = mix(vec3(l), base, 1.0 + 0.25 * uWetness) * mix(1.0, 0.5, uWetness);
  float fres = mix(1.0, 0.25, smoothstep(0.0, 0.6, below));
  float reflAmt = uReflStrength * uWetness * fres * valid * groundFade * (1.0 - 0.4 * uRoughness);
  vec3 surf = wetBase * (1.0 - reflAmt) + refl * reflAmt;
  // Key-light glare on the water film (Blinn-Phong-style lobe on a perturbed up-facing plane).
  vec3 V = viewDirFromUV(uv);
  float k = 0.35;
  vec3 N = normalize(vec3(grad.x * k, 1.0, -grad.y * k));
  vec3 R = reflect(V, N);
  float shin = mix(180.0, 6.0, uRoughness);
  float spec = pow(max(dot(R, uKeyDir), 0.0), shin) * (shin + 2.0) / 40.0;
  surf += uKeyColor * spec * uKeyIntensity * uWetHighlight * uWetness * groundFade * 0.6;
  surf += uMistColor * uAmbient * 0.04 * fres * uWetness * groundFade;
  return mix(base, surf, m);
}

void main() {
  vec2 uv = vUv;
  vec3 base = texture(uImage, uv).rgb;
  vec3 col = base;
  float m = 0.0;
  if (uWetOn == 1) col = wetSurface(base, uv, m);
  float d01 = sceneDepth01(uv);
  float F = mistFactor(d01, uv);
  if (F > 0.0005) {
    vec3 soft = textureLod(uImage, uv, uSoftness * F * 6.0).rgb;
    col = mix(col, soft, clamp(uSoftness * F * 2.0, 0.0, 1.0) * (1.0 - m * 0.5));
    vec3 V = viewDirFromUV(uv);
    col = mix(col, mistRadiance(V), F);
  }
  fragColor = vec4(col, 1.0);
}
`;

/** Rain streaks: instanced quads, all motion is a closed-form function of time and seed. */
export const RAIN_VS = /* glsl */ `
${COMMON}
${CAMERA_CHUNK}
${LIGHT_CHUNK}
${DEPTH_CHUNK}
${MIST_CHUNK}
in vec3 position;
uniform sampler2D uImage;
uniform vec3 uCounts;
uniform vec3 uBandNear;
uniform vec3 uBandFar;
uniform float uDropSize;
uniform float uSizeVar;
uniform float uFallSpeed;
uniform float uWindDirDeg;
uniform float uWindStrength;
uniform float uGust;
uniform float uTurb;
uniform float uShutter;
uniform float uLengthMul;
uniform float uFocusDist;
uniform float uDof;
uniform float uVisibility;
out vec2 vLocal;
out float vLen;
out float vHalfW;
out float vBlur;
out float vAlpha;
out vec3 vColor;
out vec2 vRand;
out float vDepth;

float gustWave(float t) { return 0.6 * sin(0.37 * t + 1.3) + 0.4 * sin(0.91 * t + 4.1); }
float gustIntegral(float t) { return -0.6 * cos(0.37 * t + 1.3) / 0.37 - 0.4 * cos(0.91 * t + 4.1) / 0.91; }

void main() {
  uint id = uint(gl_InstanceID);
  float fid = float(gl_InstanceID);
  uint seed = uint(uSeed);
  vec4 h1 = hash4(hashU(id * 3u + 11u) ^ (seed * 0x9e3779b9u));
  vec4 h2 = hash4(hashU(id * 3u + 12u) ^ (seed * 0x85ebca6bu));
  vec4 h3 = hash4(hashU(id * 3u + 13u) ^ (seed * 0xc2b2ae35u));
  float zn; float zf;
  if (fid < uCounts.x) { zn = uBandNear.x; zf = uBandFar.x; }
  else if (fid < uCounts.x + uCounts.y) { zn = uBandNear.y; zf = uBandFar.y; }
  else { zn = uBandNear.z; zf = uBandFar.z; }
  // Depth distributed like a uniform volume density inside the band (∝ z²).
  float z0 = pow(mix(zn * zn * zn, zf * zf * zf, h1.x), 1.0 / 3.0);
  // Drop diameter in mm: exponential spread around the mean (Marshall–Palmer-shaped).
  float expS = clamp(-log(max(1.0 - h1.y, 1e-4)), 0.15, 4.0);
  float D = clamp(uDropSize * mix(1.0, expS, uSizeVar), 0.2, 7.0);
  // Terminal velocity (Atlas et al. 1973) with a small per-drop spread.
  float vT = max(9.65 - 10.3 * exp(-0.6 * D), 0.6) * uFallSpeed * (0.94 + 0.12 * h2.w);
  float ang = radians(uWindDirDeg);
  float wx = uWindStrength * cos(ang);
  float wz = uWindStrength * sin(ang);
  float t = uTime;
  float gustNow = 1.0 + uGust * gustWave(t);
  float dispX = wx * (t + uGust * gustIntegral(t));
  float dispZ = wz * t;
  float wi = 3.0 + 6.0 * h2.x;
  float ph = 6.2831853 * h2.y;
  float ai = (0.01 + 0.05 * h2.z) * uTurb;
  float turbX = ai * sin(wi * t + ph);
  float turbVx = ai * wi * cos(wi * t + ph);
  float zr = max(zf - zn, 0.01);
  float z = zn + mod(z0 - zn + dispZ, zr);
  float halfW = z * 0.5 * uRes.x / uFocal;
  float halfH = z * 0.5 * uRes.y / uFocal;
  float shutterEff = uShutter * uLengthMul;
  float streakW = vT * shutterEff;
  float marginY = 0.1 * halfH + streakW * 1.5 + 0.05;
  float marginX = 0.1 * halfW + abs(wx) * shutterEff * 1.5 + 0.08 + ai;
  float boxW = 2.0 * (halfW + marginX);
  float boxH = 2.0 * (halfH + marginY);
  float x = mod(h1.z * boxW + dispX + turbX, boxW) - 0.5 * boxW;
  float y = mod(h1.w * boxH - vT * t, boxH) - 0.5 * boxH;
  vec3 P = vec3(x, y, z);
  vec3 vel = vec3(wx * gustNow + turbVx, -vT, wz);
  vec3 Pt = P - vel * shutterEff;
  Pt.z = max(Pt.z, 0.05);
  vec2 s1 = P.xy * (uFocal / P.z);
  vec2 s0 = Pt.xy * (uFocal / Pt.z);
  vec2 dS = s1 - s0;
  float L = length(dS);
  vec2 axis = L > 1e-4 ? dS / L : vec2(0.0, 1.0);
  vec2 perp = vec2(-axis.y, axis.x);
  float wPx = D * 0.001 * uFocal / z;
  // Circle of confusion ≈ (f/N)·f_px·|1/z − 1/z_f|; 0.006 m ≈ a 35 mm lens at f/5.6, scaled by the DOF control.
  float coc = uDof * uFocal * 0.006 * abs(1.0 / z - 1.0 / max(uFocusDist, 0.05));
  float halfWpx = max(wPx, 1.0) * 0.5;
  float pad = halfWpx + coc + 1.5;
  vec2 corner = vec2(position.x * (L + 2.0 * pad), position.y * 2.0 * pad);
  vec2 center = 0.5 * (s0 + s1);
  vec2 sp = center + axis * corner.x + perp * corner.y;
  gl_Position = vec4(sp / (0.5 * uRes), 0.0, 1.0);
  vLocal = corner; vLen = L; vHalfW = halfWpx; vBlur = coc; vDepth = z; vRand = h3.xy;
  // Fraction of the exposure during which a pixel sees the drop (Garg & Nayar), sub-pixel coverage,
  // and energy spreading under defocus. uVisibility is an artistic gain.
  // A pixel of width 1 sees a drop of width wPx for (wPx + 1) / (L + wPx + 1) of the exposure.
  float expFrac = clamp((wPx + 1.0) / (L + wPx + 1.0), 0.0, 1.0);
  float cov = clamp(wPx, 0.12, 1.0);
  float defocus = halfWpx / (halfWpx + coc);
  float alpha = uVisibility * 6.0 * expFrac * cov * defocus;
  vec2 uvHead = clamp(s1 / uRes + 0.5, 0.0, 1.0);
  vec3 envLocal = textureLod(uImage, uvHead, 5.0).rgb;
  vec3 envAvg = textureLod(uImage, vec2(0.5), 11.0).rgb;
  vec3 viewDir = normalize(P);
  float c = dot(viewDir, uKeyDir);
  float fwd = hg(c, 0.72) / hg(1.0, 0.72);
  float back = hg(c, -0.35) / hg(-1.0, -0.35);
  vec3 key = uKeyColor * uKeyIntensity * (0.25 + 1.3 * fwd * (1.0 + 1.5 * uBacklight) + 0.25 * back);
  vec3 radiance = uAmbient * (0.5 * envLocal + 0.5 * envAvg) * 1.7 + key * 0.55;
  float d01 = clamp((z - uDepthNear) / max(uDepthFar - uDepthNear, 0.01), 0.0, 1.0);
  float F = mistFactor(d01, uvHead);
  radiance = mix(radiance, mistRadiance(viewDir), F);
  alpha *= (1.0 - 0.85 * F);
  vColor = radiance;
  vAlpha = clamp(alpha, 0.0, 1.0);
}
`;

export const RAIN_FS = /* glsl */ `
${COMMON}
${CAMERA_CHUNK}
${DEPTH_CHUNK}
in vec2 vLocal;
in float vLen;
in float vHalfW;
in float vBlur;
in float vAlpha;
in vec3 vColor;
in vec2 vRand;
in float vDepth;
uniform sampler2D uProtectMask;
uniform float uFgVis;
uniform float uProtectNear;
uniform float uOcclusion;
out vec4 fragColor;
void main() {
  float halfL = 0.5 * vLen;
  float dAlong = max(abs(vLocal.x) - halfL, 0.0);
  float d = sqrt(dAlong * dAlong + vLocal.y * vLocal.y);
  float core = max(vHalfW - 0.5, 0.0);
  float sigma = 0.5 + vBlur * 0.6;
  float x = max(d - core, 0.0);
  float cov = exp(-x * x / (2.0 * sigma * sigma));
  float cycles = 0.6 + 2.2 * vRand.x;
  float osc = 0.5 + 0.5 * sin((vLocal.x / max(vLen, 1.0)) * 6.2831853 * cycles + vRand.y * 6.2831853);
  float along = mix(1.0, 0.55 + 0.45 * osc, 0.6);
  float head = 1.0 + 0.3 * smoothstep(halfL - vHalfW * 3.0 - 1.0, halfL, vLocal.x);
  float a = vAlpha * cov * along * head;
  vec2 uv = gl_FragCoord.xy / uRes;
  if (uHasDepth == 1) {
    float sz = sceneDepthMeters(uv);
    float delta = max(sz * 0.08, 0.05);
    a *= 1.0 - smoothstep(sz - delta, sz + delta, vDepth);
  }
  float pm = textureLod(uProtectMask, uv, 0.0).r;
  float nearKeep = 1.0 - smoothstep(uProtectNear * 0.6, uProtectNear * 1.4, vDepth);
  a *= mix(1.0, mix(uFgVis, 1.0, nearKeep), pm);
  fragColor = vec4(vColor * a, a * uOcclusion);
}
`;

/** Splashes: short-lived crowns on the wet mask, deterministic in time. */
export const SPLASH_VS = /* glsl */ `
${COMMON}
${CAMERA_CHUNK}
${LIGHT_CHUNK}
in vec3 position;
uniform sampler2D uWetMask;
uniform sampler2D uImage;
uniform float uHorizonY;
uniform float uTilt;
out vec2 vLocal;
out float vAge;
out float vSize;
out float vAspect;
out vec3 vColor;
out float vAlpha;
out float vRnd;
void main() {
  uint id = uint(gl_InstanceID);
  uint seed = uint(uSeed);
  vec4 h = hash4(hashU(id * 5u + 101u) ^ (seed * 0x9e3779b9u));
  vec4 h2 = hash4(hashU(id * 5u + 102u) ^ (seed * 0x85ebca6bu));
  vec2 uvPos = h.xy;
  float period = 0.6 + 1.6 * h.z;
  float dur = 0.16 + 0.1 * h2.w;
  float lt = fract(uTime / period + h.w) * period;
  float m = textureLod(uWetMask, uvPos, 1.0).r;
  vec2 p = rot2(uvPos - vec2(0.5, uHorizonY), -radians(uTilt));
  float below = -p.y;
  bool alive = lt < dur && m > mix(0.35, 0.9, h2.x) && below > 0.01;
  if (!alive) {
    gl_Position = vec4(4.0, 4.0, 0.0, 1.0);
    vAlpha = 0.0; vLocal = vec2(0.0); vAge = 0.0; vSize = 1.0; vAspect = 1.0; vColor = vec3(0.0); vRnd = 0.0;
    return;
  }
  float age = lt / dur;
  float persp = clamp(below * 2.2, 0.15, 1.3);
  float sizePx = (2.5 + 7.0 * age) * (uRes.y / 1080.0) * persp * mix(0.7, 1.3, h2.y);
  vec2 centerPx = (uvPos - 0.5) * uRes;
  vec2 sp = centerPx + position.xy * sizePx * 2.0;
  gl_Position = vec4(sp / (0.5 * uRes), 0.0, 1.0);
  vLocal = position.xy * 2.0;
  vAge = age; vSize = sizePx; vAspect = clamp(0.25 + below * 0.8, 0.25, 0.8); vRnd = h2.z;
  vec3 V = viewDirFromUV(uvPos);
  float c = dot(V, uKeyDir);
  float fwd = hg(c, 0.6) / hg(1.0, 0.6);
  vec3 env = textureLod(uImage, uvPos, 5.0).rgb;
  vColor = uAmbient * env * 1.8 + uKeyColor * uKeyIntensity * (0.3 + fwd * (1.0 + uBacklight)) * 0.6;
  vAlpha = (1.0 - age) * (1.0 - age) * 0.9;
}
`;

export const SPLASH_FS = /* glsl */ `
precision highp float;
in vec2 vLocal;
in float vAge;
in float vSize;
in float vAspect;
in vec3 vColor;
in float vAlpha;
in float vRnd;
out vec4 fragColor;
void main() {
  if (vAlpha <= 0.0) discard;
  vec2 q = vLocal;
  float r = length(vec2(q.x, q.y / vAspect));
  float R = 0.15 + 0.55 * vAge;
  float ring = exp(-pow((r - R) * 6.0, 2.0));
  float dots = 0.0;
  for (int k = 0; k < 4; k++) {
    float fk = float(k);
    float a0 = (fk + vRnd) * 1.5708 + 0.4;
    float up = vAge * 1.6 - vAge * vAge * 1.4;
    vec2 dp = vec2(cos(a0) * vAge * 0.9, up * 0.9 + sin(a0) * vAspect * vAge * 0.4);
    float dd = length(q - dp) * vSize;
    dots += exp(-dd * dd * 0.6);
  }
  float a = clamp(ring * 0.6 + dots * 0.8, 0.0, 1.0) * vAlpha;
  fragColor = vec4(vColor * a, a * 0.7);
}
`;
