#!/usr/bin/env node
// Reproduce the drill-in freeze in a HEADED browser on the REAL GPU, and when the page
// stops responding, name the thread(s) actually burning CPU — system-wide, by reading
// /proc/*/task/*/stat deltas (works for Chrome threads, GPU-driver threads and kernel
// threads alike, i.e. below where a DevTools trace can see).
//
// Why this exists: the operator's traces show that during a freeze EVERY Chrome-traced
// thread goes silent (no long task ever completes) while the browser keeps receiving
// mouse input — so the stall is compositor-side, invisible to a DevTools trace. Two
// ingredients the original stress runs lacked:
//   1. the GPU kept ON (the old harness passed --disable-gpu; --headless=new WITHOUT
//      --disable-gpu reproduces fine — headed is NOT required, and headless is immune to
//      the occluded-window/vsync-starvation problem that invalidates headed runs while
//      the operator is using the machine: watch for raf= not advancing, that run is void),
//   2. a continuous mouse-move storm over the map (the operator has a 1000Hz mouse;
//      traces show 400-700 InputLatency::MouseMove per 500ms throughout the spam).
//
// Usage: node tests/freeze-hunt.mjs [--cycles 40] [--port 8777] [--mousehz 250]
//        [--log /tmp/freeze-hunt.log]
// Requires a running display session and `python3 -m http.server <port>` NOT already
// bound (the script serves the repo root itself if the port is free).
import { spawn, execSync } from "node:child_process";
import { readdirSync, readFileSync, appendFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf("--" + k); return i < 0 ? d : argv[i + 1]; };
const CYCLES = +arg("cycles", 40);
const HTTP_PORT = +arg("port", 8777);
const MOUSE_HZ = +arg("mousehz", 250);
const LOG = arg("log", "/tmp/freeze-hunt.log");
const INJECT = arg("inject", ""); // CSS text injected after load, for A/B bisection
const MODE = arg("mode", "full"); // full | nonav (storm only) | nodrill (pick/deselect only)
const PATCH = arg("patch", ""); // JS evaluated after load, for bisection (monkey-patches)
const WINSIZE = arg("winsize", "max"); // "max" or "WxH"
// --emulate WxH: set the VIEWPORT via Emulation.setDeviceMetricsOverride (drives media
// queries — this is how the mobile layout is reached headed, like devtools device toolbar).
// --resize LOWxHIGH:MS: oscillate the emulated viewport width between LOW and HIGH every MS
// (crossing 640 flips the mobile/desktop layouts, like dragging a window edge).
const EMULATE = arg("emulate", "");
const RESIZE = arg("resize", "");
const HEADLESS = argv.includes("--headless"); // new headless, GPU stays ON (no --disable-gpu):
// immune to window-occlusion/vsync starvation from the operator's live session, and the
// compositor-spin freeze lives in cc (renderer CPU), not the display path.
const DBG_PORT = 9333;
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const log = (s) => { const line = `[${new Date().toISOString().slice(11, 23)}] ${s}`; console.log(line); appendFileSync(LOG, line + "\n"); };
writeFileSync(LOG, "");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- system-wide per-thread CPU sampling ----------
function snapshotThreads() {
  const snap = new Map(); // "pid/tid" -> {jiffies, comm, pid}
  for (const pid of readdirSync("/proc")) {
    if (!/^\d+$/.test(pid)) continue;
    let tids;
    try { tids = readdirSync(`/proc/${pid}/task`); } catch { continue; }
    for (const tid of tids) {
      try {
        const st = readFileSync(`/proc/${pid}/task/${tid}/stat`, "utf8");
        const close = st.lastIndexOf(")");
        const comm = st.slice(st.indexOf("(") + 1, close);
        const f = st.slice(close + 2).split(" ");
        const jiffies = +f[11] + +f[12]; // utime + stime
        snap.set(`${pid}/${tid}`, { jiffies, comm, pid: +pid });
      } catch { /* thread exited */ }
    }
  }
  return snap;
}
const HZ = 100; // jiffies/sec (Linux USER_HZ)
function topThreadDeltas(a, b, dtMs, n = 15) {
  const rows = [];
  for (const [key, cur] of b) {
    const prev = a.get(key);
    if (!prev) continue;
    const cpu = ((cur.jiffies - prev.jiffies) / HZ) / (dtMs / 1000) * 100;
    if (cpu > 1) rows.push({ key, comm: cur.comm, cpu });
  }
  rows.sort((x, y) => y.cpu - x.cpu);
  return rows.slice(0, n);
}
function cmdlineOf(pid) {
  try { return readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0").filter(Boolean).slice(0, 3).join(" ").slice(0, 90); }
  catch { return "?"; }
}
function chromeProcType(pid) {
  const c = cmdlineOf(pid);
  const m = c.match(/--type=(\S+)/);
  return c.includes("chrome") ? (m ? `chrome:${m[1]}` : "chrome:browser") : c;
}
function nvidia() {
  try {
    return execSync("nvidia-smi --query-gpu=utilization.gpu,memory.used --format=csv,noheader", { timeout: 4000 }).toString().trim();
  } catch { return "nvidia-smi unavailable/hung"; }
}
async function dumpCulprits(tag) {
  log(`--- ${tag}: sampling system threads (1s window) ---`);
  const a = snapshotThreads(); const t0 = Date.now();
  await sleep(1000);
  const b = snapshotThreads();
  for (const r of topThreadDeltas(a, b, Date.now() - t0)) {
    const info = b.get(r.key);
    log(`   ${r.cpu.toFixed(0).padStart(4)}%  ${r.key.padEnd(15)} comm=${r.comm.padEnd(16)} ${chromeProcType(info.pid)}`);
  }
  log(`   GPU: ${nvidia()}`);
}

// ---------- serve repo + launch headed chrome ----------
let server = null;
try {
  await fetch(`http://127.0.0.1:${HTTP_PORT}/data/manifest.json`);
  log(`using already-running server on :${HTTP_PORT}`);
} catch {
  server = spawn("python3", ["-m", "http.server", String(HTTP_PORT)], { cwd: repoRoot, stdio: "ignore" });
  await sleep(600);
  log(`serving repo root on :${HTTP_PORT}`);
}

const profileDir = `/tmp/freeze-hunt-profile-${Date.now()}`;
const chrome = spawn("google-chrome-stable", [
  `--remote-debugging-port=${DBG_PORT}`,
  `--user-data-dir=${profileDir}`,
  "--no-first-run", "--no-default-browser-check",
  // An occluded window otherwise throttles rAF to zero and the whole run silently measures
  // an idle page (raf=1 forever, GPU 0%) — happens whenever the operator's own windows cover
  // the test window. Keep rendering regardless of visibility/focus.
  "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding",
  "--disable-background-timer-throttling",
  // Wayland gates frame callbacks per-surface, so a covered window gets NO vsync no matter
  // what Chrome flags say. XWayland lets Chrome keep its own frame timing while occluded.
  "--ozone-platform=x11",
  ...(HEADLESS ? ["--headless=new"] : []),
  WINSIZE === "max" ? (HEADLESS ? "--window-size=2560,1340" : "--start-maximized") : `--window-size=${WINSIZE.replace("x", ",")}`,
  `http://localhost:${HTTP_PORT}/tests/visual.html?c=none`,
], { stdio: "ignore" });
log(`launched HEADED chrome pid=${chrome.pid} (real GPU) — a window will appear`);

let ws, id = 0;
const pending = new Map();
const send = (method, params = {}, timeoutMs = 5000) => new Promise((res, rej) => {
  const myId = ++id;
  pending.set(myId, { res, rej });
  ws.send(JSON.stringify({ id: myId, method, params }));
  setTimeout(() => { if (pending.delete(myId)) rej(new Error(`CDP ${method} timed out (${timeoutMs}ms)`)); }, timeoutMs);
});
// fire-and-forget sends are NOT tracked in `pending` (responses with unknown ids are ignored);
// tracking them at 500Hz both leaks and, with a shared counter, lets a timeout delete the wrong entry
const fireAndForget = (method, params = {}) => { const myId = ++id; try { ws.send(JSON.stringify({ id: myId, method, params })); } catch {} };
const evalIn = async (expr, timeoutMs = 3000) => {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true }, timeoutMs);
  return r.result && r.result.value;
};

