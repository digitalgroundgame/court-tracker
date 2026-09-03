// court-tracker.js — embeddable federal-court appointment tracker (ES module).
//
// Phase 1: the 8th-Circuit vertical slice, end-to-end, against REAL geometry.
// National view (circuit shapes + districts) -> single-click a circuit -> slide-down info
// pane with the bench (judge icons, party rings, seniors, vacancies, chief, Circuit Justice)
// -> majority semicircle toggle -> "View districts" drill-in (per-vertex morph from the
// national projection to the circuit-local one; zoom+crossfade fallback) -> back.
//
// Assets are fetched relative to import.meta.url and lazy-loaded (national view loads only
// courts.json + national.svg; a circuit's judges + local SVG load on demand), so the widget
// runs from file://, when archived, and as a static download.

import { PRESIDENCIES } from "./presidencies.js";

const ASSET_ROOT = new URL("../", import.meta.url);
// The manifest's content-hash version is appended to every asset URL — this IS the
// cache-busting the manifest exists for (CLAUDE.md §6), and it was documented but never
// implemented until 2026-07-19: Chrome's heuristic cache (10% of a file's age, and python
// -m http.server sends Last-Modified) happily served a STALE seat_blocks.json, so the
// operator's CSV edits + rebuild changed nothing on screen. http(s) only — file:// and
// odd archive setups keep plain URLs (query strings there range from ignored to broken).
const resolve = (rel) => {
  const u = new URL(rel, ASSET_ROOT);
  if (S.manifest?.version && /^https?:$/.test(u.protocol)) u.searchParams.set("v", S.manifest.version);
  return u.href;
};
const SVGNS = "http://www.w3.org/2000/svg";

