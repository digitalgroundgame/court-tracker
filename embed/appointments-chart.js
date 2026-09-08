// appointments-chart.js — beeswarm of federal judicial appointments through presidential
// terms (operator spec, PROGRESS session ai/aj). SEPARATE widget from the tracker: its own
// module, its own `cta-` CSS, its own host div (#appointments-chart-root), zero runtime
// dependencies, fetch-at-runtime with the same file://-friendly relative URLs and the same
// manifest ?v= cache-busting the tracker uses.
//
// One dot per APPOINTMENT since Nixon (an elevation = two dots), x = commission date.
// One central swarm; size encodes court level (district < appellate < SCOTUS-with-photo);
// dot radius scales with the visible span so the fixed-height chart always fits.
// Colors: active = party; now-senior = grayed party; departed = black; former SCOTUS =
// black ring + grayscale photo. FedSoc/ACS hatching gated by the mark switch (sitting
// judges only — the data carries no affiliations for departed judges).
// STATUTORY REORGANIZATIONS (the 51 president-less rows) are NOT dots — they surface as an
// italic info line on the affected judge's other dots (operator call, session aj).

import { PRESIDENCIES } from "./presidencies.js";

// Default: everything (embed/, data/, assets/) stays in one tree, one directory below wherever
// this script is served from. Overridable per-mount (issue #2) — see resolveAssetRoot() in
// court-tracker.js for the full rationale; same precedence and semantics here.
const DEFAULT_ASSET_ROOT = new URL("../", import.meta.url);
function resolveAssetRoot(root, opts) {
  const override = opts?.assetRoot ?? root?.dataset?.assetRoot;
  return override ? new URL(String(override), document.baseURI) : DEFAULT_ASSET_ROOT;
}
const SVGNS = "http://www.w3.org/2000/svg";
const DAY = 86400000;

const A = {
  assetRoot: DEFAULT_ASSET_ROOT,  // recomputed per mount() call
  manifest: null, rows: [], courts: new Map(), reorgByPerson: new Map(),
  personDots: new Map(), dots: [], chiefMerges: 0,
  day0: 0, dayMax: 0, spanYears: 8, viewStart: 0,
  markMode: "none", pinned: false, lastDot: null,
  ui: null, uid: 0, presidentPhotos: {},
};

function unpin() {
  A.pinned = false;
  A.ui.detail.classList.remove("cta-pinned");
}

