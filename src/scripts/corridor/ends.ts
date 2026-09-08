/*
  Both ends of the hall open onto sky rather than closing on a wall.

  That is the same claim the 2D timeline's spine makes when it fades out at
  both ends instead of stopping: the list has no first cause and no last
  entry, and the corridor should not pretend otherwise by bricking itself up
  at either end. So each end is an arched opening with a stone surround and
  a balustrade across it — you can see out, and it is obvious why you cannot
  walk out.

  The sky is not a sixth colour. Each opening takes the arc stop nearest it
  for its horizon — gold at the near end where the reading starts, slate at
  the far end where it has got to — so the arc carries on past both ends of
  the hall instead of stopping with the last frame.

  Everything is drawn on a canvas at start-up, like the rest of the scene,
  and the sky planes are unlit basic material: they are light sources to look
  at, not surfaces to light.
*/

import * as THREE from "three";
import { archRing } from "./frames";
import {
  type Palette,
  type RGB,
  hexToRgb,
  lighten,
  darken,
  mixOklab,
  rgbToHex,
  tintAt,
} from "./palette";

export interface EndsOptions {
  hallWidth: number;
  hallHeight: number;
  /** z of the near end (the larger value, where a visitor starts). */
  zNear: number;
  /** z of the far end. */
  zFar: number;
}

/* The opening. Its head is a semicircle spanning the width, so the outer and
   inner arches of the surround share a centre when both keep the same
   h - w — which is what these two pairs do. */
const OPEN_W = 2.2;
const OPEN_H = 3.0;
const SURROUND_W = 2.62;
const SURROUND_H = 3.42;
const RAIL_Y = 1.05;
const SKY_OUT = 5; // metres beyond the opening
const SKY_W = 26;
const SKY_H = 20;
const SKY_Y = 5; // centre height, so the plane covers the whole view cone
/** Where the horizon falls on the sky plane, as a fraction from its top. */
const HORIZON = (SKY_Y + SKY_H / 2 - 1.6) / SKY_H;

function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Sky seen through one opening: cool overhead, this end's arc colour at the
 * horizon, and a bright seam where the two meet. Below the horizon is
 * distance rather than ground, so it dissolves into haze.
 *
 * Drawn tall and narrow. From just inside the opening the plane is magnified
 * enormously, and a gradient survives that where detail would not — so the
 * sky is built from bands, with only a few very soft cloud strata over them.
 */
function skyCanvas(tint: RGB, dark: boolean, seed: number): HTMLCanvasElement {
  const w = 512;
  const h = 1280;
  const c = canvas(w, h);
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable");
  const y0 = Math.round(h * HORIZON);
  const rnd = mulberry32(seed);

  // The zenith is the one cool constant; the horizon is this end's tint, so
  // the near opening reads as dawn and the far one as evening.
  const zenith: RGB = dark ? [0.05, 0.07, 0.12] : [0.4, 0.53, 0.68];
  const horizon = dark ? darken(tint, 0.52) : lighten(tint, 0.3);
  // At night the seam is the last of the light going, not a floodlight: kept
  // as bright as the day version it washes the whole opening out.
  const glow = dark ? mixOklab(tint, [1, 0.85, 0.65], 0.2) : lighten(tint, 0.62);

  const sky = ctx.createLinearGradient(0, 0, 0, y0);
  sky.addColorStop(0, rgbToHex(zenith));
  sky.addColorStop(0.5, rgbToHex(mixOklab(zenith, horizon, 0.5)));
  sky.addColorStop(0.86, rgbToHex(horizon));
  sky.addColorStop(1, rgbToHex(glow));
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, y0);

  const below = ctx.createLinearGradient(0, y0, 0, h);
  below.addColorStop(0, rgbToHex(glow));
  below.addColorStop(dark ? 0.08 : 0.22, rgbToHex(dark ? darken(tint, 0.72) : lighten(tint, 0.42)));
  below.addColorStop(1, rgbToHex(dark ? darken(tint, 0.9) : darken(tint, 0.25)));
  ctx.fillStyle = below;
  ctx.fillRect(0, y0, w, h - y0);

  // The horizon itself: a hairline, so the eye has something to focus on.
  ctx.fillStyle = dark ? "rgba(255,240,215,0.16)" : "rgba(255,252,244,0.6)";
  ctx.fillRect(0, y0 - 2, w, 3);

  // Cloud strata: wide, flat, few and faint.
  for (let i = 0; i < 7; i++) {
    const cy = y0 - (0.08 + rnd() * 0.8) * y0;
    const cw = w * (0.22 + rnd() * 0.3);
    const cx = rnd() * w;
    const flat = 0.055 + rnd() * 0.05;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, cw);
    const lit = rnd() > 0.4;
    g.addColorStop(0, lit ? "rgba(255,250,240,0.42)" : "rgba(60,52,72,0.22)");
    g.addColorStop(0.6, lit ? "rgba(255,250,240,0.12)" : "rgba(60,52,72,0.07)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, flat);
    ctx.translate(-cx, -cy);
    ctx.fillStyle = g;
    ctx.fillRect(cx - cw, cy - cw, cw * 2, cw * 2);
    ctx.restore();
  }

  if (dark) {
    for (let i = 0; i < 260; i++) {
      // Spread them right down to the horizon: from inside the hall you only
      // ever see the band of sky just above it.
      const sy = rnd() * y0 * 0.98;
      ctx.fillStyle = `rgba(255,250,235,${0.25 + rnd() * 0.6})`;
      ctx.fillRect(rnd() * w, sy, 1.6, 1.6);
    }
  }
  return c;
}

/** The arched opening, its surround, its balustrade and the sky beyond. */
export class Ends {
  readonly group = new THREE.Group();

