# docs/export/

Portable, project-agnostic procedure specs — not specific to court-tracker. Everything else under
`docs/` documents *this* project (the codebook, data sources, geometry contract); these three files
are templates for setting up a branch → PR → squash-merge workflow and a resumable progress-log
ledger in *any* repo, stripped of court-tracker's own specifics (issue numbers, session-naming
scheme, dated history).

They live here so they're easy to find and copy out, not because court-tracker depends on them
being in this exact location — court-tracker's own workflow rules are in `CLAUDE.md` §7 and
`PROGRESS.md` directly, not read from these files at runtime.

- **`GIT_SQUASH_MERGE_SETUP.md`** — the git workflow spec: why/how squash-only merging works on
  GitHub, the core branch/PR/merge rules, and a discovery-first setup checklist.
- **`PROGRESS_LOG_SETUP.md`** — the companion resumable-ledger spec (Resume Briefing / Session Log
  split, date-verification discipline, bundled-vs-separate ledger PRs).
- **`SETUP_INIT_PROMPT.md`** — a ready-to-paste kickoff message for starting the above setup
  process in a new or existing repo.

Both specs are written to require a full discovery-and-discussion pass, with the human's explicit
approval of a concrete plan, before any file gets written or any repo setting gets changed — see
each doc's §0 and §0.5.
