/*
  The bearers: a tall, thin blue creature standing behind every floating
  frame, holding it out in front of itself for you to look at.

  Two things keep this from being a gimmick that ruins the hall.

  It is built so it never hides the book. The body is a narrow column no
  wider than a hand's span, so from behind the frame you still read the
  cover around it; what you see instead is a head over the top of every
  picture, two hands gripping the edges, and a pair of legs underneath. The
  height falls out of that rather than being chosen: the head has to clear
  the top of the frame it is holding, and the frame hangs at 1.8 m, so the
  creature comes out around two and three quarter metres tall. Which is the
  right kind of wrong.

  And it spends no new colour. The blue is --ct-tint-5, the slate the arc
  already ends on, lifted most of the way to a friendlier value; each
  creature varies a shade off it so a row of them does not read as clones.

  Everything is instanced. Every creature is the same pose, so each part's
  transform is worked out once in the frame's own local space and then
  composed with each frame's placement — the same trick the mouldings use.
*/

import * as THREE from "three";
import {
  type Palette,
  hexToRgb,
  lighten,
  darken,
  mixOklab,
  rgbToHex,
} from "./palette";

export interface BearerSpot {
  /** World placement of the frame this one is holding. */
  position: THREE.Vector3;
  yaw: number;
  index: number;
}

/** Body plan, in the frame's local space: origin at the picture's centre. */
const HEAD_R = 0.155;
const HEAD_Y = 0.8;
const SHOULDER_Y = 0.56;
const HIP_Y = -0.64;
const BEHIND = -0.19; // the creature stands this far back of the picture
const GRIP_X = 0.52;
const GRIP_Y = 0.05;
// Just proud of the moulding's front face, so the hands read as gripping
// the picture rather than as balls floating beside it.
const GRIP_Z = 0.06;

const UP = new THREE.Vector3(0, 1, 0);

/** A capsule-ish limb from a to b: a unit cylinder turned and stretched. */
function limb(a: THREE.Vector3, b: THREE.Vector3): THREE.Matrix4 {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length() || 1e-6;
  const q = new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().divideScalar(len));
  return new THREE.Matrix4().compose(
    new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5),
    q,
    new THREE.Vector3(1, len, 1)
  );
}

function at(x: number, y: number, z: number, s = 1, sy = s): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion(),
    new THREE.Vector3(s, sy, s)
  );
}

interface Part {
  geometry: THREE.BufferGeometry;
  /** "skin" takes the creature's colour; "ink" is the eyes. */
  paint: "skin" | "ink";
  placements: THREE.Matrix4[];
}

export class Bearers {
  readonly group = new THREE.Group();

  private readonly skinMat: THREE.MeshStandardMaterial;
  private readonly inkMat: THREE.MeshStandardMaterial;
  private readonly meshes: THREE.InstancedMesh[] = [];
  private readonly skinMeshes: THREE.InstancedMesh[] = [];
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly count: number;

