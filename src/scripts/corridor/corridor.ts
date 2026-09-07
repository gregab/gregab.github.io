/*
  The curiosity corridor: a first-person gallery of the reading list. Books
  hang in gilt frames, alternating left and right down a long hall — the same
  zigzag the 2D timeline draws, stood up and walked through. Each frame sits
  in a pool of light whose colour samples the timeline's five-stop arc, so
  the hall warms from gold at the start to slate at the far end.

  Everything here is built at run time from src/data/curiosity.ts and the
  theme tokens in theme.css; the only network requests are the covers.

  Performance notes, since phones are the target:
  - The frames' mouldings are one InstancedMesh each; per-frame draw calls
    are the art plane, the plaque and an invisible hit plane.
  - Real lights are a lantern on the camera plus a small pool of spotlights
    that hop to the nearest frames. The glow you see on far walls and the
    floor is unlit additive decals, which cost nothing.
  - Nothing renders while nothing moves.
  - Covers load nearest-first, only within reach, in the large size, so
    walking the whole hall costs bandwidth in proportion to how far you go.
*/

import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { findCover } from "@/lib/openlibrary.mjs";
import {
  coverCacheKey,
  evictOldCoverCaches,
  readCoverCache,
  writeCoverCache,
} from "@/lib/coverCache";
import { Controls } from "./input";
import {
  type Palette,
  type RGB,
  readPalette,
  hexToRgb,
  tintAt,
  lighten,
  darken,
} from "./palette";
import {
  Art,
  coneCanvas,
  glowCanvas,
  patinaCanvas,
  plankCanvas,
  plankRoughnessCanvas,
  plaqueCanvas,
  plasterCanvas,
} from "./textures";

export interface CorridorEntry {
  title: string;
  author?: string;
  url: string;
  series?: boolean;
  cover?: string;
  lookup?: string;
}

/* ---- dimensions (metres) ---------------------------------------------- */

const HALL_W = 3.6;
const HALL_H = 3.5;
const EYE = 1.62;
const SPACING = 1.9; // z between consecutive frames (they alternate walls)
const RUN = 5.5; // hall beyond the first and last frame
const FRAME_W = 0.66; // the art
const FRAME_H = 0.99;
const BORDER = 0.11; // moulding width
const FRAME_Y = 1.62; // centre height
const PLAQUE_W = 0.42;
const PLAQUE_H = 0.105;
const PLAQUE_Y = FRAME_Y - FRAME_H / 2 - BORDER - 0.09;
const FIXTURE_IN = 0.55; // ceiling spot's distance from the wall

const WALK = 2.5; // m/s
const RUNSPEED = 4.4;
const TURN_RATE = 1.7; // rad/s at full deflection
const LOOK_MOUSE = 0.0032; // rad per px
const LOOK_TOUCH = 0.0055;
const PITCH_MAX = 0.95;
const COVER_REACH = 14; // load covers within this many metres
const NEAR_SPOTS_DESKTOP = 4;
const NEAR_SPOTS_MOBILE = 3;

interface FrameRec {
  index: number;
  entry: CorridorEntry;
  side: -1 | 1;
  z: number;
  tint: RGB;
  group: THREE.Group;
  art: Art;
  artTex: THREE.CanvasTexture;
  hit: THREE.Mesh;
  centre: THREE.Vector3;
  coverState: "idle" | "loading" | "done" | "failed";
}

interface Els {
  root: HTMLElement;
  canvas: HTMLCanvasElement;
  stick: HTMLElement;
  knob: HTMLElement;
  label: HTMLAnchorElement;
  labelTitle: HTMLElement;
  labelMeta: HTMLElement;
  fullscreen: HTMLButtonElement | null;
}

export class Corridor {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: Controls;
  private readonly frames: FrameRec[] = [];
  private readonly hits: THREE.Object3D[] = [];
  private readonly raycaster = new THREE.Raycaster();
  private readonly resizeObs: ResizeObserver;
  private readonly themeObs: MutationObserver;
  private readonly abort = new AbortController();
  private readonly coarse = matchMedia("(pointer: coarse)").matches;
  private readonly reducedMotion = matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  private palette: Palette;
  private family: string;
  private raf = 0;
  private last = 0;
  private needsRender = true;
  private disposed = false;

  // Player
  private yaw = 0;
  private pitch = 0;
  private readonly pos = new THREE.Vector3(0, EYE, 2.8);
  private readonly vel = new THREE.Vector3();
  private bobPhase = 0;
  private readonly zMin: number;
  private readonly zMax: number;

  // Scene bits that change with the theme
  private wallMat!: THREE.MeshStandardMaterial;
  private floorMat!: THREE.MeshStandardMaterial;
  private ceilMat!: THREE.MeshStandardMaterial;
  private trimMat!: THREE.MeshStandardMaterial;
  private crownMat!: THREE.MeshStandardMaterial;
  private doorMat!: THREE.MeshBasicMaterial;
  private coneMat!: THREE.MeshBasicMaterial;
  private poolMat!: THREE.MeshBasicMaterial;
  private discMat!: THREE.MeshBasicMaterial;
  private goldMat!: THREE.MeshStandardMaterial;
  private hemi!: THREE.HemisphereLight;
  private lantern!: THREE.PointLight;
  private spots: THREE.SpotLight[] = [];
  private outerRing!: THREE.InstancedMesh;
  private cones!: THREE.InstancedMesh;
  private pools!: THREE.InstancedMesh;
  private discs!: THREE.InstancedMesh;
  private plasterTex!: THREE.CanvasTexture;

