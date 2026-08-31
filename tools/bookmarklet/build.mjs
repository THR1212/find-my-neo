/**
 * Turns source.js into the `javascript:` URL you drag to the bookmarks bar.
 *
 *   node tools/bookmarklet/build.mjs
 *
 * Deliberately dependency-free — this is a demo aid and should never be a reason to install a
 * minifier. The "minification" below is conservative on purpose: it strips comments and
 * collapses whitespace, and does nothing clever that could silently break the script.
 *
 * Writes bookmarklet.txt next to this file (gitignored — it embeds the share token).
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "source.js"), "utf8");

const min = src
  // Block comments. Safe here: the source contains no regex literals or division that could
  // be confused for one, and no `/*` inside strings.
  .replace(/\/\*[\s\S]*?\*\//g, "")
  // Line comments, but not inside a URL ("https://…").
  .replace(/(^|[^:])\/\/.*$/gm, "$1")
  .split("\n")
  .map((l) => l.trim())
  .filter(Boolean)
  .join(" ")
  .replace(/\s{2,}/g, " ")
  .replace(/\s*([{}();,:])\s*/g, "$1");

const url = "javascript:" + encodeURIComponent(min);

writeFileSync(join(here, "bookmarklet.txt"), url + "\n", "utf8");

console.log(`source     ${src.length} bytes`);
console.log(`minified   ${min.length} bytes`);
console.log(`bookmarklet ${url.length} bytes  -> tools/bookmarklet/bookmarklet.txt`);
if (url.length > 60000) {
  console.warn("WARNING: some browsers cap bookmark URLs around 64KB.");
}
