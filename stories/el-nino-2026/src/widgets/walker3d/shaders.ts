/**
 * Particles are placed in the vertex shader from four random numbers, a
 * layer and the clocks: nothing is simulated, so the morph between Normal
 * and El Niño only moves uniforms. Each particle is drawn `uTrails` times
 * (one instance per step back along its path) for a fading streak.
 */

export const LAYER = {
  main: 0,
  west: 1,
  upper: 2,
  thermocline: 3,
  deep: 4,
} as const;

export const PARTICLE_VS = /* glsl */ `#version 300 es
precision highp float;

layout(location = 0) in vec4 aSeed;
layout(location = 1) in float aLayer;

uniform mat4 uView;
uniform mat4 uProj;
// Cells: rising x, sinking x (world), strength.
uniform vec3 uMain;
uniform vec3 uWest;
// Loop bottom and top, world y.
uniform vec2 uLoop;
// Box: half width, half depth, air height, ocean depth.
uniform vec4 uBox;
// Thermocline depth fractions, west and east; where it tilts, world x.
uniform vec2 uThermo;
uniform vec2 uThermoX;
uniform float uWarmEdge;
// Clocks: main cell, western cell (loop turns), ocean (box widths).
uniform vec3 uClock;
uniform float uTrails;
uniform float uPointSize;

out vec3 vColor;
out float vAlpha;

const float PI = 3.14159265;

// Turbo colormap, polynomial fit (Mikhailov, Google, Apache 2.0).
vec3 turbo(float x) {
  const vec4 kr4 = vec4(0.13572138, 4.61539260, -42.66032258, 132.13108234);
  const vec4 kg4 = vec4(0.09140261, 2.19418839, 4.84296658, -14.18503333);
  const vec4 kb4 = vec4(0.10667330, 12.64194608, -60.58204836, 110.36276771);
  const vec2 kr2 = vec2(-152.94239396, 59.28637943);
  const vec2 kg2 = vec2(4.27729857, 2.82956604);
  const vec2 kb2 = vec2(-89.90310912, 27.34824973);
  x = clamp(x, 0.0, 1.0);
  vec4 v4 = vec4(1.0, x, x * x, x * x * x);
  vec2 v2 = v4.zw * v4.z;
  return vec3(
    dot(v4, kr4) + dot(v2, kr2),
    dot(v4, kg4) + dot(v2, kg2),
    dot(v4, kb4) + dot(v2, kb2));
}

// Temperature 0–1 to colour; the hottest end leans to magenta.
vec3 heat(float t) {
  vec3 c = turbo(mix(0.1, 0.9, t));
  return mix(c, vec3(1.0, 0.25, 0.6), smoothstep(0.85, 1.0, t) * 0.55);
}

// A cell's loop at constant speed, as model.ts loopPoint(). Returns world
// x, y and how far towards the rising branch (-1 sinking, 1 rising).
vec3 loop(vec3 cell, float phase, float inset, float back) {
  float shrink = 1.0 - inset * 0.55;
  float hw = max(abs(cell.y - cell.x) * 0.5 * shrink, 1e-4);
  float hh = (uLoop.y - uLoop.x) * 0.5 * shrink;
  float cx = (cell.x + cell.y) * 0.5;
  float cy = (uLoop.x + uLoop.y) * 0.5;
  float dir = cell.x >= cell.y ? 1.0 : -1.0;
  float r = min(hw, hh) * 0.85;
  float ex = hw - r;
  float ey = hh - r;
  float lh = 2.0 * ex;
  float lv = 2.0 * ey;
  float q = 0.5 * PI * r;
  float total = 2.0 * lh + 2.0 * lv + 4.0 * q;
  float s = mod(fract(phase) * total - back, total);
  vec2 p;
  if (s < lh * 0.5) {
    p = vec2(s, -hh);
  } else if ((s -= lh * 0.5) < q) {
    float a = -0.5 * PI + s / r;
    p = vec2(ex, -ey) + r * vec2(cos(a), sin(a));
  } else if ((s -= q) < lv) {
    p = vec2(hw, -ey + s);
  } else if ((s -= lv) < q) {
    float a = s / r;
    p = vec2(ex, ey) + r * vec2(cos(a), sin(a));
  } else if ((s -= q) < lh) {
    p = vec2(ex - s, hh);
  } else if ((s -= lh) < q) {
    float a = 0.5 * PI + s / r;
    p = vec2(-ex, ey) + r * vec2(cos(a), sin(a));
  } else if ((s -= q) < lv) {
    p = vec2(-hw, ey - s);
  } else if ((s -= lv) < q) {
    float a = PI + s / r;
    p = vec2(-ex, -ey) + r * vec2(cos(a), sin(a));
  } else {
    s -= q;
    p = vec2(-ex + s, -hh);
  }
  return vec3(cx + dir * p.x, cy + p.y, p.x / hw);
}

float thermo(float x) {
  return mix(uThermo.x, uThermo.y, smoothstep(uThermoX.x, uThermoX.y, x));
}

void main() {
  float k = float(gl_InstanceID);
  // Head bright, tail fading.
  float tail = pow(1.0 - k / uTrails, 1.6);
  int layer = int(aLayer + 0.5);
  float hwBox = uBox.x;
  float z = (aSeed.z * 2.0 - 1.0) * uBox.y * 0.94;
  vec3 pos;
  float t;
  float alpha;
  float size = 1.0;

  if (layer <= 1) {
    vec3 cell = layer == 0 ? uMain : uWest;
    float clock = layer == 0 ? uClock.x : uClock.y;
    // Particles ride a dozen stream lines, denser towards the outer edge.
    float lane = (floor(aSeed.y * 12.0) + aSeed.w * 0.25) / 12.0;
    vec3 p = loop(cell, aSeed.x + clock, pow(lane, 1.3), k * 0.016);
    // A little scatter off the stream line.
    pos = vec3(p.x, p.y, z);
    // Rising air warm, sinking air cool.
    t = mix(0.18, 1.0, smoothstep(-0.9, 0.9, p.z));
    alpha = 0.6 * cell.z;
    // Fades in from the box floor: the cell sits on the sea line.
    size = 1.0;
  } else {
    float speed;
    float f;
    if (layer == 2) {
      // Warm upper layer, flowing west with the trades, faster at the top.
      speed = -(1.0 - 0.75 * aSeed.y);
    } else if (layer == 3) {
      // Along the thermocline, slowly east.
      speed = 0.2;
    } else {
      // The equatorial undercurrent just below the thermocline, east;
      // still water deeper down.
      speed = 0.55 * pow(1.0 - aSeed.y, 3.0);
    }
    float u = fract(aSeed.x + uClock.z * speed - sign(speed) * k * 0.0035);
    float x = (u * 2.0 - 1.0) * hwBox;
    float d = thermo(x);
    if (layer == 2) {
      f = d * pow(aSeed.y, 0.85);
      float warm = 1.0 - smoothstep(uWarmEdge - 0.35, uWarmEdge + 0.35, x);
      t = mix(0.45, 0.97, warm) - 0.22 * aSeed.y;
      alpha = 0.26;
    } else if (layer == 3) {
      f = d + (aSeed.y - 0.5) * 0.018;
      t = 0.3;
      alpha = 0.38;
      size = 1.15;
    } else {
      f = d + (1.0 - d) * pow(aSeed.y, 0.9) + 0.02;
      t = mix(0.24, 0.06, aSeed.y);
      alpha = 0.2;
      size = 0.85;
    }
    pos = vec3(x, -min(f, 1.0) * uBox.w, z);
    // No pop at the box ends where the flow wraps round.
    alpha *= smoothstep(0.0, 0.04, u) * smoothstep(1.0, 0.96, u);
  }

  vec4 view = uView * vec4(pos, 1.0);
  gl_Position = uProj * view;
  gl_PointSize = uPointSize * size * (0.55 + 0.45 * tail) / -view.z;
  vColor = heat(t);
  vAlpha = alpha * tail;
}
`;

export const PARTICLE_FS = /* glsl */ `#version 300 es
precision mediump float;

in vec3 vColor;
in float vAlpha;
out vec4 outColor;

void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d = dot(c, c);
  if (d > 1.0) {
    discard;
  }
  float a = exp(-d * 3.5) * vAlpha;
  // Premultiplied, added: glows over any dark background.
  outColor = vec4(vColor * a, a * 0.6);
}
`;

export const LINE_VS = /* glsl */ `#version 300 es
precision highp float;

layout(location = 0) in vec3 aPos;
uniform mat4 uView;
uniform mat4 uProj;

void main() {
  gl_Position = uProj * uView * vec4(aPos, 1.0);
}
`;

export const LINE_FS = /* glsl */ `#version 300 es
precision mediump float;

uniform vec4 uColor;
out vec4 outColor;

void main() {
  outColor = vec4(uColor.rgb * uColor.a, uColor.a);
}
`;
