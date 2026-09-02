#!/usr/bin/env node
// Capture a CDP screencast around shape-hover on/off to characterize the border-line
// "flicker/tremble" the operator reported after the freeze fix. Saves every presented frame
// (PNG + metadata timestamps + the exact times hover was toggled) for offline pixel analysis.
//
// Usage: node tests/flicker-check.mjs [--out DIR] [--cycles 4] [--inject CSS] [--court ca8]
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf("--" + k); return i < 0 ? d : argv[i + 1]; };
const OUT = arg("out", "/tmp/flicker-frames");
const CYCLES = +arg("cycles", 4);
const INJECT = arg("inject", "");
const COURT = arg("court", "ca8");
const PAGE = arg("page", "tests/visual.html?c=none");
const HTTP_PORT = 8777;
const DBG_PORT = 9335;
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const log = (s) => console.log(`[${new Date().toISOString().slice(11, 23)}] ${s}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });

let server = null;
try { await fetch(`http://127.0.0.1:${HTTP_PORT}/data/manifest.json`); }
catch { server = spawn("python3", ["-m", "http.server", String(HTTP_PORT)], { cwd: repoRoot, stdio: "ignore" }); await sleep(600); }

const chrome = spawn("google-chrome-stable", [
  `--remote-debugging-port=${DBG_PORT}`,
  `--user-data-dir=/tmp/flicker-profile-${Date.now()}`,
  "--no-first-run", "--no-default-browser-check", "--window-size=1280,900",
  `http://localhost:${HTTP_PORT}/${PAGE}`,
], { stdio: "ignore" });

let ws, id = 0;
const pending = new Map();
const send = (method, params = {}, timeoutMs = 8000) => new Promise((res, rej) => {
  const myId = ++id;
  pending.set(myId, { res, rej });
  ws.send(JSON.stringify({ id: myId, method, params }));
  setTimeout(() => { if (pending.delete(myId)) rej(new Error(`CDP ${method} timed out`)); }, timeoutMs);
});
const evalIn = async (expr, t = 4000) => (await send("Runtime.evaluate", { expression: expr, returnByValue: true }, t)).result?.value;

const frames = []; // {i, tsMono, file}
const marks = [];  // {tsMono, what}
const mono = () => performance.now();

try {
  let tab;
  for (let i = 0; i < 80; i++) {
    try { tab = (await (await fetch(`http://127.0.0.1:${DBG_PORT}/json/list`)).json()).find((t) => t.url.includes("visual.html")); if (tab) break; } catch {}
    await sleep(150);
  }
  ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.method === "Page.screencastFrame") {
      const i = frames.length;
      const file = join(OUT, `f${String(i).padStart(4, "0")}.png`);
      writeFileSync(file, Buffer.from(m.params.data, "base64"));
      frames.push({ i, tsMono: mono(), file, metaTs: m.params.metadata?.timestamp });
      send("Page.screencastFrameAck", { sessionId: m.params.sessionId }).catch(() => {});
      return;
    }
    const p = pending.get(m.id);
    if (p) { pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
  };
  await send("Runtime.enable");
  await send("Page.enable");
  await sleep(3500);

  if (INJECT) {
    await evalIn(`(() => { const s = document.createElement("style"); s.textContent = ${JSON.stringify(INJECT)}; document.head.appendChild(s); return "ok"; })()`);
    log(`injected: ${INJECT}`);
  }

  const R = JSON.parse(await evalIn(`JSON.stringify((() => {
    const shp = [...document.querySelectorAll('path[data-court-id="${COURT}"]')]
      .map((p) => p.getBoundingClientRect()).find((r) => r.width > 0);
    const map = document.querySelector('.ctt-map-viewport').getBoundingClientRect();
    return { sx: shp.x + shp.width/2, sy: shp.y + shp.height/2,
             nx: map.x + map.width - 30, ny: map.y + map.height - 30,
             map: {x: map.x, y: map.y, w: map.width, h: map.height} };
  })())`));
  log(`hover point (${COURT} centre): ${R.sx.toFixed(0)},${R.sy.toFixed(0)}; neutral: ${R.nx.toFixed(0)},${R.ny.toFixed(0)}`);
  writeFileSync(join(OUT, "geom.json"), JSON.stringify(R));

  // park the mouse at neutral first
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: R.nx, y: R.ny });
  await sleep(800);

  await send("Page.startScreencast", { format: "png", everyNthFrame: 1, maxWidth: 1280, maxHeight: 900 });
  await sleep(700); // settled baseline frames

  for (let c = 0; c < CYCLES; c++) {
    marks.push({ tsMono: mono(), what: "hover-on" });
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: R.sx, y: R.sy });
    await sleep(800);
    marks.push({ tsMono: mono(), what: "hover-off" });
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: R.nx, y: R.ny });
    await sleep(800);
  }
  await sleep(400);
  await send("Page.stopScreencast");
  writeFileSync(join(OUT, "frames.json"), JSON.stringify({ frames, marks }, null, 1));
  log(`captured ${frames.length} frames over ${CYCLES} hover cycles -> ${OUT}`);
} catch (e) {
  log(`fatal: ${e.stack || e}`);
  process.exitCode = 1;
} finally {
  try { ws && ws.close(); } catch {}
  chrome.kill();
  if (server) server.kill();
}
