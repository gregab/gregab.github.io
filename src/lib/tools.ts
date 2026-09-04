// Auto-discovers standalone tool pages dropped into public/tools/*.html.
// Mirrors the behavior of the old scripts/build-index.js: read each file's
// <title> and <meta name="description">, falling back to a title-cased
// filename and an empty description when either is missing. No manifest
// file to keep in sync — this runs at build (and dev) time.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface ToolEntry {
  file: string;
  title: string;
  description: string;
  href: string;
}

/*
  Resolve public/tools/ from the project root. import.meta.url alone is not
  enough: it points at the real source file in `astro dev`, but at a bundled
  chunk during `astro build`, which silently yielded an empty tool list. Astro
  runs with cwd at the project root in both modes, so that is the primary
  lookup, with the module-relative path kept as a fallback.
*/
function resolveToolsDir(): string | null {
  const candidates = [
    path.join(process.cwd(), "public", "tools"),
    fileURLToPath(new URL("../../public/tools/", import.meta.url)),
  ];
  return candidates.find(dir => fs.existsSync(dir)) ?? null;
}

function extractTitle(html: string): string | null {
  const m = html.match(/<title>([^<]*)<\/title>/i);
  return m ? m[1].trim() : null;
}

function extractDescription(html: string): string | null {
  const m = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i);
  return m ? m[1].trim() : null;
}

function titleCaseFromFilename(file: string): string {
  return path
    .basename(file, ".html")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function getTools(): ToolEntry[] {
  const toolsDir = resolveToolsDir();
  if (!toolsDir) return [];

  const files = fs
    .readdirSync(toolsDir)
    .filter((f) => f.toLowerCase().endsWith(".html"))
    .sort();

  const tools = files.flatMap((file) => {
    const html = fs.readFileSync(path.join(toolsDir, file), "utf8");

    // Redirect stubs left behind by renamed tools are not tools themselves.
    if (/http-equiv=["']refresh["']/i.test(html)) return [];

    const title = extractTitle(html) || titleCaseFromFilename(file);
    const description = extractDescription(html) || "";
    return { file, title, description, href: `/tools/${file}` };
  });

  tools.sort((a, b) => a.title.localeCompare(b.title));

  return tools;
}
