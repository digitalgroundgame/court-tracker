# archive/

Home for features that were removed from the live widget at the operator's request but kept
around in case we want to test and reintroduce them later. See `CLAUDE.md` §7's "Large removals"
subsection for the full policy this directory implements.

## Layout

Each removed feature gets its own subfolder: `archive/<feature-slug>/`, containing:

- The removed source (verbatim excerpts, or a full file, whichever the feature actually was).
- `NOTES.md`: what the feature was, why it was removed, what it depended on (state fields,
  helper functions, CSS classes, data files) that may no longer exist in the live code, and what
  would need to change to reintroduce it.

## What does NOT belong here

- A pure data/geometry correction — not a removal at all.
- Something removed because it was a mistake or was never real functionality to begin with (e.g.
  a placeholder that never did anything) — nothing to preserve there; just delete it, and say so
  in the PR description.
- Dead code made vestigial as a *side effect* of a real removal (unused helpers, orphaned CSS,
  now-dead state fields that only existed to support the removed feature) — that gets deleted
  outright, not archived; only the feature's own intentional code is preserved. Call out what was
  identified as vestigial and removed in the PR description regardless.

## Current contents

(none yet — this directory is created by issue #65, ahead of the first real removal.)