  private readonly wallMat: THREE.MeshStandardMaterial;
  private readonly stoneMat: THREE.MeshStandardMaterial;
  private readonly skies: {
    tintAt: number;
    mat: THREE.MeshBasicMaterial;
    tex: THREE.CanvasTexture;
    light: THREE.PointLight;
    seed: number;
  }[] = [];
  private readonly geometries: THREE.BufferGeometry[] = [];

  constructor(opts: EndsOptions) {
    const { hallWidth: W, hallHeight: H } = opts;

    this.wallMat = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
    this.stoneMat = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0.04 });

    // The wall around the opening, as one piece with an arched hole in it.
    const shape = new THREE.Shape();
    shape.moveTo(-W / 2, 0);
    shape.lineTo(W / 2, 0);
    shape.lineTo(W / 2, H);
    shape.lineTo(-W / 2, H);
    shape.closePath();
    const hole = new THREE.Path();
    const r = OPEN_W / 2;
    hole.moveTo(-r, 0);
    hole.lineTo(-r, OPEN_H - r);
    hole.absarc(0, OPEN_H - r, r, Math.PI, 0, true);
    hole.lineTo(r, 0);
    hole.closePath();
    shape.holes.push(hole);
    const wallGeo = this.geo(new THREE.ShapeGeometry(shape, 24));

    const surroundGeo = this.geo(
      archRing(SURROUND_W, SURROUND_H, OPEN_W, OPEN_H, 0.14, 0.03, 0.05)
    );
    const railGeo = this.geo(new THREE.BoxGeometry(OPEN_W + 0.16, 0.09, 0.2));
    const plinthGeo = this.geo(new THREE.BoxGeometry(OPEN_W + 0.16, 0.12, 0.24));
    const balusterGeo = this.geo(new THREE.CylinderGeometry(0.05, 0.062, RAIL_Y - 0.21, 10));
    const skyGeo = this.geo(new THREE.PlaneGeometry(SKY_W, SKY_H));

    const BALUSTERS = 9;
    const balusters = new THREE.InstancedMesh(balusterGeo, this.stoneMat, BALUSTERS * 2);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    let slot = 0;

    // dir points from the end wall back into the hall, so every piece can be
    // placed and turned by the same sign.
    for (const [z, dir, t, seed] of [
      [opts.zNear, -1, 0, 101],
      [opts.zFar, 1, 1, 202],
    ] as const) {
      const yaw = dir === 1 ? 0 : Math.PI;
      const face = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0));

      const wall = new THREE.Mesh(wallGeo, this.wallMat);
      wall.position.set(0, 0, z);
      wall.rotation.y = yaw;

      // archRing's shape spans -SURROUND_H/2..+SURROUND_H/2 about the arch's
      // own centre, so lifting it by half its height stands it on the floor.
      const surround = new THREE.Mesh(surroundGeo, this.stoneMat);
      surround.position.set(0, SURROUND_H / 2, z + dir * 0.005);
      surround.rotation.y = yaw;

      const plinth = new THREE.Mesh(plinthGeo, this.stoneMat);
      plinth.position.set(0, 0.06, z + dir * 0.02);
      const rail = new THREE.Mesh(railGeo, this.stoneMat);
      rail.position.set(0, RAIL_Y, z + dir * 0.02);

      for (let i = 0; i < BALUSTERS; i++) {
        const x = ((i + 0.5) / BALUSTERS - 0.5) * (OPEN_W - 0.1);
        m.compose(
          new THREE.Vector3(x, 0.12 + (RAIL_Y - 0.21) / 2, z + dir * 0.02),
          q.identity(),
          one
        );
        balusters.setMatrixAt(slot++, m);
      }

      const tex = new THREE.CanvasTexture(canvas(2, 2));
      tex.colorSpace = THREE.SRGBColorSpace;
      const mat = new THREE.MeshBasicMaterial({ map: tex, fog: true, toneMapped: true });
      const sky = new THREE.Mesh(skyGeo, mat);
      sky.position.set(0, SKY_Y, z - dir * SKY_OUT);
      sky.quaternion.copy(face);

      // Daylight spilling in, so the last few metres of hall are lit by the
      // opening rather than by the picture lights alone.
      const light = new THREE.PointLight(0xffffff, 2.6, 9, 2);
      light.position.set(0, 1.9, z + dir * 2.4);

      this.skies.push({ tintAt: t, mat, tex, light, seed });
      this.group.add(wall, surround, plinth, rail, sky, light);
    }

    balusters.instanceMatrix.needsUpdate = true;
    this.group.add(balusters);
  }

  setTheme(palette: Palette): void {
    const dark = palette.dark;
    const muted = hexToRgb(palette.muted);
    this.wallMat.color.set(
      rgbToHex(dark ? darken(muted, 0.28) : darken(muted, 0.12))
    );
    this.stoneMat.color.set(
      rgbToHex(dark ? darken(muted, 0.02) : lighten(muted, 0.5))
    );

    for (const s of this.skies) {
      const tint = tintAt(palette, s.tintAt);
      s.tex.image = skyCanvas(tint, dark, s.seed);
      s.tex.needsUpdate = true;
      s.light.color.set(rgbToHex(lighten(tint, dark ? 0.35 : 0.7)));
      s.light.intensity = dark ? 1.7 : 2.6;
    }
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose();
    this.wallMat.dispose();
    this.stoneMat.dispose();
    for (const s of this.skies) {
      s.tex.dispose();
      s.mat.dispose();
    }
  }

  private geo<T extends THREE.BufferGeometry>(g: T): T {
    this.geometries.push(g);
    return g;
  }
}
