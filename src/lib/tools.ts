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

const toolsDir = fileURLToPath(new URL("../../public/tools/", import.meta.url));

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
  if (!fs.existsSync(toolsDir)) return [];

  const files = fs
    .readdirSync(toolsDir)
    .filter((f) => f.toLowerCase().endsWith(".html"))
    .sort();

  const tools = files.map((file) => {
    const html = fs.readFileSync(path.join(toolsDir, file), "utf8");
    const title = extractTitle(html) || titleCaseFromFilename(file);
    const description = extractDescription(html) || "";
    return { file, title, description, href: `/tools/${file}` };
  });

  tools.sort((a, b) => a.title.localeCompare(b.title));

  return tools;
}
