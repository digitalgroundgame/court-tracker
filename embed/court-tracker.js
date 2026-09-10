// court-tracker.js — embeddable federal-court appointment tracker (ES module).
//
// Phase 1: the 8th-Circuit vertical slice, end-to-end, against REAL geometry.
// National view (circuit shapes + districts) -> single-click a circuit -> slide-down info
// pane with the bench (judge icons, party rings, seniors, vacancies, chief, Circuit Justice)
// -> majority semicircle toggle -> "View districts" drill-in (per-vertex morph from the
// national projection to the circuit-local one; zoom+crossfade fallback) -> back.
//
// Assets are fetched relative to import.meta.url by default and lazy-loaded (national view
// loads only courts.json + national.svg; a circuit's judges + local SVG load on demand), so the
// widget runs from file://, when archived, and as a static download. That default can be
// overridden per-mount (issue #2) for a publisher serving the script from a different origin/path
// than data/assets/ — see resolveAssetRoot()'s doc comment.

import { PRESIDENCIES } from "./presidencies.js";

// Default: everything (embed/, data/, assets/) stays in one tree, one directory below wherever
// this script is served from — the layout this repo ships as-is.
const DEFAULT_ASSET_ROOT = new URL("../", import.meta.url);
// Where to resolve `data/`, `assets/geo/`, `assets/photos/` from, for the CURRENT mount. Set once
// per mount() call (below), read by every fetch for that mount's lifetime.
//
// Override precedence: `mount(root, {assetRoot})` argument > `data-asset-root` on the root div >
// DEFAULT_ASSET_ROOT above. A relative override (e.g. "https://cdn.example.com/court-data/", or
// just "/court-data/") resolves against `document.baseURI` (the HOST page's location) — NOT
// against this script's own URL — since the whole point is decoupling "where the script is
// served from" from "where the data is." No code change either way: still a data/config-only
// knob, matching CLAUDE.md §6's "no code edits for asset updates" principle.
function resolveAssetRoot(root, opts) {
  const override = opts?.assetRoot ?? root?.dataset?.assetRoot;
  return override ? new URL(String(override), document.baseURI) : DEFAULT_ASSET_ROOT;
}
// The manifest's content-hash version is appended to every asset URL — this IS the
// cache-busting the manifest exists for (CLAUDE.md §6), and it was documented but never
// implemented until 2026-07-19: Chrome's heuristic cache (10% of a file's age, and python
// -m http.server sends Last-Modified) happily served a STALE seat_blocks.json, so the
// operator's CSV edits + rebuild changed nothing on screen. http(s) only — file:// and
// odd archive setups keep plain URLs (query strings there range from ignored to broken).
const resolve = (rel) => {
  const u = new URL(rel, S.assetRoot);
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
  assetRoot: DEFAULT_ASSET_ROOT,  // recomputed per mount() call; see resolveAssetRoot() above
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
  _seniorModeForced: null,    // value to revert `seniorMode` to on the NEXT pane render, or null
                               // — set when search auto-reveals a hidden senior (see pinSearchedJudge);
                               // a real manual click on the Hide|Show|Include switch cancels this.
  affilMark: "none",          // 'none' | 'fedsoc' | 'acs' — CURRENTLY APPLIED mark (what's actually
                               // rendered right now; SCOTUS's own fixed FedSoc convention lives
                               // only here, applied fresh on every SCOTUS render — see issue #68).
  _affilMarkUserChoice: "none",   // the last REAL choice made on an ordinary court's None|FedSoc|
                               // ACS switch — restored into `affilMark` whenever a non-SCOTUS pane
                               // renders, so SCOTUS's own always-FedSoc convention can never leak
                               // into or permanently overwrite it (issue #68).
  detailPinned: false,
  appointmentsAll: null,      // data/appointments.json, lazy-loaded once for the Change view
  presidentPhotos: null,      // data/president_photos.json, lazy-loaded once
  streamColorScheme: "alt",   // 'alt' | 'fade' — Change view palette (operator A/B, CLAUDE ask)
  summaryView: "scotus",      // 'scotus' | 'appellate' | 'district' — Summary pane sub-tab
  districtArrangement: null,  // data/district_arrangement.json, lazy-loaded once (Summary > District)
  districtArrangementAlt: null,  // data/district_arrangement_alt.json, lazy-loaded once (ca1/ca3 drill-in sub-assembly only)
  districtOnMap: false,       // is the deployed cartogram currently VISIBLE on the national map
  districtMapState: null,     // { left, top, width } CSS px in .ctt-map-viewport — persists
                               // across show/hide toggles; reset only by a fresh deploy from
                               // Summary ("Set upon map" always replaces — operator confirmed)
  districtDetailPinnedId: null,   // pinned district court_id in Summary > District, or null
  searchIndex: null,          // data/judges_search.json, lazy-loaded once on first search use
  searchIndexPromise: null,   // in-flight fetch (dedupes concurrent keystrokes before it resolves)
  searchSeq: 0,                // guards against a stale (superseded) search render
  searchRovingPref: new Map(), // full_name -> last court index picked for a roving judgeship,
                                // persisted for this page session (survives re-searching, reset
                                // only on a fresh mount — NOT scoped to one render of the row)
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

// ---- header search bar ---------------------------------------------------------
// Matches judges by name (misspelling-tolerant, word-order-independent), highlights the
// matched portion, and sorts by match quality tier, then Supreme > Appellate > District,
// then circuit order, then alphabetically (operator spec, 2026-09-05).

// Surname alone is ambiguous for these families only; every other appointing_president in the
// data (Nixon onward — judges.csv covers sitting judges only) resolves to its surname unaided.
const PRESIDENT_SHORTHAND = {
  "George H.W. Bush": "G.H.W. Bush",
  "George W. Bush": "G.W. Bush",
};
function presidentShorthand(name) {
  if (!name || name.startsWith("None")) return null;   // statutory-reassignment rows (no appointer)
  if (PRESIDENT_SHORTHAND[name]) return PRESIDENT_SHORTHAND[name];
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1];
}
function partyLetter(party) {
  if (party === "Republican") return "R";
  if (party === "Democratic") return "D";
  return party ? "O" : null;
}

// Word tokenizer with source offsets, so a match can be highlighted back in the original string.
function nameTokens(str) {
  const out = [];
  const re = /[A-Za-z]+/g;
  let m;
  while ((m = re.exec(str))) out.push({ text: m[0], lower: m[0].toLowerCase(), start: m.index, end: m.index + m[0].length });
  return out;
}
// Iterative-DP Levenshtein distance (case handled by the caller passing lowercased strings).
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array(n + 1), curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}
/** Score one query word against one name word: exact > prefix > substring > misspelling-tolerant
 *  fuzzy (edit distance), 0 = no match at all. Also returns the substring of the NAME word that
 *  should be highlighted (best-effort: the whole word for a fuzzy match, since edit distance
 *  doesn't align to a specific span). */
function wordMatch(q, t) {
  if (!q || !t) return null;
  if (q === t) return { score: 100, start: 0, end: t.length };
  if (t.startsWith(q)) return { score: 88, start: 0, end: q.length };
  const idx = t.indexOf(q);
  if (q.length >= 3 && idx >= 0) return { score: 74, start: idx, end: idx + q.length };
  if (q.length >= 3) {
    const tol = q.length <= 5 ? 1 : q.length <= 9 ? 2 : 3;
    const dist = levenshtein(q, t);
    if (dist <= tol) return { score: Math.max(45, 60 - dist * 12), start: 0, end: t.length };
  }
  return null;
}
/** Score a query against a judge's full_name. Every query word must find SOME matching name
 *  word (any order — this is how word-reordering tolerance works: each query word is matched
 *  independently against every name word); if any query word matches nothing, the judge fails
 *  entirely. Overall score is the average of each query word's best match. Returns null below
 *  the minimum-quality threshold. */
const SEARCH_MIN_SCORE = 45;
function scoreJudgeMatch(query, fullName) {
  const qWords = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!qWords.length) return null;
  const nWords = nameTokens(fullName);
  if (!nWords.length) return null;
  let total = 0;
  const ranges = [];
  for (const q of qWords) {
    let best = null, bestWord = null;
    for (const w of nWords) {
      const m = wordMatch(q, w.lower);
      if (m && (!best || m.score > best.score)) { best = m; bestWord = w; }
    }
    if (!best) return null;   // this query word matched nothing — whole judge disqualified
    total += best.score;
    ranges.push({ start: bestWord.start + best.start, end: bestWord.start + best.end });
  }
  const score = total / qWords.length;
  if (score < SEARCH_MIN_SCORE) return null;
  const tier = score >= 85 ? 0 : score >= 65 ? 1 : 2;   // "groups of quality match"
  return { score, tier, ranges };
}
/** Wrap the ranges scoreJudgeMatch found in a bolding span, merging any overlaps. */
function highlightName(fullName, ranges) {
  const sorted = ranges.slice().sort((a, b) => a.start - b.start);
  const merged = [];
  for (const r of sorted) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else merged.push({ ...r });
  }
  let out = "", pos = 0;
  for (const r of merged) {
    out += fullName.slice(pos, r.start);
    out += `<span class="ctt-search-match">${fullName.slice(r.start, r.end)}</span>`;
    pos = r.end;
  }
  out += fullName.slice(pos);
  return out;
}
// courtRank groups results Supreme(0) > Appellate(1) > District(2) > USCIT/CFC(3, the two
// Federal-Circuit feeders — not named in the operator's spec, but real sitting judges the app
// already tracks; placed after District since they're reached the same "drill deeper" way).
function courtRank(court) {
  if (court.court_level === "scotus") return 0;
  if (court.court_level === "circuit") return 1;
  if (court.court_level === "district") return 2;
  return 3;
}
/** `courts` is an array — usually one court, but a ROVING judgeship (28 U.S.C. §133 shares a
 *  seat across same-state districts, e.g. E.D./W.D. Missouri) puts the SAME judge on multiple
 *  district benches at once, and search merges those into one result (see `searchAndSort`) —
 *  so its label lists every court, e.g. "E.D. Mo. / W.D. Mo. (8th Cir.)". */
function courtLabelFor(courts) {
  const primary = courts[0];
  if (primary.court_level === "scotus") return "Supreme Court";
  if (primary.court_level === "district") {
    const circuit = S.courts.get(primary.parent_id);
    const names = courts.map((c) => c.short_name).join(" / ");
    return circuit ? `${names} (${circuit.short_name})` : names;
  }
  return courts.map((c) => c.short_name).join(" / ");   // circuit ("8th Cir.") or specialized
}
function searchResultCourtOrderKey(court) {
  if (court.court_level === "district") {
    const circuit = S.courts.get(court.parent_id);
    return circuit ? byCircuitOrderKey(circuit) : "";
  }
  return byCircuitOrderKey(court);
}
async function ensureSearchIndex() {
  if (S.searchIndex) return S.searchIndex;
  if (!S.searchIndexPromise) {
    const path = S.manifest?.files?.judges_search;
    S.searchIndexPromise = (path ? fetchJSON(path) : Promise.resolve([]))
      .then((data) => { S.searchIndex = data; return data; })
      .catch((err) => { S.searchIndexPromise = null; throw err; });
  }
  return S.searchIndexPromise;
}
function searchAndSort(query, index) {
  const results = [];
  for (const rec of index) {
    // A roving-judgeship entry (see build_assets.py) carries `court_ids` (plural) instead of
    // `court_id` — one real judge, multiple simultaneous district seats. `courts[0]` (the FIRST
    // in the build-time-sorted list, so this is deterministic build-to-build) is the "primary"
    // court used for sorting and as the click target; the full list is still shown in the label.
    const courtIds = rec.court_ids || [rec.court_id];
    const courts = courtIds.map((id) => S.courts.get(id)).filter(Boolean);
    if (!courts.length) continue;
    const m = scoreJudgeMatch(query, rec.full_name);
    if (!m) continue;
    results.push({ rec, courts, court: courts[0], tier: m.tier, score: m.score, ranges: m.ranges });
  }
  results.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    const ra = courtRank(a.court), rb = courtRank(b.court);
    if (ra !== rb) return ra - rb;
    if (ra === 0) return b.score - a.score;   // Supreme: only one court, fall back to score
    if (ra === 1) return byCircuitOrderKey(a.court).localeCompare(byCircuitOrderKey(b.court));
    if (ra === 2) {
      const ka = searchResultCourtOrderKey(a.court), kb = searchResultCourtOrderKey(b.court);
      if (ka !== kb) return ka.localeCompare(kb);
      return a.court.short_name.localeCompare(b.court.short_name);
    }
    return a.court.short_name.localeCompare(b.court.short_name);   // uscit/uscfc
  });
  return results;
}
async function runSearch(query) {
  const mySeq = ++S.searchSeq;
  const q = query.trim();
  if (!q) { hideSearchResults(); return; }
  let index;
  try { index = await ensureSearchIndex(); }
  catch (err) { console.error("[court-tracker] search index unavailable:", err.message); return; }
  if (mySeq !== S.searchSeq) return;   // a newer keystroke already superseded this
  renderSearchResults(searchAndSort(q, index));
}
/** A roving judge (multiple simultaneous court seats — see `searchAndSort`) gets one small
 *  button PER court instead of plain text, so a click jumps to that SPECIFIC one. Rows can't be
 *  real `<button>` elements any more for this reason (nesting a `<button>` inside a `<button>`
 *  is invalid HTML and unreliable across browsers) — `renderSearchResults` uses a `role="option"`
 *  div for every row instead, roving or not, so all rows share one consistent structure. The
 *  court at `row._selectedIdx` (already resolved by the caller — see `rovingSelectedIdx`) starts
 *  marked as current (`.ctt-is-selected` — bold/accent text, the operator's own "visible marker
 *  of text formatting"); ArrowLeft/Right (wired in `buildShell`) and a direct click on ANY
 *  button both move that mark via `setRovingSelection`, which also PERSISTS the choice — a click
 *  is not just an immediate jump, it is also "set this as the mark" (operator spec). Every
 *  button carries its own `tabindex="-1"` — they are reachable by mouse and by the row's own
 *  ArrowLeft/Right, not by Tab, matching how the rows themselves are only reachable via
 *  ArrowUp/Down (a typeahead-combobox pattern, not a plain tab-through list). */
function buildRovingCourtLabel(row, courts) {
  const nodes = [];
  const primary = courts[0];
  const circuit = primary.court_level === "district" ? S.courts.get(primary.parent_id) : null;
  courts.forEach((c, i) => {
    if (i > 0) nodes.push(document.createTextNode(" / "));
    const btn = el("button", "ctt-search-court-btn" + (i === row._selectedIdx ? " ctt-is-selected" : ""),
      { type: "button", tabindex: "-1" });
    btn.textContent = c.short_name;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();   // the row itself has no click-to-navigate of its own for a roving judge
      setRovingSelection(row, i);
      navigateToSearchResult(c.court_id, row._fullName);
    });
    nodes.push(btn);
  });
  if (circuit) nodes.push(document.createTextNode(` (${circuit.short_name})`));
  return nodes;
}
/** The court most recently picked (by click OR arrow key — `setRovingSelection` records both
 *  identically) for THIS judge, so re-searching them later in the same page session reopens on
 *  the same court rather than resetting to the first one every time (operator spec: "preserved
 *  over the page session"). Clamped in case stale data ever disagreed with a live court count
 *  (defensive only — within one session `judges_search.json` never changes underneath itself). */
