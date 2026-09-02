#!/usr/bin/env node
// Instrument the GPU-memory ratchet (~10MiB per drill/back cycle observed via nvidia-smi,
// never released within a session). Takes Chrome memory-infra dumps — which name every
// GPU-side allocator (cc tile memory, skia gpu cache, shared images, transfer buffers,
// image decode cache...) — at defined protocol points: baseline, after N cycles, after
// idle, and with the tab backgrounded (Chrome's biggest purge trigger). Also records
// nvidia-smi alongside, so Chrome's own accounting can be compared with the driver's.
//
// Usage: node tests/gpu-ratchet.mjs [--out /tmp/gpu-ratchet-trace.json]
import { spawn, execSync } from "node:child_process";
import { createWriteStream, appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf("--" + k); return i < 0 ? d : argv[i + 1]; };
const OUT = arg("out", "/tmp/gpu-ratchet-trace.json");
const HTTP_PORT = 8777;
const DBG_PORT = 9336;
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const log = (s) => { const l = `[${new Date().toISOString().slice(11, 23)}] ${s}`; console.log(l); appendFileSync("/tmp/gpu-ratchet.log", l + "\n"); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nvidia = () => { try { return execSync("nvidia-smi --query-gpu=memory.used --format=csv,noheader", { timeout: 4000 }).toString().trim(); } catch { return "?"; } };

let server = null;
try { await fetch(`http://127.0.0.1:${HTTP_PORT}/data/manifest.json`); }
catch { server = spawn("python3", ["-m", "http.server", String(HTTP_PORT)], { cwd: repoRoot, stdio: "ignore" }); await sleep(600); }

const chrome = spawn("google-chrome-stable", [
  `--remote-debugging-port=${DBG_PORT}`,
  `--user-data-dir=/tmp/gpu-ratchet-profile-${Date.now()}`,
  "--no-first-run", "--no-default-browser-check", "--window-size=1280,900",
  `http://localhost:${HTTP_PORT}/tests/visual.html?c=none`,
], { stdio: "ignore" });

let ws, id = 0;
const pending = new Map();
const send = (method, params = {}, timeoutMs = 15000) => new Promise((res, rej) => {
  const myId = ++id;
  pending.set(myId, { res, rej });
  ws.send(JSON.stringify({ id: myId, method, params }));
  setTimeout(() => { if (pending.delete(myId)) rej(new Error(`CDP ${method} timed out`)); }, timeoutMs);
});
const evalIn = async (expr, t = 5000) => (await send("Runtime.evaluate", { expression: expr, returnByValue: true }, t)).result?.value;

const dumpPoints = []; // {label, guid, nvidia}

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
  await sleep(3500);

  await evalIn(`window.__t = {
    click: (sel) => { const n = document.querySelector(sel); if (n) n.dispatchEvent(new MouseEvent("click", {bubbles:true})); return !!n; },
    pick: (cid) => window.__t.click('.ctt-selector-item[data-court-id="' + cid + '"]'),
    drill: () => window.__t.click('.ctt-drill'),
    back: () => window.__t.click('.ctt-selector-back'),
  }; 1`);

  await send("Tracing.start", {
    transferMode: "ReturnAsStream",
    streamFormat: "json",
    traceConfig: {
      recordMode: "recordUntilFull",
      traceBufferSizeInKb: 700000,
      includedCategories: ["disabled-by-default-memory-infra"],
      memoryDumpConfig: { triggers: [] },  // explicit dumps only
    },
  });
  await sleep(500);

  const dump = async (label) => {
    const nv = nvidia();
    const r = await send("Tracing.requestMemoryDump", { deterministic: false, levelOfDetail: "detailed" }, 20000);
    dumpPoints.push({ label, guid: r.dumpGuid, success: r.success, nvidia: nv });
    log(`dump [${label}] success=${r.success} nvidia=${nv}`);
  };

  const circuits = ["ca8", "ca9", "ca1", "ca5", "ca2", "ca11"];
  const cycle = async (i) => {
    const c = circuits[i % circuits.length];
    await evalIn(`window.__t.pick("${c}")`); await sleep(250);
    await evalIn(`window.__t.drill()`); await sleep(1100);
    await evalIn(`window.__t.back()`); await sleep(1100);
  };

  await dump("baseline");

  for (let i = 0; i < 10; i++) await cycle(i);
  await dump("after-10-cycles");
  for (let i = 10; i < 20; i++) await cycle(i);
  await dump("after-20-cycles");

  log("idling 75s...");
  await sleep(30000); await dump("idle-30s");
  await sleep(45000); await dump("idle-75s");

  log("backgrounding the tab (about:blank foreground)...");
  await send("Target.createTarget", { url: "about:blank" });
  await sleep(15000);
  await dump("tab-hidden-15s");
  await send("Target.activateTarget", { targetId: tab.id });
  await sleep(3000);
  await dump("tab-reshown");

  await send("Tracing.end", {}, 60000);
  for (let i = 0; i < 1200 && !tracingComplete.done; i++) await sleep(100);
  if (!tracingComplete.stream) throw new Error("no trace stream");
  const out = createWriteStream(OUT);
  for (;;) {
    const chunk = await send("IO.read", { handle: tracingComplete.stream, size: 1 << 20 }, 30000);
    out.write(chunk.base64Encoded ? Buffer.from(chunk.data, "base64") : chunk.data);
    if (chunk.eof) break;
  }
  out.end();
  appendFileSync(OUT + ".points.json", JSON.stringify(dumpPoints, null, 1));
  log(`trace -> ${OUT}; ${dumpPoints.length} dump points -> ${OUT}.points.json`);
} catch (e) {
  log(`fatal: ${e.stack || e}`);
  process.exitCode = 1;
} finally {
  try { ws && ws.close(); } catch {}
  chrome.kill();
  if (server) server.kill();
}