  // Interaction
  private hoverIndex = -1;
  private aimedIndex = -1;
  private hoverPoint: { x: number; y: number } | null = null;
  private highlightIndex = -1;

  // Adaptive resolution
  private dpr: number;
  private slowFrames = 0;

  // Cover loading
  private loadsInFlight = 0;
  private readonly maxLoads = 3;

  constructor(
    private readonly els: Els,
    private readonly entries: CorridorEntry[]
  ) {
    this.palette = readPalette();
    this.family = readFontFamily();

    const n = Math.max(entries.length, 1);
    this.zMax = RUN;
    this.zMin = -(n - 1) * SPACING - RUN;

    this.renderer = new THREE.WebGLRenderer({
      canvas: els.canvas,
      antialias: true,
      powerPreference: "high-performance",
      alpha: false,
      stencil: false,
    });
    this.dpr = Math.min(window.devicePixelRatio || 1, this.coarse ? 1.75 : 2);
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.camera = new THREE.PerspectiveCamera(65, 1, 0.05, 80);
    this.camera.rotation.order = "YXZ";

    // Environment first: the gilt needs something to reflect.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    this.buildHall();
    this.buildFrames();
    this.buildLights();
    this.applyPalette();

    this.controls = new Controls(
      els.root,
      els.canvas,
      { stick: els.stick, knob: els.knob },
      {
        onTap: (x, y) => this.tap(x, y),
        onHover: (x, y) => {
          this.hoverPoint = { x, y };
          this.needsRender = true;
        },
        onHoverEnd: () => {
          this.hoverPoint = null;
          this.needsRender = true;
        },
        onActivate: () => this.openAimed(),
      }
    );

    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(els.root);
    this.resize();

    this.themeObs = new MutationObserver(() => {
      this.palette = readPalette();
      this.applyPalette();
      this.needsRender = true;
    });
    this.themeObs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    document.addEventListener(
      "visibilitychange",
      () => {
        if (document.hidden) this.stopLoop();
        else this.startLoop();
      },
      { signal: this.abort.signal }
    );

    this.setupFullscreen();
    if (this.coarse) els.root.dataset.touch = "1";

    // Plaques and placeholders want the real serif; redraw once it's in.
    void loadFonts(this.family).then(() => {
      if (this.disposed) return;
      this.family = readFontFamily();
      this.redrawText();
    });

    evictOldCoverCaches();
    this.startLoop();
  }

  /** Where the player stands and looks — for tests and the console. */
  get state(): { x: number; z: number; yaw: number; pitch: number; aimed: number } {
    return { x: this.pos.x, z: this.pos.z, yaw: this.yaw, pitch: this.pitch, aimed: this.aimedIndex };
  }
  set state(s: Partial<{ x: number; z: number; yaw: number; pitch: number }>) {
    if (s.x !== undefined) this.pos.x = s.x;
    if (s.z !== undefined) this.pos.z = s.z;
    if (s.yaw !== undefined) this.yaw = s.yaw;
    if (s.pitch !== undefined) this.pitch = s.pitch;
    this.needsRender = true;
  }

  /* ---- construction ---------------------------------------------------- */

