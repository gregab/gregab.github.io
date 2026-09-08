/*
  Every surface in the corridor is painted on a <canvas> at start-up rather
  than fetched: plaster, floor boards, the gilt's patina, the light pools, the
  brass plaques and the matted covers. No image requests except the covers
  themselves, and nothing that can 404 into an untextured grey box.
*/

import { type RGB, rgbToHex, darken, lighten, mixOklab } from "./palette";

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable");
  return ctx;
}

/* A small deterministic PRNG so every visitor gets the same boards. */
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

function rgba(c: RGB, a: number): string {
  return `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${a})`;
}

/* ---- plaster ----------------------------------------------------------- */

/** Lightly troweled plaster in the wall colour. One tile = 2 m. */
export function plasterCanvas(base: RGB): HTMLCanvasElement {
  const size = 512;
  const c = makeCanvas(size, size);
  const ctx = ctx2d(c);
  const rnd = mulberry32(7);
  ctx.fillStyle = rgbToHex(base);
  ctx.fillRect(0, 0, size, size);

  // Broad soft blotches: the unevenness of a hand-finished wall.
  for (let i = 0; i < 40; i++) {
    const x = rnd() * size, y = rnd() * size, r = 40 + rnd() * 120;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const light = rnd() > 0.5;
    g.addColorStop(0, light ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.045)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Fine grain.
  for (let i = 0; i < 14000; i++) {
    const v = rnd();
    ctx.fillStyle = v > 0.5 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)";
    ctx.fillRect(rnd() * size, rnd() * size, 1 + rnd() * 1.5, 1 + rnd() * 1.5);
  }
  return c;
}

/* ---- floor boards ------------------------------------------------------ */

