/*
  Windows down both walls, for the floating display only.

  With the books off the walls and out in the aisle, the walls have nothing
  on them, and ninety metres of blank plaster reads as unfinished rather
  than as restraint. Windows break it up and give the hall a reason to be
  lit at all.

  Each one takes the arc stop nearest its own position down the hall, so the
  light outside shifts gold to slate as you walk — the arc told as time of
  day, which is the same claim the two open ends make.

  A sky is not one colour multiplied by a value ramp. It is cool overhead
  and warm along the horizon, and a greyscale gradient tinted by a single
  hue gives you a bronze mirror instead of a window — which is exactly what
  the first version of this looked like. So the sky is drawn in colour, five
  times, one per stop, and the windows are grouped by the stop they take.
  Five small canvases and five draw calls for the glass of the whole hall.

  The windows are flush rather than cut through the wall. There is nothing
  behind these walls to see, so an opening would only be a hole onto the
  same backdrop, and a hole costs a wall rebuilt as a shape with a dozen
  slots in it.
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

export interface WindowSpot {
  side: -1 | 1;
  z: number;
  /** Where this window falls along the arc, 0..1. */
  t: number;
}

/* The opening keeps the same h - w as its surround, so the two arches share
   a centre — the same arrangement the doorways at either end use. */
const OPEN_W = 1.02;
const OPEN_H = 1.78;
const RING_W = 1.3;
const RING_H = 2.06;
const SILL_Y = 0.94;
const WALL_IN = 0.02; // how far the glass sits proud of the plaster

/**
 * Sky seen through one window: cool overhead, this stop's colour along the
 * horizon, and haze below it. Tall and narrow — a window needs no
 * horizontal detail, and a gradient survives being stretched.
 */
function skyCanvas(tint: RGB, dark: boolean): HTMLCanvasElement {
  const w = 64;
  const h = 512;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable");
  // Low in the opening: you are looking out from inside, so most of what
  // there is to see is sky.
  const y0 = Math.round(h * 0.8);

  const zenith: RGB = dark ? [0.05, 0.07, 0.13] : [0.42, 0.55, 0.71];
  const horizon = dark ? darken(tint, 0.48) : lighten(tint, 0.34);
  const glow = dark ? mixOklab(tint, [1, 0.88, 0.7], 0.22) : lighten(tint, 0.66);

  const sky = ctx.createLinearGradient(0, 0, 0, y0);
  sky.addColorStop(0, rgbToHex(zenith));
  sky.addColorStop(0.55, rgbToHex(mixOklab(zenith, horizon, 0.55)));
  sky.addColorStop(0.9, rgbToHex(horizon));
  sky.addColorStop(1, rgbToHex(glow));
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, y0);

  const below = ctx.createLinearGradient(0, y0, 0, h);
  below.addColorStop(0, rgbToHex(glow));
  // Below the horizon is distance, not landscape, so it greys off rather
  // than saturating into a stripe of the stop's own colour.
  const haze: RGB = dark ? [0.1, 0.1, 0.12] : [0.62, 0.61, 0.58];
  below.addColorStop(
    dark ? 0.1 : 0.3,
    rgbToHex(mixOklab(dark ? darken(tint, 0.7) : lighten(tint, 0.4), haze, 0.5))
  );
  below.addColorStop(1, rgbToHex(mixOklab(dark ? darken(tint, 0.88) : darken(tint, 0.1), haze, 0.65)));
  ctx.fillStyle = below;
  ctx.fillRect(0, y0, w, h - y0);

  ctx.fillStyle = dark ? "rgba(255,240,215,0.2)" : "rgba(255,252,244,0.62)";
  ctx.fillRect(0, y0 - 2, w, 3);
  return c;
}

/** An arch standing on y = 0, as a filled shape with 0..1 UVs. */
function archGlass(): THREE.BufferGeometry {
  const r = OPEN_W / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-r, 0);
  shape.lineTo(-r, OPEN_H - r);
  shape.absarc(0, OPEN_H - r, r, Math.PI, 0, true);
  shape.lineTo(r, 0);
  shape.closePath();

  const geo = new THREE.ShapeGeometry(shape, 20);
  // ShapeGeometry hands back UVs in shape units; remap them across the
  // opening so the gradient runs sill to head however the arch is drawn.
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, (pos.getX(i) + r) / OPEN_W, pos.getY(i) / OPEN_H);
  }
  uv.needsUpdate = true;
  return geo;
}

/** The arcade: glass, surrounds, sills, glazing bars and the light they cast. */
export class Windows {
  readonly group = new THREE.Group();

  private readonly stoneMat: THREE.MeshStandardMaterial;
  private readonly barMat: THREE.MeshStandardMaterial;
  private readonly glowMat: THREE.MeshBasicMaterial;
  /** One per arc stop; each holds the windows that take that stop. */
  private readonly panes: {
    stop: number;
    tex: THREE.CanvasTexture;
    mat: THREE.MeshBasicMaterial;
  }[] = [];
  private readonly glows: THREE.InstancedMesh;
  private readonly spots: WindowSpot[];
  private readonly geometries: THREE.BufferGeometry[] = [];

