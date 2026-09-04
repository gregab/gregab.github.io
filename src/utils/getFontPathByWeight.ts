import type { FontData } from "astro:assets";

/**
 * Satori (which renders the OG images) cannot parse woff2 — it throws
 * "Unsupported OpenType signature wOF2". Astro emits several formats per face
 * and the label it uses for a given format is not stable across versions, so
 * rather than asking for one exact name we walk a preference order of
 * satori-safe formats and never fall back to woff2.
 */
const SATORI_SAFE_FORMATS = [
  "truetype",
  "ttf",
  "opentype",
  "otf",
  "woff",
] as const;

export function getFontPathByWeight(
  fonts: FontData[],
  weight: number,
  options?: {
    style?: "normal" | "italic";
    format?: string;
  }
): string | undefined {
  const style = options?.style ?? "normal";

  for (const font of fonts) {
    if (font.weight !== String(weight) || font.style !== style) continue;

    // An explicitly requested format wins, if this face has it.
    if (options?.format) {
      const exact = font.src.find(file => file.format === options.format);
      if (exact) return exact.url;
    }

    for (const format of SATORI_SAFE_FORMATS) {
      const src = font.src.find(file => file.format === format);
      if (src) return src.url;
    }

    // Last resort: anything that isn't woff2, which satori would reject.
    const usable = font.src.find(file => file.format !== "woff2");
    if (usable) return usable.url;
  }

  return undefined;
}
