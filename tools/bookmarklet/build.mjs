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
 *
 * The token comes from the environment, not from source.js:
 *
 *   VERCEL_SHARE_TOKEN=... node tools/bookmarklet/build.mjs
 *
 * It was a literal in source.js until 03 Sep. source.js is TRACKED, so that put the token in
 * the repo no matter what .gitignore did about the generated file — the ignore rule read as
 * protection while protecting nothing. Anything secret has to be absent from tracked source,
 * not merely absent from generated output.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "source.js"), "utf8");

/* The deployment is PUBLIC, so no share token is needed — Hari confirmed 03 Sep. Set
   VERCEL_SHARE_TOKEN only if Deployment Protection is ever turned back on; without it the
   bookmarklet just opens the plain URL. Either way the token never lives in tracked source:
   it was a literal in source.js until 03 Sep, which put it in the repo whatever .gitignore
   said about the generated file. */
const token = process.env.VERCEL_SHARE_TOKEN ?? "";

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

/* After minifying, so the token cannot be mangled by the comment/whitespace passes. */
const withToken = min.replace("__SHARE_TOKEN__", token);
if (withToken === min) {
  console.error("__SHARE_TOKEN__ placeholder not found in source.js — nothing was substituted.");
  process.exit(1);
}
console.log(token ? "share token embedded" : "no share token (public deployment)");

const url = "javascript:" + encodeURIComponent(withToken);

writeFileSync(join(here, "bookmarklet.txt"), url + "\n", "utf8");

console.log(`source     ${src.length} bytes`);
console.log(`minified   ${withToken.length} bytes`);
console.log(`bookmarklet ${url.length} bytes  -> tools/bookmarklet/bookmarklet.txt`);
if (url.length > 60000) {
  console.warn("WARNING: some browsers cap bookmark URLs around 64KB.");
}