async function fetchJSON(rel, opts) {
  const r = await fetch(resolve(rel), opts);
  if (!r.ok) throw new Error(`${rel}: HTTP ${r.status}`);
  return r.json();
}
async function fetchText(rel) {
  const r = await fetch(resolve(rel));
  if (!r.ok) throw new Error(`${rel}: HTTP ${r.status}`);
  return r.text();
}
function el(tag, cls, attrs) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (attrs) for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
}
function svgEl(tag, attrs) {
  const n = document.createElementNS(SVGNS, tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
}

// ---- module state -------------------------------------------------------------
const S = {
  manifest: null,
  courts: new Map(),          // court_id -> court record
  districtsByCircuit: new Map(),
  judgeCache: new Map(),      // circuit_id -> judge[]  (circuit + its districts)
  justices: new Map(),        // circuit_id -> justice record
  justicesLoaded: false,
  view: "national",           // 'national' | 'circuit'
  activeCircuit: null,        // circuit_id currently drilled into
  selectedCourt: null,
  ui: null,
  localSVGCache: new Map(),   // circuit_id -> injected local <svg>
  localPending: new Map(),    // circuit_id -> in-flight injection (dedupes concurrent drills)
  seatBlocks: null,           // court_id -> {level,total,r,d,o,vacancies,anchor,size}
  morphPlans: new Map(),      // circuit_id -> morph plan | null (null = fell back to zoom)
  morphRAF: null,
  morphCancel: null,          // settles an in-flight morph as "cancelled" (see cancelMorph)
  majorityMode: false,        // kept in sync with paneMode==='majority' — existing arc code reads this
  paneMode: "timeline",       // 'timeline' | 'majority' | 'change'
  seniorMode: "hide",         // 'hide' | 'show' | 'include' — Majority-view senior handling
  affilMark: "none",          // 'none' | 'fedsoc' | 'acs' — mark reported affiliations
  detailPinned: false,
  appointmentsAll: null,      // data/appointments.json, lazy-loaded once for the Change view
  presidentPhotos: null,      // data/president_photos.json, lazy-loaded once
  streamColorScheme: "alt",   // 'alt' | 'fade' — Change view palette (operator A/B, CLAUDE ask)
  summaryView: "scotus",      // 'scotus' | 'appellate' | 'district' — Summary pane sub-tab
  districtArrangement: null,  // data/district_arrangement.json, lazy-loaded once (Summary > District)
  districtOnMap: false,       // is the deployed cartogram currently VISIBLE on the national map
  districtMapState: null,     // { left, top, width } CSS px in .ctt-map-viewport — persists
                               // across show/hide toggles; reset only by a fresh deploy from
                               // Summary ("Set upon map" always replaces — operator confirmed)
};
// Sentinel selectedCourt value for the Summary pane — not a real courts.csv row (has_geography
// doesn't apply; it's a fixed pane, never a map shape), so every place that reads S.selectedCourt
// as a courts.json lookup must tolerate this not resolving to anything.
const SUMMARY_ID = "summary";

const PARTY_CLASS = { Republican: "ctt-rep", Democratic: "ctt-dem" };

// Day-number helpers for the Change view's time axis — same convention as appointments-chart.js
// (days since the Unix epoch, computed off noon UTC so local timezone can't shift the date).
const DAY_MS = 86400000;
const dayNum = (iso) => Math.floor(Date.parse(iso + "T12:00:00Z") / DAY_MS);
const isoOfDayNum = (day) => new Date(day * DAY_MS + DAY_MS / 2).toISOString().slice(0, 10);
// Plain string slicing (not Date parsing) - `iso` is always a validated YYYY-MM-DD from
// build_assets.py, and this avoids any local-timezone shift for a plain calendar date.
const isoToMDY = (iso) => {
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
};

// ---- shell --------------------------------------------------------------------
function buildShell(root) {
  root.classList.add("ctt-root");
  root.innerHTML = "";

  const header = el("div", "ctt-header");
  const tracked = el("div", "ctt-tracked");
  const titleRow = el("div", "ctt-title-row");
  const title = el("div", "ctt-title");
  title.textContent = "Federal Court Appointment Tracker";
  const subtitle = el("div", "ctt-subtitle");
  titleRow.append(title, subtitle);
  header.append(tracked, titleRow);

  const body = el("div", "ctt-body");
  const selector = el("nav", "ctt-selector", { "aria-label": "Court selector" });
  const viewport = el("div", "ctt-map-viewport");
  const svgStack = el("div", "ctt-svg-stack");   // national + local SVG layers
  const status = el("div", "ctt-status");
  status.textContent = "Loading…";
  // District overlay: the "Set upon map" deployed cartogram. Sits ABOVE the map SVGs but
  // BELOW the pane in DOM order (both are position:absolute with no z-index, so DOM order IS
  // stacking order) — the info pane already covers "the rest of the map view" when open
  // (CLAUDE.md §5), and this must be covered by it too rather than floating above it.
  const districtOverlay = el("div", "ctt-district-overlay");
  districtOverlay.style.display = "none";
  viewport.append(svgStack, status, districtOverlay);

  const pane = el("div", "ctt-pane", { role: "region", "aria-label": "Court detail" });
  const paneBody = el("div", "ctt-pane-body");
  const stow = el("button", "ctt-pane-stow", { type: "button", "aria-label": "Hide panel", title: "Hide" });
  stow.textContent = "▲";
  // Toggle: hide if open; re-show if a court is selected (fixes stow not re-showing).
  stow.addEventListener("click", () => {
    const open = pane.classList.contains("ctt-is-open");
    if (open) togglePane(false);
    else if (S.selectedCourt) togglePane(true);
  });
  // Always-visible close (×) — the reliable way to dismiss the pane, esp. on mobile
  // where the full-height sheet hides the stow arrow.
  const close = el("button", "ctt-pane-close", { type: "button", "aria-label": "Close panel", title: "Close" });
  close.textContent = "×";
  close.addEventListener("click", deselect);
  // Stow-only button next to the ×: since the pane went full-height, the bottom edge tab is
  // invisible unless you know it exists — this is the discoverable way DOWN to the map. The
  // edge tab remains the way back UP (its toggle also still stows, harmless).
  const stowTop = el("button", "ctt-pane-close ctt-pane-stowtop",
    { type: "button", "aria-label": "Stow panel and show the map", title: "Show map" });
  stowTop.textContent = "▲";
  stowTop.addEventListener("click", () => togglePane(false));
  pane.append(paneBody, stowTop, close, stow);
  viewport.append(pane);

  body.append(selector, viewport);
  root.append(header, body);

  const tooltip = el("div", "ctt-tooltip");
  document.body.append(tooltip);

  const detail = el("div", "ctt-detail");   // judge-detail panel (hover) / click-pinned (#20)
  const detailContent = el("div", "ctt-detail-content");
  const detailClose = el("button", "ctt-detail-close", { type: "button", "aria-label": "Close detail" });
  detailClose.textContent = "×";
  detailClose.addEventListener("click", unpinDetail);
  detail.append(detailClose, detailContent);
  detail.style.display = "none";
  pane.append(detail);

  const ui = { root, tracked, subtitle, selector, viewport, svgStack, status, pane, paneBody, stow,
               tooltip, detail, detailContent, districtOverlay, nationalSVG: null };
  S.ui = ui;
  window.addEventListener("resize", () => {
    if (S.selectedCourt) layoutJudges();
    if (S.districtOnMap) sizeDistrictOverlay();
    // Square size is in screen px, so the px->map-unit conversion is viewport-dependent.
    clearTimeout(S._resizeT);
    S._resizeT = setTimeout(refreshSeatBlocks, 120);
  });
  // Click anywhere that isn't the pinned panel or a judge icon unpins it (#20). Wired once.
  if (!S._docWired) {
    S._docWired = true;
    document.addEventListener("mousedown", (e) => {
      if (!S.detailPinned) return;
      if (S.ui.detail.contains(e.target)) return;
      if (e.target.closest && e.target.closest(".ctt-judge")) return;
      unpinDetail();
    });
  }
  return ui;
}

function togglePane(open) {
  const { pane, stow } = S.ui;
  pane.classList.toggle("ctt-is-open", open);
  stow.textContent = open ? "▲" : "▼";
  stow.title = open ? "Hide" : "Show";
}

// ---- SVG injection + normalization -------------------------------------------
function injectSVG(container, svgText) {
  const wrap = el("div", "ctt-svg-layer");
  wrap.innerHTML = svgText;
  const svg = wrap.querySelector("svg");
  if (!svg) throw new Error("SVG payload has no <svg> root");
  // Parse viewBox from the attribute (robust: doesn't depend on SVG layout/baseVal).
  const [vx, vy, vw, vh] = (svg.getAttribute("viewBox") || "").split(/[\s,]+/).map(Number);
  svg.removeAttribute("width");
  svg.removeAttribute("height");
  // Pad the viewBox symmetrically (#14) so non-scaling strokes on shapes that touch the
  // tight bounding box aren't clipped at the SVG viewport edge. Symmetric padding keeps the
  // centre, so the Y-flip translate below is unchanged.
  if (Number.isFinite(vw) && Number.isFinite(vh)) {
    const pad = 0.03 * Math.max(vw, vh);
    svg.setAttribute("viewBox", `${vx - pad} ${vy - pad} ${vw + 2 * pad} ${vh + 2 * pad}`);
    svg.style.aspectRatio = `${vw + 2 * pad} / ${vh + 2 * pad}`;
  }
  // Normalize the Y-flip from the viewBox (robust to malformed exported transforms):
  // convention is scale(1,-1) translate(0, -(minY+maxY)); minY=vy, maxY=vy+vh.
  const g = svg.querySelector("g");
  if (g && Number.isFinite(vy) && Number.isFinite(vh)) {
    g.setAttribute("transform", `scale(1,-1) translate(0, ${-(vy + vy + vh)})`);
  }
  if (g) {
    // Paint order (bottom→top): circuit fills, then district borders, then a stroke-only
    // clone of each circuit outline so circuit boundaries read clearly ON TOP of the thin
    // district lines (#12), then the hover overlay.
    g.querySelectorAll('[data-layer="district"]').forEach((p) => g.appendChild(p));
    g.querySelectorAll('[data-layer="circuit"]:not(.ctt-circuit-outline)').forEach((cp) => {
      const clone = cp.cloneNode(false);
      clone.removeAttribute("id");
      clone.removeAttribute("data-court-id");   // so it isn't picked up as interactive
      clone.removeAttribute("data-layer");      // so the [data-layer=circuit] fill rule can't win over .ctt-circuit-outline (#18)
      // ...but keep a handle on which circuit it outlines, so the morph can pair this
      // clone with its counterpart in the circuit-local file.
      clone.setAttribute("data-outline-for", cp.getAttribute("data-court-id") || "");
      clone.setAttribute("class", "ctt-circuit-outline");
      g.appendChild(clone);
    });
    const overlay = document.createElementNS(SVGNS, "path");
    overlay.setAttribute("class", "ctt-hover-overlay");
    g.appendChild(overlay);
    svg._overlay = overlay;
  }
  container.append(wrap);
  return svg;
}

function wireShapeEvents(svg, { onSelect, national }) {
  const overlay = svg._overlay;
  const tooltip = S.ui.tooltip;
  svg.querySelectorAll("path[data-court-id]").forEach((shape) => {
    const cid = shape.getAttribute("data-court-id");
    const layer = shape.getAttribute("data-layer");
    const isInset = shape.getAttribute("data-inset") === "true";

    // Decide the court this shape targets in the CURRENT view:
    let targetId = cid;
    if (national && layer === "district") {
      if (isInset) targetId = shape.getAttribute("data-parent-circuit"); // click Alaska → 9th Cir (#11)
      else return;                                                       // mainland districts: visual only
    }
    if (!national && layer === "circuit") return; // district view: circuit not map-selectable (#13)

    // Outline/tooltip follow the target (for insets, that's the whole parent circuit).
    const targetShape = targetId === cid ? shape
      : svg.querySelector(`[data-court-id="${targetId}"][data-layer="circuit"]`) || shape;
    const court = S.courts.get(targetId);
    shape.classList.add("ctt-shape");
    shape.addEventListener("mouseenter", () => {
      // A circuit outline path is mainland-only (insets are in their own projection,
      // excluded from dissolve #2), so a circuit's hover outline is its mainland path PLUS
      // every inset district whose data-parent-circuit points back to it (Alaska lights up
      // with the 9th Circuit).
      overlay.setAttribute("d", overlayPathFor(targetShape, svg));
      overlay.style.visibility = "visible";
      highlightBlock(svg, targetId, "ctt-block-hover");
      tooltip.textContent = court ? (court.short_name || court.court_name) : targetId;
      tooltip.style.visibility = "visible";
    });
    shape.addEventListener("mousemove", (e) => positionTooltip(e));
    shape.addEventListener("mouseleave", () => {
      overlay.style.visibility = "hidden";
      tooltip.style.visibility = "hidden";
      highlightBlock(svg, null, "ctt-block-hover");
    });
    shape.addEventListener("click", () => onSelect(targetId, shape));
  });
}

function overlayPathFor(shape, svg) {
  let d = shape.getAttribute("d");
  const cid = shape.getAttribute("data-court-id");
  if (shape.getAttribute("data-layer") === "circuit") {
    svg.querySelectorAll(`[data-parent-circuit="${cid}"][data-inset="true"]`)
      .forEach((p) => { d += " " + p.getAttribute("d"); });
  }
  return d;
}

function positionTooltip(e) {
  const t = S.ui.tooltip, pad = 12;
  let x = e.clientX + pad, y = e.clientY + pad;
  if (x + t.offsetWidth > window.innerWidth) x = e.clientX - pad - t.offsetWidth;
  if (y + t.offsetHeight > window.innerHeight) y = e.clientY - pad - t.offsetHeight;
  t.style.left = `${x}px`;
  t.style.top = `${y}px`;
}

// ---- data helpers -------------------------------------------------------------
function circuitOf(court) {
  // SCOTUS loads its own bundle (judges/scotus.json), like a circuit loads itself.
  if (court.court_level === "circuit" || court.court_level === "scotus") return court.court_id;
  return court.parent_id;
}
async function loadJudges(circuit) {
  if (S.judgeCache.has(circuit)) return S.judgeCache.get(circuit);
  const path = S.manifest.files?.judges?.[circuit];
  const judges = path ? await fetchJSON(path) : [];
  S.judgeCache.set(circuit, judges);
  return judges;
}
async function loadJustices() {
  if (S.justicesLoaded) return;
  const path = S.manifest.files?.circuit_justices;
  if (path) {
    for (const j of await fetchJSON(path)) S.justices.set(j.circuit_id, j);
  }
  S.justicesLoaded = true;
}
function judgesForCourt(courtId, circuit) {
  return (S.judgeCache.get(circuit) || []).filter((j) => j.court_id === courtId);
}

// ---- selector -----------------------------------------------------------------
function renderSelector() {
  const sel = S.ui.selector;
  sel.innerHTML = "";
  if (S.view === "national") {
    addSummaryButton(sel);
    addSelectorGroup(sel, "Circuits", [...S.courts.values()]
      .filter((c) => c.court_level === "circuit")
      .sort(byCircuitOrder), (c) => selectCourt(c.court_id));
  } else if (S.activeCircuit === "cafc") {
    addBackButton(sel);   // top of the list (#22)
    addSelectorGroup(sel, "Circuit", [S.courts.get("cafc")], (c) => selectCourt(c.court_id));
    addSelectorGroup(sel, "Federal Circuit feeders", [...S.courts.values()]
      .filter((c) => c.parent_id === "cafc"), (c) => selectCourt(c.court_id));
  } else {
    addBackButton(sel);   // top of the list (#22)
    // Repeat the circuit itself so it can be re-selected without going back to national.
    addSelectorGroup(sel, "Circuit", [S.courts.get(S.activeCircuit)], (c) => selectCourt(c.court_id));
    const districts = (S.districtsByCircuit.get(S.activeCircuit) || []);
    addSelectorGroup(sel, `${short(S.activeCircuit)} districts`, districts, (c) => selectCourt(c.court_id));
  }
}
function addSelectorGroup(sel, label, courts, onPick) {
  const lab = el("div", "ctt-selector-group-label");
  lab.textContent = label;
  sel.append(lab);
  courts.forEach((c) => {
    const item = el("button", "ctt-selector-item", { type: "button", "data-court-id": c.court_id });
    item.textContent = c.short_name || c.court_name || c.court_id;
    item.addEventListener("click", () => onPick(c));
    if (c.court_id === S.selectedCourt) item.classList.add("ctt-is-selected");
    sel.append(item);
  });
}
/** Replaces the old lone "Supreme Court" selector entry: a single, larger button opening the
 *  Summary pane (SCOTUS | Appellate | District sub-tabs, default SCOTUS — operator ask). Larger
 *  than a normal selector item so it reads as a distinct top-level destination, not a 14th
 *  circuit in the list. */
function addSummaryButton(sel) {
  const btn = el("button", "ctt-selector-item ctt-summary-btn",
    { type: "button", "data-court-id": SUMMARY_ID });
  btn.textContent = "Summary";
  btn.addEventListener("click", selectSummary);
  if (S.selectedCourt === SUMMARY_ID) btn.classList.add("ctt-is-selected");
  sel.append(btn);
}
function addBackButton(sel) {
  const back = el("button", "ctt-selector-back", { type: "button" });
  back.textContent = "← Back to national";
  back.addEventListener("click", drillOut);
  sel.append(back);
}
function byCircuitOrder(a, b) {
  return a.court_id.replace(/^ca/, "").padStart(3, "0")
    .localeCompare(b.court_id.replace(/^ca/, "").padStart(3, "0"));
}
const short = (id) => (S.courts.get(id)?.short_name || id);

function highlightSelector(courtId) {
  S.ui.selector.querySelectorAll(".ctt-selector-item").forEach((it) =>
    it.classList.toggle("ctt-is-selected", it.getAttribute("data-court-id") === courtId));
}
// A circuit's selection covers its insets too: the dissolved circuit outline is mainland-only,
// so Alaska/Hawaii/PR/VI are separate paths and would otherwise stay untinted while the rest of
// their circuit lights up. Same rule the hover overlay already uses (#1).
function selectionCovers(shape, courtId) {
  if (shape.getAttribute("data-court-id") === courtId) return true;
  return shape.getAttribute("data-inset") === "true"
    && shape.getAttribute("data-parent-circuit") === courtId;
}
/** Mark the seat block belonging to `courtId` (null clears). Blocks live in the same SVG as the
 *  shapes, so hovering Ohio and hovering Ohio's block are the same court by construction. */
function highlightBlock(svg, courtId, cls) {
  if (!svg) return;
  svg.querySelectorAll(".ctt-block").forEach((b) => {
    const want = !!courtId && b.getAttribute("data-court-id") === courtId;
    if (b.classList.contains(cls) !== want) {
      b.classList.toggle(cls, want);
      animateBlockScale(b);
    }
  });
}

/** Ease a block's squares to the scale its highlight classes call for, with per-frame inline
 *  transforms (see BLOCK_SCALE_* for why this must not be a CSS transition). */
function animateBlockScale(block) {
  const target = block.classList.contains("ctt-block-selected") ? BLOCK_SCALE_SELECTED
    : block.classList.contains("ctt-block-hover") ? BLOCK_SCALE_HOVER : 1;
  const from = block._sqScale ?? 1;
  if (block._sqAnim) { cancelAnimationFrame(block._sqAnim); block._sqAnim = null; }
  const squares = block.querySelectorAll(".ctt-sq");
  const apply = (k) => {
    block._sqScale = k;
    const t = k === 1 ? "" : `scale(${k})`;
    squares.forEach((sq) => { sq.style.transform = t; });
  };
  if (from === target) { apply(target); return; }
  if (reducedMotion()) { apply(target); return; }
  const t0 = nowMs();
  const step = () => {
    const t = Math.min(1, (nowMs() - t0) / BLOCK_SCALE_MS);
    const e = 1 - (1 - t) ** 3;                       // ease-out, matches the old CSS feel
    apply(t < 1 ? from + (target - from) * e : target);
    block._sqAnim = t < 1 ? requestAnimationFrame(step) : null;
  };
  step();
}
function highlightShape(courtId) {
  const svg = currentSVG();
  if (!svg) return;
  highlightBlock(svg, courtId, "ctt-block-selected");
  svg.querySelectorAll(".ctt-shape").forEach((s) =>
    s.classList.toggle("ctt-shape-selected", selectionCovers(s, courtId)));
  const shape = svg.querySelector(`path[data-court-id="${CSS.escape(courtId)}"]`);
  if (shape && shape.scrollIntoView) shape.scrollIntoView({ block: "nearest", inline: "nearest" });
}
function currentSVG() {
  return S.view === "national" ? S.ui.nationalSVG : S.localSVGCache.get(S.activeCircuit);
}

// ---- selection / pane ---------------------------------------------------------
async function selectCourt(courtId) {
  const court = S.courts.get(courtId);
  if (!court) return;
  // Re-clicking the already-selected court deselects it and hides the pane
  // (instead of pointlessly re-animating the same content).
  if (courtId === S.selectedCourt && S.ui.pane.classList.contains("ctt-is-open")) {
    deselect();
    return;
  }
  S.selectedCourt = courtId;
  highlightSelector(courtId);
  highlightShape(courtId);
  await loadJustices();
  const circuit = circuitOf(court);
  await loadJudges(circuit);
  // A circuit pane shows its Circuit Justice — pull the SCOTUS bundle too (small, cached)
  // so the justice's docked detail carries the full record, not the thin justices row.
  if (court.court_level === "circuit") await loadJudges("scotus");
  renderPane(court);
  togglePane(true);
}

/** Summary pane: SCOTUS | Appellate | District sub-tabs (replaces the old lone SCOTUS
 *  selector entry). Not a real court selection — no map shape, so highlightShape/clearShapeHighlight
 *  are still called (consistent with selectCourt) purely to clear any PREVIOUSLY selected
 *  court's shape highlight; neither matches anything for the "summary" sentinel itself. */
async function selectSummary() {
  if (S.selectedCourt === SUMMARY_ID && S.ui.pane.classList.contains("ctt-is-open")) {
    deselect();
    return;
  }
  S.selectedCourt = SUMMARY_ID;
  highlightSelector(SUMMARY_ID);
  highlightShape(SUMMARY_ID);
  await loadJudges("scotus");
  renderSummaryPane();
  togglePane(true);
}

// Clear across the WHOLE stack, not just currentSVG(): drilling in/out changes which layer
// is current, so a highlight left on the other layer would survive as a stale selection.
function clearShapeHighlight() {
  S.ui.svgStack.querySelectorAll(".ctt-shape-selected")
    .forEach((s) => s.classList.remove("ctt-shape-selected"));
  S.ui.svgStack.querySelectorAll(".ctt-block-selected, .ctt-block-hover")
    .forEach((b) => { b.classList.remove("ctt-block-selected", "ctt-block-hover"); animateBlockScale(b); });
}
function deselect() {
  S.selectedCourt = null;
  unpinDetail();
  togglePane(false);
  highlightSelector(null);
  clearShapeHighlight();
}

function renderPane(court) {
  unpinDetail();          // a new court's pane starts with no pinned/leftover detail (#20)
  const body = S.ui.paneBody;
  // The docked detail panel lives INSIDE the pane body (in the stage row), so it must be
  // rescued before the wipe or the wipe destroys it along with the old court's content.
  S.ui.pane.append(S.ui.detail);
  body.innerHTML = "";
  const circuit = circuitOf(court);
  const judges = judgesForCourt(court.court_id, circuit);
  const active = judges.filter((j) => j.status === "active");
  const senior = judges.filter((j) => j.status === "senior");
  const authorized = court.authorized_judgeships || 0;
  const vacancies = Math.max(0, authorized - active.length);

  // header (with a slot that hosts the Circuit Justice icon in timeline view)
  const head = el("div", "ctt-pane-head");
  const headText = el("div", "ctt-pane-headtext");
  const justiceSlot = el("div", "ctt-justice-slot");
  head.append(headText, justiceSlot);
  const h = el("div", "ctt-pane-title");
  h.textContent = court.court_name;
  const meta = el("div", "ctt-pane-meta");
  if (court.tenure_type === "fixed_term") {
    meta.textContent = `Fixed-term court · ${authorized} authorized · ${active.length} sitting · ${vacancies} vacant`;
  } else if (court.court_level === "scotus") {
    // No senior figure: a retired justice remains an Article III judge (28 U.S.C. §371) but
    // does not sit — the bench is only ever the active nine.
    meta.textContent = `${authorized} authorized · ${active.length} active · ${vacancies} vacant`;
  } else {
    meta.textContent = `${authorized} authorized · ${active.length} active · ${senior.length} senior · ${vacancies} vacant`;
  }
  headText.append(h, meta);
  body.append(head);

  // controls: view toggle + drill-in
  const controls = el("div", "ctt-pane-controls");
  // Segmented like the None|FedSoc|ACS switch: the three modes read as ONE control (#operator).
  const modeWrap = el("div", "ctt-mode-switch", { role: "group", "aria-label": "Pane view" });
  const timelineBtn = el("button", "ctt-toggle ctt-mode-opt", { type: "button" });
  timelineBtn.textContent = "Timeline";
  const majorityBtn = el("button", "ctt-toggle ctt-mode-opt", { type: "button" });
  majorityBtn.textContent = "Majority";
  const changeBtn = el("button", "ctt-toggle ctt-mode-opt", { type: "button" });
  changeBtn.textContent = "Change";
  const setMode = (mode) => {
    S.paneMode = mode;
    S.majorityMode = mode === "majority";   // existing arc code keys off this boolean
    timelineBtn.classList.toggle("ctt-is-active", mode === "timeline");
    majorityBtn.classList.toggle("ctt-is-active", mode === "majority");
    changeBtn.classList.toggle("ctt-is-active", mode === "change");
    // Territorial courts (fixed_term) have no toggle-gated note at all - nothing left to say
    // there once the majority-computation/senior text is dropped (see renderPane) - so this
    // must tolerate a null match rather than assume every court has one.
    const majNote = body.querySelector(".ctt-majority-note");
    if (majNote) majNote.style.display = mode === "majority" ? "" : "none";
    // No seniors -> nothing to fold: hide the checkbox row entirely (SCOTUS, fresh courts).
    body.querySelector(".ctt-foldrow").style.display = mode === "majority" && senior.length ? "" : "none";
    stage.style.display = mode === "change" ? "none" : "";
    streamStage.style.display = mode === "change" ? "" : "none";
    // Change has no judge to hover and no reported-affiliation concept — both would just sit
    // there empty/irrelevant and eat layout space (operator ask).
    S.ui.detail.style.display = mode === "change" ? "none" : "";
    affWrap.style.display = mode === "change" ? "none" : "";
    if (mode === "change") renderStreamView(court, streamStage);
    else layoutJudges();
  };
  timelineBtn.addEventListener("click", () => setMode("timeline"));
  majorityBtn.addEventListener("click", () => setMode("majority"));
  changeBtn.addEventListener("click", () => setMode("change"));
  modeWrap.append(timelineBtn, majorityBtn, changeBtn);
  controls.append(modeWrap);

  // Affiliation marker: a segmented None|FedSoc|ACS control. Applies in BOTH timeline and
  // majority views. Reported affiliations are sparse and Wikipedia-limited, so this marks the
  // judges a source reports — never implies the unmarked have no affiliation.
  const affWrap = el("div", "ctt-affil-switch", { role: "group", "aria-label": "Mark reported affiliation" });
  const affLabel = el("span", "ctt-affil-switch-label");
  affLabel.textContent = "Mark:";
  affWrap.append(affLabel);
  for (const [mode, text] of [["none", "None"], ["fedsoc", "FedSoc"], ["acs", "ACS"]]) {
    const b = el("button", "ctt-toggle ctt-affil-opt", { type: "button", "data-affil": mode });
    b.textContent = text;
    b.classList.toggle("ctt-is-active", S.affilMark === mode);
    b.addEventListener("click", () => {
      S.affilMark = mode;
      affWrap.querySelectorAll(".ctt-affil-opt").forEach((o) =>
        o.classList.toggle("ctt-is-active", o.getAttribute("data-affil") === mode));
      applyAffilMarks();
    });
    affWrap.append(b);
  }
  controls.append(affWrap);

  if (court.court_level === "circuit") {
    const drill = el("button", "ctt-drill", { type: "button" });
    drill.textContent = court.court_id === "cafc" ? "View feeders →" : "View districts →";
    drill.addEventListener("click", () => drillIn(court.court_id));
    controls.append(drill);
  }
  body.append(controls);

  // seniors row (majority only): Hide (concealed entirely) | Show (outer band, excluded from
  // the x/y count) | Include (folded into the active count/arc). Same segmented-control
  // pattern as Timeline|Majority and None|FedSoc|ACS.
  const foldRow = el("div", "ctt-foldrow");
  const seniorLabel = el("span", "ctt-affil-switch-label");
  seniorLabel.textContent = "Seniors:";
  const seniorWrap = el("div", "ctt-mode-switch", { role: "group", "aria-label": "Senior judges in Majority view" });
  for (const [mode, text] of [["hide", "Hide"], ["show", "Show"], ["include", "Include"]]) {
    const b = el("button", "ctt-toggle ctt-mode-opt", { type: "button", "data-senior": mode });
    b.textContent = text;
    b.classList.toggle("ctt-is-active", S.seniorMode === mode);
    b.addEventListener("click", () => {
      S.seniorMode = mode;
      seniorWrap.querySelectorAll(".ctt-mode-opt").forEach((o) =>
        o.classList.toggle("ctt-is-active", o.getAttribute("data-senior") === mode));
      layoutJudges();
    });
    seniorWrap.append(b);
  }
  foldRow.append(seniorLabel, seniorWrap);
  foldRow.style.display = "none";

  // Stage row: stage + notes on the left, the docked judge-detail panel on the right
  // (below them on mobile — the row's DOM order IS the mobile stacking order). The fold-
  // seniors row lives INSIDE the left column: toggling it must not move the detail panel.
  const stageRow = el("div", "ctt-stage-row");
  const stageMain = el("div", "ctt-stage-main");
  stageRow.append(stageMain, S.ui.detail);
  const stage = el("div", "ctt-judge-stage");
  const streamStage = el("div", "ctt-stream-stage");
  streamStage.style.display = "none";
  stageMain.append(foldRow, stage, streamStage);
  body.append(stageRow);
  resetDetail();

  // majority note / explainer (toggle-gated, only shown in majority mode) OR a single
  // always-visible italicized note (territorial only). Corrected 2026-07-16 (second round, same
  // day): uscfc/cit's note was briefly always-visible too, but the operator caught that it
  // shouldn't show on the timeline view - moved back into the toggle-gated slot, same as
  // circuit/plain district. Only gud/nmid/vid stay always-visible (their note is a single line
  // at desktop widths, confirmed visually, so it doesn't need majority-mode gating to avoid
  // clutter the way a court with a bench worth actually explaining does).
  //  - circuit: en banc is a real, formal mechanism (28 U.S.C. §46).
  //  - plain district (life_tenured, not territorial): no formal en banc rule, but "never"
  //    overstates it - courts have voluntarily convened as a body ~140 times across history
  //    (Bruhl, "District Courts En Banc," 90 Fordham L. Rev. 1469 (2022)).
  //  - CFC (uscfc, fixed_term_senior): 28 U.S.C. §797(b) - the chief judge may recall a senior
  //    judge "whenever he deems it advisable" - is why only the active-senior subset is shown
  //    (the fuller statutory senior roster includes judges not currently recalled); active
  //    judges serve a 15-yr term (§172); no panels/en banc ever (§174).
  //  - USCIT (cit, life_tenured but not court_level=circuit): verified 2026-07-16 (28 U.S.C.
  //    §255): no en banc mechanism, but a DIFFERENT one - the chief judge may designate a
  //    three-judge panel for constitutional/significant-implications cases.
  const isCFC = court.court_id === "uscfc";
  const isCIT = court.court_id === "cit";
  const isTerritorial = court.tenure_type === "fixed_term";
  const isSCOTUS = court.court_level === "scotus";

  let majorityText = null;
  if (isSCOTUS) {
    // No note at all (operator call): seniors are irrelevant here and the majority is simply
    // over the nine, which needs no explainer.
  } else if (court.court_level === "circuit") {
    majorityText = "Majority is computed over active judgeships by default. Senior judges are " +
      "supernumerary and generally do not vote en banc.";
  } else if (isCFC) {
    majorityText = "This court does not sit en banc, and its judges serve 15-year terms. Senior " +
      "judges serve at the discretion of the president-designated chief judge (28 U.S.C. " +
      "§ 797(b)), so only the active senior judges are shown.";
  } else if (isCIT) {
    majorityText = "This court does not sit en banc; select cases may instead be heard by a " +
      "three-judge panel the chief judge designates (28 U.S.C. § 255). Senior judges are " +
      "supernumerary.";
  } else if (!isTerritorial) {
    majorityText = "Majority is computed over active judgeships by default. Senior judges are " +
      "supernumerary. The district courts do not usually vote en banc.";
  }
  if (majorityText) {
    const note = el("div", "ctt-note ctt-majority-note");
    note.textContent = majorityText;
    note.style.display = "none";
    stageMain.append(note);   // under the stage, left of (above on mobile) the detail panel
  }

  // Always-visible italicized note - territorial courts only now. Uses its OWN class, not
  // .ctt-majority-note - that class is also setMode's JS toggle-target selector, and this note
  // must never be hidden in timeline mode the way that one is.
  if (isTerritorial) {
    const note = el("div", "ctt-note ctt-always-note");
    note.textContent = "The territorial district courts do not sit en banc, and their judges " +
      "serve 10-year terms. Judges can serve as “holdovers” if no successor is confirmed by " +
      "the end of their term.";
    stageMain.append(note);
  }

  // build seat + judge models, then render icons
  const model = buildBenchModel(court, active, senior, vacancies, circuit);
  stage._model = model;
  stage._court = court;
  renderJudgeIcons(stage, model);
  applyAffilMarks();          // the switch persists across court selections

  // reflect current mode (persists across court selections, same as before this added a
  // third state — a fresh mount still starts at "timeline" per the S state default)
  setMode(S.paneMode);
}

// ---- Summary pane (SCOTUS | Appellate | District) -----------------------------
// Replaces the old lone "Supreme Court" selector entry (operator ask, 2026-09-03): a single
// "Summary" destination with its own 3-way sub-tab, defaulting to SCOTUS. Appellate is an
// intentional placeholder (operator: "leave blank, come back to it later"). District renders
// the operator-authored national cartogram (data/district_arrangement.json) statically, with
// hover-grow-and-tint like the map's own seat blocks — the "lift onto the map" deployment
// mechanic, the docked per-district detail viewer, and click-to-pin district info are a large,
// separate feature not yet built (see PROGRESS.md); this is the pane content it will lift FROM.
function renderSummaryPane() {
  unpinDetail();
  const body = S.ui.paneBody;
  S.ui.pane.append(S.ui.detail);   // rescue the docked detail panel before the wipe (see renderPane)
  body.innerHTML = "";

  const content = el("div", "ctt-summary-content");

  // Larger-than-usual segmented control (operator ask, enlarged further 2026-09-04) — same
  // visual family as the pane's Timeline|Majority|Change switch (.ctt-toggle/.ctt-mode-opt),
  // sized up via .ctt-summary-switch. Labels are the full section names — this doubles as the
  // pane's own heading, so the separate "Summary" title + "Supreme Court · Courts of Appeals ·
  // District Courts" subtitle line above it were removed as redundant (operator ask; the
  // "Summary" selector-bar entry itself is unchanged).
  const subWrap = el("div", "ctt-mode-switch ctt-summary-switch", { role: "group", "aria-label": "Summary section" });
  const tabs = [["scotus", "Supreme Court"], ["appellate", "Courts of Appeals"], ["district", "District Courts"]];
  const btns = {};
  const setView = (view) => {
    S.summaryView = view;
    for (const [v, b] of Object.entries(btns)) b.classList.toggle("ctt-is-active", v === view);
    renderSummaryContent(content);
  };
  for (const [v, label] of tabs) {
    const b = el("button", "ctt-toggle ctt-mode-opt", { type: "button" });
    b.textContent = label;
    b.addEventListener("click", () => setView(v));
    subWrap.append(b);
    btns[v] = b;
  }
  body.append(subWrap, content);
  setView(S.summaryView);   // persists across re-opens, same convention as S.paneMode
}

function renderSummaryContent(container) {
  // S.ui.detail is a single shared node. If the PREVIOUS sub-view was SCOTUS, it's currently
  // nested inside `container` (renderSummaryScotus's stageRow) — wiping container.innerHTML
  // below would DETACH it from the document entirely, not just hide it (a plain
  // `.style.display` set on an already-detached node is a silent no-op: querySelector can no
  // longer find it anywhere, which looked like "the bug went away" but was actually the node
  // vanishing rather than being correctly re-homed). Rescue it out to the pane root FIRST,
  // same pattern renderSummaryPane/renderPane already use before their own wipes.
  S.ui.pane.append(S.ui.detail);
  container.innerHTML = "";
  // Appellate/District never claim it — hide it by DEFAULT, unconditionally, before
  // dispatching, so it can never render as a stray docked box wherever it happens to sit (a
  // bare child of .ctt-pane showed up in the pane's bottom-left corner — operator report,
  // 2026-09-04, reproduced by opening Summary straight into Appellate/District). SCOTUS
  // re-parents it into its own stageRow and un-hides it via resetDetail().
  S.ui.detail.style.display = "none";
  if (S.summaryView === "scotus") renderSummaryScotus(container);
  else if (S.summaryView === "appellate") renderSummaryAppellate(container);
  else renderSummaryDistrict(container);
}

/** Summary > SCOTUS: the old direct SCOTUS pane's Majority view, permanently on (operator:
 *  eliminate Timeline and Change here — there is nothing to switch between any more), with a
 *  split double-ring layout (6 outer + 3 inner, see layoutScotusRing) and icons at 2x size
 *  ("since it is SCOTUS"). Reuses the exact same bench-building/hover/pin machinery as every
 *  other court's Majority view — buildBenchModel, renderJudgeIcons, the docked S.ui.detail
 *  panel — so none of that needs a SCOTUS-specific reimplementation. */
function renderSummaryScotus(container) {
  const court = S.courts.get("scotus");
  if (!court) return;   // manifest not loaded — selectSummary() always awaits loadJudges first
  const judges = judgesForCourt("scotus", "scotus");
  const active = judges.filter((j) => j.status === "active");
  const senior = judges.filter((j) => j.status === "senior");   // always empty: 28 U.S.C. §371
  const authorized = court.authorized_judgeships || 0;
  const vacancies = Math.max(0, authorized - active.length);

  const label = el("div", "ctt-summary-subtitle");
  label.textContent = court.court_name;
  const meta = el("div", "ctt-pane-meta");
  // Same "no senior figure" rule as the old direct SCOTUS pane: a retired justice remains an
  // Article III judge but does not sit, so seniors are never part of this meta line.
  meta.textContent = `${authorized} authorized · ${active.length} active · ${vacancies} vacant`;
  container.append(label, meta);

  const stageRow = el("div", "ctt-stage-row");
  const stageMain = el("div", "ctt-stage-main");
  stageRow.append(stageMain, S.ui.detail);
  const stage = el("div", "ctt-judge-stage ctt-scotus-stage");
  stageMain.append(stage);
  container.append(stageRow);
  resetDetail();

  const model = buildBenchModel(court, active, senior, vacancies, "scotus");
  stage._model = model;
  stage._court = court;
  renderJudgeIcons(stage, model);
  applyAffilMarks();

  S.paneMode = "majority";
  S.majorityMode = true;
  layoutJudges();
}

function renderSummaryAppellate(container) {
  const note = el("div", "ctt-summary-placeholder");
  note.textContent = "Coming soon.";
  container.append(note);
}

// ---- Summary > District: static cartogram (no map deployment yet) -------------
async function loadDistrictArrangement() {
  if (S.districtArrangement) return S.districtArrangement;
  const path = S.manifest.files?.district_arrangement;
  S.districtArrangement = path ? await fetchJSON(path) : { circuits: [] };
  return S.districtArrangement;
}

// Same fixed layout constants the map's own seat blocks use (embed/court-tracker.js's
// BLOCK_PX/BLOCK_GAP) so a block reads as the same "size" concept in both places, even though
// this cartogram isn't on the map yet.
const DISTRICT_CARTOGRAM_PX = 6.5;
const DISTRICT_CARTOGRAM_GAP = 0.30;
const DISTRICT_CARTOGRAM_PITCH = DISTRICT_CARTOGRAM_PX * (1 + DISTRICT_CARTOGRAM_GAP);

/** Pure builder shared by the Summary > District preview, the on-map deployed overlay, and the
 *  circuit-drill-in fixed sub-assembly — one code path for the actual block SVG so those three
 *  presentations can never visually drift apart. `filterCircuitId` renders just one circuit's
 *  cluster (used by the drill-in sub-assembly); omitted, it renders every circuit. Returns null
 *  bbox (and an empty svg) if there's nothing to draw, e.g. a circuit with no arrangement data. */
function buildDistrictCartogramSVG(circuits, filterCircuitId) {
  const use = filterCircuitId ? circuits.filter((c) => c.circuit_id === filterCircuitId) : circuits;
  const svg = svgEl("svg", { class: "ctt-district-cartogram" });
  if (!use.length) return { svg, bbox: null };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of use) {
    const rows = c.matrix.length, cols = c.matrix[0].length;
    x0 = Math.min(x0, c.offset[0]); y0 = Math.min(y0, c.offset[1]);
    x1 = Math.max(x1, c.offset[0] + cols * DISTRICT_CARTOGRAM_PITCH);
    y1 = Math.max(y1, c.offset[1] + rows * DISTRICT_CARTOGRAM_PITCH);
  }
  const pad = DISTRICT_CARTOGRAM_PITCH * 2;
  const W = (x1 - x0) + pad * 2, H = (y1 - y0) + pad * 2;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  const originX = x0 - pad, originY = y0 - pad;

  for (const c of use) {
    const g = svgEl("g", { class: "ctt-district-cluster", "data-circuit-id": c.circuit_id });
    const rows = c.matrix.length, cols = c.matrix[0].length;
    g.setAttribute("transform", `translate(${c.offset[0] - originX} ${c.offset[1] - originY})`);
    for (let r = 0; r < rows; r++) {
      for (let col = 0; col < cols; col++) {
        if (!c.matrix[r][col]) continue;
        const key = `${r},${col}`;
        const did = c.cell_district?.[key];
        const colorKey = c.cell_colors?.[key];
        // district-block-builder.html's export keys are r/d/o/vacant; the map's OWN
        // seat-block squares (renderSeatBlocks/seatSquares) use the fuller class names below —
        // reuse those directly rather than a second palette that could drift from them.
        const sqClass = { r: "ctt-sq-rep", d: "ctt-sq-dem", o: "ctt-sq-other", vacant: "ctt-sq-vacant" }[colorKey];
        const rect = svgEl("rect", {
          class: "ctt-district-sq" + (sqClass ? ` ${sqClass}` : ""),
          x: col * DISTRICT_CARTOGRAM_PITCH, y: r * DISTRICT_CARTOGRAM_PITCH,
          width: DISTRICT_CARTOGRAM_PX, height: DISTRICT_CARTOGRAM_PX,
        });
        if (did) rect.setAttribute("data-district-id", did);
        g.append(rect);
      }
    }
    svg.append(g);
  }
  return { svg, bbox: { W, H } };
}

