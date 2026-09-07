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

/** Shrink the font until `text` fits in `maxLines` lines. Returns the lines. */
function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  font: (px: number) => string,
  startPx: number,
  minPx: number,
  maxWidth: number,
  maxLines: number
): { lines: string[]; px: number } {
  let px = startPx;
  for (;;) {
    ctx.font = font(px);
    const lines = wrap(ctx, text, maxWidth);
    const widest = Math.max(...lines.map(l => ctx.measureText(l).width));
    if ((lines.length <= maxLines && widest <= maxWidth) || px <= minPx) {
      return { lines, px };
    }
    px -= 2;
  }
}

/* ---- plaque ------------------------------------------------------------ */

export interface PlaqueText {
  title: string;
  author?: string;
  series?: boolean;
}

/**
 * A brass plate with the title engraved on it, the author in smaller
 * italics beneath. 1024×280 for a 0.62 × 0.17 m plate — large enough to
 * read from the middle of the hall, and crisp when you walk up to it.
 */
export function plaqueCanvas(text: PlaqueText, family: string): HTMLCanvasElement {
  const w = 1024, h = 280;
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

  // Engraving: dark fill with a hair of light offset below, so it reads as
  // cut into the metal rather than printed on it.
  const ink = "rgba(48,30,10,0.94)";
  const glint = "rgba(255,245,215,0.45)";
  const maxWidth = w - 130;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const titleFont = (px: number) => `600 ${px}px ${family}`;
  const authorLine = [text.author, text.series ? "Series" : ""]
    .filter(Boolean)
    .join(" · ");
  const authorFont = (px: number) => `italic 400 ${px}px ${family}`;

  const title = fitText(ctx, text.title, titleFont, 100, 54, maxWidth, 2);
  const author = authorLine
    ? fitText(ctx, authorLine, authorFont, 64, 40, maxWidth, 1)
    : { lines: [], px: 0 };

  const titleLh = title.px * 1.06;
  const titleH = title.lines.length * titleLh;
  const authorH = author.lines.length ? author.px * 1.25 + 10 : 0;
  let y = h / 2 - (titleH + authorH) / 2 + titleLh / 2;

  ctx.font = titleFont(title.px);
  for (const line of title.lines) {
    ctx.fillStyle = glint;
    ctx.fillText(line, w / 2, y + 2);
    ctx.fillStyle = ink;
    ctx.fillText(line, w / 2, y);
    y += titleLh;
  }
  if (author.lines.length) {
    y += 10 + (author.px * 1.25) / 2 - titleLh / 2;
    ctx.font = authorFont(author.px);
    ctx.fillStyle = glint;
    ctx.fillText(author.lines[0], w / 2, y + 2);
    ctx.fillStyle = ink;
    ctx.fillText(author.lines[0], w / 2, y);
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
