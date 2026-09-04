// Headless smoke test for court-tracker.js via jsdom (DEV-ONLY; the runtime widget
// itself has zero dependencies). Drives the full Phase-1 flow and asserts DOM outcomes:
// mount -> national selector -> select ca8 -> bench counts/vacancies/seniors/chief/justice
// -> same-surname disambiguation -> hover detail + same-president highlight -> majority
// toggle (x/y over active, fold seniors) -> drill into districts -> district pane -> back.
//
// Requires jsdom on the module resolution path. Run e.g.:
//   npm i jsdom && node tests/smoke.mjs
// (or from a dir where `jsdom` resolves). Exits non-zero on any failed assertion.
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { fileURLToPath } from "node:url";
const REPO = fileURLToPath(new URL("..", import.meta.url));
const MODULE = REPO + "/embed/court-tracker.js";

const dom = new JSDOM(`<!DOCTYPE html><body><div id="court-tracker-root"></div></body>`, {
  url: "https://example.test/host/",
  pretendToBeVisual: true,
});
const { window } = dom;
globalThis.window = window;
globalThis.document = window.document;
globalThis.Node = window.Node;
globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
globalThis.CSS = window.CSS || { escape: (s) => s };
if (!globalThis.CSS.escape) globalThis.CSS.escape = (s) => s;
globalThis.localStorage = window.localStorage;   // for the district-overlay zoom-persistence test

// Map the module's import.meta.url-relative fetches back to files on disk.
globalThis.fetch = async (u) => {
  // Module resolves assets against its own file:// URL -> u is a file:// URL whose
  // pathname is the absolute on-disk path.
  const file = decodeURIComponent(new URL(u).pathname);
  try {
    const body = readFileSync(file, "utf8");
    return { ok: true, status: 200, json: async () => JSON.parse(body), text: async () => body };
  } catch {
    return { ok: false, status: 404, json: async () => ({}), text: async () => "" };
  }
};

