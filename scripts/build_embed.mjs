#!/usr/bin/env node
// Minified production build of the two embeddable widgets.
//
// The widgets have ZERO runtime dependencies and ship as plain ES modules, so this is not a
// bundler in the usual sense — it inlines the one shared local module (presidencies.js) and
// minifies. `embed/` stays the readable, heavily-commented source of truth; `dist/` is the
// byte-conscious copy a publisher points at in production.
//
// dist/ sits one directory below the repo root ON PURPOSE: both widgets resolve their assets
// as `new URL("../", import.meta.url)`, so dist/court-tracker.min.js and
// embed/court-tracker.js resolve data/, assets/geo/ and assets/photos/ to the same place.
// Moving dist/ deeper (or shallower) silently breaks every fetch.
//
// Usage: npm run build   (then `npm run test:dist` to run the smoke suite against the output)
import { build } from "esbuild";
import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("..", import.meta.url));
const DIST = REPO + "dist";
// Build into a sibling temp dir and swap it in only once everything succeeded: a build that
// fails halfway (a syntax error in embed/) must leave the committed dist/ exactly as it was, not
// deleted — `git add -A` would otherwise stage the removal of all four files.
const OUT = REPO + "dist.tmp-" + process.pid;
const JS = ["court-tracker", "appointments-chart"];
const CSS = ["court-tracker", "appointments-chart"];

const banner = (name, ext) =>
  `/*! ${name}.min.${ext} — generated from embed/${name}.${ext} by \`npm run build\`. Do not edit; edit the source. */`;

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
process.on("exit", () => rmSync(OUT, { recursive: true, force: true }));   // never leave the temp dir behind

await build({
  entryPoints: JS.map((n) => `${REPO}embed/${n}.js`),
  outdir: OUT,
  entryNames: "[name].min",
  bundle: true,          // inlines ./presidencies.js; there is nothing else to resolve
  format: "esm",         // keeps import.meta.url, which the asset resolution depends on
  target: "es2020",
  minify: true,
  legalComments: "none",
});
// esbuild's banner option is per-build, not per-entry, so each file gets its own header here.
for (const n of JS) stamp(`${OUT}/${n}.min.js`, banner(n, "js"));

await build({
  entryPoints: CSS.map((n) => `${REPO}embed/${n}.css`),
  outdir: OUT,
  entryNames: "[name].min",
  minify: true,
  legalComments: "none",
});
for (const n of CSS) stamp(`${OUT}/${n}.min.css`, banner(n, "css"));

// Both builds succeeded — now, and only now, replace the real dist/.
rmSync(DIST, { recursive: true, force: true });
renameSync(OUT, DIST);

function stamp(file, header) {
  writeFileSync(file, `${header}\n${readFileSync(file, "utf8")}`);
}

const kb = (f) => (statSync(f).size / 1024).toFixed(1) + " KB";
console.log("dist/");
for (const f of readdirSync(DIST).sort()) {
  const src = REPO + "embed/" + f.replace(".min", "");
  let line = `  ${f.padEnd(28)} ${kb(DIST + "/" + f).padStart(9)}`;
  try { line += `   (from ${kb(src)})`; } catch {}
  console.log(line);
}
