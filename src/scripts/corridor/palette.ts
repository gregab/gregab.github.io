/*
  The corridor's colours come from the site's own tokens rather than a second
  palette: walls take --muted, the far end dissolves into --background, and
  the light over each frame samples the same five-stop arc (--ct-tint-1..5)
  the 2D timeline's spine runs through, so the corridor and the list agree
  about which colour a book sits under. Re-read on every theme toggle.
*/

export interface Palette {
  dark: boolean;
  background: string;
  foreground: string;
  muted: string;
  mutedForeground: string;
  border: string;
  tints: [string, string, string, string, string];
}

function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return v || fallback;
}

export function readPalette(): Palette {
  const dark =
    document.documentElement.getAttribute("data-theme") === "dark";
  return {
    dark,
    background: cssVar("--background", dark ? "#1e1a18" : "#faf7f2"),
    foreground: cssVar("--foreground", dark ? "#ede6dc" : "#2b2320"),
    muted: cssVar("--muted", dark ? "#352e2a" : "#ebe3d8"),
    mutedForeground: cssVar("--muted-foreground", dark ? "#a89a8d" : "#736659"),
    border: cssVar("--border", dark ? "#4a4038" : "#d8ccbc"),
    tints: [
      cssVar("--ct-tint-1", "#c8912f"),
      cssVar("--ct-tint-2", "#b5673f"),
      cssVar("--ct-tint-3", "#9d5a72"),
      cssVar("--ct-tint-4", "#6b5f96"),
      cssVar("--ct-tint-5", "#35566e"),
    ],
  };
}

/* ---- colour maths ------------------------------------------------------ */

export type RGB = [number, number, number]; // 0..1 sRGB

export function hexToRgb(hex: string): RGB {
  let h = hex.trim().replace("#", "");
  if (h.length === 3) h = h.split("").map(c => c + c).join("");
  const n = parseInt(h.slice(0, 6), 16);
  if (Number.isNaN(n)) return [0.5, 0.5, 0.5];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function rgbToHex([r, g, b]: RGB): string {
  const c = (v: number) =>
    Math.round(Math.min(1, Math.max(0, v)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

function toLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function toSrgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

/* Björn Ottosson's oklab, so the mix through terracotta and rose matches the
   `in oklab` gradient on the 2D timeline instead of dulling through grey. */
function rgbToOklab([r, g, b]: RGB): [number, number, number] {
  const lr = toLinear(r), lg = toLinear(g), lb = toLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToRgb([L, a, bb]: [number, number, number]): RGB {
  const l = (L + 0.3963377774 * a + 0.2158037573 * bb) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * bb) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * bb) ** 3;
  return [
    toSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    toSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    toSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

/** Mix two sRGB colours in oklab. t=0 gives a, t=1 gives b. */
export function mixOklab(a: RGB, b: RGB, t: number): RGB {
  const A = rgbToOklab(a), B = rgbToOklab(b);
  return oklabToRgb([
    A[0] + (B[0] - A[0]) * t,
    A[1] + (B[1] - A[1]) * t,
    A[2] + (B[2] - A[2]) * t,
  ]);
}

/**
 * Sample the five-stop arc at position t in [0, 1] — the same crossfade the
 * 2D spine draws, so entry i of N sits under the colour it has on the list.
 */
export function tintAt(palette: Palette, t: number): RGB {
  const stops = palette.tints.map(hexToRgb);
  const x = Math.min(1, Math.max(0, t)) * (stops.length - 1);
  const i = Math.min(Math.floor(x), stops.length - 2);
  return mixOklab(stops[i], stops[i + 1], x - i);
}

export function lighten(c: RGB, amount: number): RGB {
  return mixOklab(c, [1, 1, 1], amount);
}
export function darken(c: RGB, amount: number): RGB {
  return mixOklab(c, [0, 0, 0], amount);
}
