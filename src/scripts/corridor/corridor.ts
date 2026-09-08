/*
  The curiosity corridor: a first-person gallery of the reading list. Books
  hang in gilt frames, alternating left and right down a long hall — the same
  zigzag the 2D timeline draws, stood up and walked through. Each frame sits
  in a pool of light whose colour samples the timeline's five-stop arc, so
  the hall warms from gold at the start to slate at the far end.

  Everything here is built at run time from src/data/curiosity.ts and the
  theme tokens in theme.css; the only network requests are the covers.

  Performance notes, since phones are the target:
  - Every moulding part is an InstancedMesh shared by all frames of its
    style (see frames.ts); per-frame draw calls are the art plane, the
    plaque and two invisible hit planes. The plants, benches and runner are
    instanced across the whole hall (see props.ts).
  - Real lights are a lantern on the camera plus a small pool of spotlights
    that hop to the nearest frames. They are deliberately dim: the pictures
    are the brightest thing in the hall and blowing them out is the failure
    mode. The glow you see on far walls and the floor is unlit additive
    decals, which cost nothing.
  - Nothing renders while nothing moves. The moving walkway (SHOW_WALKWAY,
    off) is the one thing that animates at rest, so with it off the scene
    renders only on input.
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
import { Controls, LOCK_SUPPORTED } from "./input";
import { Ends } from "./ends";
import { Props } from "./props";
import { type WindowSpot, Windows } from "./windows";
import { type BearerSpot, Bearers } from "./bearers";
import { Walkway } from "./walkway";
import {
  type FrameStyle,
  buildFrameMaterials,
  buildFrameStyles,
  metalTint,
  styleIndexFor,
} from "./frames";
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
  ceilingCanvas,
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
const MOULDING = 0.47; // half-width of the widest moulding, from the centre
// The label hangs beside the picture, museum-fashion, rather than under it:
// off to the reader's right, and at a height you read standing up.
const PLAQUE_W = 0.5;
const PLAQUE_H = 0.3;
const PLAQUE_Y = 1.45;
const PLAQUE_X = MOULDING + 0.14 + PLAQUE_W / 2;
const BELT_SPEED = 1.0; // m/s; an airport walkway runs about 0.7
const FIXTURE_IN = 0.55; // ceiling spot's distance from the wall
const BAY = SPACING; // one ceiling coffer per frame
// How close to a wall you can stand. This is the whole sideways budget:
// walking is WALK m/s across a hall only (HALL_W - 2 * WALL_GAP) wide, so
// every centimetre here is time on the strafe keys before you run out of
// room. Small enough to nearly touch the plaster, large enough that a
// frame's moulding never reaches the camera's near plane.
const WALL_GAP = 0.25;

/*
  How the books are shown, and the one switch that changes it.

  "wall" hangs them on the walls the way a gallery does. "float" suspends
  them in mid air down both sides of a central aisle, painted on both faces
  and canted toward whoever is walking at them, so a book is legible from
  the moment it comes into view rather than only once you stop and turn
  square to the wall. Walking a hall is a bad way to look at things hung
  flat along it — you see every picture edge-on until you are level with
  it, and then you have walked past.

  Everything downstream reads FLOATING: where the frame hangs, whether it
  is moulded on one face or both, where its light and its label go, and how
  wide the walkable aisle is.
*/
// `as`, not a `: "wall" | "float"` annotation — the latter still lets TS
// narrow DISPLAY to whichever literal it's set to, which turns the
// comparison below into a false "no overlap" type error the moment this
// isn't "float".
const DISPLAY = "wall" as "wall" | "float";
const FLOATING = DISPLAY === "float";

// Inboard of the wall, above eye level so the row does not wall off the
// view down the hall, and turned ~30 degrees off the corridor's axis: far
// enough to read while you approach, not so far it goes edge-on as you
// draw level. The aisle is what is left to walk in.
const FLOAT_X = 1.0;
const FLOAT_ART_Y = 1.8;
const FLOAT_PLAQUE_Y = 0.8;
const FLOAT_YAW = 0.52;
const AISLE_HALF = 0.58;

