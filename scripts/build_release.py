#!/usr/bin/env python3
"""build_release.py — bundle the static-download zip that a GitHub release attaches.

`CLAUDE.md` §6 requires the widget to run from `file://` and to survive archiving, so
the shippable artifact is a self-contained folder: `index.html` + `embed/` + exactly the
assets the app fetches at runtime. That file list is *derived*, never hardcoded:

  - every path in `data/manifest.json`'s `files` tree (the app reads the manifest first
    and resolves everything else relative to it, so this is the authoritative list);
  - every `photo_thumb` value inside those JSON payloads (photos are referenced only by
    that field — `court-tracker.js`/`appointments-chart.js` never construct a photo path);
  - `index.html` and all of `embed/`.

That keeps releasing a data-only operation, same contract as `build_assets.py`: drop in
new CSV/SVG, re-run the build, re-run this. A file the manifest lists but that is missing
on disk is a hard error — better to fail here than to ship a download with a dead fetch.

Deliberately excluded (they are in the git source tarball GitHub attaches automatically,
and the app never fetches them): the source-of-truth CSVs, `scripts/`, `docs/`, `tests/`,
`tools/`, and `data/census|nps/` build inputs.

The same derived tree is both the release zip and the GitHub Pages site — `--dir` writes
it out as a plain directory so `.github/workflows/pages.yml` can publish it, which keeps the
live page byte-identical to what people download.

Usage:
  python3 scripts/build_release.py                 # version from the git tag on HEAD
  python3 scripts/build_release.py --version v0.1.0
  python3 scripts/build_release.py --dir site      # write the tree to ./site (for Pages)
  python3 scripts/build_release.py --list          # dry run: print the file list only
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "data" / "manifest.json"

# Always shipped regardless of the manifest: the demo host and the widget code itself.
ALWAYS = ["index.html", "data/manifest.json"]
EMBED_DIR = "embed"


def _git_version() -> str:
    """The tag on HEAD if there is one, else a dev stamp from the manifest version."""
    try:
        tag = subprocess.run(
            ["git", "describe", "--tags", "--exact-match"],
            cwd=ROOT, capture_output=True, text=True, check=True,
        ).stdout.strip()
        if tag:
            return tag
    except (subprocess.CalledProcessError, FileNotFoundError):
        pass
    version = json.loads(MANIFEST.read_text(encoding="utf-8"))["version"]
    return f"dev-{version}"


def _walk_strings(node) -> list[str]:
    """Every string leaf in a nested dict/list — the manifest's `files` tree is both."""
    if isinstance(node, str):
        return [node]
    if isinstance(node, dict):
        return [p for v in node.values() for p in _walk_strings(v)]
    if isinstance(node, list):
        return [p for v in node for p in _walk_strings(v)]
    return []


def _photo_thumbs(payload) -> list[str]:
    """Collect `photo_thumb` values anywhere in a loaded JSON payload."""
    out = []
    if isinstance(payload, dict):
        for k, v in payload.items():
            if k == "photo_thumb" and isinstance(v, str) and v:
                out.append(v)
            else:
                out.extend(_photo_thumbs(v))
    elif isinstance(payload, list):
        for v in payload:
            out.extend(_photo_thumbs(v))
    return out


def collect() -> tuple[list[str], list[str]]:
    """Return (relative paths to ship, paths the data references but that are missing)."""
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    paths: set[str] = set(ALWAYS)
    paths.update(_walk_strings(manifest.get("files", {})))
    for f in sorted((ROOT / EMBED_DIR).iterdir()):
        if f.is_file() and not f.name.startswith("."):
            paths.add(f"{EMBED_DIR}/{f.name}")

    missing = sorted(p for p in paths if not (ROOT / p).is_file())

    # Second pass: photos, referenced only from inside the JSON payloads above.
    for rel in sorted(p for p in paths if p.endswith(".json")):
        src = ROOT / rel
        if not src.is_file():
            continue
        for thumb in _photo_thumbs(json.loads(src.read_text(encoding="utf-8"))):
            if (ROOT / thumb).is_file():
                paths.add(thumb)
            else:
                missing.append(thumb)

    return sorted(paths), sorted(set(missing))


