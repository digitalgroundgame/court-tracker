#!/usr/bin/env node
// Assertions that REQUIRE real layout, so tests/smoke.mjs (jsdom) structurally cannot make them.
//
// jsdom reports 0 for every box, so anything derived from measurement silently falls back to a
// nominal value there — and a jsdom assertion on it passes while the browser is broken. That has
// now happened twice (seat-block sizing; painted-layer count). Run this alongside smoke.
//
// Usage: python3 -m http.server 8777  &&  node tests/browser-checks.mjs
import { spawn } from "node:child_process";

const PORT = 9877, MARK = `/tmp/ctbc-${process.pid}`;
const URL_ = process.argv.includes("--url") ? process.argv[process.argv.indexOf("--url") + 1]
                                            : "http://localhost:8777/index.html";
const chrome = spawn("google-chrome-stable", ["--headless=new", "--no-sandbox", "--hide-scrollbars",
  "--enable-unsafe-swiftshader", `--user-data-dir=${MARK}`, `--remote-debugging-port=${PORT}`,
  "--window-size=1180,760", "about:blank"], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, id = 0; const pending = new Map();
const send = (m, p = {}) => new Promise((res, rej) => { pending.set(++id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const ev = async (e) => (await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true })).result.value;

let failures = 0;
const assert = (cond, msg) => { console.log(`  ${cond ? "✓" : "✗"} ${msg}`); if (!cond) failures++; };

try {
  for (let i = 0; i < 60; i++) { try { await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); break; } catch { await sleep(100); } }
  const tab = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(URL_)}`, { method: "PUT" })).json();
  ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.method === "Runtime.exceptionThrown") console.error("PAGE ERROR:", m.params.exceptionDetails.exception?.description);
    const p = pending.get(m.id);
    if (p) { pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
  };
  await send("Runtime.enable"); await sleep(2800);

  console.log("seat-block squares are the same on-screen size in every view");
  const natEdge = await ev(`document.querySelector('.ctt-block[data-court-id="ca8"] .ctt-sq').getBoundingClientRect().width`);
  assert(Math.abs(natEdge - 6.5) < 0.6, `national square edge ~6.5px (got ${natEdge?.toFixed?.(2)})`);
  await ev(`document.querySelector('.ctt-selector-item[data-court-id="ca8"]').click()`); await sleep(500);
  await ev(`document.querySelector('.ctt-drill').click()`); await sleep(1800);
  const locEdge = await ev(`document.querySelector('.ctt-local-layer .ctt-block[data-court-id="moed"] .ctt-sq').getBoundingClientRect().width`);
  assert(Math.abs(locEdge - natEdge) < 0.3,
    `circuit-view square edge matches national (${locEdge?.toFixed?.(2)} vs ${natEdge?.toFixed?.(2)})`);

  console.log("only the active map layer is painted (native memory)");
  const painted = await ev(`(() => { const a=[...document.querySelectorAll('.ctt-svg-layer')];
    return JSON.stringify({ total:a.length, painted:a.filter(n=>getComputedStyle(n).display!=='none').length }); })()`);
  const p = JSON.parse(painted);
  assert(p.painted === 1, `exactly 1 of ${p.total} layers is paintable while drilled in (got ${p.painted})`);

  console.log("visiting more circuits does not add painted layers");
  await ev(`(async () => { const q=s=>document.querySelector(s);
    for (const c of ["ca9","ca1","ca5"]) { q('.ctt-selector-back')?.click(); await new Promise(r=>setTimeout(r,900));
      q('.ctt-selector-item[data-court-id="'+c+'"]')?.click(); await new Promise(r=>setTimeout(r,200));
      q('.ctt-drill')?.click(); await new Promise(r=>setTimeout(r,900)); } })()`);
  const p2 = JSON.parse(await ev(`(() => { const a=[...document.querySelectorAll('.ctt-svg-layer')];
    return JSON.stringify({ total:a.length, painted:a.filter(n=>getComputedStyle(n).display!=='none').length }); })()`));
  assert(p2.painted === 1, `still 1 painted layer after visiting 4 circuits (${p2.total} exist, ${p2.painted} painted)`);

  // 2026-07-16: CFC's 21 judges need 4 icon rows at typical widths. layoutTimeline() places
  // icons position:absolute inside .ctt-judge-stage, which doesn't grow to fit them the normal
  // CSS way - jsdom can't catch this (every rect measures 0 there). Originally caught because
  // CFC's note was briefly always-visible and collided with the overflowing 4th row; the note
  // is now toggle-gated (majority-mode only, corrected same day) so it no longer renders in
  // timeline view at all - but the underlying stage-height fix (timelineStageHeight()) is still
  // real and still worth checking directly, and the note's own overlap risk now lives in
  // majority mode instead (where CFC's arc + 5-senior outer band needs the taller pane).
  console.log("many-judge courts: timeline stage sizes to its row count; majority note never overlaps, no scrollbar");
  await ev(`document.querySelector('.ctt-selector-back')?.click()`); await sleep(600);
  await ev(`document.querySelector('.ctt-selector-item[data-court-id="cafc"]').click()`); await sleep(500);
  await ev(`document.querySelector('.ctt-drill').click()`); await sleep(500);
  await ev(`document.querySelector('.ctt-selector-item[data-court-id="uscfc"]').click()`); await sleep(500);
  const cfcTimeline = JSON.parse(await ev(`(() => {
    const stage = document.querySelector(".ctt-judge-stage");
    const lastIcon = [...stage.querySelectorAll(".ctt-judge")].reduce((max, n) => {
      const b = n.getBoundingClientRect(); return b.bottom > max ? b.bottom : max; }, 0);
    const body = document.querySelector(".ctt-pane-body");
    return JSON.stringify({
      stageHeight: stage.getBoundingClientRect().height, stageBottom: stage.getBoundingClientRect().bottom,
      lastIconBottom: lastIcon, hasAlwaysNote: !!document.querySelector(".ctt-always-note"),
      scrollHeight: body.scrollHeight, clientHeight: body.clientHeight,
    });
  })()`));
  assert(!cfcTimeline.hasAlwaysNote, "CFC shows no always-visible note in timeline view (moved to toggle-gated, corrected same day)");
  assert(cfcTimeline.stageBottom >= cfcTimeline.lastIconBottom,
    `CFC's stage box (bottom ${cfcTimeline.stageBottom?.toFixed(1)}) actually contains its last icon row (bottom ${cfcTimeline.lastIconBottom?.toFixed(1)}) - the dynamic height fix is doing its job`);
  assert(cfcTimeline.scrollHeight <= cfcTimeline.clientHeight,
    `CFC pane has no vertical scrollbar in timeline mode (scrollHeight ${cfcTimeline.scrollHeight} <= clientHeight ${cfcTimeline.clientHeight})`);
  await ev(`[...document.querySelectorAll(".ctt-toggle")].find(b => b.textContent === "Majority")?.click()`);
  await sleep(500);
  const cfcMajGeom = JSON.parse(await ev(`(() => {
    const note = document.querySelector(".ctt-majority-note");
    const stage = document.querySelector(".ctt-judge-stage");
    const lastIcon = [...stage.querySelectorAll(".ctt-judge")].reduce((max, n) => {
      const b = n.getBoundingClientRect(); return b.bottom > max ? b.bottom : max; }, 0);
    const body = document.querySelector(".ctt-pane-body");
    return JSON.stringify({
      noteVisible: note && getComputedStyle(note).display !== "none",
      noteTop: note?.getBoundingClientRect().top, lastIconBottom: lastIcon,
      scrollHeight: body.scrollHeight, clientHeight: body.clientHeight,
    });
  })()`));
  assert(cfcMajGeom.noteVisible, "CFC's note is visible once toggled to Majority mode");
  assert(cfcMajGeom.noteTop >= cfcMajGeom.lastIconBottom,
    `CFC's majority-mode note (top ${cfcMajGeom.noteTop?.toFixed(1)}) doesn't overlap the arc/senior band (bottom ${cfcMajGeom.lastIconBottom?.toFixed(1)})`);
  assert(cfcMajGeom.scrollHeight <= cfcMajGeom.clientHeight,
    `CFC pane has no vertical scrollbar in majority mode either (scrollHeight ${cfcMajGeom.scrollHeight} <= clientHeight ${cfcMajGeom.clientHeight})`);

  console.log("pane tallness is set per drill-in CONTEXT, not per court");
  const tallCafc = await ev(`document.querySelector(".ctt-pane").classList.contains("ctt-pane--tall")`);
  assert(tallCafc, "cafc's feeder context (cit+uscfc) gets the taller pane");
  await ev(`document.querySelector('.ctt-selector-back')?.click()`); await sleep(600);
  await ev(`document.querySelector('.ctt-selector-item[data-court-id="ca1"]').click()`); await sleep(500);
  await ev(`document.querySelector('.ctt-drill').click()`); await sleep(1500);
  const tallCa1 = await ev(`document.querySelector(".ctt-pane").classList.contains("ctt-pane--tall")`);
  assert(!tallCa1, "ca1 (no note-bearing court in its district list) does NOT get the taller pane");
  await ev(`document.querySelector('.ctt-selector-back')?.click()`); await sleep(600);

  console.log("District 'Set upon map' pull-out animation: real colors, not solid black (jsdom can't test this — .ctt-district-flyover lives OUTSIDE .ctt-root, so its var(--ctt-rep) etc. only resolve with real computed-style inheritance)");
  await ev(`document.querySelector('.ctt-selector-item[data-court-id="summary"]').click()`); await sleep(400);
  await ev(`[...document.querySelectorAll('.ctt-mode-opt')].find(b=>b.textContent==='District Courts').click()`); await sleep(500);
  await ev(`document.querySelector('.ctt-district-deploy-btn').click()`);
  await sleep(120);   // mid-flight — the flyover should exist and already be animating
  const flyMid = JSON.parse(await ev(`(() => {
    const fly = document.querySelector('.ctt-district-flyover');
    if (!fly) return JSON.stringify({ exists: false });
    const sq = fly.querySelector('.ctt-district-sq.ctt-sq-rep, .ctt-district-sq.ctt-sq-dem');
    return JSON.stringify({ exists: true, fill: sq && getComputedStyle(sq).fill, paneOpen: document.querySelector('.ctt-pane').classList.contains('ctt-is-open') });
  })()`));
  assert(flyMid.exists, "the flyover clone exists mid-animation");
  assert(!flyMid.paneOpen, "the Summary pane has already closed while the flyover is still animating ('the summary pane flips up')");
  assert(flyMid.fill && flyMid.fill !== "rgb(0, 0, 0)",
    `flyover squares render their REAL red/blue/etc color, not solid black from a missing CSS var (got ${flyMid.fill})`);
  await sleep(700);   // let the animation finish
  const settled = JSON.parse(await ev(`(() => {
    const fly = document.querySelector('.ctt-district-flyover');
    const ov = document.querySelector('.ctt-district-overlay');
    return JSON.stringify({ flyGone: !fly, overlayVisible: ov && getComputedStyle(ov).display !== 'none' });
  })()`));
  assert(settled.flyGone, "the flyover clone is removed once the animation settles");
  assert(settled.overlayVisible, "the real persistent overlay is visible in its place");
} catch (e) { console.log("*** ", e.message); failures++; }
finally { try { ws && ws.close(); } catch {} chrome.kill(); }

console.log(`\n${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"}`);
process.exit(failures === 0 ? 0 : 1);