/** Empty state for the district docked panel (mirrors resetDetail()'s judge-panel hint). */
function resetDistrictDetail(box, content) {
  box.classList.remove("ctt-pinned");
  content.innerHTML = `<div class="ctt-detail-hint">Hover over a district for details.<br>Click to pin.</div>`;
}
/** Fills the district docked panel for one district court. `onJump` wires the "Jump to court"
 *  button — drills into the district's own circuit and opens ITS info pane, exactly as if the
 *  operator had picked it from that circuit's own drill-in selector bar (operator spec). */
function showDistrictDetail(content, did, onJump) {
  const court = S.courts.get(did);
  const b = S.seatBlocks?.[did];
  content.innerHTML = "";
  const name = el("div", "ctt-detail-name");
  name.textContent = court?.court_name || did;
  content.append(name);
  if (b) {
    const comp = el("div");
    comp.innerHTML = `<span class="ctt-dot ctt-rep"></span>${b.r} Republican-appointed` +
      (b.o ? `<br><span class="ctt-dot"></span>${b.o} other` : "") +
      `<br><span class="ctt-dot ctt-dem"></span>${b.d} Democratic-appointed` +
      (b.vacancies ? `<br>${b.vacancies} vacant` : "");
    content.append(comp);
  }
  const jump = el("button", "ctt-toggle ctt-district-jump", { type: "button" });
  jump.textContent = "Jump to this court →";
  jump.addEventListener("click", () => onJump(did));
  content.append(jump);
}

/** Click a block to jump straight to that district's own info pane: drill into its parent
 *  circuit, then select it — the same end state as picking it by hand from that circuit's own
 *  drill-in selector bar (operator spec, since a district's own pop-down pane is where its full
 *  judge roster/majority view lives — the cartogram itself never duplicates that). */
async function jumpToDistrictCourt(did) {
  const court = S.courts.get(did);
  if (!court?.parent_id) return;
  deselect();
  await drillIn(court.parent_id);
  await selectCourt(did);
}

// ---- Summary > District, "Set upon map" deployment -----------------------------
// Circuits with NO districts of their own (cafc has none; it's reachable only through its
// feeders, which aren't geographic) never get a fixed drill-in sub-assembly.
const NO_DISTRICT_SUBASSEMBLY = new Set(["cafc"]);
const DISTRICT_OVERLAY_MIN_W = 140, DISTRICT_OVERLAY_MAX_FRAC = 0.42, DISTRICT_OVERLAY_ZOOM_STEP = 1.2;

/** Default on-map placement: bottom-right corner of the viewport, sized relative to the
 *  viewport's OWN current width (operator ask: hold aspect ratio, scale with the space
 *  available — a fixed px default would either overflow a mobile viewport or look tiny on a
 *  wide desktop one). Re-derived fresh on every "Set upon map" click ("always replaces" —
 *  operator confirmed), not read back from a previous deployment's drag/resize. */
// Bottom-right, not top-right: the map's own per-circuit seat blocks already cluster densely
// in the northeast (1st/2nd/3rd/DC), and an early version landed the deployed cartogram right
// on top of them (screenshot-caught). The southeast/open-Atlantic corner stays clear on every
// national-view zoom level this app supports. `aspect` (height/width of the cartogram's own
// bbox) sizes the default box correctly on the FIRST placement — computed from the real SVG
// bbox in deployDistrictOverlay, not guessed, so it doesn't need re-deriving if the arrangement
// data's shape ever changes.
function defaultDistrictMapState(aspect) {
  const vp = S.ui.viewport.getBoundingClientRect();
  const vw = vp.width || NOMINAL_MAP_PX, vh = vp.height || NOMINAL_MAP_PX;
  const width = Math.max(DISTRICT_OVERLAY_MIN_W, Math.min(280, vw * DISTRICT_OVERLAY_MAX_FRAC));
  const height = width * aspect;
  return { left: Math.max(8, vw - width - 16), top: Math.max(8, vh - height - 16), width };
}

/** Single source of truth for whether the deployed national assembly is actually visible:
 *  requires BOTH `districtOnMap` (the show/hide toggle) AND national view (operator spec: "the
 *  full district assembly should not follow the map view into a drill-in view"). Call after
 *  every state change that could affect either input, rather than toggling display directly at
 *  each call site — the earlier docked-detail bug (session bt) was exactly this kind of drift. */
function updateDistrictOverlayVisibility() {
  const show = S.districtOnMap && S.view === "national" && S.districtMapState;
  S.ui.districtOverlay.style.display = show ? "" : "none";
  if (!show) highlightDistrictOnMap(null);   // don't leave a shape tinted once it's hidden
}

function sizeDistrictOverlay() {
  const st = S.districtMapState;
  if (!st) return;
  const vp = S.ui.viewport.getBoundingClientRect();
  const vw = vp.width || NOMINAL_MAP_PX, vh = vp.height || NOMINAL_MAP_PX;
  // Reclamp on every resize (not just at deploy time) so a shrink to mobile width can't leave
  // the assembly wider than the viewport it's sitting in.
  st.width = Math.max(DISTRICT_OVERLAY_MIN_W, Math.min(st.width, vw * DISTRICT_OVERLAY_MAX_FRAC * 1.6, vw - 16));
  st.left = Math.max(4, Math.min(st.left, vw - st.width - 4));
  st.top = Math.max(4, Math.min(st.top, vh - 40));
  const el2 = S.ui.districtOverlay;
  el2.style.left = `${st.left}px`;
  el2.style.top = `${st.top}px`;
  el2.style.width = `${st.width}px`;
}

function renderDistrictOverlayButtons(controls) {
  controls.innerHTML = "";
  const toggle = el("button", "ctt-district-overlay-btn", { type: "button" });
  toggle.textContent = S.districtOnMap ? "×" : "▦";
  toggle.title = S.districtOnMap ? "Remove from map" : "Bring back the district blocks";
  toggle.setAttribute("aria-label", toggle.title);
  toggle.addEventListener("click", () => setDistrictOnMap(!S.districtOnMap));
  controls.append(toggle);
  if (S.districtOnMap) {   // +/- hide when the assembly itself is hidden (operator spec)
    const minus = el("button", "ctt-district-overlay-btn", { type: "button", "aria-label": "Shrink" });
    minus.textContent = "−";
    minus.addEventListener("click", () => resizeDistrictOverlay(1 / DISTRICT_OVERLAY_ZOOM_STEP));
    const plus = el("button", "ctt-district-overlay-btn", { type: "button", "aria-label": "Grow" });
    plus.textContent = "+";
    plus.addEventListener("click", () => resizeDistrictOverlay(DISTRICT_OVERLAY_ZOOM_STEP));
    controls.append(minus, plus);
  }
}

function resizeDistrictOverlay(factor) {
  const st = S.districtMapState;
  if (!st) return;
  const vp = S.ui.viewport.getBoundingClientRect();
  const vw = vp.width || NOMINAL_MAP_PX;
  const cx = st.left + st.width / 2;   // resize around the assembly's own centre, not its corner
  st.width = Math.max(DISTRICT_OVERLAY_MIN_W, Math.min(st.width * factor, vw * DISTRICT_OVERLAY_MAX_FRAC * 1.6, vw - 16));
  st.left = cx - st.width / 2;
  sizeDistrictOverlay();
}

/** Show/hide toggle (buttons [1]/[2] in the operator's spec) — NOT a full undeploy: the
 *  position/scale in `S.districtMapState` survive, so re-showing lands exactly where it was. */
function setDistrictOnMap(on) {
  S.districtOnMap = on;
  updateDistrictOverlayVisibility();   // also clears any stuck highlight when hiding — see there
  const controls = S.ui.districtOverlay.querySelector(".ctt-district-overlay-controls");
  if (controls) renderDistrictOverlayButtons(controls);
  const btn = S.ui.paneBody.querySelector(".ctt-district-deploy-btn");
  if (btn) btn.textContent = on ? "Remove from map" : "Set upon map";
}

/** "Set upon map": always replaces whatever was previously deployed (operator confirmed) —
 *  fresh default position/size every time, not whatever a prior deployment's drag/resize left. */
/** Tints the real geographic district shape "standard blue" (operator spec) while its
 *  corresponding cartogram block is hovered — the shape lives in the CURRENT national SVG
 *  (districts are real, if visually subordinate, shapes there per CLAUDE.md §5's national-view
 *  layering), a different DOM entirely from the cartogram overlay hovering it. */
function highlightDistrictOnMap(did) {
  const svg = S.ui.nationalSVG;
  if (!svg) return;
  svg.querySelectorAll(".ctt-shape-district-hover").forEach((s) => s.classList.remove("ctt-shape-district-hover"));
  if (!did) return;
  svg.querySelector(`path[data-court-id="${CSS.escape(did)}"][data-layer="district"]`)
    ?.classList.add("ctt-shape-district-hover");
}

function deployDistrictOverlay(circuits) {
  const ov = S.ui.districtOverlay;
  ov.innerHTML = "";
  const controls = el("div", "ctt-district-overlay-controls");
  const { svg, bbox } = buildDistrictCartogramSVG(circuits);
  S.districtMapState = defaultDistrictMapState(bbox ? bbox.H / bbox.W : 0.6);
  ov.append(svg, controls);
  wireDistrictCartogramHover(svg, S.ui.tooltip, highlightDistrictOnMap);
  wireDistrictOverlayDrag(ov, svg);
  sizeDistrictOverlay();
  setDistrictOnMap(true);
}

const DISTRICT_FLYOVER_MS = 520;

/** "The 'pull out of one interface and into another' effect should exist for DEPLOYING... it
 *  should not exist when returning it" (operator spec) — this is the ONLY place that
 *  animation lives; hide/show/redeploy elsewhere stay instant. Measures the cartogram's
 *  on-screen rect as it sits INSIDE the Summary pane, closes the pane (so "the summary pane
 *  flips up"), then flies an independent floating clone from that rect to the on-map target
 *  rect — the real assembly visually appears to stay in place and migrate, rather than
 *  vanishing with the pane and reappearing elsewhere. `sourceSvg` must be measured BEFORE
 *  calling this (i.e. before anything closes/moves it). */
function deployDistrictOverlayAnimated(circuits, sourceSvg) {
  const startRect = sourceSvg.getBoundingClientRect();
  deselect();   // "the summary pane flips up" — same close path as the × button
  if (reducedMotion() || !startRect.width || !startRect.height) {
    deployDistrictOverlay(circuits);
    return;
  }
  const { svg: flySvg, bbox } = buildDistrictCartogramSVG(circuits);
  const aspect = bbox ? bbox.H / bbox.W : 0.6;
  const targetState = defaultDistrictMapState(aspect);
  const vpRect = S.ui.viewport.getBoundingClientRect();
  const targetRect = {
    left: vpRect.left + targetState.left, top: vpRect.top + targetState.top,
    width: targetState.width, height: targetState.width * aspect,
  };

  const fly = el("div", "ctt-district-flyover");
  fly.append(flySvg);
  document.body.append(fly);
  // .ctt-sq-rep/-dem/-other read var(--ctt-rep) etc., defined on .ctt-root — this element is
  // deliberately appended to document.body (same reason S.ui.tooltip already is: it must
  // render above the whole widget including the pane, which .ctt-root's own stacking can't
  // guarantee), so those custom properties don't cascade to it and the squares rendered solid
  // BLACK (fill's initial value) the first time this ran. Copy just the 3 that matter —
  // .ctt-sq-vacant's colors are hardcoded, not var()-based, so it was never affected.
  const rootStyle = getComputedStyle(S.ui.root);
  fly.style.setProperty("--ctt-rep", rootStyle.getPropertyValue("--ctt-rep"));
  fly.style.setProperty("--ctt-dem", rootStyle.getPropertyValue("--ctt-dem"));
  fly.style.setProperty("--ctt-other", rootStyle.getPropertyValue("--ctt-other"));
  Object.assign(fly.style, {
    left: `${startRect.left}px`, top: `${startRect.top}px`,
    width: `${startRect.width}px`, height: `${startRect.height}px`, transition: "none",
  });
  void fly.offsetWidth;   // flush the start position before switching on the transition
  fly.style.transition = `left ${DISTRICT_FLYOVER_MS}ms ease, top ${DISTRICT_FLYOVER_MS}ms ease, ` +
    `width ${DISTRICT_FLYOVER_MS}ms ease, height ${DISTRICT_FLYOVER_MS}ms ease`;
  requestAnimationFrame(() => Object.assign(fly.style, {
    left: `${targetRect.left}px`, top: `${targetRect.top}px`,
    width: `${targetRect.width}px`, height: `${targetRect.height}px`,
  }));
  let done = false;
  const finish = () => {
    if (done) return;               // transitionend AND the safety timeout can both fire
    done = true;
    fly.remove();
    deployDistrictOverlay(circuits);   // the real persistent overlay takes over from here
  };
  fly.addEventListener("transitionend", finish, { once: true });
  setTimeout(finish, DISTRICT_FLYOVER_MS + 150);   // safety net if transitionend never fires
}

/** Cursor click-drag repositioning (operator spec). Dragging from a control button must not
 *  also move the whole overlay — checked first and bailed, same guard shape as the map's own
 *  seat-block tuner drag in tools/tune-seat-blocks.html. */
function wireDistrictOverlayDrag(ov, svg) {
  let drag = null;
  ov.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".ctt-district-overlay-btn")) return;
    const st = S.districtMapState;
    if (!st) return;
    drag = { startX: e.clientX, startY: e.clientY, left0: st.left, top0: st.top };
    ov.classList.add("ctt-dragging");
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    e.preventDefault();
  });
  function onMove(e) {
    if (!drag) return;
    const st = S.districtMapState;
    st.left = drag.left0 + (e.clientX - drag.startX);
    st.top = drag.top0 + (e.clientY - drag.startY);
    sizeDistrictOverlay();
  }
  function onUp() {
    window.removeEventListener("pointermove", onMove);
    ov.classList.remove("ctt-dragging");
    drag = null;
  }
}

/** Circuit-drill-in fixed sub-assembly (operator spec): shown for the drilled-in circuit's OWN
 *  districts regardless of whether the national assembly is deployed at all — a SEPARATE,
 *  always-available presentation, not the same instance following the view. `circuitId=null`
 *  sweeps it (called on drillOut). Renders directly into the LOCAL svg's layer wrapper so it
 *  disappears/reappears with that layer exactly like everything else in circuit-local view. */
function renderDistrictSubassembly(circuitId) {
  const old = S.ui.viewport.querySelector(".ctt-district-subassembly");
  if (old) old.remove();
  if (!circuitId || NO_DISTRICT_SUBASSEMBLY.has(circuitId)) return;
  loadDistrictArrangement().then((arrangement) => {
    if (S.view !== "circuit" || S.activeCircuit !== circuitId) return;   // stale by the time it loads
    const circuits = arrangement.circuits || [];
    const { svg, bbox } = buildDistrictCartogramSVG(circuits, circuitId);
    if (!bbox) return;   // no arrangement data for this circuit (e.g. not yet authored)
    const wrap = el("div", "ctt-district-subassembly");
    wrap.append(svg);
    S.ui.viewport.append(wrap);
    wireDistrictCartogramHover(svg, S.ui.tooltip);
  });
}

function renderSummaryDistrict(container) {
  const controls = el("div", "ctt-pane-controls");
  const deployBtn = el("button", "ctt-toggle ctt-district-deploy-btn", { type: "button" });
  deployBtn.textContent = S.districtOnMap ? "Remove from map" : "Set upon map";
  controls.append(deployBtn);
  container.append(controls);

  const layout = el("div", "ctt-district-layout");
  const wrap = el("div", "ctt-district-cartogram-wrap");
  const detailBox = el("div", "ctt-detail ctt-district-detail");
  const detailContent = el("div", "ctt-detail-content");
  const detailClose = el("button", "ctt-detail-close", { type: "button", "aria-label": "Close detail" });
  detailClose.textContent = "×";
  detailBox.append(detailClose, detailContent);
  layout.append(wrap, detailBox);
  container.append(layout);
  resetDistrictDetail(detailBox, detailContent);
  const tip = S.ui.tooltip;

  loadDistrictArrangement().then((arrangement) => {
    if (!container.isConnected || S.summaryView !== "district") return;   // stale by the time it loads
    const circuits = arrangement.circuits || [];
    if (!circuits.length) {
      const note = el("div", "ctt-summary-placeholder");
      note.textContent = "No district cartogram data available yet.";
      layout.replaceWith(note);
      return;
    }
    const { svg } = buildDistrictCartogramSVG(circuits);
    wrap.append(svg);
    // setDistrictOnMap()/deployDistrictOverlay() both already update this button's text
    // themselves (via the .ctt-district-deploy-btn lookup) — one source of truth for the label.
    // Deploying uses the animated "pull out" (needs `svg`'s CURRENT on-screen rect, measured
    // before anything moves); hiding is instant (operator spec: no animation on the way back).
    deployBtn.addEventListener("click", () => {
      if (S.districtOnMap) setDistrictOnMap(false);
      else deployDistrictOverlayAnimated(circuits, svg);
    });

    let pinned = null;
    detailClose.addEventListener("click", () => {
      pinned = null;
      detailBox.classList.remove("ctt-pinned");
      resetDistrictDetail(detailBox, detailContent);
    });
    wireDistrictCartogramHover(svg, tip, (did) => {
      if (pinned) return;                     // a pinned panel stays put until dismissed
      if (did) showDistrictDetail(detailContent, did, jumpToDistrictCourt);
      else resetDistrictDetail(detailBox, detailContent);
    });
    // Click-to-pin — only in Summary > District (operator spec: this and the docked viewer are
    // the two things that do NOT exist once the assembly is deployed onto the map).
    svg.addEventListener("click", (e) => {
      const sq = e.target.closest && e.target.closest(".ctt-district-sq");
      const did = sq?.getAttribute("data-district-id");
      if (!did) return;
      pinned = did;
      detailBox.classList.add("ctt-pinned");
      showDistrictDetail(detailContent, did, jumpToDistrictCourt);
    });
  }).catch((err) => {
    if (!container.isConnected || S.summaryView !== "district") return;
    console.error("[court-tracker] district cartogram load failed:", err);
    const note = el("div", "ctt-summary-placeholder");
    note.textContent = "Could not load the district cartogram.";
    layout.replaceWith(note);
  });
}