function rovingSelectedIdx(fullName, count) {
  const saved = S.searchRovingPref.get(fullName);
  return typeof saved === "number" && saved >= 0 && saved < count ? saved : 0;
}
function setRovingSelection(row, idx) {
  row._selectedIdx = idx;
  S.searchRovingPref.set(row._fullName, idx);
  row.querySelectorAll(".ctt-search-court-btn").forEach((b, i) => b.classList.toggle("ctt-is-selected", i === idx));
}
function renderSearchResults(results) {
  const { searchResults } = S.ui;
  searchResults.innerHTML = "";
  if (!results.length) {
    const empty = el("div", "ctt-search-empty");
    empty.textContent = "No matching judges.";
    searchResults.append(empty);
  } else {
    for (const r of results.slice(0, 60)) {
      const roving = r.courts.length > 1;
      const row = el("div", "ctt-search-result" + (roving ? " ctt-search-result-roving" : ""),
        { role: "option", tabindex: "-1" });
      row._courts = r.courts;
      row._fullName = r.rec.full_name;
      row._selectedIdx = roving ? rovingSelectedIdx(r.rec.full_name, r.courts.length) : 0;
      const nameLine = el("div", "ctt-search-name");
      nameLine.innerHTML = highlightName(r.rec.full_name, r.ranges) +
        (r.rec.status === "senior" ? ` <span class="ctt-search-senior">Senior</span>` : "");
      // Two SEPARATE flex children, not one string of text — president/party and the court
      // label wrap as whole units (never mid-phrase) when the line doesn't fit, landing the
      // president chip on its own line ABOVE the court name (`.ctt-search-meta`'s flex-wrap:
      // wrap does this for free, since a flex item never breaks internally to wrap). This is
      // what keeps a roving judge's (up to three) district buttons from wrapping mid-list
      // (operator spec) while an ordinary single-court row still reads as one line whenever it
      // fits — the WRAP itself is CSS-only, no JS involved. The "· " joiner is its own `.ctt-
      // search-sep` span (not bare text) specifically so it CAN be hidden once wrapped — a
      // small measurement pass at the end of this function (after the list is actually visible,
      // real layout exists) does that; a leading "· " reads as an orphaned bullet on its own
      // line, and only makes sense as an inline joiner between the two halves.
      const metaLine = el("div", "ctt-search-meta");
      const shorthand = presidentShorthand(r.rec.appointing_president);
      const letter = partyLetter(r.rec.president_party);
      const ring = PARTY_CLASS[r.rec.president_party] || "ctt-other";
      if (shorthand) {
        const presWrap = el("span", "ctt-search-president");
        presWrap.innerHTML = `<span class="ctt-dot ${ring}"></span>${shorthand}${letter ? ` (${letter})` : ""}`;
        metaLine.append(presWrap);
      }
      const courtWrap = el("span", "ctt-search-court");
      if (shorthand) {
        const sep = el("span", "ctt-search-sep");
        sep.textContent = "· ";
        courtWrap.append(sep);
      }
      if (roving) courtWrap.append(...buildRovingCourtLabel(row, r.courts));
      else courtWrap.append(document.createTextNode(courtLabelFor(r.courts)));
      metaLine.append(courtWrap);
      row.append(nameLine, metaLine);
      // A roving row's own background has NO click-to-navigate — only its per-court buttons do
      // (operator spec). An ordinary row still jumps on a plain click, same as always.
      if (!roving) row.addEventListener("click", () => navigateToSearchResult(row._courts[0].court_id, row._fullName));
      searchResults.append(row);
    }
  }
  searchResults.classList.add("ctt-is-open");
  // Must run AFTER the class above — while `.ctt-search-results` is still `display:none` every
  // `offsetTop` reads 0 (jsdom's permanent state, but also true of a real browser before this
  // point), so wrap could never be detected. `offsetTop` is real-browser-only either way — see
  // tests/browser-checks.mjs; jsdom asserts nothing here (it always reads 0/0 -> "not wrapped").
  searchResults.querySelectorAll(".ctt-search-result").forEach((row) => {
    const pres = row.querySelector(".ctt-search-president");
    const sep = row.querySelector(".ctt-search-sep");
    const court = row.querySelector(".ctt-search-court");
    if (pres && sep && court) sep.style.display = court.offsetTop > pres.offsetTop ? "none" : "";
  });
}
function hideSearchResults() {
  S.ui.searchResults?.classList.remove("ctt-is-open");
}
/** A senior judge is invisible in Majority view while Seniors is "hide" (`layoutArc` parks them
 *  at dead centre with `place(..., false)` — no outer band, not folded into the arc either), so
 *  pinning one there would dock a detail panel for an icon the reader can't actually see. Bumps
 *  Seniors to "show" (reveals the outer band) and re-lays-out so the judge lands somewhere real,
 *  same as if the reader had clicked Show themselves — but recorded in `S._seniorModeForced` so
 *  `renderPane` can revert it "temporarily... until the info pane is refreshed" (operator spec),
 *  rather than this search click silently becoming the new persistent Seniors preference. */
function revealSeniorForSearch(judge) {
  if (S.paneMode !== "majority" || judge.status !== "senior" || S.seniorMode !== "hide") return;
  S._seniorModeForced = "hide";
  S.seniorMode = "show";
  S.ui.paneBody.querySelector(".ctt-foldrow")?.querySelectorAll(".ctt-mode-opt").forEach((o) =>
    o.classList.toggle("ctt-is-active", o.getAttribute("data-senior") === "show"));
  layoutJudges();
}
/** Auto-pins the searched judge in the docked detail panel after navigating there, the same as
 *  a real click on their icon (onIconClick) — so the reader lands straight on the judge they
 *  searched for, not just their court. A ONE-TIME effect for this viewing of the pane: every
 *  render path that gets here (renderPane/renderSummaryPane) already calls unpinDetail() first
 *  (a fresh court/tab selection always starts unpinned), so this pin does not survive leaving
 *  and re-opening the pane — it is not a new persistent state, just one extra click done for
 *  the reader as part of the jump. */
function pinSearchedJudge(courtId, fullName) {
  const court = S.courts.get(courtId);
  if (!court) return;
  const judge = judgesForCourt(courtId, circuitOf(court)).find((j) => j.full_name === fullName);
  if (!judge) return;
  revealSeniorForSearch(judge);
  const model = S.ui.paneBody.querySelector(".ctt-judge-stage")?._model;
  const node = model?._nodeByJudge?.get(judge);
  if (node) onIconClick(judge, node);
}
/** A search result click can land on a court that isn't reachable from wherever the map
 *  currently is (a different circuit's district, or a district while viewing national) — reuse
 *  the SAME drillIn/drillOut the "View districts"/back UI already uses, so the map/selector/
 *  sub-assembly state stays exactly as consistent as clicking through by hand would leave it.
 *  SCOTUS is a special case: it has no standalone selector entry any more (superseded by the
 *  "Summary" button's own SCOTUS sub-tab — CLAUDE.md's "its own selector entry" requirement is
 *  satisfied there now) and `selectCourt("scotus")` reaches a since-orphaned direct pane that
 *  is otherwise UNREACHABLE from the real UI — routing search there was a bug, not a shortcut.
 *
 *  ALREADY on this exact court/pane (searching a second judge on the same bench, or the same
 *  judge again): `selectCourt`/`selectSummary` both treat "re-select what's already open" as a
 *  CLOSE toggle (their normal behavior for a manual re-click of the same selector item — there's
 *  "nowhere to go"), which is the wrong call here — the reader's intent is "switch/reinstate the
 *  pin", not "close what I just opened". So that case skips navigation entirely and only re-pins;
 *  everything else still routes through the same close-then-reopen-guarded functions unchanged. */
async function navigateToSearchResult(courtId, fullName) {
  const court = S.courts.get(courtId);
  if (!court) return;
  hideSearchResults();
  const alreadyOnThisCourt = S.ui.pane.classList.contains("ctt-is-open") && (
    court.court_level === "scotus"
      ? (S.selectedCourt === SUMMARY_ID && S.summaryView === "scotus")
      : S.selectedCourt === courtId
  );
  if (!alreadyOnThisCourt) {
    if (court.court_level === "scotus") {
      if (S.view === "circuit") await drillOut();
      await selectSummary("scotus");
    } else {
      const wantsCircuit = (court.court_level === "district" || court.court_level === "specialized")
        ? circuitOf(court) : null;
      if (S.view === "circuit" && S.activeCircuit !== wantsCircuit) await drillOut();
      if (wantsCircuit && !(S.view === "circuit" && S.activeCircuit === wantsCircuit)) await drillIn(wantsCircuit);
      await selectCourt(courtId);
    }
  }
  pinSearchedJudge(courtId, fullName);
}

// ---- shell --------------------------------------------------------------------
// Removes everything the PREVIOUS mount registered outside its own root: the window resize
// listener, the document mousedown listener, the body-level tooltip node, and the pending
// resize-debounce timer (issue #6). Handlers are stored on S (not a boolean guard) so they can
// actually be unregistered, not just wired once and forgotten. Called both from the top of
// buildShell (so repeated mount() calls never accumulate globals) and from destroy().
function teardownGlobals() {
  if (S._resizeHandler) { window.removeEventListener("resize", S._resizeHandler); S._resizeHandler = null; }
  if (S._mousedownHandler) { document.removeEventListener("mousedown", S._mousedownHandler); S._mousedownHandler = null; }
  clearTimeout(S._resizeT);
  S.ui?.tooltip?.remove();
}

function buildShell(root) {
  teardownGlobals();
  root.classList.add("ctt-root");
  root.innerHTML = "";

  const header = el("div", "ctt-header");
  const tracked = el("div", "ctt-tracked");
  const titleRow = el("div", "ctt-title-row");
  const titleGroup = el("div", "ctt-title-group");
  const title = el("div", "ctt-title");
  title.textContent = "Federal Court Appointment Tracker";
  const subtitle = el("div", "ctt-subtitle");
  titleGroup.append(title, subtitle);

  // Header search bar — right-aligned in the title row (operator spec, 2026-09-05): searches
  // sitting judges by name as-you-type, click a result to jump to its court's info pane.
  const search = el("div", "ctt-search");
  const searchInput = el("input", "ctt-search-input",
    { type: "text", placeholder: "Search judges…", "aria-label": "Search judges by name", autocomplete: "off" });
  const searchClear = el("button", "ctt-search-clear", { type: "button", "aria-label": "Clear search", title: "Clear" });
  searchClear.textContent = "×";
  const searchResults = el("div", "ctt-search-results", { role: "listbox" });
  search.append(searchInput, searchClear, searchResults);
  searchInput.addEventListener("input", () => {
    searchClear.classList.toggle("ctt-is-visible", !!searchInput.value);
    runSearch(searchInput.value);
  });
  // Refocusing a non-empty box re-shows its last results without retyping (click-away only
  // HIDES the list — CLAUDE.md-equivalent spec: "queries should not clear automatically").
  searchInput.addEventListener("focus", () => { if (searchInput.value) runSearch(searchInput.value); });
  searchClear.addEventListener("click", () => {
    searchInput.value = "";
    searchClear.classList.remove("ctt-is-visible");
    hideSearchResults();
    searchInput.focus();
  });
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { hideSearchResults(); searchInput.blur(); return; }
    if (!searchResults.classList.contains("ctt-is-open")) return;
    const rows = [...searchResults.querySelectorAll(".ctt-search-result")];
    if (!rows.length) return;
    // ArrowDown/Up hand off keyboard focus INTO the results list (rows then navigate each other
    // — see the delegated listener below); ArrowUp wraps to the last row, a standard combobox
    // convenience for "the option just above where I am" when opening upward isn't meaningful.
    if (e.key === "ArrowDown") { e.preventDefault(); rows[0].focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); rows[rows.length - 1].focus(); }
  });
  // Delegated so it works uniformly for every row without N per-row listeners. ArrowUp/Down move
  // focus between rows (a row IS the current "selection" — up from the first row returns to the
  // input, matching a standard combobox). ArrowLeft/Right, Enter and Space only matter for a
  // ROVING-judgeship row (`row._courts.length > 1` — see renderSearchResults/buildRovingCourtLabel):
  // left/right cycle which of the judge's courts is marked as "current" (the carousel), and
  // Enter/Space (equivalent to clicking the row) jump to WHICHEVER one is currently marked —
  // never a fixed default — since for a roving row the row itself has no independent click
  // target of its own (operator spec: "the usual behavior... is turned off... except through
  // its buttons", and the keyboard path must respect that same rule, not bypass it).
  searchResults.addEventListener("keydown", (e) => {
    const row = e.target.closest(".ctt-search-result");
    if (!row) return;
    const rows = [...searchResults.querySelectorAll(".ctt-search-result")];
    const i = rows.indexOf(row);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      (rows[i + 1] || rows[0]).focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (i === 0) searchInput.focus(); else rows[i - 1].focus();
    } else if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && row._courts.length > 1) {
      e.preventDefault();
      const n = row._courts.length;
      const next = e.key === "ArrowRight" ? (row._selectedIdx + 1) % n : (row._selectedIdx - 1 + n) % n;
      setRovingSelection(row, next);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      navigateToSearchResult(row._courts[row._selectedIdx].court_id, row._fullName);
    } else if (e.key === "Escape") {
      hideSearchResults();
      searchInput.focus();
    }
  });

  titleRow.append(titleGroup, search);
  header.append(tracked, titleRow);

  const body = el("div", "ctt-body");
  const selector = el("nav", "ctt-selector", { "aria-label": "Court selector" });
  const viewport = el("div", "ctt-map-viewport");
  const svgStack = el("div", "ctt-svg-stack");   // national + local SVG layers
  const status = el("div", "ctt-status");
  status.textContent = "Loading…";
  // District overlay: the "Set upon map" deployed cartogram. DOM order alone can't be trusted
  // to keep this covered once the info pane slides down over it (CLAUDE.md §5) — it carries its
  // own z-index for the drag/resize chrome, which otherwise outranks the pane's default stacking
  // regardless of DOM order (operator report, 2026-09-06) — so updateDistrictOverlayVisibility()
  // explicitly hides it (display:none) whenever the pane is open, rather than relying on layering.
  const districtOverlay = el("div", "ctt-district-overlay");
  districtOverlay.style.display = "none";
  // Fixed-frame ×/−/+ (deployed) or D (not deployed) controls for the assembly above — anchored
  // to the VIEWPORT's own corner, not the draggable assembly, so dragging the assembly (including
  // partially past the bottom edge — a deliberate way to tuck it out of the way while keeping
  // some of it in view) never carries its controls out of easy reach (operator ask, 2026-09-06).
  const districtCornerControls = el("div", "ctt-district-corner-controls");
  districtCornerControls.style.display = "none";
  viewport.append(svgStack, status, districtOverlay, districtCornerControls);

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
               tooltip, detail, detailContent, districtOverlay, districtCornerControls,
               search, searchInput, searchClear, searchResults, nationalSVG: null };
  S.ui = ui;
  ui.destroy = () => destroy(root);
  S._resizeHandler = () => {
    if (S.selectedCourt) layoutJudges();
    if (S.districtOnMap) sizeDistrictOverlay();
    // Square size is in screen px, so the px->map-unit conversion is viewport-dependent.
    clearTimeout(S._resizeT);
    S._resizeT = setTimeout(refreshSeatBlocks, 120);
  };
  window.addEventListener("resize", S._resizeHandler);
  // Click anywhere that isn't the pinned panel or a judge icon unpins it (#20). Same standard
  // extended to the district docked panel (operator ask, 2026-09-05: it was missing this "click
  // elsewhere to close" behavior every other docked panel in the app has). Handler is stored on
  // S (not a fire-once boolean) so destroy()/a fresh mount can actually remove it (issue #6).
  S._mousedownHandler = (e) => {
    if (S.detailPinned) {
      if (S.ui.detail.contains(e.target)) return;
      if (e.target.closest && e.target.closest(".ctt-judge")) return;
      unpinDetail();
    }
    if (S.districtDetailPinnedId) {
      if (e.target.closest && e.target.closest(".ctt-district-detail")) return;
      if (e.target.closest && e.target.closest(".ctt-district-sq")) return;
      unpinDistrictDetail();
    }
    // Clicking away from the search UI hides the results list (the typed query itself is
    // NOT cleared — only the × button or deleting the text clears it, operator spec).
    if (S.ui.searchResults.classList.contains("ctt-is-open")) {
      if (e.target.closest && e.target.closest(".ctt-search")) return;
      hideSearchResults();
    }
  };
  document.addEventListener("mousedown", S._mousedownHandler);
  return ui;
}