  private buildHall(): void {
    const L = this.zMax - this.zMin;
    const zc = (this.zMax + this.zMin) / 2;

    this.plasterTex = new THREE.CanvasTexture(
      plasterCanvas(hexToRgb(this.palette.muted))
    );
    this.plasterTex.wrapS = this.plasterTex.wrapT = THREE.RepeatWrapping;
    this.plasterTex.colorSpace = THREE.SRGBColorSpace;
    this.plasterTex.anisotropy = Math.min(
      8,
      this.renderer.capabilities.getMaxAnisotropy()
    );

    const plankTex = new THREE.CanvasTexture(plankCanvas(this.palette.dark));
    plankTex.wrapS = plankTex.wrapT = THREE.RepeatWrapping;
    plankTex.colorSpace = THREE.SRGBColorSpace;
    plankTex.anisotropy = this.plasterTex.anisotropy;
    plankTex.repeat.set(HALL_W / 1.2, L / 1.2);
    const plankRough = new THREE.CanvasTexture(plankRoughnessCanvas());
    plankRough.wrapS = plankRough.wrapT = THREE.RepeatWrapping;
    plankRough.repeat.copy(plankTex.repeat);

    this.wallMat = new THREE.MeshStandardMaterial({
      map: this.plasterTex,
      roughness: 0.96,
      metalness: 0,
    });
    this.floorMat = new THREE.MeshStandardMaterial({
      map: plankTex,
      roughnessMap: plankRough,
      roughness: 0.75,
      metalness: 0.05,
    });
    this.ceilMat = new THREE.MeshStandardMaterial({ roughness: 1 });
    this.trimMat = new THREE.MeshStandardMaterial({ roughness: 0.6 });
    this.crownMat = new THREE.MeshStandardMaterial({ roughness: 0.9 });
    this.doorMat = new THREE.MeshBasicMaterial();

    const wallGeo = new THREE.PlaneGeometry(L, HALL_H);
    const left = new THREE.Mesh(wallGeo, this.wallMat);
    left.position.set(-HALL_W / 2, HALL_H / 2, zc);
    left.rotation.y = Math.PI / 2;
    const right = new THREE.Mesh(wallGeo, this.wallMat);
    right.position.set(HALL_W / 2, HALL_H / 2, zc);
    right.rotation.y = -Math.PI / 2;
    // Repeat along the wall; a fresh texture object per axis is not needed,
    // the repeat is set once for the wall and reused by the ceiling.
    this.plasterTex.repeat.set(L / 2, HALL_H / 2);

    const floorGeo = new THREE.PlaneGeometry(HALL_W, L);
    const floor = new THREE.Mesh(floorGeo, this.floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, zc);

    const ceil = new THREE.Mesh(floorGeo, this.ceilMat);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(0, HALL_H, zc);

    const endGeo = new THREE.PlaneGeometry(HALL_W, HALL_H);
    const farEnd = new THREE.Mesh(endGeo, this.wallMat);
    farEnd.position.set(0, HALL_H / 2, this.zMin);
    const nearEnd = new THREE.Mesh(endGeo, this.wallMat);
    nearEnd.position.set(0, HALL_H / 2, this.zMax);
    nearEnd.rotation.y = Math.PI;

    // A dark doorway in each end wall: the hall continues past what's hung.
    const doorGeo = new THREE.PlaneGeometry(1.3, 2.5);
    const farDoor = new THREE.Mesh(doorGeo, this.doorMat);
    farDoor.position.set(0, 1.25, this.zMin + 0.01);
    const nearDoor = new THREE.Mesh(doorGeo, this.doorMat);
    nearDoor.position.set(0, 1.25, this.zMax - 0.01);
    nearDoor.rotation.y = Math.PI;
    const archGeo = new THREE.BoxGeometry(1.5, 2.6, 0.08);
    const archMat = this.trimMat;
    const farArch = new THREE.Mesh(archGeo, archMat);
    farArch.position.set(0, 1.3, this.zMin + 0.02);
    const nearArch = new THREE.Mesh(archGeo, archMat);
    nearArch.position.set(0, 1.3, this.zMax - 0.02);

    const baseGeo = new THREE.BoxGeometry(0.035, 0.17, L);
    const baseL = new THREE.Mesh(baseGeo, this.trimMat);
    baseL.position.set(-HALL_W / 2 + 0.017, 0.085, zc);
    const baseR = new THREE.Mesh(baseGeo, this.trimMat);
    baseR.position.set(HALL_W / 2 - 0.017, 0.085, zc);

    const crownGeo = new THREE.BoxGeometry(0.07, 0.11, L);
    const crownL = new THREE.Mesh(crownGeo, this.crownMat);
    crownL.position.set(-HALL_W / 2 + 0.035, HALL_H - 0.055, zc);
    const crownR = new THREE.Mesh(crownGeo, this.crownMat);
    crownR.position.set(HALL_W / 2 - 0.035, HALL_H - 0.055, zc);

    // Picture rail: a slim moulding at frame-top height along both walls.
    const railGeo = new THREE.BoxGeometry(0.03, 0.04, L);
    const railY = FRAME_Y + FRAME_H / 2 + BORDER + 0.32;
    const railL = new THREE.Mesh(railGeo, this.crownMat);
    railL.position.set(-HALL_W / 2 + 0.015, railY, zc);
    const railR = new THREE.Mesh(railGeo, this.crownMat);
    railR.position.set(HALL_W / 2 - 0.015, railY, zc);

    this.scene.add(
      left, right, floor, ceil, farEnd, nearEnd,
      farDoor, nearDoor, farArch, nearArch,
      baseL, baseR, crownL, crownR, railL, railR
    );
  }

