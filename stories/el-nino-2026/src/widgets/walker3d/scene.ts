import {
  lookAt,
  multiply,
  perspective,
  program,
  type Mat4,
  type Program,
} from "./gl";
import {
  BOX,
  LON0,
  LON1,
  LOOP_BOTTOM_KM,
  LOOP_TOP_KM,
  airY,
  depthFraction,
  oceanY,
  thermoDepth,
  worldX,
  type WalkerState,
} from "./model";
import { LAYER, LINE_FS, LINE_VS, PARTICLE_FS, PARTICLE_VS } from "./shaders";

/** Particles per layer, at density 1. */
const COUNTS: [number, number][] = [
  [LAYER.main, 6000],
  [LAYER.west, 4500],
  [LAYER.upper, 10000],
  [LAYER.thermocline, 3000],
  [LAYER.deep, 6000],
];
const TRAILS = 8;
const THERMO_STEPS = 64;
const FOV = (28 * Math.PI) / 180;

export const LON_TICKS = [120, 150, 180, 210, 240, 270];
export const KM_TICKS = [5, 10, 15];
export const M_TICKS = [50, 100, 200, 300];
export const LAT_TICKS = [-5, 0, 5];

/** Where the camera looks from: yaw about the vertical, pitch above. */
export interface View {
  yaw: number;
  pitch: number;
}

export interface Clocks {
  main: number;
  west: number;
  ocean: number;
}

const ink = [0.95, 0.95, 0.93] as const;

/** The static frame: box, sea line, ticks. */
function frameLines() {
  const { halfWidth: w, halfDepth: d, air, ocean } = BOX;
  const box: number[] = [];
  const seg = (a: number[], b: number[]) => box.push(...a, ...b);
  for (const y of [air, -ocean]) {
    seg([-w, y, -d], [w, y, -d]);
    seg([-w, y, d], [w, y, d]);
    seg([-w, y, -d], [-w, y, d]);
    seg([w, y, -d], [w, y, d]);
  }
  for (const x of [-w, w]) {
    for (const z of [-d, d]) {
      seg([x, -ocean, z], [x, air, z]);
    }
  }
  const t = 0.035;
  for (const lon of LON_TICKS) {
    const x = worldX(lon);
    seg([x, -ocean, d], [x, -ocean - t, d + t]);
  }
  const heights = [
    0,
    ...KM_TICKS.map((km) => airY(km)),
    ...M_TICKS.map((m) => oceanY(depthFraction(m))),
  ];
  for (const y of heights) {
    seg([-w, y, d], [-w - t, y, d]);
  }
  for (const lat of LAT_TICKS) {
    const z = (-lat / 5) * d;
    seg([w, -ocean, z], [w + t, -ocean, z]);
  }
  const sea = [
    -w,
    0,
    -d,
    w,
    0,
    -d,
    w,
    0,
    -d,
    w,
    0,
    d,
    w,
    0,
    d,
    -w,
    0,
    d,
    -w,
    0,
    d,
    -w,
    0,
    -d,
  ];
  const plane = [-w, 0, -d, w, 0, -d, w, 0, d, -w, 0, -d, w, 0, d, -w, 0, d];
  return {
    box: new Float32Array(box),
    sea: new Float32Array(sea),
    plane: new Float32Array(plane),
  };
}

export interface Scene {
  /** Draws a frame; returns the view-projection matrix, for the labels. */
  render(state: WalkerState, clocks: Clocks, view: View): Mat4;
  resize(width: number, height: number, dpr: number): void;
  dispose(): void;
}