/** Dark walnut boards running along the canvas' Y axis. One tile = 1.2 m. */
export function plankCanvas(dark: boolean): HTMLCanvasElement {
  const size = 512;
  const c = makeCanvas(size, size);
  const ctx = ctx2d(c);
  const rnd = mulberry32(11);
  const boards = 5;
  const bw = size / boards;

  const base: RGB = dark ? [0.24, 0.16, 0.11] : [0.36, 0.24, 0.16];
  ctx.fillStyle = rgbToHex(base);
  ctx.fillRect(0, 0, size, size);

  for (let b = 0; b < boards; b++) {
    const x0 = b * bw;
    // Each board its own shade.
    const shade = mixOklab(base, rnd() > 0.5 ? [0.55, 0.36, 0.22] : [0.18, 0.11, 0.07], rnd() * 0.45);
    ctx.fillStyle = rgbToHex(shade);
    ctx.fillRect(x0, 0, bw, size);

    // Grain: long wavering lines along the board.
    const lines = 14 + Math.floor(rnd() * 8);
    for (let i = 0; i < lines; i++) {
      const gx = x0 + 4 + rnd() * (bw - 8);
      const amp = 1 + rnd() * 3;
      const freq = 0.004 + rnd() * 0.01;
      const phase = rnd() * Math.PI * 2;
      ctx.strokeStyle = rnd() > 0.35 ? "rgba(0,0,0,0.16)" : "rgba(255,235,200,0.07)";
      ctx.lineWidth = 0.6 + rnd() * 1.2;
      ctx.beginPath();
      for (let y = 0; y <= size; y += 6) {
        const x = gx + Math.sin(y * freq * Math.PI * 2 + phase) * amp;
        if (y === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Board-end joint, staggered per board so it tiles like real flooring.
    const jy = ((b * 0.37 + 0.13) % 1) * size;
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(x0, jy, bw, 2);
    ctx.fillStyle = "rgba(255,230,200,0.06)";
    ctx.fillRect(x0, jy + 2, bw, 1);

    // Gap between boards.
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(x0, 0, 2, size);
    ctx.fillStyle = "rgba(255,230,200,0.05)";
    ctx.fillRect(x0 + 2, 0, 1, size);
  }

  // Wear: a faint lighter track down the middle of the tile, worn by feet.
  const g = ctx.createLinearGradient(0, 0, size, 0);
  g.addColorStop(0, "rgba(255,240,220,0)");
  g.addColorStop(0.5, "rgba(255,240,220,0.06)");
  g.addColorStop(1, "rgba(255,240,220,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return c;
}

/**
 * Roughness for the floor: a mostly-smooth board with dull streaks, so the
 * lantern's reflection breaks up into grain instead of a plastic sheen.
 */
export function plankRoughnessCanvas(): HTMLCanvasElement {
  const size = 256;
  const c = makeCanvas(size, size);
  const ctx = ctx2d(c);
  const rnd = mulberry32(23);
  ctx.fillStyle = "#8c8c8c";
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 260; i++) {
    const x = rnd() * size;
    ctx.fillStyle = rnd() > 0.5 ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.25)";
    ctx.fillRect(x, 0, 1 + rnd() * 3, size);
  }
  return c;
}

/* ---- gilt patina ------------------------------------------------------- */

/** Mottled grey noise: roughness + bump for old gold leaf. */
export function patinaCanvas(): HTMLCanvasElement {
  const size = 256;
  const c = makeCanvas(size, size);
  const ctx = ctx2d(c);
  const rnd = mulberry32(3);
  ctx.fillStyle = "#7a7a7a";
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 90; i++) {
    const x = rnd() * size, y = rnd() * size, r = 6 + rnd() * 40;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const light = rnd() > 0.45;
    g.addColorStop(0, light ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 6000; i++) {
    ctx.fillStyle = rnd() > 0.5 ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)";
    ctx.fillRect(rnd() * size, rnd() * size, 1, 1);
  }
  return c;
}

/* ---- light pools ------------------------------------------------------- */

/** Soft radial glow, white to transparent. Tinted per instance in the scene. */
export function glowCanvas(): HTMLCanvasElement {
  const size = 256;
  const c = makeCanvas(size, size);
  const ctx = ctx2d(c);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.45)");
  g.addColorStop(0.7, "rgba(255,255,255,0.1)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return c;
}

/**
 * The cone of a picture light seen on the wall: bright at the top, spreading
 * and fading downward, so the frame hangs in a wash rather than a disc.
 */
export function coneCanvas(): HTMLCanvasElement {
  const w = 256, h = 384;
  const c = makeCanvas(w, h);
  const ctx = ctx2d(c);
  // Wedge shape
  ctx.beginPath();
  ctx.moveTo(w * 0.36, 0);
  ctx.lineTo(w * 0.64, 0);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "rgba(255,255,255,0.95)");
  g.addColorStop(0.3, "rgba(255,255,255,0.5)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fill();
  // Feather the sides so the wedge has no hard edge.
  const side = ctx.createLinearGradient(0, 0, w, 0);
  side.addColorStop(0, "rgba(0,0,0,1)");
  side.addColorStop(0.25, "rgba(0,0,0,0)");
  side.addColorStop(0.75, "rgba(0,0,0,0)");
  side.addColorStop(1, "rgba(0,0,0,1)");
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = side;
  ctx.fillRect(0, 0, w, h);
  return c;
}

/* ---- ceiling ----------------------------------------------------------- */

/**
 * One coffer of the painted ceiling: a ribbed square with an eight-pointed
 * star medallion and a quatrefoil at each corner, drawn in greys only. The
 * scene multiplies it by a vertex colour sampled from the same five-stop arc
 * the frame lights run through, so the pattern crossfades gold → slate over
 * the length of the hall instead of introducing a sixth colour. One tile is
 * one bay, so the ribs land between the frames rather than across them.
 */
export function ceilingCanvas(): HTMLCanvasElement {
  const S = 512;
  const c = makeCanvas(S, S);
  const ctx = ctx2d(c);
  const g = (v: number) => `rgb(${v},${v},${v})`;
  const ink = "rgba(58,46,34,0.5)";

  ctx.fillStyle = g(252);
  ctx.fillRect(0, 0, S, S);

  /** A regular polygon, or a star when `r2` is smaller than `r1`. */
  const shape = (
    cx: number, cy: number, r1: number, r2: number, n: number, rot: number
  ): void => {
    ctx.beginPath();
    const steps = r2 === r1 ? n : n * 2;
    for (let i = 0; i < steps; i++) {
      const a = rot + (i * Math.PI * 2) / steps;
      const r = r2 === r1 || i % 2 === 0 ? r1 : r2;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  };
  const paint = (fill: number, line = 2.5): void => {
    ctx.fillStyle = g(fill);
    ctx.fill();
    ctx.strokeStyle = ink;
    ctx.lineWidth = line;
    ctx.stroke();
  };

  // Ribs along the tile edges: they meet their neighbours to make one
  // continuous coffer grid down the hall.
  const rib = S * 0.058;
  ctx.fillStyle = g(230);
  ctx.fillRect(0, 0, S, rib);
  ctx.fillRect(0, S - rib, S, rib);
  ctx.fillRect(0, 0, rib, S);
  ctx.fillRect(S - rib, 0, rib, S);
  ctx.strokeStyle = ink;
  ctx.lineWidth = 2.5;
  ctx.strokeRect(rib, rib, S - 2 * rib, S - 2 * rib);

  // A ruled border inside the coffer, with a small lozenge at each corner.
  const inset = S * 0.145;
  ctx.strokeStyle = ink;
  ctx.lineWidth = 2;
  ctx.strokeRect(inset, inset, S - 2 * inset, S - 2 * inset);
  for (const [cx, cy] of [
    [inset, inset], [S - inset, inset], [inset, S - inset], [S - inset, S - inset],
  ]) {
    shape(cx, cy, S * 0.036, S * 0.036, 4, 0);
    paint(178, 2);
  }

  // Quarter medallions at the tile corners: four tiles complete each one, so
  // the rib crossings carry a small star of their own.
  for (const [cx, cy] of [[0, 0], [S, 0], [0, S], [S, S]]) {
    shape(cx, cy, S * 0.105, S * 0.045, 8, Math.PI / 8);
    paint(204);
  }

  // The medallion: one eight-pointed star with sharp points, an octagon
  // inside it and a dark boss at the middle.
  shape(S / 2, S / 2, S * 0.245, S * 0.104, 8, -Math.PI / 2);
  paint(168, 3);
  shape(S / 2, S / 2, S * 0.106, S * 0.106, 8, Math.PI / 8);
  paint(206, 2.5);
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, S * 0.044, 0, Math.PI * 2);
  paint(120, 2.5);

  // A whisper of plaster grain so the flat fills are not perfectly flat.
  const rnd = mulberry32(29);
  for (let i = 0; i < 7000; i++) {
    ctx.fillStyle = rnd() > 0.5 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.045)";
    ctx.fillRect(rnd() * S, rnd() * S, 1.5, 1.5);
  }
  return c;
}