  private buildFrames(): void {
    const n = this.entries.length;
    const patina = new THREE.CanvasTexture(patinaCanvas());
    patina.wrapS = patina.wrapT = THREE.RepeatWrapping;
    patina.repeat.set(3, 3);

    this.goldMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#c9a24a"),
      metalness: 0.92,
      roughness: 0.42,
      roughnessMap: patina,
      bumpMap: patina,
      bumpScale: 0.6,
      envMapIntensity: 1,
    });

    const outerGeo = ringGeometry(
      FRAME_W + 2 * BORDER, FRAME_H + 2 * BORDER,
      FRAME_W + 0.02, FRAME_H + 0.02,
      0.04, 0.02, 0.03
    );
    const lipGeo = ringGeometry(
      FRAME_W + 0.075, FRAME_H + 0.075,
      FRAME_W - 0.01, FRAME_H - 0.01,
      0.025, 0.01, 0.012
    );
    const bossGeo = new THREE.SphereGeometry(0.036, 14, 10);
    bossGeo.scale(1, 1, 0.55);

    this.outerRing = new THREE.InstancedMesh(outerGeo, this.goldMat, n);
    const lipRing = new THREE.InstancedMesh(lipGeo, this.goldMat, n);
    const bosses = new THREE.InstancedMesh(bossGeo, this.goldMat, n * 4);

    const coneTex = new THREE.CanvasTexture(coneCanvas());
    coneTex.colorSpace = THREE.SRGBColorSpace;
    const glowTex = new THREE.CanvasTexture(glowCanvas());
    glowTex.colorSpace = THREE.SRGBColorSpace;
    this.coneMat = new THREE.MeshBasicMaterial({
      map: coneTex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: true,
    });
    this.poolMat = new THREE.MeshBasicMaterial({
      map: glowTex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: true,
    });
    this.discMat = new THREE.MeshBasicMaterial({ fog: true });
    const coneGeo = new THREE.PlaneGeometry(1.9, 2.5);
    const poolGeo = new THREE.PlaneGeometry(2.3, 1.5);
    const fixtureGeo = new THREE.CylinderGeometry(0.045, 0.065, 0.13, 16);
    const discGeo = new THREE.CircleGeometry(0.04, 16);
    this.cones = new THREE.InstancedMesh(coneGeo, this.coneMat, n);
    this.pools = new THREE.InstancedMesh(poolGeo, this.poolMat, n);
    const fixtures = new THREE.InstancedMesh(fixtureGeo, this.trimMat, n);
    this.discs = new THREE.InstancedMesh(discGeo, this.discMat, n);
    this.cones.renderOrder = 2;
    this.pools.renderOrder = 2;

    const hitGeo = new THREE.PlaneGeometry(
      FRAME_W + 2 * BORDER + 0.12,
      FRAME_H + 2 * BORDER + 0.42
    );
    const plaqueGeo = new THREE.BoxGeometry(PLAQUE_W, PLAQUE_H, 0.012);
    const artGeo = new THREE.PlaneGeometry(FRAME_W + 0.02, FRAME_H + 0.02);

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3(1, 1, 1);
    const p = new THREE.Vector3();
    const white = new THREE.Color(1, 1, 1);

    this.entries.forEach((entry, i) => {
      const side: -1 | 1 = i % 2 === 0 ? -1 : 1;
      const z = -i * SPACING;
      const tint = tintAt(this.palette, n > 1 ? i / (n - 1) : 0);
      const facing = side === -1 ? Math.PI / 2 : -Math.PI / 2;

      const group = new THREE.Group();
      group.position.set(side * HALL_W / 2, FRAME_Y, z);
      group.rotation.y = facing;
      group.updateMatrixWorld(true);

      // Instanced mouldings share the group's transform.
      q.setFromEuler(new THREE.Euler(0, facing, 0));
      p.set(side * HALL_W / 2, FRAME_Y, z);
      m.compose(p, q, s);
      this.outerRing.setMatrixAt(i, m);
      this.outerRing.setColorAt(i, white);
      // The lip sits proud of the outer ring's face.
      const lipOffset = new THREE.Vector3(0, 0, 0.05).applyQuaternion(q);
      m.compose(p.clone().add(lipOffset), q, s);
      lipRing.setMatrixAt(i, m);
      // Corner bosses
      const bx = FRAME_W / 2 + BORDER / 2 + 0.01;
      const by = FRAME_H / 2 + BORDER / 2 + 0.01;
      [[-bx, -by], [bx, -by], [-bx, by], [bx, by]].forEach(([ox, oy], k) => {
        const off = new THREE.Vector3(ox, oy, 0.075).applyQuaternion(q);
        m.compose(p.clone().add(off), q, s);
        bosses.setMatrixAt(i * 4 + k, m);
      });

      // Wall cone, slightly above the frame centre, flush to the wall.
      const coneOff = new THREE.Vector3(0, 0.45, -0.002).applyQuaternion(q);
      m.compose(p.clone().add(coneOff), q, s);
      this.cones.setMatrixAt(i, m);
      // Floor pool
      const poolQ = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(-Math.PI / 2, 0, 0)
      );
      m.compose(new THREE.Vector3(side * (HALL_W / 2 - 0.8), 0.006, z), poolQ, s);
      this.pools.setMatrixAt(i, m);
      // Ceiling fixture + its glowing face
      const fx = side * (HALL_W / 2 - FIXTURE_IN);
      m.compose(new THREE.Vector3(fx, HALL_H - 0.065, z), new THREE.Quaternion(), s);
      fixtures.setMatrixAt(i, m);
      const discQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
      m.compose(new THREE.Vector3(fx, HALL_H - 0.132, z), discQ, s);
      this.discs.setMatrixAt(i, m);

      // The art
      const art = new Art({ title: entry.title, author: entry.author, tint, family: this.family });
      const artTex = new THREE.CanvasTexture(art.canvas);
      artTex.colorSpace = THREE.SRGBColorSpace;
      artTex.anisotropy = this.plasterTex.anisotropy;
      const artMat = new THREE.MeshStandardMaterial({
        map: artTex,
        emissiveMap: artTex,
        emissive: new THREE.Color(1, 1, 1),
        emissiveIntensity: 0.28,
        roughness: 0.5,
        metalness: 0,
      });
      const artMesh = new THREE.Mesh(artGeo, artMat);
      artMesh.position.z = 0.03;
      group.add(artMesh);

      // The plaque
      const plaqueTex = new THREE.CanvasTexture(
        plaqueCanvas(
          { title: entry.title, author: entry.author, series: entry.series },
          this.family
        )
      );
      plaqueTex.colorSpace = THREE.SRGBColorSpace;
      plaqueTex.anisotropy = this.plasterTex.anisotropy;
      const plaqueMat = new THREE.MeshStandardMaterial({
        map: plaqueTex,
        metalness: 0.6,
        roughness: 0.32,
      });
      const plaque = new THREE.Mesh(plaqueGeo, plaqueMat);
      plaque.position.set(0, PLAQUE_Y - FRAME_Y, 0.006);
      group.add(plaque);

      // Invisible hit plane over frame + plaque
      const hit = new THREE.Mesh(hitGeo);
      hit.visible = false;
      hit.position.set(0, -0.15, 0.06);
      hit.userData.index = i;
      group.add(hit);
      this.hits.push(hit);

      this.scene.add(group);
      this.frames.push({
        index: i,
        entry,
        side,
        z,
        tint,
        group,
        art,
        artTex,
        hit,
        centre: new THREE.Vector3(side * HALL_W / 2, FRAME_Y, z),
        coverState: "idle",
      });
    });

    this.outerRing.instanceMatrix.needsUpdate = true;
    lipRing.instanceMatrix.needsUpdate = true;
    bosses.instanceMatrix.needsUpdate = true;
    this.cones.instanceMatrix.needsUpdate = true;
    this.pools.instanceMatrix.needsUpdate = true;
    fixtures.instanceMatrix.needsUpdate = true;
    this.discs.instanceMatrix.needsUpdate = true;
    if (this.outerRing.instanceColor) this.outerRing.instanceColor.needsUpdate = true;

    this.scene.add(this.outerRing, lipRing, bosses, this.cones, this.pools, fixtures, this.discs);
  }

  private buildLights(): void {
    this.hemi = new THREE.HemisphereLight(0xfff1dc, 0x2a1d14, 0.5);
    this.scene.add(this.hemi);

    this.lantern = new THREE.PointLight(0xffe2b8, 16, 0, 2);
    this.scene.add(this.lantern);

    const count = this.coarse ? NEAR_SPOTS_MOBILE : NEAR_SPOTS_DESKTOP;
    for (let i = 0; i < count; i++) {
      const spot = new THREE.SpotLight(0xffffff, 30, 7, 0.62, 0.7, 1.6);
      spot.target = new THREE.Object3D();
      this.scene.add(spot, spot.target);
      this.spots.push(spot);
    }
  }

  /* ---- theme ----------------------------------------------------------- */

  private applyPalette(): void {
    const p = this.palette;
    const dark = p.dark;
    const bg = hexToRgb(p.background);
    const muted = hexToRgb(p.muted);

    // The walls carry the plaster texture painted in --muted; multiply a
    // touch lighter in the dark theme so they are not the same value as
    // the floor.
    this.plasterTex.image = plasterCanvas(muted);
    this.plasterTex.needsUpdate = true;
    this.wallMat.color.set(dark ? "#d8d0c6" : "#ffffff");

    this.ceilMat.color.set(toColor(dark ? darken(muted, 0.25) : lighten(muted, 0.35)));
    this.trimMat.color.set(dark ? "#241a13" : "#3a2a1d");
    this.crownMat.color.set(toColor(dark ? lighten(muted, 0.08) : lighten(muted, 0.5)));
    this.doorMat.color.set(toColor(darken(bg, dark ? 0.75 : 0.85)));

    // The far end dissolves into haze: a shade below the walls in the light
    // theme (paper-white fog read as a blown-out window), below the page
    // background in the dark one.
    const fogColor = toColor(dark ? darken(bg, 0.15) : darken(muted, 0.14));
    this.scene.fog = new THREE.Fog(fogColor, dark ? 7 : 9, dark ? 34 : 40);
    this.scene.background = fogColor;
    this.renderer.toneMappingExposure = dark ? 1.0 : 1.05;
    this.scene.environmentIntensity = dark ? 0.32 : 0.62;

    this.hemi.intensity = dark ? 0.35 : 0.75;
    this.hemi.color.set(dark ? 0xf6e6d2 : 0xfff5e6);
    this.lantern.intensity = dark ? 14 : 10;

    this.coneMat.opacity = dark ? 0.85 : 0.55;
    this.poolMat.opacity = dark ? 0.7 : 0.45;

    // Per-frame light colours: the arc, lifted toward warm white so it
    // reads as light on plaster rather than paint.
    const n = this.frames.length;
    const c = new THREE.Color();
    this.frames.forEach((f, i) => {
      f.tint = tintAt(p, n > 1 ? i / (n - 1) : 0);
      const light = lighten(f.tint, dark ? 0.45 : 0.55);
      c.set(toColor(light));
      this.cones.setColorAt(i, c);
      this.pools.setColorAt(i, c);
      c.set(toColor(lighten(f.tint, 0.75)));
      this.discs.setColorAt(i, c);
    });
    for (const mesh of [this.cones, this.pools, this.discs]) {
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    this.needsRender = true;
  }

  /** Redraw plaques and placeholders (after the webfont arrives). */
  private redrawText(): void {
    for (const f of this.frames) {
      if (f.coverState !== "done") {
        f.art = new Art({ title: f.entry.title, author: f.entry.author, tint: f.tint, family: this.family });
        f.artTex.image = f.art.canvas;
        f.artTex.needsUpdate = true;
      }
      const plaque = f.group.children[1] as THREE.Mesh;
      const mat = plaque.material as THREE.MeshStandardMaterial;
      if (mat.map) {
        mat.map.image = plaqueCanvas(
          { title: f.entry.title, author: f.entry.author, series: f.entry.series },
          this.family
        );
        mat.map.needsUpdate = true;
      }
    }
    this.needsRender = true;
  }

  /* ---- loop ------------------------------------------------------------ */

  private startLoop(): void {
    if (this.raf || this.disposed) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  private stopLoop(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private tick = (now: number): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.tick);
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;

    const input = this.controls.consume();
    const moved = this.step(input, dt);
    this.updateAim();
    this.pumpCovers();

    if (moved || this.needsRender) {
      const t0 = performance.now();
      this.renderer.render(this.scene, this.camera);
      this.needsRender = false;
      if (moved) this.watchPerformance(performance.now() - t0);
      if (!this.els.root.classList.contains("is-ready")) {
        this.els.root.classList.add("is-ready");
      }
    }
  };

  /** Advance the player. Returns true if the view changed. */
  private step(input: ReturnType<Controls["consume"]>, dt: number): boolean {
    const sens = input.lookPointer === "mouse" ? LOOK_MOUSE : LOOK_TOUCH;
    this.yaw -= input.lookDx * sens;
    this.pitch -= input.lookDy * sens;
    this.yaw -= input.turn * TURN_RATE * dt;
    this.pitch = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, this.pitch));

    const speed = input.run ? RUNSPEED : WALK;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    let tx = fx * input.forward + rx * input.strafe;
    let tz = fz * input.forward + rz * input.strafe;
    const tl = Math.hypot(tx, tz);
    if (tl > 1) {
      tx /= tl;
      tz /= tl;
    }
    tx *= speed;
    tz *= speed;
    const k = Math.min(1, dt * 9);
    this.vel.x += (tx - this.vel.x) * k;
    this.vel.z += (tz - this.vel.z) * k;
    if (Math.abs(this.vel.x) < 0.005) this.vel.x = 0;
    if (Math.abs(this.vel.z) < 0.005) this.vel.z = 0;

    const moving = this.vel.x !== 0 || this.vel.z !== 0;
    if (moving) {
      this.pos.x += this.vel.x * dt;
      this.pos.z += this.vel.z * dt;
      const xLimit = HALL_W / 2 - 0.42;
      this.pos.x = Math.max(-xLimit, Math.min(xLimit, this.pos.x));
      this.pos.z = Math.max(this.zMin + 0.9, Math.min(this.zMax - 0.9, this.pos.z));
      const s = Math.hypot(this.vel.x, this.vel.z);
      this.bobPhase += s * dt * 2.2;
    }
    const bob = this.reducedMotion
      ? 0
      : Math.sin(this.bobPhase * Math.PI) * 0.018 * Math.min(1, Math.hypot(this.vel.x, this.vel.z) / WALK);

    this.camera.position.set(this.pos.x, EYE + bob, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0);
    this.lantern.position.set(this.pos.x, EYE + 0.35, this.pos.z + 0.0);
    this.placeSpots();

    return moving || input.active;
  }

  /** Move the spotlight pool to the frames nearest the player. */
  private placeSpots(): void {
    if (!this.spots.length || !this.frames.length) return;
    const z = this.pos.z;
    // Frames are in z order, so the nearest few are a window around index.
    const i0 = Math.round(-z / SPACING);
    const picked: FrameRec[] = [];
    for (let d = 0; picked.length < this.spots.length && d < this.frames.length; d++) {
      for (const j of d === 0 ? [i0] : [i0 - d, i0 + d]) {
        if (j >= 0 && j < this.frames.length && picked.length < this.spots.length) {
          picked.push(this.frames[j]);
        }
      }
    }
    this.spots.forEach((spot, k) => {
      const f = picked[k];
      if (!f) {
        spot.intensity = 0;
        return;
      }
      spot.intensity = this.palette.dark ? 34 : 22;
      spot.color.set(toColor(lighten(f.tint, 0.55)));
      spot.position.set(f.side * (HALL_W / 2 - FIXTURE_IN), HALL_H - 0.15, f.z);
      spot.target.position.set(f.side * HALL_W / 2, FRAME_Y - 0.1, f.z);
      spot.target.updateMatrixWorld();
    });
  }

  /* ---- aim / interaction ----------------------------------------------- */

  private castAt(x: number, y: number): FrameRec | null {
    const r = this.els.root.getBoundingClientRect();
    const ndc = new THREE.Vector2((x / r.width) * 2 - 1, -(y / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObjects(this.hits, false)[0];
    if (!hit) return null;
    const idx = hit.object.userData.index as number;
    return this.frames[idx] ?? null;
  }

  /** The frame the player is most squarely facing, within reach. */
  private nearestFacing(): FrameRec | null {
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    let best: FrameRec | null = null;
    let bestScore = Infinity;
    const i0 = Math.round(-this.pos.z / SPACING);
    for (let j = i0 - 3; j <= i0 + 3; j++) {
      const f = this.frames[j];
      if (!f) continue;
      const dx = f.centre.x - this.pos.x, dz = f.centre.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 3.4) continue;
      const angle = Math.acos(Math.max(-1, Math.min(1, (dx * fx + dz * fz) / dist)));
      if (angle > 0.95) continue;
      const score = angle + dist * 0.12;
      if (score < bestScore) {
        bestScore = score;
        best = f;
      }
    }
    return best;
  }

  private updateAim(): void {
    const hovered = this.hoverPoint ? this.castAt(this.hoverPoint.x, this.hoverPoint.y) : null;
    const hoverIndex = hovered ? hovered.index : -1;
    if (hoverIndex !== this.hoverIndex) {
      this.hoverIndex = hoverIndex;
      this.els.canvas.style.cursor = hovered ? "pointer" : "";
    }
    const aimed = hovered ?? this.nearestFacing();
    const aimedIndex = aimed ? aimed.index : -1;
    if (aimedIndex !== this.aimedIndex) {
      this.aimedIndex = aimedIndex;
      this.showLabel(aimed);
    }
    const highlight = hovered ? hovered.index : -1;
    if (highlight !== this.highlightIndex) {
      const c = new THREE.Color();
      if (this.highlightIndex >= 0) {
        this.outerRing.setColorAt(this.highlightIndex, c.set(1, 1, 1));
      }
      if (highlight >= 0) {
        this.outerRing.setColorAt(highlight, c.set(1.35, 1.28, 1.1));
      }
      if (this.outerRing.instanceColor) this.outerRing.instanceColor.needsUpdate = true;
      this.highlightIndex = highlight;
      this.needsRender = true;
    }
  }

  private showLabel(f: FrameRec | null): void {
    const { label, labelTitle, labelMeta } = this.els;
    if (!f) {
      label.hidden = true;
      label.removeAttribute("href");
      return;
    }
    labelTitle.textContent = f.entry.title;
    labelMeta.textContent = [f.entry.author, f.entry.series ? "Series" : ""]
      .filter(Boolean)
      .join(" · ");
    label.href = f.entry.url;
    label.hidden = false;
  }

  private tap(x: number, y: number): void {
    const f = this.castAt(x, y);
    if (f) openEntry(f.entry);
  }

  private openAimed(): void {
    const f = this.frames[this.aimedIndex];
    if (f) openEntry(f.entry);
  }

  /* ---- covers ---------------------------------------------------------- */

  private pumpCovers(): void {
    while (this.loadsInFlight < this.maxLoads) {
      let best: FrameRec | null = null;
      let bestDist = COVER_REACH;
      for (const f of this.frames) {
        if (f.coverState !== "idle") continue;
        const d = Math.abs(f.z - this.pos.z);
        if (d < bestDist) {
          bestDist = d;
          best = f;
        }
      }
      if (!best) return;
      best.coverState = "loading";
      this.loadsInFlight++;
      void this.loadCover(best).finally(() => {
        this.loadsInFlight--;
      });
    }
  }

  private async loadCover(f: FrameRec): Promise<void> {
    const url = await resolveCoverUrl(f.entry);
    if (this.disposed) return;
    if (!url) {
      f.coverState = "failed";
      return;
    }
    try {
      const img = await loadImage(url);
      if (this.disposed) return;
      f.art.drawImage(img);
      f.artTex.image = f.art.canvas;
      f.artTex.needsUpdate = true;
      f.coverState = "done";
      this.needsRender = true;
    } catch {
      f.coverState = "failed";
    }
  }

  /* ---- housekeeping ---------------------------------------------------- */

  private resize(): void {
    const r = this.els.root.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Hold the horizontal field of view around 78°, so a portrait phone
    // sees the walls instead of a slot down the middle.
    const hfov = THREE.MathUtils.degToRad(78);
    const vfov = 2 * Math.atan(Math.tan(hfov / 2) / this.camera.aspect);
    this.camera.fov = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(vfov), 50, 92);
    this.camera.updateProjectionMatrix();
    this.needsRender = true;
  }

  /** Drop the pixel ratio when a phone can't keep up. */
  private watchPerformance(ms: number): void {
    if (ms > 26) this.slowFrames++;
    else this.slowFrames = Math.max(0, this.slowFrames - 1);
    if (this.slowFrames > 30 && this.dpr > 1) {
      this.dpr = Math.max(1, this.dpr - 0.25);
      this.renderer.setPixelRatio(this.dpr);
      this.resize();
      this.slowFrames = 0;
    }
  }

  private setupFullscreen(): void {
    const btn = this.els.fullscreen;
    if (!btn) return;
    if (!document.fullscreenEnabled) {
      btn.hidden = true;
      return;
    }
    btn.addEventListener(
      "click",
      () => {
        if (document.fullscreenElement) void document.exitFullscreen();
        else void this.els.root.requestFullscreen();
      },
      { signal: this.abort.signal }
    );
    document.addEventListener(
      "fullscreenchange",
      () => {
        const on = document.fullscreenElement === this.els.root;
        this.els.root.classList.toggle("is-fullscreen", on);
        btn.setAttribute("aria-pressed", String(on));
      },
      { signal: this.abort.signal }
    );
  }

  dispose(): void {
    this.disposed = true;
    this.stopLoop();
    this.abort.abort();
    this.controls.dispose();
    this.resizeObs.disconnect();
    this.themeObs.disconnect();
    this.scene.traverse(obj => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) {
        if (!mat) continue;
        for (const v of Object.values(mat)) {
          if (v instanceof THREE.Texture) v.dispose();
        }
        mat.dispose();
      }
    });
    this.scene.environment?.dispose();
    this.renderer.dispose();
  }
}