function togglePane(open) {
  const { pane, stow } = S.ui;
  pane.classList.toggle("ctt-is-open", open);
  stow.textContent = open ? "▲" : "▼";
  stow.title = open ? "Hide" : "Show";
  // The pane "slides down over the map, covering it fully" (CLAUDE.md §5) — the district
  // assembly (deployed-on-map or the circuit-drill-in fixed sub-assembly) must actually go
  // AWAY while that's true, not just get visually covered (operator report, 2026-09-06: the
  // deployed overlay has its own z-index for the drag/resize chrome, which put it ABOVE the
  // pane's own default stacking regardless of DOM order — a real bug, not merely cosmetic
  // layering). The one deliberate exception is the deploy "pull out" flyover
  // (deployDistrictOverlayAnimated) — that's a SEPARATE, short-lived element (.ctt-district-
  // flyover) this rule never touches, and by the time the real persistent overlay reappears
  // the pane it flew out of is already closed.
  updateDistrictOverlayVisibility();
  updateDistrictSubassemblyVisibility();
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
    for (const j of await fetchJSON(path)) {
      // circuit_justices.json no longer duplicates `justice_name` as `full_name` (Schema 2.0,
      // issue #28) — the judge-icon renderer (makeIcon/initials/showDetail) reads `full_name`
      // uniformly across both judge and justice records, so synthesize it once here at load
      // time rather than special-casing every render call site.
      j.full_name = j.justice_name;
      S.justices.set(j.circuit_id, j);
    }
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
  btn.addEventListener("click", () => selectSummary());   // NOT `selectSummary` directly — the
  // click Event would otherwise land in its optional `view` param (see selectSummary's own note).
  if (S.selectedCourt === SUMMARY_ID) btn.classList.add("ctt-is-selected");
  sel.append(btn);
}
function addBackButton(sel) {
  const back = el("button", "ctt-selector-back", { type: "button" });
  back.textContent = "← Back to national";
  back.addEventListener("click", drillOut);
  sel.append(back);
}
// "ca1".."ca11" -> "001".."011" (numeric-first padding), "cadc"/"cafc" -> "0dc"/"0fc" (digits
// sort before letters, so D.C. then Federal Circuit land after every numbered circuit).
function byCircuitOrderKey(court) {
  return court.court_id.replace(/^ca/, "").padStart(3, "0");
}
function byCircuitOrder(a, b) {
  return byCircuitOrderKey(a).localeCompare(byCircuitOrderKey(b));
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
/** `view`, if given, forces a specific Summary sub-tab (used by search navigation, which needs
 *  to land on SCOTUS specifically, not whatever sub-tab was last viewed — S.summaryView
 *  otherwise "persists across re-opens" by design). CALLERS: the button click handler passes
 *  no `view` (must call `selectSummary()`, never bare `selectSummary` as a listener, or the
 *  click Event itself would land here). */
async function selectSummary(view) {
  if (view) S.summaryView = view;
  if (S.selectedCourt === SUMMARY_ID && S.ui.pane.classList.contains("ctt-is-open")) {
    // Re-clicking the Summary button while already on it toggles the pane closed (unchanged
    // default). A forced `view` means this is a JUMP request (e.g. from search), not a toggle —
    // switch sub-tab in place instead of closing.
    if (!view) { deselect(); return; }
    renderSummaryPane();
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
  unpinDistrictDetail();
  togglePane(false);
  highlightSelector(null);
  clearShapeHighlight();
}

function renderPane(court) {
  // Restore the ordinary switch's own last real choice — undoes SCOTUS's temporary FedSoc
  // override (renderSummaryScotus) the moment any non-SCOTUS pane renders, so that override can
  // never leak into or permanently overwrite this court's own preference (issue #68). A no-op
  // when nothing SCOTUS-side has changed `affilMark` since the last ordinary render.
  S.affilMark = S._affilMarkUserChoice;
  unpinDetail();          // a new court's pane starts with no pinned/leftover detail (#20)
  // Undo a search-triggered temporary Seniors reveal (see pinSearchedJudge) — it lasts only
  // "until the info pane is refreshed" (operator spec), and a fresh renderPane IS that refresh,
  // whether it's a different court or the same one reopened. A real manual click on the
  // Hide|Show|Include switch already cleared this itself, so it can never clobber one.
  if (S._seniorModeForced) { S.seniorMode = S._seniorModeForced; S._seniorModeForced = null; }
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
      S._affilMarkUserChoice = mode;   // the real, persistent preference (issue #68) — SCOTUS's
                                        // own fixed convention restores FROM this, never writes TO it
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
      S._seniorModeForced = null;   // a real manual choice — cancel any pending search auto-revert
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
  // pane's own heading, so the separate "Summary" title + "Supreme Court · Appellate Courts ·
  // District Courts" subtitle line above it were removed as redundant (operator ask; the
  // "Summary" selector-bar entry itself is unchanged).
  const subWrap = el("div", "ctt-mode-switch ctt-summary-switch", { role: "group", "aria-label": "Summary section" });
  const tabs = [["scotus", "Supreme Court"], ["appellate", "Appellate Courts"], ["district", "District Courts"]];
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

  // FedSoc-reported affiliation is SCOTUS's own fixed display convention (operator ask,
  // 2026-09-11: "SCOTUS has few enough judges, it's worth having some custom iconography") —
  // applied UNCONDITIONALLY on every SCOTUS render, regardless of whatever the ordinary
  // None|FedSoc|ACS switch is currently set to elsewhere (confirmed by the operator directly,
  // 2026-09-10, after an earlier version of this fix gated it on "only if the ordinary switch has
  // never been touched," which was wrong: setting the ordinary switch to e.g. "None" then
  // visiting SCOTUS incorrectly showed SCOTUS as "None" too, instead of SCOTUS's own convention).
  // `S.affilMark` here is a temporary, display-only override — leaving SCOTUS via `renderPane`
  // restores it from `S._affilMarkUserChoice`, the actual persistent ordinary-court preference,
  // which this line never reads from or writes to.
  S.affilMark = "fedsoc";
  // Key/legend explaining the dashed-ring convention, in the same header band as the title/meta
  // text above (operator ask, 2026-09-11) — .ctt-summary-content has position:relative for
  // exactly this anchor. Horizontal placement is centerward-but-clear-of-the-text, computed by
  // positionScotusAffilKey() below (issue #69: it used to sit flush right, which the operator
  // found easy to miss) — CSS only sets its vertical position and the position:absolute needed
  // for that JS-driven `left` to apply.
  const affilKey = el("div", "ctt-scotus-affil-key");
  affilKey.innerHTML = `<span class="ctt-scotus-affil-key-swatch"></span>` +
    `= <em>reported</em> <strong>FedSoc</strong> <em>affiliation</em>`;
  container.append(affilKey);

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

// Circuits with an ALTERNATE drill-in sub-assembly layout (operator ask, 2026-09-10): the
// national/Summary-preview cartogram positions PR/VI relative to EACH OTHER (a deliberate
// cross-circuit layout choice), which reads wrong for a single circuit's own sub-assembly — see
// scripts/build_district_arrangement_alt.py's docstring. Only that ONE presentation (never the
// deployed national overlay or the Summary preview) uses this data.
const DISTRICT_SUBASSEMBLY_ALT_CIRCUITS = new Set(["ca1", "ca3"]);
async function loadDistrictArrangementAlt() {
  if (S.districtArrangementAlt) return S.districtArrangementAlt;
  const path = S.manifest.files?.district_arrangement_alt;
  S.districtArrangementAlt = path ? await fetchJSON(path) : { circuits: [] };
  return S.districtArrangementAlt;
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

function districtsForCircuit(circuitId) {
  return [...S.courts.values()].filter((c) => c.court_level === "district" && c.parent_id === circuitId)
    .sort((a, b) => a.short_name.localeCompare(b.short_name));
}

/** Nation-wide district-court totals for the Summary > District caption meta line (operator ask,
 *  2026-09-08) — authorized/active/vacant summed across EVERY district court, not any one
 *  circuit. Precomputed by `build_national_totals()` in `build_assets.py` and shipped in
 *  `manifest.national_totals` (CODEBOOK.md Table H) — moved out of this widget so any consumer
 *  of the raw data package gets the same correct numbers without reimplementing the
 *  reconciliation below.
 *
 *  `active = authorized - vacancies` holds PER COURT only when that court isn't over its base
 *  authorized count — a handful of courts genuinely seat more active judges than §133 assigns
 *  them (shared/roving judgeships across same-state districts, plus the rare FJC status-lag
 *  court; see DATA_SOURCES.md's discrepancy log). `build_seat_blocks()` floors THOSE courts'
 *  `vacancies` at 0 rather than inventing a negative one (a real judge is never "subtracted"
 *  from the block) — which is correct per-court, but means the three NATIONAL totals don't sum
 *  cleanly: active+vacancies can exceed authorized by exactly the summed overage, which
 *  `overAuthorized` reports so the caption can explain the gap instead of just showing numbers
 *  that look like they don't add up (operator report, 2026-09-11: "654+27=681 > 673"). */
function districtNationalTotals() {
  const t = S.manifest?.national_totals;
  return { authorized: t?.authorized ?? 0, active: t?.active ?? 0, vacancies: t?.vacancies ?? 0,
    overAuthorized: t?.over_authorized ?? 0 };
}

/** The circuit-wide table (operator spec, 2026-09-05: "in the style of the [District linker]
 *  table" in tools/district-block-builder.html) — District | R | D | Vacant, no header row,
 *  abbreviated names, count BEFORE the color swatch (the linker tool's own table puts the
 *  swatch first; reversed here per explicit operator preference). Standard (alphabetical)
 *  order, except `targetDid`'s own row, which is pushed to the top and bolded/highlighted —
 *  this is now the SAME treatment whether the district got there by a sticky hover or an
 *  explicit pin (operator correction, 2026-09-05: "the first row+bold+row highlight format
 *  should be in place on-hover by default too" — an earlier draft reserved it for pins only). */
function renderDistrictCircuitTable(content, circuitId, targetDid, onRowClick) {
  const circuit = S.courts.get(circuitId);
  const label = el("div", "ctt-district-table-label");
  label.textContent = `${circuit?.short_name || circuitId} Districts`;
  content.append(label);

  const wrap = el("div", "ctt-district-table-wrap");
  const table = el("table", "ctt-district-table");
  const tbody = el("tbody");
  let districts = districtsForCircuit(circuitId);
  const target = districts.find((d) => d.court_id === targetDid);
  if (target) districts = [target, ...districts.filter((d) => d.court_id !== targetDid)];
  // Total row (operator ask, 2026-09-07): sums each column across every district in the
  // circuit, immediately below the pinned/hovered row at the top — CSS (.ctt-district-row-total)
  // bolds it and flanks it with heavier separator lines so it reads as a distinct summary, not
  // just another row in the list.
  const totals = districts.reduce((acc, d) => {
    const b = S.seatBlocks?.[d.court_id] || {};
    acc.r += b.r ?? 0; acc.d += b.d ?? 0; acc.vacancies += b.vacancies ?? 0;
    return acc;
  }, { r: 0, d: 0, vacancies: 0 });
  districts.forEach((d, i) => {
    const tr = el("tr", "ctt-district-row" + (d.court_id === targetDid ? " ctt-district-row-active" : ""));
    const b = S.seatBlocks?.[d.court_id] || {};
    tr.innerHTML = `<td>${d.short_name}</td>` +
      `<td>${b.r ?? 0}<span class="ctt-district-swatch ctt-district-swatch-rep"></span></td>` +
      `<td>${b.d ?? 0}<span class="ctt-district-swatch ctt-district-swatch-dem"></span></td>` +
      `<td>${b.vacancies ?? 0}<span class="ctt-district-swatch ctt-district-swatch-vacant"></span></td>`;
    // Clicking a district's own row pins it, same as clicking its cartogram block (operator ask,
    // 2026-09-10) — the Total row (built separately below, a different class entirely) is
    // deliberately excluded since it doesn't correspond to any one district.
    if (onRowClick) tr.addEventListener("click", () => onRowClick(d.court_id));
    tbody.append(tr);
    if (i === 0) {
      const totalRow = el("tr", "ctt-district-row-total");
      totalRow.innerHTML = `<td>Total</td>` +
        `<td>${totals.r}<span class="ctt-district-swatch ctt-district-swatch-rep"></span></td>` +
        `<td>${totals.d}<span class="ctt-district-swatch ctt-district-swatch-dem"></span></td>` +
        `<td>${totals.vacancies}<span class="ctt-district-swatch ctt-district-swatch-vacant"></span></td>`;
      tbody.append(totalRow);
    }
  });
  table.append(tbody);
  wrap.append(table);
  content.append(wrap);
}

/** Fills the district docked panel for one district court. `onJump` wires the "Jump to court"
 *  button — drills into the district's own circuit and opens ITS info pane, exactly as if the
 *  operator had picked it from that circuit's own drill-in selector bar (operator spec).
 *  Replaces the old plain R/D/vacant count text (operator ask, 2026-09-05) with the circuit-
 *  wide table. Whether this is a sticky hover or an explicit pin is decided by the CALLER
 *  (renderSummaryDistrict) — this function always renders the same way either way. */
// Order (operator ask, 2026-09-06): the circuit table sits at the TOP, clipped/scrolled at the
// bottom by whatever room is left; the (variable-height, can wrap to multiple lines) court name
// and the fixed-size Jump button anchor the bottom, in that order — so the table's available
// height flexes with however many lines the name needs, not the other way around. This falls
// out of the SAME flex-column mechanics already governing the table wrap's own internal scroll
// (.ctt-district-detail > .ctt-detail-content, flex:1 1 auto/min-height:0 on the table wrap,
// flex:0 0 auto on everything else) purely by DOM order — table first, so it's the one flexible
// item; name and button after it, so they claim exactly what they need before the table gets
// whatever's left.
function showDistrictDetail(content, did, onJump, onRowClick) {
  const court = S.courts.get(did);
  content.innerHTML = "";
  if (court?.parent_id) renderDistrictCircuitTable(content, court.parent_id, did, onRowClick);
  const name = el("div", "ctt-detail-name");
  name.textContent = court?.court_name || did;
  content.append(name);
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
const DISTRICT_OVERLAY_DEFAULT_W = 280;

// Remembers the assembly's ZOOM only (its width — resize +/- move together with the aspect
// ratio, so width alone captures "scale") ACROSS PAGE RELOADS (operator ask, 2026-09-06) —
// deliberately not position, which "Set upon map" already always resets fresh on every deploy.
// Wrapped in try/catch: localStorage can throw (private browsing, disabled storage, some file://
// setups) and this preference is a nicety, never worth crashing the widget over.
const DISTRICT_ZOOM_STORAGE_KEY = "ctt-district-overlay-width";
function loadStoredDistrictWidth() {
  try {
    const v = parseFloat(localStorage.getItem(DISTRICT_ZOOM_STORAGE_KEY));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch { return null; }
}
function saveStoredDistrictWidth(w) {
  try { localStorage.setItem(DISTRICT_ZOOM_STORAGE_KEY, String(w)); } catch { /* nicety only */ }
}

/** Default on-map placement: bottom-right corner of the viewport, sized relative to the
 *  viewport's OWN current width (operator ask: hold aspect ratio, scale with the space
 *  available — a fixed px default would either overflow a mobile viewport or look tiny on a
 *  wide desktop one) and to the last REMEMBERED zoom, if any (operator ask, 2026-09-06 — see
 *  loadStoredDistrictWidth). Re-derived fresh on every "Set upon map" click ("always replaces" —
 *  operator confirmed): POSITION is never read back from a previous deployment's drag, only the
 *  zoom is. */
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
  const baseWidth = loadStoredDistrictWidth() ?? DISTRICT_OVERLAY_DEFAULT_W;
  const width = Math.max(DISTRICT_OVERLAY_MIN_W, Math.min(baseWidth, vw * DISTRICT_OVERLAY_MAX_FRAC));
  const height = width * aspect;
  // `aspect` rides along in the state (not just used to compute the initial height) so
  // sizeDistrictOverlay can always re-derive the CURRENT height from the current width, for the
  // edge-clipping clamp below — it has no other way to know the assembly's rendered height,
  // since only left/top/width actually persist in S.districtMapState.
  return { left: Math.max(8, vw - width - 16), top: Math.max(8, vh - height - 16), width, aspect };
}

/** Single source of truth for whether the deployed national assembly is actually visible:
 *  requires BOTH `districtOnMap` (the show/hide toggle) AND national view (operator spec: "the
 *  full district assembly should not follow the map view into a drill-in view"). Call after
 *  every state change that could affect either input, rather than toggling display directly at
 *  each call site — the earlier docked-detail bug (session bt) was exactly this kind of drift. */
function updateDistrictOverlayVisibility() {
  const paneOpen = S.ui.pane.classList.contains("ctt-is-open");
  const show = S.districtOnMap && S.view === "national" && S.districtMapState && !paneOpen;
  S.ui.districtOverlay.style.display = show ? "" : "none";
  if (!show) highlightDistrictOnMap(null);   // don't leave a shape tinted once it's hidden
  renderDistrictCornerControls();   // same view/pane inputs decide whether IT shows too
}

/** Sub-assembly analogue of updateDistrictOverlayVisibility() (operator report, 2026-09-06):
 *  the circuit-drill-in fixed sub-assembly has no show/hide state of its own to gate on — it's
 *  either mounted for the current circuit or it isn't — so covering it while a pane is open
 *  needs its own hook. A no-op if it isn't even mounted right now. */
function updateDistrictSubassemblyVisibility() {
  const sub = S.ui.viewport.querySelector(".ctt-district-subassembly");
  if (!sub) return;
  sub.style.display = S.ui.pane.classList.contains("ctt-is-open") ? "none" : "";
}

// At most this fraction of the assembly's own width/height may be dragged past a given edge —
// symmetric across all four (operator ask, 2026-09-08, generalizing the bottom edge's existing
// partial-clip behavior to left/right/top too): enough to tuck it mostly out of the way and cut
// down on visual noise, but never so much it's lost entirely off any one side.
const DISTRICT_OVERLAY_MAX_HIDDEN_FRAC = 0.8;

function sizeDistrictOverlay() {
  const st = S.districtMapState;
  if (!st) return;
  const vp = S.ui.viewport.getBoundingClientRect();
  const vw = vp.width || NOMINAL_MAP_PX, vh = vp.height || NOMINAL_MAP_PX;
  // Reclamp on every resize (not just at deploy time) so a shrink to mobile width can't leave
  // the assembly wider than the viewport it's sitting in.
  st.width = Math.max(DISTRICT_OVERLAY_MIN_W, Math.min(st.width, vw * DISTRICT_OVERLAY_MAX_FRAC * 1.6, vw - 16));
  const height = st.width * (st.aspect || 0.6);
  const visibleFrac = 1 - DISTRICT_OVERLAY_MAX_HIDDEN_FRAC;
  st.left = Math.max(-st.width * DISTRICT_OVERLAY_MAX_HIDDEN_FRAC, Math.min(st.left, vw - st.width * visibleFrac));
  st.top = Math.max(-height * DISTRICT_OVERLAY_MAX_HIDDEN_FRAC, Math.min(st.top, vh - height * visibleFrac));
  const el2 = S.ui.districtOverlay;
  el2.style.left = `${st.left}px`;
  el2.style.top = `${st.top}px`;
  el2.style.width = `${st.width}px`;
}

/** Fixed-frame deploy/remove/resize controls (operator ask, 2026-09-06 — see the buildShell
 *  comment on districtCornerControls for why these live OUTSIDE the draggable assembly).
 *  Re-rendered from scratch on every call — cheap (0-3 buttons) and avoids a second stale-state
 *  class of bug to track alongside updateDistrictOverlayVisibility's own show/hide decision,
 *  which calls this every time its OWN inputs (view, pane-open) could have changed. Shows ×/−/+
 *  while the assembly is deployed and actually visible; otherwise a single "D" (deploy) button —
 *  re-deploying (or deploying for the FIRST time this session, straight from the map) no longer
 *  requires a trip back to Summary > District. */
function renderDistrictCornerControls() {
  const box = S.ui.districtCornerControls;
  const paneOpen = S.ui.pane.classList.contains("ctt-is-open");
  const visible = S.view === "national" && !paneOpen;
  box.style.display = visible ? "" : "none";
  if (!visible) return;
  box.innerHTML = "";
  const deployed = S.districtOnMap && S.districtMapState;
  if (deployed) {
    const remove = el("button", "ctt-district-overlay-btn", { type: "button", "aria-label": "Remove from map", title: "Remove from map" });
    remove.textContent = "×";
    remove.addEventListener("click", () => setDistrictOnMap(false));
    const minus = el("button", "ctt-district-overlay-btn", { type: "button", "aria-label": "Shrink" });
    minus.textContent = "−";
    minus.addEventListener("click", () => resizeDistrictOverlay(1 / DISTRICT_OVERLAY_ZOOM_STEP));
    const plus = el("button", "ctt-district-overlay-btn", { type: "button", "aria-label": "Grow" });
    plus.textContent = "+";
    plus.addEventListener("click", () => resizeDistrictOverlay(DISTRICT_OVERLAY_ZOOM_STEP));
    box.append(minus, plus, remove);   // × last/right-most (operator ask, 2026-09-07)
  } else {
    const deploy = el("button", "ctt-district-overlay-btn", { type: "button", "aria-label": "Deploy district blocks to the map", title: "Deploy district blocks to the map" });
    deploy.textContent = "D";
    deploy.addEventListener("click", deployDistrictFromMap);
    box.append(deploy);
  }
}

/** The fixed "D" button's action: re-show a previously-deployed-then-removed assembly exactly
 *  where it was (S.districtMapState survives a plain removal — see setDistrictOnMap), or, if
 *  Summary > District was never opened this session at all, load the arrangement and deploy
 *  fresh — no flyover here (there's no Summary pane on screen to fly out of). */
function deployDistrictFromMap() {
  if (S.districtMapState) { setDistrictOnMap(true); return; }
  loadDistrictArrangement().then((arrangement) => {
    if (S.view !== "national") return;   // stale by the time it loads
    deployDistrictOverlay(arrangement.circuits || []);
  });
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
  saveStoredDistrictWidth(st.width);   // "remember the zoom preference" (operator ask, 2026-09-06)
}

/** Show/hide toggle — NOT a full undeploy: the position/scale in `S.districtMapState` survive,
 *  so re-showing (via either the fixed corner controls or Summary's own button) lands exactly
 *  where it was. */
function setDistrictOnMap(on) {
  S.districtOnMap = on;
  updateDistrictOverlayVisibility();   // also re-renders the corner controls and clears any
                                        // stuck map-shape highlight when hiding — see there
  const btn = S.ui.paneBody.querySelector(".ctt-district-deploy-btn");
  if (btn) btn.textContent = districtDeployBtnLabel();
}

/** "Set upon map": always replaces whatever was previously deployed (operator confirmed) —
 *  fresh default position/size every time, not whatever a prior deployment's drag/resize left. */
/** Tints the real geographic district shape "standard blue" (operator spec) while its
 *  corresponding cartogram block is hovered — the shape lives in the CURRENT national SVG
 *  (districts are real, if visually subordinate, shapes there per CLAUDE.md §5's national-view
 *  layering), a different DOM entirely from the cartogram overlay hovering it. */
// currentSVG() (not always S.ui.nationalSVG): the drill-in sub-assembly reuses this too now
// (operator ask, 2026-09-07), and its real district shapes live on the LOCAL circuit SVG, which
// is a different element than the (hidden, in circuit view) national one.
function highlightDistrictOnMap(did) {
  const svg = currentSVG();
  if (!svg) return;
  svg.querySelectorAll(".ctt-shape-district-hover").forEach((s) => s.classList.remove("ctt-shape-district-hover"));
  if (!did) return;
  svg.querySelector(`path[data-court-id="${CSS.escape(did)}"][data-layer="district"]`)
    ?.classList.add("ctt-shape-district-hover");
}

function deployDistrictOverlay(circuits) {
  const ov = S.ui.districtOverlay;
  ov.innerHTML = "";
  const { svg, bbox } = buildDistrictCartogramSVG(circuits);
  S.districtMapState = defaultDistrictMapState(bbox ? bbox.H / bbox.W : 0.6);
  ov.append(svg);
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
  const arrangementPromise = DISTRICT_SUBASSEMBLY_ALT_CIRCUITS.has(circuitId)
    ? loadDistrictArrangementAlt() : loadDistrictArrangement();
  arrangementPromise.then((arrangement) => {
    if (S.view !== "circuit" || S.activeCircuit !== circuitId) return;   // stale by the time it loads
    const circuits = arrangement.circuits || [];
    const { svg, bbox } = buildDistrictCartogramSVG(circuits, circuitId);
    if (!bbox) return;   // no arrangement data for this circuit (e.g. not yet authored)
    const wrap = el("div", "ctt-district-subassembly");
    wrap.append(svg);
    S.ui.viewport.append(wrap);
    updateDistrictSubassemblyVisibility();   // apply the CURRENT pane state right away — this
                                              // mounts asynchronously, after togglePane's own
                                              // hook already ran for this drill-in
    // Hovering a sub-assembly block ties to BOTH the real district shape's blue highlight
    // (highlightDistrictOnMap — added session ca) AND the real on-map seat-block grid growing
    // together (highlightBlock, the SAME mechanism a direct map-shape hover already uses — see
    // wireShapeEvents) (operator report, 2026-09-08: the seat blocks weren't growing here yet).
    // Clicking a block opens that district's own info pane directly — jumpToDistrictCourt's own
    // drillIn call is a harmless no-op here since we're already in this circuit.
    wireDistrictCartogramHover(svg, S.ui.tooltip, (did) => {
      highlightDistrictOnMap(did);
      highlightBlock(currentSVG(), did, "ctt-block-hover");
    });
    svg.addEventListener("click", (e) => {
      const sq = e.target.closest && e.target.closest(".ctt-district-sq");
      const did = sq?.getAttribute("data-district-id");
      if (did) jumpToDistrictCourt(did);
    });
  });
}

// "▼ Set upon map ▼" (arrows pointing DOWN — deploying pushes the assembly down onto the map) /
// "▲ Remove from map ▲" (arrows pointing UP — removing brings it back up) (operator ask,
// 2026-09-07, arrow direction corrected 2026-09-10).
function districtDeployBtnLabel() {
  const label = S.districtOnMap ? "Remove from map" : "Set upon map";
  const arrow = S.districtOnMap ? "▲" : "▼";
  return `${arrow} ${label} ${arrow}`;
}

function renderSummaryDistrict(container) {
  // Mirrors renderSummaryScotus's own subtitle+meta chain EXACTLY — same classes, same flex-
  // column context (so adjacent margins don't collapse), same flush-with-container-top start —
  // so the two Summary sub-tabs' docked panels measure pixel-identical top-to-bottom (operator
  // report, 2026-09-09: promoting this caption to a title+meta pair, session cb, nested it
  // inside .ctt-pane-controls instead, whose own scoped margin pushed the text down 6px and
  // broke that parity). The deploy button overlays this same header via position:absolute
  // (see .ctt-district-caption-row's own CSS) instead of sharing a flex row with the caption,
  // so it can be right-aligned without perturbing the caption's own height/margins at all.
  const captionRow = el("div", "ctt-district-caption-row");
  const captionTitle = el("div", "ctt-summary-subtitle");
  captionTitle.textContent = "Party of District Court Appointments, Arranged by Circuit";
  const captionMeta = el("div", "ctt-pane-meta");
  const natTotals = districtNationalTotals();
  captionMeta.textContent = `${natTotals.authorized} authorized · ${natTotals.active} active · ${natTotals.vacancies} vacant`;
  // The three totals above can look like they don't add up (active+vacant > authorized) because
  // a handful of courts genuinely seat more active judges than their base authorized count via
  // shared/roving judgeships (see districtNationalTotals's own doc comment) — a single-character
  // marker with a native tooltip explains the gap right where a reader would notice it, with
  // negligible width so it can't threaten this caption's hard-won pixel parity with SCOTUS's own
  // (see the comment above this function). Present only when the gap is real (defensive: it
  // silently disappears if a future data refresh ever resolves every such court).
  if (natTotals.overAuthorized) {
    const note = el("span", "ctt-district-overage-note", { title:
      `${natTotals.overAuthorized} of the judges counted "active" above sit via shared/roving ` +
      `judgeships beyond their own court's base authorized count (28 U.S.C. §133) — those ` +
      `courts show no vacancy for it, so active + vacant can total more than authorized.` });
    note.textContent = " *";
    captionMeta.append(note);
  }
  const deployBtn = el("button", "ctt-toggle ctt-district-deploy-btn", { type: "button" });
  deployBtn.textContent = districtDeployBtnLabel();
  captionRow.append(captionTitle, captionMeta, deployBtn);
  container.append(captionRow);

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

    // Pin state lives on S (module-level), not a local closure var, so it survives this
    // function re-running AND so the generic document-mousedown "click elsewhere closes it"
    // handler (wired once in buildShell, same standard every other docked panel already has —
    // operator ask, 2026-09-05) can reach it without a reference to this specific render.
    detailClose.addEventListener("click", unpinDistrictDetail);
    // sticky:true — a hovered district's info/growth STAYS once the cursor leaves (matches the
    // judge-detail panel's own documented contract; operator correction, 2026-09-05, of an
    // earlier draft that wrongly reset to the empty hint on every hover-out). isPinned keeps an
    // explicitly clicked district grown even while a DIFFERENT one is being explored by hover.
    const { applyGrowth, setHover } = wireDistrictCartogramHover(svg, tip, (did) => {
      if (S.districtDetailPinnedId) return;    // a pinned panel stays put until dismissed
      showDistrictDetail(detailContent, did, jumpToDistrictCourt, pinDistrictCourt);
    }, { sticky: true, isPinned: (sqDid) => sqDid === S.districtDetailPinnedId, anyPinned: () => !!S.districtDetailPinnedId });
    // Stashed so the document-level click-elsewhere handler (unpinDistrictDetail, which has no
    // closure access to this specific render) can re-evaluate growth after clearing the pin.
    S.ui.districtSummaryHover = { applyGrowth, setHover };
    // Click-to-pin — only in Summary > District (operator spec: this and the docked viewer are
    // the two things that do NOT exist once the assembly is deployed onto the map). setHover
    // first (syncing the sticky-hover state to the clicked district, in case they'd diverged),
    // which growth naturally follows — applyGrowth then layers the PIN on top so it stays grown
    // even once a later hover moves the sticky target elsewhere. Shared by BOTH the cartogram
    // block click AND clicking a district's own row in the circuit table (operator ask,
    // 2026-09-10) — one function so the two entry points can never drift apart.
    function pinDistrictCourt(did) {
      if (!did) return;
      setHover(did);
      S.districtDetailPinnedId = did;
      detailBox.classList.add("ctt-pinned");
      showDistrictDetail(detailContent, did, jumpToDistrictCourt, pinDistrictCourt);
      applyGrowth();
    }
    svg.addEventListener("click", (e) => {
      const sq = e.target.closest && e.target.closest(".ctt-district-sq");
      pinDistrictCourt(sq?.getAttribute("data-district-id"));
    });
    // A pin survives switching Summary sub-tabs and back (module-level state, not reset here) —
    // restore its content + grown blocks immediately rather than silently reverting to the
    // empty hint, which would un-stick the pin without an explicit unpin action.
    if (S.districtDetailPinnedId) {
      setHover(S.districtDetailPinnedId);
      detailBox.classList.add("ctt-pinned");
      showDistrictDetail(detailContent, S.districtDetailPinnedId, jumpToDistrictCourt, pinDistrictCourt);
    }
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

// Deliberately its own constant, not the map's BLOCK_SCALE_HOVER (1.17) — history: this was
// pushed up to 1.35 specifically to let the SCALE ITSELF close the gutter between adjacent
// same-district cells (the block-builder tool's trimmed layout doesn't guarantee adjacency).
// That's no longer the scale's job — the non-scaling `.ctt-district-sq-grown` stroke (see its
// own CSS comment) now closes the seam by a fixed SCREEN-pixel amount regardless of zoom, which
// is also strictly more robust than the scale ever was (the scale's fixed VIEWBOX-unit margin
// still shrank away at small render sizes; see the 2026-09-06 session log). With seam-closing no
// longer riding on it, the scale went back down close to the map's own feel — operator report,
// 2026-09-07: "the on-hover box growing is now too much" once inspected closely across the
// Summary preview, the on-map overlay, and the (much smaller) drill-in sub-assembly.
const DISTRICT_SQ_SCALE_HOVER = 1.15;
/** `isPinned(did)` (optional — only the Summary preview passes one) makes a pinned district's
 *  blocks STAY grown even after the cursor leaves, until explicitly unpinned (operator ask,
 *  2026-09-05: this was the missing half of "sticky" — the docked panel's CONTENT already
 *  survived hover-out via the onHover/pinned check at the call site, but the VISUAL growth did
 *  not). Returns `{ applyGrowth }` so an external state change (e.g. clicking a NEW block while
 *  a DIFFERENT one is already pinned) can force every square to re-evaluate its grow state
 *  on demand, bypassing setHover's unchanged-hoveredId short-circuit. */
/** `opts.sticky` (only the Summary preview passes this): once a real district has been
 *  hovered, it STAYS the "current" one — grown, and (via the caller's onHover) shown in the
 *  docked panel — even after the cursor leaves every block entirely. Only hovering a
 *  DIFFERENT real district changes it; moving over a gap or off the whole cartogram does
 *  nothing. This is deliberately the SAME "sticky" contract CLAUDE.md already documents for
 *  the judge-detail panel ("hover-out... keeps the last judge's details up... only a new hover
 *  replaces content") — an earlier draft reset everything to the empty hint on pointerleave,
 *  which was the actual bug (operator correction, 2026-09-05: "it's a stickiness on-hover").
 *  Non-sticky callers (the on-map overlay, the drill-in sub-assembly) get the ordinary
 *  hover-and-release behavior unchanged — there is no docked panel or pin concept there.
 *  `opts.isPinned(did)` (Summary preview only) keeps an explicitly PINNED district grown even
 *  while a DIFFERENT district is being transiently explored via sticky hover. */
function wireDistrictCartogramHover(svg, tip, onHover, opts = {}) {
  const { sticky, isPinned, anyPinned } = opts;
  // Sticky mode "pauses" itself once something is pinned (operator ask, 2026-09-08): before a
  // pin exists, the LAST hovered district should stay grown after the cursor leaves (that's the
  // whole point of sticky) — but once one IS pinned, a DIFFERENT district's hover-growth must go
  // back to being transient (grow while actively hovered, un-grow on leave), so it can never be
  // mistaken for a second, equally "stuck" district alongside the actual pin. The pinned
  // district's own growth is unaffected either way — it comes from isPinned below, not from
  // hoveredId ever being cleared or not.
  const stickyNow = () => sticky && !(anyPinned && anyPinned());
  let hoveredId = null;
  const applyGrowth = () => {
    svg.querySelectorAll(".ctt-district-sq").forEach((sq) => {
      const sqDid = sq.getAttribute("data-district-id");
      // !! matters: without isPinned (the plain on-map/sub-assembly wiring, no 4th opts arg),
      // `isPinned && isPinned(sqDid)` evaluates to `undefined`, not `false` — && / || return
      // operand VALUES, not coerced booleans. classList.toggle(name, force) treats an explicit
      // `undefined` force as "no force argument at all" (a normal flip-current-state toggle),
      // NOT as force-remove — so every non-hovered square's ABSENT class flipped to PRESENT on
      // its very first evaluation, growing every district in the whole assembly at once (root
      // cause of the operator's "growing squares of multiple district groups" report,
      // 2026-09-07). animateDistrictSquare's own ternary never had this problem (its two
      // branches are real values, 1 or the scale constant), which is why growth *itself* was
      // never wrong — only the (separate) grown-class bookkeeping was.
      const grow = !!((hoveredId && sqDid === hoveredId) || (isPinned && isPinned(sqDid)));
      animateDistrictSquare(sq, grow ? DISTRICT_SQ_SCALE_HOVER : 1);
      // See the .ctt-district-sq-grown CSS comment: the scale alone only closes the cartogram's
      // gutter with a fixed VIEWBOX-unit margin, which shrinks right along with everything else
      // once the cartogram itself renders smaller — a non-scaling stroke pads the shape by a
      // fixed SCREEN-pixel amount instead, so the seam closes regardless of zoom.
      sq.classList.toggle("ctt-district-sq-grown", grow);
    });
  };
  const setHover = (did) => {
    if (did === hoveredId) return;
    hoveredId = did;
    applyGrowth();
    onHover?.(did);
  };
  svg.addEventListener("pointermove", (e) => {
    const sq = e.target.closest && e.target.closest(".ctt-district-sq");
    const did = sq?.getAttribute("data-district-id") || null;
    if (did || !stickyNow()) setHover(did);   // sticky mode: a gap/non-square never clears the target
    if (did) {
      const court = S.courts.get(did);
      const b = S.seatBlocks?.[did];
      const composition = b ? `${b.r} R · ${b.d} D${b.vacancies ? ` · ${b.vacancies} vacant` : ""}` : "";
      tip.textContent = court ? `${court.court_name}${composition ? ` — ${composition}` : ""}` : did;
      tip.style.display = "block";
      tip.style.left = `${e.clientX + 14}px`;
      tip.style.top = `${e.clientY + 14}px`;
    } else {
      tip.style.display = "none";   // the cursor-following tooltip always hides — it's not sticky
    }
  });
  svg.addEventListener("pointerleave", () => {
    tip.style.display = "none";
    if (!stickyNow()) setHover(null);
  });
  return { applyGrowth, setHover };
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
/** No-photo icon fallback: the initial of EVERY distinct name part, in given-name-first order —
 *  not just first+last (issue #50: originally a "Step 0" fix for overflowing labels in crowded
 *  arcs, generalized by the operator to the app's whole no-photo fallback, confirmed 2026-09-08 —
 *  "John Quincy Adams" -> "JQA", not "JA"). Generational suffixes (Jr/Sr/II/...) are dropped, same
 *  convention surname() already uses — they qualify a name, they aren't a part of it; without
 *  that filter "Paul Joseph Kelly Jr." would read "PJKJ" (the "Jr." mistaken for a real part). */
function initials(j) {
  const name = (j.full_name || j.display_name || "?").trim();
  const parts = name.replace(/,/g, "").split(/\s+/)
    .filter((p) => p && !/^(Jr|Sr|II|III|IV|V)\.?$/i.test(p));
  return parts.map((p) => p[0] || "").join("").toUpperCase();
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
  // `Wmax` is `Rmax`'s width-axis counterpart — issue #50's "Constraint on steps 1 & 2: both
  // must stay within the size of the actual user-viewable area" applies to BOTH axes, not just
  // height, but `Rmax` alone only ever bounded height (nothing here ever checked whether a
  // ring's radius pushed seats past the pane's own left/right edges). Since `cx === w/2`, a
  // ring's radius must not exceed `cx` itself to keep `cx ± radius` inside `[0, w]`; the -30
  // margin (same fudge `Rmax` already reserves for a label past its own icon) leaves a little
  // room for a seat's label to extend past its icon at the arc's own horizontal extremes,
  // instead of shaving it exactly to the pixel. Confirmed as a real, live bug (operator report):
  // without this, growth (Steps 1/2) could resolve every label/icon collision while still
  // leaving the arc wider than the pane, since nothing about that condition ever counted as a
  // reason to invoke Step 3 — the scrollbar this width gap needs `.ctt-judge-stage.ctt-majority-
  // scroll` for should now be rare, not something an ordinary/even a large real bench hits at
  // its own default width.
  // NOTE: this margin only bounds RING-RADIUS growth (Steps 1/2) — it is NOT what determines
  // whether a label actually pokes past the pane's edge. That's measured separately and exactly
  // by `seatHalfWidth`/`leftBleedShift` at the end of `layoutArc`. Widening this constant was
  // tried once (session dh) to chase a CI-only overflow and had ZERO effect (proved by CI
  // reproducing byte-identical numbers before and after) — see `layoutArc`'s `resolveAt` for the
  // fix that actually worked (checking REAL measured pane-edge overflow inside the Step-3 search,
  // not this fixed heuristic). Don't widen this again for that class of bug.
  return { H, cx, cy, Rmax: Math.max(60, cy - 30), Wmax: Math.max(60, cx - 30), R0: Math.min(w * 0.26, 132) };
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

/** Summary > SCOTUS's FedSoc key: centered within `.ctt-summary-content` when there's room, but
 *  never closer than AFFIL_KEY_BUFFER_PX to the title/meta text's own right edge (issue #69 — it
 *  used to sit flush right, easy to miss; "centerward, with a buffer from the text" is the
 *  operator's own spec). Reads `getComputedStyle` rather than duplicating the 640px mobile
 *  breakpoint here: below it, CSS's own media query already switches the key to `position:static`
 *  (its own line, under the title) — this function is a no-op there so it can't fight that rule
 *  or leave a stale inline `left` behind when the viewport later widens back past it. Called from
 *  layoutJudges() so both an initial render and every later resize keep it correctly placed. */
const AFFIL_KEY_BUFFER_PX = 20;
// .ctt-summary-subtitle/.ctt-pane-meta are plain full-width block <div>s, so
// element.getBoundingClientRect().right is the CONTAINER's right edge, not the actual rendered
// text's — a Range over their contents measures the glyphs themselves instead (same class of trap
// noted elsewhere in this file re: .ctt-judge-label needing width:fit-content; a Range sidesteps
// it here without touching that shared class, which other callers rely on staying full-width).
function textContentRight(el) {
  if (!el) return 0;
  const range = document.createRange();
  range.selectNodeContents(el);
  return range.getBoundingClientRect().right;
}
function positionScotusAffilKey() {
  const container = S.ui.paneBody.querySelector(".ctt-summary-content");
  const key = container && container.querySelector(".ctt-scotus-affil-key");
  if (!key) return;
  // No real layout (headless/jsdom, same signal majorityStageHeight already bails on) — every
  // rect here would read 0, so there's nothing meaningful to compute; leave the CSS default in
  // place rather than calling getComputedStyle in an environment where it may not even exist.
  if (!container.getBoundingClientRect().width) return;
  if (getComputedStyle(key).position !== "absolute") { key.style.left = ""; return; }
  const label = container.querySelector(".ctt-summary-subtitle");
  const meta = container.querySelector(".ctt-pane-meta");
  const containerBox = container.getBoundingClientRect();
  const textRight = Math.max(textContentRight(label), textContentRight(meta)) - containerBox.left;
  const centerLeft = (containerBox.width - key.getBoundingClientRect().width) / 2;
  key.style.left = `${Math.max(centerLeft, textRight + AFFIL_KEY_BUFFER_PX)}px`;
}

function layoutJudges() {
  positionScotusAffilKey();
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

  // Majority view only (issue #50 follow-up): the stage scrolls horizontally instead of the arc
  // reshaping itself to always fit — see leftBleedShift's own comment above layoutArc. Timeline
  // never needs this (its grid already wraps to width), so the class — and with it
  // overflow-x:auto — stays off there.
  stage.classList.toggle("ctt-majority-scroll", S.majorityMode);

  if (!S.majorityMode) {
    resolveLabelOverflow(stage, 1);   // issue #50 Step 0 — Timeline's grid, not just arcs
    stage.scrollLeft = 0;
    layoutTimeline(model, w, H);
    drawMajorityOverlay(stage, null);
  } else if (stage.classList.contains("ctt-scotus-stage")) {
    layoutScotusRing(model, w, H, stage);
    drawMajorityOverlay(stage, model);
  } else {
    layoutArc(model, w, H, stage);
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

// ---- issue #50: judge-icon collision avoidance ---------------------------------
// The operator's own multi-step spec lives in the issue body, not duplicated here. Several
// specifics were left as open implementation choices for this PR to make and document (the
// issue's own framing — choices to record, not gates to block on):
//  - COLLISION_BUFFER_PX: how far a label's own box may sit inside a neighbor's icon circle
//    before it counts as a real collision worth resolving (a few px only — anti-aliasing/
//    rounding noise, not a genuine "text touches the circle" case).
//  - OVERFLOW_WIDTH_FACTOR: how much wider than "icon diameter including the highlight ring" a
//    still-single-line label has to render before Step 0 calls it "substantially" overflowing.
//  - SHRINK_ROUND_PX: the "nearest round number" Step 3's 2/3-floor rounds to.
//  - "highlighted icon" (the yellow same-president ring, `.ctt-hl`) is a hover-driven, transient
//    state — this is a static, layout-time algorithm (recomputed on every render, not on every
//    hover), so it does not special-case it; COLLISION_BUFFER_PX stays small enough that the
//    ring's own 3px box-shadow is never realistically what tips a real collision into "tolerated."
//  - an EVEN ring count has no single "centermost" ring for Step 2's anchor; this implementation
//    anchors at the inner one of the two middle rings (index floor((k-1)/2)).
// Applies to Majority-mode's general N-seat arc (layoutArc, below) and — Step 0 only — to
// Timeline's grid (layoutJudges' own call site) and Summary > SCOTUS's fixed ring
// (layoutScotusRing): nowhere here is gated behind a viewport width, so it runs identically at
// mobile and desktop. SCOTUS's ring already solves icon-to-icon overlap via its own hand-tuned
// radius formula (see that function's comment); Steps 1/2 (general ring-spacing adjustment)
// don't apply there, to avoid fighting that formula's existing clamps, but Step 3 (icon shrink)
// still does, since SCOTUS's OWN scale is exactly the kind of lever Step 3 already generalizes.
const COLLISION_BUFFER_PX = 3;
const OVERFLOW_WIDTH_FACTOR = 1.15;
const SHRINK_ROUND_PX = 5;
// `layoutArc`'s Step-3 search treats a SMALL measured pane-edge overflow (under this) as another
// unacceptable-collision type worth nudging the scale down for — closing exactly the kind of few-
// px, font-rendering-driven gap that showed up as a real CI-only failure (session dh: a court that
// fit with 0px slack locally measured a few px over in CI, from the SAME label text rendering at a
// different real width there). Bounded deliberately: a genuinely narrow/mobile pane routinely
// overflows by 150px+ for a large bench, and that must NOT trigger extra shrinking — the operator
// was explicit that mobile's viewable width stays "arbitrary," relying on horizontal scroll rather
// than being shrunk to fit. This tolerance is what keeps the check scoped to "just barely misses"
// without touching that design.
const PANE_EDGE_TOLERANCE_PX = 40;
const LABEL_GAP = 3;             // matches .ctt-judge-label's own margin-top
const AVATAR_R = 22;             // .ctt-avatar's 44px diameter, radius, at scale 1

/** Icon diameter INCLUDING the yellow same-president highlight ring — issue #50's own definition
 *  of "icon width" for Step 0 — at a given icon scale. */
function iconDiameterWithRing(scale) { return (2 * AVATAR_R + 6) * scale; }

/** A node's `.ctt-judge-label` rect at its NATURAL (unscaled) size — neutralizing whatever
 *  transform:scale(...) a PREVIOUS layout pass left on the node first. Without this, re-measuring
 *  on a re-layout (e.g. a resize event re-running layoutArc/layoutScotusRing on already-placed
 *  nodes) reads a STALE, already-scaled box and then scales it AGAIN below — confirmed as a real
 *  bug: SCOTUS's whole ring got stuck showing initials after a resize, at widths where a correct
 *  unscaled measurement never would have flagged an overflow at all. `place()` unconditionally
 *  overwrites the node's transform once final positions are chosen, so it's always safe to
 *  neutralize it here first.
 *  `.ctt-judge` also carries `transition: transform 480ms ...` — a bare `style.transform` toggle
 *  ANIMATES rather than applying instantly, so a synchronous read right after clearing it would
 *  still reflect the OLD (scaled) box for this entire tick. `ctt-no-transition` (the same class
 *  `handoff()` already uses for the analogous "read true geometry, not a mid-transition one"
 *  need) suspends the transition for the read; `offsetWidth` reads force each style change to
 *  actually flush before the next one. */
function measureLabelNatural(node) {
  const label = node.querySelector(".ctt-judge-label");
  node.classList.add("ctt-no-transition");
  const prevTransform = node.style.transform;
  node.style.transform = "";
  void node.offsetWidth;
  const r = label.getBoundingClientRect();
  // `.ctt-judge-label` is a plain block: it takes its PARENT's full 52px width regardless of how
  // short its text is (text-align:center just centers the glyphs within that box), so the box's
  // own rect.width is a near-constant ~52px for every judge — useless as an overflow OR collision
  // signal (confirmed as a real bug: it flagged "Gorsuch" as "too wide" purely because SCOTUS's
  // icons were scaled up, nothing to do with the name). A Range around the label's own text gives
  // the tight box around the actually-rendered glyphs instead (same technique issue #50's own
  // bug-2 fix already established in tests/browser-checks.mjs). Height is unaffected by this —
  // a block genuinely grows ITS OWN height to fit wrapped content, so rect.height stays a
  // reliable one-line-vs-two-line signal.
  // jsdom's Range has no getBoundingClientRect (headless smoke tests) — 0 there is fine, same
  // as every other geometry read in this file: it just means "nothing measurable, skip."
  let textWidth = 0;
  if (typeof Range !== "undefined" && Range.prototype.getBoundingClientRect) {
    const range = document.createRange();
    range.selectNodeContents(label);
    textWidth = range.getBoundingClientRect().width;
  }
  node.style.transform = prevTransform;
  void node.offsetWidth;
  node.classList.remove("ctt-no-transition");
  return { label, rect: r, textWidth };
}

/** Step 0: a label that renders as two lines, or that (on one line) substantially overflows its
 *  OWN icon's width, switches from `display_name` to the full-distinct-initials fallback (the
 *  same computation the no-photo avatar already uses) instead. Always re-derives from
 *  `display_name` first (never sticky), so a later call — after Step 3 changes the icon scale, or
 *  a plain resize — re-evaluates fresh rather than staying stuck on whichever form an earlier
 *  pass chose. Skips vacancies (their "Vacant" label never overflows) and the Circuit Justice
 *  (her label is a bespoke "Circ. Justice <surname>" form set elsewhere, not derived from
 *  `display_name` — swapping her to bare initials would erase the one thing that label exists to
 *  say). Returns true if anything changed. */
/** Per-node half of Step 0 — factored out so the senior "show" band's own scoped Steps 1-3
 *  (below) can re-evaluate JUST its own judges at a candidate band scale, without re-touching
 *  every active-ring node's label the way calling `resolveLabelOverflow(stage, scale)` would. */
function resolveLabelOverflowNode(node, scale) {
  const judge = node._judge;
  if (!judge) return false;
  node.querySelector(".ctt-judge-label").textContent = judge.display_name || "";
  const { label, rect: r, textWidth } = measureLabelNatural(node);
  if (!r.width && !r.height) return false;   // headless (jsdom): nothing measurable, leave as-is
  const maxWidth = iconDiameterWithRing(scale) * OVERFLOW_WIDTH_FACTOR;
  const lineH = (parseFloat(getComputedStyle(label).fontSize) || 10) * 1.15;
  const twoLine = r.height > lineH * 1.4;
  const tooWide = !twoLine && textWidth * scale > maxWidth;
  if (twoLine || tooWide) { label.textContent = initials(judge); return true; }
  return false;
}
function resolveLabelOverflow(stage, scale) {
  let changed = false;
  stage.querySelectorAll(".ctt-judge:not(.ctt-vacant):not(.ctt-justice)").forEach((node) => {
    if (resolveLabelOverflowNode(node, scale)) changed = true;
  });
  return changed;
}

function seatPoint(cx, cy, r, ang) { return { x: cx + r * Math.cos(ang), y: cy - r * Math.sin(ang) }; }

/** Does seat A's label (its own rendered box, sitting LABEL_GAP below its icon, centred on it)
 *  reach unacceptably far into seat B's icon circle, at the given scale? `buffer` px of overlap
 *  is tolerated before this counts as a real collision. */
function labelHitsIcon(aPos, aLabelW, aLabelH, scale, bPos, buffer) {
  const w = aLabelW * scale, h = aLabelH * scale;
  const top = aPos.y + AVATAR_R * scale + LABEL_GAP * scale;
  const rect = { left: aPos.x - w / 2, right: aPos.x + w / 2, top, bottom: top + h };
  const closestX = Math.max(rect.left, Math.min(bPos.x, rect.right));
  const closestY = Math.max(rect.top, Math.min(bPos.y, rect.bottom));
  const dx = bPos.x - closestX, dy = bPos.y - closestY;
  const dist = Math.sqrt(dx * dx + dy * dy);
  return (AVATAR_R * scale - dist) > buffer;
}

/** Scans every seat pair whose rings are the same (intra) or adjacent (inter) for a real
 *  label/icon collision at the given radii+scale. Rings more than 1 apart are never checked —
 *  too far apart geometrically for a label (localized right under its own icon) to ever reach. */
function findRingCollisions(seatDescs, radii, cx, cy, scale, buffer) {
  let intra = false, inter = false;
  for (const a of seatDescs) {
    const aPos = seatPoint(cx, cy, radii[a.ring], a.ang);
    for (const b of seatDescs) {
      if (a === b) continue;
      const ringDiff = Math.abs(a.ring - b.ring);
      if (ringDiff > 1) continue;
      const bPos = seatPoint(cx, cy, radii[b.ring], b.ang);
      if (labelHitsIcon(aPos, a.labelW, a.labelH, scale, bPos, buffer)) {
        if (ringDiff === 0) intra = true; else inter = true;
      }
    }
  }
  return { intra, inter };
}

/** Step 1: grow every ring's radius together by the same amount until no intra-ring collision
 *  remains, or growing further would push the outermost ring past Rmax (the viewable area). */
function growRingsForIntra(seatDescs, radii0, cx, cy, scale, Rmax, buffer) {
  let radii = radii0;
  for (let i = 0; i < 60; i++) {
    const { intra } = findRingCollisions(seatDescs, radii, cx, cy, scale, buffer);
    if (!intra) return { radii, resolved: true };
    const grown = radii.map((r) => r + 4);
    if (grown[grown.length - 1] > Rmax) return { radii, resolved: false };
    radii = grown;
  }
  return { radii, resolved: false };
}

/** Step 2: adjust the DISTANCE between adjacent rings (not a uniform shift) to clear inter-ring
 *  collisions — the centermost ring stays fixed; rings outward of it push further out (capped at
 *  Rmax), rings inward of it pull further in (capped at not crossing the next ring in). */
function adjustInterRingGaps(seatDescs, radii0, cx, cy, scale, Rmax, buffer) {
  let radii = [...radii0];
  const k = radii.length;
  if (k < 2) return { radii, resolved: true };
  const centerIdx = Math.floor((k - 1) / 2);
  for (let i = 0; i < 60; i++) {
    const { inter } = findRingCollisions(seatDescs, radii, cx, cy, scale, buffer);
    if (!inter) return { radii, resolved: true };
    let changed = false;
    for (let ri = 0; ri < k; ri++) {
      if (ri === centerIdx) continue;
      if (ri > centerIdx) {
        const next = radii[ri] + 4;
        if (next <= Rmax) { radii[ri] = next; changed = true; }
      } else {
        const floor = ri > 0 ? radii[ri - 1] + 8 : 20;
        const next = radii[ri] - 4;
        if (next > floor) { radii[ri] = next; changed = true; }
      }
    }
    if (!changed) return { radii, resolved: false };
  }
  return { radii, resolved: false };
}

/** Step 3 (last resort — only reached when steps 1/2 can't clear every collision within the
 *  viewable area): shrink the icon scale in small increments, re-trying steps 1/2 (and Step 0,
 *  whose own overflow threshold shrinks with the icon) at each, down to a floor of the nearest
 *  SHRINK_ROUND_PX to 2/3 of the base icon size. Tracks the best (fewest remaining unacceptable
 *  collision types) result seen across every increment tried; stops at the first one with none
 *  remaining, so it never shrinks further than it has to. */
function shrinkForCollisions(stage, buildSeatDescs, radii0, cx, cy, Rmax, buffer, baseScale) {
  const baseDiameter = 2 * AVATAR_R * baseScale;
  const floorDiameter = Math.round((baseDiameter * 2 / 3) / SHRINK_ROUND_PX) * SHRINK_ROUND_PX;
  const floorScale = Math.max(0.3, floorDiameter / (2 * AVATAR_R));
  let best = null;
  for (let scale = baseScale; scale >= floorScale - 1e-6; scale -= 0.05) {
    resolveLabelOverflow(stage, scale);
    const seatDescs = buildSeatDescs();
    const { radii: r1 } = growRingsForIntra(seatDescs, radii0, cx, cy, scale, Rmax, buffer);
    const { radii: r2 } = adjustInterRingGaps(seatDescs, r1, cx, cy, scale, Rmax, buffer);
    const { intra, inter } = findRingCollisions(seatDescs, r2, cx, cy, scale, buffer);
    const remaining = (intra ? 1 : 0) + (inter ? 1 : 0);
    if (!best || remaining < best.remaining) best = { scale, radii: r2, remaining };
    if (remaining === 0) break;
  }
  return best;
}

/** Half-width to reserve around a seat's x position for horizontal-scroll purposes, AT THE
 *  GIVEN SCALE: its label's actual rendered text (Range-measured at natural, unscaled size —
 *  same technique Step 0 uses — then scaled) if that's wider than the icon itself (incl. the
 *  highlight ring's few px), otherwise the icon. */
function seatHalfWidth(node, scale) {
  const { textWidth } = measureLabelNatural(node);
  return Math.max((AVATAR_R + 3) * scale, (textWidth * scale) / 2);
}
/** How far the leftmost of `points` (each `{x, halfW}`) sits past x=0. Majority view scrolls
 *  horizontally (`.ctt-judge-stage.ctt-majority-scroll`, wired in `layoutJudges`) rather than
 *  trying to keep every seat within the nominal viewport width geometrically: content rendered
 *  PAST the stage's right edge already contributes to its scrollable region on its own (a
 *  `transform:translate()`-positioned child DOES count toward an `overflow:auto` ancestor's
 *  `scrollWidth` in Chrome), but a seat at a NEGATIVE x never could — `scrollLeft` can't go
 *  negative. Shifting every placement by this amount (added into `cx`) fixes that; the caller
 *  sets `stage.scrollLeft` to the same value once everything's placed, which reproduces exactly
 *  the pre-shift default view and only changes what's reachable by scrolling. */
function leftBleedShift(points) {
  if (!points.length) return 0;
  const minX = Math.min(...points.map((p) => p.x - p.halfW));
  return Math.max(0, -minX);
}

function layoutArc(model, w, H, stage) {
  const { cx, cy, Rmax, Wmax, R0 } = majorityDims(w, H);
  // Growth (Steps 1/2, both active-ring and band) is bounded by whichever of the two axes is
  // tighter — see majorityDims' own comment on Wmax for why height-only was never enough.
  // `planRings`' own RING-COUNT decision deliberately keeps using plain `Rmax`, not this: it's
  // fundamentally about how many concentric rings fit VERTICALLY, and on a narrow viewport `Wmax`
  // can be tight enough to collapse it to a single ring outright — confirmed as a real, severe
  // regression (mobile ca9/Include effectively stopped rendering, ~50 icons crushed onto one
  // ring with no per-scale way to recover, since ring count doesn't change with icon size).
  // `effectiveMax` only constrains the GROWTH steps below, which merely add radius on TOP of
  // whatever multi-ring plan `planRings` already chose — Step 3 shrinking can genuinely help
  // THAT (smaller icons need less spacing on the same ring count), unlike a ring count that's
  // already collapsed before any scale search even begins.
  const effectiveMax = Math.min(Rmax, Wmax);
  const seats = innerArcSeats(model);            // {judge} | {vacancy}, party-grouped L→R
  const N = seats.length || 1;
  const hasSeniorsBand = S.seniorMode === "show" && model.seniors.length > 0;
  const { radii: baseRadii, counts } = planRings(N, R0, Rmax, hasSeniorsBand);
  const slots = orderedSlots(baseRadii, counts);  // fill order = protractor/angle order (#16)

  let vi0 = 0;
  const seatNodes = seats.map((seat) =>
    seat.vacancy ? model._vacancyNodes[vi0++] : model._nodeByJudge.get(seat.judge));

  const outer = hasSeniorsBand ? model.seniors : [];
  const sn = outer.length || 1;
  const bandAngle = (i) => Math.PI - ((i + 0.5) / sn) * Math.PI;

  // issue #50, RADIUS (Steps 1/2): the senior "show" band gets its own scoped growth/gap-
  // adjustment, never the active rings'. Issue #50's own text — "Constraint on steps 1 & 2: both
  // must stay within the size of the actual user-viewable area... an expansion that would
  // overflow that area is not a valid application" — plus the Step-3 tie-break ("don't shrink
  // more than necessary just because a larger reduction also worked") states a general
  // principle, not a Step-3-only rule: never apply more expansion than the situation actually
  // needs. Growing every ring in ONE shared array uniformly (as this used to, session (cz))
  // satisfies the viewable-area bound but still grows rings that have no collision of their own
  // whenever the band alone is crowded — more expansion than THEY need, even though it stays in
  // bounds. So RADIUS growth is scoped: the band grows its own radius to resolve its own icons'
  // crowding, and if it still collides with the outermost ACTIVE ring, only the band moves
  // further out (the active ring is never the one with the problem). Reuses
  // growRingsForIntra/adjustInterRingGaps UNCHANGED — a single-entry radii array scopes step 1 to
  // whichever ring set is passed in, and a two-entry [fixedR, movableR] array (index 0 is
  // adjustInterRingGaps' own centerIdx for k=2, so it never moves) scopes step 2 the same way.
  //
  // SCALE (Step 3) is different, and deliberately NOT scoped the same way: shrinking is a
  // whole-bench, last-resort decision — if the band needs to shrink but the active rings don't,
  // the result is two different icon sizes in the same view, which is its own kind of wrong
  // (visually inconsistent), not something the "don't do more than necessary" principle argues
  // for. So `resolveAt(s)` below re-runs BOTH the active rings' AND the band's own scoped
  // radius steps at one shared candidate scale, and the Step-3 search picks a single scale used
  // for everyone — never an active-only or band-only scale.
  const resolveAt = (s) => {
    resolveLabelOverflow(stage, s);   // Step 0, every node (active + band) at this global scale
    const activeDescs = seatNodes.map((node, i) => {
      const slot = slots[i] || slots[slots.length - 1];
      const { rect: r, textWidth } = measureLabelNatural(node);
      return { ring: slot.ri, ang: slot.ang, labelW: textWidth, labelH: r.height };
    });
    const { radii: a1 } = growRingsForIntra(activeDescs, baseRadii, cx, cy, s, effectiveMax, COLLISION_BUFFER_PX);
    const { radii: activeRadii } = adjustInterRingGaps(activeDescs, a1, cx, cy, s, effectiveMax, COLLISION_BUFFER_PX);
    const activeCollide = findRingCollisions(activeDescs, activeRadii, cx, cy, s, COLLISION_BUFFER_PX);

    const outermostRi = activeRadii.length - 1;
    const outermostActiveR = activeRadii[outermostRi];
    // The band always sits AT LEAST ROW_GAP beyond the actual outermost ACTIVE ring — "locked to
    // the outer perimeter" per issue #50's steps 1/2 framework — and is NEVER clamped down below
    // that, even when doing so would exceed effectiveMax. An earlier version DID clamp bandR to
    // effectiveMax whenever outermostActiveR was itself within budget, on the theory that only the
    // band's OWN crowding could ever push it past the ceiling — but on a width-constrained pane
    // where outermostActiveR sits only slightly under effectiveMax, `+ROW_GAP` alone can already
    // exceed it before any band-specific crowding is even considered, and that clamp compressed
    // the gap down to whatever thin sliver remained (sometimes just a few px) instead of falling
    // back to scroll — confirmed as a real bug (issue #60): the band rendered visibly overlapping
    // the outer active ring's icons, invisible to `findRingCollisions` (label-vs-icon only, never
    // icon-vs-icon) so no scrollbar ever appeared either.
    let bandR = outermostActiveR + ROW_GAP;
    let bandCollide = { intra: false, inter: false };
    if (hasSeniorsBand) {
      const bandR0 = bandR;
      const bandDescs = outer.map((j, i) => {
        const { rect: r, textWidth } = measureLabelNatural(model._nodeByJudge.get(j));
        return { ring: 0, ang: bandAngle(i), labelW: textWidth, labelH: r.height };
      });
      const { radii: b1 } = growRingsForIntra(bandDescs, [bandR0], cx, cy, s, effectiveMax, COLLISION_BUFFER_PX);
      const outermostDescs = seatNodes
        .map((node, i) => ({ node, ri: (slots[i] || slots[slots.length - 1]).ri, ang: (slots[i] || slots[slots.length - 1]).ang }))
        .filter((p) => p.ri === outermostRi)
        .map(({ node, ang }) => {
          const { rect: r, textWidth } = measureLabelNatural(node);
          return { ring: 0, ang, labelW: textWidth, labelH: r.height };
        });
      const combined = [...outermostDescs, ...bandDescs.map((d) => ({ ...d, ring: 1 }))];
      const { radii: b2 } = adjustInterRingGaps(combined, [outermostActiveR, b1[0]], cx, cy, s, effectiveMax, COLLISION_BUFFER_PX);
      bandR = b2[1];
      bandCollide = {
        intra: findRingCollisions(bandDescs, b1, cx, cy, s, COLLISION_BUFFER_PX).intra,
        inter: findRingCollisions(combined, b2, cx, cy, s, COLLISION_BUFFER_PX).inter,
      };
    }
    // Real horizontal-extent check, using each label's OWN measured width (`seatHalfWidth`) — not
    // `effectiveMax`'s fixed margin, which only bounds RING-RADIUS growth and has no direct tie to
    // what a specific label actually measures. A particular judge's surname can legitimately need
    // more or less room than that generic margin assumes (confirmed live: the SAME court/mode fit
    // with zero px slack locally but genuinely overflowed by a few px in CI, purely from label-
    // width metrics differing by font-rendering environment — widening the margin heuristic had
    // ZERO effect on this, since it was never what determined the final measured overflow).
    // Counting a SMALL residual overflow (within `PANE_EDGE_TOLERANCE_PX`) as another
    // "unacceptable collision" type lets Step 3 nudge the scale down to close it, same as any
    // other collision. Deliberately bounded to SMALL overflow only — a genuinely narrow/mobile
    // pane where content is fundamentally too wide (routinely 150px+ over in practice) must NOT
    // trigger this: the operator was explicit that mobile's viewable width stays "arbitrary,"
    // relying on the horizontal-scroll fallback rather than extra shrinking. The tolerance is what
    // keeps this scoped to "just barely misses, nudge it shut" without touching that design.
    const finalSlots = slots.map((sl) => ({ ...sl, r: activeRadii[sl.ri] }));
    const points = seatNodes.map((node, i) => {
      const sl = finalSlots[i] || finalSlots[finalSlots.length - 1];
      return { x: cx + sl.r * Math.cos(sl.ang), halfW: seatHalfWidth(node, s) };
    });
    outer.forEach((j, i) => points.push({ x: cx + bandR * Math.cos(bandAngle(i)), halfW: seatHalfWidth(model._nodeByJudge.get(j), s) }));
    if (model._justiceNode) points.push({ x: cx, halfW: seatHalfWidth(model._justiceNode, s) });
    const span = Math.max(...points.map((p) => p.x + p.halfW)) - Math.min(...points.map((p) => p.x - p.halfW));
    const overflowPx = span - w;
    const overflowsPane = overflowPx > 1 && overflowPx <= PANE_EDGE_TOLERANCE_PX;

    // issue #63: a candidate scale's quality is a PRIORITY TUPLE, not a flat sum — different
    // failure types are not interchangeable. Comparing tuples lexicographically (tier 1 first;
    // only break ties with tier 2; only break THOSE ties with tier 3) means a scale is never kept
    // as "best" over another that has a smaller violation of a HIGHER-priority type, even if their
    // flat counts would have tied.
    //   Tier 1 — VERTICAL (Rmax) overflow, measured directly against Rmax (never effectiveMax,
    //     which conflates it with Wmax): the pane's own height is fixed (no vertical scroll exists,
    //     per the widget's "fixed outer height, never reflows the host page" contract), so content
    //     pushed past it is genuinely inaccessible — the worst outcome, and the only one with no
    //     fallback at all. A prior version compared bandR against effectiveMax instead of Rmax
    //     directly, and — combined with the flat-sum tie-break below picking whichever candidate
    //     scale was found FIRST among ties — could settle on a scale with a large, easily-avoided
    //     Rmax overshoot merely because a LATER, actually-better scale only tied instead of
    //     strictly improving on the old flat count (confirmed live: ca9/Show at 602-637px wide
    //     settled on a 26-32px Rmax overshoot when a same-or-better scale a few steps further down
    //     the search would have had none at all).
    //   Tier 2 — real label/icon collisions: visible and ugly, but content stays reachable — no
    //     fallback either, but strictly less bad than content being hidden outright.
    //   Tier 3 — HORIZONTAL (Wmax) overflow (`overflowsPane`): fully recoverable by scrolling, so
    //     lowest priority — already bounded to small overflow only (`PANE_EDGE_TOLERANCE_PX`), per
    //     the operator's explicit want that mobile's viewable width stay "arbitrary" rather than
    //     forcing extra shrinking to avoid scroll there.
    // Tier 4 (final tiebreak, unchanged) — among ties on all of the above, prefer the LARGER
    //     scale: "don't shrink more than necessary," issue #50's own tie-break text.
    // `bandR` is always computed (it's `outermostActiveR + ROW_GAP`, harmless as a dead value)
    // even when no band is actually rendered (Hide/Include mode) — it must NOT count toward
    // rmaxViolation in that case, or a purely phantom "the unrendered band would have exceeded
    // Rmax" pushes Step 3 into unnecessary shrinking that has nothing to do with what's on screen
    // (confirmed as a real regression: cacd/Hide at desktop width shrank to 0.80 with room to
    // spare, purely from this phantom term — the active bench alone never needed it).
    const rmaxViolation = Math.max(0, outermostActiveR - Rmax, hasSeniorsBand ? bandR - Rmax : 0);
    const collisionCount = (activeCollide.intra ? 1 : 0) + (activeCollide.inter ? 1 : 0) +
      (bandCollide.intra ? 1 : 0) + (bandCollide.inter ? 1 : 0);
    const paneViolation = overflowsPane ? 1 : 0;
    const isPerfect = rmaxViolation === 0 && collisionCount === 0 && paneViolation === 0;
    return { radii: activeRadii, bandR, points, rmaxViolation, collisionCount, paneViolation, isPerfect };
  };

  // Strictly-better-than comparator for the Step-3 search below: compares the tier-1/2/3 values in
  // priority order, only falling through to the next tier on an exact tie at the one before it.
  const betterCandidate = (a, b) =>
    a.rmaxViolation !== b.rmaxViolation ? a.rmaxViolation < b.rmaxViolation :
    a.collisionCount !== b.collisionCount ? a.collisionCount < b.collisionCount :
    a.paneViolation < b.paneViolation;

  let scale = 1;
  let result = resolveAt(1);
  if (!result.isPerfect) {
    // Step 3, whole-bench: same floor/tie-break convention as shrinkForCollisions, re-running
    // BOTH the active AND band scoped steps 0-2 at each candidate size, picking ONE scale used
    // for everyone (see the comment above resolveAt for why this isn't scoped like Steps 1/2).
    const floorDiameter = Math.round((2 * AVATAR_R * 2 / 3) / SHRINK_ROUND_PX) * SHRINK_ROUND_PX;
    const floorScale = Math.max(0.3, floorDiameter / (2 * AVATAR_R));
    let best = null;
    for (let s = 1; s >= floorScale - 1e-6; s -= 0.05) {
      const r = resolveAt(s);
      if (!best || betterCandidate(r, best)) best = { scale: s, ...r };
      if (r.isPerfect) break;
    }
    if (best) { scale = best.scale; result = best; }
  }
  const radii = result.radii, bandR = result.bandR;
  const finalSlots = slots.map((s) => ({ ...s, r: radii[s.ri] }));

  // ---- Majority-view horizontal scroll (see leftBleedShift's own comment): `result.points` is
  // the SAME extent `resolveAt` already computed for the winning scale above (active rings + band
  // + Circuit Justice, all at the SAME scale) — reused here rather than recomputed.
  const shiftX = leftBleedShift(result.points);
  const cx2 = cx + shiftX;

  seats.forEach((seat, i) => {
    const node = seatNodes[i];
    const s = finalSlots[i] || finalSlots[finalSlots.length - 1];
    place(node, cx2 + s.r * Math.cos(s.ang), cy - s.r * Math.sin(s.ang), true, scale);
    node.classList.add("ctt-in-arc");
  });

  // seniors: grayed outer band. Absent entirely when seniorMode is "hide" or "include" (folded
  // into the inner arc instead) — simple centred spacing — they need not snap to 180°/0° (#19b).
  outer.forEach((j, i) => {
    const node = model._nodeByJudge.get(j);
    const ang = bandAngle(i);
    place(node, cx2 + bandR * Math.cos(ang), cy - bandR * Math.sin(ang), true, scale);
    node.classList.add("ctt-in-arc");
  });
  // "Hide": conceal entirely — a senior isn't in `filled` (inner arc) and isn't in `outer`
  // (band) either, so its node would otherwise keep whatever position/opacity a PRIOR layout
  // (e.g. Timeline mode) left it in.
  if (S.seniorMode === "hide") {
    model.seniors.forEach((j) => place(model._nodeByJudge.get(j), cx2, cy, false));
  }

  if (model._justiceNode) place(model._justiceNode, cx2, cy - R0 * 0.3, true, scale);
  model._arcRender = { cx: cx2, cy, radii, bandR, hasSeniorsBand };  // for the overlay
  stage.scrollLeft = shiftX;
}

// Summary > SCOTUS's fixed double-ring layout (operator ask, 2026-09-03): unlike layoutArc's
// general N-seat planRings() algorithm (shared by every other court's Majority view), SCOTUS is
// always exactly 9 authorized seats, split 6 outer + 3 inner — never a computed ring count, so
// this is deliberately its own small function rather than a planRings special case.
const SCOTUS_ICON_SCALE_MAX = 2;      // icons target 2x normal size ("since it is SCOTUS")
const SCOTUS_INNER_COUNT = 3, SCOTUS_OUTER_COUNT = 6;
const SCOTUS_RAISE_DEG = 20;          // inner ring's first/last seats lift off 180°/0° by this much
/** R0/R1 (+ the slot list) for a given icon scale — factored out of layoutScotusRing so issue
 *  #50's Step 3 can re-derive the whole non-overlap-guaranteed geometry at a smaller scale, not
 *  just re-scale the original radii (which would NOT preserve the minSafeR0/minSafeR1 floors
 *  this formula exists to guarantee). */
function scotusRingGeometry(scale, w, m) {
  const halfIcon = ICON * scale;
  const capR = Math.max(40, m - halfIcon - 4);
  const minSafeR1 = 1.7 * (2 * halfIcon);
  const desiredR0 = Math.min(w * 0.22, capR * 0.6);
  const desiredR1 = desiredR0 + ROW_GAP * scale + 10;
  const R1 = Math.min(capR, Math.max(desiredR1, minSafeR1));
  const minSafeR0 = 0.915 * (2 * halfIcon);
  const R0 = Math.max(minSafeR0, Math.min(desiredR0, R1 * 0.5, R1 - 8));
  const raise = (SCOTUS_RAISE_DEG * Math.PI) / 180;
  const innerAngles = [Math.PI - raise, Math.PI / 2, raise];
  const outerAngles = ringSlotAngles(SCOTUS_OUTER_COUNT, false);
  const slots = [
    ...innerAngles.map((ang) => ({ r: R0, ang, ri: 0 })),
    ...outerAngles.map((ang) => ({ r: R1, ang, ri: 1 })),
  ];
  slots.sort((a, b) => (b.ang - a.ang) || (a.ri - b.ri));
  return { radii: [R0, R1], slots };
}

function layoutScotusRing(model, w, H, stage) {
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
  const baseScale = Math.min(SCOTUS_ICON_SCALE_MAX, Math.max(1, (m - 4) / (88.35 + 26)));
  let scale = baseScale;
  let { radii, slots } = scotusRingGeometry(scale, w, m);
  const seats = innerArcSeats(model);   // R | vacancies | D, oldest→newest within party (#16's algorithm)
  let vi0 = 0;
  const seatNodes = seats.map((seat) =>
    seat.vacancy ? model._vacancyNodes[vi0++] : model._nodeByJudge.get(seat.judge));

  // issue #50 Step 0, then — if this ring-formula's OWN icon-to-icon non-overlap guarantee
  // still leaves a LABEL colliding with a neighbor — Step 3's icon-shrink loop. Steps 1/2 (ring-
  // spacing adjustment) don't apply here; see this function's own header comment for why.
  resolveLabelOverflow(stage, scale);
  const buildSeatDescs = () => seatNodes.map((node, i) => {
    const s = slots[i] || slots[slots.length - 1];
    const { rect: r, textWidth } = measureLabelNatural(node);
    return { ring: s.ri, ang: s.ang, labelW: textWidth, labelH: r.height };
  });
  let { intra, inter } = findRingCollisions(buildSeatDescs(), radii, cx, cy, scale, COLLISION_BUFFER_PX);
  if (intra || inter) {
    const baseDiameter = 2 * AVATAR_R * baseScale;
    const floorDiameter = Math.round((baseDiameter * 2 / 3) / SHRINK_ROUND_PX) * SHRINK_ROUND_PX;
    const floorScale = Math.max(0.3, floorDiameter / (2 * AVATAR_R));
    let best = null;
    for (let s = baseScale; s >= floorScale - 1e-6; s -= 0.05) {
      const geo = scotusRingGeometry(s, w, m);
      resolveLabelOverflow(stage, s);
      const descs = seatNodes.map((node, i) => {
        const slot = geo.slots[i] || geo.slots[geo.slots.length - 1];
        const { rect: r, textWidth } = measureLabelNatural(node);
        return { ring: slot.ri, ang: slot.ang, labelW: textWidth, labelH: r.height };
      });
      const c = findRingCollisions(descs, geo.radii, cx, cy, s, COLLISION_BUFFER_PX);
      const remaining = (c.intra ? 1 : 0) + (c.inter ? 1 : 0);
      if (!best || remaining < best.remaining) best = { scale: s, radii: geo.radii, slots: geo.slots, remaining };
      if (remaining === 0) break;
    }
    if (best) { scale = best.scale; radii = best.radii; slots = best.slots; }
  }

  // Majority-view horizontal scroll (see leftBleedShift's own comment above layoutArc): measured
  // against the FINAL radii/scale chosen above.
  const extent = seatNodes.map((node, i) => {
    const s = slots[i] || slots[slots.length - 1];
    return { x: cx + s.r * Math.cos(s.ang), halfW: seatHalfWidth(node, scale) };
  });
  const shiftX = leftBleedShift(extent);
  const cx2 = cx + shiftX;

  seats.forEach((seat, i) => {
    const node = seatNodes[i];
    const s = slots[i] || slots[slots.length - 1];
    place(node, cx2 + s.r * Math.cos(s.ang), cy - s.r * Math.sin(s.ang), true, scale);
    node.classList.add("ctt-in-arc");
  });
  // SCOTUS never has a Circuit Justice or seniors band (28 U.S.C. §371) — nothing else to place.
  model._arcRender = { cx: cx2, cy, radii, bandR: 0, hasSeniorsBand: false };
  stage.scrollLeft = shiftX;
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
/** District-panel analogue of unpinDetail() (operator ask, 2026-09-05: it was missing the same
 *  "sticky + click elsewhere to close" standard every other docked panel in the app already
 *  has) — and, like unpinDetail()/hideDetail(), unpinning does NOT reset content: it only drops
 *  the lock, leaving whatever is currently shown (the just-unpinned district, until a real new
 *  hover replaces it) exactly as-is. The panel itself is rebuilt fresh every time Summary >
 *  District renders (unlike the single persistent S.ui.detail node), so this looks it up by
 *  class rather than holding a reference — a no-op if Summary > District isn't even on screen
 *  right now. applyGrowth() is stashed on S.ui by the render (this function has no closure
 *  access to it) and re-shrinks the formerly-pinned block unless the cursor still happens to be
 *  sitting on it. */
function unpinDistrictDetail() {
  if (!S.districtDetailPinnedId) return;
  S.districtDetailPinnedId = null;
  document.querySelector(".ctt-district-detail")?.classList.remove("ctt-pinned");
  S.ui.districtSummaryHover?.applyGrowth();
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
// Labels for the Federal Circuit's feeder blocks (visible only in the feeder view). Keyed by the
// same `specialized` level seat_blocks.json uses (Schema 2.0, issue #28 — was "feeder" in the
// data, a second vocabulary for the concept `courts.court_level` already calls "specialized").
const SPECIALIZED_LABEL = { cit: "CIT", uscfc: "CFC" };
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
    if (S.view === "circuit" && S.activeCircuit === "cafc") renderSeatBlocks(S.ui.nationalSVG, "specialized");
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
  // Idempotent PER LEVEL: the 'specialized' (cit/uscfc feeder) blocks render into the national
  // svg alongside the circuit blocks, so only the same level's previous group may be swept.
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
    if (!anchor && level === "specialized") {
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
    const labelled = (level === "circuit" && CIRCUIT_LABEL[cid]) || (level === "specialized" && SPECIALIZED_LABEL[cid]);
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
    const labelText = level === "circuit" ? CIRCUIT_LABEL[cid] : level === "specialized" ? SPECIALIZED_LABEL[cid] : null;
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
    if (S.ui.nationalSVG) renderSeatBlocks(S.ui.nationalSVG, "specialized");
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
    S.ui.nationalSVG.querySelectorAll('.ctt-blocks[data-level="specialized"]').forEach((n) => n.remove());
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
export async function mount(root, opts = {}) {
  // CONCURRENT mounts must not interleave: autoMount() fires on import, and a host page
  // that also calls mount() explicitly (tests/visual.html always has) starts a second mount
  // while the first is inside an await. Both clear the maps, then BOTH fill them — every
  // district array ends up doubled (seen live: each drilled selector listed its districts
  // twice; the national list survived only because S.courts is a Map). Sequential
  // re-mounting stays supported; a superseded mount just stops at its next await.
  const mySeq = (S._mountSeq = (S._mountSeq || 0) + 1);
  const superseded = () => S._mountSeq !== mySeq;
  // Recomputed every mount (issue #2): `opts.assetRoot` > `root.dataset.assetRoot` > the
  // import.meta.url-relative default. Set before any fetch below reads it.
  S.assetRoot = resolveAssetRoot(root, opts);
  // Reset per-mount state so re-mounting is idempotent (no accumulated districts/caches).
  S.courts.clear(); S.districtsByCircuit.clear(); S.judgeCache.clear();
  S.justices.clear(); S.justicesLoaded = false; S.localSVGCache.clear(); S.localPending.clear();
  cancelMorph();
  S.morphPlans.clear(); S.morphRAF = null; S.morphCancel = null; S.seatBlocks = null;
  S.view = "national"; S.activeCircuit = null; S.selectedCourt = null;
  S.majorityMode = false; S.paneMode = "timeline"; S.seniorMode = "hide"; S._seniorModeForced = null;
  S.detailPinned = false; S.affilMark = "none"; S._affilMarkUserChoice = "none";
  S.appointmentsAll = null; S.presidentPhotos = null;
  S.summaryView = "scotus"; S.districtArrangement = null; S.districtArrangementAlt = null;
  S.districtOnMap = false; S.districtMapState = null; S.districtDetailPinnedId = null;
  S.searchIndex = null; S.searchIndexPromise = null; S.searchSeq = 0; S.searchRovingPref = new Map();

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
    updateDistrictOverlayVisibility();   // the fixed corner D button is available from national
                                          // view's very first render, not just after a deploy

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

// Full teardown for SPA-style embedding (issue #6): removes the window/document listeners and
// the body-level tooltip node this instance registered, cancels any in-flight morph animation,
// and clears the root back to empty so the host can safely remove it (or hand it to a later
// mount() call — clearing `cttMounted` lets autoMount() pick it back up too). Bumping
// `_mountSeq` supersedes any fetch still in flight from the torn-down mount, so a slow response
// arriving after destroy() can't touch a `ui` that's already gone (same guard mount() itself
// uses against a second concurrent mount).
export function destroy(root) {
  S._mountSeq = (S._mountSeq || 0) + 1;
  cancelMorph();
  teardownGlobals();
  if (root) {
    root.innerHTML = "";
    root.classList.remove("ctt-root");
    delete root.dataset.cttMounted;
  }
  S.ui = null;
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
  defaultDistrictMapState, DISTRICT_ZOOM_STORAGE_KEY, DISTRICT_SQ_SCALE_HOVER, districtNationalTotals,
  scoreJudgeMatch, searchAndSort, presidentShorthand, courtLabelFor, navigateToSearchResult,
  runSearch, ensureSearchIndex,
  // issue #50: judge-icon collision avoidance (+ senior-band scoping, + horizontal scroll)
  resolveLabelOverflow, resolveLabelOverflowNode, findRingCollisions, growRingsForIntra,
  adjustInterRingGaps, shrinkForCollisions, iconDiameterWithRing, layoutArc, scotusRingGeometry,
  measureLabelNatural, seatHalfWidth, leftBleedShift,
  COLLISION_BUFFER_PX, OVERFLOW_WIDTH_FACTOR, SHRINK_ROUND_PX, AVATAR_R,
};