/* ---- type helpers ------------------------------------------------------ */

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth || !line) {
      line = test;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Shrink the font from `startPx` until `text` wraps to at most `maxLines`
 * lines that each fit `maxWidth`. `minPx` is a preferred floor — callers use
 * it to keep type legible — but it is not allowed to make this function give
 * up on a text that still overflows: if the wrap still doesn't fit at
 * `minPx` (a long single word, say, or a caller that started too big for its
 * own height budget), it keeps shrinking down to an absolute hard floor
 * rather than hand back lines that will draw off the plate.
 */
function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  font: (px: number) => string,
  startPx: number,
  minPx: number,
  maxWidth: number,
  maxLines: number
): { lines: string[]; px: number } {
  const hardFloor = 10;
  let px = startPx;
  for (;;) {
    ctx.font = font(px);
    const lines = wrap(ctx, text, maxWidth);
    const widest = Math.max(...lines.map(l => ctx.measureText(l).width));
    const fits = lines.length <= maxLines && widest <= maxWidth;
    if (fits || px <= hardFloor) {
      return { lines, px };
    }
    // Once below the caller's preferred floor there's no readability left
    // to protect, so close in on the hard floor a pixel at a time instead
    // of overshooting it in the usual 2px steps.
    px -= px > minPx ? 2 : 1;
  }
}

/* ---- plaque ------------------------------------------------------------ */

export interface PlaqueText {
  title: string;
  author?: string;
  series?: boolean;
}

/**
 * A brass plate with the title engraved on it, a hairline rule, and the
 * author in italics beneath. 1024×614 for a 0.50 × 0.30 m plate hung beside
 * the picture the way a museum hangs its label — so the type can be set
 * large enough to read from the middle of the hall without a plate as wide
 * as the frame.
 */