/*
  Somebody has to hold all this up. With bearers on, a tall thin blue
  creature stands behind each floating frame holding it out in front of
  itself, and the label dangles from the frame's bottom rail on two cords.
  Floating only — hung on a wall there is nothing for one to hold. Off for
  now; bearers.ts and everything that reads this flag stay in place so
  turning it back on is a one-word change.
*/
const BEARERS = false;

// A floating picture's lamp hangs forward of it, out over the aisle, rather
// than straight above. Directly overhead it grazes the picture's face at a
// useless angle and lands squarely on the bearer's head, which is a foot
// below it and comes back white. These are sin/cos of FLOAT_YAW times the
// distance the lamp is carried forward.
const LAMP_DX = 0.2;
const LAMP_DZ = 0.35;

/*
  The moving walkway is built and stepped only when this is on. It is off
  for now; walkway.ts and everything that reads this flag stay in place so
  turning it back on is a one-word change.
*/
const SHOW_WALKWAY = false;

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
  plaqueTex: THREE.CanvasTexture;
  centre: THREE.Vector3;
  coverState: "idle" | "loading" | "done" | "failed";
  arched: boolean;
  /** Instances that make up this frame's moulding, for highlighting. */
  slots: { mesh: THREE.InstancedMesh; index: number }[];
  tintColor: THREE.Color;
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
  private coneMat!: THREE.MeshBasicMaterial;
  private poolMat!: THREE.MeshBasicMaterial;
  private discMat!: THREE.MeshBasicMaterial;
  private hemi!: THREE.HemisphereLight;
  private ceilTex!: THREE.CanvasTexture;
  private ends!: Ends;
  private walkway: Walkway | null = null;
  private props!: Props;
  private windows: Windows | null = null;
  private bearers: Bearers | null = null;
  private glowTex!: THREE.CanvasTexture;
  private lastRenderAt = 0;
  private lantern!: THREE.PointLight;
  private spots: THREE.SpotLight[] = [];
  private cones!: THREE.InstancedMesh;
  private pools!: THREE.InstancedMesh;
  private discs!: THREE.InstancedMesh;
  private plasterTex!: THREE.CanvasTexture;

  // Interaction
  private hoverIndex = -1;
  private aimedIndex = -1;
  private hoverPoint: { x: number; y: number } | null = null;
  private highlightIndex = -1;
  /** Pointer Lock engaged — mouse aim comes from the crosshair, not a cursor. */
  private locked = false;

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
    this.buildEnds();
    this.buildWalkway();
    this.buildFrames();
    this.buildProps();
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
    if (!LOCK_SUPPORTED) els.root.dataset.noLock = "1";

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
    // The ceiling is painted: one coffer per bay, the same scheme repeated
    // the length of the hall, with the arc living in the ornament inside
    // each coffer rather than washing the whole surface (see textures.ts).
    this.ceilTex = new THREE.CanvasTexture(this.ceilingImage());
    this.ceilTex.wrapS = this.ceilTex.wrapT = THREE.RepeatWrapping;
    this.ceilTex.colorSpace = THREE.SRGBColorSpace;
    this.ceilTex.anisotropy = this.plasterTex.anisotropy;
    this.ceilTex.repeat.set(2, L / BAY);
    // Land a coffer's centre on each frame rather than its rib.
    this.ceilTex.offset.y = 0.5 - ((((-this.zMin) / BAY) % 1) + 1) % 1;
    this.ceilMat = new THREE.MeshStandardMaterial({
      map: this.ceilTex,
      roughness: 1,
      metalness: 0,
    });
    this.trimMat = new THREE.MeshStandardMaterial({ roughness: 0.6 });
    this.crownMat = new THREE.MeshStandardMaterial({ roughness: 0.9 });

    const wallGeo = new THREE.PlaneGeometry(L, HALL_H);
    const left = new THREE.Mesh(wallGeo, this.wallMat);
    left.position.set(-HALL_W / 2, HALL_H / 2, zc);
    left.rotation.y = Math.PI / 2;
    const right = new THREE.Mesh(wallGeo, this.wallMat);
    right.position.set(HALL_W / 2, HALL_H / 2, zc);
    right.rotation.y = -Math.PI / 2;
    // Repeat along the wall. One tile is 2 m, both axes.
    this.plasterTex.repeat.set(L / 2, HALL_H / 2);

    const floorGeo = new THREE.PlaneGeometry(HALL_W, L);
    const floor = new THREE.Mesh(floorGeo, this.floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, zc);

    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(HALL_W, L), this.ceilMat);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(0, HALL_H, zc);

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
      left, right, floor, ceil,
      baseL, baseR, crownL, crownR, railL, railR
    );
  }

  private buildEnds(): void {
    this.ends = new Ends({
      hallWidth: HALL_W,
      hallHeight: HALL_H,
      zNear: this.zMax,
      zFar: this.zMin,
    });
    this.scene.add(this.ends.group);
  }

  private buildWalkway(): void {
    if (!SHOW_WALKWAY) return;
    const n = this.entries.length;
    // From just before the first frame to just past the last, so riding it
    // end to end passes every book and leaves you facing the far doorway.
    this.walkway = new Walkway({
      zStart: 1.4,
      zEnd: -(n - 1) * SPACING - 1.8,
      speed: BELT_SPEED,
    });
    this.scene.add(this.walkway.group);
  }

  /**
   * Everything that stands against a wall: windows, plants, benches, and the
   * runner down the middle.
   *
   * A wall's free positions are the ones where the book at that z hangs on
   * the *other* wall, which on alternating sides means one every two bays.
   * Walking those in order and giving three out of every four to a window
   * lays down an arcade with a plant or a bench in the fourth, and nothing
   * ever lands on top of anything else.
   */
  private buildProps(): void {
    const plants: { side: -1 | 1; z: number; variant: number }[] = [];
    const benches: { side: -1 | 1; z: number; variant: number }[] = [];
    const windows: WindowSpot[] = [];
    const span = Math.max(1e-6, (this.frames.length - 1) * SPACING);

    for (const wall of [-1, 1] as const) {
      let k = 0;
      for (const f of this.frames) {
        if (f.side === wall) continue;
        if (k % 4 === 3) {
          const spot = { side: wall, z: f.z, variant: f.index };
          if (Math.floor(k / 4) % 2 === 0) plants.push(spot);
          else benches.push(spot);
        } else if (FLOATING) {
          // Only the floating hall has bare walls to break up; hung, the
          // books are already on them.
          windows.push({
            side: wall,
            z: f.z,
            t: Math.min(1, Math.max(0, -f.z / span)),
          });
        }
        k++;
      }
    }
    // A plant at each end of the hall too, flanking the doorways.
    for (const z of [this.zMax - 1.5, this.zMin + 1.5]) {
      plants.push({ side: -1, z, variant: 0 }, { side: 1, z, variant: 1 });
    }

    this.props = new Props({
      hallWidth: HALL_W,
      plants,
      benches,
      runner: {
        zStart: this.zMax - 0.7,
        zEnd: this.zMin + 0.7,
        width: 1.6,
      },
    });
    this.scene.add(this.props.group);

    if (windows.length) {
      this.windows = new Windows(windows, HALL_W, this.glowTex);
      this.scene.add(this.windows.group);
    }
  }

  private buildFrames(): void {
    const n = this.entries.length;
    const patina = new THREE.CanvasTexture(patinaCanvas());
    patina.wrapS = patina.wrapT = THREE.RepeatWrapping;
    patina.repeat.set(3, 3);

    const mats = buildFrameMaterials(patina);
    const styles = buildFrameStyles(mats, FRAME_W + 0.02, FRAME_H + 0.02);
    const styleOf = this.entries.map((_, i) => styleIndexFor(i, styles.length));

    // One InstancedMesh per part per style, sized to the frames that use it
    // — twice over when a frame is moulded front and back.
    const FACES = FLOATING ? 2 : 1;
    const partMeshes = styles.map((style, si) => {
      const users = styleOf.filter(x => x === si).length;
      return style.parts.map(part => {
        const slots = users * part.placements.length * FACES;
        const mesh = new THREE.InstancedMesh(part.geometry, part.material, Math.max(1, slots));
        mesh.count = slots;
        return mesh;
      });
    });
    const nextSlot = styles.map(style => style.parts.map(() => 0));

    const coneTex = new THREE.CanvasTexture(coneCanvas());
    coneTex.colorSpace = THREE.SRGBColorSpace;
    const glowTex = new THREE.CanvasTexture(glowCanvas());
    glowTex.colorSpace = THREE.SRGBColorSpace;
    this.glowTex = glowTex;
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

    // Two targets per frame: the picture, and the label. Floating, they are
    // solids rather than planes so a click lands from either side.
    const hitW = FRAME_W + 2 * BORDER + 0.16;
    const hitH = FRAME_H + 2 * BORDER + 0.16;
    const hitGeo = FLOATING
      ? new THREE.BoxGeometry(hitW, hitH, 0.22)
      : new THREE.PlaneGeometry(hitW, hitH);
    const plaqueHitGeo = FLOATING
      ? new THREE.BoxGeometry(PLAQUE_W + 0.08, PLAQUE_H + 0.08, 0.14)
      : new THREE.PlaneGeometry(PLAQUE_W + 0.08, PLAQUE_H + 0.08);
    const plaqueGeo = new THREE.BoxGeometry(PLAQUE_W, PLAQUE_H, FLOATING ? 0.03 : 0.014);
    // A box's +z and -z faces each carry the map the right way round, so one
    // texture reads correctly from in front and from behind.
    const artGeo = FLOATING
      ? new THREE.BoxGeometry(FRAME_W + 0.02, FRAME_H + 0.02, 0.04)
      : new THREE.PlaneGeometry(FRAME_W + 0.02, FRAME_H + 0.02);

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3(1, 1, 1);
    const p = new THREE.Vector3();
    const bearerSpots: BearerSpot[] = [];

    this.entries.forEach((entry, i) => {
      const side: -1 | 1 = i % 2 === 0 ? -1 : 1;
      const z = -i * SPACING;
      const tint = tintAt(this.palette, n > 1 ? i / (n - 1) : 0);
      // Hung flat on the wall, or turned out of it into the aisle.
      const yaw = FLOATING
        ? -side * FLOAT_YAW
        : side === -1 ? Math.PI / 2 : -Math.PI / 2;
      const home = FLOATING
        ? new THREE.Vector3(side * FLOAT_X, FLOAT_ART_Y, z)
        : new THREE.Vector3(side * HALL_W / 2, FRAME_Y, z);
      const si = styleOf[i];
      const style: FrameStyle = styles[si];

      const group = new THREE.Group();
      group.position.copy(home);
      group.rotation.y = yaw;
      group.updateMatrixWorld(true);
      bearerSpots.push({ position: home.clone(), yaw, index: i });

      // Moulding parts share the group's transform, offset per placement.
      // A floating frame gets the same parts again, spun half a turn, so it
      // is moulded on the face you meet walking back as well.
      q.setFromEuler(new THREE.Euler(0, yaw, 0));
      p.copy(home);
      const back = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI, 0));
      const faces = FLOATING ? [q.clone(), q.clone().multiply(back)] : [q.clone()];
      const tintColor = metalTint(i);
      const slots: FrameRec["slots"] = [];
      style.parts.forEach((part, pi) => {
        const mesh = partMeshes[si][pi];
        for (const fq of faces) {
          for (const place of part.placements) {
            const idx = nextSlot[si][pi]++;
            const off = place.clone().applyQuaternion(fq);
            m.compose(p.clone().add(off), fq, s);
            mesh.setMatrixAt(idx, m);
            mesh.setColorAt(idx, tintColor);
            slots.push({ mesh, index: idx });
          }
        }
      });

      // Wall cone, slightly above the frame centre, flush to the wall. A
      // floating book has no wall behind it to throw one on (see the count
      // set below), so it gets only the pool beneath it.
      const coneOff = new THREE.Vector3(0, 0.45, -0.002).applyQuaternion(q);
      m.compose(p.clone().add(coneOff), q, s);
      this.cones.setMatrixAt(i, m);
      // Floor pool, under the book either way.
      const poolQ = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(-Math.PI / 2, 0, 0)
      );
      const poolX = side * (FLOATING ? FLOAT_X : HALL_W / 2 - 0.8);
      m.compose(new THREE.Vector3(poolX, 0.006, z), poolQ, s);
      this.pools.setMatrixAt(i, m);
      // Ceiling fixture + its glowing face
      const fx = side * (FLOATING ? FLOAT_X - LAMP_DX : HALL_W / 2 - FIXTURE_IN);
      const fz = z + (FLOATING ? LAMP_DZ : 0);
      m.compose(new THREE.Vector3(fx, HALL_H - 0.065, fz), new THREE.Quaternion(), s);
      fixtures.setMatrixAt(i, m);
      const discQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
      m.compose(new THREE.Vector3(fx, HALL_H - 0.132, fz), discQ, s);
      this.discs.setMatrixAt(i, m);

      // The art
      const art = new Art({ title: entry.title, author: entry.author, tint, family: this.family, arched: style.arched });
      const artTex = new THREE.CanvasTexture(art.canvas);
      artTex.colorSpace = THREE.SRGBColorSpace;
      artTex.anisotropy = this.plasterTex.anisotropy;
      // On a wall a picture reflects the light on it and no more: the
      // emissive map is a floor, not a glow — enough that a cover is legible
      // in an unlit stretch of hall, small enough that the lit ones don't
      // blow out. Floating, the only real light on it comes from straight
      // above and rakes both faces, so it carries its own instead, which is
      // what a lightbox in a dim gallery does anyway.
      const artMat = new THREE.MeshStandardMaterial({
        map: artTex,
        emissiveMap: artTex,
        emissive: new THREE.Color(1, 1, 1),
        emissiveIntensity: FLOATING ? 0.38 : 0.07,
        envMapIntensity: 0.3,
        roughness: 0.62,
        metalness: 0,
      });
      // Box faces are ordered +x -x +y -y +z -z; the picture goes on the two
      // broad faces and the walnut on the edge.
      const artMesh = FLOATING
        ? new THREE.Mesh(artGeo, [mats.walnut, mats.walnut, mats.walnut, mats.walnut, artMat, artMat])
        : new THREE.Mesh(artGeo, artMat);
      artMesh.position.z = FLOATING ? 0 : 0.03;
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
        // Brass hung in mid air catches nothing to reflect, so a floating
        // label carries a little of its own light, as the picture does.
        ...(FLOATING
          ? {
              emissiveMap: plaqueTex,
              emissive: new THREE.Color(1, 1, 1),
              emissiveIntensity: 0.22,
            }
          : {}),
      });
      // On the wall the label hangs beside the picture, on the hand a museum
      // hangs it. Floating, it hangs under it, where it is in the same line
      // of sight and does not widen the row into the aisle. Either way the
      // plate is a box, so it is already double-sided.
      const plaqueOff = FLOATING
        ? new THREE.Vector3(0, FLOAT_PLAQUE_Y - FLOAT_ART_Y, 0)
        : new THREE.Vector3(PLAQUE_X, PLAQUE_Y - FRAME_Y, 0.007);
      const plaque = new THREE.Mesh(plaqueGeo, plaqueMat);
      plaque.position.copy(plaqueOff);
      group.add(plaque);

      // Invisible hit volumes over the picture and over the label.
      const hit = new THREE.Mesh(hitGeo);
      hit.visible = false;
      hit.position.set(0, 0, FLOATING ? 0 : 0.06);
      hit.userData.index = i;
      const plaqueHit = new THREE.Mesh(plaqueHitGeo);
      plaqueHit.visible = false;
      plaqueHit.position.set(plaqueOff.x, plaqueOff.y, FLOATING ? 0 : 0.02);
      plaqueHit.userData.index = i;
      group.add(hit, plaqueHit);
      this.hits.push(hit, plaqueHit);

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
        plaqueTex,
        centre: home.clone(),
        coverState: "idle",
        arched: style.arched,
        slots,
        tintColor,
      });
    });

    for (const meshes of partMeshes) {
      for (const mesh of meshes) {
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        this.scene.add(mesh);
      }
    }
    // Nothing to throw a cone onto once the books leave the walls.
    if (FLOATING) this.cones.count = 0;
    this.cones.instanceMatrix.needsUpdate = true;
    this.pools.instanceMatrix.needsUpdate = true;
    fixtures.instanceMatrix.needsUpdate = true;
    this.discs.instanceMatrix.needsUpdate = true;

    this.scene.add(this.cones, this.pools, fixtures, this.discs);

    if (FLOATING) this.buildCords();
    if (FLOATING && BEARERS) {
      this.bearers = new Bearers(bearerSpots, FLOAT_ART_Y);
      this.scene.add(this.bearers.group);
    }
  }

  /**
   * Two cords from the frame's bottom rail to the top corners of the label,
   * so the plate reads as hanging off the picture rather than as floating
   * under it on nothing.
   */
  private buildCords(): void {
    const top = -(FRAME_H / 2 + BORDER);
    const bottom = FLOAT_PLAQUE_Y - FLOAT_ART_Y + PLAQUE_H / 2;
    const geo = new THREE.CylinderGeometry(0.007, 0.007, top - bottom, 6);
    const cords = new THREE.InstancedMesh(geo, this.trimMat, this.frames.length * 2);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    const local = new THREE.Vector3();
    let slot = 0;
    for (const f of this.frames) {
      q.setFromEuler(new THREE.Euler(0, f.group.rotation.y, 0));
      for (const sx of [-1, 1]) {
        local.set(sx * (PLAQUE_W / 2 - 0.06), (top + bottom) / 2, 0);
        local.applyQuaternion(q).add(f.group.position);
        m.compose(local, q, one);
        cords.setMatrixAt(slot++, m);
      }
    }
    cords.instanceMatrix.needsUpdate = true;
    this.scene.add(cords);
  }

  private buildLights(): void {
    this.hemi = new THREE.HemisphereLight(0xfff1dc, 0x2a1d14, 0.5);
    this.scene.add(this.hemi);

    // A lantern on the camera, so you are never in the dark — but a weak
    // one with a short reach. It faces the pictures head-on, which is the
    // worst angle for them: turned up it flattens every cover it passes.
    this.lantern = new THREE.PointLight(0xffe2b8, 4, 7, 2);
    this.scene.add(this.lantern);

    const count = this.coarse ? NEAR_SPOTS_MOBILE : NEAR_SPOTS_DESKTOP;
    for (let i = 0; i < count; i++) {
      const spot = new THREE.SpotLight(0xffffff, 20, 8, 0.7, 0.85, 1.7);
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


    this.trimMat.color.set(dark ? "#241a13" : "#3a2a1d");
    this.crownMat.color.set(toColor(dark ? lighten(muted, 0.08) : lighten(muted, 0.5)));
    this.ends.setTheme(p);

    // The far end dissolves into haze: a shade below the walls in the light
    // theme (paper-white fog read as a blown-out window), below the page
    // background in the dark one.
    const fogColor = toColor(dark ? darken(bg, 0.15) : darken(muted, 0.14));
    this.scene.fog = new THREE.Fog(fogColor, dark ? 7 : 9, dark ? 34 : 40);
    this.scene.background = fogColor;
    this.renderer.toneMappingExposure = dark ? 0.95 : 1.0;
    // Enough ambience to see by, not enough to add to what is already
    // falling on the pictures from the fixture above each of them.
    this.scene.environmentIntensity = dark ? 0.26 : 0.34;

    this.hemi.intensity = dark ? 0.46 : 0.6;
    this.hemi.color.set(dark ? 0xf6e6d2 : 0xfff5e6);
    this.lantern.intensity = dark ? 4.5 : 3;

    this.coneMat.opacity = dark ? 0.85 : 0.55;
    this.poolMat.opacity = dark ? 0.7 : 0.45;
    this.walkway?.setTheme(dark);
    this.props.setTheme(dark);
    this.windows?.setTheme(p);
    this.bearers?.setTheme(p);
    this.ceilTex.image = this.ceilingImage();
    this.ceilTex.needsUpdate = true;

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

  /** The ceiling's paint, in the theme's terms. */
  private ceilingImage(): HTMLCanvasElement {
    const p = this.palette;
    return ceilingCanvas({
      dark: p.dark,
      ground: hexToRgb(p.muted),
      stops: p.tints.map(hexToRgb) as [RGB, RGB, RGB, RGB, RGB],
    });
  }

  /** Redraw plaques and placeholders (after the webfont arrives). */
  private redrawText(): void {
    for (const f of this.frames) {
      if (f.coverState !== "done") {
        f.art = new Art({ title: f.entry.title, author: f.entry.author, tint: f.tint, family: this.family, arched: f.arched });
        f.artTex.image = f.art.canvas;
        f.artTex.needsUpdate = true;
      }
      f.plaqueTex.image = plaqueCanvas(
        { title: f.entry.title, author: f.entry.author, series: f.entry.series },
        this.family
      );
      f.plaqueTex.needsUpdate = true;
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

    // The walkway's tread is the only thing that moves at rest, and it does
    // not need 60 frames a second — or any, for a visitor who asked for less
    // motion. With the walkway off, nothing idles: no input, no frame.
    const idleTick =
      this.walkway !== null &&
      !this.reducedMotion &&
      now - this.lastRenderAt >= 1000 / 24;
    if (moved || this.needsRender || idleTick) {
      const t0 = performance.now();
      this.walkway?.update(Math.min(0.1, (now - this.lastRenderAt) / 1000));
      this.lastRenderAt = now;
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
    if (input.locked !== this.locked) {
      this.locked = input.locked;
      this.els.root.classList.toggle("is-locked", this.locked);
      this.needsRender = true;
    }
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

    // The walkway carries whoever stands on it, walking or not — unless the
    // visitor asked for less motion, in which case it is only a floor.
    const onBelt =
      !this.reducedMotion && (this.walkway?.carries(this.pos.x, this.pos.z) ?? false);
    const moving = this.vel.x !== 0 || this.vel.z !== 0 || onBelt;
    if (moving) {
      this.pos.x += this.vel.x * dt;
      this.pos.z += this.vel.z * dt;
      if (onBelt && this.walkway) this.pos.z -= this.walkway.speed * dt;
      // Floating, the books occupy the sides of the hall, so what is left
      // to walk in is the aisle between them.
      //
      // Stopping at a wall has to stop the velocity too, not just the
      // position. Left running, the speed you were carrying into the wall
      // has to unwind back through zero before a strafe the other way moves
      // you at all — so the first tap away from a wall does nothing, which
      // is indistinguishable from the key being broken.
      const xLimit = FLOATING ? AISLE_HALF : HALL_W / 2 - WALL_GAP;
      this.pos.x = clampAxis(this.pos.x, -xLimit, xLimit, this.vel, "x");
      this.pos.z = clampAxis(
        this.pos.z, this.zMin + 0.9, this.zMax - 0.9, this.vel, "z"
      );
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
      // Floating, the picture carries most of its own light, so the spot is
      // only there for the gilt and the label — and it has to be gentle,
      // because a bearer's head is a metre under it and any brighter comes
      // back white however blue the creature is painted.
      spot.intensity = this.palette.dark
        ? (FLOATING ? 9 : 20)
        : (FLOATING ? 7 : 15);
      spot.color.set(toColor(lighten(f.tint, 0.55)));
      spot.position.set(
        f.side * (FLOATING ? FLOAT_X - LAMP_DX : HALL_W / 2 - FIXTURE_IN),
        HALL_H - 0.15,
        f.z + (FLOATING ? LAMP_DZ : 0)
      );
      // Aim low enough that the cone takes in the label hanging below.
      spot.target.position.set(
        f.centre.x,
        f.centre.y - (FLOATING ? 0.55 : 0.1),
        f.centre.z
      );
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
    // Locked, the crosshair is always screen-centre — there's no cursor
    // position to speak of, so re-cast the same point against whichever way
    // the camera is currently facing.
    const point = this.locked
      ? { x: this.els.root.clientWidth / 2, y: this.els.root.clientHeight / 2 }
      : this.hoverPoint;
    const hovered = point ? this.castAt(point.x, point.y) : null;
    const hoverIndex = hovered ? hovered.index : -1;
    if (hoverIndex !== this.hoverIndex) {
      this.hoverIndex = hoverIndex;
      this.els.canvas.style.cursor = hovered ? "pointer" : "";
      this.els.root.classList.toggle("is-aimable", hovered !== null);
    }
    const aimed = hovered ?? this.nearestFacing();
    const aimedIndex = aimed ? aimed.index : -1;
    if (aimedIndex !== this.aimedIndex) {
      this.aimedIndex = aimedIndex;
      this.showLabel(aimed);
    }
    const highlight = hovered ? hovered.index : -1;
    if (highlight !== this.highlightIndex) {
      if (this.highlightIndex >= 0) this.tintFrame(this.frames[this.highlightIndex], 1);
      if (highlight >= 0) this.tintFrame(this.frames[highlight], 1.35);
      this.highlightIndex = highlight;
      this.needsRender = true;
    }
  }

  /** Multiply a frame's moulding colour — the hover glow. */
  private tintFrame(f: FrameRec, gain: number): void {
    const c = f.tintColor.clone().multiplyScalar(gain);
    for (const { mesh, index } of f.slots) {
      mesh.setColorAt(index, c);
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
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
    this.walkway?.dispose();
    this.props.dispose();
    this.windows?.dispose();
    this.bearers?.dispose();
    this.ends.dispose();
    this.scene.environment?.dispose();
    this.renderer.dispose();
  }
}

/* ---- helpers ----------------------------------------------------------- */

function toColor(c: RGB): THREE.Color {
  return new THREE.Color(c[0], c[1], c[2]);
}

/**
 * Hold one axis inside its bounds, killing the velocity that ran into the
 * bound. Without the second half you keep the speed you hit the wall with,
 * and it has to decay back through zero before the opposite key moves you —
 * a tap that way does nothing at all.
 */
function clampAxis(
  value: number,
  min: number,
  max: number,
  vel: { x: number; z: number },
  axis: "x" | "z"
): number {
  if (value < min) {
    if (vel[axis] < 0) vel[axis] = 0;
    return min;
  }
  if (value > max) {
    if (vel[axis] > 0) vel[axis] = 0;
    return max;
  }
  return value;
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