let frozeOnce = false;
try {
  let tab;
  for (let i = 0; i < 80; i++) {
    try {
      const tabs = await (await fetch(`http://127.0.0.1:${DBG_PORT}/json/list`)).json();
      tab = tabs.find((t) => t.url.includes("visual.html"));
      if (tab) break;
    } catch {}
    await sleep(150);
  }
  if (!tab) throw new Error("could not find the visual.html tab over CDP");
  ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    const p = pending.get(m.id);
    if (p) { pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
  };
  await send("Runtime.enable");
  // An occluded/unfocused window throttles rAF to zero and paints nothing — the whole run
  // silently measures an idle page (seen live: raf=1 forever, GPU 0%). Force visibility.
  await send("Page.enable");
  await send("Page.bringToFront").catch(() => {});
  if (EMULATE) {
    const [ew, eh] = EMULATE.split("x").map(Number);
    await send("Emulation.setDeviceMetricsOverride", { width: ew, height: eh, deviceScaleFactor: 1, mobile: false });
    log(`emulating ${ew}x${eh} viewport`);
  }
  await sleep(3000); // let data + geometry load

  await evalIn(`window.__t = {
    click: (sel) => { const n = document.querySelector(sel); if (n) n.dispatchEvent(new MouseEvent("click", {bubbles:true})); return !!n; },
    pick: (cid) => window.__t.click('.ctt-selector-item[data-court-id="' + cid + '"]'),
    drill: () => window.__t.click('.ctt-drill'),
    back: () => window.__t.click('.ctt-selector-back'),
  };
  window.__rafN = 0; (function loop(){ window.__rafN++; requestAnimationFrame(loop); })(); 1`);

  if (INJECT) {
    await evalIn(`(() => { const s = document.createElement("style"); s.textContent = ${JSON.stringify(INJECT)}; document.head.appendChild(s); return "injected"; })()`);
    log(`injected CSS override: ${INJECT}`);
  }
  if (PATCH) {
    log(`applying JS patch: ${PATCH.slice(0, 120)}...`);
    log(`patch result: ${await evalIn(PATCH)}`);
  }

  // map viewport rect in window coords, for the mouse storm
  const rect = await evalIn(`JSON.stringify((() => { const r = document.querySelector('.ctt-map-viewport').getBoundingClientRect(); return {x:r.x, y:r.y, w:r.width, h:r.height}; })())`);
  const R = JSON.parse(rect);
  log(`map rect: ${rect}`);

  // optional viewport-width oscillation (crosses the 640px mobile breakpoint)
  let resizing = false;
  if (RESIZE) {
    const m = /^(\d+)x(\d+):(\d+)$/.exec(RESIZE);
    if (!m) throw new Error("--resize wants LOWxHIGH:MS, e.g. 380x760:250");
    const [, lo, hi, ms] = m.map(Number);
    const eh = EMULATE ? +EMULATE.split("x")[1] : 760;
    resizing = true;
    (async () => {
      let up = false;
      while (resizing) {
        up = !up;
        fireAndForget("Emulation.setDeviceMetricsOverride",
          { width: up ? hi : lo, height: eh, deviceScaleFactor: 1, mobile: false });
        await sleep(ms);
      }
    })();
    log(`oscillating viewport width ${lo}<->${hi} every ${ms}ms`);
  }

  // continuous mouse-move storm over the map (real input pipeline via CDP)
  let storming = MOUSE_HZ > 0; let phase = 0;
  (async () => {
    while (storming) {
      phase += 0.09;
      const x = R.x + R.w * (0.5 + 0.45 * Math.sin(phase));
      const y = R.y + R.h * (0.5 + 0.40 * Math.sin(phase * 1.31));
      fireAndForget("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
      await sleep(1000 / MOUSE_HZ);
    }
  })();

  // watchdog: rAF progression + evaluate round-trip
  let lastRaf = 0; let frozenSince = 0;
  const probe = async () => {
    const t0 = Date.now();
    const raf = await evalIn(`window.__rafN`, 3000);
    return { latency: Date.now() - t0, raf };
  };

  const circuits = ["ca8", "ca9", "ca1", "ca5", "ca2", "ca11"];
  log(`spamming ${CYCLES} drill/back cycles with ${MOUSE_HZ}Hz mouse storm...`);
  for (let i = 0; i < CYCLES; i++) {
    const c = circuits[i % circuits.length];
    const mode = i % 3;
    const waitIn = mode === 0 ? 1200 : mode === 1 ? 300 : 40;
    try {
      if (MODE === "nonav") { await sleep(1500); }
      else if (MODE === "nodrill") {
        await evalIn(`window.__t.pick("${c}")`); await sleep(400);
        await evalIn(`window.__t.click('.ctt-map-viewport')`); await sleep(300);
      } else {
        await evalIn(`window.__t.pick("${c}")`); await sleep(200);
        await evalIn(`window.__t.drill()`); await sleep(waitIn);
        await evalIn(`window.__t.back()`); await sleep(mode === 0 ? 1200 : 140);
      }
      const p = await probe();
      const stalled = p.raf === lastRaf;
      lastRaf = p.raf;
      log(`cycle ${String(i).padStart(3)} ${c.padEnd(5)} eval=${String(p.latency).padStart(4)}ms raf=${p.raf}${stalled ? " RAF-STALLED" : ""}  GPU[${nvidia()}]`);
      if (stalled || p.latency > 1500) { frozeOnce = true; await dumpCulprits(`slow/stalled at cycle ${i}`); }
    } catch (e) {
      frozeOnce = true;
      log(`*** UNRESPONSIVE at cycle ${i} (${e.message}) — page is frozen. Naming the culprit:`);
      for (let k = 0; k < 4; k++) await dumpCulprits(`freeze sample ${k}`);
      // wait for recovery so we can log how long the freeze lasted
      const tf = Date.now();
      let recovered = false;
      for (;;) {
        try { await evalIn(`1`, 2000); log(`recovered after ${((Date.now() - tf) / 1000).toFixed(1)}s frozen`); recovered = true; break; }
        catch { if (Date.now() - tf > 45000) { log("no recovery after 45s — hard freeze; ending run"); break; } await sleep(1000); }
      }
      if (!recovered) break;
    }
  }
  storming = false;
  resizing = false;
  log(frozeOnce ? "DONE — freeze(s) reproduced, culprit samples above" : "DONE — no freeze reproduced this run");
} catch (e) {
  log(`fatal: ${e.stack || e}`);
  process.exitCode = 1;
} finally {
  try { ws && ws.close(); } catch {}
  chrome.kill();
  if (server) server.kill();
  log(`log saved to ${LOG}`);
}