export function plaqueCanvas(text: PlaqueText, family: string): HTMLCanvasElement {
  const w = 1024, h = 614;
  const c = makeCanvas(w, h);
  const ctx = ctx2d(c);

  // Brushed brass.
  const brass = ctx.createLinearGradient(0, 0, w, h);
  brass.addColorStop(0, "#c9a45a");
  brass.addColorStop(0.35, "#e2c47f");
  brass.addColorStop(0.55, "#bf9a50");
  brass.addColorStop(0.8, "#d7b86f");
  brass.addColorStop(1, "#a88440");
  ctx.fillStyle = brass;
  ctx.fillRect(0, 0, w, h);
  const rnd = mulberry32(5);
  for (let i = 0; i < 600; i++) {
    ctx.fillStyle = rnd() > 0.5 ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
    ctx.fillRect(0, rnd() * h, w, 1);
  }
  // Bevelled edge.
  ctx.lineWidth = 6;
  ctx.strokeStyle = "rgba(255,245,210,0.55)";
  ctx.strokeRect(6, 6, w - 12, h - 12);
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(60,40,10,0.45)";
  ctx.strokeRect(14, 14, w - 28, h - 28);
  // Screws.
  for (const [sx, sy] of [[34, 34], [w - 34, 34], [34, h - 34], [w - 34, h - 34]]) {
    ctx.beginPath();
    ctx.arc(sx, sy, 9, 0, Math.PI * 2);
    ctx.fillStyle = "#8a6a2f";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(sx - 2, sy - 2, 6, 0, Math.PI * 2);
    ctx.fillStyle = "#d9bb74";
    ctx.fill();
    ctx.strokeStyle = "rgba(60,40,10,0.7)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sx - 5, sy + 3);
    ctx.lineTo(sx + 5, sy - 3);
    ctx.stroke();
  }

  const ink = "rgba(48,30,10,0.94)";
  const glint = "rgba(255,245,215,0.45)";
  // Horizontal room clear of the bevel and the screw heads (34px inset,
  // 9px radius); vertical room so the assembled block never runs into the
  // bevel top or bottom, however many lines it ends up needing.
  const marginX = 130;
  const marginY = 60;
  const maxWidth = w - marginX * 2;
  const availH = h - marginY * 2;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const titleFont = (px: number) => `600 ${px}px ${family}`;
  const authorFont = (px: number) => `italic 400 ${px}px ${family}`;

  // Fitting the title and the author independently (the old approach) can
  // still overflow the plate: each fits its own width and line budget, but
  // nothing checks the assembled height of title + rule + author + series
  // against the plate. So step both ceilings down together — title falls
  // faster, keeping it visibly the larger of the two — and re-wrap until
  // the whole block fits, holding each as large as that allows. The maxLines
  // caps below (3 for wrapped words is bounded by the amount of shrinking
  // needed) are still what fitText enforces; more than a handful of steps
  // never happen for real book titles.
  const titleMax = 165, titleFloor = 34;
  const authorMax = 105, authorFloor = 22;
  let titleCeil = titleMax;
  let authorCeil = authorMax;
  let title: { lines: string[]; px: number };
  let author: { lines: string[]; px: number };
  let seriesPx: number;
  let titleLh: number, authorLh: number, seriesH: number, rule: number, blockH: number;
  for (;;) {
    title = fitText(ctx, text.title, titleFont, titleCeil, titleFloor, maxWidth, 3);
    author = text.author
      ? fitText(ctx, text.author, authorFont, authorCeil, authorFloor, maxWidth, 2)
      : { lines: [], px: 0 };
    // "Series" gets its own line rather than an interpunct after the author:
    // joined, a long byline wraps and leaves the separator dangling.
    seriesPx = Math.round((author.px || 96) * 0.76);

    titleLh = title.px * 1.08;
    authorLh = author.px * 1.22;
    seriesH = text.series ? seriesPx * 1.5 : 0;
    rule = author.lines.length || text.series ? 46 : 0;
    blockH = title.lines.length * titleLh + rule + author.lines.length * authorLh + seriesH;

    if (blockH <= availH || (titleCeil <= titleFloor && authorCeil <= authorFloor)) break;
    titleCeil = Math.max(titleFloor, titleCeil - 3);
    authorCeil = Math.max(authorFloor, authorCeil - 2);
  }
  let y = h / 2 - blockH / 2 + titleLh / 2;

  /* Engraving: dark fill with a hair of light below, so it reads as cut
     into the metal rather than printed on it. */
  const cut = (line: string, at: number): void => {
    ctx.fillStyle = glint;
    ctx.fillText(line, w / 2, at + 3);
    ctx.fillStyle = ink;
    ctx.fillText(line, w / 2, at);
  };

  ctx.font = titleFont(title.px);
  for (const line of title.lines) {
    cut(line, y);
    y += titleLh;
  }
  if (rule) {
    // A short rule between the two, the width of a museum label's.
    const ry = y + rule / 2;
    ctx.lineWidth = 3;
    ctx.strokeStyle = glint;
    ctx.beginPath();
    ctx.moveTo(w / 2 - 90, ry + 2);
    ctx.lineTo(w / 2 + 90, ry + 2);
    ctx.stroke();
    ctx.strokeStyle = ink;
    ctx.beginPath();
    ctx.moveTo(w / 2 - 90, ry);
    ctx.lineTo(w / 2 + 90, ry);
    ctx.stroke();

    y += rule;
    if (author.lines.length) {
      y += authorLh / 2;
      ctx.font = authorFont(author.px);
      for (const line of author.lines) {
        cut(line, y);
        y += authorLh;
      }
      y -= authorLh / 2;
    }
    if (text.series) {
      ctx.font = authorFont(seriesPx);
      cut("Series", y + seriesH / 2);
    }
  }
  return c;
}