  /**
   * @param spots one per frame
   * @param artY  the height the frames hang at, so the feet find the floor
   */
  constructor(spots: BearerSpot[], artY: number) {
    this.count = spots.length;
    const floor = -artY;

    this.skinMat = new THREE.MeshStandardMaterial({
      roughness: 0.72,
      metalness: 0,
      emissive: new THREE.Color(1, 1, 1),
      emissiveIntensity: 0.05,
    });
    this.inkMat = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.1 });

    const ball = this.geo(new THREE.SphereGeometry(1, 14, 10));
    const rod = this.geo(new THREE.CylinderGeometry(1, 1, 1, 8));

    const shoulder = 0.13;
    const parts: Part[] = [
      // Head, a touch egg-shaped, with two dark eyes on the front of it.
      { geometry: ball, paint: "skin", placements: [at(0, HEAD_Y, BEHIND, HEAD_R, HEAD_R * 1.16)] },
      {
        geometry: ball,
        paint: "ink",
        placements: [
          at(-0.062, HEAD_Y + 0.02, BEHIND + HEAD_R * 0.86, 0.034, 0.044),
          at(0.062, HEAD_Y + 0.02, BEHIND + HEAD_R * 0.86, 0.034, 0.044),
        ],
      },
      // Neck and a narrow torso. Narrow is the point: anything wider would
      // block the back of the picture it is holding.
      {
        geometry: rod,
        paint: "skin",
        placements: [
          limb(new THREE.Vector3(0, HEAD_Y - 0.13, BEHIND), new THREE.Vector3(0, SHOULDER_Y, BEHIND))
            .scale(new THREE.Vector3(0.052, 1, 0.052)),
          limb(new THREE.Vector3(0, SHOULDER_Y, BEHIND), new THREE.Vector3(0, HIP_Y, BEHIND))
            .scale(new THREE.Vector3(0.105, 1, 0.085)),
        ],
      },
      // Arms out to the edges of the frame, and the hands gripping them.
      {
        geometry: rod,
        paint: "skin",
        placements: [-1, 1].map(sx =>
          limb(
            new THREE.Vector3(sx * shoulder, SHOULDER_Y - 0.04, BEHIND),
            new THREE.Vector3(sx * GRIP_X, GRIP_Y, GRIP_Z)
          ).scale(new THREE.Vector3(0.036, 1, 0.036))
        ),
      },
      {
        geometry: ball,
        paint: "skin",
        placements: [-1, 1].map(sx => at(sx * GRIP_X, GRIP_Y, GRIP_Z, 0.068)),
      },
      // Legs down to the floor, and two flat feet.
      {
        geometry: rod,
        paint: "skin",
        placements: [-1, 1].map(sx =>
          limb(
            new THREE.Vector3(sx * 0.075, HIP_Y, BEHIND),
            new THREE.Vector3(sx * 0.075, floor + 0.03, BEHIND)
          ).scale(new THREE.Vector3(0.055, 1, 0.055))
        ),
      },
      {
        geometry: ball,
        paint: "skin",
        placements: [-1, 1].map(sx => at(sx * 0.075, floor + 0.04, BEHIND + 0.04, 0.085, 0.045)),
      },
    ];

    const m = new THREE.Matrix4();
    const world = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);

    for (const part of parts) {
      const mat = part.paint === "skin" ? this.skinMat : this.inkMat;
      const mesh = new THREE.InstancedMesh(
        part.geometry,
        mat,
        Math.max(1, spots.length * part.placements.length)
      );
      mesh.count = spots.length * part.placements.length;
      let slot = 0;
      spots.forEach(spot => {
        q.setFromEuler(new THREE.Euler(0, spot.yaw, 0));
        world.compose(spot.position, q, one);
        for (const local of part.placements) {
          m.multiplyMatrices(world, local);
          mesh.setMatrixAt(slot++, m);
        }
      });
      mesh.instanceMatrix.needsUpdate = true;
      this.meshes.push(mesh);
      if (part.paint === "skin") this.skinMeshes.push(mesh);
      this.group.add(mesh);
    }

  }

  setTheme(palette: Palette): void {
    const dark = palette.dark;
    // The arc's own slate, warmed a hair so it is not a cold blue.
    //
    // The two themes pull opposite ways here. The --ct-tint tokens are UI
    // values, picked to read against the background they sit on, so the dark
    // theme's slate is #9db8cc — a pale ice blue. Right for a line on a dark
    // page, wrong for a creature standing under a lamp, which needs pigment
    // rather than contrast. So the dark theme darkens its stop while the
    // light theme lightens its own.
    const slate = hexToRgb(palette.tints[4]);
    const base = dark
      ? mixOklab(darken(slate, 0.42), [0.45, 0.62, 0.88], 0.2)
      : mixOklab(lighten(slate, 0.42), [0.55, 0.7, 0.95], 0.3);
    this.skinMat.color.set(rgbToHex(base));
    // Eyes stay dark in both themes. --foreground inverts with the theme, so
    // deriving them from it turns them into two pale gold coins at night.
    this.inkMat.color.set("#161210");
    this.skinMat.emissiveIntensity = dark ? 0.03 : 0.04;
    this.skinMat.emissive.set(rgbToHex(base));

    // A shade each so a row of them is not a row of clones.
    const c = new THREE.Color();
    for (const mesh of this.skinMeshes) {
      const per = mesh.count / Math.max(1, this.count);
      for (let i = 0; i < mesh.count; i++) {
        const who = Math.floor(i / per);
        const v = 1 + (((who * 5 + 2) % 5) - 2) * 0.035;
        c.setRGB(v, v, v);
        mesh.setColorAt(i, c);
      }
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose();
    this.skinMat.dispose();
    this.inkMat.dispose();
  }

  private geo<T extends THREE.BufferGeometry>(g: T): T {
    this.geometries.push(g);
    return g;
  }
}