export function createScene(gl: WebGL2RenderingContext, density = 1): Scene {
  const particles = program(gl, PARTICLE_VS, PARTICLE_FS, ["aSeed", "aLayer"]);
  const lines = program(gl, LINE_VS, LINE_FS, ["aPos"]);

  // Particles: four random numbers and a layer each.
  const total = COUNTS.reduce((sum, [, n]) => sum + Math.round(n * density), 0);
  const data = new Float32Array(total * 5);
  let o = 0;
  for (const [layer, n] of COUNTS) {
    for (let i = 0; i < Math.round(n * density); i++) {
      data[o++] = Math.random();
      data[o++] = Math.random();
      data[o++] = Math.random();
      data[o++] = Math.random();
      data[o++] = layer;
    }
  }
  const particleVao = gl.createVertexArray()!;
  const particleBuffer = gl.createBuffer()!;
  gl.bindVertexArray(particleVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, particleBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 20, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 20, 16);

  const lineVao = (array: Float32Array, usage: number) => {
    const vao = gl.createVertexArray()!;
    const buffer = gl.createBuffer()!;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, array, usage);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    return { vao, buffer, count: array.length / 3 };
  };
  const frame = frameLines();
  const box = lineVao(frame.box, gl.STATIC_DRAW);
  const sea = lineVao(frame.sea, gl.STATIC_DRAW);
  const plane = lineVao(frame.plane, gl.STATIC_DRAW);
  const thermoData = new Float32Array(2 * (THERMO_STEPS + 1) * 3);
  const thermo = lineVao(thermoData, gl.DYNAMIC_DRAW);
  gl.bindVertexArray(null);

  let width = 1;
  let height = 1;
  let dpr = 1;

  const camera = (view: View) => {
    const aspect = width / height;
    // Fit the box and room for its labels, whatever the aspect.
    const halfW = BOX.halfWidth + 0.4;
    const halfH = (BOX.air + BOX.ocean) / 2 + 0.38;
    const tanV = Math.tan(FOV / 2);
    const dist =
      Math.max(halfH / tanV, halfW / (tanV * aspect)) + BOX.halfDepth;
    const target = [0.04, (BOX.air - BOX.ocean) / 2 - 0.12, 0];
    const eye = [
      target[0] + dist * Math.sin(view.yaw) * Math.cos(view.pitch),
      target[1] + dist * Math.sin(view.pitch),
      target[2] + dist * Math.cos(view.yaw) * Math.cos(view.pitch),
    ];
    return {
      view: lookAt(eye, target),
      proj: perspective(FOV, aspect, 0.1, dist * 3),
      dist,
    };
  };

  const drawLines = (
    item: { vao: WebGLVertexArrayObject; count: number },
    mode: number,
    color: readonly number[],
    alpha: number,
    first = 0,
    count = item.count,
  ) => {
    gl.uniform4f(lines.uniforms.uColor, color[0], color[1], color[2], alpha);
    gl.bindVertexArray(item.vao);
    gl.drawArrays(mode, first, count);
  };

  const setMatrices = (p: Program, m: { view: Mat4; proj: Mat4 }) => {
    gl.uniformMatrix4fv(p.uniforms.uView, false, m.view);
    gl.uniformMatrix4fv(p.uniforms.uProj, false, m.proj);
  };

  return {
    resize(w, h, ratio) {
      width = Math.max(1, w);
      height = Math.max(1, h);
      dpr = ratio;
    },

    render(state, clocks, view) {
      const m = camera(view);
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);

      // Frame, sea surface and thermocline edges, under the particles.
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(lines.program);
      setMatrices(lines, m);
      drawLines(plane, gl.TRIANGLES, [0.35, 0.6, 0.85], 0.07);
      drawLines(box, gl.LINES, ink, 0.28);
      drawLines(sea, gl.LINES, ink, 0.7);
      let o = 0;
      for (const z of [BOX.halfDepth, -BOX.halfDepth]) {
        for (let i = 0; i <= THERMO_STEPS; i++) {
          const lon = LON0 + ((LON1 - LON0) * i) / THERMO_STEPS;
          thermoData[o++] = worldX(lon);
          thermoData[o++] = oceanY(thermoDepth(state, lon));
          thermoData[o++] = z;
        }
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, thermo.buffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, thermoData);
      drawLines(
        thermo,
        gl.LINE_STRIP,
        [0.4, 0.95, 1],
        0.85,
        0,
        THERMO_STEPS + 1,
      );
      drawLines(
        thermo,
        gl.LINE_STRIP,
        [0.4, 0.95, 1],
        0.3,
        THERMO_STEPS + 1,
        THERMO_STEPS + 1,
      );

      // Particles, added.
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.useProgram(particles.program);
      setMatrices(particles, m);
      const u = particles.uniforms;
      const { main, west } = state;
      gl.uniform3f(
        u.uMain,
        worldX(main.rise),
        worldX(main.sink),
        main.strength,
      );
      gl.uniform3f(
        u.uWest,
        worldX(west.rise),
        worldX(west.sink),
        west.strength,
      );
      gl.uniform2f(u.uLoop, airY(LOOP_BOTTOM_KM), airY(LOOP_TOP_KM));
      gl.uniform4f(u.uBox, BOX.halfWidth, BOX.halfDepth, BOX.air, BOX.ocean);
      gl.uniform2f(u.uThermo, state.thermoWest, state.thermoEast);
      gl.uniform2f(u.uThermoX, worldX(165), worldX(225));
      gl.uniform1f(u.uWarmEdge, worldX(state.warmEdge));
      gl.uniform3f(u.uClock, clocks.main, clocks.west, clocks.ocean);
      gl.uniform1f(u.uTrails, TRAILS);
      // Sprite size in device pixels at unit distance, scaled to the view.
      const scale = Math.min(width, 1400) / 900;
      gl.uniform1f(u.uPointSize, 2.6 * dpr * scale * m.dist);
      gl.bindVertexArray(particleVao);
      gl.drawArraysInstanced(gl.POINTS, 0, total, TRAILS);
      gl.bindVertexArray(null);

      return multiply(m.proj, m.view);
    },

    dispose() {
      if (gl.isContextLost()) {
        return;
      }
      gl.deleteProgram(particles.program);
      gl.deleteProgram(lines.program);
      gl.deleteBuffer(particleBuffer);
      gl.deleteVertexArray(particleVao);
      for (const item of [box, sea, plane, thermo]) {
        gl.deleteBuffer(item.buffer);
        gl.deleteVertexArray(item.vao);
      }
    },
  };
}
