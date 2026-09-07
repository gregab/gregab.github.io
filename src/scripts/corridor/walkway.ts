/*
  An airport-style moving walkway laid down the centre of the corridor floor.
  It is a self-contained decoration: it does not move the player (that is
  corridor.ts's job, using carries()/speed to nudge whoever is standing on
  it) and it does not know about the hall's dimensions beyond the belt's own
  span. Like the rest of the corridor, its surface is a procedural canvas
  texture rather than an image asset.
*/

import * as THREE from "three";
import { makeCanvas } from "./textures";

export interface WalkwayOptions {
  /** z where the belt begins (the larger, nearer-the-start value). */
  zStart: number;
  /** z where the belt ends (the smaller, far value). */
  zEnd: number;
  /** Belt width in metres. */
  width?: number;
  /** Belt speed in m/s toward -z. */
  speed?: number;
}

const DEFAULT_WIDTH = 1.2;
const DEFAULT_SPEED = 1.0;
const TILE = 0.5; // metres per texture tile, both axes

/* A small deterministic PRNG so the tread grain doesn't reshuffle every reload. */
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
 * The belt surface: dark rubber with transverse metal-pallet ridges, the way
 * a real moving walkway's tread is built from linked slats. One tile is
 * TILE metres, repeated to cover the belt's actual width and length.
 */
function treadCanvas(): HTMLCanvasElement {
  const size = 256;
  const c = makeCanvas(size, size);
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable");
  const rnd = mulberry32(31);

  ctx.fillStyle = "#2a2624";
  ctx.fillRect(0, 0, size, size);

  // Transverse pallet ridges: each is a light leading edge and a dark
  // trailing edge, so under raking light it reads as corrugated slats
  // rather than a flat print.
  const pitch = 16;
  for (let y = 0; y < size; y += pitch) {
    ctx.fillStyle = "rgba(255,255,255,0.10)";
    ctx.fillRect(0, y, size, 2);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(0, y + 2, size, 2);
    // A thin lighter groove halfway to the next ridge, like a worn seam.
    ctx.fillStyle = "rgba(255,255,255,0.045)";
    ctx.fillRect(0, y + pitch / 2, size, 1);
  }

  // Rubber grain.
  for (let i = 0; i < 4000; i++) {
    ctx.fillStyle = rnd() > 0.5 ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.05)";
    ctx.fillRect(rnd() * size, rnd() * size, 1, 1);
  }
  return c;
}

/**
 * A moving walkway down the middle of the hall floor: belt, brass edge
 * trims and a comb plate at each end. Purely visual and geometric — the
 * owning scene decides what to do with carries()/speed (e.g. adding the
 * belt's push to the player's velocity while they stand on it).
 */
export class Walkway {
  /** Add this to the scene. */
  readonly group: THREE.Group;
  readonly speed: number;
  readonly halfWidth: number;

  private readonly zStart: number;
  private readonly zEnd: number;
  private readonly tex: THREE.CanvasTexture;
  private readonly beltGeo: THREE.PlaneGeometry;
  private readonly beltMat: THREE.MeshStandardMaterial;
  private readonly trimGeo: THREE.BoxGeometry;
  private readonly trimMat: THREE.MeshStandardMaterial;
  private readonly combGeo: THREE.BoxGeometry;
  private readonly combMat: THREE.MeshStandardMaterial;

  constructor(opts: WalkwayOptions) {
    const width = opts.width ?? DEFAULT_WIDTH;
    const speed = opts.speed ?? DEFAULT_SPEED;
    const { zStart, zEnd } = opts;
    const length = zStart - zEnd;
    const zc = (zStart + zEnd) / 2;

    this.zStart = zStart;
    this.zEnd = zEnd;
    this.speed = speed;
    this.halfWidth = width / 2;
    this.group = new THREE.Group();

    // Belt
    this.tex = new THREE.CanvasTexture(treadCanvas());
    this.tex.wrapS = this.tex.wrapT = THREE.RepeatWrapping;
    this.tex.repeat.set(width / TILE, length / TILE);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 8;

    this.beltGeo = new THREE.PlaneGeometry(width, length);
    this.beltMat = new THREE.MeshStandardMaterial({ map: this.tex, roughness: 0.85 });
    const belt = new THREE.Mesh(this.beltGeo, this.beltMat);
    belt.rotation.x = -Math.PI / 2;
    belt.position.set(0, 0.012, zc);
    this.group.add(belt);

    // Edge trims
    this.trimGeo = new THREE.BoxGeometry(0.035, 0.02, length);
    this.trimMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#b08d3c"),
      metalness: 0.85,
      roughness: 0.4,
    });
    const trimOffset = width / 2 + 0.0175;
    const trimL = new THREE.Mesh(this.trimGeo, this.trimMat);
    trimL.position.set(-trimOffset, 0.01, zc);
    const trimR = new THREE.Mesh(this.trimGeo, this.trimMat);
    trimR.position.set(trimOffset, 0.01, zc);
    this.group.add(trimL, trimR);

    // Comb plates at both ends, where the belt disappears under the floor.
    this.combGeo = new THREE.BoxGeometry(width + 0.07, 0.022, 0.32);
    this.combMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#8a8580"),
      metalness: 0.9,
      roughness: 0.35,
    });
    const combStart = new THREE.Mesh(this.combGeo, this.combMat);
    combStart.position.set(0, 0.011, zStart - 0.16);
    const combEnd = new THREE.Mesh(this.combGeo, this.combMat);
    combEnd.position.set(0, 0.011, zEnd + 0.16);
    this.group.add(combStart, combEnd);
  }

  /** True when a point on the floor plane is standing on the belt. */
  carries(x: number, z: number): boolean {
    return Math.abs(x) <= this.halfWidth && z <= this.zStart && z >= this.zEnd;
  }

  /** Advance the belt's visual motion by dt seconds (scroll the tread texture). */
  update(dt: number): void {
    // The plane is rotated -Math.PI/2 about x, so its local +v axis maps to
    // world -z: a texture feature at a fixed v appears at a smaller world z
    // as v increases. Sampled UV is (surface UV + offset), so making a
    // feature's apparent v grow over time — i.e. walking it toward -z, the
    // belt's direction of travel — means shrinking the offset, not growing it.
    this.tex.offset.y -= (this.speed * dt) / TILE;
    // Keep the offset bounded rather than growing without limit forever.
    this.tex.offset.y = ((this.tex.offset.y % 1) + 1) % 1;
  }

  /** Re-tint for the light or dark site theme. */
  setTheme(dark: boolean): void {
    // The tread is dark rubber either way; in the dark theme the floor
    // around it is darker too, so lift the belt a shade to keep it legible.
    this.beltMat.color.set(dark ? "#e8e4e0" : "#ffffff");
  }

  /** Dispose geometries, materials, textures. */
  dispose(): void {
    this.beltGeo.dispose();
    this.trimGeo.dispose();
    this.combGeo.dispose();
    this.beltMat.dispose();
    this.trimMat.dispose();
    this.combMat.dispose();
    this.tex.dispose();
  }
}
