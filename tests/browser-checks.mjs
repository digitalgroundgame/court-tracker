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
// --url may be a full URL or just a path; a path is resolved against the local server, whose
// port comes from CT_PORT (scripts/serve_and_run.mjs sets it so a custom port moves both ends).
const ORIGIN = `http://localhost:${process.env.CT_PORT || 8777}`;
const urlArg = process.argv.includes("--url") ? process.argv[process.argv.indexOf("--url") + 1] : "/index.html";
const URL_ = /^https?:\/\//.test(urlArg) ? urlArg : new URL(urlArg, ORIGIN).href;
// Binary is overridable (CHROME_BIN) so CI runners and containers that ship Chromium under
// another name can run this without patching the test.
const CHROME = process.env.CHROME_BIN || "google-chrome-stable";
const chrome = spawn(CHROME, ["--headless=new", "--no-sandbox", "--hide-scrollbars",
  "--enable-unsafe-swiftshader", `--user-data-dir=${MARK}`, `--remote-debugging-port=${PORT}`,
  "--window-size=1180,760", "about:blank"], { stdio: "ignore" });
// Without this a missing binary surfaces as an uncaught ENOENT stack trace from spawn's
// next-tick 'error' event, with nothing pointing at the one knob that fixes it.
chrome.on("error", (e) => {
  console.error(`cannot launch Chrome at "${CHROME}" (${e.code || e.message}); set CHROME_BIN to your Chrome/Chromium binary`);
  process.exit(1);
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, id = 0; const pending = new Map();
const send = (m, p = {}) => new Promise((res, rej) => { pending.set(++id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const ev = async (e) => (await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true })).result.value;

let failures = 0;
const assert = (cond, msg) => { console.log(`  ${cond ? "✓" : "✗"} ${msg}`); if (!cond) failures++; };

try {
  // Chrome's CDP port has taken well over 6s to open on shared/cold GitHub Actions runners —
  // confirmed from real CI logs (2026-09-08): three separate failures, all in this exact spot,
  // all landing at ~6.3s (the old 60x100ms budget), all passing cleanly on an immediate re-run.
  // 200x150ms (30s) tolerates that without slowing down the common fast-local-Chrome case, since
  // the loop still `break`s the moment the port answers. If it genuinely never comes up, fail with
  // an actionable message instead of falling through to a second fetch that throws a bare
  // "fetch failed" with no indication of what actually didn't start.
  let chromeReady = false;
  for (let i = 0; i < 200; i++) {
    try { await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); chromeReady = true; break; }
    catch { await sleep(150); }
  }
  if (!chromeReady) {
    throw new Error(`Chrome's CDP endpoint at 127.0.0.1:${PORT} never opened after 30s ` +
      `(CHROME_BIN=${CHROME}) — check the runner has enough headroom to start Chrome, or that ` +
      `nothing else is holding that port.`);
  }
  const tab = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(URL_)}`, { method: "PUT" })).json();
  ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.method === "Runtime.exceptionThrown") console.error("PAGE ERROR:", m.params.exceptionDetails.exception?.description);
    const p = pending.get(m.id);
    if (p) { pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
  };
  await send("Runtime.enable");
  // Same class of problem as the CDP-port wait above, caught the same way (2026-09-08): a FIXED
  // 2800ms here assumed the app finishes its first fetch+render in that window, which held
  // locally but not on a cold/shared Actions runner -- confirmed live, this exact assertion is
  // what failed first when the fixed sleep ran out early. Poll for the actual element instead of
  // guessing a bigger fixed number.
  let mounted = false;
  for (let i = 0; i < 100; i++) {
    if (await ev(`!!document.querySelector('.ctt-block[data-court-id="ca8"] .ctt-sq')`)) { mounted = true; break; }
    await sleep(150);
  }
  if (!mounted) throw new Error("app never rendered ca8's seat block after 15s -- did mount() throw? check for a PAGE ERROR line above.");

  console.log("seat-block squares are the same on-screen size in every view");
  const natEdge = await ev(`document.querySelector('.ctt-block[data-court-id="ca8"] .ctt-sq').getBoundingClientRect().width`);
  assert(Math.abs(natEdge - 6.5) < 0.6, `national square edge ~6.5px (got ${natEdge?.toFixed?.(2)})`);
  await ev(`document.querySelector('.ctt-selector-item[data-court-id="ca8"]').click()`); await sleep(500);

  // Issue #7 audit: cohort highlight + the judge detail box must be reachable by a bare CLICK
  // alone, with NO preceding mouseenter/hover event ever dispatched — this whole file never
  // simulates hover anywhere, so if this passes, tap-only reachability holds for real, not just
  // by code inspection. onIconClick() calls the same highlightCohort()/showDetail() a hover would,
  // then additionally pins the panel — verified directly rather than trusted from reading the code.
  console.log("judge-icon detail box + same-president cohort highlight are reachable by click alone, no hover needed");
  const firstJudge = JSON.parse(await ev(`(() => {
    const icons = [...document.querySelectorAll(".ctt-judge-stage .ctt-judge")];
    const target = icons.find(n => !n.classList.contains("ctt-vacant"));
    target.click();
    const president = target.querySelector(".ctt-judge-label")?.textContent || "";
    return JSON.stringify({
      found: !!target,
      pinned: document.querySelector(".ctt-detail")?.classList.contains("ctt-pinned") || false,
      hasName: !!document.querySelector(".ctt-detail-name")?.textContent,
      cohortCount: document.querySelectorAll(".ctt-judge-stage .ctt-judge.ctt-copresident").length,
    });
  })()`));
  assert(firstJudge.found, "a non-vacant judge icon exists in ca8's bench to click");
  assert(firstJudge.pinned, "clicking a judge icon (no prior hover) pins the detail panel");
  assert(firstJudge.hasName, "clicking a judge icon (no prior hover) populates the detail box");
  assert(firstJudge.cohortCount >= 1,
    `clicking a judge icon (no prior hover) highlights its appointing-president cohort (${firstJudge.cohortCount} marked)`);
  await ev(`document.querySelector(".ctt-detail-close")?.click()`);

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

  console.log("ordinary court panes (reached via drill-in) do NOT reserve extra title height - that was a MISAPPLICATION of the operator's 2026-09-07 ask, corrected 2026-09-09 to apply only to the Summary docked tooltip's own name label (see below)");
  await ev(`document.querySelector('.ctt-selector-item[data-court-id="ca9"]').click()`); await sleep(500);
  await ev(`document.querySelector('.ctt-drill').click()`); await sleep(1800);
  // gud ("...District of Guam", short) — an ordinary drill-in pane's title has no reservation
  // CSS applied to it at all any more (checked directly via computed style, not by relying on
  // incidental text-wrapping at one particular window width, which is fragile).
  await ev(`document.querySelector('.ctt-selector-item[data-court-id="gud"]').click()`); await sleep(500);
  const gudTitleMinHeight = await ev(`getComputedStyle(document.querySelector('.ctt-pane-title')).minHeight`);
  assert(gudTitleMinHeight === "0px" || gudTitleMinHeight === "auto",
    `ordinary court pane titles carry no min-height reservation any more (got "${gudTitleMinHeight}")`);
  await ev(`document.querySelector('.ctt-selector-back')?.click()`); await sleep(600);
  await ev(`document.querySelector('.ctt-selector-item[data-court-id="cafc"]').click()`); await sleep(500);
  await ev(`document.querySelector('.ctt-drill').click()`); await sleep(500);
  await ev(`document.querySelector('.ctt-selector-item[data-court-id="uscfc"]').click()`); await sleep(500);
  const cfcScroll = JSON.parse(await ev(`(() => { const b = document.querySelector('.ctt-pane-body'); return JSON.stringify({ scrollHeight: b.scrollHeight, clientHeight: b.clientHeight }); })()`));
  assert(cfcScroll.scrollHeight <= cfcScroll.clientHeight,
    `CFC pane still has no vertical scrollbar (scrollHeight ${cfcScroll.scrollHeight} <= clientHeight ${cfcScroll.clientHeight})`);
  await ev(`document.querySelector('.ctt-selector-back')?.click()`); await sleep(500);

  console.log("Summary > District docked tooltip's own name label reserves fixed room instead (operator report, 2026-09-09 — the corrected scope for the 2026-09-07 ask)");
  await ev(`document.querySelector('.ctt-selector-item[data-court-id="summary"]').click()`); await sleep(400);
  await ev(`[...document.querySelectorAll('.ctt-mode-opt')].find(b=>b.textContent==='District Courts').click()`); await sleep(600);
  const nameHeights = JSON.parse(await ev(`(() => {
    const sqs = [...document.querySelectorAll('.ctt-summary-content .ctt-district-sq[data-district-id]')];
    const results = {};
    for (const sq of sqs.slice(0, 40)) {
      const did = sq.getAttribute('data-district-id');
      const r = sq.getBoundingClientRect();
      sq.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: r.x + 1, clientY: r.y + 1 }));
      const nameEl = document.querySelector('.ctt-district-detail .ctt-detail-name');
      results[did] = nameEl.getBoundingClientRect().height;
    }
    return JSON.stringify(results);
  })()`));
  const heights = Object.values(nameHeights);
  const allSame = heights.every((h) => h === heights[0]);
  assert(allSame, `the docked tooltip's name box height is IDENTICAL across every district hovered (never shrinks/grows with name length) (${JSON.stringify(nameHeights)})`);

  console.log("Summary > District controls row: deploy button right-aligned + width-matched to the docked panel (operator ask, 2026-09-07)");
  // Already on Summary > District from the name-height check just above — re-clicking the
  // already-selected "summary" item here would TOGGLE IT CLOSED instead of doing nothing.
  const alignGeom = JSON.parse(await ev(`(() => {
    const btn = document.querySelector('.ctt-district-deploy-btn'), detail = document.querySelector('.ctt-district-detail');
    const b = btn.getBoundingClientRect(), d = detail.getBoundingClientRect();
    return JSON.stringify({ widthDiff: Math.abs(b.width - d.width), rightDiff: Math.abs(b.right - d.right) });
  })()`));
  assert(alignGeom.widthDiff < 1, `deploy button width matches the docked panel (diff ${alignGeom.widthDiff})`);
  assert(alignGeom.rightDiff < 1, `deploy button right edge aligns with the docked panel (diff ${alignGeom.rightDiff})`);

  console.log("fixed corner controls sit top-right; drill-in sub-assembly sits bottom-left (operator ask, 2026-09-07)");
  await ev(`document.querySelector('.ctt-pane-close').click()`); await sleep(400);   // close Summary — the corner controls are hidden while any pane is open
  await ev(`document.querySelector('.ctt-district-corner-controls .ctt-district-overlay-btn').click()`); await sleep(700);
  const cornerGeom = JSON.parse(await ev(`(() => {
    const box = document.querySelector('.ctt-district-corner-controls'), vp = document.querySelector('.ctt-map-viewport');
    const r = box.getBoundingClientRect(), v = vp.getBoundingClientRect();
    return JSON.stringify({ top: r.top - v.top, right: v.right - r.right });
  })()`));
  assert(cornerGeom.top < 30 && cornerGeom.right < 30, `corner controls anchored near the top-right (${JSON.stringify(cornerGeom)})`);
  await ev(`document.querySelector('.ctt-selector-item[data-court-id="ca8"]').click()`); await sleep(400);
  await ev(`document.querySelector('.ctt-drill').click()`); await sleep(1800);
  const subGeom = JSON.parse(await ev(`(() => {
    const sub = document.querySelector('.ctt-district-subassembly'), vp = document.querySelector('.ctt-map-viewport');
    const r = sub.getBoundingClientRect(), v = vp.getBoundingClientRect();
    return JSON.stringify({ bottom: v.bottom - r.bottom, left: r.left - v.left });
  })()`));
  assert(subGeom.bottom < 30 && subGeom.left < 30, `sub-assembly anchored near the bottom-left (${JSON.stringify(subGeom)})`);
  await ev(`document.querySelector('.ctt-selector-back')?.click()`); await sleep(600);

  console.log("REGRESSION (operator report, 2026-09-07): hovering one district in the deployed assembly must not grow every district");
  const growthDids = JSON.parse(await ev(`(() => {
    const sq = document.querySelector('.ctt-district-overlay .ctt-district-sq[data-district-id="cacd"]');
    const r = sq.getBoundingClientRect();
    sq.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: r.x + 1, clientY: r.y + 1 }));
    return null;
  })()`));
  await sleep(300);
  const grownDids = JSON.parse(await ev(`JSON.stringify([...new Set([...document.querySelectorAll('.ctt-district-overlay .ctt-district-sq.ctt-district-sq-grown')].map(s=>s.getAttribute('data-district-id')))])`));
  assert(JSON.stringify(grownDids) === JSON.stringify(["cacd"]), `only cacd's cells are grown, not the whole assembly (got ${grownDids})`);

  console.log("Summary > District caption: bolded title + summary meta line underneath (operator ask, 2026-09-08)");
  await ev(`document.querySelector('.ctt-selector-item[data-court-id="summary"]').click()`); await sleep(400);
  await ev(`[...document.querySelectorAll('.ctt-mode-opt')].find(b=>b.textContent==='District Courts').click()`); await sleep(600);
  const captionGeom = JSON.parse(await ev(`(() => {
    const title = document.querySelector('.ctt-district-caption-row .ctt-summary-subtitle');
    const meta = document.querySelector('.ctt-district-caption-row .ctt-pane-meta');
    return JSON.stringify({ weight: getComputedStyle(title).fontWeight, metaText: meta.textContent,
      titleTop: title.getBoundingClientRect().top, metaTop: meta.getBoundingClientRect().top });
  })()`));
  assert(parseInt(captionGeom.weight) >= 600, `caption title is bold-weight (got ${captionGeom.weight})`);
  assert(/^\d+ authorized · \d+ active · \d+ vacant( \*)?$/.test(captionGeom.metaText), `meta line matches the standard summary format (got "${captionGeom.metaText}")`);
  assert(captionGeom.metaTop > captionGeom.titleTop, "meta line sits below the title");

  console.log("Summary > District caption: the overage marker (operator report, 2026-09-11) stays a single line — it must not wreck the SCOTUS/District pixel parity checked just below");
  const overageGeom = JSON.parse(await ev(`(() => {
    const meta = document.querySelector('.ctt-district-caption-row .ctt-pane-meta');
    const note = meta.querySelector('.ctt-district-overage-note');
    return JSON.stringify({ hasNote: !!note, title: note?.title || null, metaHeight: meta.getBoundingClientRect().height });
  })()`));
  console.log("   overageGeom:", JSON.stringify(overageGeom));
  assert(overageGeom.hasNote && /\d+/.test(overageGeom.title || ""), "the discrepancy marker is present with an explanatory tooltip when the totals don't add up at face value");
  assert(overageGeom.metaHeight < 20, `the meta line is still exactly ONE line tall with the marker appended (got ${overageGeom.metaHeight}px)`);

  console.log("REGRESSION (operator report, 2026-09-09): Summary > Supreme Court and District Courts docked panels must align to the SAME position and height, text included");
  // Already on Summary > District from the caption test just above.
  await ev(`[...document.querySelectorAll('.ctt-mode-opt')].find(b=>b.textContent==='Supreme Court').click()`); await sleep(400);
  const scotusRects = JSON.parse(await ev(`(() => {
    const subtitle = document.querySelector('.ctt-summary-content > .ctt-summary-subtitle');
    const meta = document.querySelector('.ctt-summary-content > .ctt-pane-meta');
    const stage = document.querySelector('.ctt-stage-row');
    return JSON.stringify({ subtitleTop: subtitle.getBoundingClientRect().top, subtitleLeft: subtitle.getBoundingClientRect().left,
      stageTop: stage.getBoundingClientRect().top, stageBottom: stage.getBoundingClientRect().bottom });
  })()`));
  await ev(`[...document.querySelectorAll('.ctt-mode-opt')].find(b=>b.textContent==='District Courts').click()`); await sleep(400);
  const districtRects = JSON.parse(await ev(`(() => {
    const title = document.querySelector('.ctt-district-caption-row .ctt-summary-subtitle');
    const layout = document.querySelector('.ctt-district-layout');
    return JSON.stringify({ titleTop: title.getBoundingClientRect().top, titleLeft: title.getBoundingClientRect().left,
      layoutTop: layout.getBoundingClientRect().top, layoutBottom: layout.getBoundingClientRect().bottom });
  })()`));
  assert(scotusRects.subtitleTop === districtRects.titleTop, `title text starts at the SAME y-position in both sub-tabs (SCOTUS ${scotusRects.subtitleTop} vs District ${districtRects.titleTop})`);
  assert(scotusRects.subtitleLeft === districtRects.titleLeft, `title text starts at the SAME x-position in both sub-tabs (SCOTUS ${scotusRects.subtitleLeft} vs District ${districtRects.titleLeft})`);
  assert(scotusRects.stageTop === districtRects.layoutTop, `content row starts at the SAME y-position in both sub-tabs (SCOTUS ${scotusRects.stageTop} vs District ${districtRects.layoutTop})`);
  assert(scotusRects.stageBottom === districtRects.layoutBottom, `content row ends at the SAME y-position in both sub-tabs (SCOTUS ${scotusRects.stageBottom} vs District ${districtRects.layoutBottom})`);

  console.log("assembly edge-clipping is now symmetric on all 4 edges, each capped near 80% hidden (operator ask, 2026-09-08)");
  await ev(`document.querySelector('.ctt-pane-close').click()`); await sleep(400);   // close Summary — may already be deployed from earlier in this run
  const alreadyDeployed = await ev(`getComputedStyle(document.querySelector('.ctt-district-overlay')).display !== 'none'`);
  if (!alreadyDeployed) { await ev(`document.querySelector('.ctt-district-corner-controls .ctt-district-overlay-btn').click()`); await sleep(700); }
  const dragBy = async (dx, dy) => {
    await ev(`(() => {
      const ov = document.querySelector('.ctt-district-overlay');
      const r = ov.getBoundingClientRect();
      ov.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: r.x + 10, clientY: r.y + 10 }));
      window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: r.x + 10 + (${dx}), clientY: r.y + 10 + (${dy}) }));
      window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    })()`);
    await sleep(100);
  };
  const overlayGeom = async () => JSON.parse(await ev(`(() => {
    const ov = document.querySelector('.ctt-district-overlay'), vp = document.querySelector('.ctt-map-viewport');
    const r = ov.getBoundingClientRect(), v = vp.getBoundingClientRect();
    return JSON.stringify({ w: r.width, h: r.height, left: v.left - r.left, right: r.right - v.right, top: v.top - r.top, bottom: r.bottom - v.bottom });
  })()`));
  await dragBy(-2000, 0);
  let og = await overlayGeom();
  assert(og.left > 0 && og.left <= og.w * 0.81, `left-edge clip capped near 80% of width (${og.left} / ${og.w})`);
  await dragBy(4000, 0);
  og = await overlayGeom();
  assert(og.right > 0 && og.right <= og.w * 0.81, `right-edge clip capped near 80% of width (${og.right} / ${og.w})`);
  await dragBy(0, -2000);
  og = await overlayGeom();
  assert(og.top > 0 && og.top <= og.h * 0.81, `top-edge clip capped near 80% of height (${og.top} / ${og.h})`);
  await dragBy(0, 4000);
  og = await overlayGeom();
  assert(og.bottom > 0 && og.bottom <= og.h * 0.81, `bottom-edge clip capped near 80% of height (${og.bottom} / ${og.h})`);

  console.log("deploy-button arrows flip direction with the label (operator ask, 2026-09-10)");
  await ev(`document.querySelector('.ctt-selector-item[data-court-id="summary"]').click()`); await sleep(400);
  await ev(`[...document.querySelectorAll('.ctt-mode-opt')].find(b=>b.textContent==='District Courts').click()`); await sleep(600);
  const btnLabels = JSON.parse(await ev(`(() => {
    const btn = document.querySelector('.ctt-district-deploy-btn');
    const before = btn.textContent;
    btn.click();
    return JSON.stringify({ before, after: btn.textContent });
  })()`));
  await sleep(900);
  console.log("   btnLabels:", JSON.stringify(btnLabels));
  const arrowOf = (s) => s.trim()[0];
  assert(btnLabels.before !== btnLabels.after, "label text actually changed");
  assert(arrowOf(btnLabels.before) !== arrowOf(btnLabels.after),
    `arrow direction flips along with the label (before "${btnLabels.before}" after "${btnLabels.after}")`);
  assert((btnLabels.before.includes("Set upon map") && arrowOf(btnLabels.before) === "▼") ||
    (btnLabels.before.includes("Remove from map") && arrowOf(btnLabels.before) === "▲"),
    `"Set upon map" points down, "Remove from map" points up (got "${btnLabels.before}")`);

  console.log("ca1/ca3 drill-in sub-assemblies use the alternate arrangement; unaffected circuits/presentations don't (operator ask, 2026-09-10)");
  await ev(`document.querySelector('.ctt-pane-close').click()`); await sleep(400);
  await ev(`document.querySelector('.ctt-selector-item[data-court-id="ca1"]').click()`); await sleep(400);
  await ev(`document.querySelector('.ctt-drill').click()`); await sleep(1800);
  const ca1Alt = JSON.parse(await ev(`(() => {
    const sub = document.querySelector('.ctt-district-subassembly');
    return JSON.stringify({ exists: !!sub, prdCells: sub.querySelectorAll('[data-district-id="prd"]').length });
  })()`));
  assert(ca1Alt.exists && ca1Alt.prdCells === 7, `ca1's sub-assembly renders prd with all 7 cells from the alt arrangement (got ${JSON.stringify(ca1Alt)})`);
  await ev(`document.querySelector('.ctt-selector-back').click()`); await sleep(600);
  await ev(`document.querySelector('.ctt-selector-item[data-court-id="summary"]').click()`); await sleep(400);
  await ev(`[...document.querySelectorAll('.ctt-mode-opt')].find(b=>b.textContent==='District Courts').click()`); await sleep(600);
  const summaryPrdCells = await ev(`document.querySelectorAll('.ctt-summary-content .ctt-district-sq[data-district-id="prd"]').length`);
  assert(summaryPrdCells === 7, `Summary preview's prd is unaffected — still the MAIN arrangement, same cell count (got ${summaryPrdCells})`);

  console.log("REGRESSION (operator report, 2026-09-10): Summary > District's empty-hint text aligns with SCOTUS's own (not 2px lower)");
  await ev(`document.querySelector('.ctt-pane-close').click()`); await sleep(400);
  await ev(`document.querySelector('.ctt-selector-item[data-court-id="summary"]').click()`); await sleep(400);
  await ev(`[...document.querySelectorAll('.ctt-mode-opt')].find(b=>b.textContent==='Supreme Court').click()`); await sleep(400);
  const scotusHintTop = await ev(`document.querySelector('.ctt-detail:not(.ctt-district-detail) .ctt-detail-hint').getBoundingClientRect().top`);
  await ev(`[...document.querySelectorAll('.ctt-mode-opt')].find(b=>b.textContent==='District Courts').click()`); await sleep(600);
  const districtHintTop = await ev(`document.querySelector('.ctt-district-detail .ctt-detail-hint').getBoundingClientRect().top`);
  assert(scotusHintTop === districtHintTop, `empty-hint text starts at the SAME y-position in both sub-tabs (SCOTUS ${scotusHintTop} vs District ${districtHintTop})`);

  console.log("Summary > Supreme Court: FedSoc legend key sits right-aligned in the SAME horizontal band as the title/meta text (operator ask, 2026-09-11)");
  await ev(`[...document.querySelectorAll('.ctt-mode-opt')].find(b=>b.textContent==='Supreme Court').click()`); await sleep(400);
  const scotusHeaderGeom = JSON.parse(await ev(`(() => {
    const title = document.querySelector('.ctt-summary-subtitle'), key = document.querySelector('.ctt-scotus-affil-key');
    const t = title.getBoundingClientRect(), k = key.getBoundingClientRect();
    const content = document.querySelector('.ctt-summary-content').getBoundingClientRect();
    return JSON.stringify({ titleTop: t.top, titleBottom: t.bottom, keyTop: k.top, keyBottom: k.bottom, keyRight: k.right, contentRight: content.right });
  })()`));
  console.log("   scotusHeaderGeom:", JSON.stringify(scotusHeaderGeom));
  assert(scotusHeaderGeom.keyTop < scotusHeaderGeom.titleBottom && scotusHeaderGeom.keyBottom > scotusHeaderGeom.titleTop,
    "the key vertically overlaps the title's own row (same horizontal band)");
  assert(Math.abs(scotusHeaderGeom.keyRight - scotusHeaderGeom.contentRight) < 1, "the key is right-aligned to the panel's own right edge");

  console.log("header search bar: right-aligned in the title band, dropdown opens over the map, no horizontal overflow at mobile width");
  await ev(`document.querySelector('.ctt-pane-close')?.click()`); await sleep(300);
  const searchGeom = JSON.parse(await ev(`(() => {
    const header = document.querySelector('.ctt-header'), search = document.querySelector('.ctt-search');
    const h = header.getBoundingClientRect(), s = search.getBoundingClientRect();
    return JSON.stringify({ headerRight: h.right, searchRight: s.right, headerPaddingRight: parseFloat(getComputedStyle(header).paddingRight) });
  })()`));
  console.log("   searchGeom:", JSON.stringify(searchGeom));
  assert(Math.abs((searchGeom.headerRight - searchGeom.headerPaddingRight) - searchGeom.searchRight) < 1,
    "the search box's right edge sits flush against the header's own right padding (right-aligned)");

  await ev(`(() => { const i = document.querySelector('.ctt-search-input'); i.value = 'Sotomayor';
    i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await sleep(300);
  const dropdownGeom = JSON.parse(await ev(`(() => {
    const results = document.querySelector('.ctt-search-results'), input = document.querySelector('.ctt-search-input');
    const map = document.querySelector('.ctt-map-viewport');
    const r = results.getBoundingClientRect(), i = input.getBoundingClientRect(), m = map.getBoundingClientRect();
    return JSON.stringify({ open: results.classList.contains('ctt-is-open'), top: r.top, inputBottom: i.bottom,
      overMap: r.top < m.bottom && r.bottom > m.top, zIndex: getComputedStyle(results).zIndex });
  })()`));
  console.log("   dropdownGeom:", JSON.stringify(dropdownGeom));
  assert(dropdownGeom.open && dropdownGeom.top >= dropdownGeom.inputBottom, "the results dropdown opens BELOW the search input");
  assert(dropdownGeom.overMap, "the dropdown's vertical extent overlaps the map viewport (it must paint over the map, not behind it)");
  const rowOnTop = await ev(`(() => {
    const row = document.querySelector('.ctt-search-result'), r = row.getBoundingClientRect();
    const topEl = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!(topEl && topEl.closest('.ctt-search-result') === row);
  })()`);
  assert(rowOnTop, "a result row is the actual top-painted element at its own screen position (not covered by the map underneath)");
  await ev(`document.querySelector('.ctt-search-clear').click()`);

  await send("Emulation.setDeviceMetricsOverride", { width: 380, height: 700, deviceScaleFactor: 1, mobile: true });
  await sleep(400);
  const overflow380 = await ev(`document.querySelector('.ctt-root').scrollWidth - document.querySelector('.ctt-root').clientWidth`);
  assert(overflow380 <= 1, `no horizontal overflow in the title/search row at 380px width (scrollWidth-clientWidth=${overflow380})`);
  await send("Emulation.clearDeviceMetricsOverride", {});

  console.log("search result meta line: president/party wraps ABOVE the court label, but only when the line actually doesn't fit (operator ask, 2026-09-05)");
  await ev(`(() => { const i = document.querySelector('.ctt-search-input'); i.value = 'frederick heil';
    i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await sleep(300);
  const heilGeom = JSON.parse(await ev(`(() => {
    const meta = document.querySelector('.ctt-search-result .ctt-search-meta');
    const p = meta.querySelector('.ctt-search-president').getBoundingClientRect();
    const c = meta.querySelector('.ctt-search-court').getBoundingClientRect();
    return JSON.stringify({ presTop: p.top, courtTop: c.top, presLeft: p.left, courtLeft: c.left });
  })()`));
  console.log("   heilGeom (3-district roving judge, should wrap):", JSON.stringify(heilGeom));
  assert(heilGeom.courtTop > heilGeom.presTop + 2,
    `a 3-district roving judge's court label wraps BELOW the president chip (pres top ${heilGeom.presTop} vs court top ${heilGeom.courtTop})`);
  const heilSepHidden = await ev(`getComputedStyle(document.querySelector('.ctt-search-result .ctt-search-sep')).display === 'none'`);
  assert(heilSepHidden, "the '· ' joiner is hidden once wrapped — it would otherwise read as an orphaned bullet on its own line");
  await ev(`(() => { const i = document.querySelector('.ctt-search-input'); i.value = 'sotomayor';
    i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await sleep(300);
  const sotoGeom = JSON.parse(await ev(`(() => {
    const meta = document.querySelector('.ctt-search-result .ctt-search-meta');
    const p = meta.querySelector('.ctt-search-president').getBoundingClientRect();
    const c = meta.querySelector('.ctt-search-court').getBoundingClientRect();
    return JSON.stringify({ presTop: p.top, courtTop: c.top });
  })()`));
  console.log("   sotoGeom (short single-court row, should NOT wrap):", JSON.stringify(sotoGeom));
  assert(Math.abs(sotoGeom.courtTop - sotoGeom.presTop) < 2,
    `an ordinary short row stays on ONE line — no unnecessary wrap (pres top ${sotoGeom.presTop} vs court top ${sotoGeom.courtTop})`);
  const sotoSepVisible = await ev(`getComputedStyle(document.querySelector('.ctt-search-result .ctt-search-sep')).display !== 'none'`);
  assert(sotoSepVisible, "...and the '· ' joiner stays visible there, since it's genuinely inline");
  await ev(`document.querySelector('.ctt-search-clear').click()`);

  // Issue #7: the ~380px mobile layout had never been eyeballed in a real browser since Phase 1.
  // Resizing an existing CDP session (rather than a fresh Chrome launch) re-evaluates the
  // `max-width: 640px` layout media query in place. A large-bench court's Majority arc looked
  // "cut off" at first glance in manual screenshots — root-caused to `.ctt-pane-body`'s
  // intentional overflow-y:auto internal scroll (CLAUDE.md §6's "fixed outer widget height"), NOT
  // a clipping bug: confirmed the pane genuinely has more content than fits AND that scrolling it
  // actually reveals the rest, not just that a scrollbar exists cosmetically.
  console.log("mobile ~380px: majority arc's internal pane-scroll genuinely reaches every icon, no horizontal overflow anywhere");
  await send("Emulation.setDeviceMetricsOverride",
    { width: 380, height: 900, deviceScaleFactor: 1, mobile: true });
  await sleep(300);
  await ev(`document.querySelector('.ctt-selector-back')?.click()`); await sleep(600);
  await ev(`document.querySelector('.ctt-selector-item[data-court-id="ca8"]').click()`); await sleep(500);
  await ev(`[...document.querySelectorAll(".ctt-toggle")].find(b => b.textContent === "Majority")?.click()`);
  await sleep(700);
  const mobileScroll = JSON.parse(await ev(`(() => {
    const pane = document.querySelector(".ctt-pane-body");
    const icons = [...document.querySelectorAll(".ctt-judge")];
    const paneRectBefore = pane.getBoundingClientRect();
    const before = icons[icons.length - 1].getBoundingClientRect().bottom - paneRectBefore.bottom;
    pane.scrollTop = pane.scrollHeight;
    const paneRectAfter = pane.getBoundingClientRect();
    const after = icons[icons.length - 1].getBoundingClientRect().bottom - paneRectAfter.bottom;
    return JSON.stringify({
      hasOverflow: pane.scrollHeight > pane.clientHeight,
      // Icon bottom relative to the PANE's own bottom edge (both viewport-relative coordinates
      // already, so this subtraction is apples-to-apples) — positive means still below the fold.
      overflowPxBefore: Math.round(before), overflowPxAfter: Math.round(after),
      docOverflowsX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    });
  })()`));
  assert(mobileScroll.hasOverflow,
    "the pane genuinely has more bench content than fits at once at 380px (this is expected, not a bug)");
  assert(mobileScroll.overflowPxBefore > 0,
    `sanity check: before scrolling, the last icon really is below the pane's fold (${mobileScroll.overflowPxBefore}px past it)`);
  assert(mobileScroll.overflowPxAfter <= 1,
    `scrolling the pane to its end actually brings the last icon fully into view (${mobileScroll.overflowPxBefore}px past the fold -> ${mobileScroll.overflowPxAfter}px)`);
  assert(!mobileScroll.docOverflowsX, "no horizontal overflow anywhere on the page at 380px width");

  console.log("REGRESSION (issue #50): Summary > SCOTUS FedSoc key (mobile only) and the tri-selector (every width) no longer overlap the title/pane buttons");
  await ev(`document.querySelector('.ctt-selector-back')?.click()`); await sleep(500);
  await ev(`document.querySelector('.ctt-selector-item[data-court-id="summary"]').click()`); await sleep(400);
  await ev(`[...document.querySelectorAll('.ctt-mode-opt')].find(b=>b.textContent==='Supreme Court')?.click()`); await sleep(400);
  const checkBug2 = async (w) => {
    // A tab click focuses the <button>, which Chrome's default focus-scroll behavior can nudge
    // into view within .ctt-pane-body's own scroll container — an artifact of the test's click,
    // not a real layout issue. Force it back to the top before measuring, matching what a reader
    // who simply opens Summary fresh (never scrolled) actually sees.
    await ev(`document.querySelector('.ctt-pane-body').scrollTop = 0`);
    const bug2 = JSON.parse(await ev(`(() => {
      // The operator's own spec explicitly tolerates the tab's PADDED BUTTON BOX overlapping the
      // close/stow circles — only the actual glyph pixels touching is the real bug ("some overlap
      // is acceptable, it just depends if it touches the text"). A Range around the tab's text
      // content gives the tight box around the rendered glyphs, excluding the button's own
      // padding, which is what actually needs to clear the circles.
      const tabs = [...document.querySelectorAll('.ctt-summary-switch .ctt-mode-opt')];
      const lastTab = tabs[tabs.length - 1];
      const range = document.createRange();
      range.selectNodeContents(lastTab);
      const text = range.getBoundingClientRect();
      const close = document.querySelector('.ctt-pane-close').getBoundingClientRect();
      const stow = document.querySelector('.ctt-pane-stowtop').getBoundingClientRect();
      const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      return JSON.stringify({ closeOverlap: overlaps(text, close), stowOverlap: overlaps(text, stow) });
    })()`));
    assert(!bug2.closeOverlap && !bug2.stowOverlap,
      `[${w}px] bug 2: the tri-selector's last tab does not overlap the close/stow buttons`);
  };
  // Bug 1's fix is mobile-only (the FedSoc key shares the desktop title's header band on purpose
  // — see the "sits right-aligned in the SAME horizontal band" check earlier in this file, which
  // asserts the OPPOSITE at desktop width); bug 2's fix applies at every width per the operator
  // (2026-09-08) — sweep the mobile breakpoint's own range (a phone wide enough to exceed 640px in
  // landscape leaves it entirely) plus two ordinary desktop widths, checking bug 2 at all five and
  // bug 1 only within the breakpoint.
  for (const [w, h] of [[380, 700], [480, 700], [600, 700]]) {
    await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: true });
    await sleep(300);
    await ev(`document.querySelector('.ctt-pane-body').scrollTop = 0`);
    const bug1 = JSON.parse(await ev(`(() => {
      const title = document.querySelector('.ctt-summary-subtitle'), meta = document.querySelector('.ctt-pane-meta'),
        key = document.querySelector('.ctt-scotus-affil-key');
      const t = title.getBoundingClientRect(), m = meta.getBoundingClientRect(), k = key.getBoundingClientRect();
      return JSON.stringify({ titleBottom: t.bottom, metaBottom: m.bottom, keyTop: k.top });
    })()`));
    assert(bug1.keyTop >= bug1.titleBottom - 1 && bug1.keyTop >= bug1.metaBottom - 1,
      `[${w}px] bug 1: FedSoc key sits below the title/meta (keyTop ${bug1.keyTop} vs titleBottom ${bug1.titleBottom}, metaBottom ${bug1.metaBottom})`);
    await checkBug2(w);
  }
  await send("Emulation.clearDeviceMetricsOverride");
  await sleep(300);
  for (const w of [900, 1180]) {
    await send("Emulation.setDeviceMetricsOverride", { width: w, height: 800, deviceScaleFactor: 1, mobile: false });
    await sleep(300);
    await checkBug2(w);
  }
  await send("Emulation.clearDeviceMetricsOverride");

  console.log("issue #50: judge-icon collision avoidance");
  await ev(`document.querySelector('.ctt-pane-close')?.click()`); await sleep(300);
  {
    // Step 0: a name that would render as two wrapped lines under its icon (Nitza Ileana
    // Quiñones Alejandro, paed — the longest display_name in the current dataset) switches to
    // its full distinct-name-initials instead, on ANY width — nothing here is mobile-gated.
    await ev(`document.querySelector('.ctt-selector-item[data-court-id="ca3"]')?.click()`); await sleep(500);
    await ev(`document.querySelector('.ctt-drill')?.click()`); await sleep(1800);
    await ev(`document.querySelector('.ctt-selector-item[data-court-id="paed"]')?.click()`); await sleep(600);
    await ev(`[...document.querySelectorAll(".ctt-toggle")].find(b => b.textContent === "Majority")?.click()`); await sleep(700);
    const step0 = await ev(`(() => {
      const node = [...document.querySelectorAll('.ctt-judge')].find(n => /Quiñones/.test(n._judge?.full_name || ''));
      if (!node) return JSON.stringify({ found: false });
      const label = node.querySelector('.ctt-judge-label');
      return JSON.stringify({ found: true, text: label.textContent,
        lines: Math.round(label.getBoundingClientRect().height / 12) });
    })()`);
    const s0 = JSON.parse(step0);
    assert(s0.found, "the longest real display_name in the dataset (paed) is on the bench to check");
    assert(s0.text === "NIQA", `Step 0 swapped the would-wrap label to full distinct-name-initials (got "${s0.text}")`);

    console.log("  no label overlaps a neighboring icon by more than a small buffer, on a large real bench (paed, desktop)");
    const overlapReport = await ev(`(() => {
      const icons = [...document.querySelectorAll('.ctt-judge-stage .ctt-judge')]
        .filter(n => !n.classList.contains('ctt-vacant') && !n.classList.contains('ctt-justice'));
      let worst = 0;
      for (const a of icons) {
        const lr = a.querySelector('.ctt-judge-label').getBoundingClientRect();
        for (const b of icons) {
          if (a === b) continue;
          const br = b.querySelector('.ctt-avatar').getBoundingClientRect();
          const ox = Math.min(lr.right, br.right) - Math.max(lr.left, br.left);
          const oy = Math.min(lr.bottom, br.bottom) - Math.max(lr.top, br.top);
          if (ox > 0 && oy > 0) worst = Math.max(worst, Math.min(ox, oy));
        }
      }
      return worst;
    })()`);
    // A generous ceiling, not a tight one: this asserts the algorithm keeps residual overlap
    // SMALL (no egregious text-buried-in-a-neighboring-icon case), not that it hits zero — the
    // spec's own Step 3 stops at a size floor and accepts the best result found, so a few px of
    // buffer-tolerated overlap on a genuinely crowded real bench is expected, not a regression.
    assert(overlapReport < 12, `worst remaining label/icon overlap stays small (${overlapReport}px)`);
  }

  console.log("issue #50 follow-up: the senior 'show' band gets its own scoped RADIUS growth (never inflates active-ring radii), capped at Rmax, sharing one whole-bench SCALE if a shrink is ever needed");
  {
    // ca9 (22 seniors, the dataset's largest band) is where the Rmax-overshoot bug was originally
    // caught: active-ring growth (needed regardless, to resolve real crowding) plus a fixed
    // `+ROW_GAP` band offset could together exceed Rmax with no cap at all.
    await ev(`document.querySelector('.ctt-selector-back')?.click()`); await sleep(400);
    await ev(`document.querySelector('.ctt-selector-item[data-court-id="ca9"]')?.click()`); await sleep(600);
    await ev(`[...document.querySelectorAll(".ctt-toggle")].find(b => b.textContent === "Majority")?.click()`); await sleep(700);
    await ev(`document.querySelector('.ctt-toggle[data-senior="show"]')?.click()`); await sleep(700);
    const bandReport = await ev(`(() => {
      const stage = document.querySelector('.ctt-judge-stage');
      const model = stage._model, ar = model._arcRender;
      const stageR = stage.getBoundingClientRect();
      const seniors = [...stage.querySelectorAll('.ctt-judge.ctt-senior')].filter((n) => getComputedStyle(n).opacity !== '0');
      const actives = [...stage.querySelectorAll('.ctt-judge:not(.ctt-senior):not(.ctt-vacant):not(.ctt-justice)')];
      let minTop = Infinity;
      for (const n of seniors) minTop = Math.min(minTop, n.getBoundingClientRect().top);
      // Read each icon's OWN scale straight off its live transform, rather than trusting
      // internal state, so this is a check on what's actually rendered.
      const scaleOf = (n) => { const m = /scale\\(([\\d.]+)\\)/.exec(n.style.transform); return m ? +m[1] : 1; };
      const seniorScales = [...new Set(seniors.map(scaleOf).map((s) => s.toFixed(2)))];
      const activeScales = [...new Set(actives.map(scaleOf).map((s) => s.toFixed(2)))];
      return JSON.stringify({
        bandR: ar.bandR, Rmax: Math.max(60, ar.cy - 30), stageTop: stageR.top, minTop,
        seniorCount: seniors.length, seniorScales, activeScales,
      });
    })()`);
    const br = JSON.parse(bandReport);
    assert(br.seniorCount >= 15, `ca9's senior band is really on the bench for this check (got ${br.seniorCount})`);
    assert(br.bandR <= br.Rmax + 1, `bandR stays within Rmax (bandR ${br.bandR.toFixed(1)} vs Rmax ${br.Rmax.toFixed(1)})`);
    assert(br.minTop >= br.stageTop - 2, `no senior icon renders above the stage's own top edge (icon top ${br.minTop.toFixed(1)} vs stage top ${br.stageTop.toFixed(1)})`);
    // Not "every icon is exactly 1x" (a genuinely crowded bench may need Step 3 for everyone) —
    // specifically that senior icons and active icons are never at DIFFERENT scales from each
    // other, which would mean the band shrank alone while the rest of the bench didn't (or vice
    // versa) — a real, confirmed bug this asserts against regressing.
    assert(br.seniorScales.length === 1 && br.activeScales.length === 1 && br.seniorScales[0] === br.activeScales[0],
      `senior and active icons share ONE scale, never two different ones (senior ${JSON.stringify(br.seniorScales)}, active ${JSON.stringify(br.activeScales)})`);
  }

  console.log("issue #60: the senior band must never compress against the outer active ring below a ROW_GAP floor, even when Hide fits with no scroll but Show would need slightly more room");
  {
    // Mirrors embed/court-tracker.js's own `ROW_GAP` constant — this test script runs as a
    // separate Node process driving the page over CDP, with no access to the module's internal
    // values, so this must be kept in sync by hand if ROW_GAP's source value ever changes.
    const ROW_GAP = 50;
    // Real device widths (412/428) where the compression bug reproduced across nearly every
    // circuit with a senior band, before the fix: Hide fit with zero scrollbar, but Show's
    // `bandR` target (outermostActiveR + ROW_GAP) exceeded the pane's width budget just enough
    // that the old unconditional `Math.min(bandR, effectiveMax)` clamp compressed the gap to a
    // few px instead of falling back to scroll.
    const checkFloor = async (court, w) => {
      await send("Emulation.setDeviceMetricsOverride", { width: w, height: 900, deviceScaleFactor: 1, mobile: true });
      await sleep(300);
      await ev(`document.querySelector('.ctt-selector-back')?.click()`); await sleep(200);
      await ev(`document.querySelector('.ctt-selector-item[data-court-id="${court}"]')?.click()`); await sleep(400);
      await ev(`[...document.querySelectorAll(".ctt-toggle")].find(b => b.textContent === "Majority")?.click()`); await sleep(300);
      await ev(`document.querySelector('.ctt-toggle[data-senior="hide"]')?.click()`); await sleep(400);
      const hide = JSON.parse(await ev(`(() => {
        const stage = document.querySelector('.ctt-judge-stage');
        return JSON.stringify({ scrollWidth: stage.scrollWidth, clientWidth: stage.clientWidth });
      })()`));
      assert(hide.scrollWidth <= hide.clientWidth + 1,
        `${court}/${w}px: Seniors:Hide fits with no scrollbar (precondition for this test to be meaningful; got scrollWidth ${hide.scrollWidth} vs clientWidth ${hide.clientWidth})`);
      await ev(`document.querySelector('.ctt-toggle[data-senior="show"]')?.click()`); await sleep(400);
      const report = JSON.parse(await ev(`(() => {
        const stage = document.querySelector('.ctt-judge-stage');
        const model = stage._model, ar = model._arcRender;
        const outerActiveR = ar.radii[ar.radii.length - 1];
        // Real circular hitbox check (operator question, issue #60): actual center-to-center
        // distance between every active/band icon pair vs the sum of their real rendered radii
        // (.ctt-avatar's own rect, which is the true circle — not a bounding-box approximation).
        const activeIcons = [...stage.querySelectorAll('.ctt-judge:not(.ctt-senior):not(.ctt-vacant):not(.ctt-justice)')];
        const bandIcons = [...stage.querySelectorAll('.ctt-judge.ctt-senior')].filter(n => getComputedStyle(n).opacity !== '0');
        const circle = (n) => { const r = n.querySelector('.ctt-avatar').getBoundingClientRect(); return { x: r.left + r.width/2, y: r.top + r.height/2, radius: r.width/2 }; };
        const activeCircles = activeIcons.map(circle), bandCircles = bandIcons.map(circle);
        let worstPenetration = 0;
        for (const a of activeCircles) for (const b of bandCircles) {
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          worstPenetration = Math.max(worstPenetration, (a.radius + b.radius) - dist);
        }
        return JSON.stringify({ bandR: ar.bandR, outerActiveR, gap: ar.bandR - outerActiveR, worstActiveBandPenetration: worstPenetration });
      })()`));
      assert(report.gap >= ROW_GAP - 1,
        `${court}/${w}px: band-to-bench gap stays at the ROW_GAP floor, not compressed (gap ${report.gap.toFixed(1)}, bandR ${report.bandR.toFixed(1)}, outerActiveR ${report.outerActiveR.toFixed(1)})`);
      assert(report.worstActiveBandPenetration <= 0,
        `${court}/${w}px: no active-ring icon circle actually overlaps a band icon circle (worst penetration ${report.worstActiveBandPenetration.toFixed(1)}px — real center-to-center distance vs sum of real radii, not a bounding-box approximation)`);
    };
    // Confirmed compressed pre-fix: ca2 and ca8 at 412px, ca6 at 428px (issue #60's own repro sweep).
    await checkFloor("ca2", 412);
    await checkFloor("ca8", 412);
    await checkFloor("ca6", 428);
    await send("Emulation.clearDeviceMetricsOverride");
    await sleep(300);

    // Regression guard: the "Hide already scrolls" case must stay unaffected (gap stays at the
    // full floor even though the bench itself already overflows far more than the gap alone).
    await send("Emulation.setDeviceMetricsOverride", { width: 340, height: 900, deviceScaleFactor: 1, mobile: true });
    await sleep(300);
    await ev(`document.querySelector('.ctt-selector-item[data-court-id="ca9"]')?.click()`); await sleep(400);
    await ev(`[...document.querySelectorAll(".ctt-toggle")].find(b => b.textContent === "Majority")?.click()`); await sleep(300);
    await ev(`document.querySelector('.ctt-toggle[data-senior="hide"]')?.click()`); await sleep(400);
    const alreadyOverflows = JSON.parse(await ev(`(() => {
      const stage = document.querySelector('.ctt-judge-stage');
      return JSON.stringify({ scrollWidth: stage.scrollWidth, clientWidth: stage.clientWidth });
    })()`));
    assert(alreadyOverflows.scrollWidth > alreadyOverflows.clientWidth + 20,
      `ca9/340px: Seniors:Hide genuinely already overflows, so this is a real test of the OTHER regime (scrollWidth ${alreadyOverflows.scrollWidth} vs clientWidth ${alreadyOverflows.clientWidth})`);
    await ev(`document.querySelector('.ctt-toggle[data-senior="show"]')?.click()`); await sleep(400);
    const stillHealthy = JSON.parse(await ev(`(() => {
      const stage = document.querySelector('.ctt-judge-stage');
      const ar = stage._model._arcRender;
      const outerActiveR = ar.radii[ar.radii.length - 1];
      return JSON.stringify({ gap: ar.bandR - outerActiveR });
    })()`));
    assert(stillHealthy.gap >= ROW_GAP - 1,
      `ca9/340px (Hide already overflowing): band-to-bench gap stays healthy, unaffected by this fix (gap ${stillHealthy.gap.toFixed(1)})`);
    await send("Emulation.clearDeviceMetricsOverride");
  }

  console.log("issue #62: the senior band must never clip above the stage's own top edge — a width-window where the old flat collision tally let the Step-3 search settle for a scale that still violated Rmax");
  {
    // 602-637px is exactly where embed/court-tracker.css's one layout breakpoint (max-width:640px)
    // switches the widget from its desktop side-by-side layout to the stacked mobile one — the
    // pane genuinely has less vertical room there, tightening Rmax while Wmax stays comparatively
    // loose. The old flat remaining-count tie-break could settle on a scale whose bandR badly
    // overshot Rmax, purely because a later, better-on-Rmax scale only TIED the old count instead
    // of strictly improving it (confirmed live via a temporarily-instrumented resolveAt trace).
    const checkNoClip = async (label) => {
      const r = JSON.parse(await ev(`(() => {
        const stage = document.querySelector('.ctt-judge-stage');
        const model = stage._model, ar = model._arcRender;
        const stageR = stage.getBoundingClientRect();
        const icons = [...stage.querySelectorAll('.ctt-judge')].filter(n => !n.classList.contains('ctt-vacant') && !n.classList.contains('ctt-justice') && getComputedStyle(n).opacity !== '0');
        let minTop = Infinity;
        for (const n of icons) minTop = Math.min(minTop, n.getBoundingClientRect().top);
        return JSON.stringify({ bandR: ar.bandR, outerActiveR: ar.radii[ar.radii.length - 1], stageTop: stageR.top, minTop });
      })()`));
      assert(r.minTop >= r.stageTop - 2,
        `${label}: no icon renders above the stage's own top edge (icon top ${r.minTop.toFixed(1)} vs stage top ${r.stageTop.toFixed(1)})`);
    };

    await send("Emulation.setDeviceMetricsOverride", { width: 620, height: 900, deviceScaleFactor: 1, mobile: true });
    await sleep(400);
    await ev(`document.querySelector('.ctt-selector-back')?.click()`); await sleep(300);
    await ev(`document.querySelector('.ctt-selector-item[data-court-id="ca9"]')?.click()`); await sleep(500);
    await ev(`[...document.querySelectorAll(".ctt-toggle")].find(b => b.textContent === "Majority")?.click()`); await sleep(300);
    await ev(`document.querySelector('.ctt-toggle[data-senior="show"]')?.click()`); await sleep(500);
    await checkNoClip("ca9/620px/Show");

    // cacd (Central District of California) is under ca9 and was ALSO confirmed clipping at this
    // width before the fix — reached via real drill-in navigation (a district court isn't a
    // top-level selector item; a bare click on its own data-court-id silently no-ops otherwise).
    await ev(`document.querySelector('.ctt-drill')?.click()`); await sleep(1800);
    await ev(`document.querySelector('.ctt-selector-item[data-court-id="cacd"]')?.click()`); await sleep(600);
    await ev(`[...document.querySelectorAll(".ctt-toggle")].find(b => b.textContent === "Majority")?.click()`); await sleep(300);
    await ev(`document.querySelector('.ctt-toggle[data-senior="show"]')?.click()`); await sleep(500);
    await checkNoClip("cacd/620px/Show");
    await send("Emulation.clearDeviceMetricsOverride");

    // Regression guard, found live during this fix: bandR is always computed
    // (outermostActiveR + ROW_GAP) even when no band is actually RENDERED (Hide/Include) — that
    // phantom value must never count toward the Rmax-violation tier, or a purely hypothetical
    // "the unrendered band would have exceeded Rmax" forces real, unnecessary shrinking. cacd/Hide
    // at desktop width previously (incorrectly) shrank to 0.80 with room clearly still available.
    await sleep(300);
    await ev(`document.querySelector('.ctt-toggle[data-senior="hide"]')?.click()`); await sleep(500);
    const hideScale = await ev(`(() => {
      const n = [...document.querySelectorAll('.ctt-judge')].find(n => !n.classList.contains('ctt-vacant') && !n.classList.contains('ctt-justice') && getComputedStyle(n).opacity !== '0');
      const m = /scale\\(([\\d.]+)\\)/.exec(n?.style.transform || '');
      return m ? +m[1] : 1;
    })()`);
    assert(hideScale === 1, `cacd/Hide at desktop width doesn't shrink unnecessarily — no band is even rendered in this mode (got scale ${hideScale})`);
  }

  console.log("Majority view scrolls horizontally to reach seats that would otherwise bleed off either edge — covers both Include's own crowding and the senior band's");
  {
    await send("Emulation.setDeviceMetricsOverride", { width: 380, height: 900, deviceScaleFactor: 1, mobile: true });
    await sleep(400);
    console.log("  Include mode (already selected on ca9): both edges reachable by scroll");
    await ev(`document.querySelector('.ctt-toggle[data-senior="include"]')?.click()`); await sleep(700);

    // Regression guard: adding a width constraint (Wmax, below) to fix the desktop scrollbar bug
    // initially broke THIS — passing the tighter width-aware ceiling into planRings' own
    // ring-COUNT decision could collapse a genuinely multi-ring bench (51 combined judges here)
    // down to a single ring on a narrow viewport, since ring count doesn't change with icon scale
    // and nothing in the Step-3 shrink search can undo a ring-count decision made before it runs.
    // Confirmed as a real, severe regression (screenshot: the arc effectively stopped rendering
    // anything readable) before `planRings` was changed back to using plain `Rmax` for ring count.
    const ringCount = await ev(`document.querySelector('.ctt-judge-stage')._model._arcRender.radii.length`);
    assert(ringCount >= 3, `ca9/Include at 380px still plans multiple rings, not collapsed to one by the width constraint (got ${ringCount})`);

    const checkBothEdges = async (label) => {
      const before = JSON.parse(await ev(`(() => {
        const stage = document.querySelector('.ctt-judge-stage');
        return JSON.stringify({ scrollWidth: stage.scrollWidth, clientWidth: stage.clientWidth, hasScrollClass: stage.classList.contains('ctt-majority-scroll') });
      })()`));
      assert(before.hasScrollClass, `${label}: the stage carries ctt-majority-scroll in Majority mode`);
      assert(before.scrollWidth > before.clientWidth + 20,
        `${label}: genuinely overflows horizontally at 380px, so this is a real test (scrollWidth ${before.scrollWidth} vs clientWidth ${before.clientWidth})`);
      const left = JSON.parse(await ev(`(() => {
        const stage = document.querySelector('.ctt-judge-stage');
        stage.scrollLeft = 0;
        const stageL = stage.getBoundingClientRect().left;
        const icons = [...stage.querySelectorAll('.ctt-judge')].filter((n) => !n.classList.contains('ctt-vacant') && getComputedStyle(n).opacity !== '0');
        let minLeft = Infinity;
        for (const n of icons) minLeft = Math.min(minLeft, n.querySelector('.ctt-judge-label').getBoundingClientRect().left);
        return JSON.stringify({ stageL, minLeft });
      })()`));
      assert(left.minLeft >= left.stageL - 2, `${label}: scrolled fully left, no label sits left of the stage's own edge (label left ${left.minLeft.toFixed(1)} vs stage left ${left.stageL.toFixed(1)})`);
      const right = JSON.parse(await ev(`(() => {
        const stage = document.querySelector('.ctt-judge-stage');
        stage.scrollLeft = stage.scrollWidth - stage.clientWidth;
        const stageR = stage.getBoundingClientRect().right;
        const icons = [...stage.querySelectorAll('.ctt-judge')].filter((n) => !n.classList.contains('ctt-vacant') && getComputedStyle(n).opacity !== '0');
        let maxRight = -Infinity;
        for (const n of icons) maxRight = Math.max(maxRight, n.querySelector('.ctt-judge-label').getBoundingClientRect().right);
        return JSON.stringify({ stageR, maxRight });
      })()`));
      assert(right.maxRight <= right.stageR + 2, `${label}: scrolled fully right, no label sits right of the stage's own edge (label right ${right.maxRight.toFixed(1)} vs stage right ${right.stageR.toFixed(1)})`);
    };
    await checkBothEdges("Include");

    console.log("  Show mode: the senior band (deliberately not collision-checked against active rings) is still reachable both directions");
    await ev(`document.querySelector('.ctt-toggle[data-senior="show"]')?.click()`); await sleep(700);
    await checkBothEdges("Show");

    console.log("  Timeline mode never gets the scroll class (this is Majority-only)");
    await ev(`[...document.querySelectorAll(".ctt-toggle")].find(b => b.textContent === "Timeline")?.click()`); await sleep(500);
    const timelineHasClass = await ev(`document.querySelector('.ctt-judge-stage').classList.contains('ctt-majority-scroll')`);
    assert(!timelineHasClass, "Timeline's stage does not carry ctt-majority-scroll");
    await send("Emulation.clearDeviceMetricsOverride");
  }

  console.log("Majority view shows NO scrollbar at the default/largest width for an ordinary court (geometry-driven, not a fixed breakpoint — an 'ideal fit' at desktop)");
  {
    await ev(`document.querySelector('.ctt-selector-back')?.click()`); await sleep(400);
    await ev(`document.querySelector('.ctt-selector-item[data-court-id="ca8"]')?.click()`); await sleep(600);
    await ev(`[...document.querySelectorAll(".ctt-toggle")].find(b => b.textContent === "Majority")?.click()`); await sleep(700);
    const fit = await ev(`(() => {
      const stage = document.querySelector('.ctt-judge-stage');
      return JSON.stringify({ scrollWidth: stage.scrollWidth, clientWidth: stage.clientWidth });
    })()`);
    const f = JSON.parse(fit);
    assert(f.scrollWidth <= f.clientWidth + 1, `an ordinary court (ca8) at desktop width has no horizontal overflow at all (scrollWidth ${f.scrollWidth} vs clientWidth ${f.clientWidth})`);

    // The extreme case, not just an ordinary one: ca9 (the dataset's largest bench) at desktop
    // width used to still show a scrollbar even after Rmax-only growth successfully resolved
    // every label/icon collision — because nothing about "the arc is wider than the pane" ever
    // counted as a reason to invoke Step 3 (issue #50's OWN text: growth "must stay within the
    // size of the actual user-viewable area," which is not height alone). Checked across all
    // three Seniors modes, since Include and Show reach this width differently.
    console.log("  ...and the SAME holds for ca9 (the dataset's largest bench) at desktop width, across all three Seniors modes — the case originally reported");
    await ev(`document.querySelector('.ctt-selector-item[data-court-id="ca9"]')?.click()`); await sleep(600);
    await ev(`[...document.querySelectorAll(".ctt-toggle")].find(b => b.textContent === "Majority")?.click()`); await sleep(700);
    for (const mode of ["hide", "include", "show"]) {
      await ev(`document.querySelector('.ctt-toggle[data-senior="${mode}"]')?.click()`); await sleep(500);
      const r = JSON.parse(await ev(`(() => {
        const stage = document.querySelector('.ctt-judge-stage');
        return JSON.stringify({ scrollWidth: stage.scrollWidth, clientWidth: stage.clientWidth });
      })()`));
      assert(r.scrollWidth <= r.clientWidth + 1, `ca9/${mode} at desktop width has no horizontal overflow (scrollWidth ${r.scrollWidth} vs clientWidth ${r.clientWidth})`);
    }
  }

  console.log("  a resize after initial mount doesn't leave Summary > SCOTUS's ring wrongly stuck on initials (regression: stale-transform double-scaling bug)");
  await ev(`document.querySelector('.ctt-selector-back')?.click()`); await sleep(400);
  await ev(`document.querySelector('.ctt-selector-item[data-court-id="summary"]')?.click()`); await sleep(600);
  await send("Emulation.setDeviceMetricsOverride", { width: 380, height: 900, deviceScaleFactor: 1, mobile: true });
  await sleep(500);
  const scotusAfterResize = await ev(`JSON.stringify([...document.querySelectorAll('.ctt-judge-stage .ctt-judge:not(.ctt-vacant)')]
    .map(n => n.querySelector('.ctt-judge-label').textContent))`);
  const labels = JSON.parse(scotusAfterResize);
  assert(labels.includes("Gorsuch") && labels.includes("Kagan"),
    `a resize to 380px doesn't force SCOTUS's short surnames to initials when they fit fine (got ${JSON.stringify(labels)})`);
  await send("Emulation.clearDeviceMetricsOverride");
} catch (e) { console.log("*** ", e.message); failures++; }
finally { try { ws && ws.close(); } catch {} chrome.kill(); }

console.log(`\n${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"}`);
process.exit(failures === 0 ? 0 : 1);