/* ---- helpers ----------------------------------------------------------- */

/** A rectangular ring extruded with a rounded bevel: a picture moulding. */
function ringGeometry(
  ow: number, oh: number, iw: number, ih: number,
  depth: number, bevelThickness: number, bevelSize: number
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-ow / 2, -oh / 2);
  shape.lineTo(ow / 2, -oh / 2);
  shape.lineTo(ow / 2, oh / 2);
  shape.lineTo(-ow / 2, oh / 2);
  shape.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-iw / 2, -ih / 2);
  hole.lineTo(-iw / 2, ih / 2);
  hole.lineTo(iw / 2, ih / 2);
  hole.lineTo(iw / 2, -ih / 2);
  hole.closePath();
  shape.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness,
    bevelSize,
    bevelSegments: 4,
    curveSegments: 2,
  });
  // Extrude starts its back bevel at -bevelThickness; shift so the back
  // face sits on z = 0, the wall.
  geo.translate(0, 0, bevelThickness);
  geo.computeVertexNormals();
  return geo;
}

function toColor(c: RGB): THREE.Color {
  return new THREE.Color(c[0], c[1], c[2]);
}

function readFontFamily(): string {
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue("--font-newsreader")
    .trim();
  return v || "Newsreader, Georgia, serif";
}

