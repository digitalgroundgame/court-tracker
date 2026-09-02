#!/usr/bin/env node
// Real-time screenshot driver for tests/visual.html.
//
// Chrome's --virtual-time-budget fires requestAnimationFrame exactly ONCE, so an rAF-driven
// animation (the vertex morph) can't be observed that way — you get one frame and a stall.
// This drives Chrome over the DevTools Protocol on the real clock instead, which is the only
// way to see the morph actually run and to catch a bad handoff at the end of it.
//
// Node's global WebSocket does the CDP transport, so this needs no dependency beyond Chrome.
//
// Usage:
//   node tests/shoot.mjs --url "http://localhost:8777/tests/visual.html?c=ca8&drill=1" \
//        --out /tmp/shot.png [--at 1200] [--size 1180x760] [--probe "js expression"]
//   --at may repeat: `--at 200 --at 600` writes out-200.png, out-600.png (ms after load).

import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf("--" + k); return i < 0 ? d : argv[i + 1]; };
const all = (k) => argv.reduce((a, v, i) => (v === "--" + k ? [...a, argv[i + 1]] : a), []);

const url = arg("url");
const out = arg("out", "/tmp/shot.png");
const size = arg("size", "1180x760");
const probe = arg("probe");
const reduced = argv.includes("--reduced");
const dpr = +arg("dpr", 1);      // device pixel ratio: render at N x for sub-pixel measurement
const ats = all("at").map(Number).sort((a, b) => a - b);
const shots = ats.length ? ats : [Number(arg("at", 1500))];
const [W, H] = size.split("x").map(Number);
const PORT = 9333 + (process.pid % 500);

const chrome = spawn("google-chrome-stable", [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
  `--remote-debugging-port=${PORT}`, `--window-size=${W},${H}`, "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jget = async (p) => (await fetch(`http://127.0.0.1:${PORT}${p}`)).json();

let ws, id = 0;
const pending = new Map();
const send = (method, params = {}) =>
  new Promise((res, rej) => { pending.set(++id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });

try {
  for (let i = 0; i < 60; i++) { try { await jget("/json/version"); break; } catch { await sleep(100); } }
  const tab = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" })).json();
  ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let loaded = null;
  const loadFired = new Promise((r) => (loaded = r));
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.method === "Page.loadEventFired") loaded();
    // Surface page errors: a silently-throwing page otherwise just screenshots as "wrong"
    // and sends you hunting in the wrong place.
    if (m.method === "Runtime.exceptionThrown") {
      const d = m.params.exceptionDetails;
      console.error("PAGE ERROR:", d.exception?.description || d.text);
    }
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") {
      console.error("PAGE console.error:", m.params.args.map((a) => a.value ?? a.description).join(" "));
    }
    const p = pending.get(m.id);
    if (p) { pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
  };
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: dpr, mobile: false });
  if (reduced) await send("Emulation.setEmulatedMedia",
    { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });

  // Navigate explicitly so failure is DETECTABLE. Screenshotting Chrome's net-error page —
  // which renders near-BLACK on a dark-themed system — sent an operator hunting a phantom
  // rendering bug; a screenshot of an error page must never pass as output.
  const t0 = Date.now();
  const nav = await send("Page.navigate", { url });
  if (nav.errorText) {
    console.error(`NAVIGATION FAILED: ${nav.errorText} for ${url}`);
    if (/^http:\/\/(localhost|127\.0\.0\.1)/.test(url) && /CONNECTION_REFUSED/.test(nav.errorText))
      console.error("  -> nothing is serving that port. From the repo root: python3 -m http.server 8777");
    if (/^file:/.test(url))
      console.error("  -> Chrome blocks ES-module imports from file://; serve over http instead.");
    process.exitCode = 1;
    throw Object.assign(new Error("navigation failed — no screenshot taken"), { quiet: true });
  }
  await Promise.race([loadFired, sleep(5000)]);
  // Poll: the widget mounts via dynamic import, which can land after the load event. Must be
  // an element the WIDGET creates — the host div exists statically even when the module fails.
  let mounted = false;
  for (let i = 0; i < 20 && !mounted; i++) {
    mounted = (await send("Runtime.evaluate", {
      expression: `!!document.querySelector(".ctt-header")`, returnByValue: true })).result.value;
    if (!mounted) await sleep(200);
  }
  if (!mounted) {
    console.error("WARNING: page loaded but the widget did not mount (see PAGE ERROR above" +
      " — a file:// URL, a server started in the wrong directory, or a broken module all do this).");
    process.exitCode = 1;
  }
  for (const at of shots) {
    await sleep(Math.max(0, at - (Date.now() - t0)));
    const { data } = await send("Page.captureScreenshot", { format: "png" });
    const file = shots.length > 1 ? out.replace(/\.png$/, `-${at}.png`) : out;
    writeFileSync(file, Buffer.from(data, "base64"));
    console.log(`shot @${at}ms -> ${file}`);
  }
  if (probe) {
    const r = await send("Runtime.evaluate", { expression: probe, returnByValue: true, awaitPromise: true });
    console.log("probe:", JSON.stringify(r.result.value));
  }
} catch (e) {
  if (!e?.quiet) throw e;
} finally {
  try { ws && ws.close(); } catch {}
  chrome.kill();
}
