#!/usr/bin/env node
// Serves the repo over http://localhost:8777 (or $CT_PORT) and runs a browser test against it.
//
// The CDP suites (tests/browser-checks.mjs et al.) need a real origin — ES modules and
// fetch() do not work from file:// in Chrome — and every one of them defaults to port 8777.
// Doing it here, in Node, keeps CI from depending on `python3 -m http.server` and guarantees
// the server is actually up before the test starts and torn down after it exits.
//
// Usage: node scripts/serve_and_run.mjs tests/browser-checks.mjs [--args passed through]
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { createReadStream, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("..", import.meta.url));
// CT_PORT moves the server; the test script inherits it through the environment and resolves a
// path-only --url against it (see tests/browser-checks.mjs), so one variable moves both ends.
const PORT = +(process.env.CT_PORT || 8777);
const [script, ...rest] = process.argv.slice(2);
if (!script) {
  console.error("usage: node scripts/serve_and_run.mjs <test-script.mjs> [args...]");
  process.exit(2);
}

// Modules must be served as JavaScript or Chrome refuses them outright; the rest is just
// enough to keep the widget's own fetches honest.
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8",
};

const notFound = (res) => {
  if (!res.headersSent) res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("not found");
};

const server = createServer((req, res) => {
  // Everything that can throw or fail sits inside the try: a malformed %-escape throws from
  // decodeURIComponent, and a directory with no index.html passes statSync but then fails
  // asynchronously in createReadStream. Either used to be an uncaught exception that killed the
  // server — and with it the whole test run — mid-suite. Both are just a 404 now.
  try {
    const rel = normalize(decodeURIComponent(new URL(req.url, "http://localhost").pathname))
      .replace(/^(\.\.[/\\])+/, "");                   // no escaping the repo root
    let file = join(REPO, rel);
    if (statSync(file).isDirectory()) file = join(file, "index.html");
    const type = TYPES[extname(file).toLowerCase()] || "application/octet-stream";
    const stream = createReadStream(file);
    stream.on("open", () => res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" }));
    stream.on("error", () => notFound(res));
    stream.pipe(res);
  } catch {
    notFound(res);
  }
});

await new Promise((r) => server.listen(PORT, "127.0.0.1", r));
const child = spawn(process.execPath, [script, ...rest],
  { stdio: "inherit", cwd: REPO, env: { ...process.env, CT_PORT: String(PORT) } });
const code = await new Promise((r) => child.on("exit", (c, sig) => r(sig ? 1 : c ?? 1)));
server.close();
process.exit(code);