def readme_text(version: str, manifest: dict, n_files: int, n_photos: int) -> str:
    counts = manifest.get("counts", {})
    return f"""Federal Court Appointment Tracker — static download ({version})

WHAT THIS IS
  A self-contained copy of the widget. Open index.html in any modern browser — it works
  straight from the filesystem (file://), with no server, no build step, and no network:
  every map, data and photo asset it fetches is in this folder.

DATA SNAPSHOT
  manifest version   {manifest.get('version', '?')}
  generated          {manifest.get('generated', '?')}
  last appointment   {manifest.get('last_appointment', '?')}
  coverage           {counts.get('courts', '?')} courts ({counts.get('circuits', '?')} circuits,
                     {counts.get('districts', '?')} districts, {counts.get('specialized', '?')} specialized)
                     · {counts.get('judges', '?')} judges
  bundle             {n_files} files, {n_photos} judge/president photos

  Judge data is collected from the FJC Biographical Directory and CourtListener / Free Law
  Project. Every row carries data_verified=false: it is machine-collected and sourced, but
  not yet human-verified row by row. Reported Federalist Society / American Constitution
  Society affiliations are shown as attributed claims with a source, never as fact.

EMBEDDING IT IN A PAGE
  Copy this folder next to your page, then add:

    <div id="court-tracker-root"></div>
    <link rel="stylesheet" href="embed/court-tracker.css">
    <script type="module" src="embed/court-tracker.js"></script>

  All CSS selectors are ctt--prefixed and all asset paths are relative, so the widget does
  not disturb the host page and keeps working when the page is archived. The appointments
  beeswarm is a second, independent widget — see index.html for its two-line equivalent.

SOURCE
  https://github.com/digitalgroundgame/court-tracker
"""


def main() -> int:
    ap = argparse.ArgumentParser(description="Bundle the static-download release zip.")
    ap.add_argument("--version", help="Release version, e.g. v0.1.0 (default: git tag on HEAD)")
    ap.add_argument("--output", help="Output .zip path (default: dist/court-tracker-<version>.zip)")
    ap.add_argument("--dir", help="Write the tree to this directory instead of a zip (GitHub Pages)")
    ap.add_argument("--list", action="store_true", help="Print the file list and exit, writing nothing")
    args = ap.parse_args()

    if not MANIFEST.is_file():
        print("[build_release] data/manifest.json not found — run scripts/build_assets.py first",
              file=sys.stderr)
        return 1

    version = args.version or _git_version()
    paths, missing = collect()
    if missing:
        print(f"[build_release] {len(missing)} referenced file(s) missing on disk:", file=sys.stderr)
        for p in missing[:20]:
            print(f"  - {p}", file=sys.stderr)
        if len(missing) > 20:
            print(f"  ... and {len(missing) - 20} more", file=sys.stderr)
        print("[build_release] re-run scripts/build_assets.py (and cache_photos.py) — aborting",
              file=sys.stderr)
        return 1

    photos = [p for p in paths if p.startswith("assets/photos/")]
    total = sum((ROOT / p).stat().st_size for p in paths)

    if args.list:
        for p in paths:
            print(p)
        print(f"\n[build_release] {len(paths)} files ({len(photos)} photos), "
              f"{total / 1e6:.1f} MB uncompressed — nothing written (--list)")
        return 0

    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))

    if args.dir:
        site = Path(args.dir)
        # Rebuild from scratch: a file dropped from the data must not linger on the site.
        if site.exists():
            shutil.rmtree(site)
        for p in paths:
            dest = site / p
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(ROOT / p, dest)
        (site / "README.txt").write_text(
            readme_text(version, manifest, len(paths), len(photos)), encoding="utf-8")
        print(f"[build_release] wrote {len(paths) + 1} files to {site}/ "
              f"({total / 1e6:.1f} MB) — data version {manifest.get('version')}, "
              f"last appointment {manifest.get('last_appointment')}")
        return 0

    out = Path(args.output) if args.output else ROOT / "dist" / f"court-tracker-{version}.zip"
    out.parent.mkdir(parents=True, exist_ok=True)
    root_name = f"court-tracker-{version}"

    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for p in paths:
            z.write(ROOT / p, f"{root_name}/{p}")
        z.writestr(f"{root_name}/README.txt",
                   readme_text(version, manifest, len(paths), len(photos)))

    # Photos on disk that no longer appear in the data — stale thumbs from earlier sweeps.
    on_disk = sum(1 for f in (ROOT / "assets" / "photos").iterdir() if f.is_file())
    stale = on_disk - len(photos)

    print(f"[build_release] wrote {out.relative_to(ROOT) if out.is_relative_to(ROOT) else out} "
          f"({out.stat().st_size / 1e6:.1f} MB zipped, {total / 1e6:.1f} MB unpacked)")
    print(f"[build_release] {len(paths) + 1} entries under {root_name}/ — "
          f"{len(photos)} photos, data version {manifest.get('version')}, "
          f"last appointment {manifest.get('last_appointment')}")
    if stale > 0:
        print(f"[build_release] note: {stale} photo(s) in assets/photos/ are unreferenced by the "
              f"current data and were not bundled")
    return 0


if __name__ == "__main__":
    sys.exit(main())
