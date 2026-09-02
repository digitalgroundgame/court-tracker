#!/usr/bin/env node
// Long soak for the drill-in freeze that survives tests/stress.mjs.
//
// The operator reports it still happens, just after MANY more drill in/outs — so something is
// accumulating slowly. This runs a long cycle count and samples, per cycle, everything that
// could grow without bound:
//   rafPerSec  - runaway/duplicated requestAnimationFrame loops (the morph is rAF-driven, so a
//                leaked loop keeps serialising thousands of vertices per frame forever)
//   nodes      - DOM size (stranded layers)
//   heapMB     - JS heap
//   plans/local- the widget's own caches (bounded by design: 12 circuits)
//   evalMs     - round-trip latency of a trivial evaluate == main-thread responsiveness
//
// Usage: node tests/soak.mjs [--cycles 120] [--url ...]
import { spawn } from "node:child_process";

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf("--" + k); return i < 0 ? d : argv[i + 1]; };
const CYCLES = +arg("cycles", 120);
const URL_ = arg("url", "http://localhost:8777/tests/visual.html?c=none");
const PORT = 9912;

const chrome = spawn("google-chrome-stable", [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
  `--remote-debugging-port=${PORT}`, "--window-size=1180,760", "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, id = 0;
const pending = new Map();
const send = (method, params = {}) =>
  new Promise((res, rej) => { pending.set(++id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
const evalIn = async (expr, timeoutMs = 5000) => {
  const t0 = Date.now();
  const r = await Promise.race([
    send("Runtime.evaluate", { expression: expr, returnByValue: true }),
    sleep(timeoutMs).then(() => "TIMEOUT"),
  ]);
  if (r === "TIMEOUT") throw new Error(`main thread unresponsive (evaluate > ${timeoutMs}ms)`);
  return { v: r.result.value, ms: Date.now() - t0 };
};

try {
  for (let i = 0; i < 60; i++) { try { await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); break; } catch { await sleep(100); } }
  const tab = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(URL_)}`, { method: "PUT" })).json();
  ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.method === "Runtime.exceptionThrown") {
      const d = m.params.exceptionDetails;
      console.error("PAGE ERROR:", d.exception?.description || d.text);
    }
    const p = pending.get(m.id);
    if (p) { pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
  };
  await send("Page.enable");
  await send("Runtime.enable");
  await sleep(2600);

  // Count every rAF callback the page actually runs. A leaked morph loop shows up here long
  // before it shows up as a freeze.
  await evalIn(`
    window.__raf = 0;
    const _raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (fn) => _raf((t) => { window.__raf++; return fn(t); });
    window.__t = {
      click: (sel) => { const n = document.querySelector(sel); if (n) n.dispatchEvent(new MouseEvent("click", {bubbles:true})); return !!n; },
      pick: (cid) => window.__t.click('.ctt-selector-item[data-court-id="' + cid + '"]'),
      drill: () => window.__t.click('.ctt-drill'),
      back: () => window.__t.click('.ctt-selector-back'),
      // realistic extras: a person opens district panes, toggles views, hovers judges
      district: () => { const items=[...document.querySelectorAll('.ctt-selector-item')].filter(n=>n.getAttribute('data-court-id')&&!/^ca/.test(n.getAttribute('data-court-id'))); const n=items[Math.floor(Math.random()*items.length)]; if(n) n.dispatchEvent(new MouseEvent('click',{bubbles:true})); return !!n; },
      majority: () => { const b=[...document.querySelectorAll('.ctt-toggle')].find(x=>x.textContent.trim()==='Majority'); if(b) b.dispatchEvent(new MouseEvent('click',{bubbles:true})); return !!b; },
      timeline: () => { const b=[...document.querySelectorAll('.ctt-toggle')].find(x=>x.textContent.trim()==='Timeline'); if(b) b.dispatchEvent(new MouseEvent('click',{bubbles:true})); return !!b; },
      hoverJudges: () => { const js=[...document.querySelectorAll('.ctt-judge')]; js.slice(0,6).forEach(n=>n.dispatchEvent(new MouseEvent('mouseenter',{bubbles:true}))); return js.length; },
      hoverShape: () => { const s=[...document.querySelectorAll('.ctt-shape')]; const n=s[Math.floor(Math.random()*s.length)]; if(n){n.dispatchEvent(new MouseEvent('mouseenter',{bubbles:true})); n.dispatchEvent(new MouseEvent('mousemove',{bubbles:true,clientX:400,clientY:400}));} return !!n; },
      stow: () => window.__t.click('.ctt-pane-stow'),
    }; 1`);

  const circuits = ["ca8", "ca9", "ca1", "ca5", "ca2", "ca11", "ca4", "ca6"];
  const FUZZ = argv.includes("--fuzz");
  console.log("cycle  rafPerSec  nodes  heapMB  morph  layers  listeners  evalMs");
  let worstRaf = 0, worstEval = 0;
  for (let i = 0; i < CYCLES; i++) {
    const c = circuits[i % circuits.length];
    const mode = i % 3;
    if (FUZZ) {
      // Random action at a random short delay: the point is to land clicks at arbitrary
      // moments inside the 620ms morph, which is what a person mashing the UI actually does.
      const acts = ["pick", "drill", "back", "district", "majority", "timeline", "hoverJudges", "hoverShape", "stow"];
      for (let k = 0; k < 6; k++) {
        const a = acts[Math.floor(Math.random() * acts.length)];
        const expr = a === "pick" ? `window.__t.pick("${circuits[Math.floor(Math.random()*circuits.length)]}")`
                                  : `window.__t.${a}()`;
        // sometimes hammer the same control 2-3x with no gap (double/triple-click)
        const reps = Math.random() < 0.3 ? 1 + Math.floor(Math.random() * 2) : 0;
        await evalIn(reps ? `(()=>{${Array(reps + 1).fill(expr).join(";")}})()` : expr);
        await sleep(Math.floor(Math.random() * 700));   // 0..700ms: before/mid/after the morph
      }
    } else {
    await evalIn(`window.__t.pick("${c}")`); await sleep(120);
    await evalIn(`window.__t.hoverJudges()`);
    if (i % 4 === 0) { await evalIn(`window.__t.majority()`); await sleep(150); await evalIn(`window.__t.hoverJudges()`); }
    if (i % 4 === 2) { await evalIn(`window.__t.timeline()`); await sleep(100); }
    await evalIn(`window.__t.hoverShape()`);
    await evalIn(`window.__t.drill()`); await sleep(mode === 0 ? 900 : mode === 1 ? 300 : 40);
    if (mode === 0) { await evalIn(`window.__t.district()`); await sleep(250); await evalIn(`window.__t.hoverJudges()`); }
    await evalIn(`window.__t.back()`); await sleep(mode === 0 ? 900 : 120);
    }

    if (i % 10 === 9 || i === CYCLES - 1) {
      await evalIn(`window.__raf = 0`);
      await sleep(1000);                       // measure rAF callbacks over exactly 1s idle
      const s = await evalIn(`JSON.stringify({
        raf: window.__raf,
        nodes: document.getElementsByTagName('*').length,
        heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize/1048576) : -1,
        morph: document.querySelectorAll('.ctt-morph-layer').length,
        layers: document.querySelectorAll('.ctt-svg-layer').length,
      })`);
      const st = JSON.parse(s.v);
      // Chrome's own counters: catches detached nodes + listener leaks the DOM query misses.
      const dc = await send("Memory.getDOMCounters").catch(() => null);
      st.listeners = dc ? dc.jsEventListeners : -1;
      st.nodes = dc ? dc.nodes : st.nodes;
      worstRaf = Math.max(worstRaf, st.raf); worstEval = Math.max(worstEval, s.ms);
      console.log(`${String(i + 1).padStart(4)}  ${String(st.raf).padStart(9)}  ${String(st.nodes).padStart(6)}` +
        `  ${String(st.heap).padStart(6)}  ${String(st.morph).padStart(5)}  ${String(st.layers).padStart(6)}` +
        `  ${String(st.listeners).padStart(9)}  ${String(s.ms).padStart(6)}`);
    }
  }
  console.log(`\nworst idle rAF/s: ${worstRaf} (want ~0 when idle — anything sustained is a leaked loop)`);
  console.log(`worst evaluate latency: ${worstEval}ms`);
} catch (e) {
  console.log("\n*** FREEZE REPRODUCED:", e.message);
  process.exitCode = 1;
} finally {
  try { ws && ws.close(); } catch {}
  chrome.kill();
}