// The contract requires the app to log which circuits fall back from the morph; capture it.
const fellBack = [];
const _info = console.info;
console.info = (...a) => {
  const m = /^\[court-tracker\] (\w+): vertex morph unavailable/.exec(String(a[0]));
  if (m) fellBack.push(m[1]); else _info(...a);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// The morph is time-based, so poll for the settled state instead of guessing a sleep.
async function waitFor(cond, timeout = 2000) {
  const t0 = Date.now();
  while (!cond() && Date.now() - t0 < timeout) await sleep(15);
  return cond();
}
let failures = 0;
function assert(cond, msg) {
  if (cond) { console.log("  ✓ " + msg); }
  else { console.log("  ✗ " + msg); failures++; }
}
function click(elm) {
  elm.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
}
function hover(elm) {
  elm.dispatchEvent(new window.MouseEvent("mouseenter", { bubbles: true }));
}

// Neutralize the module's top-level autoMount so it doesn't race our explicit mount
// (production runs autoMount exactly once; the test drives mount itself).
const root = document.getElementById("court-tracker-root");
root.dataset.cttMounted = "1";
// import.meta.url inside the module resolves relative to MODULE's file URL:
const mod = await import(pathToFileURL(MODULE).href);

console.log("mount + national view");
await mod.mount(root);
await sleep(30);
const allItems = root.querySelectorAll(".ctt-selector .ctt-selector-item");
assert(allItems.length === 14, `selector lists Summary + 13 circuits (got ${allItems.length})`);
assert(allItems[0].getAttribute("data-court-id") === "summary", "Summary is the first selector entry");
const circuitItems = [...allItems].filter((i) => i.getAttribute("data-court-id") !== "summary");
assert(root.querySelector(".ctt-svg-layer svg"), "national SVG injected");
const g = root.querySelector(".ctt-svg-layer svg g");
assert(/scale\(1,-1\) translate\(0, -?\d/.test(g.getAttribute("transform")) && !g.getAttribute("transform").includes("--"),
  `Y-flip transform normalized (no double-negative): ${g.getAttribute("transform")}`);

console.log("circuit hover outlines its insets (#1)");
const ca9shape = root.querySelector('path[data-court-id="ca9"][data-layer="circuit"]');
hover(ca9shape);
const ovlD = root.querySelector(".ctt-hover-overlay").getAttribute("d");
const ca9OwnMs = (ca9shape.getAttribute("d").match(/M/g) || []).length;
const ovlMs = (ovlD.match(/M/g) || []).length;
assert(ovlMs > ca9OwnMs, `9th Circuit hover overlay includes inset subpaths (overlay ${ovlMs} M-cmds > ca9 ${ca9OwnMs})`);

console.log("national rendering: circuit outlines on top (#12) + non-interactive mainland (#2)");
const outlineClones = root.querySelectorAll(".ctt-svg-layer .ctt-circuit-outline");
assert(outlineClones.length === 12, `circuit outline clones drawn on top (got ${outlineClones.length}, want 12)`);
const mnd = root.querySelector('.ctt-national-layer path[data-court-id="mnd"]');
assert(mnd && !mnd.classList.contains("ctt-shape"), "mainland district (mnd) is not map-interactive in national view");
const paddedVB = root.querySelector(".ctt-svg-layer svg").getAttribute("viewBox").split(/\s+/).map(Number);
assert(paddedVB.length === 4 && paddedVB[2] > 4966623, `viewBox padded for stroke buffer (#14): width ${paddedVB[2]} > raw 4966623`);

console.log("select 8th Circuit");
const ca8Item = [...circuitItems].find((i) => i.getAttribute("data-court-id") === "ca8");
assert(ca8Item, "ca8 selector item present");
click(ca8Item);
await sleep(50);
assert(root.querySelector(".ctt-pane").classList.contains("ctt-is-open"), "info pane opened");
const meta = root.querySelector(".ctt-pane-meta").textContent;
// Real data changes over time — assert the structure + internal arithmetic, not fixed counts.
const m = meta.match(/(\d+) authorized · (\d+) active · (\d+) senior · (\d+) vacant/);
assert(m, `bench meta well-formed: "${meta}"`);
const [, mAuth, mAct, mSen, mVac] = (m || []).map(Number);
assert(mAuth === 11, `ca8 authorized = 11 (statute): ${mAuth}`);
assert(mVac === Math.max(0, mAuth - mAct), `vacancy arithmetic holds (${mVac} = max(0, ${mAuth}-${mAct}))`);
assert(mSen >= 1, `at least one senior on ca8 (${mSen})`);
const icons = root.querySelectorAll(".ctt-judge-stage .ctt-judge");
assert(icons.length >= mAct + mSen, `judge icons rendered (${icons.length} for ${mAct}+${mSen})`);
assert(root.querySelectorAll(".ctt-vacant").length === Math.max(0, mAuth - mAct),
  `vacancy seats match the deficit (${root.querySelectorAll(".ctt-vacant").length})`);
assert(root.querySelector(".ctt-senior"), "senior judge tinted");
assert(root.querySelector(".ctt-chief-badge"), "chief judge badged");
assert(root.querySelector(".ctt-justice"), "circuit justice icon present");
// same-surname disambiguation (Lavenski + Justin Smith both sit on the 8th Circuit)
const labels = [...root.querySelectorAll(".ctt-judge-label")].map((l) => l.textContent);
assert(labels.includes("L. Smith") && labels.includes("J. Smith"), "same-surname pair disambiguated (L./J. Smith)");

console.log("hover a judge -> detail + same-president highlight");
// Colloton (GW Bush appointee) shares its president with L. Smith and Melloy.
const colloton = [...icons].find((n) => n.querySelector(".ctt-judge-label")?.textContent === "Colloton");
hover(colloton);
await sleep(10);
assert(root.querySelector(".ctt-detail").style.display !== "none", "detail panel shown on hover");
assert(/Colloton/.test(root.querySelector(".ctt-detail-name").textContent), "detail shows hovered judge name");
// Colloton (a GW Bush appointee) shares its president with several ca8 judges; hovered incl. (#5).
assert(root.querySelectorAll(".ctt-copresident").length >= 2, "whole same-president cohort highlighted incl. hovered judge");
assert(colloton.classList.contains("ctt-copresident"), "hovered judge itself is highlighted");

console.log("enrichment: photos + hedged affiliation (Phase 2)");
// Photos are optional per judge, so assert the mechanism, not a fixed count: at least one
// ca8 judge carries a licensed image, and every rendered <img> came with a license.
// the bundle carries the circuit AND its districts; the rendered pane is ca8 only
const ca8Judges = JSON.parse(readFileSync(REPO + "/data/judges/ca8.json", "utf8"))
  .filter((j) => j.court_id === "ca8");
const photoed = ca8Judges.filter((j) => j.photo_url);
assert(photoed.length > 0, `ca8 judges carry photos (${photoed.length}/${ca8Judges.length})`);
assert(photoed.every((j) => j.photo_license && j.photo_source),
  "every photo_url ships with a license + source (CLAUDE.md §2)");
assert(root.querySelectorAll(".ctt-judge img.ctt-photo").length > 0, "photo <img> rendered on icons");
// Direct unit check via _dev, not a DOM assertion tied to ca8 happening to have a photo-less
// judge right now - the enrichment pass keeps closing that gap (ca8 hit 100% photo coverage
// session (bb), which silently made the old DOM-based version of this check vacuous/unrunnable).
// Also locks in the Jr./Sr.-suffix fix (session bb): naive last-token initials would read "PJ"
// for "Paul Joseph Kelly Jr." (J from "Jr."), not "PK".
assert(mod._dev.initials({ full_name: "Paul Joseph Kelly Jr." }) === "PK",
  "initials fallback strips generational suffixes (Jr/Sr/II/...) rather than treating them as the surname");
assert(mod._dev.initials({ full_name: "Jane Doe" }) === "JD", "initials fallback works for a plain two-word name");
// Affiliation must never be asserted as fact, and never claimed without a source.
const affJudges = ca8Judges.filter((j) => j.fedsoc_reported || j.acs_reported);
assert(affJudges.length > 0, `ca8 has reported affiliations (${affJudges.length})`);
assert(affJudges.every((j) => (!j.fedsoc_reported || j.fedsoc_source) && (!j.acs_reported || j.acs_source)),
  "every reported affiliation carries a source URL");
assert(affJudges.every((j) => (!j.fedsoc_reported || j.fedsoc_basis) && (!j.acs_reported || j.acs_basis)),
  "every reported affiliation carries a basis");
const affJudge = affJudges.find((j) => j.fedsoc_reported);
const affIcon = [...icons].find((n) => n.querySelector(".ctt-judge-label")?.textContent === affJudge.display_name);
hover(affIcon); await sleep(10);
const affText = root.querySelector(".ctt-detail").textContent;
assert(/Reported to have/.test(affText), "affiliation is hedged + attributed, not asserted");
assert(new RegExp(affJudge.fedsoc_basis).test(affText), "affiliation basis shown");
assert(root.querySelector(".ctt-affil a[href]"), "affiliation links out to its source");
// CC BY / CC BY-SA must be credited; public-domain photos must not add panel noise.
const ccJudge = ca8Judges.find((j) => /credit:/.test(j.photo_license || ""));
const pdJudge = ca8Judges.find((j) => j.photo_url && !/credit:/.test(j.photo_license || ""));
if (ccJudge) {
  hover([...icons].find((n) => n.querySelector(".ctt-judge-label")?.textContent === ccJudge.display_name));
  await sleep(10);
  assert(root.querySelector(".ctt-photo-credit"), "CC-licensed photo shows required attribution");
}
if (pdJudge) {
  hover([...icons].find((n) => n.querySelector(".ctt-judge-label")?.textContent === pdJudge.display_name));
  await sleep(10);
  assert(!root.querySelector(".ctt-photo-credit"), "public-domain photo adds no attribution line");
}
hover(colloton); await sleep(10);

console.log("click a judge icon pins the detail (#20)");
const detailEl = root.querySelector(".ctt-detail");
const stageForPin = root.querySelector(".ctt-judge-stage");
click(colloton); await sleep(10);
assert(detailEl.classList.contains("ctt-pinned"), "clicking a judge pins the detail panel");
stageForPin.dispatchEvent(new window.MouseEvent("mouseleave", { bubbles: true }));
await sleep(10);
assert(detailEl.style.display !== "none", "pinned detail survives mouse-out (interactable)");
assert(detailEl.querySelector(".ctt-detail-close"), "pinned detail exposes a close control");
window.document.body.dispatchEvent(new window.MouseEvent("mousedown", { bubbles: true }));
await sleep(10);
// The docked panel is STICKY: clicking off unpins, but the panel stays visible with the
// last judge's content (so its links stay reachable without a pin).
assert(!detailEl.classList.contains("ctt-pinned"), "clicking off unpins the detail");
assert(detailEl.style.display !== "none" && /Colloton/.test(detailEl.textContent),
  "unpinned docked detail stays visible with the last judge (sticky)");
// It also sits INSIDE the stage row (docked, in-flow) — not floating over the stage.
assert(detailEl.closest(".ctt-stage-row"), "detail panel is docked inside the stage row");
assert(detailEl.querySelector(".ctt-detail-photo"), "docked detail shows the large avatar");

console.log("selector deselect-toggle (#9) + stow re-show (#4) + close (#10b)");
const ca8sel = () => [...root.querySelectorAll(".ctt-selector .ctt-selector-item")].find((i) => i.getAttribute("data-court-id") === "ca8");
click(ca8sel()); await sleep(20);
assert(!root.querySelector(".ctt-pane").classList.contains("ctt-is-open"), "re-clicking selected circuit closes the pane");
click(ca8sel()); await sleep(30);           // reopen for following tests
assert(root.querySelector(".ctt-pane").classList.contains("ctt-is-open"), "re-selecting reopens the pane");
const stow = root.querySelector(".ctt-pane-stow");
click(stow); await sleep(10);
assert(!root.querySelector(".ctt-pane").classList.contains("ctt-is-open"), "stow hides the pane");
click(stow); await sleep(10);
assert(root.querySelector(".ctt-pane").classList.contains("ctt-is-open"), "stow re-shows the pane (was broken)");

console.log("majority toggle");
const majBtn = [...root.querySelectorAll(".ctt-toggle")].find((b) => b.textContent === "Majority");
click(majBtn);
await sleep(20);
assert(majBtn.classList.contains("ctt-is-active"), "majority mode active");
const stageEl = root.querySelector(".ctt-judge-stage");
assert(stageEl.firstElementChild && stageEl.firstElementChild.classList.contains("ctt-majority-overlay"),
  "majority overlay (dotted line/guides) sits behind the judge icons (#15)");
const arc = stageEl._model._arcRender;
assert(arc && arc.radii.length === 2, `11-seat ca8 bench spreads onto 2 concentric rings (#16): ${arc && arc.radii.length} ring(s)`);
assert(root.querySelectorAll(".ctt-majority-overlay .ctt-arc-guide").length >= 2, "guide traces drawn for each ring (#16)");
const mline = root.querySelector(".ctt-majority-line");
const y1 = +mline.getAttribute("y1"), y2 = +mline.getAttribute("y2");
const arcMeanR = arc.radii.reduce((a, b) => a + b, 0) / arc.radii.length;
assert(Math.abs((y1 + y2) / 2 - (arc.cy - arcMeanR)) < 1, "majority line midpoint sits on the mean ring radius (#21)");
const count = root.querySelector(".ctt-majority-count");
const cm = (count.textContent.match(/of (\d+)/) || [])[1];
assert(count && Number(cm) === mAct, `majority x/y over active judgeships (of ${cm} == ${mAct} active): "${count.textContent}"`);
assert(root.querySelector(".ctt-majority-line"), "dotted majority line drawn");
assert(root.querySelector(".ctt-majority-note").style.display !== "none", "seniors explainer shown");
assert(/generally do not vote en banc/.test(root.querySelector(".ctt-majority-note").textContent),
  "circuit majority note keeps the en banc framing (a real, formal mechanism at this level)");
// Seniors: Hide (default) | Show | Include
const seniorBtn = (label) => [...root.querySelectorAll("[data-senior]")].find((b) => b.textContent === label);
assert(seniorBtn("Hide").classList.contains("ctt-is-active"), "Seniors defaults to Hide");
assert(stageEl._model.seniors.every((j) => stageEl._model._nodeByJudge.get(j).style.opacity === "0"),
  "Hide: every senior icon is concealed (opacity 0)");
click(seniorBtn("Show")); await sleep(10);
assert(stageEl._model._arcRender.hasSeniorsBand, "Show: seniors placed in the outer band");
assert(stageEl._model.seniors.every((j) => stageEl._model._nodeByJudge.get(j).style.opacity === "1"),
  "Show: every senior icon is visible");
const cmShow = (root.querySelector(".ctt-majority-count").textContent.match(/of (\d+)/) || [])[1];
assert(Number(cmShow) === mAct, "Show: seniors still excluded from the x/y count");
click(seniorBtn("Include")); await sleep(10);
assert(!stageEl._model._arcRender.hasSeniorsBand, "Include: no separate outer band (folded into the arc)");
const cm2 = (root.querySelector(".ctt-majority-count").textContent.match(/of (\d+)/) || [])[1];
assert(Number(cm2) === mAct + mSen, `Include: majority over ${mAct + mSen} (got ${cm2})`);
click(seniorBtn("Hide")); await sleep(10);          // restore default for the tests below

const toggle = (label) => [...root.querySelectorAll(".ctt-toggle")].find((b) => b.textContent === label);

console.log("\"Change\" streamgraph: appointing-president headcount over time");
const changeBtn = toggle("Change");
assert(changeBtn, "Change control present alongside Timeline|Majority");
click(changeBtn);
await sleep(30);
assert(changeBtn.classList.contains("ctt-is-active"), "Change mode activates");
assert(stageEl.style.display === "none", "judge-icon stage hides in Change mode");
const streamStage = root.querySelector(".ctt-stream-stage");
assert(streamStage && streamStage.style.display !== "none", "stream stage shows in Change mode");
// renderStreamView() awaits ensureChangeData() (a fetch) before building the SVG.
for (let i = 0; i < 20 && !root.querySelector(".ctt-stream-poly"); i++) await sleep(20);
const polys = root.querySelectorAll(".ctt-stream-poly");
assert(polys.length > 0, `ca8 renders stream polygons (${polys.length})`);
assert(root.querySelector(".ctt-stream-bar"), "draggable time bar present");
assert(root.querySelectorAll(".ctt-stream-svg").length === 1, "exactly one stream SVG (not accumulated)");
// Color-scheme A/B switch (operator ask): must REPLACE, not append, on toggle.
const schemeBtn = (label) => [...root.querySelectorAll(".ctt-stream-scheme .ctt-mode-opt")].find((b) => b.textContent === label);
assert(schemeBtn("Alternating").classList.contains("ctt-is-active"), "color scheme defaults to Alternating");
click(schemeBtn("Fading"));
await sleep(10);
assert(schemeBtn("Fading").classList.contains("ctt-is-active"), "switching to Fading activates it");
assert(root.querySelectorAll(".ctt-stream-svg").length === 1, "switching scheme replaces the view, doesn't duplicate it (regression)");
assert(root.querySelectorAll(".ctt-stream-poly").length === polys.length, "same stream count after re-render");
click(schemeBtn("Alternating")); await sleep(10);   // restore default

// Model correctness, exercised directly (pixel-drag geometry needs a real browser —
// tests/browser-checks.mjs — jsdom measures every box at 0; see that file's own note).
const model = mod._dev.buildStreamModel("ca8");
assert(model && model.rTerms.length > 0 && model.dTerms.length > 0,
  `ca8 has both R (${model?.rTerms.length}) and D (${model?.dTerms.length}) presidency streams`);
assert(model.vertices[0].day === mod._dev.dayNum("1969-01-20"), "timeline starts at the shared 1969 baseline");
assert(model.vertices.every((v, i) => i === 0 || v.day > model.vertices[i - 1].day),
  "vertices are strictly increasing in day (a real step function, no duplicate/out-of-order ties)");
assert(model.vertices[0].day === model.dayMin && model.vertices.every((v) => v.counts &&
  Object.values(v.counts).every((n) => n >= 0)), "no stream ever goes negative");
const totalToday = [...model.rTerms, ...model.dTerms]
  .reduce((s, idx) => s + mod._dev.valueAt(model.vertices, model.dayMax, idx), 0);
assert(totalToday > 0, `ca8's currently-serving total across all president-streams is positive (${totalToday})`);
// Regression: two SCOTUS rows (Kennedy, Breyer) carry senior_date but a BLANK
// termination_date — a real FJC data gap, since SCOTUS retirees have no senior bench to
// keep them counted the way a circuit/district judge's senior_date would. Missed once
// (counted them as still sitting -> 11 justices instead of 9); model must use senior_date as
// the effective departure for scotus rows specifically, not for ordinary courts.
const scotusModel = mod._dev.buildStreamModel("scotus");
const scotusToday = [...scotusModel.rTerms, ...scotusModel.dTerms]
  .reduce((s, idx) => s + mod._dev.valueAt(scotusModel.vertices, scotusModel.dayMax, idx), 0);
assert(scotusToday === 9, `SCOTUS currently-serving total is exactly 9, not inflated by ` +
  `retired justices with no termination_date (got ${scotusToday})`);
// Switching back to Timeline must leave the widget in a normal, re-usable state.
click(toggle("Timeline"));
await sleep(20);
assert(stageEl.style.display !== "none", "judge-icon stage reappears after leaving Change mode");
assert(streamStage.style.display === "none", "stream stage hides again");

console.log("circuit justice placement (#7)");
click(toggle("Timeline")); await sleep(20);
assert(root.querySelector(".ctt-justice-slot .ctt-justice"), "timeline: Circuit Justice sits in the header slot");
click(toggle("Majority")); await sleep(20);
assert(root.querySelector(".ctt-judge-stage .ctt-justice"), "majority: Circuit Justice moves into the arc");

console.log("drill into districts + back");
const drill = root.querySelector(".ctt-drill");
assert(drill && /View districts/.test(drill.textContent), "View districts control present");

// --- Phase 3: true vertex morph (national -> circuit-local) --------------------
// Geometry for the morph endpoints, read straight off the two SVGs on disk, so the test
// checks the interpolation against the contract's own files rather than against itself.
const ptsOf = (d) => (d.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
const natMoed = ptsOf(readFileSync(REPO + "/assets/geo/national.svg", "utf8")
  .match(/<path[^>]*data-court-id="moed"[^>]*\sd="([^"]+)"/)[1]);
const locMoed = ptsOf(readFileSync(REPO + "/assets/geo/circuits/ca8.svg", "utf8")
  .match(/<path[^>]*data-court-id="moed"[^>]*\sd="([^"]+)"/)[1]);
assert(natMoed.length === locMoed.length,
  `morph invariant: moed has equal vertex counts in both projections (${natMoed.length / 2} pts)`);

click(drill);
await sleep(50);
assert(!root.querySelector(".ctt-pane").classList.contains("ctt-pane--tall"),
  "ca8's drilled-in context (no note-bearing court) does NOT get the taller pane");
const morphLayer = root.querySelector(".ctt-morph-layer");
assert(morphLayer, "drill-in runs a vertex morph layer (not the zoom fallback)");
const morphMoed = morphLayer && morphLayer.querySelector('path[data-court-id="moed"]');
assert(morphMoed, "morph layer carries the target circuit's districts");
const frame1 = morphMoed && ptsOf(morphMoed.getAttribute("d"));
assert(frame1 && frame1.length === natMoed.length,
  "morph preserves vertex count while interpolating");
// Shapes with no circuit-local twin fade instead of morphing; insets never morph (contract).
assert(morphLayer.querySelector('.ctt-morph-fade path[data-court-id="cand"]'),
  "a non-target circuit's district fades rather than morphs");
assert(morphLayer.querySelector('.ctt-morph-fade path[data-court-id="akd"][data-inset="true"]'),
  "insets are exempt from the morph and fade (contract)");
// Opacity < 1 costs a transparency layer per element, so every fading node must share ONE group.
assert(morphLayer.querySelectorAll(".ctt-morph-fade, .ctt-morph-fade-in").length <= 4,
  `the morph uses a handful of fade GROUPS, not one per shape (${morphLayer.querySelectorAll(".ctt-morph-fade, .ctt-morph-fade-in").length})`);
assert(!morphLayer.querySelector("path.ctt-morph-fade, path.ctt-morph-fade-in"),
  "no individual path carries its own opacity");
// ca8 has no insets, so check the crossfade on ca9, whose local file carries AK/HI/GU/NMI.
// Without it those pop in at the handoff (measured: ~5% of the map).
{
  const ca9Local = readFileSync(REPO + "/assets/geo/circuits/ca9.svg", "utf8");
  assert(/data-court-id="akd"[^>]*data-inset="true"/.test(ca9Local),
    "ca9's circuit-local file bakes in its own insets (so they must crossfade, not pop)");
}
await sleep(220);
const frame2 = ptsOf(morphMoed.getAttribute("d"));
assert(frame2.some((v, i) => v !== frame1[i]), "morph advances between frames (it animates)");
// The morph bakes each file's Y-flip into the points, so x is directly comparable and must
// travel monotonically from the national x toward the circuit-local x.
const xi = 0;
const towardLocal = Math.abs(frame2[xi] - locMoed[xi]) < Math.abs(frame1[xi] - locMoed[xi]);
assert(towardLocal, "morph interpolates from the national projection toward the local one");

// wait for the morph to hand off to the real local layer
await waitFor(() => !root.querySelector(".ctt-morph-layer"), 2000);
assert(!root.querySelector(".ctt-morph-layer"), "morph layer is removed after the handoff");
assert(root.querySelectorAll(".ctt-svg-layer").length === 2, "circuit-local SVG layer added");

// Seat blocks in the circuit-local view: districts only, no labels (names are too long).
{
  const local = root.querySelector(".ctt-local-layer");
  const ids = [...local.querySelectorAll(".ctt-block")].map((b) => b.getAttribute("data-court-id"));
  assert(ids.length === 10 && ids.includes("moed") && !ids.includes("ca8"),
    `circuit view blocks its 10 districts and not the circuit itself (${ids.length})`);
  assert(!local.querySelector(".ctt-block-label"),
    "district blocks carry no text label (district names are too long)");
  const moedSq = local.querySelectorAll('.ctt-block[data-court-id="moed"] .ctt-sq').length;
  assert(moedSq === JSON.parse(readFileSync(REPO + "/data/seat_blocks.json", "utf8")).moed.total,
    `moed block has one square per seat (${moedSq})`);
}
const localCa8 = root.querySelector('.ctt-local-layer path[data-court-id="ca8"][data-layer="circuit"]');
assert(localCa8 && !localCa8.classList.contains("ctt-shape"), "district view: circuit shape is not map-selectable (#13)");
const localMoed = root.querySelector('.ctt-local-layer path[data-court-id="moed"]');
assert(localMoed && localMoed.classList.contains("ctt-shape"), "district view: district shapes ARE map-selectable");
const selItems = [...root.querySelectorAll(".ctt-selector .ctt-selector-item")];
assert(selItems.some((i) => i.getAttribute("data-court-id") === "ca8"), "circuit repeat option present in circuit view (#3)");
const distCount = selItems.filter((i) => i.getAttribute("data-court-id") !== "ca8").length;
assert(distCount === 10, `10 ca8 districts listed alongside the circuit repeat (got ${distCount}, total ${selItems.length})`);
const back = root.querySelector(".ctt-selector-back");
assert(back, "back button present");
assert(root.querySelector(".ctt-selector").firstElementChild.classList.contains("ctt-selector-back"),
  "back-to-national button sits at the TOP of the selector (#22)");
// pick a district (moed has judge data)
const moed = selItems.find((i) => i.getAttribute("data-court-id") === "moed");
click(moed);
await sleep(40);
assert(/E\.D\. Mo\.|Eastern District of Missouri/.test(root.querySelector(".ctt-pane-title").textContent), "moed pane opens");
// Pane-title min-height (stable position regardless of name length, operator ask, 2026-09-07) is
// a CSS-value claim jsdom can't check — this harness never loads court-tracker.css at all, so
// getComputedStyle() here reflects only inline styles, never the stylesheet. Covered instead in
// tests/browser-checks.mjs (real Chrome), matching this project's existing jsdom/browser split.
assert(root.querySelectorAll(".ctt-judge-stage .ctt-judge").length >= 7, "moed judges rendered");
assert(!root.querySelector(".ctt-judge-stage .ctt-justice"), "district pane has NO circuit justice");
click(back);
await sleep(30);
assert(root.querySelectorAll(".ctt-selector .ctt-selector-item").length === 14, `back to national: Summary + 13 circuits again`);
// Drill-out reverses the same morph, then restores the national layer.
assert(root.querySelector(".ctt-morph-layer"), "back also morphs (local -> national), not a cut");
await waitFor(() => !root.querySelector(".ctt-morph-layer"), 2000);
assert(!root.querySelector(".ctt-national-layer").classList.contains("ctt-hidden-hard"),
  "national layer is restored after morphing back");
// Re-drilling must work from a clean start (the plan is cached and reset, not rebuilt stale).
click([...root.querySelectorAll(".ctt-selector-item")].find((i) => i.getAttribute("data-court-id") === "ca8"));
await sleep(30);
click(root.querySelector(".ctt-drill"));
await sleep(50);
const reMoed = root.querySelector('.ctt-morph-layer path[data-court-id="moed"]');
assert(reMoed && Math.abs(ptsOf(reMoed.getAttribute("d"))[0] - natMoed[0]) < Math.abs(natMoed[0] - locMoed[0]) / 2,
  "re-drilling restarts the morph from the national projection");
await waitFor(() => !root.querySelector(".ctt-morph-layer"), 2000);
click(root.querySelector(".ctt-selector-back"));
await waitFor(() => !root.querySelector(".ctt-morph-layer"), 2000);

// INTERRUPTED morphs must clean up after themselves. Cancelling the rAF alone left the
// promise pending forever, so the awaiting drillIn/drillOut never ran its cleanup: each
// interruption stranded a whole ~43k-vertex map layer in the DOM (and, for a cancelled
// drillOut, left the national layer display:none). Enough of those and every later morph
// repaints several dead maps a frame — the reported freeze with the CPU pinned.
// Must ALTERNATE circuits: each circuit caches one morph-layer node, so re-drilling the same
// one merely re-appends that node and can never strand it. The leak only shows when a
// drill-out morph is interrupted by a drill-in of a DIFFERENT circuit, whose layer is a
// different node — then nothing removes the first one.
console.log("interrupting a morph strands nothing (freeze regression)");
for (let i = 0; i < 6; i++) {
  const cid = i % 2 ? "ca9" : "ca8";
  click([...root.querySelectorAll(".ctt-selector-item")].find((n) => n.getAttribute("data-court-id") === cid));
  await sleep(20);
  click(root.querySelector(".ctt-drill"));          // start the morph...
  await sleep(40);
  click(root.querySelector(".ctt-selector-back"));  // ...and interrupt it well before it ends
  await sleep(40);                                  // next drill interrupts THIS back-morph
}
await waitFor(() => !root.querySelector(".ctt-morph-layer"), 3000);
assert(root.querySelectorAll(".ctt-morph-layer").length === 0,
  `no morph layer stranded after 6 interrupted transitions (${root.querySelectorAll(".ctt-morph-layer").length})`);
assert(!root.querySelector(".ctt-national-layer").classList.contains("ctt-hidden-hard"),
  "national layer is not left hidden by an interrupted transition");
assert(root.querySelectorAll(".ctt-svg-layer").length <= 3,
  `layer count stays bounded (${root.querySelectorAll(".ctt-svg-layer").length}: national + ca8 local)`);

// drillIn is async: the localSVGCache check and its write used to sit either side of
// `await fetchText(...)`, so a double-click on "View districts" raced through the gap and each
// click injected its own full SVG layer, wired listeners and all, orphaned but attached.
console.log("double-clicking 'View districts' injects one layer, not several");
{
  click([...root.querySelectorAll(".ctt-selector-item")].find((n) => n.getAttribute("data-court-id") === "ca7"));
  await sleep(40);
  const drillBtn = root.querySelector(".ctt-drill");
  click(drillBtn); click(drillBtn); click(drillBtn);      // triple-click, no gap
  await waitFor(() => !root.querySelector(".ctt-morph-layer"), 3000);
  await sleep(80);
  const ca7Layers = [...root.querySelectorAll(".ctt-local-layer")]
    .filter((n) => n.querySelector('path[data-parent-circuit="ca7"]')).length;
  assert(ca7Layers === 1, `a triple-clicked drill injects exactly one local layer (got ${ca7Layers})`);
  click(root.querySelector(".ctt-selector-back"));
  await waitFor(() => !root.querySelector(".ctt-morph-layer"), 3000);
}

// Re-selecting the circuit while drilled in leaves a "View districts" button in the pane;
// clicking it used to replay the whole national->local morph over the district map already
// on screen. There is nowhere to travel to — it should just close the pane.
console.log("re-drilling the circuit you are already inside is a no-op");
{
  click([...root.querySelectorAll(".ctt-selector-item")].find((n) => n.getAttribute("data-court-id") === "ca8"));
  await sleep(40);
  click(root.querySelector(".ctt-drill"));
  // drillIn is async — waiting on "no morph layer" here returns instantly, BEFORE the morph has
  // even attached. Wait for the drill to actually land (local layer shown), then for it to end.
  await waitFor(() => root.querySelector(".ctt-local-layer.ctt-fade-in"), 3000);
  await waitFor(() => !root.querySelector(".ctt-morph-layer"), 3000);
  // now inside ca8's districts; re-select the circuit from the selector, then drill again
  click(root.querySelector('.ctt-selector-item[data-court-id="ca8"]'));
  await sleep(40);
  const again = root.querySelector(".ctt-drill");
  assert(again, "the circuit pane still offers 'View districts' while drilled in");
  click(again);
  await sleep(60);
  assert(!root.querySelector(".ctt-morph-layer"),
    "re-drilling the current circuit does NOT replay the morph over the district map");
  assert(root.querySelector(".ctt-national-layer").classList.contains("ctt-hidden-hard"),
    "re-drilling leaves the district view in place");
  click(root.querySelector(".ctt-selector-back"));
  await waitFor(() => !root.querySelector(".ctt-morph-layer"), 3000);
}

// Idle layers must be display:none, not opacity:0. opacity:0 still paints and rasterises, so
// every circuit ever visited kept a full-map layer's raster tiles alive in native memory.
console.log("only the active map layer is paintable (native-memory guard)");
{
  const css = readFileSync(REPO + "/embed/court-tracker.css", "utf8");
  // A custom property invalidates style for the WHOLE subtree and a var-driven opacity cannot be
  // composited, so this repainted ~106 paths every frame (measured 8.6x the style cost).
  assert(!/--ctt-morph-t/.test(css) && !/--ctt-morph-t/.test(readFileSync(REPO + "/embed/court-tracker.js", "utf8")),
    "morph fades are not driven by a CSS custom property + calc()");
  assert(/\.ctt-local-layer \{[^}]*display:\s*none/.test(css),
    "an idle .ctt-local-layer is display:none, not merely transparent");
  const idle = [...root.querySelectorAll(".ctt-local-layer")]
    .filter((n) => !n.classList.contains("ctt-fade-in") && !n.classList.contains("ctt-fading"));
  assert(idle.every((n) => n.classList.contains("ctt-hidden")),
    `every inactive circuit layer carries ctt-hidden (${idle.length} idle)`);
}

console.log("inset selectable in national view (#11)");
const akd = root.querySelector('.ctt-national-layer path[data-court-id="akd"][data-inset="true"]');
assert(akd && akd.classList.contains("ctt-shape"), "Alaska inset is interactive in national view");
click(akd);
await sleep(40);
assert(/Ninth Circuit/.test(root.querySelector(".ctt-pane-title").textContent),
  "clicking the Alaska inset selects its parent 9th Circuit");

// Phase 3: every inset the contract names must be present and route to its parent circuit.
// A circuit's selection must carry to its insets: the dissolved outline is mainland-only, so
// AK/HI/GU/NMI are separate paths and were staying untinted while the rest of ca9 lit up.
// A court's block should light up with its shape, so the two read as the same thing.
console.log("hovering/selecting a court highlights its seat block");
{
  const ca5shape = root.querySelector('.ctt-national-layer path[data-court-id="ca5"][data-layer="circuit"]');
  hover(ca5shape);
  assert(root.querySelector('.ctt-block[data-court-id="ca5"]').classList.contains("ctt-block-hover"),
    "hovering a circuit highlights its block");
  assert(!root.querySelector('.ctt-block[data-court-id="ca8"]').classList.contains("ctt-block-hover"),
    "only the hovered court's block highlights");
  ca5shape.dispatchEvent(new window.MouseEvent("mouseleave", { bubbles: true }));
  assert(!root.querySelector(".ctt-block-hover"), "leaving the shape clears the block highlight");
  // An inset targets its parent circuit, so it must light that circuit's block.
  hover(root.querySelector('.ctt-national-layer path[data-court-id="akd"][data-inset="true"]'));
  assert(root.querySelector('.ctt-block[data-court-id="ca9"]').classList.contains("ctt-block-hover"),
    "hovering the Alaska inset highlights the 9th Circuit's block");
  root.querySelector('.ctt-national-layer path[data-court-id="akd"]')
      .dispatchEvent(new window.MouseEvent("mouseleave", { bubbles: true }));
  // selection
  click([...root.querySelectorAll(".ctt-selector-item")].find((n) => n.getAttribute("data-court-id") === "ca5"));
  await sleep(50);
  assert(root.querySelector('.ctt-block[data-court-id="ca5"]').classList.contains("ctt-block-selected"),
    "selecting a circuit marks its block selected");
  assert(root.querySelectorAll(".ctt-block-selected").length === 1, "exactly one block is selected");
  assert(root.querySelector(".ctt-block-hit"), "blocks carry a hit rect (no map slivers between squares)");
  // Highlight = the squares grow about their own centres. Nothing recolours, so the vacancy's
  // dash and the party colours survive — and neighbours must never touch (scale < pitch/edge).
  {
    const css = readFileSync(REPO + "/embed/court-tracker.css", "utf8");
    // Scales moved from CSS to JS (BLOCK_SCALE_*): a CSS transform transition on SVG rects
    // can't composite, and its promotion attempt re-rendered hairline strokes map-wide
    // (the border flicker). Assert the constants where they now live, and that no CSS
    // transition sneaks back onto .ctt-sq.
    const jsSrc = readFileSync(REPO + "/embed/court-tracker.js", "utf8");
    const hov = +/BLOCK_SCALE_HOVER = ([0-9.]+)/.exec(jsSrc)[1];
    const sel = +/BLOCK_SCALE_SELECTED = ([0-9.]+)/.exec(jsSrc)[1];
    const maxScale = 1.30;                        // BLOCK_GAP: pitch = edge * 1.30 -> edges touch
    assert(hov < maxScale && sel < maxScale,
      `enlarged squares never touch their neighbours (hover ${hov}, selected ${sel} < ${maxScale})`);
    assert(sel > hov, `selected grows more than hover (${sel} > ${hov})`);
    assert(!/\.ctt-sq[^{]*\{[^}]*transition/.test(css),
      "no CSS transition on .ctt-sq (transform transitions on SVG rects flicker the whole map)");
    // Block labels are <text> in a scaled <g>; rendered inside the morph layer their device
    // scale sweeps with the interpolating viewBox and hits a Chrome compositor text-raster
    // lockup (deterministic single-drill freeze at ~680-700px viewports; core of the mobile
    // freeze). The rule that keeps them out of the morph layer must never be dropped.
    assert(/\.ctt-morph-layer \.ctt-block-label \{ display: none/.test(css),
      "morph layer hides seat-block labels (compositor text-raster freeze guard)");
    assert(!/ctt-block-sil/.test(css), "the silhouette highlight is fully removed");
    // A stroke straddles the edge: a filled square's COLOUR stops half a stroke inside its box,
    // the vacancy's dash reaches half a stroke outside. The vacancy rect is inset by both halves
    // so the dash's outer edge lands on the colour's outer edge — keep them in step.
    const w = (re) => +re.exec(css)[1];
    const partyW = w(/\.ctt-sq \{[^}]*stroke-width: ([0-9.]+)/);
    const vacW = w(/\.ctt-sq-vacant \{[^}]*stroke-width: ([0-9.]+)/);
    const js = readFileSync(REPO + "/embed/court-tracker.js", "utf8");
    const inset = eval(/const VACANCY_INSET_PX = ([^;]+);/.exec(js)[1]);
    // No exact target (the party stroke is 85% opaque, so its colour fades rather than ends), but
    // the outline must stay between the two defensible bounds: the party BOX edge (inset = half
    // its own stroke) and the SOLID-colour edge (+ half the party stroke). Outside that it reads
    // visibly bigger or smaller than its neighbours.
    assert(inset >= vacW / 2 && inset <= vacW / 2 + partyW / 2,
      `vacancy inset sits between the box edge and the colour edge (${vacW/2} <= ${inset} <= ${vacW/2 + partyW/2})`);
  }
  // Fed/2nd/DC/1st sit partly off their own circuit, and cafc has NO geometry — the block must be
  // hoverable/clickable in its own right or those courts have dead zones on the map.
  {
    const fed = root.querySelector('.ctt-block[data-court-id="cafc"]');
    assert(fed && fed.querySelector(".ctt-block-hit"), "the Federal Circuit block has a hit area (its only map presence)");
    fed.dispatchEvent(new window.MouseEvent("mouseenter", { bubbles: true }));
    assert(fed.classList.contains("ctt-block-hover"), "hovering the Fed block highlights it");
    assert(document.querySelector(".ctt-tooltip").style.visibility === "visible", "hovering a block shows its tooltip");
    fed.dispatchEvent(new window.MouseEvent("mouseleave", { bubbles: true }));
    click(fed);
    await sleep(60);
    assert(/Federal Circuit/.test(root.querySelector(".ctt-pane-title").textContent),
      "clicking the Fed block selects the Federal Circuit");
    click(root.querySelector('.ctt-selector-item[data-court-id="ca5"]'));
    await sleep(50);
  }
}

console.log("selecting a circuit tints its insets too");
// ca9 is already selected here (the inset click above), and re-clicking would deselect (#9),
// so move the selection away first.
click([...root.querySelectorAll(".ctt-selector-item")].find((i) => i.getAttribute("data-court-id") === "ca8"));
await sleep(60);
click([...root.querySelectorAll(".ctt-selector-item")].find((i) => i.getAttribute("data-court-id") === "ca9"));
await sleep(60);
assert(root.querySelector('.ctt-national-layer path[data-court-id="ca9"][data-layer="circuit"]')
  .classList.contains("ctt-shape-selected"), "9th Circuit mainland is tinted when selected");
for (const id of ["akd", "hid", "gud", "nmid"]) {
  assert(root.querySelector(`.ctt-national-layer path[data-court-id="${id}"]`).classList.contains("ctt-shape-selected"),
    `ca9 inset ${id} is tinted with its circuit`);
}
assert(!root.querySelector('.ctt-national-layer path[data-court-id="prd"]').classList.contains("ctt-shape-selected"),
  "another circuit's inset (prd/1st Cir.) is NOT tinted");
click(root.querySelector('.ctt-selector-item[data-court-id="ca9"]'));   // deselect
await sleep(40);

console.log("affiliation marker: None | FedSoc | ACS");
click([...root.querySelectorAll(".ctt-selector-item")].find((i) => i.getAttribute("data-court-id") === "ca8"));
await sleep(60);
const affOpts = [...root.querySelectorAll(".ctt-affil-opt")];
assert(affOpts.length === 3 && affOpts.map((o) => o.getAttribute("data-affil")).join() === "none,fedsoc,acs",
  "three-way switch present (none|fedsoc|acs)");
assert(affOpts[0].classList.contains("ctt-is-active"), "defaults to None");
assert(!root.querySelector(".ctt-affil-marked"), "nothing marked while None is selected");
click(affOpts[1]); await sleep(20);
const markedFS = [...root.querySelectorAll(".ctt-judge.ctt-affil-marked")];
// + the Circuit Justice: since the SCOTUS-record merge (2026-07-19) the justice icon carries
// the full record incl. affiliation, and is marked consistently with the bench.
const justiceFS = root.querySelector(".ctt-justice")?._judge?.fedsoc_reported ? 1 : 0;
const wantFS = ca8Judges.filter((j) => j.fedsoc_reported).length + justiceFS;
assert(markedFS.length === wantFS, `FedSoc marks exactly the reported judges incl. the Justice (${markedFS.length}/${wantFS})`);
assert(markedFS.every((n) => n._judge && n._judge.fedsoc_reported), "every mark corresponds to a reported affiliation");
click(affOpts[2]); await sleep(20);
assert(root.querySelectorAll(".ctt-judge.ctt-affil-marked").length === ca8Judges.filter((j) => j.acs_reported).length,
  "switching to ACS re-marks against acs_reported");
// The ridge must restyle the band ONLY. The avatar is border-box, so a wider border eats the
// content box and visibly shrinks the photo inside — which is what the operator reported.
{
  click(affOpts[1]); await sleep(20);
  const css = readFileSync(REPO + "/embed/court-tracker.css", "utf8");
  const rule = /\.ctt-affil-marked \.ctt-avatar \{([^}]*)\}/.exec(css);
  assert(rule && !/border-width|border\s*:/.test(rule[1]),
    `affiliation ridge changes border-style only, never its width (got "${rule && rule[1].trim()}")`);
  assert(rule && /border-style/.test(rule[1]), "affiliation ridge does set a border-style");
}
// The marker must also apply in the majority arc, not just the timeline.
click([...root.querySelectorAll(".ctt-toggle")].find((b) => b.textContent.trim() === "Majority"));
await sleep(40);
click(affOpts[1]); await sleep(20);
assert(root.querySelectorAll(".ctt-judge.ctt-affil-marked").length === wantFS,
  "marker applies in the majority view as well as the timeline");
click([...root.querySelectorAll(".ctt-toggle")].find((b) => b.textContent.trim() === "Timeline"));
await sleep(40);
click(affOpts[0]); await sleep(20);

console.log("seat blocks: one square per authorized judgeship");
const blocksJson = JSON.parse(readFileSync(REPO + "/data/seat_blocks.json", "utf8"));
const natBlocks = [...root.querySelectorAll(".ctt-national-layer .ctt-block")];
assert(natBlocks.length === 13, `all 13 circuits carry a block on the national view (${natBlocks.length})`);
assert(natBlocks.some((b) => b.getAttribute("data-court-id") === "cafc"),
  "the Federal Circuit gets a block despite having no geometry (anchored by hand)");
assert(!root.querySelector('.ctt-national-layer .ctt-block[data-court-id="moed"]'),
  "districts get NO block on the national view (circuit view only)");
// Square count must equal the authorized bench — the whole point of the visual.
for (const cid of ["ca8", "ca9", "cadc", "cafc"]) {
  const n = root.querySelectorAll(`.ctt-national-layer .ctt-block[data-court-id="${cid}"] .ctt-sq`).length;
  assert(n === blocksJson[cid].total, `${cid}: ${n} squares == ${blocksJson[cid].total} judgeships`);
}
// Grouped by colour with vacancies LAST (they have no appointment date to order by).
{
  const cls = [...root.querySelectorAll('.ctt-national-layer .ctt-block[data-court-id="ca9"] .ctt-sq')]
    .map((r) => r.getAttribute("class").replace("ctt-sq ", ""));
  const order = cls.filter((c, i) => i === 0 || c !== cls[i - 1]);
  assert(new Set(cls).size === order.length, `ca9 squares are grouped by colour, not interleaved (${order.join(" ")})`);
  const firstVac = cls.indexOf("ctt-sq-vacant");
  assert(firstVac === -1 || cls.slice(firstVac).every((c) => c === "ctt-sq-vacant"),
    "vacancy squares come last");
}
// A court sitting more judges than §133 authorizes must not silently drop one.
assert(blocksJson.moed.total === blocksJson.moed.r + blocksJson.moed.d + blocksJson.moed.o + blocksJson.moed.vacancies,
  "over-full court (moed, roving judgeships): every active judge still gets a square");
assert(root.querySelector('.ctt-national-layer .ctt-block[data-court-id="ca1"] .ctt-block-label').textContent === "1st",
  "circuit blocks are labelled (1st)");
// Labels are left-aligned to the block's left edge, not centred over it.
{
  const blk = root.querySelector('.ctt-national-layer .ctt-block[data-court-id="ca8"]');
  const tx = +/translate\(([-\d.]+)/.exec(blk.querySelector("g").getAttribute("transform"))[1];
  const leftX = Math.min(...[...blk.querySelectorAll(".ctt-sq")].map((r) => +r.getAttribute("x")));
  assert(Math.abs(tx - leftX) < 1, `label anchored to the block's left edge (${tx} vs ${leftX})`);
  const css = readFileSync(REPO + "/embed/court-tracker.css", "utf8");
  assert(/\.ctt-block-label \{[^}]*text-anchor: start/.test(css), "label text-anchor is start (left-aligned)");
}
// Square size is a constant SCREEN size, not map units: a map-unit edge renders ~4x larger
// after a drill-in (the projections differ that much in scale) and swamps the districts.
{
  const natSq = +root.querySelector('.ctt-national-layer .ctt-block[data-court-id="ca8"] .ctt-sq').getAttribute("width");
  const natVw = +root.querySelector(".ctt-national-layer svg").getAttribute("viewBox").split(/\s+/)[2];
  const localSvg = root.querySelector(".ctt-local-layer svg");
  const locSq = +root.querySelector('.ctt-local-layer .ctt-block[data-court-id="moed"] .ctt-sq').getAttribute("width");
  const locVw = +localSvg.getAttribute("viewBox").split(/\s+/)[2];
  // equal on screen => edge/viewBoxWidth is equal, since both letterbox to the same map width
  const ratio = (natSq / natVw) / (locSq / locVw);
  assert(Math.abs(ratio - 1) < 0.02,
    `square edge is the same fraction of each viewBox => same on-screen size in both views (ratio ${ratio.toFixed(3)})`);
}
assert(root.querySelector('.ctt-national-layer .ctt-block[data-court-id="cafc"] .ctt-block-label').textContent === "Fed",
  "Federal Circuit block is labelled Fed");
// Blocks are annotation: they must never intercept a click meant for the shape underneath.
assert(!root.querySelector(".ctt-blocks").querySelector("[data-layer]"),
  "block layer holds only annotation, no map shapes");

console.log("all composite insets present + routed (Phase 3)");
for (const [id, parent] of [["akd", "ca9"], ["hid", "ca9"], ["prd", "ca1"], ["gud", "ca9"],
                            ["nmid", "ca9"], ["vid", "ca3"], ["dcd", "cadc"]]) {
  const p = root.querySelector(`.ctt-national-layer path[data-court-id="${id}"][data-inset="true"]`);
  assert(p, `inset ${id} baked into national.svg`);
  assert(p && p.getAttribute("data-parent-circuit") === parent,
    `inset ${id} routes to ${parent}`);
}

// D.C. Circuit's only district is an inset callout, and insets never morph -> nothing to
// interpolate, so it must take the documented zoom+crossfade fallback rather than break.
// An inset present in BOTH projections must crossfade: national copy out, local copy in.
console.log("inset crossfade during the morph (Phase 3)");
click([...root.querySelectorAll(".ctt-selector-item")].find((i) => i.getAttribute("data-court-id") === "ca9"));
await sleep(60);
click(root.querySelector(".ctt-drill"));
await sleep(50);
const m9 = root.querySelector(".ctt-morph-layer");
assert(m9 && m9.querySelector('.ctt-morph-fade path[data-court-id="akd"]'),
  "ca9 morph: the national Alaska inset fades out");
assert(m9 && m9.querySelector('.ctt-morph-fade-in path[data-court-id="akd"]'),
  "ca9 morph: the circuit-local Alaska inset fades IN (no pop at handoff)");
assert(m9 && m9.querySelectorAll('path[data-court-id="akd"]').length === 2,
  "both Alaska placements are present for the crossfade");
await waitFor(() => !root.querySelector(".ctt-morph-layer"), 2500);

console.log("fixed-term (Art IV) court UX: no toggle-gated note, one always-visible consolidated note, Holdover tag");
assert(!root.querySelector(".ctt-pane").classList.contains("ctt-pane--tall"),
  "ca9's drilled-in context (gud/nmid's note fits on one line at desktop widths) does NOT get the taller pane - only cafc does");
const gudSel = [...root.querySelectorAll(".ctt-selector .ctt-selector-item")].find((i) => i.getAttribute("data-court-id") === "gud");
click(gudSel); await sleep(30);
assert(!root.querySelector(".ctt-majority-note"),
  "Art IV territorial court has NO toggle-gated majority note (no senior status, no meaningful majority math)");
const ftNote = root.querySelector(".ctt-always-note");
assert(ftNote && ftNote.style.display !== "none", "Art IV's consolidated note is visible without needing the Majority toggle");
assert(ftNote && /holdover/i.test(ftNote.textContent), "consolidated note mentions the holdover rule");
assert(ftNote && /10-year terms/.test(ftNote.textContent), "consolidated note mentions the 10-year term length");
assert(ftNote && /do not sit en banc/.test(ftNote.textContent), "consolidated note mentions no en banc");
const gudMajBtn = [...root.querySelectorAll(".ctt-toggle")].find((b) => b.textContent === "Majority");
click(gudMajBtn); await sleep(20);
assert(root.querySelector(".ctt-always-note").style.display !== "none",
  "consolidated note stays visible after toggling to Majority mode too (never hidden)");
const gudIcons = root.querySelectorAll(".ctt-judge-stage .ctt-judge");
const gudJudge = [...gudIcons].find((n) => /Tydingco-Gatewood/.test(n.querySelector(".ctt-judge-label")?.textContent || ""));
assert(gudJudge, "Guam's judge icon found");
if (gudJudge) {
  hover(gudJudge);
  await sleep(10);
  const detailHtml = root.querySelector(".ctt-detail-content").innerHTML;
  assert(/Holdover/.test(detailHtml) && /holding over pending a successor/.test(detailHtml),
    "a judge past term_expiration_date on a fixed_term court is tagged Holdover with correct wording");
}
click(root.querySelector(".ctt-selector-back"));
await waitFor(() => !root.querySelector(".ctt-morph-layer"), 2500);

console.log("morph fallback where nothing can morph (Phase 3)");
click([...root.querySelectorAll(".ctt-selector-item")].find((i) => i.getAttribute("data-court-id") === "cadc"));
await sleep(40);
click(root.querySelector(".ctt-drill"));
await sleep(50);
assert(!root.querySelector(".ctt-morph-layer"),
  "cadc (insets only) falls back to zoom+crossfade instead of morphing");
assert(root.querySelector(".ctt-national-layer").classList.contains("ctt-fade-out"),
  "fallback still zooms the national layer out");
assert(fellBack.includes("cadc"), `fallback is logged for the operator (logged: ${fellBack.join(",") || "none"})`);
click(root.querySelector(".ctt-selector-back"));
await sleep(40);

console.log("Federal Circuit: feeder repopulation, no map drill (Phase 3)");
// (still in national view from the drill-out above; ca9 is selected via the inset click)
const cafcItem = [...root.querySelectorAll(".ctt-selector .ctt-selector-item")]
  .find((i) => i.getAttribute("data-court-id") === "cafc");
assert(cafcItem, "Federal Circuit listed in the national selector");
click(cafcItem); await sleep(60);
const cafcDrill = root.querySelector(".ctt-drill");
assert(cafcDrill && /View feeders/.test(cafcDrill.textContent),
  "Federal Circuit offers 'View feeders' (not 'View districts')");
const layersBefore = root.querySelectorAll(".ctt-svg-layer").length;
click(cafcDrill); await sleep(60);
assert(root.querySelectorAll(".ctt-svg-layer").length === layersBefore,
  "Federal Circuit drill adds NO map layer (it has no geography)");
const feederIds = [...root.querySelectorAll(".ctt-selector .ctt-selector-item")]
  .map((i) => i.getAttribute("data-court-id"));
assert(feederIds.includes("cit") && feederIds.includes("uscfc"),
  `selector repopulates with USCIT + CFC (got ${feederIds.join(",")})`);
// The feeders also appear ON the map for this view only: labelled CIT/CFC block arrays
// beside/below the Fed block (level "feeder"), swept again on Back.
const feederBlocks = () => root.querySelectorAll('.ctt-national-layer .ctt-blocks[data-level="feeder"] .ctt-block');
assert(feederBlocks().length === 2, `feeder view shows CIT + CFC seat blocks on the map (got ${feederBlocks().length})`);
assert([...root.querySelectorAll('.ctt-blocks[data-level="feeder"] .ctt-block-label')]
  .map((t) => t.textContent).sort().join(",") === "CFC,CIT", "feeder blocks carry the CIT / CFC labels");
// USCIT/CFC are reachable ONLY here — never as top-level selector entries.
click(root.querySelector('.ctt-selector-item[data-court-id="uscfc"]')); await sleep(60);
assert(/Federal Claims/.test(root.querySelector(".ctt-pane-title").textContent),
  "CFC opens its pane from the feeder list");
// S.majorityMode is global state left "true" by an earlier test block in this file - reset to
// Timeline explicitly so this checks the widget's actual first-open behavior, not test order.
click(toggle("Timeline")); await sleep(20);
assert(!root.querySelector(".ctt-always-note"), "CFC has no always-visible note (moved back to toggle-gated, majority-mode-only)");
assert(root.querySelector(".ctt-majority-note").style.display === "none",
  "CFC's note is hidden on first open (timeline view) - corrected 2026-07-16, was wrongly always-visible");
const cfcMajBtn = [...root.querySelectorAll(".ctt-toggle")].find((b) => b.textContent === "Majority");
click(cfcMajBtn); await sleep(20);
const cfcNote = root.querySelector(".ctt-majority-note");
assert(cfcNote && cfcNote.style.display !== "none", "CFC's note appears once Majority mode is toggled on");
assert(cfcNote && !/holdover/i.test(cfcNote.textContent),
  "CFC's note does NOT mention holdover — its own term statute (28 U.S.C. §172) has no holdover clause");
assert(cfcNote && /15-year terms/.test(cfcNote.textContent) && /§ 797\(b\)/.test(cfcNote.textContent) &&
  /active senior judges are shown/.test(cfcNote.textContent),
  "CFC's note cites § 797(b) for the active-senior recall discretion and mentions the 15-year term");
assert(cfcNote && /does not sit en banc/.test(cfcNote.textContent), "CFC's note says it does not sit en banc");
click(root.querySelector('.ctt-selector-item[data-court-id="cit"]')); await sleep(60);
assert(/International Trade/.test(root.querySelector(".ctt-pane-title").textContent), "USCIT opens its pane from the feeder list");
click(toggle("Timeline")); await sleep(20);   // CFC's block above left majorityMode=true
assert(!root.querySelector(".ctt-always-note"), "USCIT has no always-visible note either");
assert(root.querySelector(".ctt-majority-note").style.display === "none",
  "USCIT's note is hidden on first open (timeline view) too");
const citMajBtn = [...root.querySelectorAll(".ctt-toggle")].find((b) => b.textContent === "Majority");
click(citMajBtn); await sleep(20);
const citNote = root.querySelector(".ctt-majority-note");
assert(citNote && citNote.style.display !== "none", "USCIT's note appears once Majority mode is toggled on");
assert(citNote && /three-judge panel/.test(citNote.textContent) && /§ 255/.test(citNote.textContent) &&
  /Senior judges are supernumerary/.test(citNote.textContent) &&
  !/generally do not vote en banc/.test(citNote.textContent) && !/district courts do not usually/.test(citNote.textContent),
  "USCIT gets its own note (three-judge panel mechanism, 28 U.S.C. § 255, plus the supernumerary-seniors line) distinct from circuit/CFC/district wording");
click(root.querySelector(".ctt-selector-back")); await sleep(40);
const topIds = [...root.querySelectorAll(".ctt-selector .ctt-selector-item")]
  .map((i) => i.getAttribute("data-court-id"));
assert(!topIds.includes("cit") && !topIds.includes("uscfc"),
  "USCIT/CFC are NOT top-level selector entries (reachable only via the Federal Circuit)");
assert(feederBlocks().length === 0, "CIT/CFC map blocks disappear on returning to national");

console.log("blocks stay clickable after the feeder view (double-wire regression, 2026-07-19)");
// Reported flow: open Fed via its block -> View feeders -> Fed's block dead; back to
// national -> every circuit block dead. Cause: rendering the feeder level re-wired the
// untouched circuit blocks (doubled click listener -> select+deselect in one click).
const natBlock = (cid) => root.querySelector(`.ctt-national-layer .ctt-block[data-court-id="${cid}"]`);
click(natBlock("cafc")); await sleep(40);
assert(root.querySelector(".ctt-pane").classList.contains("ctt-is-open") &&
  /Federal Circuit/.test(root.querySelector(".ctt-pane-title").textContent),
  "clicking the Fed block opens its pane");
click(root.querySelector(".ctt-drill")); await sleep(60);           // View feeders
click(natBlock("cafc")); await sleep(40);
assert(root.querySelector(".ctt-pane").classList.contains("ctt-is-open") &&
  /Federal Circuit/.test(root.querySelector(".ctt-pane-title").textContent),
  "Fed's block still opens its pane INSIDE the feeder view (was dead: double-wired)");
click(root.querySelector(".ctt-selector-back")); await sleep(60);
click(natBlock("ca2")); await sleep(40);
assert(root.querySelector(".ctt-pane").classList.contains("ctt-is-open") &&
  /Second Circuit/.test(root.querySelector(".ctt-pane-title").textContent),
  "circuit blocks (2nd) still open their panes after returning to national");
click(natBlock("ca2")); await sleep(40);   // deselect again to leave a clean state
assert(!root.querySelector(".ctt-pane").classList.contains("ctt-is-open"),
  "single deselect-toggle still works (one listener, not two)");

console.log("chief star scope (2026-07-19): court's own chief only, never the Circuit Justice");
click(root.querySelector('.ctt-selector-item[data-court-id="ca4"]')); await sleep(60);
assert(!root.querySelector(".ctt-justice .ctt-chief-badge"),
  "Roberts as 4th-Circuit Justice carries NO chief star (he is not that court's chief)");
click(root.querySelector('.ctt-selector-item[data-court-id="summary"]')); await sleep(60);
assert(root.querySelector(".ctt-judge-stage .ctt-chief-badge"),
  "on the SCOTUS bench itself (Summary tab, default sub-view) the Chief Justice's star still shows");
click(root.querySelector('.ctt-selector-item[data-court-id="summary"]')); await sleep(30);  // deselect

console.log("justice label uses the SURNAME, not a generational suffix (2026-07-19)");
click(root.querySelector('.ctt-selector-item[data-court-id="ca3"]')); await sleep(60);
assert(/Circ\. Justice Alito/.test(root.querySelector(".ctt-justice .ctt-judge-label").textContent),
  `3rd Circuit justice label says "Alito", not "Jr." (got "${root.querySelector(".ctt-justice .ctt-judge-label").textContent}")`);
click(root.querySelector('.ctt-selector-item[data-court-id="ca3"]')); await sleep(30);  // deselect

console.log("top stow button (operator ask, 2026-07-19)");
click(natBlock("ca2")); await sleep(40);   // reopen a pane
const stowTop = root.querySelector(".ctt-pane-stowtop");
assert(stowTop, "stow-only button exists next to the close button");
click(stowTop); await sleep(20);
assert(!root.querySelector(".ctt-pane").classList.contains("ctt-is-open"), "top stow button stows the pane");
click(stowTop); await sleep(20);
assert(!root.querySelector(".ctt-pane").classList.contains("ctt-is-open"),
  "top stow button is stow-ONLY (does not toggle back open)");
click(root.querySelector(".ctt-pane-stow")); await sleep(20);
assert(root.querySelector(".ctt-pane").classList.contains("ctt-is-open"),
  "the edge tab still brings the pane back up");
click(natBlock("ca2")); await sleep(20);   // deselect -> clean state

console.log("Summary pane (operator ask, 2026-09-03 — replaces the old lone SCOTUS entry)");
click(root.querySelector('.ctt-selector-item[data-court-id="summary"]')); await sleep(60);
// No separate "Summary" title/subtitle inside the pane (operator ask, 2026-09-04: the
// enlarged tab labels ARE the heading now) — the Summary selector-BAR entry is unaffected.
assert(!root.querySelector(".ctt-pane-head"), "Summary pane has no separate title/meta header");
const summarySwitch = root.querySelector(".ctt-summary-switch");
assert(summarySwitch, "Summary sub-tab switch exists");
const summaryTabs = [...summarySwitch.querySelectorAll(".ctt-mode-opt")].map((b) => b.textContent);
assert(JSON.stringify(summaryTabs) === JSON.stringify(["Supreme Court", "Appellate Courts", "District Courts"]),
  `Summary sub-tabs are the full section names, in order (got ${JSON.stringify(summaryTabs)})`);
assert(summarySwitch.querySelector(".ctt-mode-opt.ctt-is-active").textContent === "Supreme Court",
  "Supreme Court is the default Summary sub-tab");
assert(/Supreme Court of the United States/.test(root.querySelector(".ctt-summary-subtitle").textContent),
  "SCOTUS sub-view names the court");
const scMeta = root.querySelector(".ctt-summary-content .ctt-pane-meta").textContent;
assert(/9 authorized · 9 active · 0 vacant/.test(scMeta) && !/senior/.test(scMeta),
  `SCOTUS meta has no senior figure: "${scMeta}"`);
const scIcons = root.querySelectorAll(".ctt-judge-stage .ctt-judge");
assert(scIcons.length === 9, `nine justices rendered (${scIcons.length})`);
assert(!root.querySelector(".ctt-judge-stage .ctt-justice"),
  "justices are ordinary party-ringed icons, not purple Circuit-Justice styling");
assert([...scIcons].some((n) => n.querySelector(".ctt-chief-badge")), "the Chief Justice is badged");
assert(!["Timeline", "Majority", "Change"].some((label) => toggle(label)),
  "Timeline/Majority/Change do not exist at all for Summary > SCOTUS (operator: eliminated)");
assert(!root.querySelector(".ctt-majority-note") && !root.querySelector(".ctt-always-note"),
  "Summary > SCOTUS has no majority/senior note (same rule as the old direct SCOTUS pane)");
assert(root.querySelector(".ctt-majority-count"), "Summary > SCOTUS shows the x/y majority count");

console.log("Summary > SCOTUS: doubled icons + split double-ring geometry (operator ask)");
const scaleTx = [...scIcons].find((n) => /scale\(2\)/.test(n.style.transform));
assert(scaleTx, "at least one justice icon carries a 2x scale transform");
// jsdom lays nothing out (clientWidth/Height are always 0), which makes the arc geometry
// FULLY DETERMINISTIC (majorityDims/majorityStageHeight fall back to their fixed constants) —
// exploit that to assert the exact ring split rather than just "something rendered".
const cx = 300, cy = 292; // w=600 fallback -> cx=w/2=300; H=360 fallback -> cy=H-68=292
const dist = (n) => {
  const m = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(n.style.transform);
  const x = +m[1] + 26, y = +m[2] + 26;           // ICON=26 half-footprint added back
  return { r: Math.hypot(x - cx, y - cy), y };
};
const radii = [...scIcons].map(dist).map((d) => Math.round(d.r));
const uniqRadii = [...new Set(radii)].sort((a, b) => a - b);
assert(uniqRadii.length === 2, `exactly 2 distinct ring radii (got ${JSON.stringify(uniqRadii)})`);
const innerCount = radii.filter((r) => r === uniqRadii[0]).length;
const outerCount = radii.filter((r) => r === uniqRadii[1]).length;
assert(innerCount === 3 && outerCount === 6,
  `3 inner + 6 outer seats (got inner=${innerCount}, outer=${outerCount})`);
// A seat anchored exactly at 180°/0° (the standard, un-raised endpoint) sits exactly ON the
// horizontal (y === cy, since sin(0)=0). The inner ring's endpoints are raised 15° off that —
// so NONE of its 3 seats should land on the horizontal, while the outer ring's genuine 180°/0°
// endpoints (unraised, per spec) still should.
const onHorizon = (y) => Math.abs(y - cy) < 1;
const innerYs = [...scIcons].map(dist).filter((d) => Math.round(d.r) === uniqRadii[0]).map((d) => d.y);
const outerYs = [...scIcons].map(dist).filter((d) => Math.round(d.r) === uniqRadii[1]).map((d) => d.y);
assert(innerYs.every((y) => !onHorizon(y)), "no inner-ring seat sits on the horizontal (all raised off 180°/0°)");
assert(outerYs.filter(onHorizon).length === 2, "outer ring's two endpoint seats sit exactly on the horizontal (standard, unraised)");

console.log("Summary > Appellate: blank placeholder (operator: come back to it later)");
click(toggle("Appellate Courts")); await sleep(20);
assert(/Coming soon/.test(root.querySelector(".ctt-summary-content").textContent), "Appellate shows a placeholder");
assert(!root.querySelector(".ctt-judge-stage"), "no SCOTUS bench lingers under Appellate");

console.log("Summary > District: static cartogram preview (no map deployment yet)");
click(toggle("District Courts")); await sleep(60);
const clusters = root.querySelectorAll(".ctt-district-cluster");
assert(clusters.length === 12, `cartogram renders all 12 geographic circuits (got ${clusters.length})`);
assert(root.querySelectorAll(".ctt-district-sq").length > 0, "cartogram renders district squares");
assert(root.querySelectorAll(".ctt-district-sq.ctt-sq-rep, .ctt-district-sq.ctt-sq-dem").length > 0,
  "cartogram squares reuse the map's own R/D palette classes");

console.log("Summary > District: controls row — right-aligned/width-matched deploy button, arrow-flanked label, left caption (operator ask, 2026-09-07)");
const summaryDeployBtn = root.querySelector(".ctt-district-deploy-btn");
const summaryCaption = root.querySelector(".ctt-district-caption-row");
assert(summaryDeployBtn.textContent === "▼ Set upon map ▼", "button label is flanked by down arrows");
assert(summaryCaption?.querySelector(".ctt-summary-subtitle")?.textContent === "Party of District Court Appointments, Arranged by Circuit",
  "left-aligned caption title text is present and correct (bolded like a standard title, operator ask, 2026-09-08)");
const natTotals = mod._dev.districtNationalTotals();
assert(summaryCaption?.querySelector(".ctt-pane-meta")?.textContent === `${natTotals.authorized} authorized · ${natTotals.active} active · ${natTotals.vacancies} vacant`,
  `caption's meta line summarizes nation-wide authorized/active/vacant (got "${summaryCaption?.querySelector(".ctt-pane-meta")?.textContent}")`);
// Right-alignment/width-matching are CSS-value claims jsdom can't check (no stylesheet loaded in
// this harness) — covered instead in tests/browser-checks.mjs (real Chrome).

console.log("Summary > District: hover growth scale is modest (operator ask, 2026-09-07: 'too much')");
assert(mod._dev.DISTRICT_SQ_SCALE_HOVER > 1 && mod._dev.DISTRICT_SQ_SCALE_HOVER <= 1.2,
  `DISTRICT_SQ_SCALE_HOVER is a modest grow, not the old 1.35 (got ${mod._dev.DISTRICT_SQ_SCALE_HOVER})`);

console.log("Summary > District: docked detail panel + click-to-pin (operator spec)");
const districtDetail = root.querySelector(".ctt-district-detail");
assert(districtDetail, "District has its own docked detail panel");
assert(/Hover over a district/.test(districtDetail.textContent), "starts with the usage hint");
const someSq = root.querySelector(".ctt-district-sq[data-district-id]");
// wireDistrictCartogramHover listens for pointermove (not mouseenter, the generic hover()
// helper's event) — the event TYPE is what addEventListener matches on, so a plain MouseEvent
// constructed with that type works fine even without full jsdom PointerEvent support.
someSq.dispatchEvent(new window.MouseEvent("pointermove", { bubbles: true, clientX: 1, clientY: 1 }));
assert(districtDetail.querySelector(".ctt-detail-name"), "hovering a block fills the district panel with a name row");
assert(!districtDetail.querySelector(".ctt-detail-name").textContent.includes("Republican-appointed"),
  "the old plain R/D/vacant count text is gone (replaced by the table)");

console.log("Summary > District: circuit-wide table (operator ask, 2026-09-05)");
const hoveredDid = someSq.getAttribute("data-district-id");
const hoveredCourt = mod._dev.S.courts.get(hoveredDid);
const circuitId = hoveredCourt.parent_id;
const circuitCourt = mod._dev.S.courts.get(circuitId);
const label = districtDetail.querySelector(".ctt-district-table-label");
assert(label && label.textContent === `${circuitCourt.short_name} Districts`, `table label names the circuit (got "${label?.textContent}")`);
const rows = [...districtDetail.querySelectorAll(".ctt-district-row")];
const expectedCount = [...mod._dev.S.courts.values()].filter((c) => c.court_level === "district" && c.parent_id === circuitId).length;
assert(rows.length === expectedCount, `table lists every district in the circuit (got ${rows.length}, want ${expectedCount})`);
assert(!label.nextElementSibling.querySelector("thead"), "table has no header row (operator ask)");

console.log("Summary > District: Total row (operator ask, 2026-09-07)");
const allTbodyRows = [...districtDetail.querySelectorAll(".ctt-district-row, .ctt-district-row-total")];
const totalRow = districtDetail.querySelector(".ctt-district-row-total");
assert(totalRow && allTbodyRows.indexOf(totalRow) === 1, "Total row sits directly below the first (pinned/hovered) row");
const totalCells = [...totalRow.querySelectorAll("td")];
assert(totalCells[0].textContent === "Total", "first cell reads 'Total'");
const expectedTotals = [...mod._dev.S.courts.values()]
  .filter((c) => c.court_level === "district" && c.parent_id === circuitId)
  .reduce((acc, c) => {
    const b = mod._dev.S.seatBlocks?.[c.court_id] || {};
    acc.r += b.r ?? 0; acc.d += b.d ?? 0; acc.vacancies += b.vacancies ?? 0;
    return acc;
  }, { r: 0, d: 0, vacancies: 0 });
assert(parseInt(totalCells[1].textContent) === expectedTotals.r, `R total correct (got ${totalCells[1].textContent}, want ${expectedTotals.r})`);
assert(parseInt(totalCells[2].textContent) === expectedTotals.d, `D total correct (got ${totalCells[2].textContent}, want ${expectedTotals.d})`);
assert(parseInt(totalCells[3].textContent) === expectedTotals.vacancies, `vacant total correct (got ${totalCells[3].textContent}, want ${expectedTotals.vacancies})`);
assert(rows[0].classList.contains("ctt-district-row-active") && rows[0].textContent.includes(hoveredCourt.short_name),
  "mere hover (no click) already reorders the hovered district's row to the TOP, bolded/highlighted — same treatment as a pin (operator correction, 2026-09-05)");
const repCell = rows[0].querySelectorAll("td")[1];
assert(/^\d+/.test(repCell.textContent) && repCell.querySelector(".ctt-district-swatch"),
  `R column shows the COUNT before the swatch (operator preference) (cell: "${repCell.innerHTML}")`);
assert(repCell.innerHTML.indexOf(repCell.textContent.trim()) < repCell.innerHTML.indexOf("ctt-district-swatch"),
  "the number literally precedes the swatch span in markup order");

console.log("Summary > District: hover alone is sticky — content/growth persist after the cursor leaves, but (unlike a pin) they're not LOCKED");
someSq.dispatchEvent(new window.MouseEvent("pointerleave", { bubbles: true }));
assert(someSq._sqScale > 1, "the merely-hovered block's enlarged state survives the cursor leaving the SVG (sticky hover, not a pin)");
assert(districtDetail.querySelector(".ctt-detail-name"), "the panel content also survives — no reset to the empty hint on hover-out");
assert(!districtDetail.classList.contains("ctt-pinned"), "...but it's NOT pinned — no lock, no close-button-driven state");
const otherSq = [...root.querySelectorAll(".ctt-district-sq[data-district-id]")].find((sq) => sq.getAttribute("data-district-id") !== hoveredDid);
const otherDid = otherSq.getAttribute("data-district-id");
const otherCourt = mod._dev.S.courts.get(otherDid);
otherSq.dispatchEvent(new window.MouseEvent("pointermove", { bubbles: true, clientX: 2, clientY: 2 }));
assert(districtDetail.querySelector(".ctt-detail-name").textContent.includes(otherCourt.court_name),
  "a genuinely new hover (unpinned) replaces the sticky content with the new district");
await sleep(120);   // the shrink is an eased animation, not instant
assert(someSq._sqScale === 1, "...and the PREVIOUS sticky district's block shrinks back down once a new one takes over");

console.log("Summary > District: pin locks the panel; click-elsewhere unpins but keeps content sticky (no reset)");
click(otherSq);
assert(districtDetail.classList.contains("ctt-pinned"), "clicking a block pins the district panel");
assert(districtDetail.querySelector(".ctt-district-jump"), "pinned panel shows a Jump-to-court button");
const rowsAfterPin = [...districtDetail.querySelectorAll(".ctt-district-row")];
assert(rowsAfterPin[0].classList.contains("ctt-district-row-active") && rowsAfterPin[0].textContent.includes(otherCourt.short_name),
  "the pinned district's row is (still) at the top, bolded/highlighted — identical treatment to hover");
assert(mod._dev.S.districtDetailPinnedId === otherDid, "pin state lives on S (module-level), not a local closure var");

console.log("Summary > District: while pinned, a DIFFERENT district still grows on hover but does NOT stick (operator ask, 2026-09-08)");
// Before this fix, sticky mode never distinguished "pinned" from "just hovered" — a second
// district hovered WHILE one was pinned would grow and then stay stuck grown too, reading as a
// second, equally-locked district alongside the real pin. Only the pin itself should persist.
const thirdSq = [...root.querySelectorAll(".ctt-summary-content .ctt-district-sq[data-district-id]")]
  .find((sq) => ![hoveredDid, otherDid].includes(sq.getAttribute("data-district-id")));
thirdSq.dispatchEvent(new window.MouseEvent("pointermove", { bubbles: true, clientX: 5, clientY: 5 }));
assert(thirdSq._sqScale > 1, "hovering a third (non-pinned) district still grows it while actively hovered");
assert(otherSq._sqScale > 1, "...and the actual pin stays grown throughout, unaffected");
thirdSq.dispatchEvent(new window.MouseEvent("pointerleave", { bubbles: true }));
await sleep(120);
assert(thirdSq._sqScale === 1, "...but the third district's growth does NOT stick — it shrinks back down once the cursor leaves it");
assert(otherSq._sqScale > 1, "...while the pin remains grown, unaffected by the third district's hover coming and going");

otherSq.dispatchEvent(new window.MouseEvent("pointerleave", { bubbles: true }));
assert(otherSq._sqScale > 1, "the pinned block's enlarged hover state survives the cursor leaving (locked, not just sticky)");
assert(districtDetail.classList.contains("ctt-pinned"), "the panel itself also stays pinned after the cursor leaves");
// Standard behavior copied from the judge-detail panel: clicking anywhere else unpins it.
// (mousedown, not click — that's the event type the document-level listener matches, same
// technique the existing judge-detail "clicking off unpins" test already uses above.)
window.document.body.dispatchEvent(new window.MouseEvent("mousedown", { bubbles: true }));
assert(!districtDetail.classList.contains("ctt-pinned"), "clicking elsewhere unpins the district panel (standard, copied from the judge detail panel)");
assert(mod._dev.S.districtDetailPinnedId === null, "S.districtDetailPinnedId clears on click-elsewhere unpin");
assert(districtDetail.querySelector(".ctt-detail-name").textContent.includes(otherCourt.court_name),
  "unpinning does NOT reset content to the hint (matches unpinDetail()'s judge-panel precedent) — the just-unpinned district stays showing");
assert(otherSq._sqScale > 1, "...and its block stays grown too, since sticky-hover still points at it (no mouse movement has happened since)");
someSq.dispatchEvent(new window.MouseEvent("pointermove", { bubbles: true, clientX: 3, clientY: 3 }));
assert(districtDetail.querySelector(".ctt-detail-name").textContent.includes(hoveredCourt.court_name),
  "a real new hover (now unpinned) takes over content again");
await sleep(120);
assert(otherSq._sqScale === 1, "...and shrinks the formerly-sticky/pinned block back down");
assert(someSq._sqScale > 1, "...growing the newly-hovered one instead");

console.log("Summary > District: a pin survives switching Summary sub-tabs and back");
click(someSq);   // re-pin
assert(mod._dev.S.districtDetailPinnedId === hoveredDid, "re-pinned to someSq");
click(toggle("Supreme Court")); await sleep(20);
click(toggle("District Courts")); await sleep(20);
const districtDetail2 = root.querySelector(".ctt-district-detail");
assert(districtDetail2.classList.contains("ctt-pinned"), "reopening District still shows the pin (module-level state, not per-render)");
assert([...districtDetail2.querySelectorAll(".ctt-district-row")][0].classList.contains("ctt-district-row-active"),
  "...with the pinned row still reordered to the top");

click(districtDetail2.querySelector(".ctt-detail-close"));
assert(!districtDetail2.classList.contains("ctt-pinned"), "close button unpins the district panel");
assert(!/Hover over a district/.test(districtDetail2.textContent),
  "unpinning via the close button does NOT reset to the usage hint either — same no-reset contract as clicking elsewhere");

console.log("stray docked-detail-panel bug (operator report, 2026-09-04): fixed");
// :not(.ctt-district-detail) disambiguates the shared judge-detail node from District's own
// (separate) docked panel, added later the same session — both carry the .ctt-detail class for
// shared styling, so a bare query is ambiguous now that both can exist at once.
const judgeDetailSel = ".ctt-detail:not(.ctt-district-detail)";
assert(root.querySelector(judgeDetailSel).style.display === "none",
  "docked judge-detail panel is hidden while District is showing (it has no per-district judge to detail)");
click(root.querySelector('.ctt-selector-item[data-court-id="summary"]')); await sleep(20);   // close WHILE on District
click(root.querySelector('.ctt-selector-item[data-court-id="summary"]')); await sleep(60);   // reopen — S.summaryView persisted as "district"
assert(root.querySelector(".ctt-summary-switch .ctt-mode-opt.ctt-is-active").textContent === "District Courts",
  "reopened Summary defaults back into the persisted District sub-view");
assert(root.querySelector(judgeDetailSel).style.display === "none",
  "reopening straight into District (never passing through SCOTUS first) does NOT leave the docked detail panel visible");

click(toggle("Supreme Court")); await sleep(20);   // back to the default sub-view for a clean state
click(root.querySelector('.ctt-selector-item[data-court-id="summary"]')); await sleep(20);  // deselect

console.log("District 'Set upon map' deployment (operator spec, 2026-09-04)");
click(root.querySelector('.ctt-selector-item[data-court-id="summary"]')); await sleep(60);
click(toggle("District Courts")); await sleep(60);
const overlay = root.querySelector(".ctt-district-overlay");
assert(overlay.style.display === "none", "deployed overlay starts hidden (nothing deployed yet)");
const deployBtn = root.querySelector(".ctt-district-deploy-btn");
assert(deployBtn.textContent === "▼ Set upon map ▼", "deploy button starts as '▼ Set upon map ▼'");
click(deployBtn);
assert(overlay.style.display !== "none", "overlay becomes visible after deploying");
assert(deployBtn.textContent === "▼ Remove from map ▼", "Summary's own button flips label once deployed");
assert(overlay.querySelectorAll(".ctt-district-cluster").length === 12,
  "deployed overlay renders all 12 geographic circuits, same as the Summary preview");
// Default placement: fully within the viewport's own bounds (jsdom's 0-everything layout means
// this checks the ARITHMETIC, not a real screen position — see NOMINAL_MAP_PX fallbacks).
assert(mod._dev.S.districtMapState.left >= 0 && mod._dev.S.districtMapState.top >= 0,
  `default position is non-negative (got ${JSON.stringify(mod._dev.S.districtMapState)})`);

console.log("fixed-frame corner controls (operator ask, 2026-09-06): live OUTSIDE the draggable assembly");
const cornerControls = root.querySelector(".ctt-district-corner-controls");
assert(cornerControls, "the fixed corner-controls box exists");
assert(!overlay.contains(cornerControls), "...and is NOT a descendant of the draggable assembly itself");
assert(cornerControls.querySelectorAll(".ctt-district-overlay-btn").length === 3,
  "shows all 3 controls (remove + resize +/-) while the assembly is deployed and visible");
const cornerBtnOrder = [...cornerControls.querySelectorAll(".ctt-district-overlay-btn")].map((b) => b.textContent);
assert(cornerBtnOrder[cornerBtnOrder.length - 1] === "×",
  `× (remove) is the RIGHT-MOST control (operator ask, 2026-09-07) (got order ${cornerBtnOrder})`);
// The actual top-right POSITION is a CSS-value claim jsdom can't check (no stylesheet loaded in
// this harness) — covered instead in tests/browser-checks.mjs (real Chrome).

console.log("on-map remove (×) preserves position — no full undeploy — and leaves a D button to redeploy");
const savedState = { ...mod._dev.S.districtMapState };
click([...cornerControls.querySelectorAll(".ctt-district-overlay-btn")].find((b) => b.textContent === "×"));
assert(overlay.style.display === "none", "clicking × hides the (SVG-only) overlay");
assert(deployBtn.textContent === "▼ Set upon map ▼", "Summary's button reflects the hide");
assert(JSON.stringify(mod._dev.S.districtMapState) === JSON.stringify(savedState),
  "hiding does NOT discard the remembered position/size (only visibility toggles)");
const dButtons = cornerControls.querySelectorAll(".ctt-district-overlay-btn");
assert(dButtons.length === 1 && dButtons[0].textContent === "D",
  "removed: the corner controls collapse to a single D (deploy) button — resize +/- are gone too");
click(dButtons[0]);   // re-show via the fixed D button, NOT Summary's own button this time
assert(overlay.style.display !== "none", "the D button re-shows the assembly exactly where it was");
assert(JSON.stringify(mod._dev.S.districtMapState) === JSON.stringify(savedState),
  "...at the SAME remembered position/size, not a fresh default");

console.log("resize +/- (operator spec) persists the zoom across a page reload (operator ask, 2026-09-06)");
const widthBefore = mod._dev.S.districtMapState.width;
click([...cornerControls.querySelectorAll(".ctt-district-overlay-btn")].find((b) => b.textContent === "+"));
assert(mod._dev.S.districtMapState.width > widthBefore, `+ grows the overlay (${widthBefore} -> ${mod._dev.S.districtMapState.width})`);
const widthAfterGrow = mod._dev.S.districtMapState.width;
assert(+localStorage.getItem(mod._dev.DISTRICT_ZOOM_STORAGE_KEY) === widthAfterGrow,
  "growing persists the new width to localStorage immediately (not just in memory)");
click([...cornerControls.querySelectorAll(".ctt-district-overlay-btn")].find((b) => b.textContent === "−"));
assert(mod._dev.S.districtMapState.width < widthAfterGrow, "− shrinks the overlay back down");
assert(+localStorage.getItem(mod._dev.DISTRICT_ZOOM_STORAGE_KEY) === mod._dev.S.districtMapState.width,
  "...and shrinking updates the persisted value too");
// A FRESH default computation (as "Set upon map" or the D button would use) picks up the
// persisted zoom instead of the hardcoded 280 default — position is never persisted (only zoom),
// so this is checked via width alone.
const freshState = mod._dev.defaultDistrictMapState(0.6);
assert(freshState.width === mod._dev.S.districtMapState.width,
  `a fresh deploy would reuse the persisted zoom (got ${freshState.width}, want ${mod._dev.S.districtMapState.width})`);

console.log("corner controls are covered by the pane / hidden outside national view, same as the assembly itself");
click(root.querySelector('.ctt-selector-item[data-court-id="ca9"]')); await sleep(60);
assert(cornerControls.style.display === "none", "opening a court's pane also hides the fixed corner controls");
click(root.querySelector('.ctt-drill')); await sleep(60);   // drills in AND closes the pane
assert(cornerControls.style.display === "none", "drilling into a circuit hides the corner controls too (national view only)");
await mod._dev.drillOut(); await sleep(60);
assert(cornerControls.style.display !== "none", "...and they're back once national view + a closed pane both hold again");

console.log("hover-highlight of the real district shape (operator spec: 'standard blue')");
const someOverlaySq = overlay.querySelector(".ctt-district-sq[data-district-id]");
const targetDid = someOverlaySq.getAttribute("data-district-id");
someOverlaySq.dispatchEvent(new window.MouseEvent("pointermove", { bubbles: true, clientX: 1, clientY: 1 }));
const litShape = root.querySelector(".ctt-shape-district-hover");
assert(litShape && litShape.getAttribute("data-court-id") === targetDid,
  `hovering a deployed block tints that district's REAL map shape (got ${litShape?.getAttribute("data-court-id")}, want ${targetDid})`);
overlay.querySelector(".ctt-district-cartogram").dispatchEvent(new window.MouseEvent("pointerleave", { bubbles: true }));
assert(!root.querySelector(".ctt-shape-district-hover"), "moving off the overlay clears the map-shape highlight");

console.log("REGRESSION (operator report, 2026-09-07): hovering ONE district must not grow every district in the assembly");
// Root cause: `grow` was `(hoveredId && ...) || (isPinned && isPinned(sqDid))` — without an
// isPinned function (the plain on-map wiring), the second half evaluates to `undefined`, not
// `false`. classList.toggle(name, undefined) is spec'd to behave as a NORMAL toggle (flip
// current state) rather than force-remove, so every non-hovered square's ABSENT class flipped to
// PRESENT on its very first evaluation. Locking in the `!!(...)` fix permanently.
someOverlaySq.dispatchEvent(new window.MouseEvent("pointermove", { bubbles: true, clientX: 1, clientY: 1 }));
const grownDids = new Set([...overlay.querySelectorAll(".ctt-district-sq.ctt-district-sq-grown")]
  .map((sq) => sq.getAttribute("data-district-id")));
assert(grownDids.size === 1 && grownDids.has(targetDid),
  `only the hovered district's own cells carry ctt-district-sq-grown (got ${grownDids.size} distinct districts: ${[...grownDids]})`);

console.log("drag repositioning (operator spec)");
const before = { ...mod._dev.S.districtMapState };
overlay.dispatchEvent(new window.PointerEvent("pointerdown", { bubbles: true, clientX: 500, clientY: 500 }));
window.dispatchEvent(new window.PointerEvent("pointermove", { clientX: 460, clientY: 470 }));
window.dispatchEvent(new window.PointerEvent("pointerup", { clientX: 460, clientY: 470 }));
assert(mod._dev.S.districtMapState.left === before.left - 40 || Math.abs(mod._dev.S.districtMapState.left - (before.left - 40)) < 1,
  `dragging moves the overlay by the pointer delta (left ${before.left} -> ${mod._dev.S.districtMapState.left})`);

console.log("redeploying always replaces (operator confirmed) — resets to a fresh default");
overlay.dispatchEvent(new window.PointerEvent("pointerdown", { bubbles: true, clientX: 500, clientY: 500 }));
window.dispatchEvent(new window.PointerEvent("pointermove", { clientX: 300, clientY: 300 }));
window.dispatchEvent(new window.PointerEvent("pointerup", { clientX: 300, clientY: 300 }));
const draggedState = { ...mod._dev.S.districtMapState };
click(deployBtn);   // "Remove from map" — full round trip back to "Set upon map"
click(deployBtn);   // fresh "Set upon map" click: should NOT reuse the dragged-to position
assert(JSON.stringify(mod._dev.S.districtMapState) !== JSON.stringify(draggedState),
  "a fresh 'Set upon map' does not resume a previous deployment's dragged position");

console.log("circuit drill-in: national assembly hides, a fixed circuit-only sub-assembly shows");
const ca8ItemForDrill = [...root.querySelectorAll(".ctt-selector-item")].find((i) => i.getAttribute("data-court-id") === "ca8");
click(root.querySelector(".ctt-pane-close"));
click(ca8ItemForDrill); await sleep(30);
click(root.querySelector(".ctt-drill"));
await waitFor(() => mod._dev.S.view === "circuit", 2000);
await sleep(30);
assert(overlay.style.display === "none", "national deployed assembly is hidden while drilled in");
const sub = root.querySelector(".ctt-district-subassembly");
assert(sub, "a circuit-scoped fixed sub-assembly appears on drill-in");
await waitFor(() => sub.querySelectorAll(".ctt-district-cluster").length > 0, 1000);
const subClusters = [...sub.querySelectorAll(".ctt-district-cluster")].map((g) => g.getAttribute("data-circuit-id"));
assert(JSON.stringify(subClusters) === JSON.stringify(["ca8"]),
  `sub-assembly renders ONLY the drilled-in circuit's own cluster (got ${JSON.stringify(subClusters)})`);
// The actual bottom-left POSITION is a CSS-value claim jsdom can't check (no stylesheet loaded
// in this harness) — covered instead in tests/browser-checks.mjs (real Chrome).
console.log("sub-assembly hover ties to the standard blue map-shape highlight too (operator ask, 2026-09-07)");
const subSq = sub.querySelector(".ctt-district-sq[data-district-id]");
const subTargetDid = subSq.getAttribute("data-district-id");
subSq.dispatchEvent(new window.MouseEvent("pointermove", { bubbles: true, clientX: 1, clientY: 1 }));
const subLit = root.querySelector(".ctt-shape-district-hover");
assert(subLit && subLit.getAttribute("data-court-id") === subTargetDid,
  `hovering the sub-assembly tints the matching real (LOCAL circuit) map shape (got ${subLit?.getAttribute("data-court-id")}, want ${subTargetDid})`);

console.log("sub-assembly hover also grows the real on-map seat-block grid for that district (operator ask, 2026-09-08)");
const realBlock = root.querySelector(`.ctt-local-layer .ctt-block[data-court-id="${subTargetDid}"]`);
assert(realBlock && realBlock.classList.contains("ctt-block-hover"),
  "the matching real seat-block grid picks up ctt-block-hover from the sub-assembly hover");
subSq.dispatchEvent(new window.MouseEvent("pointerleave", { bubbles: true }));
assert(!realBlock.classList.contains("ctt-block-hover"), "...and releases it once the cursor leaves the sub-assembly");

console.log("clicking a sub-assembly block opens that district's own info pane (operator ask, 2026-09-08)");
click(subSq);
await sleep(30);
assert(mod._dev.S.selectedCourt === subTargetDid, `clicking the sub-assembly block selected/opened ${subTargetDid}'s own pane (got ${mod._dev.S.selectedCourt})`);
assert(root.querySelector(".ctt-pane").classList.contains("ctt-is-open"), "...and the pane is actually open");
click(root.querySelector(".ctt-pane-close"));
await sleep(30);

click(root.querySelector(".ctt-selector-back"));
await waitFor(() => mod._dev.S.view === "national", 2000);
assert(!root.querySelector(".ctt-district-subassembly"), "sub-assembly is swept on drill-out");
assert(overlay.style.display !== "none", "the national deployed assembly reappears back in national view");

console.log("Federal Circuit has no district sub-assembly (no districts of its own)");
click(root.querySelector('.ctt-selector-item[data-court-id="cafc"]'));   // opens cafc's own pane
await sleep(30);
click(root.querySelector(".ctt-drill"));   // "View feeders →" — actually drills into the feeder view
await sleep(30);
assert(!root.querySelector(".ctt-district-subassembly"), "cafc's feeder view shows no sub-assembly (it has no districts)");
click(root.querySelector(".ctt-selector-back"));
await sleep(30);

console.log("appointments beeswarm widget (separate module, session aj)");
{
  const chartRoot = document.createElement("div");
  chartRoot.id = "appointments-chart-root-test";
  document.body.append(chartRoot);
  const chart = await import(pathToFileURL(REPO + "/embed/appointments-chart.js").href);
  await chart.mount(chartRoot);
  await sleep(30);
  const A = chart._dev.A;
  const reorgRows = A.rows.filter((r) => (r.appointing_president || "").startsWith("None")).length;
  assert(A.dots.length === A.rows.filter((r) => r.commission_date).length - reorgRows - A.chiefMerges,
    `one dot per appointment, minus ${reorgRows} reorganizations and ${A.chiefMerges} chief-justice merge (${A.dots.length})`);
  assert(A.chiefMerges === 1, "exactly one associate->chief merge since 1969 (Rehnquist)");
  assert(chartRoot.querySelectorAll(".cta-scotus-photo").length === 20,
    "20 SCOTUS photo dots (21 appointments, Rehnquist's two merged into one)");
  assert(chartRoot.querySelectorAll("rect.cta-band-rep, rect.cta-band-dem").length === 11,
    "eleven presidency bands drawn (Nixon through the current term)");
  assert(chartRoot.querySelector(".cta-detail-hint"), "detail panel starts with the usage hint");
  // Rehnquist: ONE dot at the 1971 commission; detail says he BECAME Chief, not left+rejoined
  const wr = A.dots.find((d) => /Rehnquist/.test(d.row.full_name));
  wr.node.dispatchEvent(new window.Event("pointerover", { bubbles: true }));
  await sleep(10);
  const wrTxt = chartRoot.querySelector(".cta-detail-content").textContent;
  assert(/Commissioned 1971-12-15/.test(wrTxt) && /Became Chief Justice 1986-09-25/.test(wrTxt),
    "Rehnquist's merged dot: original commission + Became Chief Justice line");
  assert(/Left the bench 2005-09-03/.test(wrTxt) && !/Also appointed: SCOTUS/.test(wrTxt),
    "…final departure from the CHIEF tenure, and no bogus second-SCOTUS listing");
  // SCOTUS never shows lower-court "Senior status": FJC's senior date = retirement
  const ken = A.dots.find((d) => /Kennedy/.test(d.row.full_name) && d.row.court_level === "scotus");
  ken.node.dispatchEvent(new window.Event("pointerover", { bubbles: true }));
  await sleep(10);
  const kenTxt = chartRoot.querySelector(".cta-detail-content").textContent;
  assert(/Left the bench 2018-07-31 \(retired\)/.test(kenTxt) && !/Senior status/.test(kenTxt),
    "a retired justice reads 'Left the bench (retired)', never 'Senior status'");

  // hover -> detail + same-person group highlight (Barrett: 7th Cir. + SCOTUS)
  const barrett = A.dots.find((d) => /Barrett/.test(d.row.full_name) && d.row.court_level === "scotus");
  barrett.node.dispatchEvent(new window.Event("pointerover", { bubbles: true }));
  await sleep(10);
  assert(/Barrett/.test(chartRoot.querySelector(".cta-detail-name").textContent),
    "hovering a dot fills the docked panel");
  assert(chartRoot.querySelectorAll(".cta-dot-hl").length === 2,
    "same-person appointments highlight as a group (Barrett: 7th Cir. + SCOTUS)");
  assert(chartRoot.querySelectorAll(".cta-dot-hl-border").length === 0,
    "no black border ring on the hover highlight when no mark mode is active");
  assert(/Also appointed: 7th Cir\./.test(chartRoot.querySelector(".cta-detail-content").textContent),
    "panel lists the person's other appointments");
  // a statutory reorganization appears as an INFO LINE on the affected judge, never a dot
  const reKey = [...A.reorgByPerson.keys()].find((k) => (A.personDots.get(k) || []).length);
  const reDot = A.personDots.get(reKey)[0];
  reDot.node.dispatchEvent(new window.Event("pointerover", { bubbles: true }));
  await sleep(10);
  assert(/Reassigned by statute to/.test(chartRoot.querySelector(".cta-reorg-line")?.textContent || ""),
    "statutory reorganization renders as an info line on the judge's dot");
  // pin lifecycle (session ak): clicks NEVER unpin — controls, chart, page; the (×) and a
  // non-control keypress do.
  reDot.node.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  const detailEl2 = chartRoot.querySelector(".cta-detail");
  assert(detailEl2.classList.contains("cta-pinned"), "clicking a dot pins the panel");
  window.document.body.dispatchEvent(new window.MouseEvent("mousedown", { bubbles: true }));
  assert(detailEl2.classList.contains("cta-pinned"), "clicking elsewhere does NOT unpin");
  chartRoot.querySelector('.cta-mark-opt[data-mark="fedsoc"]').dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert(detailEl2.classList.contains("cta-pinned"), "using the mark switch does NOT unpin");
  // marking = yellow recolor via classes (hatching was too subtle); dual-affiliation
  // judges carry BOTH classes (the old fedsoc-else-acs overlay dropped their ACS mark)
  assert(chartRoot.dataset.mark === "fedsoc" && chartRoot.querySelectorAll(".cta-aff-fedsoc").length > 50,
    `FedSoc mark mode set; marked dots carry the class (${chartRoot.querySelectorAll(".cta-aff-fedsoc").length})`);
  // while marking, the yellow hover ring gets a thin black border ring (dots can be the
  // same yellow when marked) — one border per highlighted dot, matching the ring count
  barrett.node.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert(chartRoot.querySelectorAll(".cta-dot-hl-border").length === 2 && chartRoot.querySelectorAll(".cta-dot-hl").length === 2,
    "marking active: hover ring gains a black border ring per highlighted dot (Barrett: 7th Cir. + SCOTUS)");
  const dual = A.rows.find((r) => r.fedsoc_reported === "true" && r.acs_reported === "true");
  if (dual) {
    const dd = A.dots.find((x) => x.row === dual);
    const tNode = dd.node.classList.contains("cta-dot") ? dd.node : dd.node.querySelector(".cta-scotus-ring");
    assert(tNode.classList.contains("cta-aff-fedsoc") && tNode.classList.contains("cta-aff-acs"),
      `a dual-affiliation judge (${dual.full_name}) is markable under BOTH modes`);
  }
  assert(chartRoot.querySelector(".cta-detail .cta-caveat"),
    "the affiliation caveat lives at the bottom of the docked panel (no layout shift)");
  // president boundary lines are dashed separators at every transition (10 for 11 terms)
  assert(chartRoot.querySelectorAll(".cta-president-line").length === 10,
    `dashed president boundary lines drawn (${chartRoot.querySelectorAll(".cta-president-line").length})`);
  // year labels: centered mid-year, %1/%2/%4/%8 progression — at the default 8yr span every
  // year is labeled; the slider's tick bars + numbers are positioned per-stop
  assert(chartRoot.querySelectorAll(".cta-span-marks span").length ===
         chartRoot.querySelectorAll(".cta-span-ticks span").length &&
         chartRoot.querySelectorAll(".cta-span-marks span").length === 9,
    "slider tick bars and labels exist one-per-stop (2,4,8,12,16,20,30,40,max)");
  // departure tags: moved-to-another-role is "Reappointed", not "No longer serving"
  // (unpin first: the panel is still pinned from the lifecycle assertions above)
  window.document.body.dispatchEvent(new window.KeyboardEvent("keydown", { key: "a", bubbles: true }));
  const reapp = A.dots.find((x) => /appointment to another/i.test(x.row.termination_reason || ""));
  reapp.node.dispatchEvent(new window.Event("pointerover", { bubbles: true }));
  await sleep(10);
  assert(/Reappointed/.test(chartRoot.querySelector(".cta-detail-name").textContent) &&
         !/No longer serving/.test(chartRoot.querySelector(".cta-detail-name").textContent),
    "an elevated judge's earlier appointment tags as Reappointed");
  // at-a-glance court line: bold-italic short name + full name on the next line
  assert(chartRoot.querySelector(".cta-detail-court") && chartRoot.querySelector(".cta-detail-courtname"),
    "detail shows the short court line + full court name on its own line");
  // sitting non-SCOTUS judges show their photo in the panel (dots stay photo-less)
  const sitDist = A.dots.find((x) => x.row.sitting === "true" && x.row.court_level === "district" && x.row.photo_url);
  sitDist.node.dispatchEvent(new window.Event("pointerover", { bubbles: true }));
  await sleep(10);
  assert(chartRoot.querySelector(".cta-detail-photo img"),
    "a sitting district judge's docked detail shows their licensed photo");
  // recess appointments: plotted at the RECESS date, explained in the panel (Roger Gregory:
  // Clinton recess-appointed 2000-12-27; commission followed under Bush 2001-07-25)
  const greg = A.dots.find((x) => /Roger L. Gregory/.test(x.row.full_name) && x.row.court_id === "ca4");
  assert(greg.day === Math.floor(Date.parse("2000-12-27T12:00:00Z") / 86400000),
    "Gregory's dot sits at his RECESS appointment date, inside Clinton's term");
  greg.node.dispatchEvent(new window.Event("pointerover", { bubbles: true }));
  await sleep(10);
  assert(/Recess appointment 2000-12-27/.test(chartRoot.querySelector(".cta-detail-content").textContent),
    "the panel explains the recess appointment -> later commission sequence");
  // per-president band counts (Nixon appointed four justices: Burger, Blackmun, Powell, Rehnquist).
  // Name and counts are now separate <text> elements (a president icon sits between them,
  // session (aw)), so match across the GROUP's combined textContent rather than one element.
  const bandTexts = [...chartRoot.querySelectorAll(".cta-band-label-group")].map((x) => x.textContent);
  assert(bandTexts.some((x) => /Nixon.*4 SCOTUS.*\d+ Appellate.*\d+ District/.test(x)),
    `Nixon's band counts his appointments by type (${bandTexts.find((x) => /Nixon/.test(x))})`);
  // explainer: preset view + fedsoc mark + callout boxes; user pan dismisses (mark reverts,
  // view stays); button toggles with FULL restore. Normalize state first — mark is still
  // "fedsoc" from the marking assertions above, and restore restores whatever was saved.
  chartRoot.querySelector('.cta-mark-opt[data-mark="none"]').dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  chartRoot.querySelector(".cta-explain-btn").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await sleep(20);
  assert(A.spanYears === 12 && chartRoot.dataset.mark === "fedsoc" &&
    chartRoot.querySelectorAll(".cta-explainer-box").length >= 4,
    `explainer: preset 12yr view, FedSoc on, ${chartRoot.querySelectorAll(".cta-explainer-box").length} callouts`);
  chartRoot.querySelector(".cta-chart").dispatchEvent(new window.Event("pointerdown", { bubbles: true }));
  await sleep(10);
  assert(!chartRoot.querySelector(".cta-explainer") && chartRoot.dataset.mark === "none" && A.spanYears === 12,
    "panning dismisses the explainer: mark reverts, the user's view is respected");
  chartRoot.querySelector(".cta-explain-btn").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await sleep(10);
  chartRoot.querySelector(".cta-explain-btn").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await sleep(10);
  assert(!chartRoot.querySelector(".cta-explainer") && A.spanYears === 12 && chartRoot.dataset.mark === "none",
    "clicking the button again fully restores the pre-explainer state");
  assert(chartRoot.querySelector(".cta-detail-close"), "pinned panel exposes the (×) unpin");
  chartRoot.querySelector(".cta-detail-close").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert(!detailEl2.classList.contains("cta-pinned"), "(×) unpins");
  reDot.node.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  window.document.body.dispatchEvent(new window.KeyboardEvent("keydown", { key: "a", bubbles: true }));
  assert(!detailEl2.classList.contains("cta-pinned"), "a keypress (outside form controls) unpins");
  // span arrows step by one year; the slider covers discrete stops up to the full span
  const spanBtns = chartRoot.querySelectorAll(".cta-span-arrow");
  const y0span = A.spanYears;
  spanBtns[1].dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert(A.spanYears === y0span + 1, `[+] arrow adds one year (${A.spanYears})`);
  spanBtns[0].dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert(A.spanYears === y0span, "[−] arrow removes one year");
  // span slider repacks: radii shrink when zooming way out
  const r8 = Math.max(...A.dots.map((d) => d.r));
  const slider = chartRoot.querySelector(".cta-span input");
  slider.value = slider.max;
  slider.dispatchEvent(new window.Event("input", { bubbles: true }));
  await sleep(30);
  const rMax = Math.max(...A.dots.map((d) => d.r));
  assert(rMax < r8, `dot radius scales down with a wider span (${rMax.toFixed(1)} < ${r8.toFixed(1)})`);
}

console.log(`\n${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"}`);
process.exit(failures === 0 ? 0 : 1);