/** Hover grows every block belonging to the same district together (CLAUDE.md: "district
 *  court-square synced block growing on-hover"), with a tooltip naming the court and its LIVE
 *  composition (from seat_blocks, never the frozen cell_colors — see CODEBOOK.md Table F's
 *  staleness note). Reuses the tooltip DOM node the map's own shape/block hover already owns. */
// Same technique + easing as the map's own animateBlockScale() (see the "Do not reintroduce a
// transition on .ctt-sq transform" note in court-tracker.css): a CSS transform TRANSITION on an
// SVG rect can't composite, and re-rasterizes every frame — that's the "squares blur slightly
// and briefly" the operator reported (spotted on sight as the same class of bug this codebase
// already root-caused once for the map's own seat blocks; the fix is the same). Per-rect inline
// style writes on a requestAnimationFrame loop instead — no CSS transition anywhere in the path.
function animateDistrictSquare(sq, target) {
  const from = sq._sqScale ?? 1;
  if (sq._sqAnim) { cancelAnimationFrame(sq._sqAnim); sq._sqAnim = null; }
  const apply = (k) => { sq._sqScale = k; sq.style.transform = k === 1 ? "" : `scale(${k})`; };
  if (from === target || reducedMotion()) { apply(target); return; }
  const t0 = nowMs();
  const step = () => {
    const t = Math.min(1, (nowMs() - t0) / BLOCK_SCALE_MS);
    const e = 1 - (1 - t) ** 3;                       // ease-out, matches the map's own feel
    apply(t < 1 ? from + (target - from) * e : target);
    sq._sqAnim = t < 1 ? requestAnimationFrame(step) : null;
  };
  step();
}

// Deliberately its OWN constant, not the map's BLOCK_SCALE_HOVER: an initial pass matched the
// map's 1.17x exactly (operator's first-look report: "grows too much" compared to the map), but
// after actually testing it live the operator preferred the bigger growth back — the district
// cartogram's blocks, unlike the map's own seat blocks, often sit with real gaps between
// same-district cells (the block-builder tool's trimmed layout doesn't guarantee adjacency), so
// a bigger scale fills those gaps into one cohesive shape instead of reading as scattered
// separately-growing squares, which matters more here than it does on the map. Kept as its own
// named constant (rather than just reverting inline) so the two contexts can keep tuning apart
// without one accidentally dragging the other along.
const DISTRICT_SQ_SCALE_HOVER = 1.35;
function wireDistrictCartogramHover(svg, tip, onHover) {
  let hoveredId = null;
  const setHover = (did) => {
    if (did === hoveredId) return;
    hoveredId = did;
    svg.querySelectorAll(".ctt-district-sq").forEach((sq) =>
      animateDistrictSquare(sq, did && sq.getAttribute("data-district-id") === did ? DISTRICT_SQ_SCALE_HOVER : 1));
    onHover?.(did);
  };
  svg.addEventListener("pointermove", (e) => {
    const sq = e.target.closest && e.target.closest(".ctt-district-sq");
    const did = sq?.getAttribute("data-district-id") || null;
    setHover(did);
    if (did) {
      const court = S.courts.get(did);
      const b = S.seatBlocks?.[did];
      const composition = b ? `${b.r} R · ${b.d} D${b.vacancies ? ` · ${b.vacancies} vacant` : ""}` : "";
      tip.textContent = court ? `${court.court_name}${composition ? ` — ${composition}` : ""}` : did;
      tip.style.display = "block";
      tip.style.left = `${e.clientX + 14}px`;
      tip.style.top = `${e.clientY + 14}px`;
    } else {
      tip.style.display = "none";
    }
  });
  svg.addEventListener("pointerleave", () => { setHover(null); tip.style.display = "none"; });
}

// ---- bench model --------------------------------------------------------------
function buildBenchModel(court, active, senior, vacancies, circuit) {
  const byDate = (a, b) => (a.commission_date || "").localeCompare(b.commission_date || "");
  const activeSorted = [...active].sort(byDate);
  const seniorSorted = [...senior].sort(byDate);
  const justiceRow = court.court_level === "circuit" ? S.justices.get(circuit) : null;
  // circuit_justices.csv rows carry only name/circuit/photo — the docked detail panel was
  // mostly EMPTY for a hovered Circuit Justice (operator report). Merge in the full SCOTUS
  // judge record (appointment, JD, ABA, CL link, affiliation), joined by last name (unique
  // across the nine) + first-initial guard, since the two files write names differently
  // ("John G. Roberts, Jr." vs "John Glover Roberts Jr."). Justice-row fields win where
  // both exist (label + photo keep their current look). If the bundle is unavailable the
  // row passes through unmerged, as before.
  let justice = justiceRow;
  if (justiceRow) {
    const norm = (s) => (s || "").replace(/[.,]/g, "").replace(/\b(Jr|Sr|II|III|IV)\b/gi, "").trim().split(/\s+/);
    const [jn0, jnLast] = (() => { const p = norm(justiceRow.justice_name); return [p[0], p[p.length - 1]]; })();
    const rec = (S.judgeCache.get("scotus") || []).find((r) => {
      const p = norm(r.full_name);
      return p[p.length - 1]?.toLowerCase() === jnLast?.toLowerCase() &&
             p[0]?.[0]?.toLowerCase() === jn0?.[0]?.toLowerCase();
    });
    if (rec) justice = { ...rec, ...Object.fromEntries(Object.entries(justiceRow).filter(([, v]) => v != null && v !== "")) };
  }
  const allJudges = [...activeSorted, ...seniorSorted];  // one DOM node each
  return { court, seniors: seniorSorted, activeSorted, allJudges, justice, vacancies };
}

// ---- icon rendering + layout --------------------------------------------------
/** Surname for compact labels — generational suffixes are not surnames:
 *  "Samuel A. Alito, Jr." -> "Alito" (was rendering "Circ. Justice Jr."). */
function surname(name) {
  const parts = (name || "").replace(/,/g, "").trim().split(/\s+/)
    .filter((p) => !/^(Jr|Sr|II|III|IV|V)\.?$/i.test(p));
  return parts[parts.length - 1] || name || "";
}
function initials(j) {
  const name = (j.full_name || j.display_name || "?").trim();
  const parts = name.split(/\s+/);
  const first = parts[0]?.[0] || "";
  // surname() strips generational suffixes (Jr/Sr/II/...) - without it, "Paul Joseph Kelly
  // Jr." rendered "PJ" (P from Paul, J from "Jr." mistaken for the last name) instead of "PK".
  const last = parts.length > 1 ? surname(name)[0] || "" : "";
  return (first + last).toUpperCase();
}
// Prefer the locally-cached, anti-aliased thumbnail (scripts/cache_photos.py) over hotlinking
// `photo_url` — same photo, but pre-blurred/resized to survive downscaling to a 34-84px
// avatar without the moiré a raw halftone-scan source produces under naive resizing. Falls
// back to the live URL when a thumbnail hasn't been generated yet (fresh checkout, or a photo
// added since the last cache_photos.py run) — never a broken image.
function photoSrc(j) { return j.photo_thumb ? resolve(j.photo_thumb) : j.photo_url; }

// photo_license is "<license>" or "<license> — credit: <author>" (see enrich_wikipedia.py).
// Returns null for licenses that carry no attribution requirement.
function photoCredit(j) {
  if (!j.photo_url || !j.photo_license) return null;
  const [license, author] = j.photo_license.split(/\s+—\s+credit:\s*/);
  if (!author) return null;
  return { license: license.trim(), author: author.trim() };
}

function makeIcon(seat) {
  const node = el("div", "ctt-judge");
  // Highlight ring is a sibling of the avatar (not a child), so the avatar's grayscale
  // filter on senior judges never desaturates the yellow same-president outline.
  const hl = el("div", "ctt-hl");
  const avatar = el("div", "ctt-avatar");
  if (seat.kind === "vacancy") {
    node.classList.add("ctt-vacant");
    avatar.classList.add("ctt-avatar-vacant");
  } else {
    const j = seat.judge;
    avatar.classList.add(PARTY_CLASS[j.president_party] || "ctt-other");
    if (j.status === "senior") node.classList.add("ctt-senior");
    if (j.photo_url) {
      const img = el("img", "ctt-photo", { src: photoSrc(j), alt: j.full_name, loading: "lazy" });
      img.addEventListener("error", () => { img.remove(); avatar.textContent = initials(j); });
      avatar.append(img);
    } else {
      avatar.textContent = initials(j);
    }
    if (j.is_chief && !seat.noStar) {
      const star = el("span", "ctt-chief-badge", { title: "Chief judge" });
      star.textContent = "★";
      node.append(star);
    }
    node._judge = j;
    node.addEventListener("mouseenter", () => onIconHover(j, node));
    node.addEventListener("mouseleave", clearCoPresident);
    node.addEventListener("click", (e) => { e.stopPropagation(); onIconClick(j, node); });
  }
  const label = el("div", "ctt-judge-label");
  label.textContent = seat.kind === "vacancy" ? "Vacant" : (seat.judge.display_name || "");
  node.append(hl, avatar, label);
  seat._node = node;
  return node;
}
/** Ridge the party ring of judges a source reports as affiliated with the selected org.
 *  Reads the flag off the node, so toggling never rebuilds or re-lays-out the bench. */
function applyAffilMarks() {
  const stage = S.ui.paneBody.querySelector(".ctt-judge-stage");
  if (!stage) return;
  const field = S.affilMark === "fedsoc" ? "fedsoc_reported"
    : S.affilMark === "acs" ? "acs_reported" : null;
  stage.querySelectorAll(".ctt-judge").forEach((n) =>
    n.classList.toggle("ctt-affil-marked", !!(field && n._judge && n._judge[field])));
}

function renderJudgeIcons(stage, model) {
  stage.innerHTML = "";
  // One DOM node per judge (reused across timeline/arc layouts) + a vacancy node pool.
  model._nodeByJudge = new Map();
  model.allJudges.forEach((j) => {
    const node = makeIcon({ kind: "judge", judge: j });
    model._nodeByJudge.set(j, node);
    stage.append(node);
  });
  model._vacancyNodes = [];
  for (let i = 0; i < model.vacancies; i++) {
    const node = makeIcon({ kind: "vacancy" });
    model._vacancyNodes.push(node);
    stage.append(node);
  }
  model._justiceNode = null;
  if (model.justice) {
    // noStar: the chief STAR means "chief of the displayed court" — Roberts's merged SCOTUS
    // record carries is_chief, but he is not the chief of the 4th/DC/Fed circuit benches he
    // appears over as Circuit Justice. (His docked detail keeps the Chief tag: that is his
    // title. The SCOTUS pane itself renders him as a bench judge, so the star shows there.)
    const jn = makeIcon({ kind: "judge", judge: model.justice, noStar: true });
    jn.classList.add("ctt-justice");
    model._justiceNode = jn;
    stage.append(jn);
  }
  // majority overlay (guides + dotted line + count) sits BEHIND the icons (#15)
  const ov = document.createElementNS(SVGNS, "svg");
  ov.setAttribute("class", "ctt-majority-overlay");
  stage.insertBefore(ov, stage.firstChild);
  stage._overlay = ov;
  stage.addEventListener("mouseleave", hideDetail);
}

// ---- multi-ring (parliament) arc geometry (#16) -------------------------------
const ICON = 26;        // half icon footprint for centering
const S_MIN = 48;       // minimum center-to-center icon spacing before we add a ring
const ROW_GAP = 50;     // radial distance between concentric rings

function majorityDims(w, H = 320) {
  // TOP-half dome (reinstated 2026-07-19 after a bottom-half experiment): the arc hugs the
  // stage BOTTOM and the R/D-appointed count text sits BELOW its baseline — fixed relative
  // to the arc centre, so the variable whitespace lives above the dome where it labels
  // nothing. The 68px below cy hold the baseline icons' bottom halves (+22), their name
  // labels (to ~cy+40), and the count text (baseline cy+54, see drawMajorityOverlay).
  const cx = w / 2, cy = H - 68;
  return { H, cx, cy, Rmax: Math.max(60, cy - 30), R0: Math.min(w * 0.26, 132) };
}

// Distribute N icons across the given ring radii so intra-ring neighbour spacing is as
// equal as possible: seats-per-ring ∝ ring radius (arc length), which also guarantees
// outer rings hold ≥ inner rings.
function ringCounts(N, radii) {
  const sum = radii.reduce((a, b) => a + b, 0) || 1;
  const counts = radii.map((r) => Math.max(1, Math.round((N * r) / sum)));
  let diff = N - counts.reduce((a, b) => a + b, 0);
  let i = counts.length - 1;
  // Guard the loop: if diff < 0 and every ring already holds its 1-seat minimum, no branch
  // below can fire and this spins forever, pinning the main thread. kMax <= N makes that
  // unreachable today, but nothing in ringCounts itself enforces it.
  let spins = counts.length * (N + 2);
  while (diff !== 0 && spins-- > 0) {      // reconcile rounding, adjusting outer rings first
    if (diff > 0) { counts[i]++; diff--; }
    else if (counts[i] > 1) { counts[i]--; diff++; }
    i = i > 0 ? i - 1 : counts.length - 1;
  }
  return counts;
}

// Fewest rings such that every ring's neighbour spacing ≥ S_MIN (capped by radial room
// and 4 rings — was 3 until the pane went full-height; the extra radial budget lets the
// biggest folded benches (ca9's 51) spread instead of cramming 22 icons on one ring).
function planRings(N, R0, Rmax, reserveBand) {
  const budget = Rmax - (reserveBand ? ROW_GAP : 0);
  const kMax = Math.max(1, Math.min(4, N, Math.floor((budget - R0) / ROW_GAP) + 1));
  for (let k = 1; k <= kMax; k++) {
    const radii = Array.from({ length: k }, (_, i) => R0 + i * ROW_GAP);
    const counts = ringCounts(N, radii);
    const minSp = Math.min(...radii.map((r, i) => (counts[i] <= 1 ? Infinity : (Math.PI * r) / (counts[i] - 1))));
    if (minSp >= S_MIN) return { radii, counts };
  }
  const radii = Array.from({ length: kMax }, (_, i) => R0 + i * ROW_GAP);
  return { radii, counts: ringCounts(N, radii) };
}

// Evenly spaced slot angles on a semicircle, endpoints included (so every ring has a seat
// at exactly 9 o'clock / 180°); a lone seat sits at the top (90°).
// `buffered`: a tiny bench (2-3 seats on the only ring) looks odd stretched to the arc's
// extremes — two judges facing off at 180°/0°, three at right angles (operator call). Those
// spread with arc-buffers instead: angles at k·π/(x+1), i.e. 2 seats at 120°/60°, 3 at
// 135°/90°/45°. Multi-ring benches keep the shared-endpoint look.
function ringSlotAngles(x, buffered) {
  if (x <= 1) return [Math.PI / 2];
  if (buffered) return Array.from({ length: x }, (_, j) => Math.PI - ((j + 1) * Math.PI) / (x + 1));
  return Array.from({ length: x }, (_, j) => Math.PI - (j * Math.PI) / (x - 1));
}

// All slots across all rings, ordered by angle (protractor order, 180°→0°); ties (a shared
// 9 o'clock across rings) break inner-first. This is the fill order judges are poured into.
function orderedSlots(radii, counts) {
  const buffered = radii.length === 1 && counts[0] <= 3;
  const slots = [];
  radii.forEach((r, ri) => ringSlotAngles(counts[ri], buffered).forEach((ang) => slots.push({ r, ang, ri })));
  slots.sort((a, b) => (b.ang - a.ang) || (a.ri - b.ri));
  return slots;
}

function layoutJudges() {
  const stage = S.ui.paneBody.querySelector(".ctt-judge-stage");
  if (!stage || !stage._model) return;
  const model = stage._model;
  const w = stage.clientWidth || 600;
  // Timeline mode's height must grow with row count, not stay a flat 220px: layoutTimeline()
  // wraps icons into as many rows as needed but never consults the stage's own height, and
  // icons are position:absolute so an overflowing row doesn't expand the stage box the normal
  // CSS way - it silently draws past the box's bottom edge instead. For a court whose icon
  // count needs more than ~3 rows at the current width (CFC's 21, hit 2026-07-16 once its pane
  // note went from a hidden toggle-note to an always-visible one and the 4th row started
  // drawing on top of it), the stage must be measured and sized BEFORE layoutTimeline() places
  // anything, so trailing siblings (the note) render below the true content, not on top of it.
  const H = S.majorityMode ? majorityStageHeight(stage) : timelineStageHeight(model, w);
  stage.style.height = `${H}px`;

  // Circuit Justice placement (#7): timeline -> a chip in the header; majority -> the
  // centre of the semicircle. Reparent the single node so it visibly "moves".
  const jn = model._justiceNode;
  const slot = S.ui.paneBody.parentElement.querySelector(".ctt-justice-slot");
  if (jn) {
    jn.querySelector(".ctt-judge-label").textContent =
      `Circ. Justice ${surname(model.justice.justice_name)}`;
    if (!S.majorityMode) {
      if (slot && jn.parentElement !== slot) slot.appendChild(jn);
      jn.classList.add("ctt-justice-inhead");
      jn.style.transform = ""; jn.style.opacity = "1"; jn.style.pointerEvents = "";
    } else {
      if (jn.parentElement !== stage) stage.appendChild(jn);
      jn.classList.remove("ctt-justice-inhead");
    }
  }

  if (!S.majorityMode) {
    layoutTimeline(model, w, H);
    drawMajorityOverlay(stage, null);
  } else if (stage.classList.contains("ctt-scotus-stage")) {
    layoutScotusRing(model, w, H);
    drawMajorityOverlay(stage, model);
  } else {
    layoutArc(model, w, H);
    drawMajorityOverlay(stage, model);
  }
}

function place(node, cx, cy, show, scale = 1) {
  // translate-then-scale composes around the box's OWN center (its default transform-origin),
  // unaffected by the translate — so a scaled icon still lands centred at (cx,cy) with no
  // change to the offset math below (verified: this is exactly why Summary > SCOTUS's 2x
  // icons don't need a different ICON constant or re-centering logic).
  node.style.transform = `translate(${cx - ICON}px, ${cy - ICON}px)` + (scale !== 1 ? ` scale(${scale})` : "");
  node.style.opacity = show ? "1" : "0";
  node.style.pointerEvents = show ? "" : "none";
}

// Mirrors layoutTimeline()'s own row math (cell 60px, 12px gap, 34px top offset) so the stage
// is sized to fit every row BEFORE any icon is placed, instead of the previous flat 220px that
// silently let a 4th+ row draw past the box (invisible only because nothing used to render
// right after the stage in timeline mode - the always-visible court note now does).
function timelineStageHeight(model, w) {
  const cell = 60, cols = Math.max(1, Math.floor((w - 20) / cell));
  const total = model.allJudges.length + model._vacancyNodes.length;
  const rows = Math.max(1, Math.ceil(total / cols));
  // 34 (top offset) + (rows-1)*72 (row pitch) reaches the last row's icon CENTER; +22 clears
  // the 44px avatar's bottom half; +18 leaves room for the name label under it. Matches the old
  // flat 220px for <=2 rows (kept as the floor via Math.max, so small courts are unchanged).
  return Math.max(220, 34 + (rows - 1) * (cell + 12) + 22 + 18);
}

