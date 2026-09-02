#!/usr/bin/env node
// Stress the drill-in/drill-out cycle in a REAL browser to hunt the reported freeze
// (100% CPU + unresponsive page towards the end of the drill-in animation).
//
// Interrupting a morph is the interesting case: `runMorph` cancels the in-flight rAF, which
// leaves the awaiting drillIn/drillOut suspended forever, so anything it was supposed to clean
// up (the morph layer, the hidden national layer) never gets cleaned up.
//
// Usage: node tests/stress.mjs [--cycles 30] [--url http://localhost:8777/tests/visual.html?c=none]
import { spawn } from "node:child_process";

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf("--" + k); return i < 0 ? d : argv[i + 1]; };
const CYCLES = +arg("cycles", 30);
const URL_ = arg("url", "http://localhost:8777/tests/visual.html?c=none");
const PORT = 9871;

const chrome = spawn("google-chrome-stable", [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
  `--remote-debugging-port=${PORT}`, "--window-size=1180,760", "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, id = 0;
const pending = new Map();
const send = (method, params = {}) =>
  new Promise((res, rej) => { pending.set(++id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
const evalIn = async (expr, timeoutMs = 4000) => {
  const r = await Promise.race([
    send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: false }),
    sleep(timeoutMs).then(() => "TIMEOUT"),
  ]);
  if (r === "TIMEOUT") throw new Error("main thread unresponsive (evaluate timed out)");
  return r.result.value;
};

try {
  for (let i = 0; i < 60; i++) { try { await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); break; } catch { await sleep(100); } }
  const tab = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(URL_)}`, { method: "PUT" })).json();
  ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    const p = pending.get(m.id);
    if (p) { pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
  };
  await send("Page.enable");
  await send("Runtime.enable");
  await sleep(2500);

  await evalIn(`window.__t = {
    click: (sel) => { const n = document.querySelector(sel); if (n) n.dispatchEvent(new MouseEvent("click", {bubbles:true})); return !!n; },
    pick: (cid) => window.__t.click('.ctt-selector-item[data-court-id="' + cid + '"]'),
    drill: () => window.__t.click('.ctt-drill'),
    back: () => window.__t.click('.ctt-selector-back'),
    stat: () => ({
      layers: document.querySelectorAll('.ctt-svg-layer').length,
      morph: document.querySelectorAll('.ctt-morph-layer').length,
      natHidden: document.querySelector('.ctt-national-layer').classList.contains('ctt-hidden-hard'),
      blocks: document.querySelectorAll('.ctt-block').length,
    }),
  }; 1`);

  const circuits = ["ca8", "ca9", "ca1", "ca5", "ca2", "ca11"];
  let peak = 0;
  console.log("cycle  pattern            layers morph natHidden blocks   ms");
  for (let i = 0; i < CYCLES; i++) {
    const c = circuits[i % circuits.length];
    // Cycle through timings: settle fully, interrupt mid-morph, interrupt immediately.
    const mode = i % 3;
    const waitIn = mode === 0 ? 1400 : mode === 1 ? 300 : 30;
    const t0 = Date.now();
    await evalIn(`window.__t.pick("${c}")`); await sleep(220);
    await evalIn(`window.__t.drill()`); await sleep(waitIn);
    // Deliberately do NOT settle between cycles: the next drill interrupting this back-morph
    // is the case that strands layers. Sampling here is informational (a morph may be live).
    await evalIn(`window.__t.back()`); await sleep(mode === 0 ? 1400 : 120);
    const st = JSON.parse(await evalIn(`JSON.stringify(window.__t.stat())`));
    peak = Math.max(peak, st.layers);
    const label = ["settle    ", "mid-morph ", "immediate "][mode];
    console.log(`${String(i).padStart(4)}   ${label} ${c.padEnd(6)} ${String(st.layers).padStart(6)}${String(st.morph).padStart(6)}` +
      `${String(st.natHidden).padStart(10)}${String(st.blocks).padStart(7)}${String(Date.now() - t0).padStart(6)}`);
  }

  // Only NOW let everything settle, then judge: anything still attached is stranded.
  await sleep(2500);
  const fin = JSON.parse(await evalIn(`JSON.stringify(window.__t.stat())`));
  console.log(`\nafter settle: layers=${fin.layers} morph=${fin.morph} natHidden=${fin.natHidden} ` +
              `blocks=${fin.blocks} (peak layers during run: ${peak})`);
  const stranded = fin.morph > 0 || fin.natHidden;
  console.log(stranded
    ? `*** STRANDED: ${fin.morph} morph layer(s) left attached${fin.natHidden ? " + national layer still hidden" : ""}`
    : "clean: nothing stranded, main thread responsive");
  if (stranded) process.exitCode = 1;
} catch (e) {
  console.log("\n*** FREEZE REPRODUCED:", e.message);
  process.exitCode = 1;
} finally {
  try { ws && ws.close(); } catch {}
  chrome.kill();
}
