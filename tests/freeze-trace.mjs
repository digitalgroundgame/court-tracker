#!/usr/bin/env node
// Capture a Chrome trace (with cc/input/scheduler debug categories) across a RECOVERABLE
// compositor freeze, so the never-ending impl-thread task completes inside the capture and
// its nested events name the exact cc code path that spins.
// Uses the small-window config (brief ~4s freezes) — a hard freeze would never flush events.
//
// Usage: node tests/freeze-trace.mjs [--cycles 12] [--out /tmp/freeze-cc-trace.json]
import { spawn } from "node:child_process";
import { createWriteStream, appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf("--" + k); return i < 0 ? d : argv[i + 1]; };
const CYCLES = +arg("cycles", 12);
const OUT = arg("out", "/tmp/freeze-cc-trace.json");
const HTTP_PORT = 8777;
const DBG_PORT = 9334;
const MOUSE_HZ = 500;
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const log = (s) => { const l = `[${new Date().toISOString().slice(11, 23)}] ${s}`; console.log(l); appendFileSync("/tmp/freeze-trace.log", l + "\n"); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let server = null;
try { await fetch(`http://127.0.0.1:${HTTP_PORT}/data/manifest.json`); }
catch { server = spawn("python3", ["-m", "http.server", String(HTTP_PORT)], { cwd: repoRoot, stdio: "ignore" }); await sleep(600); }

const chrome = spawn("google-chrome-stable", [
  `--remote-debugging-port=${DBG_PORT}`,
  `--user-data-dir=/tmp/freeze-trace-profile-${Date.now()}`,
  "--no-first-run", "--no-default-browser-check", "--window-size=1180,800",
  `http://localhost:${HTTP_PORT}/tests/visual.html?c=none`,
], { stdio: "ignore" });
log(`launched chrome pid=${chrome.pid}`);

let ws, id = 0;
const pending = new Map();
const events = [];
let streamHandle = null;
const send = (method, params = {}, timeoutMs = 8000) => new Promise((res, rej) => {
  const myId = ++id;
  pending.set(myId, { res, rej });
  ws.send(JSON.stringify({ id: myId, method, params }));
  setTimeout(() => { if (pending.delete(myId)) rej(new Error(`CDP ${method} timed out`)); }, timeoutMs);
});
// see freeze-hunt.mjs: fire-and-forget must not share the pending map
const fireAndForget = (method, params = {}) => { const myId = ++id; try { ws.send(JSON.stringify({ id: myId, method, params })); } catch {} };
const evalIn = async (expr, timeoutMs = 3000) => (await send("Runtime.evaluate", { expression: expr, returnByValue: true }, timeoutMs)).result?.value;

try {
  let tab;
  for (let i = 0; i < 80; i++) {
    try { tab = (await (await fetch(`http://127.0.0.1:${DBG_PORT}/json/list`)).json()).find((t) => t.url.includes("visual.html")); if (tab) break; } catch {}
    await sleep(150);
  }
  ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  const tracingComplete = { done: false, stream: null };
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.method === "Tracing.tracingComplete") { tracingComplete.done = true; tracingComplete.stream = m.params.stream; return; }
    const p = pending.get(m.id);
    if (p) { pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
  };
  await send("Runtime.enable");
  await sleep(3000);

  await evalIn(`window.__t = {
    click: (sel) => { const n = document.querySelector(sel); if (n) n.dispatchEvent(new MouseEvent("click", {bubbles:true})); return !!n; },
    pick: (cid) => window.__t.click('.ctt-selector-item[data-court-id="' + cid + '"]'),
    drill: () => window.__t.click('.ctt-drill'),
    back: () => window.__t.click('.ctt-selector-back'),
  }; 1`);
  const R = JSON.parse(await evalIn(`JSON.stringify((() => { const r = document.querySelector('.ctt-map-viewport').getBoundingClientRect(); return {x:r.x, y:r.y, w:r.width, h:r.height}; })())`));

  await send("Tracing.start", {
    transferMode: "ReturnAsStream",
    streamFormat: "json",
    traceConfig: {
      recordMode: "recordUntilFull",
      traceBufferSizeInKb: 400000,
      includedCategories: [
        "toplevel", "cc", "input", "latencyInfo", "disabled-by-default-cc.debug",
        "disabled-by-default-cc.debug.scheduler",
        "renderer.scheduler", "sequence_manager",
      ],
    },
  });
  log("tracing started");

  let storming = true; let phase = 0;
  (async () => {
    while (storming) {
      phase += 0.09;
      fireAndForget("Input.dispatchMouseEvent", { type: "mouseMoved",
        x: R.x + R.w * (0.5 + 0.45 * Math.sin(phase)), y: R.y + R.h * (0.5 + 0.40 * Math.sin(phase * 1.31)) });
      await sleep(1000 / MOUSE_HZ);
    }
  })();

  const circuits = ["ca8", "ca9", "ca1", "ca5", "ca2", "ca11"];
  let froze = false;
  for (let i = 0; i < CYCLES && !froze; i++) {
    const c = circuits[i % circuits.length];
    const mode = i % 3;
    try {
      await evalIn(`window.__t.pick("${c}")`); await sleep(200);
      await evalIn(`window.__t.drill()`); await sleep(mode === 0 ? 1200 : mode === 1 ? 300 : 40);
      await evalIn(`window.__t.back()`); await sleep(mode === 0 ? 1200 : 140);
      const t0 = Date.now(); await evalIn(`1`);
      log(`cycle ${i} ${c} eval=${Date.now() - t0}ms`);
    } catch {
      log(`cycle ${i} ${c}: FROZEN — waiting for recovery so the stuck task lands in the trace...`);
      froze = true;
      const tf = Date.now();
      for (;;) {
        try { await evalIn(`1`, 2000); log(`recovered after ${((Date.now() - tf) / 1000).toFixed(1)}s`); break; }
        catch { if (Date.now() - tf > 90000) { log("no recovery in 90s (hard freeze — trace may lack the task)"); break; } await sleep(500); }
      }
      await sleep(800); // let the giant task's event flush
    }
  }
  storming = false;

  log("stopping trace...");
  await send("Tracing.end", {}, 60000);
  for (let i = 0; i < 1200 && !tracingComplete.done; i++) await sleep(100);
  if (!tracingComplete.stream) throw new Error("no trace stream returned");
  const out = createWriteStream(OUT);
  for (;;) {
    const chunk = await send("IO.read", { handle: tracingComplete.stream, size: 1 << 20 }, 30000);
    out.write(chunk.base64Encoded ? Buffer.from(chunk.data, "base64") : chunk.data);
    if (chunk.eof) break;
  }
  out.end();
  await send("IO.close", { handle: tracingComplete.stream }).catch(() => {});
  log(`trace written to ${OUT}${froze ? "" : " (WARNING: no freeze occurred this run)"}`);
} catch (e) {
  log(`fatal: ${e.stack || e}`);
  process.exitCode = 1;
} finally {
  try { ws && ws.close(); } catch {}
  chrome.kill();
  if (server) server.kill();
}