/** Majority mode fills the room the (now full-height) pane actually has: pane-body height
 *  minus everything above the stage and the note below it. More height = larger Rmax =
 *  more/larger rings via planRings. Clamped: 320 keeps small panes (and jsdom, where every
 *  box is 0) on the long-verified geometry; 520 stops a huge desktop pane from inflating
 *  the arc past the point where icons read as a bench. */
function majorityStageHeight(stage) {
  const body = S.ui.paneBody;
  const bodyR = body.getBoundingClientRect();
  if (!bodyR.height) return 360;                       // no layout (headless/jsdom)
  const stageTop = stage.getBoundingClientRect().top - bodyR.top + body.scrollTop;
  // EVERY visible note below the stage costs height: the toggle-gated majority note AND the
  // territorial courts' always-visible note (vid's was clipped when only the former counted).
  let noteH = 0;
  body.querySelectorAll(".ctt-note").forEach((n) => {
    if (getComputedStyle(n).display !== "none") noteH += n.getBoundingClientRect().height + 6;
  });
  const avail = body.clientHeight - stageTop - noteH - 14;  // pane-body padding-bottom + slack
  // Floor 360: the below-baseline zone (icon halves + labels + the count text, 68px) plus
  // the 30px top pad cost ~98px of the stage, so 360 preserves the radial budget the
  // original geometry had at 320 (Rmax ~262) — below that an 11-seat bench collapses to
  // one ring.
  return Math.max(360, Math.min(520, Math.floor(avail)));
}

function layoutTimeline(model, w, H) {
  // active + seniors in commission order, wrapping rows; vacancies parked at the end.
  const cell = 60, cols = Math.max(1, Math.floor((w - 20) / cell));
  const ordered = [...model.allJudges]
    .sort((a, b) => (a.commission_date || "").localeCompare(b.commission_date || ""));
  const seq = [...ordered.map((j) => model._nodeByJudge.get(j)), ...model._vacancyNodes];
  seq.forEach((node, i) => {
    const r = Math.floor(i / cols), c = i % cols;
    place(node, 32 + c * cell + cell / 2, 34 + r * (cell + 12), true);
    node.classList.remove("ctt-in-arc");
  });
}

// Seats on the inner arc = active judges (+ seniors when folded in) + vacancies, grouped
// R | vacancies | D. Returns the seat list actually drawn on the inner arc.
function innerArcSeats(model) {
  const partyRank = (j) => (j.president_party === "Republican" ? 0 : j.president_party === "Democratic" ? 2 : 1);
  const byDate = (a, b) => (a.commission_date || "").localeCompare(b.commission_date || "");
  const filled = S.seniorMode === "include" ? [...model.activeSorted, ...model.seniors] : model.activeSorted;
  const sorted = [...filled].sort((a, b) => partyRank(a) - partyRank(b) || byDate(a, b));
  const seats = [];
  sorted.filter((j) => partyRank(j) === 0).forEach((j) => seats.push({ judge: j }));
  for (let i = 0; i < model.vacancies; i++) seats.push({ vacancy: true });
  sorted.filter((j) => partyRank(j) !== 0).forEach((j) => seats.push({ judge: j }));
  return seats;
}

function layoutArc(model, w, H) {
  const { cx, cy, Rmax, R0 } = majorityDims(w, H);
  const seats = innerArcSeats(model);            // {judge} | {vacancy}, party-grouped L→R
  const N = seats.length || 1;
  const hasSeniorsBand = S.seniorMode === "show" && model.seniors.length > 0;
  const { radii, counts } = planRings(N, R0, Rmax, hasSeniorsBand);
  const slots = orderedSlots(radii, counts);     // fill order = protractor/angle order (#16)

  let vi = 0;
  seats.forEach((seat, i) => {
    const node = seat.vacancy ? model._vacancyNodes[vi++] : model._nodeByJudge.get(seat.judge);
    const s = slots[i] || slots[slots.length - 1];
    place(node, cx + s.r * Math.cos(s.ang), cy - s.r * Math.sin(s.ang), true);
    node.classList.add("ctt-in-arc");
  });

  // seniors: grayed outer band, one ROW_GAP beyond the outermost active ring. Absent entirely
  // when seniorMode is "hide" or "include" (folded into the inner arc instead) — Seniors use
  // simple centred spacing — they need not snap to 180°/0° (#19b).
  const bandR = radii[radii.length - 1] + ROW_GAP;
  const outer = hasSeniorsBand ? model.seniors : [];
  const sn = outer.length || 1;
  outer.forEach((j, i) => {
    const node = model._nodeByJudge.get(j);
    const ang = Math.PI - ((i + 0.5) / sn) * Math.PI;
    place(node, cx + bandR * Math.cos(ang), cy - bandR * Math.sin(ang), true);
    node.classList.add("ctt-in-arc");
  });
  // "Hide": conceal entirely — a senior isn't in `filled` (inner arc) and isn't in `outer`
  // (band) either, so its node would otherwise keep whatever position/opacity a PRIOR layout
  // (e.g. Timeline mode) left it in.
  if (S.seniorMode === "hide") {
    model.seniors.forEach((j) => place(model._nodeByJudge.get(j), cx, cy, false));
  }

  if (model._justiceNode) place(model._justiceNode, cx, cy - R0 * 0.3, true);
  model._arcRender = { cx, cy, radii, bandR, hasSeniorsBand };  // for the overlay
}

// Summary > SCOTUS's fixed double-ring layout (operator ask, 2026-09-03): unlike layoutArc's
// general N-seat planRings() algorithm (shared by every other court's Majority view), SCOTUS is
// always exactly 9 authorized seats, split 6 outer + 3 inner — never a computed ring count, so
// this is deliberately its own small function rather than a planRings special case.
const SCOTUS_ICON_SCALE_MAX = 2;      // icons target 2x normal size ("since it is SCOTUS")
const SCOTUS_INNER_COUNT = 3, SCOTUS_OUTER_COUNT = 6;
const SCOTUS_RAISE_DEG = 20;          // inner ring's first/last seats lift off 180°/0° by this much
function layoutScotusRing(model, w, H) {
  const { cx, cy } = majorityDims(w, H);   // cx/cy only — Rmax/R0 there assume 1x icons, not 2x
  const m = Math.min(cx, cy);
  // Icons TARGET 2x but shrink toward (never below) 1x only as far as the stage actually
  // forces. A fixed 2x crowded the 6 outer-ring icons into each other on a ~380px mobile
  // stage (screenshot-verified — 6 icons spanning 180° need real width for their SIZE, not
  // just their radius); a hard cap on the RADII alone (kept scale fixed at 2x) fixed the
  // earlier overflow-past-the-edge bug but traded it for icons overlapping EACH OTHER instead,
  // an equally broken outcome. Solving for the largest scale at which the outer ring's own
  // minimum non-overlap radius still fits inside the stage's clearance avoids both failure
  // modes: 6 seats at 36° apart need radius R ≥ ~1.7×diameter to keep a small gap between
  // neighbours (chord = 2R·sin18° ≥ 1.05×diameter); the stage caps R at m − halfIcon − 4; two
  // linear equations in `scale`, solved directly below rather than iterated.
  const scale = Math.min(SCOTUS_ICON_SCALE_MAX, Math.max(1, (m - 4) / (88.35 + 26)));
  const halfIcon = ICON * scale;
  const capR = Math.max(40, m - halfIcon - 4);
  const minSafeR1 = 1.7 * (2 * halfIcon);   // the non-overlap floor derived above, at this scale
  // Desired (generous) outer radius when there's room to spare — unchanged from the original
  // desktop-tuned formula; the minSafeR1/capR clamps only bite once the stage gets tight.
  const desiredR0 = Math.min(w * 0.22, capR * 0.6);
  const desiredR1 = desiredR0 + ROW_GAP * scale + 10;
  const R1 = Math.min(capR, Math.max(desiredR1, minSafeR1));
  // Inner ring at HALF the outer radius (operator ask, 2026-09-04: "space the rings ~10-15%
  // further apart" — 0.5 is both a clean round ratio and lands the gap ~13-15% wider than the
  // old 0.56 ratio produced). At 20° raised endpoints the inner ring's tightest gap is 70°
  // (was 75° at the old 15°), so its own non-overlap floor is slightly higher — enforced below
  // rather than assumed, same as the outer ring's minSafeR1.
  const minSafeR0 = 0.915 * (2 * halfIcon);
  const R0 = Math.max(minSafeR0, Math.min(desiredR0, R1 * 0.5, R1 - 8));
  const radii = [R0, R1];

  const raise = (SCOTUS_RAISE_DEG * Math.PI) / 180;
  const innerAngles = [Math.PI - raise, Math.PI / 2, raise];         // 165°, 90°, 15°
  const outerAngles = ringSlotAngles(SCOTUS_OUTER_COUNT, false);      // standard evenly-spaced, endpoints included
  const slots = [
    ...innerAngles.map((ang) => ({ r: R0, ang, ri: 0 })),
    ...outerAngles.map((ang) => ({ r: R1, ang, ri: 1 })),
  ];
  slots.sort((a, b) => (b.ang - a.ang) || (a.ri - b.ri));   // same protractor/tie rule as orderedSlots()

  const seats = innerArcSeats(model);   // R | vacancies | D, oldest→newest within party (#16's algorithm)
  let vi = 0;
  seats.forEach((seat, i) => {
    const node = seat.vacancy ? model._vacancyNodes[vi++] : model._nodeByJudge.get(seat.judge);
    const s = slots[i] || slots[slots.length - 1];
    place(node, cx + s.r * Math.cos(s.ang), cy - s.r * Math.sin(s.ang), true, scale);
    node.classList.add("ctt-in-arc");
  });
  // SCOTUS never has a Circuit Justice or seniors band (28 U.S.C. §371) — nothing else to place.
  model._arcRender = { cx, cy, radii, bandR: 0, hasSeniorsBand: false };
}

function drawMajorityOverlay(stage, model) {
  const ov = stage._overlay;
  ov.innerHTML = "";
  if (!model || !model._arcRender) return;
  const w = stage.clientWidth || 600, H = stage.clientHeight || 320;
  ov.setAttribute("viewBox", `0 0 ${w} ${H}`);
  const { cx, cy, radii, bandR, hasSeniorsBand } = model._arcRender;

  // subtle guide traces so a handful of icons still read as concentric semicircles (#6/#16)
  const guide = (r) => {
    const p = document.createElementNS(SVGNS, "path");
    p.setAttribute("d", `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`);
    p.setAttribute("class", "ctt-arc-guide");
    ov.append(p);
  };
  radii.forEach(guide);
  if (hasSeniorsBand) guide(bandR);

  // dotted majority line (top-centre divider), BEHIND the icons. Centred on the mean active-
  // ring radius — so its MIDPOINT lands on the ring for a single semicircle, or on the mean of
  // the ring radii for several — with symmetric margins that reach just past the outer/inner
  // top icons (#19d/#21). Seniors are excluded from the extent.
  const rInner = radii[0], rOuter = radii[radii.length - 1];
  const meanR = radii.reduce((a, b) => a + b, 0) / radii.length;
  // extend each end by half an inter-ring distance (stays centred on meanR)
  const half = (rOuter - rInner) / 2 + (ICON + 4) + ROW_GAP / 2;
  const line = document.createElementNS(SVGNS, "line");
  line.setAttribute("x1", cx); line.setAttribute("y1", cy - meanR + half);
  line.setAttribute("x2", cx); line.setAttribute("y2", cy - meanR - half);
  line.setAttribute("class", "ctt-majority-line");
  ov.append(line);

  // x/y count over active judgeships ("Include" folds seniors into the count too)
  const pool = S.seniorMode === "include" ? [...model.activeSorted, ...model.seniors] : model.activeSorted;
  const counts = { Republican: 0, Democratic: 0, Other: 0 };
  pool.forEach((j) => { counts[j.president_party in counts ? j.president_party : "Other"]++; });
  const total = pool.length;
  const need = Math.floor(total / 2) + 1;
  const lead = counts.Republican >= counts.Democratic ? "Republican" : "Democratic";
  const leadN = counts[lead];
  const txt = document.createElementNS(SVGNS, "text");
  // Below the baseline, centred between the endpoint seats — position is FIXED relative to
  // the arc centre (cy), so it never drifts with ring count the way a top label did.
  txt.setAttribute("x", cx); txt.setAttribute("y", cy + 54);
  txt.setAttribute("class", "ctt-majority-count");
  txt.setAttribute("text-anchor", "middle");
  txt.textContent = `${lead === "Republican" ? "R" : "D"}-appointed ${leadN} of ${total}` +
    ` · majority ${need}${leadN >= need ? " ✓" : " (no majority)"}` + (S.seniorMode === "include" ? " · incl. seniors" : "");
  ov.append(txt);
}

// ---- icon hover: detail box + same-president highlight ------------------------
function highlightCohort(j) {
  // Highlight the WHOLE appointing-president cohort, including the hovered judge (#5).
  const model = S.ui.paneBody.querySelector(".ctt-judge-stage")?._model;
  model?._nodeByJudge.forEach((n, other) => {
    n.classList.toggle("ctt-copresident",
      !!j.appointing_president && other.appointing_president === j.appointing_president);
  });
}
function onIconHover(j, node) {
  if (S.detailPinned) return;         // a pinned panel stays put until dismissed (#20)
  highlightCohort(j);
  showDetail(j, node);
}
function onIconClick(j, node) {       // click pins the panel so it's interactable (#20)
  highlightCohort(j);
  showDetail(j, node);
  S.detailPinned = true;
  S.ui.detail.classList.add("ctt-pinned");
}
function clearCoPresident() {
  if (S.detailPinned) return;
  const model = S.ui.paneBody.querySelector(".ctt-judge-stage")?._model;
  model?._nodeByJudge.forEach((n) => n.classList.remove("ctt-copresident"));
}
function hideDetail() {
  // The docked panel is STICKY: hover-out only clears the cohort highlight and keeps the
  // last judge's details up, so the reader can move into the panel and click its links
  // without pinning first. Only a new court (resetDetail) or a new hover replaces content.
  if (S.detailPinned) return;         // don't let hover-out clear a pinned panel's highlight
  const model = S.ui.paneBody.querySelector(".ctt-judge-stage")?._model;
  model?._nodeByJudge.forEach((n) => n.classList.remove("ctt-copresident"));
}
function unpinDetail() {
  S.detailPinned = false;
  S.ui.detail.classList.remove("ctt-pinned");
  hideDetail();
}
/** Empty state for the docked panel (a fresh court selection): a muted usage hint. */
function resetDetail() {
  S.ui.detail.style.display = "";
  S.ui.detailContent.innerHTML =
    `<div class="ctt-detail-hint">Hover over a judge for details.<br>Click to pin.</div>`;
}
function yearsSince(dateStr) {
  if (!dateStr) return null;
  const then = new Date(dateStr), now = new Date();
  const yr = (now - then) / (365.25 * 24 * 3600 * 1000);
  return yr;
}
function fmtYears(y) {
  if (y == null) return "—";
  const whole = Math.floor(y), mo = Math.round((y - whole) * 12);
  return mo && whole < 25 ? `${whole} yr ${mo} mo` : `${whole} yr`;
}
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
// Holdover is real ONLY for the territorial fixed_term courts: their organic acts say a judge
// serves "ten years, and until a successor is chosen and qualified" (48 U.S.C. §1424b Guam,
// §1614 V.I.; N. Mariana Islands' Covenant carries the same mechanism). CFC's term statute
// (28 U.S.C. §172) has NO such clause - a fixed_term_senior judge's term simply ends, so this
// must not fire for uscfc even though it also tracks term_expiration_date.
function isHoldover(j, court) {
  return court && court.tenure_type === "fixed_term" && j.status === "active" &&
    !!j.term_expiration_date && j.term_expiration_date < todayISO();
}
function showDetail(j, node) {
  const box = S.ui.detail;
  const content = S.ui.detailContent;
  const court = S.courts.get(j.court_id);
  const partyWord = j.president_party || "Other";
  const ring = PARTY_CLASS[j.president_party] || "ctt-other";
  const holdover = isHoldover(j, court);
  const lines = [];
  lines.push(`<div class="ctt-detail-name">${j.full_name}` +
    (j.is_chief ? ` <span class="ctt-tag">Chief</span>` : "") +
    (j.status === "senior" ? ` <span class="ctt-tag ctt-tag-senior">Senior</span>` : "") +
    (holdover ? ` <span class="ctt-tag ctt-tag-holdover">Holdover</span>` : "") + `</div>`);
  lines.push(`<div><span class="ctt-dot ${ring}"></span>Appointed by ${j.appointing_president} (${partyWord})</div>`);
  if (j.status === "senior" && j.senior_date) lines.push(`<div>Senior status ${j.senior_date}</div>`);
  if (j.confirmation_date) lines.push(`<div>Confirmed ${j.confirmation_date}</div>`);
  if (court && (court.tenure_type === "fixed_term" || court.tenure_type === "fixed_term_senior") &&
      j.term_expiration_date && j.status !== "senior") {
    if (holdover) {
      lines.push(`<div>Current term: ${fmtYears(yearsSince(j.commission_date))} served · term expired ` +
        `${j.term_expiration_date} · holding over pending a successor</div>`);
    } else {
      const remaining = -yearsSince(j.term_expiration_date);
      lines.push(`<div>Current term: ${fmtYears(yearsSince(j.commission_date))} served · ` +
        `${fmtYears(remaining)} remaining (expires ${j.term_expiration_date})</div>`);
    }
  } else {
    lines.push(`<div>On the bench: ${fmtYears(yearsSince(j.commission_date))}</div>`);
  }
  if (j.jd_school) lines.push(`<div>JD: ${j.jd_school}${j.jd_year ? " (" + j.jd_year + ")" : ""}</div>`);
  if (j.aba_rating) lines.push(`<div>ABA rating: ${j.aba_rating}</div>`);
  if (j.fedsoc_reported) lines.push(`<div class="ctt-affil">Reported to have a Federalist Society affiliation` +
    `${j.fedsoc_basis ? " (" + j.fedsoc_basis + ")" : ""}${j.fedsoc_source ? ` — <a href="${j.fedsoc_source}" target="_blank" rel="noopener">source</a>` : ""}</div>`);
  if (j.acs_reported) lines.push(`<div class="ctt-affil">Reported to have an American Constitution Society affiliation` +
    `${j.acs_basis ? " (" + j.acs_basis + ")" : ""}${j.acs_source ? ` — <a href="${j.acs_source}" target="_blank" rel="noopener">source</a>` : ""}</div>`);
  if (j.cl_profile_url) lines.push(`<div><a href="${j.cl_profile_url}" target="_blank" rel="noopener">CourtListener profile ↗</a></div>`);
  // CC BY / CC BY-SA oblige us to credit the creator and name the license; public-domain
  // images (the large majority here) don't, so they stay out of the panel.
  const credit = photoCredit(j);
  if (credit) lines.push(`<div class="ctt-photo-credit">Photo: ${credit.license}` +
    `${credit.author ? " — " + credit.author : ""}` +
    `${j.photo_source ? ` (<a href="${j.photo_source}" target="_blank" rel="noopener">source</a>)` : ""}</div>`);
  content.innerHTML = lines.join("");
  // Large avatar atop the docked panel — same fallback semantics as the stage icons
  // (photo if it loads, initials otherwise), built as DOM so the error handler can swap.
  const photo = el("div", `ctt-detail-photo ${ring}` + (j.status === "senior" ? " ctt-detail-senior" : ""));
  if (j.photo_url) {
    const img = el("img", null, { src: photoSrc(j), alt: j.full_name, loading: "lazy" });
    img.addEventListener("error", () => { img.remove(); photo.textContent = initials(j); });
    photo.append(img);
  } else {
    photo.textContent = initials(j);
  }
  content.prepend(photo);
  box.style.display = "";
}

// ---- "Change" streamgraph: appointing-president headcount over time ------------
// A stream = one PRESIDENT/TERM's currently-serving (active+senior) appointee count to the
// SELECTED court, evaluated at every appointment/departure event since 1969 (shared date
// range + party data with the beeswarm — see embed/presidencies.js). Two party halves (R
// above / D below a zero line); within a half, streams stack innermost (OLDEST term) ->
// outermost (most recent) — flipped from the first version (operator call, session ax: less
// jagged, and worth trying the opposite of "current at center" once seen in practice) — a
// FIXED order for the whole timeline. Values only ever change at a real event date, so
// streams render as flat-topped step polygons, not smoothed curves, and never carry a
// zero-thickness stretch as part of their own geometry (split into one polygon per
// contiguous non-zero run — a zero-height segment was still part of the outline path,
// which made hover strokes look inconsistent where two streams' invisible zero stretches
// overlapped on the zero line).
const CHANGE_DAY0 = dayNum(PRESIDENCIES[0][0]);
const changeTodayNum = () => Math.floor(Date.now() / DAY_MS);