async function loadFonts(family: string): Promise<void> {
  if (!("fonts" in document)) return;
  const wanted = [`600 40px ${family}`, `italic 400 30px ${family}`];
  const timeout = new Promise<void>(resolve => setTimeout(resolve, 2500));
  try {
    await Promise.race([
      Promise.all(wanted.map(f => document.fonts.load(f))).then(() => undefined),
      timeout,
    ]);
  } catch {
    // Fall through to whatever face the browser has.
  }
}

function openEntry(entry: CorridorEntry): void {
  window.open(entry.url, "_blank", "noopener,noreferrer");
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`cover failed: ${url}`));
    img.src = url;
  });
}

/**
 * The cover URL for an entry: baked in curiosity.ts, or from the shared
 * browser cache, or looked up on Open Library. Large size either way — the
 * frame is viewed from arm's length.
 */
async function resolveCoverUrl(entry: CorridorEntry): Promise<string> {
  if (entry.cover) return large(entry.cover);
  const key = coverCacheKey(entry.title, entry.author ?? "");
  const cached = readCoverCache(key);
  if (cached) return cached.url ? large(cached.url) : "";
  const result = await findCover({
    title: entry.title,
    author: entry.author ?? "",
    lookup: entry.lookup,
  });
  if (!result.ok) return "";
  writeCoverCache(key, result.url);
  return result.url ? large(result.url) : "";
}

