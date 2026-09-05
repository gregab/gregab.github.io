import {
  defineConfig,
  envField,
  fontProviders,
  svgoOptimizer,
} from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import { unified } from "@astrojs/markdown-remark";
import remarkToc from "remark-toc";
import remarkCollapse from "remark-collapse";
import rehypeCallouts from "rehype-callouts";
import {
  transformerNotationDiff,
  transformerNotationHighlight,
  transformerNotationWordHighlight,
} from "@shikijs/transformers";
import { transformerFileName } from "./src/utils/transformers/fileName";
import config from "./astro-paper.config";

/*
  Fonts are read straight out of the @fontsource packages in devDependencies,
  so a build never reaches the network for a typeface.

  This was `fontProviders.google()`, which fetched metadata and font files from
  Google on every build. That made the build fail closed wherever outbound
  HTTPS is restricted (a sandboxed agent, an offline laptop, a Google Fonts
  outage), and fail *late* — during OG image generation, with an error naming a
  missing font path rather than a missing network. Families, weights and styles
  are unchanged; only the source of the files moved.

  `fontProviders.npm()` looks like the obvious fit and is not: it reads the
  package's CSS off disk but rewrites every font URL to jsdelivr, so it still
  downloads the binaries. Only the local provider stays offline, which is why
  the variants below are spelled out.

  The tradeoff: a typeface is now a pinned dependency. Updating one is
  `npm update @fontsource/<family>`, not a silent change under you.
*/

type Variant = {
  weight: number;
  style: "normal" | "italic";
  unicodeRange: [string];
  src: [string, string];
};

/** Unicode coverage of each fontsource subset, copied from its own CSS. */
const SUBSETS = {
  latin:
    "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD",
  "latin-ext":
    "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF",
} as const;

/**
 * One `@font-face` per weight/style/subset, pointing at the woff2 the browser
 * wants and the woff satori needs — satori renders the OG images and cannot
 * parse woff2 ("Unsupported OpenType signature wOF2").
 */
function fontsourceVariants(
  pkg: string,
  weights: Array<number>,
  styles: Array<"normal" | "italic"> = ["normal"]
) {
  const slug = pkg.replace("@fontsource/", "");
  return weights.flatMap(weight =>
    styles.flatMap(style =>
      Object.entries(SUBSETS).map(([subset, unicodeRange]) => {
        const file = `${pkg}/files/${slug}-${subset}-${weight}-${style}`;
        return {
          weight,
          style,
          unicodeRange: [unicodeRange] as [string],
          src: [`${file}.woff2`, `${file}.woff`] as [string, string],
        };
      })
    )
  ) as [Variant, ...Array<Variant>];
}

const local = fontProviders.local();


export default defineConfig({
  site: config.site.url,
  integrations: [
    mdx(),
    sitemap({
      filter: page =>
        config.features?.showArchives !== false || !page.endsWith("/archives/"),
    }),
  ],
  i18n: {
    locales: ["en"],
    defaultLocale: "en",
    routing: {
      prefixDefaultLocale: false,
    },
  },
  markdown: {
    processor: unified({
      remarkPlugins: [
        remarkToc,
        [remarkCollapse, { test: "Table of contents" }],
      ],
      rehypePlugins: [rehypeCallouts],
    }),
    shikiConfig: {
      themes: { light: "min-light", dark: "night-owl" },
      defaultColor: false,
      wrap: false,
      transformers: [
        transformerFileName({ style: "v2", hideDot: false }),
        transformerNotationHighlight(),
        transformerNotationWordHighlight(),
        transformerNotationDiff({ matchAlgorithm: "v3" }),
      ],
    },
  },
  vite: {
    plugins: [tailwindcss()],
  },
  fonts: [
    // Newsreader carries the reading: headings and body share one family, so the
    // page reads as a single voice rather than a display face bolted onto a body face.
    {
      name: "Newsreader",
      cssVariable: "--font-newsreader",
      provider: local,
      fallbacks: ["Georgia", "Times New Roman", "serif"],
      options: {
        variants: fontsourceVariants(
          "@fontsource/newsreader",
          [400, 500, 600, 700],
          ["normal", "italic"]
        ),
      },
    },
    // Plex Sans is chrome only — nav, dates, tags. Never body copy.
    {
      name: "IBM Plex Sans",
      cssVariable: "--font-plex-sans",
      provider: local,
      fallbacks: ["system-ui", "sans-serif"],
      options: {
        variants: fontsourceVariants("@fontsource/ibm-plex-sans", [400, 500, 600]),
      },
    },
    // Plex Mono for code and the tools list — a sibling of Plex Sans, so the
    // tool-building side of the site is related to the chrome, not foreign to it.
    {
      name: "IBM Plex Mono",
      cssVariable: "--font-plex-mono",
      provider: local,
      fallbacks: ["ui-monospace", "monospace"],
      options: {
        variants: fontsourceVariants("@fontsource/ibm-plex-mono", [400, 500]),
      },
    },
  ],
  env: {
    schema: {
      PUBLIC_GOOGLE_SITE_VERIFICATION: envField.string({
        access: "public",
        context: "client",
        optional: true,
      }),
    },
  },
  experimental: {
    svgOptimizer: svgoOptimizer(),
  },
});