/* ---- the art ----------------------------------------------------------- */

export interface ArtSpec {
  title: string;
  author?: string;
  /** This entry's colour on the arc; used for the placeholder cloth. */
  tint: RGB;
  family: string;
  /** Round-headed window, for the arched frames. */
  arched?: boolean;
}

/**
 * The picture inside the frame: a linen mat with a bevelled window — square
 * or round-headed to match the frame — and in the window either the cover
 * image (fitted, on a dark backing) or, until it arrives or if it never
 * does, a cloth-bound book in this entry's colour with the title stamped in
 * gilt. Canvas is 2:3 to match the plane.
 */
export class Art {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly w = 512;
  private readonly h = 768;
  private readonly mat = 46; // mat border, px

  constructor(private readonly spec: ArtSpec) {
    this.canvas = makeCanvas(this.w, this.h);
    this.ctx = ctx2d(this.canvas);
    this.drawPlaceholder();
  }

  private get window(): { x: number; y: number; iw: number; ih: number } {
    const { w, h, mat } = this;
    return { x: mat, y: mat, iw: w - 2 * mat, ih: h - 2 * mat };
  }

  /** Trace the window opening as the current path. */
  private windowPath(): void {
    const { ctx } = this;
    const { x, y, iw, ih } = this.window;
    ctx.beginPath();
    if (this.spec.arched) {
      const r = iw / 2;
      ctx.moveTo(x, y + ih);
      ctx.lineTo(x, y + r);
      ctx.arc(x + r, y + r, r, Math.PI, 0, false);
      ctx.lineTo(x + iw, y + ih);
      ctx.closePath();
    } else {
      ctx.rect(x, y, iw, ih);
    }
  }

  private drawMat(): void {
    const { ctx, w, h } = this;
    ctx.fillStyle = "#efe6d6";
    ctx.fillRect(0, 0, w, h);
    // Linen weave
    const rnd = mulberry32(9);
    for (let i = 0; i < 3000; i++) {
      ctx.fillStyle = rnd() > 0.5 ? "rgba(255,255,255,0.35)" : "rgba(120,100,70,0.12)";
      ctx.fillRect(rnd() * w, rnd() * h, 1, 1);
    }
    // Bevel: a light rim around the window, its lower-right edge in shadow.
    // The content is drawn inside the path afterwards and covers the inner
    // half of these strokes, leaving a clean cut edge.
    ctx.save();
    ctx.translate(5, 5);
    this.windowPath();
    ctx.lineWidth = 12;
    ctx.strokeStyle = "#cbbfa9";
    ctx.stroke();
    ctx.restore();
    this.windowPath();
    ctx.lineWidth = 12;
    ctx.strokeStyle = "#fbf6ec";
    ctx.stroke();
  }