async function ensureChangeData() {
  if (!S.appointmentsAll) {
    S.appointmentsAll = await fetchJSON("data/appointments.json").catch(() => []);
  }
  if (!S.presidentPhotos) {
    S.presidentPhotos = await fetchJSON("data/president_photos.json").catch(() => ({}));
  }
}

function presIndexForDay(day) {
  let idx = 0;
  for (let i = 0; i < PRESIDENCIES.length; i++) {
    if (dayNum(PRESIDENCIES[i][0]) <= day) idx = i; else break;
  }
  return idx;
}

function buildStreamModel(courtId) {
  const rows = (S.appointmentsAll || []).filter((r) => r.court_id === courtId
    && r.commission_date
    && !(r.appointing_president || "").startsWith("None")      // statutory reorg rows, not real appointments
    && (r.president_party === "Republican" || r.president_party === "Democratic"));
  if (!rows.length) return null;

  // A recess appointee took the bench at the RECESS date (matches the beeswarm's convention:
  // that's the date FJC credits to the appointing president's term).
  const events = [];
  for (const r of rows) {
    const start = dayNum(r.recess_appointment_date || r.commission_date);
    const pIdx = presIndexForDay(start);
    events.push({ day: start, presIdx: pIdx, delta: 1 });
    // Still-sitting rows get NO end event: the graph's right edge is already "today", so an
    // open-ended contribution just reads correctly as "still there" without one.
    // SCOTUS quirk (CLAUDE.md §3): a retired justice remains an Article III judge but never
    // SITS again, unlike a circuit/district judge who keeps hearing cases as senior — so for
    // scotus rows, `senior_date` (when `termination_date` is blank, as it is for two FJC rows:
    // Kennedy/Breyer) IS the effective departure, not an "still contributing" transition the
    // way it would be for every other court. Getting this wrong double-counted both as still
    // sitting today, inflating the Court to 11 instead of 9 — caught via the model's own
    // "today's total" sanity check.
    const end = r.sitting !== "true"
      ? (r.termination_date || (r.court_id === "scotus" ? r.senior_date : null))
      : null;
    if (end) events.push({ day: dayNum(end), presIdx: pIdx, delta: -1 });
  }
  const activeIdxs = [...new Set(events.map((e) => e.presIdx))];
  if (!activeIdxs.length) return null;

  events.sort((a, b) => a.day - b.day);
  const todayNum = changeTodayNum();
  const counts = new Map(activeIdxs.map((i) => [i, 0]));
  const vertices = [{ day: CHANGE_DAY0, counts: Object.fromEntries(counts) }];
  let i = 0;
  while (i < events.length) {
    const day = events[i].day;
    while (i < events.length && events[i].day === day) {
      counts.set(events[i].presIdx, counts.get(events[i].presIdx) + events[i].delta);
      i++;
    }
    vertices.push({ day, counts: Object.fromEntries(counts) });
  }
  if (vertices[vertices.length - 1].day < todayNum) {
    vertices.push({ day: todayNum, counts: Object.fromEntries(counts) });
  }

  const partyOf = (idx) => PRESIDENCIES[idx][2];
  // Ascending index = ascending date = oldest term first = innermost (rank 0), per the flip.
  const rTerms = activeIdxs.filter((idx) => partyOf(idx) === "R").sort((a, b) => a - b);
  const dTerms = activeIdxs.filter((idx) => partyOf(idx) === "D").sort((a, b) => a - b);

  let maxCount = 1;
  for (const v of vertices) {
    const rTotal = rTerms.reduce((s, idx) => s + (v.counts[idx] || 0), 0);
    const dTotal = dTerms.reduce((s, idx) => s + (v.counts[idx] || 0), 0);
    maxCount = Math.max(maxCount, rTotal, dTotal);
  }

  // Trim the leading/trailing stretch where EVERY stream reads zero (e.g. 1969 up to this
  // court's first-ever tracked appointment) out of the visible x-axis (operator ask) — the
  // model keeps the true dayMin/dayMax (CHANGE_DAY0..today) for correctness (valueAt(), the
  // vertex sweep above), but the view only plots the range that actually has content.
  let viewDayMin = null, viewDayMax = CHANGE_DAY0;
  for (const v of vertices) {
    const total = Object.values(v.counts).reduce((s, n) => s + n, 0);
    if (total > 0) { if (viewDayMin == null) viewDayMin = v.day; viewDayMax = v.day; }
  }
  if (viewDayMin == null) { viewDayMin = CHANGE_DAY0; viewDayMax = todayNum; }

  return { vertices, rTerms, dTerms, maxCount, dayMin: CHANGE_DAY0, dayMax: todayNum, viewDayMin, viewDayMax };
}

function valueAt(vertices, day, presIdx) {
  let v = vertices[0];
  for (const cand of vertices) {
    if (cand.day > day) break;
    v = cand;
  }
  return v.counts[presIdx] || 0;
}

// ---- color schemes (operator A/B ask, session's tune-explainer-style comparison) ----
function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mixHex(a, b, t) {
  const [ar, ag, ab] = hexToRgb(a), [br, bg, bb] = hexToRgb(b);
  const m = (x, y) => Math.round(x + (y - x) * t);
  return `rgb(${m(ar, br)}, ${m(ag, bg)}, ${m(ab, bb)})`;
}
// 'alt': alternating vibrant/light shade per stream. 'fade': full-vibrant at the zero line,
// desaturating toward gray (capped at 75% of the way there, so the outermost term is still
// tinted) as streams get further from the zero line — rank 0 is now the OLDEST term
// (innermost), so "fade" now grays out toward the MOST RECENT term instead of the oldest.
function streamColor(party, rank, total, scheme) {
  const base = party === "R" ? "#d1343f" : "#2f6feb";
  if (scheme === "fade") {
    const t = total > 1 ? (rank / (total - 1)) * 0.75 : 0;
    return mixHex(base, "#9aa3ad", t);
  }
  const light = party === "R" ? "#e8737c" : "#7ea6f5";
  return rank % 2 === 0 ? base : light;
}

function renderStreamView(court, container) {
  const myCourt = court.court_id;
  container.innerHTML = "";
  const loading = el("div", "ctt-stream-loading");
  loading.textContent = "Loading appointment history…";
  container.append(loading);
  ensureChangeData().then(() => {
    // Stale guard: the user may have switched courts/modes while this fetch was in flight.
    if (S.selectedCourt !== myCourt || S.paneMode !== "change" || !container.isConnected) return;
    container.innerHTML = "";
    const model = buildStreamModel(myCourt);
    if (!model) {
      const empty = el("div", "ctt-stream-loading");
      empty.textContent = "No appointment history for this court (data begins 1969-01-20).";
      container.append(empty);
      return;
    }
    buildStreamSVG(container, model);
  });
}

function buildStreamSVG(container, model) {
  container.innerHTML = "";   // re-entrant: the color-scheme switch rebuilds via this same call
  const w = container.clientWidth || 640;
  const H = 360;
  const midY = H / 2;
  const x0 = 44, x1 = w - 16;
  const padTop = 26, padBottom = 46;
  const halfH = Math.min(midY - padTop, H - padBottom - midY);
  const pxPerJudge = halfH / model.maxCount;
  // The x-axis plots the TRIMMED (viewDayMin..viewDayMax) range, not the full 1969..today
  // domain — a leading/trailing stretch where every stream reads zero is excluded (operator
  // ask); model.dayMin/dayMax (the untrimmed range) stay around for valueAt() lookups.
  const span = model.viewDayMax - model.viewDayMin || 1;
  // Clamped to [x0, x1]: a polygon's taper vertex (buildHalf, item #8) can reference a day
  // BEFORE viewDayMin — the one zero-value vertex kept on the outside of a run for a clean
  // taper — and for any court whose real history starts after 1969 (Federal Circuit, CIT,
  // CFC, territorial courts: exactly the courts item #9's trim exists for), that day is
  // 1969 itself. Unclamped, that mapped to a large negative x, and the resulting sliver
  // (mostly clipped by the SVG's overflow, but not entirely) painted as a stray colored
  // shard in the left margin — undermining the very trim this axis is supposed to show.
  const xOf = (day) => Math.max(x0, Math.min(x1, x0 + ((day - model.viewDayMin) / span) * (x1 - x0)));
  const dayOf = (x) => model.viewDayMin + ((x - x0) / (x1 - x0)) * span;

  const head = el("div", "ctt-stream-head");
  const hint = el("div", "ctt-stream-hint");
  hint.textContent = "Drag (or click) the bar to see each president’s currently-serving appointees on this court.";
  const schemeWrap = el("div", "ctt-mode-switch ctt-stream-scheme", { role: "group", "aria-label": "Stream color scheme" });
  for (const [mode, text] of [["alt", "Alternating"], ["fade", "Fading"]]) {
    const b = el("button", "ctt-toggle ctt-mode-opt", { type: "button" });
    b.textContent = text;
    b.classList.toggle("ctt-is-active", S.streamColorScheme === mode);
    b.addEventListener("click", () => {
      if (S.streamColorScheme === mode) return;
      S.streamColorScheme = mode;
      buildStreamSVG(container, model);   // simplest correct redraw of the whole view
    });
    schemeWrap.append(b);
  }
  head.append(hint, schemeWrap);
  container.append(head);

  const svg = svgEl("svg", { class: "ctt-stream-svg", viewBox: `0 0 ${w} ${H}` });
  const iconLayer = el("div", "ctt-stream-icons");
  container.append(svg, iconLayer);

  // ---- presidency background bands (like the beeswarm: pastel R/D fill, dashed transition
  // lines, plain-text surname — no counts, no year ticks, this is just temporal orientation) --
  for (let i = 0; i < PRESIDENCIES.length; i++) {
    const [start, name, party] = PRESIDENCIES[i];
    const nextStart = i + 1 < PRESIDENCIES.length ? dayNum(PRESIDENCIES[i + 1][0]) : model.viewDayMax;
    const d0 = Math.max(dayNum(start), model.viewDayMin);
    const d1 = Math.min(nextStart, model.viewDayMax);
    if (d1 <= d0) continue;   // this term falls entirely outside the trimmed visible range
    const bx0 = xOf(d0), bx1 = xOf(d1);
    svg.append(svgEl("rect", { class: party === "R" ? "ctt-stream-band-rep" : "ctt-stream-band-dem",
      x: bx0, y: padTop, width: Math.max(0, bx1 - bx0), height: H - padTop - padBottom }));
    if (bx0 > x0 + 0.5) {
      svg.append(svgEl("line", { class: "ctt-stream-band-line", x1: bx0, y1: padTop, x2: bx0, y2: H - padBottom }));
    }
    const label = svgEl("text", { class: "ctt-stream-band-label", x: bx0 + 5, y: padTop + 13 });
    label.textContent = name.split(" ").pop();
    svg.append(label);
  }

  svg.append(svgEl("line", { class: "ctt-stream-zeroline", x1: x0, x2: x1, y1: midY, y2: midY }));

  // Per-slice step points (a "slice" is one contiguous non-zero run, see buildHalf) — holds
  // flat between consecutive vertices, no smoothing. Deliberately does NOT extend past the
  // slice's own last vertex: that used to always reach to model.dayMax, which is exactly the
  // zero-thickness geometry item #8 asked to remove.
  const stepPoints = (vertsSlice, valueFn) => {
    const pts = [];
    for (let i = 0; i < vertsSlice.length; i++) {
      const v = vertsSlice[i];
      const y = valueFn(v);
      pts.push([xOf(v.day), y]);
      if (i + 1 < vertsSlice.length) {
        const nextDay = vertsSlice[i + 1].day;
        if (nextDay !== v.day) pts.push([xOf(nextDay), y]);
      }
    }
    return pts;
  };

  const streamPolys = [];   // {node, rank, party, presIdx} — MULTIPLE entries can share a presIdx
  const setStreamHover = (presIdx) => {
    streamPolys.forEach((s) => {
      const hl = presIdx != null && s.presIdx === presIdx;
      s.node.classList.toggle("ctt-stream-hl", hl);
      // SVG has no z-index — paint order IS DOM order. Adjacent streams share an edge, and a
      // stroke draws centered ON the path (half into the neighbor), so a hovered polygon's
      // thicker highlight stroke could get PARTIALLY PAINTED OVER by a later-drawn neighbor's
      // fill at that shared boundary — the "outline gets disrupted by the adjacent polygon"
      // the operator saw. Move the hovered piece(s) to just before the bar group — front of
      // the OTHER polygons, but still under the bar/arrowheads so hovering never covers those.
      if (hl) svg.insertBefore(s.node, barG);
    });
    iconLayer.querySelectorAll(".ctt-stream-pres-icon").forEach((n) =>
      n.classList.toggle("ctt-stream-hl", presIdx != null && +n.dataset.presIdx === presIdx));
  };

  const buildHalf = (terms, sign, party) => {
    let lowerFn = () => 0;
    terms.forEach((presIdx, rank) => {
      const lower = lowerFn;
      const upper = (v) => lower(v) + (v.counts[presIdx] || 0);
      // Split into one polygon per contiguous non-zero run: a zero-thickness stretch must
      // never be part of a polygon's own geometry (invisible, but still an outline the hover
      // stroke traced — where two streams' zero stretches sat on the same zero-line pixels,
      // outlines looked inconsistent/disrupted). Each run keeps one zero-value vertex on
      // either side (where they exist) so the shape still tapers naturally to a point.
      const runs = [];
      let curStart = null;
      model.vertices.forEach((v, i) => {
        const has = (v.counts[presIdx] || 0) > 0;
        if (has && curStart == null) curStart = i;
        if (!has && curStart != null) { runs.push([curStart, i]); curStart = null; }
      });
      if (curStart != null) runs.push([curStart, model.vertices.length - 1]);

      runs.forEach(([s, e]) => {
        const slice = model.vertices.slice(Math.max(0, s - 1), Math.min(model.vertices.length - 1, e) + 1);
        if (slice.length < 2) return;
        const pts = stepPoints(slice, (v) => midY - sign * upper(v) * pxPerJudge)
          .concat(stepPoints(slice, (v) => midY - sign * lower(v) * pxPerJudge).reverse());
        const poly = svgEl("polygon", {
          class: "ctt-stream-poly", points: pts.map((p) => p.join(",")).join(" "),
          fill: streamColor(party, rank, terms.length, S.streamColorScheme),
        });
        poly.addEventListener("pointerenter", () => setStreamHover(presIdx));
        poly.addEventListener("pointerleave", () => setStreamHover(null));
        svg.append(poly);
        streamPolys.push({ node: poly, rank, party, presIdx });
      });
      lowerFn = upper;
    });
  };
  buildHalf(model.rTerms, 1, "R");    // R above the zero line
  buildHalf(model.dTerms, -1, "D");   // D below

  // Reveal animation: rank 0 (innermost, now the OLDEST term after the flip) first, staggered
  // outward per rank, fading in while sliding from further out.
  streamPolys.forEach(({ node, rank, party }) => {
    const dir = party === "R" ? -1 : 1;
    node.style.transform = `translateY(${dir * 26}px)`;
    node.style.opacity = "0";
    node.style.transitionDelay = `${rank * 90}ms`;
  });
  requestAnimationFrame(() => requestAnimationFrame(() => {
    streamPolys.forEach(({ node }) => { node.style.transform = ""; node.style.opacity = "1"; });
  }));

  // ---- draggable time bar + president icons/counts ------------------------------
  const barTop = padTop, barBottom = H - padBottom;
  const barG = svgEl("g", { class: "ctt-stream-bar" });
  const arrowW = 22, arrowH = 8;
  const HIT_HALF = 17;   // wide, symmetric grab target (item #3) — well past the 3px rect
  barG.append(
    svgEl("rect", { class: "ctt-stream-bar-rect", x: -1.5, y: barTop, width: 3, height: barBottom - barTop }),
    svgEl("polygon", { class: "ctt-stream-bar-arrow",
      points: `${-arrowW / 2},${barTop} ${arrowW / 2},${barTop} 0,${barTop + arrowH}` }),
    svgEl("polygon", { class: "ctt-stream-bar-arrow",
      points: `${-arrowW / 2},${barBottom} ${arrowW / 2},${barBottom} 0,${barBottom - arrowH}` }),
    svgEl("rect", { class: "ctt-stream-bar-hit", x: -HIT_HALF, y: barTop, width: HIT_HALF * 2, height: barBottom - barTop }),
  );
  svg.append(barG);

  const updateIcons = (day, x) => {
    const items = [];
    const collect = (terms, sign, party) => {
      let lower = 0;
      terms.forEach((presIdx) => {
        const value = valueAt(model.vertices, day, presIdx);
        const upper = lower + value;
        items.push({ presIdx, party, value, centerY: midY - sign * ((lower + upper) / 2) * pxPerJudge });
        lower = upper;
      });
    };
    collect(model.rTerms, 1, "R");
    collect(model.dTerms, -1, "D");

    // One shared buffer pass across BOTH parties (operator ask, item #6) — icons near the
    // zero line from opposite halves must bump each other too, not just within their own side.
    const ICON_H = 42, GAP = 5;
    const visible = items.filter((it) => it.value > 0).sort((a, b) => a.centerY - b.centerY);
    for (let i = 1; i < visible.length; i++) {
      const min = visible[i - 1].centerY + ICON_H + GAP;
      if (visible[i].centerY < min) visible[i].centerY = min;
    }

    iconLayer.innerHTML = "";
    for (const it of visible) {
      const node = el("div", "ctt-stream-pres-icon");
      node.dataset.presIdx = it.presIdx;
      // Anchored to the RIGHT edge of the group (translate(-100%,-50%) in CSS), sitting just
      // left of the bar rather than centered on it, however wide the name/number content
      // ends up being (operator ask, item #4: "moved more to the left").
      node.style.left = `${x - HIT_HALF - 16}px`;
      node.style.top = `${it.centerY}px`;
      const name = PRESIDENCIES[it.presIdx][1];
      const num = el("div", "ctt-stream-pres-num");
      num.textContent = String(it.value);
      const av = el("div", `ctt-stream-pres-avatar ${it.party === "R" ? "ctt-rep" : "ctt-dem"}`);
      const photo = (S.presidentPhotos || {})[name];
      const src = photo?.photo_thumb ? resolve(photo.photo_thumb) : photo?.photo_url;
      if (src) {
        const img = el("img", null, { src, alt: name, loading: "lazy" });
        img.addEventListener("error", () => { img.remove(); av.textContent = initials({ full_name: name }); });
        av.append(img);
      } else {
        av.textContent = initials({ full_name: name });
      }
      node.append(num, av);   // number on the LEFT of the icon (operator ask, item #4)
      node.addEventListener("pointerenter", () => setStreamHover(it.presIdx));
      node.addEventListener("pointerleave", () => setStreamHover(null));
      node.title = `${name}: ${it.value} currently serving on this court, as of ${isoOfDayNum(day)}`;
      iconLayer.append(node);
    }
  };

  let barDay = model.viewDayMin;
  const setBarX = (x) => {
    x = Math.max(x0, Math.min(x1, x));
    barG.setAttribute("transform", `translate(${x}, 0)`);
    barDay = Math.round(dayOf(x));
    updateIcons(barDay, x);
  };
  const svgX = (clientX) => {
    const rect = svg.getBoundingClientRect();
    return rect.width ? ((clientX - rect.left) / rect.width) * w : x0;
  };
  let dragging = false;
  const hitRect = barG.querySelector(".ctt-stream-bar-hit");
  hitRect.addEventListener("pointerdown", (e) => {
    dragging = true;
    hitRect.setPointerCapture?.(e.pointerId);   // absent in some embed hosts/older WebViews
    setBarX(svgX(e.clientX));
    e.preventDefault();
  });
  hitRect.addEventListener("pointermove", (e) => { if (dragging) setBarX(svgX(e.clientX)); });
  hitRect.addEventListener("pointerup", () => { dragging = false; });
  hitRect.addEventListener("pointercancel", () => { dragging = false; });
  // Clicking ANYWHERE in the streamgraph (a band, a stream, empty space) snaps the bar there
  // too (operator ask, item #3) — dragging the hit rect itself already moved it on pointerdown,
  // so skip re-handling that specific click to avoid a redundant (harmless but pointless) call.
  svg.addEventListener("click", (e) => { if (e.target !== hitRect) setBarX(svgX(e.clientX)); });

  setBarX(x0);   // "set at the beginning of the graph view" (now the trimmed left edge)
}