const resolve = (rel) => {
  const u = new URL(rel, A.assetRoot);
  if (A.manifest?.version && /^https?:$/.test(u.protocol)) u.searchParams.set("v", A.manifest.version);
  return u.href;
};
async function fetchJSON(rel, opts) {
  const r = await fetch(resolve(rel), opts);
  if (!r.ok) throw new Error(`${rel}: HTTP ${r.status}`);
  return r.json();
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

// Named statutes for the three big reorganizations; the small district realignments get a
// generic line built from the data (no citation invented — CLAUDE.md §2).
const REORG_ACT = {
  ca11: "Fifth Circuit Court of Appeals Reorganization Act of 1980",
  cafc: "Federal Courts Improvement Act of 1982",
  cit: "Customs Courts Act of 1980",
};

// Default sizing law — operator-tuned 2026-07-20 via tools/tune-dot-sizes.html
// ("cap=30 mult=120 appellate×=2 scotus×=7"). `fit` scales the allowed swarm height
// (1 = fill to the chart edge; >1 deliberately overflows, clipped by the svg).
const SIZE_FORMULA = { cap: 30, mult: 120, rCircuit: 2, rScotus: 7, fit: 1.2 };
const days = (iso) => Math.floor(Date.parse(iso + "T12:00:00Z") / DAY);
// Inverse of days(): the +DAY/2 lands on the same day's noon UTC that days() floored from,
// so the round-trip (isoOfDay(days(iso)) === iso) holds regardless of local timezone.
const isoOfDay = (day) => new Date(day * DAY + DAY / 2).toISOString().slice(0, 10);

function personKey(r) { return r.fjc_jid ? `j${r.fjc_jid}` : `n:${r.full_name}`; }
function statusOf(r) {
  if (r.sitting !== "true") return "departed";
  return r.senior_date ? "senior" : "active";
}
function initials(name) {
  const p = (name || "?").trim().split(/\s+/);
  return ((p[0]?.[0] || "") + (p[p.length - 1]?.[0] || "")).toUpperCase();
}
const short = (cid) => A.courts.get(cid)?.short_name || A.courts.get(cid)?.court_name || cid;
// Prefer the locally-cached, anti-aliased thumbnail (scripts/cache_photos.py) — see the
// matching helper + comment in court-tracker.js. Falls back to hotlinking `photo_url` when
// no thumbnail has been generated yet for that URL.
function photoSrc(r) { return r.photo_thumb ? resolve(r.photo_thumb) : r.photo_url; }

// ---- shell ---------------------------------------------------------------------
function buildShell(root) {
  root.classList.add("cta-root");
  root.innerHTML = "";
  root.dataset.mark = "none";

  const header = el("div", "cta-header");
  const title = el("div", "cta-title");
  title.textContent = "Judicial Appointments Timeline";
  const subtitle = el("div", "cta-subtitle");
  subtitle.textContent = "loading…";
  header.append(title, subtitle);

  const controls = el("div", "cta-controls");
  const markWrap = el("div", "cta-mark-switch", { role: "group", "aria-label": "Mark reported affiliation" });
  const markLabel = el("span", "cta-controls-label");
  markLabel.textContent = "Mark:";
  const setMark = (mode) => {
    A.markMode = mode;
    root.dataset.mark = mode;
    markWrap.querySelectorAll(".cta-mark-opt").forEach((o) =>
      o.classList.toggle("cta-is-active", o.getAttribute("data-mark") === mode));
  };
  A._setMark = setMark;
  for (const [mode, text] of [["none", "None"], ["fedsoc", "FedSoc"], ["acs", "ACS"]]) {
    const b = el("button", "cta-toggle cta-mark-opt", { type: "button", "data-mark": mode });
    b.textContent = text;
    b.classList.toggle("cta-is-active", mode === "none");
    b.addEventListener("click", () => setMark(mode));
    markWrap.append(b);
  }
  // Years-shown control (operator spec, session ak): ±1-year arrow buttons beside a
  // tick-marked slider over DISCRETE stops (a non-linear scale — fine steps near the
  // detailed end, coarse toward the full span). Stops are configured after the data loads.
  const span = el("div", "cta-span");
  const spanLabel = el("span", "cta-controls-label");
  spanLabel.textContent = "Years shown:";
  const minus = el("button", "cta-toggle cta-span-arrow", { type: "button", "aria-label": "One year fewer" });
  minus.textContent = "−";
  const plus = el("button", "cta-toggle cta-span-arrow", { type: "button", "aria-label": "One year more" });
  plus.textContent = "+";
  const sliderWrap = el("div", "cta-span-slider");
  const slider = el("input", null, { type: "range", min: 0, max: 1, step: 1, value: 0 });
  const marksRow = el("div", "cta-span-marks");   // tick bars crossing the slider track
  const tickRow = el("div", "cta-span-ticks");    // the year numbers, aligned to the bars
  sliderWrap.append(slider, marksRow, tickRow);
  const spanVal = el("span", "cta-span-val");
  const anchoredEnd = () => A.viewStart + ivDays();   // zoom keeps the RIGHT edge in place
  const applyYears = (y) => {
    const end = anchoredEnd();
    A.ui.spanStops && syncSlider(y);
    setSpan(y, end);
  };
  const syncSlider = (y) => {
    // thumb sits on the nearest stop at or below the current year count
    const stops = A.ui.spanStops || [];
    let i = 0;
    for (let k = 0; k < stops.length; k++) if (stops[k] <= y) i = k;
    slider.value = i;
  };
  slider.addEventListener("input", () => { dismissExplainer(false); applyYears((A.ui.spanStops || [8])[+slider.value]); });
  minus.addEventListener("click", () => { dismissExplainer(false); applyYears(Math.max(2, A.spanYears - 1)); });
  plus.addEventListener("click", () => { dismissExplainer(false); applyYears(Math.min(A.ui.maxYears || 60, A.spanYears + 1)); });
  span.append(spanLabel, sliderWrap, minus, plus, spanVal);   // [−][+] sit together
  const explainBtn = el("button", "cta-explain-btn", { type: "button" });
  explainBtn.textContent = "Explain this graphic ⓘ";
  explainBtn.addEventListener("click", () => toggleExplainer());
  controls.append(markLabel, markWrap, span, explainBtn);

  const body = el("div", "cta-body");
  const chartWrap = el("div", "cta-chart-wrap");
  const svg = svgEl("svg", { class: "cta-chart", role: "img",
    "aria-label": "Beeswarm of federal judicial appointments over time" });
  const status = el("div", "cta-status");
  status.textContent = "Loading appointment data…";
  chartWrap.append(svg, status);
  const detail = el("div", "cta-detail");
  const detailContent = el("div", "cta-detail-content");
  const caveat = el("div", "cta-caveat");
  caveat.textContent = "Marks are Wikipedia-reported; sitting judges only — historical dots are unmarked.";
  detail.append(detailContent, caveat);
  body.append(chartWrap, detail);

  const detailClose = el("button", "cta-detail-close", { type: "button", "aria-label": "Unpin details", title: "Unpin" });
  detailClose.textContent = "×";
  detail.prepend(detailClose);
  detailClose.addEventListener("click", unpin);

  root.append(header, controls, body);
  // Pin lifecycle (operator spec, session ak): clicking elsewhere — the chart, the span or
  // mark controls, the page — must NOT unpin. Unpinning is explicit: the (×) in the panel,
  // or any keypress that isn't operating a control (so slider arrow-keys don't self-unpin).
  document.addEventListener("keydown", (e) => {
    if (!A.pinned) return;
    const t = e.target;
    if (t && /^(INPUT|BUTTON|SELECT|TEXTAREA)$/.test(t.tagName)) return;
    unpin();
  });
  A.ui = { root, subtitle, svg, status, chartWrap, detail, detailContent, slider, spanVal,
           tickRow, marksRow, syncSlider };
}

// ---- geometry ------------------------------------------------------------------
const ivDays = () => Math.round(A.spanYears * 365.25);
function chartSize() {
  const r = A.ui.chartWrap.getBoundingClientRect();
  // jsdom / unlaid-out: nominal box so tests exercise real code paths
  return { w: r.width > 40 ? r.width : 900, h: r.height > 40 ? r.height : 380 };
}
const pxPerDay = () => chartSize().w / ivDays();
const worldX = (d) => (d - A.day0) * pxPerDay();

// Greedy beeswarm: place each dot (sorted by x) at the y of smallest |y| that collides with
// nothing already placed. Returns max |y| + r seen (for the fit-to-height retry loop).
function packSwarm(dots, pad) {
  let maxR = 0;
  for (const d of dots) maxR = Math.max(maxR, d.r);
  let worst = 0;
  const placed = [];
  for (const d of dots) {
    const near = [];
    for (let i = placed.length - 1; i >= 0; i--) {
      const p = placed[i];
      if (d.x - p.x > d.r + maxR + pad) break;
      if (Math.abs(d.x - p.x) < d.r + p.r + pad) near.push(p);
    }
    const cand = [0];
    for (const p of near) {
      const rr = d.r + p.r + pad, dx = d.x - p.x;
      const dy = Math.sqrt(Math.max(0, rr * rr - dx * dx));
      cand.push(p.y + dy, p.y - dy);
    }
    cand.sort((a, b) => Math.abs(a) - Math.abs(b));
    d.y = 0;
    outer: for (const y of cand) {
      for (const p of near) {
        const dx = d.x - p.x, dy = y - p.y, rr = d.r + p.r + pad - 1e-6;
        if (dx * dx + dy * dy < rr * rr) continue outer;
      }
      d.y = y;
      break;
    }
    placed.push(d);
    worst = Math.max(worst, Math.abs(d.y) + d.r);
  }
  return worst;
}

/** Vertical-only packing can still push a same/near-date pileup off the top or bottom of the
 *  chart even once dot radii are already at the floor (e.g. a court reorganized wholesale in
 *  one day). The remaining lever is horizontal: spread the pileup's dots apart in x — a real
 *  beeswarm's other degree of freedom — just enough to bring it back inside the allowed
 *  height; dots outside an overflowing pileup stay exactly on their true date. Clusters are
 *  proximity-based on rendered pixels (gap <= 2 * max radius), not same-day, so it also
 *  catches dense multi-day pileups at wide zoom-outs where a whole week collapses to <1px. */
function relievePileups(dots, pad, allowed) {
  let worst = packSwarm(dots, pad);
  if (worst <= allowed || dots.length < 2) return worst;
  let maxR = 0;
  for (const d of dots) maxR = Math.max(maxR, d.r);
  const trueX = dots.map((d) => worldX(d.day));
  const threshold = Math.max(1, maxR * 2);
  let bestWorst = worst, bestX = dots.map((d) => d.x);
  const STEP = Math.max(0.3, maxR * 0.25);
  for (let spread = STEP; spread <= maxR * 16; spread += STEP) {
    let prevX = -Infinity, group = null;
    const groups = [];
    dots.forEach((d, i) => {
      if (group && trueX[i] - prevX <= threshold) group.push(i);
      else { group = [i]; groups.push(group); }
      prevX = trueX[i];
    });
    for (const g of groups) {
      if (g.length < 2) continue;
      const mid = (g.length - 1) / 2;
      g.forEach((i, rank) => { dots[i].x = trueX[i] + (rank - mid) * spread; });
    }
    worst = packSwarm(dots, pad);
    if (worst < bestWorst) { bestWorst = worst; bestX = dots.map((d) => d.x); }
    if (worst <= allowed) break;
  }
  dots.forEach((d, i) => { d.x = bestX[i]; });
  packSwarm(dots, pad); // re-settle y at the winning x's
  return bestWorst;
}

/** Re-derive radii + positions for the current span, shrinking radii until the swarm fits
 *  the chart height (operator call: sizes scale with zoom; level ratios preserved). Once
 *  radii bottom out, hand off to relievePileups() rather than let a dense cluster overflow. */
function layoutDots() {
  const { h } = chartSize();
  const ppd = pxPerDay();
  // tools/tune-dot-sizes.html overrides the FORMULA PARAMETERS (not absolute radii), so
  // the operator tunes the same scaling law the widget ships with.
  const F = A.formulaOverride || SIZE_FORMULA;
  let base = Math.max(2.4, Math.min(F.cap, ppd * F.mult));
  const allowed = (h / 2 - 10) * (F.fit || 1);
  for (let iter = 0; iter < 7; iter++) {
    for (const d of A.dots) {
      d.x = worldX(d.day);
      const k = d.row.court_level === "scotus" ? F.rScotus
        : d.row.court_level === "circuit" ? F.rCircuit : 1;
      d.r = base * k;
    }
    const worst = packSwarm(A.dots, 0.7);
    if (worst <= allowed) return;
    if (base <= 1.8) {
      relievePileups(A.dots, 0.7, allowed);
      return;
    }
    base *= Math.max(0.6, allowed / worst) * 0.97;
    base = Math.max(1.8, base);
  }
}

// ---- drawing -------------------------------------------------------------------
function drawAll() {
  const svg = A.ui.svg;
  svg.innerHTML = "";
  const { w, h } = chartSize();
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  const mid = h / 2;

  const pan = svgEl("g", { class: "cta-pan" });
  svg.append(pan);
  A._pan = pan;

  // presidency bands + labels (full domain; panning just translates)
  const bands = svgEl("g");
  for (let i = 0; i < PRESIDENCIES.length; i++) {
    const [start, name, party] = PRESIDENCIES[i];
    const d0 = Math.max(days(start), A.day0);
    const d1 = i + 1 < PRESIDENCIES.length ? days(PRESIDENCIES[i + 1][0]) : A.dayMax;
    const x0 = worldX(d0), x1 = worldX(d1);
    bands.append(svgEl("rect", { class: party === "R" ? "cta-band-rep" : "cta-band-dem",
      x: x0, y: 0, width: Math.max(0, x1 - x0), height: h, "data-president": name }));
    // Dashed boundary at every transition (matters most between SAME-party neighbors,
    // where the band color alone can't divide them — Nixon|Ford, Reagan|Bush, Trump|Trump).
    if (i > 0) bands.append(svgEl("line", { class: "cta-president-line", x1: x0, y1: 0, x2: x0, y2: h }));
    // Appointment counts for THIS consecutive span (operator spec): dots inside the band
    // whose appointing president is the band's, excluding the original role a judge was
    // later reappointed OUT of. (Reorg rows are already not dots; Rehnquist's chief
    // elevation is already merged.)
    const counts = { scotus: 0, circuit: 0, district: 0, other: 0 };
    for (const d of A.dots) {
      if (d.day < d0 || d.day >= d1) continue;
      if (d.row.appointing_president !== name) continue;
      if (/appointment to another/i.test(d.row.termination_reason || "")) continue;
      const lv = d.row.court_level;
      counts[lv === "scotus" ? "scotus" : lv === "circuit" ? "circuit" : lv === "district" ? "district" : "other"]++;
    }
    const surname = name.split(" ").pop();
    const segs = [];
    if (counts.scotus) segs.push(`· ${counts.scotus} SCOTUS`);
    segs.push(`· ${counts.circuit} Appellate`, `· ${counts.district} District`);
    if (counts.other) segs.push(`· ${counts.other} Other`);
    const segsStr = segs.join(" ");

    // The president's icon sits between the name and the counts, its vertical center on the
    // text's own visual middle (not its baseline — baseline minus ~35% of the font size is
    // the usual approximation for where cap-height text actually LOOKS centered).
    const ICON_D = 20, ICON_GAP = 4;   // bumped from 13 (operator: "too small")
    const surnameW = surname.length * 6.2;
    const iconX = x0 + 6 + surnameW + ICON_GAP;
    const iconCX = iconX + ICON_D / 2, iconCY = 16 - 4;
    const countsX = iconX + ICON_D + ICON_GAP;

    const group = svgEl("g", { class: "cta-band-label-group" });
    const nameText = svgEl("text", { class: "cta-band-label", x: x0 + 6, y: 16 });
    nameText.textContent = surname;
    group.append(nameText);

    const photo = A.presidentPhotos?.[name];
    const src = photo?.photo_thumb ? resolve(photo.photo_thumb) : photo?.photo_url;
    if (src) {
      const clipId = `cta-pres-clip-${A.uid}-${i}`;
      const clip = svgEl("clipPath", { id: clipId });
      clip.append(svgEl("circle", { cx: iconCX, cy: iconCY, r: ICON_D / 2 }));
      group.append(clip);
      const img = svgEl("image", { class: "cta-band-pres-icon", x: iconX, y: iconCY - ICON_D / 2,
        width: ICON_D, height: ICON_D, "clip-path": `url(#${clipId})`, preserveAspectRatio: "xMidYMid slice" });
      img.setAttribute("href", src);
      group.append(img);
      group.append(svgEl("circle", { class: `cta-band-pres-ring ${party === "R" ? "cta-rep" : "cta-dem"}`,
        cx: iconCX, cy: iconCY, r: ICON_D / 2, fill: "none" }));
    }

    const countsText = svgEl("text", { class: "cta-band-label" });
    const fits = (x1 - x0) > (surnameW + ICON_D + ICON_GAP * 2 + segsStr.length * 6.2 + 12);
    if (fits) {
      countsText.setAttribute("x", countsX);
      countsText.setAttribute("y", 16);
      countsText.textContent = segsStr;
    } else {
      // Narrow band: the icon still sits right after the name, but there's no room for the
      // counts on that same line — they wrap below it instead (operator spec, session ao,
      // adapted for the icon's added width).
      segs.forEach((s, si) => {
        const ts = svgEl("tspan", si === 0 ? { x: x0 + 6, y: 28 } : { x: x0 + 6, dy: 12 });
        ts.textContent = s;
        countsText.append(ts);
      });
    }
    group.append(countsText);
    group._bandX0 = x0;
    group._bandX1 = x1;
    bands.append(group);
  }
  pan.append(bands);
  A._bandLabels = [...bands.querySelectorAll(".cta-band-label-group")];

  // ticks: years always (labeled), months when the span is short enough to read them
  const ticks = svgEl("g");
  const y0 = new Date((A.day0) * DAY).getUTCFullYear();
  const y1 = new Date((A.dayMax) * DAY).getUTCFullYear();
  const monthTicks = A.spanYears <= 4;
  // Label visibility progresses %1 -> %2 -> %4 -> %8 as the view zooms out (operator rule:
  // powers of two, so kept labels stay kept), choosing the finest mod that leaves ~40px
  // per label. The label sits CENTERED between its two year-boundary lines.
  const pxPerYear = 365.25 * pxPerDay();
  let labelMod = 8;
  for (const m of [1, 2, 4, 8]) { if (pxPerYear * m >= 40) { labelMod = m; break; } }
  for (let y = y0; y <= y1 + 1; y++) {
    const x = worldX(days(`${y}-01-01`));
    ticks.append(svgEl("line", { class: "cta-tick-year", x1: x, y1: 20, x2: x, y2: h - 18 }));
    if (y % labelMod === 0) {
      const t = svgEl("text", { class: "cta-tick-label", "text-anchor": "middle",
        x: worldX(days(`${y}-07-02`)), y: h - 6 });
      t.textContent = y;
      ticks.append(t);
    }
    if (monthTicks) {
      for (let m = 2; m <= 12; m++) {
        const xm = worldX(days(`${y}-${String(m).padStart(2, "0")}-01`));
        ticks.append(svgEl("line", { class: "cta-tick-month", x1: xm, y1: h - 26, x2: xm, y2: h - 18 }));
      }
    }
  }
  pan.append(ticks);
  pan.append(svgEl("line", { class: "cta-axis", x1: worldX(A.day0), y1: mid, x2: worldX(A.dayMax), y2: mid }));

  // dots (positions from layoutDots; y is offset from the midline)
  const swarm = svgEl("g");
  const hl = svgEl("g");          // person-group highlight rings, above the dots
  for (const d of A.dots) {
    const cy = mid - d.y;
    const r = d.row, cls = d.cls;
    let node;
    if (r.court_level === "scotus" && r.photo_url) {
      node = svgEl("g", { class: "cta-dot-target" });
      const clipId = `cta-clip-${A.uid}-${d.i}`;
      const clip = svgEl("clipPath", { id: clipId });
      clip.append(svgEl("circle", { cx: d.x, cy, r: d.r - 1 }));
      node.append(clip);
      const img = svgEl("image", {
        class: "cta-scotus-photo" + (d.status === "departed" ? " cta-gray" : ""),
        x: d.x - d.r, y: cy - d.r, width: d.r * 2, height: d.r * 2,
        "clip-path": `url(#${clipId})`, preserveAspectRatio: "xMidYMid slice",
      });
      img.setAttribute("href", photoSrc(r));
      node.append(img);
      node.append(svgEl("circle", { class: `cta-scotus-ring ${cls}`, cx: d.x, cy, r: d.r }));
    } else {
      node = svgEl("circle", { class: `cta-dot cta-dot-target ${cls}`, cx: d.x, cy, r: d.r });
    }
    node.setAttribute("data-i", d.i);
    // Affiliation marking is a CLASS on the dot (and the SCOTUS ring) — the mark switch
    // recolors marked dots yellow via CSS (hatching was too subtle, operator call; classes
    // also handle a judge reported for BOTH organizations, which the old
    // fedsoc-else-acs overlay silently dropped).
    const markTarget = node.classList ? (node.querySelector?.(".cta-scotus-ring") || node) : node;
    if (r.fedsoc_reported === "true") markTarget.classList.add("cta-aff-fedsoc");
    if (r.acs_reported === "true") markTarget.classList.add("cta-aff-acs");
    if (d.status === "senior") markTarget.classList.add("cta-sen");
    d.node = node;
    d.cy = cy;
    swarm.append(node);
  }
  pan.append(swarm);
  pan.append(hl);
  A._hl = hl;

  applyPan();
}

function applyPan() {
  const vx = worldX(A.viewStart);
  A._pan.setAttribute("transform", `translate(${-vx} 0)`);
  // Sticky band labels: a president whose band STARTS off-screen still deserves a name —
  // clamp each label into the visible window (until its band's right edge pushes it out).
  // A single group transform shifts the name, icon, and counts together, whichever layout
  // (one-line or wrapped) the counts ended up in — simpler than repositioning every child.
  for (const g of A._bandLabels || []) {
    const nx = Math.min(Math.max(g._bandX0, vx) + 6, g._bandX1 - 6);
    const dx = nx - (g._bandX0 + 6);
    g.setAttribute("transform", `translate(${dx}, 0)`);
  }
}

function clampView(startDay) {
  return Math.max(A.day0, Math.min(A.dayMax - ivDays() + 90, startDay));
}

function configureSpanControl(maxYears) {
  A.ui.maxYears = maxYears;
  const stops = [...new Set([2, 4, 8, 12, 16, 20, 30, 40, maxYears]
    .filter((y) => y >= 2 && y <= maxYears))].sort((a, b) => a - b);
  A.ui.spanStops = stops;
  A.ui.slider.min = 0;
  A.ui.slider.max = stops.length - 1;
  // Position every tick at the fraction the THUMB actually occupies for that stop: the
  // thumb's centre travels [T/2, width - T/2], so plain space-between labels drift off the
  // stops (operator report). T approximates the browser's default thumb width.
  const T = 16;   // Chrome's default range thumb is 16px; 14 drifted the ticks slightly
  A.ui.tickRow.innerHTML = "";
  A.ui.marksRow.innerHTML = "";
  stops.forEach((s, i) => {
    const left = `calc(${T / 2}px + ${(i / (stops.length - 1)).toFixed(4)} * (100% - ${T}px))`;
    const bar = document.createElement("span");
    bar.style.left = left;
    A.ui.marksRow.append(bar);
    const t = document.createElement("span");
    t.textContent = s;
    t.style.left = left;
    A.ui.tickRow.append(t);
  });
}

function setSpan(years, anchorEndDay) {
  A.spanYears = years;
  A.ui.syncSlider(years);
  A.ui.spanVal.textContent = `${years} yr`;
  A.viewStart = clampView((anchorEndDay ?? A.dayMax + 90) - ivDays());
  layoutDots();
  drawAll();
}

// ---- hover / detail --------------------------------------------------------------
function highlightPerson(key) {
  A._hl.innerHTML = "";
  if (!key) return;
  const marking = A.markMode && A.markMode !== "none";
  for (const d of A.personDots.get(key) || []) {
    // marking on: dots can be the same yellow as this ring, so a thin black ring goes
    // between the dot and the ring, and the ring itself sits a touch further out to fit it.
    if (marking) A._hl.append(svgEl("circle", { class: "cta-dot-hl-border", cx: d.x, cy: d.cy, r: d.r + 1.3 }));
    A._hl.append(svgEl("circle", { class: "cta-dot-hl", cx: d.x, cy: d.cy, r: d.r + (marking ? 2.8 : 2) }));
  }
}

function showDetail(d) {
  const r = d.row;
  const c = A.ui.detailContent;
  const lines = [];
  const partyCls = r.president_party === "Republican" ? "cta-rep" : r.president_party === "Democratic" ? "cta-dem" : "";
  // "No longer serving" must not cover moved-to-another-role: a judge whose appointment
  // ended by reappointment/reassignment kept serving — distinct tags (operator, session am).
  const depTag = d.status !== "departed" ? "" :
    /appointment to another/i.test(r.termination_reason || "") ? "Reappointed" :
    /reassignment/i.test(r.termination_reason || "") ? "Reassigned" : "No longer serving";
  lines.push(`<div class="cta-detail-name">${r.full_name}` +
    (d.status === "senior" ? ` <span class="cta-tag">Senior</span>` : "") +
    (depTag ? ` <span class="cta-tag">${depTag}</span>` : "") + `</div>`);
  lines.push(`<div class="cta-detail-court">${short(r.court_id)}</div>` +
    `<div class="cta-detail-courtname">${A.courts.get(r.court_id)?.court_name || r.court_id}</div>`);
  if (r.appointing_president) lines.push(`<div>Appointed by ${r.appointing_president}` +
    (r.president_party ? ` (${r.president_party})` : "") + `</div>`);
  if (r.recess_appointment_date) lines.push(`<div>Recess appointment ${r.recess_appointment_date}` +
    (r.commission_date ? ` · commissioned ${r.commission_date} after Senate confirmation` : "") + `</div>`);
  else if (r.commission_date) lines.push(`<div>Commissioned ${r.commission_date}</div>`);
  if (d.chiefDate) lines.push(`<div>Became Chief Justice ${d.chiefDate}` +
    (r.chief_by ? ` (named by ${r.chief_by})` : "") + `</div>`);
  if (r.court_level === "scotus") {
    // SCOTUS has no senior status in the lower-court sense: FJC's senior date for a justice
    // records RETIREMENT — the day they left the bench (operator correction, session ak).
    if (r.senior_date) lines.push(`<div>Left the bench ${r.senior_date} (retired)</div>`);
    else if (r.termination_date) lines.push(`<div>Left the bench ${r.termination_date}` +
      (r.termination_reason ? ` (${r.termination_reason.toLowerCase()})` : "") + `</div>`);
  } else {
    if (r.senior_date) lines.push(`<div>Senior status ${r.senior_date}</div>`);
    if (r.termination_date) lines.push(`<div>Left the bench ${r.termination_date}` +
      (r.termination_reason ? ` (${r.termination_reason.toLowerCase()})` : "") + `</div>`);
  }
  if (r.fedsoc_reported === "true") lines.push(`<div class="cta-affil-line">Reported to have a Federalist Society affiliation</div>`);
  if (r.acs_reported === "true") lines.push(`<div class="cta-affil-line">Reported to have an American Constitution Society affiliation</div>`);

  // statutory reorganization line(s) for this person (these events are NOT dots)
  for (const g of A.reorgByPerson.get(d.person) || []) {
    const act = REORG_ACT[g.court_id];
    lines.push(`<div class="cta-reorg-line">Reassigned by statute to ${short(g.court_id)} on ${g.date}` +
      (act ? ` (${act})` : "") + `.</div>`);
  }
  // the person's other appointments (they group-highlight on hover)
  const others = (A.personDots.get(d.person) || []).filter((o) => o !== d);
  if (others.length) {
    lines.push(`<div class="cta-affil-line">Also appointed: ` + others.map((o) =>
      `${short(o.row.court_id)} (${o.row.commission_date?.slice(0, 4)})`).join(" · ") + `</div>`);
  }
  const credit = r.photo_license && /cc/i.test(r.photo_license) && !/public/i.test(r.photo_license)
    ? `<div class="cta-photo-credit">Photo: ${r.photo_license}</div>` : "";
  c.innerHTML = lines.join("") + credit;

  const photo = el("div", "cta-detail-photo " +
    (d.status === "departed" ? "cta-black cta-gray" : partyCls));
  if (r.photo_url) {
    const img = el("img", null, { src: photoSrc(r), alt: r.full_name, loading: "lazy" });
    img.addEventListener("error", () => { img.remove(); photo.textContent = initials(r.full_name); });
    photo.append(img);
  } else {
    photo.textContent = initials(r.full_name);
  }
  c.prepend(photo);
}

function resetDetail() {
  A.ui.detailContent.innerHTML =
    `<div class="cta-detail-hint">Hover over an appointment for details.<br>Click to pin.</div>`;
}

function wireInteractions() {
  const svg = A.ui.svg;
  svg.addEventListener("pointerover", (e) => {
    const t = e.target.closest && e.target.closest(".cta-dot-target");
    if (!t) return;
    const d = A.dots[+t.getAttribute("data-i")];
    if (!d) return;
    A.lastDot = d;
    if (!A.pinned) {
      highlightPerson(d.person);
      showDetail(d);
    }
  });
  svg.addEventListener("pointerout", (e) => {
    if (A.pinned) return;
    if (e.target.closest && e.target.closest(".cta-dot-target")) highlightPerson(null);
  });
  svg.addEventListener("click", (e) => {
    const t = e.target.closest && e.target.closest(".cta-dot-target");
    if (!t) return;
    const d = A.dots[+t.getAttribute("data-i")];
    if (!d) return;
    A.pinned = true;
    A.ui.detail.classList.add("cta-pinned");
    highlightPerson(d.person);
    showDetail(d);
  });

  // drag-to-scroll: window listeners, no pointer capture (tracker lesson (l))
  let drag = null;
  svg.addEventListener("pointerdown", (e) => {
    dismissExplainer(false);          // the user is taking control of the view
    drag = { x0: e.clientX, view0: A.viewStart };
    svg.classList.add("cta-dragging");
    const move = (ev) => {
      if (!drag) return;
      const dDays = (drag.x0 - ev.clientX) / pxPerDay();
      A.viewStart = clampView(drag.view0 + dDays);
      applyPan();
    };
    const up = () => {
      drag = null;
      svg.classList.remove("cta-dragging");
      window.removeEventListener("pointermove", move);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    e.preventDefault();
  });

  let rT = null;
  window.addEventListener("resize", () => {
    clearTimeout(rT);
    rT = setTimeout(() => { layoutDots(); drawAll(); }, 150);
  });
}

// ---- "Explain this graphic" overlay (operator spec, session an) -------------------
// Jumps to a preset window with FedSoc marks on, then annotates real on-screen examples
// with curved arrows. Reverts on: the button again (full restore) or any user pan/zoom
// (overlay + mark revert; the user's new view is respected).
// Config-driven (operator-tunable via tools/tune-explainer.html): positions are FRACTIONS
// of the chart box; arrow targets are picked live from the visible dots by category, near
// the owning box. `A.explainerConfig` overrides the default wholesale.
// Reference chart-box width (~.cta-chart-wrap's px width in the tuning tool) that box
// `size`/`w` render at literally; see the cqw scaling note in buildExplainerOverlay.
const EXPLAINER_REF_W = 900;
const EXPLAINER_DEFAULT = {
  span: 12, end: "2023-01-01", mark: "fedsoc",
  arrowColor: "#243040", arrowWidth: 1.8,
  boxes: [
    { id: "intro", xf: 0.0104, yf: 0.0638, w: 270, bg: false, size: 12, color: "#1b1f24",
      text: "<b>Every dot is a federal judicial appointment</b>, placed at the date the judge took the bench.",
      italic: true },
    { id: "scotus", xf: 0.3591, yf: 0.6085, w: 210, bg: false, size: 12, color: "#1b1f24",
      text: "The <b>largest icons</b> represent <b>Supreme Court</b> appointments.",
      italic: true },
    { id: "marked", xf: 0.5277, yf: 0.1596, w: 214, bg: false, size: 12, color: "#1b1f24",
      text: "When a <b>Mark</b> is active, <b>yellow</b> = judges with that reported affiliation (shown here: Federalist Society).",
      italic: true },
    { id: "senior", xf: 0.015, yf: 0.7213, w: 210, bg: false, size: 12, color: "#1b1f24",
      text: "<b>Faded</b> red/blue/yellow = the judge has since taken <b>senior status</b>.",
      italic: true },
    { id: "departed", xf: 0.7921, yf: 0.2085, w: 150, bg: false, size: 12, color: "#1b1f24",
      text: "<b>Black</b> = no longer serving or reappointed.",
      italic: true },
    { id: "boxmrvhayf7", xf: 0.2737, yf: 0.1638, w: 180, bg: false, size: 12, color: "#1b1f24",
      text: "The <b>smallest dots</b> represent <b>district court</b> appointments.",
      italic: true },
    { id: "boxmrvhegzf", xf: 0.03, yf: 0.1936, w: 210, bg: false, size: 12, color: "#1b1f24",
      text: "The <b>medium-sized dots</b> represent <b>appellate court</b> appointments.",
      underline: false, italic: true },
  ],
  arrows: [
    { from: "scotus", edge: "top", target: "scotus", bend: -9, dx: -18, dy: -8,
      tailXf: 0.474, tailYf: 0.6215 },
    { from: "marked", edge: "bottom", target: "marked", bend: 41, dx: -4, dy: 2,
      tailXf: 0.5329, tailYf: 0.2535,
      targetPerson: "Amul Roger Thapar", targetDate: "2017-05-25" },
    { from: "senior", edge: "top", target: "senior", bend: 23, dx: 8, dy: -6,
      tailXf: 0.1218, tailYf: 0.7322,
      targetPerson: "Henry Franklin Floyd", targetDate: "2011-10-05" },
    { from: "departed", edge: "bottom", target: "departed", bend: 32, dx: -6, dy: 4,
      targetPerson: "Ketanji Brown Jackson", targetDate: "2021-06-17",
      tailXf: 0.8678, tailYf: 0.2939 },
    { from: "boxmrvhayf7", edge: "top", target: "appellate", bend: -41, dx: 6, dy: 0,
      targetPerson: "Robert William Schroeder III", targetDate: "2014-12-19",
      tailXf: 0.4001, tailYf: 0.2535 },
    { from: "boxmrvhegzf", edge: "bottom", target: "appellate", bend: -32, dx: 9, dy: 8,
      targetPerson: "Patty Shwartz", targetDate: "2013-04-10",
      tailXf: 0.2292, tailYf: 0.2811 },
  ],
};

function explainerCfg() { return A.explainerConfig || EXPLAINER_DEFAULT; }

function toggleExplainer() {
  if (A.explainer) { dismissExplainer(true); return; }
  const cfg = explainerCfg();
  const saved = { span: A.spanYears, viewStart: A.viewStart, mark: A.markMode };
  setSpan(cfg.span, days(cfg.end));
  A._setMark(cfg.mark);
  A.explainer = { saved };
  buildExplainerOverlay();
}
function dismissExplainer(restoreView) {
  if (!A.explainer) return;
  const s = A.explainer.saved;
  A.explainer.node?.remove();
  A.explainer = null;
  A._setMark(s.mark);
  if (restoreView) setSpan(s.span, s.viewStart + Math.round(s.span * 365.25));
}
function buildExplainerOverlay() {
  const cfg = explainerCfg();
  const { w, h } = chartSize();
  const mid = h / 2;
  const vx = worldX(A.viewStart);
  const sx = (d) => d.x - vx;
  const sy = (d) => mid - d.y;
  const inView = (d) => sx(d) > w * 0.05 && sx(d) < w * 0.95;

  const wrap = el("div", "cta-explainer");
  const ov = svgEl("svg", { class: "cta-explainer-svg", viewBox: `0 0 ${w} ${h}` });
  const defs = svgEl("defs");
  A.ui.chartWrap.append(wrap);   // attach first: boxes measure their own offsets
  wrap.append(ov);

  const pickCat = (cat, anchorFrac) => {
    const preds = {
      scotus: (d) => d.row.court_level === "scotus" && d.row.photo_url,
      district: (d) => d.row.court_level === "district",
      appellate: (d) => d.row.court_level === "circuit",
      marked: (d) => d.node.tagName === "circle" && d.node.classList.contains("cta-aff-fedsoc"),
      senior: (d) => d.status === "senior",
      departed: (d) => d.status === "departed" && d.row.court_level !== "scotus",
    };
    return A.dots.filter((d) => preds[cat]?.(d) && inView(d))
      .sort((a, b) => Math.abs(sx(a) - w * anchorFrac) - Math.abs(sx(b) - w * anchorFrac))[0];
  };
  // An arrow's head normally auto-picks the nearest in-view dot of its `target` CATEGORY —
  // that keeps the shipped explainer resilient to data changes. `targetPerson`/`targetDate`
  // (set via tools/tune-explainer.html's dot-picker) instead pin an exact dot; if that exact
  // dot isn't resolvable in the current view (e.g. panned away), it falls back to the category
  // pick rather than drawing nothing.
  const pickTarget = (a, anchorFrac) => {
    if (a.targetPerson) {
      const hit = A.dots.find((d) => d.row.full_name === a.targetPerson &&
        (!a.targetDate || d.row.commission_date === a.targetDate) && inView(d));
      if (hit) return hit;
    }
    return pickCat(a.target, anchorFrac);
  };

  const boxNodes = {};
  for (const b of cfg.boxes) {
    const n = el("div", "cta-explainer-box" + (b.bg === false ? " cta-explainer-nobg" : ""));
    n.innerHTML = b.text;
    n.dataset.boxId = b.id;
    // % of the chart box (not px): position tracks the container CONTINUOUSLY on resize,
    // no JS/resize-listener needed, matching how the arrow SVG (width/height:100%) already
    // scales natively. Size/font use container-query units (relative to .cta-chart-wrap,
    // see EXPLAINER_REF_W below) for the same reason — cfg.w/cfg.size render literally at
    // the reference width and scale proportionally off it; clamp() floors/ceilings keep
    // text legible at extreme sizes and no-ops gracefully (falls back to the stylesheet's
    // fixed px default) in browsers without container-query-unit support.
    n.style.left = `${(b.xf * 100).toFixed(3)}%`;
    n.style.top = `${(b.yf * 100).toFixed(3)}%`;
    const wPx = b.w || 210, sizePx = b.size || 11;
    n.style.maxWidth = `clamp(${Math.round(wPx * 0.55)}px, ${(wPx / EXPLAINER_REF_W * 100).toFixed(3)}cqw, ${Math.round(wPx * 1.6)}px)`;
    n.style.fontSize = `clamp(${Math.max(8, Math.round(sizePx * 0.75))}px, ${(sizePx / EXPLAINER_REF_W * 100).toFixed(3)}cqw, ${Math.round(sizePx * 1.6)}px)`;
    if (b.color) n.style.color = b.color;
    if (b.bold) n.style.fontWeight = "700";
    if (b.italic) n.style.fontStyle = "italic";
    if (b.underline) n.style.textDecoration = "underline";
    wrap.append(n);
    boxNodes[b.id] = n;
  }

  cfg.arrows.forEach((a, idx) => {
    const bn = boxNodes[a.from];
    const bcfg = cfg.boxes.find((x) => x.id === a.from);
    if (!bn || !bcfg) return;
    const target = pickTarget(a, bcfg.xf);
    if (!target) return;
    const edge = a.edge || "top";
    // tailXf/tailYf (chart-fraction, set by dragging the tail handle in the tuning tool)
    // override the box-edge default so the tail isn't locked to the box's top/bottom center.
    const x0 = a.tailXf != null ? a.tailXf * w : bn.offsetLeft + bn.offsetWidth / 2;
    const y0 = a.tailYf != null ? a.tailYf * h
      : edge === "bottom" ? bn.offsetTop + bn.offsetHeight + 2 : bn.offsetTop - 2;
    const x1 = sx(target) + (a.dx || 0);
    const y1 = sy(target) + (edge === "top" ? target.r + 4 : -target.r - 4) + (a.dy || 0);
    const color = a.color || cfg.arrowColor;
    const width = a.width || cfg.arrowWidth;
    const mkId = `cta-arrow-${A.uid}-${idx}`;
    const mk = svgEl("marker", { id: mkId, viewBox: "0 0 10 10", refX: 8, refY: 5,
      markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" });
    mk.append(svgEl("path", { d: "M 0 0 L 10 5 L 0 10 z", fill: color }));
    defs.append(mk);
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    const ddx = x1 - x0, ddy = y1 - y0, len = Math.hypot(ddx, ddy) || 1;
    const cx = mx - (ddy / len) * (a.bend || 0), cy2 = my + (ddx / len) * (a.bend || 0);
    ov.append(svgEl("path", { class: "cta-explainer-arrow", "data-arrow-i": idx,
      d: `M ${x0} ${y0} Q ${cx} ${cy2} ${x1} ${y1}`,
      stroke: color, "stroke-width": width, "marker-end": `url(#${mkId})` }));
  });
  ov.prepend(defs);

  A.explainer.node = wrap;
}

// ---- entry -----------------------------------------------------------------------
export async function mount(root, opts = {}) {
  A.uid++;
  A.assetRoot = resolveAssetRoot(root, opts);   // issue #2 — see resolveAssetRoot() above
  buildShell(root);
  try {
    A.manifest = await fetchJSON("data/manifest.json", { cache: "no-cache" });
    const [courts, rows, presidentPhotos] = await Promise.all([
      fetchJSON(A.manifest.files?.courts || "data/courts.json"),
      fetchJSON(A.manifest.files?.appointments || "data/appointments.json"),
      fetchJSON(A.manifest.files?.president_photos || "data/president_photos.json").catch(() => ({})),
    ]);
    for (const c of courts) A.courts.set(c.court_id, c);
    A.rows = rows;
    A.presidentPhotos = presidentPhotos;

    A.reorgByPerson.clear();
    A.personDots.clear();
    A.dots = [];
    A.chiefMerges = 0;
    // Elevation to Chief Justice is a CONTINUED seat on the Court, not a second bench
    // (operator call): merge the associate row and the chief row into one dot anchored at
    // the ORIGINAL commission, carrying "became Chief Justice" + the FINAL departure.
    const byPersonScotus = new Map();
    for (const r of rows) {
      if (r.court_id === "scotus" && r.commission_date) {
        const k = personKey(r);
        if (!byPersonScotus.has(k)) byPersonScotus.set(k, []);
        byPersonScotus.get(k).push(r);
      }
    }
    const chiefOf = new Map();   // first-row -> chief row ; laterRow -> "skip"
    for (const [, rs] of byPersonScotus) {
      if (rs.length < 2) continue;
      rs.sort((a, b) => a.commission_date.localeCompare(b.commission_date));
      if (/appointment to another/i.test(rs[0].termination_reason || "")) {
        chiefOf.set(rs[0], rs[1]);
        chiefOf.set(rs[1], "skip");
        A.chiefMerges++;
      }
    }
    let minD = Infinity, maxD = -Infinity;
    for (let r of rows) {
      if (!r.commission_date) continue;
      const person = personKey(r);
      if ((r.appointing_president || "").startsWith("None")) {
        // statutory reorganization: an info line on the person's real dots, never a dot
        if (!A.reorgByPerson.has(person)) A.reorgByPerson.set(person, []);
        A.reorgByPerson.get(person).push({ court_id: r.court_id, date: r.commission_date });
        continue;
      }
      let chiefDate = null;
      const chief = chiefOf.get(r);
      if (chief === "skip") continue;               // folded into the associate row's dot
      if (chief) {
        chiefDate = chief.commission_date;
        // one continued tenure: original commission, final senior/termination/status
        r = { ...r, senior_date: chief.senior_date, termination_date: chief.termination_date,
              termination_reason: chief.termination_reason, sitting: chief.sitting,
              chief_by: chief.appointing_president };
      }
      // A recess appointee took the bench at the RECESS date (e.g. Roger Gregory: Clinton
      // recess-appointed him 2000-12-27, the regular commission under the next president
      // followed 2001-07-25) — plotting at the recess date keeps the dot inside the term of
      // the president FJC credits with the appointment.
      const day = days(r.recess_appointment_date || r.commission_date);
      minD = Math.min(minD, day);
      maxD = Math.max(maxD, day);
      const status = statusOf(r);
      const cls = status === "departed" ? "cta-departed"
        : r.president_party ? `cta-${status}-${r.president_party}` : "cta-neutral";
      const d = { i: A.dots.length, row: r, day, person, status, cls, chiefDate, x: 0, y: 0, r: 4 };
      A.dots.push(d);
      if (!A.personDots.has(person)) A.personDots.set(person, []);
      A.personDots.get(person).push(d);
    }
    A.day0 = Math.min(minD, days(PRESIDENCIES[0][0]));
    A.dayMax = Math.max(maxD, Math.floor(Date.now() / DAY));

    const years = Math.ceil((A.dayMax - A.day0) / 365.25);
    configureSpanControl(years);
    const narrow = typeof window !== "undefined" && window.matchMedia
      && window.matchMedia("(max-width: 640px)").matches;
    A.ui.subtitle.textContent =
      `${A.dots.length} appointments since 1969 · data v${A.manifest.version || "?"}`;
    A.ui.status.remove();
    resetDetail();
    wireInteractions();
    setSpan(narrow ? 4 : 8, A.dayMax + 90);
  } catch (err) {
    A.ui.status.innerHTML = `Appointment data could not be loaded.<br><small>${String(err.message || err)}</small>`;
    console.error("[appointments-chart] load failed:", err);
  }
  return A.ui;
}

function autoMount() {
  const root = document.getElementById("appointments-chart-root");
  if (root && !root.dataset.ctaMounted) { root.dataset.ctaMounted = "1"; mount(root); }
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", autoMount);
else autoMount();
export default mount;

// Dev/test hook only — not part of the embed API.
export const _dev = { A, layoutDots, drawAll, setSpan, packSwarm, relievePileups,
  toggleExplainer, dismissExplainer, buildExplainerOverlay, EXPLAINER_DEFAULT,
  days, isoOfDay, ivDays };
