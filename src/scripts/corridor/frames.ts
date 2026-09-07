/*
  Frame designs for the corridor. Five mouldings, cycled so that no two
  neighbours — across the hall or along the same wall — share one:

    ornate     wide gilt moulding, inner lip, corner bosses
    cassetta   a flat walnut frieze between two gilt lips
    reeded     three slim rounded reeds in antique gold, rosettes at the corners
    ebonised   black lacquer with a gilt slip and gilt corner squares
    arched     a gilt tabernacle with a round-headed top and a keystone

  Each style is a list of parts; a part is one geometry + material plus the
  local placements it occupies per frame (one for a ring, four for bosses).
  The scene turns every part into a single InstancedMesh, so forty frames in
  five styles cost a dozen draw calls, not hundreds.

  Local frame space: x across the frame, y up, z out from the wall (the wall
  is z = 0). The art opening is `w` × `h`.
*/

import * as THREE from "three";

export interface FramePart {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  /** Local offsets this part occupies in every frame of the style. */
  placements: THREE.Vector3[];
}

export interface FrameStyle {
  name: string;
  /** The opening is round-headed; the mat is drawn to match. */
  arched: boolean;
  parts: FramePart[];
}

export interface FrameMaterials {
  gold: THREE.MeshStandardMaterial;
  antique: THREE.MeshStandardMaterial;
  ebony: THREE.MeshStandardMaterial;
  walnut: THREE.MeshStandardMaterial;
}

export function buildFrameMaterials(patina: THREE.Texture): FrameMaterials {
  const gold = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#c9a24a"),
    metalness: 0.92,
    roughness: 0.42,
    roughnessMap: patina,
    bumpMap: patina,
    bumpScale: 0.6,
  });
  // Older leaf: browner, duller, more worn through to the bole.
  const antique = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#a5802f"),
    metalness: 0.85,
    roughness: 0.58,
    roughnessMap: patina,
    bumpMap: patina,
    bumpScale: 0.9,
  });
  // Lacquer: dark, smooth, a little reflective.
  const ebony = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#191412"),
    metalness: 0.2,
    roughness: 0.3,
    bumpMap: patina,
    bumpScale: 0.15,
  });
  const walnut = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#4e3320"),
    metalness: 0,
    roughness: 0.62,
    bumpMap: patina,
    bumpScale: 0.35,
  });
  return { gold, antique, ebony, walnut };
}

/** Which style frame `i` takes. 7 is coprime with the style count, so a
 *  run of consecutive frames never repeats until every style has shown. */
export function styleIndexFor(i: number, count: number): number {
  return (i * 7 + 3) % count;
}

/**
 * Per-frame tint on the metal, so two gilt frames of the same style are not
 * the same gold: one warmer, one paler, one as the leaf came.
 */
export function metalTint(i: number): THREE.Color {
  const variants = [
    [1, 1, 1],
    [1.04, 0.97, 0.88],
    [0.96, 0.98, 1.02],
  ] as const;
  const v = variants[(i * 5 + 1) % variants.length];
  return new THREE.Color(v[0], v[1], v[2]);
}

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

function corners(dx: number, dy: number, z: number): THREE.Vector3[] {
  return [v3(-dx, -dy, z), v3(dx, -dy, z), v3(-dx, dy, z), v3(dx, dy, z)];
}