// ---- drill-in / out (zoom + crossfade; documented morph fallback) -------------
// ---- seat blocks (map annotation) ---------------------------------------------
// One small square per authorized judgeship, grouped by appointing party with vacancies last,
// parked next to the court it belongs to. Circuits show on the national view, districts on
// their circuit-local view — each court's block appears in exactly one map.
//
// Squares fill top->bottom in columns of 5, then left->right:
//    n=6 -> col0 rows0-4, col1 row0      n=11 -> [5,5,1]
// so seat i sits at (col = i/5, row = i%5).
//
// POSITION is in map units (the layer sits OUTSIDE the Y-flip group — squares would survive a
// mirror, but the "1st"/"DC" labels would not), so a block stays glued to its court.
// SIZE is NOT: squares hold a constant on-screen size instead. The national and circuit-local
// projections differ ~4x in scale, so a map-unit size renders the same block far larger after a
// drill-in, swamping the districts. The edge is therefore converted from px through the SVG's
// live scale, which also means a resize has to re-render (see refreshSeatBlocks).
const BLOCK_ROWS = 5;
const LABEL_EM = 10;                    // label font-size inside its scaled <g> (see below)
// Optical left-alignment for "1"-leading labels ("1st"/"10th"/"11th").
//
// This is NOT a side-bearing problem, which is why measuring bearings failed. Rasterised at 10px,
// the ink of every label starts within 0.3-0.9px of the origin — "Fed" (0.9) and "DC" (0.8) start
// FURTHEST right and look perfectly aligned. The difference is where each glyph's VISUAL MASS is:
//   8th  ink 0.3, stem 0.8   DC  ink 0.8, stem 0.8   Fed  ink 0.9, stem 0.9   <- ink == mass
//   1st  ink 0.6, stem 2.6                                                    <- 2px apart
// "1" puts a thin flag tip at 0.6 and its stem — what the eye aligns to — at 2.6, so it reads as
// indented while its box is exactly left-aligned. Aligning by ink would shift Fed/DC LEFT and
// break the ones that already look right; only the "1" needs the nudge.
const ONE_NUDGE_EM = 1.4;                // in LABEL_EM units (~0.14em), an optical judgement
const BLOCK_GAP = 0.30;                 // gap between squares, as a fraction of the square edge
const BLOCK_PX = 6.5;                   // square edge in CSS px, identical in every view
// How far the vacancy rect is pulled in, so its outline reads the same size as a party square.
//
// There is no exact answer: a party square's white stroke is 85% OPAQUE, so its colour does not
// end at a line — measured at 8x, solid blue runs to 977.75 and fades out through 978.5. That
// gives two defensible bounds, and both were tried and rejected by eye:
//   0.4 (= half its own stroke)  -> outline matches the party BOX edge      -> reads too big
//   0.7 (+ half the party stroke) -> outline matches the SOLID-colour edge  -> reads too small
// So: the midpoint, which lands the outline inside the party square's fade. Tune here.
const VACANCY_INSET_PX = 0.55;
// Hover/selected square enlargement (operator-tuned in session (q)). Applied by
// animateBlockScale() as per-frame INLINE transforms, deliberately not a CSS transition:
// a transform transition on an SVG rect cannot run on the compositor, and Chrome's
// promotion attempt at animation start/end re-rendered hairline strokes across the WHOLE
// map for the 90ms window — the border "flicker/tremble" the operator reported. Plain
// style writes create no Animation object, so the repaint stays local to the block.
// Cap is 1.30 (= pitch/edge, where neighbours' edges touch) — asserted in tests/smoke.mjs.
const BLOCK_SCALE_HOVER = 1.17;
const BLOCK_SCALE_SELECTED = 1.24;
const BLOCK_SCALE_MS = 90;
// Used only where layout is unavailable (headless/jsdom), which reports 0 for every box.
const NOMINAL_MAP_PX = 900;
const LAYER_PAD = 12;                   // must match .ctt-svg-layer's padding
// Labels for the Federal Circuit's feeder blocks (visible only in the feeder view).
const FEEDER_LABEL = { cit: "CIT", uscfc: "CFC" };
const CIRCUIT_LABEL = {
  ca1: "1st", ca2: "2nd", ca3: "3rd", ca4: "4th", ca5: "5th", ca6: "6th",
  ca7: "7th", ca8: "8th", ca9: "9th", ca10: "10th", ca11: "11th", cadc: "DC", cafc: "Fed",
};

/** Square classes in draw order: grouped by colour, vacancies last (they have no appointment
 *  date to order by, so they belong at the end rather than interleaved). */
function seatSquares(b) {
  const out = [];
  for (let i = 0; i < b.r; i++) out.push("ctt-sq-rep");
  for (let i = 0; i < b.o; i++) out.push("ctt-sq-other");
  for (let i = 0; i < b.d; i++) out.push("ctt-sq-dem");
  for (let i = 0; i < b.vacancies; i++) out.push("ctt-sq-vacant");
  return out;
}

/** Default anchor: centre of the biggest part of the shape. Whole-shape bbox centres drift
 *  badly for circuits with far-flung islands, and this is what the operator tunes from. */
function shapeAnchor(svg, courtId, level) {
  const sel = level === "circuit"
    ? `path[data-court-id="${CSS.escape(courtId)}"][data-layer="circuit"]:not([data-inset])`
    : `path[data-court-id="${CSS.escape(courtId)}"]`;
  const p = svg.querySelector(sel) || svg.querySelector(`path[data-court-id="${CSS.escape(courtId)}"]`);
  if (!p) return null;
  const subs = parsePathAbs(p.getAttribute("d"));
  if (!subs) return null;
  let best = null, bestArea = -1;
  for (const s of subs) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < s.length; i += 2) {
      if (s[i] < x0) x0 = s[i];
      if (s[i] > x1) x1 = s[i];
      if (s[i + 1] < y0) y0 = s[i + 1];
      if (s[i + 1] > y1) y1 = s[i + 1];
    }
    const area = (x1 - x0) * (y1 - y0);
    if (area > bestArea) { bestArea = area; best = [(x0 + x1) / 2, (y0 + y1) / 2]; }
  }
  return best;
}

/** Re-render every live block layer at the current scale, and drop the cached morph plans:
 *  they carry cloned block groups sized for the old viewport. */
function refreshSeatBlocks() {
  if (!S.seatBlocks || !S.ui) return;
  if (S.ui.nationalSVG) {
    renderSeatBlocks(S.ui.nationalSVG, "circuit");
    if (S.view === "circuit" && S.activeCircuit === "cafc") renderSeatBlocks(S.ui.nationalSVG, "feeder");
  }
  for (const [circ, svg] of S.localSVGCache) renderSeatBlocks(svg, "district", circ);
  S.morphPlans.clear();
}

/** Rendered width of this map in CSS px.
 *
 *  Derived from the CONTAINER, never from the svg's own box: an idle layer is display:none (it
 *  must be — see the CSS — or every visited circuit keeps rasterising), and
 *  getBoundingClientRect() on it reports 0. Measuring the svg made blocks silently fall back to
 *  NOMINAL_MAP_PX and render ~2x too small in circuit view. This reproduces the letterbox that
 *  `max-width/max-height: 100%` + aspect-ratio produce, without needing the layer to be visible.
 */
function renderedMapWidth(svg) {
  const [, , vw, vh] = viewBoxOf(svg);
  const stack = S.ui && S.ui.svgStack;
  const cw = (stack ? stack.clientWidth : 0) - LAYER_PAD * 2;
  const ch = (stack ? stack.clientHeight : 0) - LAYER_PAD * 2;
  if (!(cw > 0 && ch > 0 && vw > 0 && vh > 0)) return NOMINAL_MAP_PX;   // no layout (headless)
  return vw * Math.min(cw / vw, ch / vh);
}

/** Build the <g> of blocks for one SVG. level='circuit' on national, 'district' on a local. */
function renderSeatBlocks(svg, level, circuitId) {
  // Idempotent PER LEVEL: the feeder blocks render into the national svg alongside the
  // circuit blocks, so only the same level's previous group may be swept.
  svg.querySelectorAll(`.ctt-blocks[data-level="${level}"]`).forEach((n) => n.remove());
  if (!S.seatBlocks) return null;
  const g = document.createElementNS(SVGNS, "g");
  g.setAttribute("class", "ctt-blocks");
  g.setAttribute("data-level", level);
  const [, , vw] = viewBoxOf(svg);
  const k = flipConst(svg);
  // px -> map units through the SVG's own rendered scale, so the square edge is the same on
  // screen in the national and circuit-local views (and after a resize).
  const unitsPerPx = vw / renderedMapWidth(svg);

  for (const [cid, b] of Object.entries(S.seatBlocks)) {
    if (b.level !== level) continue;
    if (level === "district" && b.parent_id !== circuitId) continue;
    if (!b.total) continue;
    let anchor = b.anchor || shapeAnchor(svg, cid, level);
    if (!anchor && level === "feeder") {
      // Default: below the Fed block, CIT left / CFC right, in screen-px converted to units.
      const fed = S.seatBlocks.cafc && S.seatBlocks.cafc.anchor;
      if (fed) anchor = [fed[0] + (cid === "cit" ? -34 : 34) * unitsPerPx,
                         fed[1] - 52 * unitsPerPx];
    }
    if (!anchor) continue;                       // no geometry AND no tuned anchor -> skip
    const e = (b.size || BLOCK_PX) * unitsPerPx;
    const pitch = e * (1 + BLOCK_GAP);
    const squares = seatSquares(b);
    const cols = Math.ceil(squares.length / BLOCK_ROWS);
    const wide = cols * pitch - (pitch - e);
    const tall = Math.min(squares.length, BLOCK_ROWS) * pitch - (pitch - e);
    // anchor is the block's centre, in raw projected units; the layer is outside the Y-flip
    // group, so convert the geographic-Y-up anchor to screen-Y-down here.
    const x0 = anchor[0] - wide / 2;
    const y0 = (k - anchor[1]) - tall / 2;

    const blk = document.createElementNS(SVGNS, "g");
    blk.setAttribute("class", "ctt-block");
    blk.setAttribute("data-court-id", cid);
    blk._anchor = anchor;   // effective anchor incl. computed defaults — read by the tuner
    // One invisible, buffered hit rect per block — first child, so it sits behind the squares.
    // Without it the mouse falls THROUGH the gaps between squares onto the map underneath and the
    // hover flickers as you cross a block. It also has to reach above the squares to cover the
    // label, and out past them: several blocks (Fed, 2nd, DC, 1st) sit partly or wholly off their
    // own circuit's geometry, and cafc has no geometry at all — its block is its only map presence.
    const labelled = (level === "circuit" && CIRCUIT_LABEL[cid]) || (level === "feeder" && FEEDER_LABEL[cid]);
    const m = e * 0.6;                                   // buffer, in map units
    const top = labelled ? y0 - e * 0.45 - e * 1.9 : y0 - m;
    const hit = document.createElementNS(SVGNS, "rect");
    hit.setAttribute("class", "ctt-block-hit");
    hit.setAttribute("x", x0 - m);
    hit.setAttribute("y", top - m * 0.5);
    hit.setAttribute("width", Math.max(wide, labelled ? e * 3.2 : 0) + 2 * m);
    hit.setAttribute("height", (y0 + tall + m) - (top - m * 0.5));
    blk.append(hit);
    squares.forEach((cls, i) => {
      const rect = document.createElementNS(SVGNS, "rect");
      rect.setAttribute("class", `ctt-sq ${cls}`);
      // Inset by half its own stroke so the outline's OUTER edge lands on the party squares' box
      // edge — same dimensions. (A stroke straddles the edge, so an un-inset one would bulge out.)
      // It scales with the squares (same transform), so it holds on hover too.
      const inset = cls === "ctt-sq-vacant" ? VACANCY_INSET_PX * unitsPerPx : 0;
      rect.setAttribute("x", x0 + Math.floor(i / BLOCK_ROWS) * pitch + inset);
      rect.setAttribute("y", y0 + (i % BLOCK_ROWS) * pitch + inset);
      rect.setAttribute("width", e - 2 * inset);
      rect.setAttribute("height", e - 2 * inset);
      blk.append(rect);
    });
    // Circuits only — district names are far too long to sit over a block.
    // The label rides in a scaled <g> rather than carrying a map-unit font-size directly:
    // these viewBoxes are millions of units across, and browsers CLAMP font-size at 10000px
    // (measured in Chrome), which silently renders the text as a ~2px smudge. Keep the font
    // small and let the transform do the scaling.
    const labelText = level === "circuit" ? CIRCUIT_LABEL[cid] : level === "feeder" ? FEEDER_LABEL[cid] : null;
    if (labelText) {
      const scale = (e * 1.9) / LABEL_EM;
      const tg = document.createElementNS(SVGNS, "g");
      // left-aligned to the block's left edge (x0), not centred on the anchor
      tg.setAttribute("transform", `translate(${x0} ${y0 - e * 0.45}) scale(${scale})`);
      const t = document.createElementNS(SVGNS, "text");
      t.setAttribute("class", "ctt-block-label");
      t.setAttribute("font-size", LABEL_EM);
      t.textContent = labelText;
      tg.append(t);
      blk.append(tg);
    }
    g.append(blk);
  }
  svg.append(g);            // after the flip group => painted on top of the map
  alignLabels(g);           // needs the nodes in the tree: getBBox only works once rendered
  wireBlockEvents(svg, g);
  return g;
}

/** Pull "1"-leading labels left so their stem lines up with where other glyphs' edges sit. */
function alignLabels(g) {
  g.querySelectorAll(".ctt-block-label").forEach((t) => {
    t.setAttribute("x", /^1/.test(t.textContent) ? String(-ONE_NUDGE_EM) : "0");
  });
}

/** Blocks behave exactly like their court's shape: same tooltip, same shape outline, same
 *  selection. cafc has no shape, so its block is the only way to reach it on the map.
 *  Scope: ONLY the group just built. Wiring svg-wide re-listened the OTHER level's
 *  untouched blocks whenever a second level rendered into the same svg (the feeder view
 *  adds CIT/CFC beside the circuit blocks) — a doubled click listener runs selectCourt
 *  twice, and the deselect-toggle makes the pane open and instantly close again, which
 *  reads as "the block stopped being clickable" (operator report, 2026-07-19). */
function wireBlockEvents(svg, group) {
  const overlay = svg._overlay;
  const tooltip = S.ui.tooltip;
  group.querySelectorAll(".ctt-block").forEach((blk) => {
    const cid = blk.getAttribute("data-court-id");
    const court = S.courts.get(cid);
    const shape = svg.querySelector(`path[data-court-id="${CSS.escape(cid)}"][data-layer]`);
    blk.addEventListener("mouseenter", () => {
      if (shape && overlay) {
        overlay.setAttribute("d", overlayPathFor(shape, svg));
        overlay.style.visibility = "visible";
      }
      tooltip.textContent = court ? (court.short_name || court.court_name) : cid;
      tooltip.style.visibility = "visible";
      highlightBlock(svg, cid, "ctt-block-hover");
    });
    blk.addEventListener("mousemove", (e) => positionTooltip(e));
    blk.addEventListener("mouseleave", () => {
      if (overlay) overlay.style.visibility = "hidden";
      tooltip.style.visibility = "hidden";
      highlightBlock(svg, null, "ctt-block-hover");
    });
    blk.addEventListener("click", () => selectCourt(cid));
  });
}

// ---- vertex morph (national <-> circuit-local) --------------------------------
// The contract (docs/GEOMETRY_CONTRACT.md) guarantees each MAINLAND district is exported
// twice from one simplification, so its national and circuit-local paths share vertex count
// and order. That lets us interpolate point-by-point instead of cross-dissolving.
//
// Both files carry their own `scale(1,-1) translate(...)` Y-flip, which would fight a shared
// interpolation, so the morph layer bakes the flip INTO the coordinates and runs with no group
// transform. Then t=0 reproduces the national layer exactly and t=1 the local layer exactly,
// with the viewBox (and the element's aspect-ratio, which sizes the letterbox) animating too.
//
// Insets are exempt by contract and simply fade. Any pairing that fails the invariant falls
// back to the documented zoom+crossfade, and logs which circuit fell back.

function parsePathAbs(d) {
  // Absolute M/L only, per the path conventions. Anything else -> null -> fallback.
  const subs = [];
  let cur = null;
  const re = /([A-Za-z])([^A-Za-z]*)/g;
  let m;
  while ((m = re.exec(d || ""))) {
    const cmd = m[1];
    if (cmd === "Z" || cmd === "z") continue;
    if (cmd !== "M" && cmd !== "L") return null;
    const nums = m[2].match(/-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/g);
    if (!nums) continue;
    if (cmd === "M") { cur = []; subs.push(cur); }
    if (!cur || nums.length % 2) return null;
    for (let i = 0; i < nums.length; i++) cur.push(+nums[i]);
  }
  return subs.length ? subs.map((a) => Float64Array.from(a)) : null;
}
function sameStructure(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i].length !== b[i].length) return false;
  return true;
}
function flipY(subs, k) {           // bake the file's Y-flip into the points
  for (const s of subs) for (let i = 1; i < s.length; i += 2) s[i] = k - s[i];
  return subs;
}
function serialize(subs) {
  let out = "";
  for (const s of subs) {
    out += "M" + Math.round(s[0]) + " " + Math.round(s[1]);
    for (let i = 2; i < s.length; i += 2) out += "L" + Math.round(s[i]) + " " + Math.round(s[i + 1]);
  }
  return out;
}
function viewBoxOf(svg) {
  return (svg.getAttribute("viewBox") || "").split(/[\s,]+/).map(Number);
}
// The flip constant is -(minY+maxY) from the ORIGINAL viewBox; injectSVG pads symmetrically,
// which provably leaves 2*vy+vh unchanged, so reading the padded viewBox is safe.
function flipConst(svg) {
  const [, vy, , vh] = viewBoxOf(svg);
  return 2 * vy + vh;
}
function pathKey(p) {
  const outline = p.getAttribute("data-outline-for");
  if (outline) return "outline:" + outline;
  const cid = p.getAttribute("data-court-id");
  return cid ? "shape:" + cid : null;
}
const isInset = (p) => p.getAttribute("data-inset") === "true";
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches : false;
const MORPH_MS = 620;
// Cap the morph's COMMIT rate (writes per second), independent of display refresh.
// On a high-refresh display the rAF loop otherwise pushes a full-map repaint commit every
// vsync (144/s on the operator's monitor); combined with a high-rate mouse (1000Hz) forcing
// input-aligned BeginMainFrames, Chrome's commit→draw pipeline convoys until the renderer's
// Compositor thread spins at 100% inside one LayerTreeHostImpl::CalculateRenderPasses and
// the page freezes for seconds-to-forever. Measured (tests/freeze-hunt.mjs, maximized +
// 500Hz storm): uncapped froze hard at cycle 0 every run; capped at ≥16ms/commit survived
// 30-cycle runs repeatedly with no freeze. 16 is a no-op on a 60Hz display (frames arrive
// every 16.7ms) and lands ~48-72fps on 120-144Hz ones.
const MORPH_MIN_COMMIT_MS = 16;

/** Pair every national path with its circuit-local twin. Returns null (=> caller falls back
 *  to zoom+crossfade) if anything that ought to morph fails the invariant. */
