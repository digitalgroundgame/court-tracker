#!/usr/bin/env python3
"""cache_photos.py — bake a clean, anti-aliased local thumbnail for every licensed judge/
justice photo, instead of the widgets hotlinking Wikimedia thumb URLs at runtime.

Why: many source scans (old FJC bar-composite photos) carry a real halftone/dot-screen
texture at FULL resolution — it's actual image content, not a rendering bug. Downscaling
that straight to a 34-84px avatar (even with a high-quality resize) beats against the dot
pattern and produces visible moiré.

First cut of this script applied a blur proportional to the downscale RATIO to every photo,
uniformly — operator feedback (correctly) called this counterproductive: most photos are
clean modern digital headshots with no aliasing risk at all, and blurring them anyway just
made them worse for no benefit. Fixed by making the decision PER PHOTO: measure how much
high-frequency residue survives a plain, unblurred downscale (`_aliasing_energy`); only
photos that actually show aliasing risk get blurred, and the blur amount scales with how bad
that risk measures, not with a blind resize-ratio formula. Calibrated against a real halftone
scan (energy ~19, wants ~8px blur) and several clean modern photos (energy 7-12, want ~0px) —
see PROGRESS.md for the sample and the exact numbers.

Never fabricates or upgrades a licensing claim (CLAUDE.md §2): only processes rows that
already carry both `photo_url` and `photo_license` from collect_courtlistener.py /
enrich_wikipedia.py. This script only re-encodes pixels those two already cleared.

Every network fetch is cached under data/cache/photos_orig/ (keyed by a hash of the ORIGINAL
image URL, not the thumb URL, so re-runs are free and `--no-net` rebuilds entirely offline).
Output thumbnails are content-addressed under assets/photos/<hash>.jpg, and the url->path
lookup build_assets.py consumes lives at data/cache/photo_thumbs.json.

Usage:
    python3 scripts/cache_photos.py              # fetch (cached) + write thumbnails
    python3 scripts/cache_photos.py --no-net      # rebuild from cached originals only
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

from PIL import Image, ImageChops, ImageFilter, ImageStat

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
ORIG_CACHE = DATA / "cache" / "photos_orig"
THUMBS_OUT = ROOT / "assets" / "photos"
LOOKUP_FILE = DATA / "cache" / "photo_thumbs.json"

UA = "FederalCourtTracker/0.1 (https://github.com/; scapper@u.rochester.edu)"
SLEEP = 0.2

# The smallest CSS size either widget ever displays an avatar at (court-tracker.js's
# `.ctt-judge.ctt-justice-inhead .ctt-avatar`, the Circuit-Justice-in-header chip). Blur is
# calibrated against THIS ratio — a master safe at the smallest size is safe at any larger
# on-screen size too, since downscaling an already-blurred image can't reintroduce aliasing;
# it only overshoots slightly (a touch softer than strictly necessary) at the bigger sizes.
SMALLEST_DISPLAY_PX = 34
MASTER_PX = 200          # cached thumbnail size: covers ~3x DPR at the 44-84px common cases
# Adaptive blur (per photo, not a blanket ratio-based formula — see module docstring).
# ENERGY_BASELINE: clean modern photos scored 7-12 in the calibration sample; a halftone
# scan scored ~19. ENERGY_SCALE converts "energy above baseline" into a blur radius (tuned
# so the halftone sample, ~9 over baseline, lands close to the ~8px that visually fixed it).
# Was 10.0 - measured directly against the real 2,238-photo population (not just the small
# calibration sample) and found that value sits almost exactly at the MEDIAN energy (9.90),
# so roughly half of all ordinary, non-aliased photos were getting some blur they didn't need
# (caught via 5 operator-reported over-blur cases - Nguyen, Aframe, Hsu, Burrell, Davila - all
# in the 13-16 energy range, i.e. real photos with normal fine detail, not print halftone).
# Raised to sit above the population's p90 (12.90) instead of its median, so only the
# highest-energy tail (most likely to be a genuine scanned/halftone artifact) gets any
# correction at all; a true halftone case (Bruggink, energy 27 full-frame / 22 central-crop,
# still the dataset's max) is comfortably above this and still gets full correction.
ENERGY_BASELINE = 13.0
ENERGY_SCALE = 0.9
# Was 20.0 - never visually re-checked against the real worst cases in the actual 1,140-photo
# batch, which score well above the ~19 calibration reference (up to 27) and were hitting
# 14-16px, well past the cap's own documented "~8px was the fix" target. A radius sweep on the
# worst real case (Eric G. Bruggink, energy 27) confirmed 14-16px visibly destroys facial
# detail at every on-screen avatar size (34/44/84px, the sizes actually used - see
# .ctt-avatar/.ctt-detail-photo in court-tracker.css) while barely reducing the halftone
# pattern's visibility any further than ~8px already does. Capped back to the value that was
# actually verified to look right, rather than letting extreme outliers extrapolate past it.
BLUR_CAP = 8.0
JPEG_QUALITY = 88

JUDGES_CSV = DATA / "judges.csv"
CIRCUIT_JUSTICES_CSV = DATA / "circuit_justices.csv"
APPOINTMENTS_CSV = DATA / "appointments.csv"
PRESIDENT_PHOTOS_CSV = DATA / "president_photos.csv"


def _read_csv(path: Path) -> list[dict]:
    if not path.exists():
        return []
    with path.open(newline="", encoding="utf-8") as fh:
        return [row for row in csv.DictReader(fh) if any(v.strip() for v in row.values())]


def original_url(thumb_url: str) -> str:
    """Wikimedia thumb URLs are once-downscaled already; the ORIGINAL (higher-res, and not
    pre-degraded by Wikimedia's own thumbnailer) gives our own resize more headroom. Thumb
    URLs look like `.../commons/thumb/a/a9/Name.png/330px-Name.png`; the original drops the
    `/thumb` segment and the trailing `NNNpx-` sized copy. Anything else (already an original,
    or a non-Wikimedia URL) passes through unchanged."""
    if "/thumb/" not in thumb_url:
        return thumb_url
    head, _, tail = thumb_url.partition("/thumb/")
    parts = tail.split("/")
    if len(parts) < 3:
        return thumb_url
    # Standard layout: <hashdir-a>/<hashdir-ab>/<original filename>/<sized-copy filename>.
    # parts[2] is the pristine original filename — safer than stripping a "NNNpx-" prefix
    # off the sized copy, which breaks if the real filename itself starts with digits+px.
    dir_a, dir_b, filename = parts[0], parts[1], parts[2]
    return f"{head}/{dir_a}/{dir_b}/{filename}"


def _fetch(url: str) -> bytes:
    last = None
    for attempt in range(5):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=120) as r:
                time.sleep(SLEEP)
                return r.read()
        except urllib.error.HTTPError as e:
            last = e
            if e.code in (429, 503, 502, 504):
                wait = int(e.headers.get("Retry-After") or (2 ** attempt) * 5)
                print(f"    [{e.code}] backing off {wait}s", file=sys.stderr)
                time.sleep(min(wait, 120))
                continue
            raise
        except (urllib.error.URLError, TimeoutError) as e:
            last = e
            time.sleep((2 ** attempt) * 2)
    raise RuntimeError(f"giving up on {url[:120]}: {last}")


def _key(url: str) -> str:
    return hashlib.sha1(url.encode("utf-8")).hexdigest()[:16]


def fetch_original(url: str, allow_net: bool) -> Path | None:
    orig = original_url(url)
    ext = orig.rsplit(".", 1)[-1].split("?")[0].lower()
    if ext not in ("jpg", "jpeg", "png", "gif", "webp"):
        ext = "jpg"
    cf = ORIG_CACHE / f"{_key(orig)}.{ext}"
    if cf.exists():
        return cf
    if not allow_net:
        return None
    try:
        data = _fetch(orig)
    except Exception as e:  # noqa: BLE001 — resumable batch job: log + skip, don't abort the run
        print(f"  ! fetch failed for {orig[:100]}: {e}", file=sys.stderr)
        return None
    ORIG_CACHE.mkdir(parents=True, exist_ok=True)
    cf.write_bytes(data)
    return cf


def _aliasing_energy(im_sq: Image.Image, target: int = SMALLEST_DISPLAY_PX,
                      central_frac: float = 0.6) -> float:
    """How much high-frequency content survives a plain, unblurred downscale to the
    smallest size we ever display an avatar at. A real face photo, properly downscaled,
    shouldn't have much per-pixel residue at that size; a strong residual means the source
    has periodic structure (almost always a halftone-printed scan) that will alias.
    Self-contained (high-passes the downscale against its own 1px-blurred copy) — no
    reference image needed, cheap enough to run on every photo in the batch.

    Measured over the CENTRAL crop only, not the full square: a face photo's background
    (a flag, a bookshelf, a press-badge lanyard with printed text) can carry just as much
    sharp high-frequency detail as a real halftone dot-screen, and that's a false positive -
    it's not what's on the FACE, which is what a viewer actually looks at and what motivated
    this whole check. Confirmed on a real case (Don Willett's "PARTY PASS" press-badge photo)
    where full-frame energy read 25.99 - close to an actual halftone scan's 27.39 - but the
    face itself needed nowhere near that much blur."""
    w, h = im_sq.size
    cw, ch = int(w * central_frac), int(h * central_frac)
    x0, y0 = (w - cw) // 2, (h - ch) // 2
    central = im_sq.crop((x0, y0, x0 + cw, y0 + ch))
    d = central.resize((target, target), Image.LANCZOS).convert("L")
    d_blur = d.filter(ImageFilter.GaussianBlur(radius=1))
    return ImageStat.Stat(ImageChops.difference(d, d_blur)).mean[0]


def _vertical_crop_frac(h: int, w: int) -> float:
    """Where to vertically anchor the square crop, as a fraction of the (h-s) slack: 0.5 is
    centered, 0.0 is flush with the top. A plain center-crop is fine for a near-square headshot,
    but fails badly on a tall, seated "full formal portrait" composition (a common official
    court-photo genre - hands folded in lap, or a full-length robe shot) where the face sits in
    the top ~15-20% of the frame: a center-crop of e.g. a 108x187 source grabs the torso/hands,
    missing the face almost entirely. Found via 4 operator-reported cases (Aiken 58x139,
    Paez 108x187, Thomas 117x195, Wynn 387x883 - h/w of 1.6-2.4) where the face's actual position
    was visually confirmed to sit near the top; calibrated so all 4 land correctly. Below h/w
    1.3 (ordinary headshot-ish proportions) stays centered - only clearly tall/full-body sources
    get biased, tapering smoothly rather than a hard cutoff so borderline cases aren't overcorrected."""
    if h <= w:
        return 0.5
    ratio = h / w
    lo, hi = 1.3, 2.0
    frac_lo, frac_hi = 0.5, 0.05
    t = min(1.0, max(0.0, (ratio - lo) / (hi - lo)))
    return frac_lo + t * (frac_hi - frac_lo)


def make_thumbnail(src: Path, dst: Path) -> None:
    im = Image.open(src)
    if im.mode not in ("RGB", "L"):
        # Composite any transparency onto white rather than let PIL fill it black on
        # JPEG save — a face photo with a transparent background is a rare but real case.
        bg = Image.new("RGB", im.size, "white")
        im = im.convert("RGBA")
        bg.paste(im, mask=im.split()[-1])
        im = bg
    else:
        im = im.convert("RGB")
    w, h = im.size
    s = min(w, h)
    x0 = (w - s) // 2
    y0 = int((h - s) * _vertical_crop_frac(h, w))
    im = im.crop((x0, y0, x0 + s, y0 + s))
    energy = _aliasing_energy(im)
    blur_px = min(BLUR_CAP, max(0.0, energy - ENERGY_BASELINE) * ENERGY_SCALE)
    # Gate by how much real downscaling is actually happening. The whole premise of this blur
    # is "a high-res scan's printed dot-screen will alias when shrunk a lot" - that premise is
    # false for a source that's already small (near or below MASTER_PX): there's no meaningful
    # downscale to alias FROM, so "high-frequency energy" there is just inherent softness/JPEG
    # blockiness, and blurring it only makes an already-limited image worse, not better. Found
    # via two real reports (Gregory A. Phillips, 255x340px source; Paul J. Kelly Jr., a
    # 144x144px source SMALLER than the master - i.e. upscaled, not downscaled at all) that
    # both still got a few px of blur for no benefit under the size-blind formula. Tapers
    # linearly from 0 at s=MASTER_PX to full strength at s=2*MASTER_PX or larger.
    downscale_factor = min(1.0, max(0.0, (s - MASTER_PX) / MASTER_PX))
    blur_px *= downscale_factor
    if blur_px > 0.3:
        im = im.filter(ImageFilter.GaussianBlur(radius=blur_px))
    im = im.resize((MASTER_PX, MASTER_PX), Image.LANCZOS)
    dst.parent.mkdir(parents=True, exist_ok=True)
    im.save(dst, "JPEG", quality=JPEG_QUALITY)


def collect_photo_urls() -> set[str]:
    urls: set[str] = set()
    for row in _read_csv(JUDGES_CSV):
        if row.get("photo_url", "").strip() and row.get("photo_license", "").strip():
            urls.add(row["photo_url"].strip())
    for row in _read_csv(CIRCUIT_JUSTICES_CSV):
        if row.get("photo_url", "").strip() and row.get("photo_license", "").strip():
            urls.add(row["photo_url"].strip())
    for row in _read_csv(APPOINTMENTS_CSV):
        if row.get("photo_url", "").strip() and row.get("photo_license", "").strip():
            urls.add(row["photo_url"].strip())
    for row in _read_csv(PRESIDENT_PHOTOS_CSV):
        if row.get("photo_url", "").strip() and row.get("photo_license", "").strip():
            urls.add(row["photo_url"].strip())
    return urls


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-net", action="store_true", help="rebuild from cached originals only")
    ap.add_argument("--force", action="store_true",
                     help="regenerate every thumbnail even if already cached (e.g. after a "
                          "blur/resize formula change) - originals are still reused from cache")
    args = ap.parse_args()
    allow_net = not args.no_net

    urls = collect_photo_urls()
    print(f"[cache_photos] {len(urls)} distinct licensed photo_url values")

    lookup: dict[str, str] = json.loads(LOOKUP_FILE.read_text()) if LOOKUP_FILE.exists() else {}

    def _save_lookup():
        LOOKUP_FILE.parent.mkdir(parents=True, exist_ok=True)
        LOOKUP_FILE.write_text(json.dumps(lookup, indent=2, sort_keys=True))

    made = skipped = missing_orig = failed = 0
    urls_sorted = sorted(urls)
    for i, url in enumerate(urls_sorted):
        rel = f"assets/photos/{_key(url)}.jpg"
        dst = ROOT / rel
        if not args.force and dst.exists() and lookup.get(url) == rel:
            skipped += 1
            continue
        src = fetch_original(url, allow_net)
        if src is None:
            missing_orig += 1
            continue
        try:
            make_thumbnail(src, dst)
        except Exception as e:  # noqa: BLE001 — one bad image must not kill the whole batch
            print(f"  ! thumbnail failed for {url[:100]}: {e}", file=sys.stderr)
            failed += 1
            continue
        lookup[url] = rel
        made += 1
        # This is a long, network-bound batch (can be 1000+ images) — save progress
        # periodically so an interruption doesn't lose a completed run's lookup entries,
        # and print periodically so a backgrounded run isn't silent for minutes at a time.
        if made % 20 == 0:
            _save_lookup()
            print(f"  ...{i + 1}/{len(urls_sorted)} ({made} made, {skipped} already-current)")

    _save_lookup()
    print(f"[cache_photos] made {made}, already-current {skipped}, "
          f"no original ({'net off' if not allow_net else 'fetch failed'}) {missing_orig}, "
          f"thumbnail errors {failed}")
    print(f"[cache_photos] lookup -> {LOOKUP_FILE.relative_to(ROOT)} ({len(lookup)} entries)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