export function buildFrameStyles(
  m: FrameMaterials,
  w: number,
  h: number
): FrameStyle[] {
  const boss = new THREE.SphereGeometry(0.036, 14, 10);
  boss.scale(1, 1, 0.55);
  const rosette = new THREE.SphereGeometry(0.03, 12, 8);
  rosette.scale(1, 1, 0.45);
  const square = new THREE.BoxGeometry(0.06, 0.06, 0.012);

  const ornate: FrameStyle = {
    name: "ornate",
    arched: false,
    parts: [
      { geometry: ring(w + 0.22, h + 0.22, w, h, 0.04, 0.02, 0.03), material: m.gold, placements: [v3(0, 0, 0)] },
      { geometry: ring(w + 0.075, h + 0.075, w - 0.03, h - 0.03, 0.025, 0.01, 0.012), material: m.gold, placements: [v3(0, 0, 0.05)] },
      { geometry: boss, material: m.gold, placements: corners(w / 2 + 0.055, h / 2 + 0.055, 0.075) },
    ],
  };

  const cassetta: FrameStyle = {
    name: "cassetta",
    arched: false,
    parts: [
      { geometry: ring(w + 0.26, h + 0.26, w, h, 0.03, 0.004, 0.004), material: m.walnut, placements: [v3(0, 0, 0)] },
      { geometry: ring(w + 0.26, h + 0.26, w + 0.2, h + 0.2, 0.04, 0.008, 0.012), material: m.gold, placements: [v3(0, 0, 0.012)] },
      { geometry: ring(w + 0.06, h + 0.06, w - 0.03, h - 0.03, 0.035, 0.008, 0.012), material: m.gold, placements: [v3(0, 0, 0.02)] },
    ],
  };

  const reed = (o: number) =>
    ring(w + o * 2 + 0.07, h + o * 2 + 0.07, w + o * 2 - 0.03, h + o * 2 - 0.03, 0.016, 0.012, 0.018);
  const reeded: FrameStyle = {
    name: "reeded",
    arched: false,
    parts: [
      { geometry: reed(0), material: m.antique, placements: [v3(0, 0, 0.022)] },
      { geometry: reed(0.06), material: m.antique, placements: [v3(0, 0, 0.014)] },
      { geometry: reed(0.12), material: m.antique, placements: [v3(0, 0, 0.006)] },
      { geometry: rosette, material: m.antique, placements: corners(w / 2 + 0.08, h / 2 + 0.08, 0.05) },
    ],
  };

  const ebonised: FrameStyle = {
    name: "ebonised",
    arched: false,
    parts: [
      { geometry: ring(w + 0.24, h + 0.24, w + 0.02, h + 0.02, 0.035, 0.015, 0.03), material: m.ebony, placements: [v3(0, 0, 0)] },
      { geometry: ring(w + 0.06, h + 0.06, w - 0.03, h - 0.03, 0.03, 0.006, 0.01), material: m.gold, placements: [v3(0, 0, 0.03)] },
      { geometry: square, material: m.gold, placements: corners(w / 2 + 0.065, h / 2 + 0.065, 0.062) },
    ],
  };

  const arched: FrameStyle = {
    name: "arched",
    arched: true,
    parts: [
      { geometry: archRing(w + 0.22, h + 0.22, w, h, 0.04, 0.02, 0.03), material: m.gold, placements: [v3(0, 0, 0)] },
      { geometry: archRing(w + 0.075, h + 0.075, w - 0.03, h - 0.03, 0.025, 0.01, 0.012), material: m.gold, placements: [v3(0, 0, 0.05)] },
      // Keystone at the crown, bosses at the feet.
      { geometry: boss, material: m.gold, placements: [v3(0, h / 2 + 0.055, 0.075), v3(-(w / 2 + 0.055), -(h / 2 + 0.055), 0.075), v3(w / 2 + 0.055, -(h / 2 + 0.055), 0.075)] },
    ],
  };

  return [ornate, cassetta, reeded, ebonised, arched];
}

/* ---- geometry ---------------------------------------------------------- */

function rectPath(p: THREE.Path, w: number, h: number): void {
  p.moveTo(-w / 2, -h / 2);
  p.lineTo(w / 2, -h / 2);
  p.lineTo(w / 2, h / 2);
  p.lineTo(-w / 2, h / 2);
  p.closePath();
}

/** A rectangle whose top is a semicircle spanning its width. */
function archPath(p: THREE.Path, w: number, h: number): void {
  const r = w / 2;
  const yTop = h / 2 - r;
  p.moveTo(-w / 2, -h / 2);
  p.lineTo(w / 2, -h / 2);
  p.lineTo(w / 2, yTop);
  p.absarc(0, yTop, r, 0, Math.PI, false);
  p.lineTo(-w / 2, -h / 2);
  p.closePath();
}

function extrudeRing(
  shape: THREE.Shape,
  depth: number,
  bevelThickness: number,
  bevelSize: number,
  curveSegments: number
): THREE.BufferGeometry {
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness,
    bevelSize,
    bevelSegments: 4,
    curveSegments,
  });
  // Extrude starts its back bevel at -bevelThickness; shift so the back
  // face sits on z = 0, the wall.
  geo.translate(0, 0, bevelThickness);
  geo.computeVertexNormals();
  return geo;
}

/** A rectangular ring extruded with a rounded bevel: a picture moulding. */
export function ring(
  ow: number, oh: number, iw: number, ih: number,
  depth: number, bevelThickness: number, bevelSize: number
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  rectPath(shape, ow, oh);
  const hole = new THREE.Path();
  rectPath(hole, iw, ih);
  shape.holes.push(hole);
  return extrudeRing(shape, depth, bevelThickness, bevelSize, 2);
}

/**
 * The same, round-headed. Outer and inner arches share a centre when both
 * openings have the same h - w, which the callers above arrange.
 */
export function archRing(
  ow: number, oh: number, iw: number, ih: number,
  depth: number, bevelThickness: number, bevelSize: number
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  archPath(shape, ow, oh);
  const hole = new THREE.Path();
  archPath(hole, iw, ih);
  shape.holes.push(hole);
  return extrudeRing(shape, depth, bevelThickness, bevelSize, 24);
}