  /** Run `draw` clipped to the window, then add the window's inner shadow. */
  private inWindow(draw: () => void): void {
    const { ctx } = this;
    ctx.save();
    this.windowPath();
    ctx.clip();
    draw();
    this.windowPath();
    ctx.lineWidth = 8;
    ctx.strokeStyle = "rgba(0,0,0,0.38)";
    ctx.stroke();
    ctx.restore();
  }

  /** Cloth cover in this entry's colour with gilt lettering. */
  drawPlaceholder(): void {
    const { ctx, spec } = this;
    const { x, y, iw, ih } = this.window;
    this.drawMat();
    this.inWindow(() => {
      const cloth = darken(spec.tint, 0.35);
      ctx.fillStyle = rgbToHex(cloth);
      ctx.fillRect(x, y, iw, ih);
      // Cloth weave
      const rnd = mulberry32(13);
      for (let i = 0; i < 5000; i++) {
        ctx.fillStyle = rnd() > 0.5 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.08)";
        ctx.fillRect(x + rnd() * iw, y + rnd() * ih, 1.5, 1.5);
      }
      // Spine shadow down the left.
      const sg = ctx.createLinearGradient(x, 0, x + 60, 0);
      sg.addColorStop(0, "rgba(0,0,0,0.45)");
      sg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = sg;
      ctx.fillRect(x, y, 60, ih);

      // Gilt rules and lettering. The rules follow the window's shape.
      const gilt = rgbToHex(lighten(spec.tint, 0.55));
      ctx.strokeStyle = gilt;
      const inset = (d: number) => {
        ctx.beginPath();
        if (spec.arched) {
          const r = iw / 2 - d;
          ctx.moveTo(x + d, y + ih - d);
          ctx.lineTo(x + d, y + iw / 2);
          ctx.arc(x + iw / 2, y + iw / 2, r, Math.PI, 0, false);
          ctx.lineTo(x + iw - d, y + ih - d);
          ctx.closePath();
        } else {
          ctx.rect(x + d, y + d, iw - 2 * d, ih - 2 * d);
        }
      };
      ctx.lineWidth = 3;
      inset(34);
      ctx.stroke();
      ctx.lineWidth = 1.5;
      inset(42);
      ctx.stroke();

      ctx.fillStyle = gilt;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const titleFont = (px: number) => `600 ${px}px ${spec.family}`;
      const title = fitText(ctx, spec.title, titleFont, 64, 34, iw - 120, 4);
      const lh = title.px * 1.12;
      let ty = y + ih * 0.44 - ((title.lines.length - 1) * lh) / 2;
      ctx.font = titleFont(title.px);
      for (const line of title.lines) {
        ctx.fillText(line, x + iw / 2, ty);
        ty += lh;
      }
      if (spec.author) {
        const af = (px: number) => `italic 400 ${px}px ${spec.family}`;
        const author = fitText(ctx, spec.author, af, 36, 24, iw - 120, 2);
        ctx.font = af(author.px);
        let ay = ty + 20;
        for (const line of author.lines) {
          ctx.fillText(line, x + iw / 2, ay);
          ay += author.px * 1.25;
        }
      }
      // Small ornament
      ctx.beginPath();
      ctx.arc(x + iw / 2, y + ih * 0.82, 5, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  /** Replace the placeholder with a real cover, fitted inside the window. */
  drawImage(img: HTMLImageElement): void {
    const { ctx, spec } = this;
    const { x, y, iw, ih } = this.window;
    this.drawMat();
    this.inWindow(() => {
      ctx.fillStyle = rgbToHex(darken(spec.tint, 0.6));
      ctx.fillRect(x, y, iw, ih);
      const scale = Math.min(iw / img.naturalWidth, ih / img.naturalHeight);
      const dw = img.naturalWidth * scale, dh = img.naturalHeight * scale;
      const dx = x + (iw - dw) / 2, dy = y + (ih - dh) / 2;
      ctx.drawImage(img, dx, dy, dw, dh);
      // A whisper of gloss so it reads as a print under glass.
      const gl = ctx.createLinearGradient(x, y, x + iw, y + ih);
      gl.addColorStop(0, "rgba(255,255,255,0.08)");
      gl.addColorStop(0.5, "rgba(255,255,255,0)");
      gl.addColorStop(1, "rgba(255,255,255,0.04)");
      ctx.fillStyle = gl;
      ctx.fillRect(x, y, iw, ih);
    });
  }
}

export { rgba };
