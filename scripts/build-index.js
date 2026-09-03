#!/usr/bin/env node
// Scans tools/*.html and writes tools.json, the manifest index.html reads
// to render the tool list. Run automatically by .github/workflows/build-tools-index.yml
// on every push that touches tools/ — no manual step needed when adding a tool.

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const toolsDir = path.join(root, 'tools');
const outFile = path.join(root, 'tools.json');

function extract(html, tag, attr) {
  if (tag === 'title') {
    const m = html.match(/<title>([^<]*)<\/title>/i);
    return m ? m[1].trim() : null;
  }
  if (tag === 'meta') {
    const m = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i);
    return m ? m[1].trim() : null;
  }
  return null;
}

function titleCaseFromFilename(file) {
  return path.basename(file, '.html')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

if (!fs.existsSync(toolsDir)) {
  fs.writeFileSync(outFile, JSON.stringify({ generated: new Date().toISOString(), tools: [] }, null, 2) + '\n');
  process.exit(0);
}

const files = fs.readdirSync(toolsDir).filter((f) => f.toLowerCase().endsWith('.html')).sort();

const tools = files.map((file) => {
  const html = fs.readFileSync(path.join(toolsDir, file), 'utf8');
  const title = extract(html, 'title') || titleCaseFromFilename(file);
  const description = extract(html, 'meta') || '';
  return { file, title, description };
});

tools.sort((a, b) => a.title.localeCompare(b.title));

const manifest = { generated: new Date().toISOString(), tools };
fs.writeFileSync(outFile, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Wrote ${outFile} with ${tools.length} tool(s).`);