function buildMorphPlan(circuitId, local) {
  const nat = S.ui.nationalSVG;
  const natG = nat.querySelector("g");
  const locG = local.querySelector("g");
  if (!natG || !locG) return null;
  const kNat = flipConst(nat);
  const kLoc = flipConst(local);

  const locByKey = new Map();
  for (const p of locG.querySelectorAll("path")) {
    const k = pathKey(p);
    if (k) locByKey.set(k, p);
  }

  const svg = document.createElementNS(SVGNS, "svg");
  const vbStart = viewBoxOf(nat);
  const vbEnd = viewBoxOf(local);
  svg.setAttribute("viewBox", vbStart.join(" "));
  svg.style.aspectRatio = `${vbStart[2]} / ${vbStart[3]}`;

  // Fading elements are grouped so the OPACITY LIVES ON THE GROUP. Opacity < 1 forces the
  // renderer to composite that element through its own transparency layer — an offscreen buffer
  // the size of its bounds. Fading ~95 paths individually meant ~95 such buffers every single
  // morph, several of them a third of the map wide. Four groups = four.
  //
  // Paint order is load-bearing and cost a pixel-diff regression to get right: seat blocks must
  // stay ABOVE every shape (they sit on top in both real layers, and circuit fills are opaque),
  // and the morphing shapes must sit above the outgoing map. Target and non-target shapes cover
  // disjoint ground, so grouping them apart is invisible.
  const mkG = (cls) => { const g = document.createElementNS(SVGNS, "g"); if (cls) g.setAttribute("class", cls); return g; };
  const shapesOut = mkG("ctt-morph-fade");     // the outgoing map (everything with no twin)
  const shapesMorph = mkG(null);               // the shapes actually interpolating — always opaque
  const shapesIn = mkG("ctt-morph-fade-in");   // incoming-only shapes (a circuit's own insets)
  const blocksOut = mkG("ctt-morph-fade");     // national seat blocks, on top
  const blocksIn = mkG("ctt-morph-fade-in");   // circuit-local seat blocks, on top
  svg.append(shapesOut, shapesMorph, shapesIn, blocksOut, blocksIn);
  const fadeOutEls = [shapesOut, blocksOut], fadeInEls = [shapesIn, blocksIn];

  const pairs = [];
  let morphing = 0;
  for (const p of natG.querySelectorAll("path")) {
    if (p.classList.contains("ctt-hover-overlay")) continue;
    const start = parsePathAbs(p.getAttribute("d"));
    if (!start) return null;                       // non-M/L data: can't morph safely
    flipY(start, kNat);

    const node = p.cloneNode(false);
    node.removeAttribute("id");                    // ids stay unique to the real layers
    node.classList.remove("ctt-shape-selected");

    let end = null;
    const twin = locByKey.get(pathKey(p));
    if (twin && !isInset(p)) {
      const local = parsePathAbs(twin.getAttribute("d"));
      if (!sameStructure(start, local)) return null;         // invariant broken -> fall back
      end = flipY(local, kLoc);
      morphing++;
    }
    node.setAttribute("d", serialize(start));
    (end ? shapesMorph : shapesOut).append(node);   // no twin -> it belongs to the outgoing map
    pairs.push({ node, start, end, work: end ? start.map((s) => Float64Array.from(s)) : null });

    // An inset lives in a different box in each file and is exempt from the vertex morph, so
    // it can't travel — but letting it merely fade out would pop the local copy in at the
    // handoff (AK+HI = ~5% of the map on ca9). Crossfade to the local placement instead.
    if (twin && isInset(p)) {
      const localInset = parsePathAbs(twin.getAttribute("d"));
      if (localInset) {
        const inNode = twin.cloneNode(false);
        inNode.removeAttribute("id");
        inNode.setAttribute("d", serialize(flipY(localInset, kLoc)));
        shapesIn.append(inNode);
      }
    }
  }
  // Nothing to interpolate (e.g. cadc, whose only district is an inset callout) -> crossfade.
  if (!morphing) return null;

  // Seat blocks belong to exactly one view (circuits national, districts local), so they can't
  // travel either — crossfade them like insets rather than letting them blink out and pop back.
  // They ride the interpolating viewBox, so each set stays glued to its own map while it fades.
  for (const [src, into] of [[nat, blocksOut], [local, blocksIn]]) {
    const blocks = src.querySelector(".ctt-blocks");
    if (blocks) into.append(blocks.cloneNode(true));
  }

  const layer = el("div", "ctt-svg-layer ctt-morph-layer");
  layer.append(svg);
  return { layer, svg, pairs, vbStart, vbEnd, fadeOutEls, fadeInEls };
}

// One clock. requestAnimationFrame's own timestamp is deliberately ignored: shims commonly
// call the callback with no argument, and falling back to Date.now() there would mix an
// epoch-based reading with a performance.now() start and finish the morph in one frame.
const nowMs = () =>
  (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now());

/** Stop an in-flight morph and settle its promise as "cancelled".
 *
 *  Cancelling the rAF alone leaves the promise pending forever, so the drillIn/drillOut
 *  awaiting it stays suspended for the life of the page. That is a (small, bounded) leak of
 *  async frames rather than the visible bug — attachMorphLayer is what actually reclaims the
 *  stranded DOM. Measured: settling without the sweep still strands layers; the sweep alone
 *  does not. Keep both — this one gives the cancelled caller a defined exit.
 */
function cancelMorph() {
  if (S.morphCancel) S.morphCancel();
}

/** Opacity straight onto the (few) fade groups. Compositor-only work: no style invalidation of
 *  the subtree, no repaint of the shapes that are merely fading. */
function setFades(plan, u) {
  for (const n of plan.fadeOutEls) n.style.opacity = String(1 - u);
  for (const n of plan.fadeInEls) n.style.opacity = String(u);
}

/** Animate the plan from u=0 (national) to u=1 (local), or the reverse.
 *  Resolves "done" if it ran to the end, or "cancelled" if a newer transition took over —
 *  the caller must not touch shared layer state in the cancelled case. */
function runMorph(plan, forward) {
  cancelMorph();
  return new Promise((resolve) => {
    const settle = (how) => {
      // only the cancel path has a frame still queued; on "done" that frame just ran
      if (how === "cancelled" && S.morphRAF) cancelAnimationFrame(S.morphRAF);
      S.morphRAF = null;
      S.morphCancel = null;
      resolve(how);
    };
    S.morphCancel = () => settle("cancelled");
    const dur = reducedMotion() ? 0 : MORPH_MS;
    const t0 = nowMs();
    let lastCommit = -Infinity;
    const frame = () => {
      const elapsed = nowMs() - t0;
      // Hard stop: a clock that never advances (or any state I haven't foreseen) must not be
      // able to keep this loop alive forever. Past 5x the duration, land on the end state.
      if (elapsed > MORPH_MS * 5) { setFades(plan, forward ? 1 : 0); settle("done"); return; }
      const t = dur > 0 ? Math.min(1, elapsed / dur) : 1;
      // Commit-rate cap (see MORPH_MIN_COMMIT_MS): skip this vsync tick entirely — no DOM
      // writes — when the last committed frame is too recent. The final frame (t=1) always
      // commits so the end state is exact. A frozen clock (visual.html?t=) commits once,
      // then skips: same pixels either way.
      if (t < 1 && elapsed - lastCommit < MORPH_MIN_COMMIT_MS) {
        S.morphRAF = requestAnimationFrame(frame);
        return;
      }
      lastCommit = elapsed;
      const u = forward ? easeInOut(t) : 1 - easeInOut(t);
      for (const pr of plan.pairs) {
        if (!pr.end) continue;
        for (let s = 0; s < pr.start.length; s++) {
          const a = pr.start[s], b = pr.end[s], o = pr.work[s];
          for (let i = 0; i < a.length; i++) o[i] = a[i] + (b[i] - a[i]) * u;
        }
        pr.node.setAttribute("d", serialize(pr.work));
      }
      const vb = plan.vbStart.map((v, i) => v + (plan.vbEnd[i] - v) * u);
      plan.svg.setAttribute("viewBox", vb.join(" "));
      // aspect-ratio drives the letterbox; without it the handoff to the local layer jumps
      plan.svg.style.aspectRatio = `${vb[2]} / ${vb[3]}`;
      setFades(plan, u);
      if (t < 1) S.morphRAF = requestAnimationFrame(frame);
      else settle("done");
    };
    S.morphRAF = requestAnimationFrame(frame);
  });
}

/** Attach this morph's layer and drop any OTHER circuit's stale one.
 *
 *  This is the fix for the reported freeze. Each circuit caches one morph-layer node, so
 *  re-drilling the same circuit merely re-appends it — harmless. But when a drill-out morph is
 *  interrupted by a drill-in of a DIFFERENT circuit, the first circuit's layer (a whole
 *  ~43k-vertex map) is left attached with nothing to remove it: the cancelled caller returns
 *  early by design, and the new caller only ever removes its own. They pile up until every
 *  later morph repaints several dead maps per frame — CPU pinned, page unresponsive.
 *  Sweeping here bounds the count at one however hard drill-in/back is mashed.
 *  Regression-tested in tests/smoke.mjs (alternating circuits) and tests/stress.mjs.
 */
function attachMorphLayer(layer) {
  S.ui.svgStack.querySelectorAll(".ctt-morph-layer").forEach((n) => { if (n !== layer) n.remove(); });
  if (layer) S.ui.svgStack.append(layer);
}

/** Inject a circuit's local layer exactly once, even under concurrent drills.
 *
 *  The cache check and the cache write used to sit either side of `await fetchText(...)`, so a
 *  double-click on "View districts" raced through the gap and every click injected its own
 *  layer — each a full SVG map with its own wired listeners, orphaned and attached forever
 *  (measured: one triple-click left 3 ca8 layers). Dedupe on the in-flight promise, not on the
 *  finished value, so concurrent callers all await the same injection.
 */
function ensureLocalLayer(circuitId) {
  if (S.localSVGCache.has(circuitId)) return Promise.resolve(S.localSVGCache.get(circuitId));
  if (!S.localPending.has(circuitId)) {
    const path = S.manifest.files?.geo?.circuits?.[circuitId];
    if (!path) return Promise.resolve(null);
    S.localPending.set(circuitId, (async () => {
      const svg = injectSVG(S.ui.svgStack, await fetchText(path));
      svg.parentElement.classList.add("ctt-local-layer", "ctt-hidden");
      S.localSVGCache.set(circuitId, svg);
      await loadJudges(circuitId);
      wireShapeEvents(svg, { onSelect: (cid) => selectCourt(cid), national: false });
      renderSeatBlocks(svg, "district", circuitId);
      S.localPending.delete(circuitId);
      return svg;
    })().catch((e) => { S.localPending.delete(circuitId); throw e; }));
  }
  return S.localPending.get(circuitId);
}

// Only the cafc feeder view (cit/uscfc) needs the taller pane - checked visually 2026-07-16:
// gud/nmid/vid's always-visible note wraps to a single line at desktop widths, so ca9/ca3 don't
// need it (removed after initially including them). The taller height must still be set ONCE
// per drill-context, not per court selection, or switching between (say) a plain ca9 district
// and gud would itself flicker-resize the pane on every click, which is exactly what this
// exists to prevent.
const TALL_PANE_CONTEXTS = new Set(["cafc"]);
function setPaneTallness(circuitId) {
  S.ui.pane.classList.toggle("ctt-pane--tall", TALL_PANE_CONTEXTS.has(circuitId));
}

async function drillIn(circuitId) {
  // Already showing this circuit's districts. The pane still offers "View districts" (you can
  // re-select the circuit from the selector while drilled in), and without this guard that
  // replayed the whole national->local morph ON TOP of the district map you were already
  // looking at. Just close the pane; there is nowhere to travel to.
  if (S.view === "circuit" && S.activeCircuit === circuitId) {
    togglePane(false);
    return;
  }
  if (circuitId === "cafc") {                 // Federal Circuit: selector repopulation, no map
    cancelMorph();
    attachMorphLayer(null);
    S.view = "circuit"; S.activeCircuit = "cafc";
    updateDistrictOverlayVisibility();   // full assembly never follows into a drill-in
    setPaneTallness("cafc");
    renderSelector();
    togglePane(false);
    // The feeders appear ON the map for this view only: two labelled block arrays (CIT, CFC)
    // parked below the Fed block; drillOut sweeps them.
    if (S.ui.nationalSVG) renderSeatBlocks(S.ui.nationalSVG, "feeder");
    return;
  }
  const local = await ensureLocalLayer(circuitId);
  if (!local) return;
  S.view = "circuit"; S.activeCircuit = circuitId;
  updateDistrictOverlayVisibility();   // full assembly never follows into a drill-in
  renderDistrictSubassembly(circuitId);
  setPaneTallness(circuitId);
  togglePane(false);
  // Drop the circuit's map highlight before animating: the pane is closing, the circuit-local
  // view never highlights the circuit, and leaving it on would make the morph's first frame
  // disagree with the national layer it is supposed to replace seamlessly.
  clearShapeHighlight();
  renderSelector();

  const plan = morphPlanFor(circuitId, local);
  if (!plan) {                                 // documented fallback: zoom + crossfade
    cancelMorph();                             // an in-flight morph must not keep painting
    attachMorphLayer(null);
    S.ui.nationalSVG.parentElement.classList.remove("ctt-hidden-hard");
    S.ui.nationalSVG.parentElement.classList.add("ctt-fade-out");
    local.parentElement.classList.remove("ctt-hidden");
    local.parentElement.classList.add("ctt-fading");   // display it so opacity can transition
    requestAnimationFrame(() => local.parentElement.classList.add("ctt-fade-in"));
    return;
  }
  // Morph on its own layer: national and local both hidden until the handoff, so the only
  // thing on screen is the interpolation. t=0 and t=1 render identically to those layers.
  attachMorphLayer(plan.layer);
  S.ui.nationalSVG.parentElement.classList.add("ctt-hidden-hard");
  local.parentElement.classList.add("ctt-hidden");
  if (await runMorph(plan, true) !== "done") return;   // a newer transition owns the map now
  // The morph lands exactly on the local geometry, so swap instantly. Letting the local
  // layer's 420ms opacity transition run here would blink the map to blank and fade it back.
  handoff(local.parentElement, true);
  plan.layer.remove();
}

/** Show/hide a layer with no transition, flushed before the caller drops the morph layer. */
function handoff(layer, show) {
  layer.classList.add("ctt-no-transition");
  layer.classList.remove("ctt-fading");
  layer.classList.toggle("ctt-hidden", !show);
  layer.classList.toggle("ctt-fade-in", show);
  void layer.offsetWidth;                 // force the style flush while transitions are off
  layer.classList.remove("ctt-no-transition");
}

async function drillOut() {
  const circuitId = S.activeCircuit;
  const local = S.localSVGCache.get(circuitId);
  if (S.ui.nationalSVG)   // feeder blocks (CIT/CFC) exist only inside the cafc feeder view
    S.ui.nationalSVG.querySelectorAll('.ctt-blocks[data-level="feeder"]').forEach((n) => n.remove());
  S.view = "national"; S.activeCircuit = null; S.selectedCourt = null;
  updateDistrictOverlayVisibility();   // the deployed national assembly reappears if it was on
  renderDistrictSubassembly(null);     // sweep the circuit-local fixed sub-assembly
  setPaneTallness(null);   // national view never reaches a note-bearing court directly
  unpinDetail();
  togglePane(false);
  highlightSelector(null);
  clearShapeHighlight();   // else the drilled circuit stays highlighted back on the national map
  renderSelector();

  const plan = local && morphPlanFor(circuitId, local);
  if (!plan) {
    cancelMorph();
    attachMorphLayer(null);
    if (local) { local.parentElement.classList.remove("ctt-fade-in"); local.parentElement.classList.add("ctt-hidden"); }
    S.ui.nationalSVG.parentElement.classList.remove("ctt-fade-out");
    S.ui.nationalSVG.parentElement.classList.remove("ctt-hidden-hard");
    return;
  }
  attachMorphLayer(plan.layer);
  handoff(local.parentElement, false);    // morph layer already covers it at t=1
  if (await runMorph(plan, false) !== "done") return;  // a newer transition owns the map now
  S.ui.nationalSVG.parentElement.classList.remove("ctt-hidden-hard");   // display:none -> instant
  plan.layer.remove();
}

/** Cached per circuit: the pairing is pure geometry, so it survives repeated drill in/out.
 *  A null result is cached too — a circuit that can't morph shouldn't be re-checked. */
function morphPlanFor(circuitId, local) {
  if (!S.morphPlans.has(circuitId)) {
    const plan = buildMorphPlan(circuitId, local);
    if (!plan) {
      // The contract requires logging which circuits fall back to the zoom.
      console.info(`[court-tracker] ${circuitId}: vertex morph unavailable -> zoom+crossfade fallback`);
    }
    S.morphPlans.set(circuitId, plan);
  }
  const plan = S.morphPlans.get(circuitId);
  if (plan) {   // reset to the national end so a re-run always starts from a known state
    for (const pr of plan.pairs) if (pr.end) pr.node.setAttribute("d", serialize(pr.start));
    setFades(plan, 0);
    plan.svg.setAttribute("viewBox", plan.vbStart.join(" "));
    plan.svg.style.aspectRatio = `${plan.vbStart[2]} / ${plan.vbStart[3]}`;
  }
  return plan;
}

// ---- entry --------------------------------------------------------------------
export async function mount(root) {
  // CONCURRENT mounts must not interleave: autoMount() fires on import, and a host page
  // that also calls mount() explicitly (tests/visual.html always has) starts a second mount
  // while the first is inside an await. Both clear the maps, then BOTH fill them — every
  // district array ends up doubled (seen live: each drilled selector listed its districts
  // twice; the national list survived only because S.courts is a Map). Sequential
  // re-mounting stays supported; a superseded mount just stops at its next await.
  const mySeq = (S._mountSeq = (S._mountSeq || 0) + 1);
  const superseded = () => S._mountSeq !== mySeq;
  // Reset per-mount state so re-mounting is idempotent (no accumulated districts/caches).
  S.courts.clear(); S.districtsByCircuit.clear(); S.judgeCache.clear();
  S.justices.clear(); S.justicesLoaded = false; S.localSVGCache.clear(); S.localPending.clear();
  cancelMorph();
  S.morphPlans.clear(); S.morphRAF = null; S.morphCancel = null; S.seatBlocks = null;
  S.view = "national"; S.activeCircuit = null; S.selectedCourt = null;
  S.majorityMode = false; S.paneMode = "timeline"; S.seniorMode = "hide";
  S.detailPinned = false; S.affilMark = "none";
  S.appointmentsAll = null; S.presidentPhotos = null;
  S.summaryView = "scotus"; S.districtArrangement = null;
  S.districtOnMap = false; S.districtMapState = null;

  const ui = buildShell(root);
  try {
    // The manifest is the version SOURCE, so it alone must always revalidate ("no-cache"
    // still allows a cheap 304). Every other asset then carries ?v=<version> and may cache
    // forever — a rebuild changes the version and busts them all.
    S.manifest = await fetchJSON("data/manifest.json", { cache: "no-cache" });
    if (superseded()) return ui;
    ui.subtitle.textContent = `National view · data v${S.manifest.version || "?"}`;
    // "Last tracked appointment": the newest commission_date in the data (a judgeship actually
    // starting), NOT `manifest.generated` (when this build merely ran) - kept distinct per the
    // operator's ask, since "last updated" is ambiguous about which of those it means.
    ui.tracked.textContent = S.manifest.last_appointment
      ? `Last tracked appointment ${isoToMDY(S.manifest.last_appointment)}`
      : "";
    const courts = await fetchJSON(S.manifest.files?.courts || "data/courts.json");
    if (superseded()) return ui;
    for (const c of courts) {
      S.courts.set(c.court_id, c);
      if (c.court_level === "district" && c.parent_id) {
        if (!S.districtsByCircuit.has(c.parent_id)) S.districtsByCircuit.set(c.parent_id, []);
        S.districtsByCircuit.get(c.parent_id).push(c);
      }
    }
    renderSelector();
    // Small aggregate (counts only, ~107 courts) so the national view can colour every
    // circuit's block WITHOUT pulling 13 judge bundles — keeps the lazy-load contract.
    if (S.manifest.files?.seat_blocks) {
      try { S.seatBlocks = await fetchJSON(S.manifest.files.seat_blocks); }
      catch (e) { console.warn("[court-tracker] seat blocks unavailable:", e.message); }
      if (superseded()) return ui;
    }
    const natPath = S.manifest.files?.geo?.national || "assets/geo/national.svg";
    const natText = await fetchText(natPath);
    if (superseded()) return ui;
    ui.nationalSVG = injectSVG(ui.svgStack, natText);
    ui.nationalSVG.parentElement.classList.add("ctt-national-layer");
    wireShapeEvents(ui.nationalSVG, { onSelect: (cid) => selectCourt(cid), national: true });
    renderSeatBlocks(ui.nationalSVG, "circuit");
    ui.status.remove();
  } catch (err) {
    ui.svgStack.innerHTML = "";
    const note = el("div", "ctt-status");
    note.innerHTML = `Assets could not be loaded.<br><small>${String(err.message || err)}</small><br>` +
      `<small>From a local file, some browsers block file:// fetch — use Firefox or ` +
      `<code>python3 -m http.server</code>.</small>`;
    ui.viewport.append(note);
    console.error("[court-tracker] load failed:", err);
  }
  return ui;
}

function autoMount() {
  const root = document.getElementById("court-tracker-root");
  if (root && !root.dataset.cttMounted) { root.dataset.cttMounted = "1"; mount(root); }
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", autoMount);
else autoMount();
export default mount;

// Dev-only hook for tools/tune-seat-blocks.html — NOT part of the embed API; nothing in the
// widget or the host page uses it. Exposed so the tuner renders through the very same code
// path it is tuning (WYSIWYG), instead of a second copy that could drift.
export const _dev = {
  S, renderSeatBlocks, refreshSeatBlocks, viewBoxOf, flipConst, shapeAnchor, BLOCK_PX, drillIn, drillOut,
  buildStreamModel, valueAt, ensureChangeData, dayNum, isoOfDayNum, PRESIDENCIES, initials, surname,
  selectSummary, layoutScotusRing, deployDistrictOverlayAnimated, deployDistrictOverlay,
};