  constructor(spots: WindowSpot[], hallWidth: number, glowTex: THREE.Texture) {
    this.spots = spots;
    const n = Math.max(1, spots.length);
    const wall = hallWidth / 2;

    this.stoneMat = new THREE.MeshStandardMaterial({ roughness: 0.82, metalness: 0.04 });
    this.barMat = new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.2 });
    this.glowMat = new THREE.MeshBasicMaterial({
      map: glowTex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: true,
    });

    const glassGeo = this.geo(archGlass());
    const ringGeo = this.geo(archRing(RING_W, RING_H, OPEN_W, OPEN_H, 0.1, 0.02, 0.035));
    const sillGeo = this.geo(new THREE.BoxGeometry(0.11, 0.07, OPEN_W + 0.26));
    const mullionGeo = this.geo(new THREE.BoxGeometry(0.05, OPEN_H - OPEN_W / 2, 0.032));
    const transomGeo = this.geo(new THREE.BoxGeometry(0.05, 0.032, OPEN_W));
    const glowGeo = this.geo(new THREE.PlaneGeometry(1.5, 2.1));

    const rings = new THREE.InstancedMesh(ringGeo, this.stoneMat, n);
    const sills = new THREE.InstancedMesh(sillGeo, this.stoneMat, n);
    const mullions = new THREE.InstancedMesh(mullionGeo, this.barMat, n);
    const transoms = new THREE.InstancedMesh(transomGeo, this.barMat, n);
    this.glows = new THREE.InstancedMesh(glowGeo, this.glowMat, n);
    this.glows.renderOrder = 2;

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const flat = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    const springing = SILL_Y + OPEN_H - OPEN_W / 2;

    // Glass is grouped by the stop it takes, since each stop is its own sky.
    const groups = new Map<number, WindowSpot[]>();
    spots.forEach(spot => {
      const stop = Math.round(spot.t * 4);
      const list = groups.get(stop);
      if (list) list.push(spot);
      else groups.set(stop, [spot]);
    });
    for (const [stop, list] of groups) {
      const tex = new THREE.CanvasTexture(document.createElement("canvas"));
      tex.colorSpace = THREE.SRGBColorSpace;
      const mat = new THREE.MeshBasicMaterial({ map: tex, fog: true });
      const mesh = new THREE.InstancedMesh(glassGeo, mat, list.length);
      list.forEach((spot, j) => {
        q.setFromEuler(
          new THREE.Euler(0, spot.side === -1 ? Math.PI / 2 : -Math.PI / 2, 0)
        );
        m.compose(
          new THREE.Vector3(spot.side * wall - spot.side * WALL_IN, SILL_Y, spot.z),
          q,
          one
        );
        mesh.setMatrixAt(j, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
      this.panes.push({ stop, tex, mat });
      this.group.add(mesh);
    }

    spots.forEach((spot, i) => {
      const x = spot.side * wall;
      // Faces into the hall, the same way the wall it sits on does.
      q.setFromEuler(new THREE.Euler(0, spot.side === -1 ? Math.PI / 2 : -Math.PI / 2, 0));

      m.compose(
        new THREE.Vector3(x - spot.side * (WALL_IN + 0.01), SILL_Y + OPEN_H / 2, spot.z),
        q,
        one
      );
      rings.setMatrixAt(i, m);
      m.compose(
        new THREE.Vector3(x - spot.side * 0.055, SILL_Y - 0.036, spot.z),
        flat,
        one
      );
      sills.setMatrixAt(i, m);
      m.compose(
        new THREE.Vector3(x - spot.side * 0.05, SILL_Y + (OPEN_H - OPEN_W / 2) / 2, spot.z),
        flat,
        one
      );
      mullions.setMatrixAt(i, m);
      m.compose(new THREE.Vector3(x - spot.side * 0.05, springing, spot.z), flat, one);
      transoms.setMatrixAt(i, m);

      // The light it throws on the floor in front of it.
      m.compose(
        new THREE.Vector3(x - spot.side * 0.75, 0.007, spot.z),
        q.clone().multiply(
          new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0))
        ),
        one
      );
      this.glows.setMatrixAt(i, m);
    });

    for (const mesh of [rings, sills, mullions, transoms, this.glows]) {
      mesh.instanceMatrix.needsUpdate = true;
    }
    this.group.add(rings, sills, mullions, transoms, this.glows);
  }

  setTheme(palette: Palette): void {
    const dark = palette.dark;
    const muted = hexToRgb(palette.muted);
    this.stoneMat.color.set(rgbToHex(dark ? darken(muted, 0.1) : lighten(muted, 0.2)));
    this.barMat.color.set(rgbToHex(dark ? darken(muted, 0.58) : darken(muted, 0.4)));
    this.glowMat.opacity = dark ? 0.4 : 0.5;

    for (const pane of this.panes) {
      pane.tex.image = skyCanvas(tintAt(palette, pane.stop / 4), dark);
      pane.tex.needsUpdate = true;
    }

    const c = new THREE.Color();
    this.spots.forEach((spot, i) => {
      const tint = tintAt(palette, spot.t);
      c.set(rgbToHex(dark ? mixOklab(tint, [1, 1, 1], 0.3) : lighten(tint, 0.62)));
      this.glows.setColorAt(i, c);
    });
    if (this.glows.instanceColor) this.glows.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose();
    this.stoneMat.dispose();
    this.barMat.dispose();
    this.glowMat.dispose();
    for (const pane of this.panes) {
      pane.tex.dispose();
      pane.mat.dispose();
    }
  }

  private geo<T extends THREE.BufferGeometry>(g: T): T {
    this.geometries.push(g);
    return g;
  }
}