function large(url: string): string {
  return url.replace(/-M\.jpg/, "-L.jpg");
}

/* ---- mounting ---------------------------------------------------------- */

let active: Corridor | null = null;

function query<T extends Element>(root: ParentNode, sel: string): T {
  const el = root.querySelector<T>(sel);
  if (!el) throw new Error(`corridor: missing ${sel}`);
  return el;
}

/**
 * Mount the corridor on a root element (see CuriosityCorridor.astro for the
 * markup). If WebGL is unavailable the root is replaced by the fallback
 * template — the 2D timeline — and its cover lookup is kicked off.
 */
export function mountCorridor(root: HTMLElement): void {
  active?.dispose();
  active = null;

  const data = root.querySelector<HTMLScriptElement>("script[data-corridor-entries]");
  let entries: CorridorEntry[] = [];
  try {
    entries = JSON.parse(data?.textContent ?? "[]");
  } catch {
    entries = [];
  }

  const fallback = (): void => {
    const tpl = document.querySelector<HTMLTemplateElement>("template[data-corridor-fallback]");
    const help = document.querySelector("[data-corridor-help]");
    help?.remove();
    if (tpl) {
      root.replaceWith(tpl.content.cloneNode(true));
      void import("@/scripts/timelineCovers").then(m => m.resolveTimelineCovers());
    } else {
      root.classList.remove("sr-only");
    }
  };

  try {
    const probe = document.createElement("canvas");
    const gl = probe.getContext("webgl2") ?? probe.getContext("webgl");
    if (!gl) throw new Error("no WebGL");
    active = new Corridor(
      {
        root,
        canvas: query(root, "canvas"),
        stick: query(root, "[data-stick]"),
        knob: query(root, "[data-knob]"),
        label: query(root, "[data-label]"),
        labelTitle: query(root, "[data-label-title]"),
        labelMeta: query(root, "[data-label-meta]"),
        fullscreen: root.querySelector("[data-fullscreen]"),
      },
      entries
    );
    (root as HTMLElement & { corridor?: Corridor }).corridor = active;
  } catch (err) {
    console.warn("Curiosity corridor unavailable, showing the list:", err);
    fallback();
  }
}

export function unmountCorridor(): void {
  active?.dispose();
  active = null;
}
