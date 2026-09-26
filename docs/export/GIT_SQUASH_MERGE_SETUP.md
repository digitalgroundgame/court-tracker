# Git Squash-Merge Workflow — Procedure Spec

**Audience:** an AI coding assistant being handed this document at the start of a project (new or
existing repo), to set up — or reconcile with — a branch → PR → squash-merge workflow for a
multi-session / multi-contributor codebase.

**Companion doc:** [`PROGRESS_LOG_SETUP.md`](./PROGRESS_LOG_SETUP.md) — a resumable work-ledger
spec designed to pair with this workflow. This doc calls out where the two interlock. You can
adopt either independently, but they're designed together: the ledger's entries are exactly what
becomes squash-commit messages, and its date/merge-conflict discipline exists because of this
workflow's concurrency assumptions.

**[`SETUP_INIT_PROMPT.md`](./SETUP_INIT_PROMPT.md)** has a ready-to-paste kickoff message a human
can use to start this whole process in a real repo — if you were handed that prompt to get here,
you're already following it correctly.

**If you (the assistant) are reading this at the start of a setup task, do not just apply these
rules silently.** Walk the human through each decision point below — most sections end with
questions you should actually ask, not assumptions to make on their behalf. Where the repo already
has an established convention (an existing `CONTRIBUTING.md`, a protocol file like `CLAUDE.md`, a
different branch-naming scheme already in git history), surface the conflict and ask whether to
adopt, adapt, or leave it — don't silently overwrite. **§0 below is not optional** — run it before
any other section in this doc, and see §0.5 for the hard gate on when you're actually allowed to
start writing anything.

---

## 0. Discovery first: find out what already governs this repo

**Do this before proposing any rule, default, or file structure in the rest of this document.** A
repo that has been running for any length of time almost always has *some* existing procedure —
sometimes written down in one place, sometimes visible only in how people (or prior AI sessions)
actually behaved, sometimes known only to the human and never written anywhere at all. Treat all
three as real sources of truth and reconcile against all three before writing or overwriting
anything.

### 0.1 Explicit sources — check these directly
- A protocol/instructions file already read at session/task start (`CLAUDE.md`, `AGENTS.md`,
  `CONTRIBUTING.md`, a "Development" section in `README.md`, a kickoff/onboarding prompt file).
- Actual GitHub repo settings: `gh api repos/{owner}/{repo} --jq '{squash: .allow_squash_merge,
  merge: .allow_merge_commit, rebase: .allow_rebase_merge}'`, and branch protection on `main`
  (`gh api repos/{owner}/{repo}/branches/main/protection` — a 404 means none are set, which is a
  normal answer, not an error to work around).
- Any existing `.gitattributes`, `CODEOWNERS`, issue templates, or PR templates.

### 0.2 Implicit sources — mine actual history; don't assume the explicit sources are complete or current
- `git log --oneline -20` and `gh pr list --state merged --limit 20`: what do real branch names and
  PR titles actually look like? Is there a consistent scheme that was never written down anywhere?
- `gh pr view <N> --json files` on a handful of recent merged PRs: does the real file set match what
  a written rule claims? **A documented rule and observed practice can both be correct at once if
  they describe different granularity of the same thing** — don't jump to "the doc is stale" the
  moment you see a pattern that isn't explicitly written down. For example, a rule saying "bundle
  file X with the code that needs it" and a separate small PR later correcting a detail in file X are
  not automatically in conflict; the second may be a structurally necessary corollary of the first
  (you cannot write a commit's own resulting hash, or any other fact only knowable after that commit
  lands, into the commit itself). Read the actual diffs, and check `git log` on whichever file states
  the rule — when it was last touched, by which commit, whether that commit's own message explains
  the reasoning — before concluding a policy changed, drifted, or was violated.
- Actual merge method used historically: does `main`'s history show merge commits, single squashed
  commits, or a rebased linear history? This is usually visible just from `git log --oneline` shape
  (a squash-merged history has exactly one commit per PR; a merge-commit history has merge nodes).

### 0.3 Ask the human directly, too — implicit and explicit sources can both be silent or stale
- *"Is there an existing way this repo's contributors branch, PR, and merge that I should know
  about, even if it isn't written down anywhere?"*
- *"If I find a mismatch between what's documented and what the history actually shows, do you want
  me to flag it for a decision, or do you already know which one is current and can just tell me?"*

### 0.4 Reconcile per-decision, not all-or-nothing

Do not offer a single "keep everything" vs. "replace everything" choice — a real repo is very
likely to want to keep some existing conventions and adopt others. Break it down:

| Decision point | Ask |
|---|---|
| Branch naming | Keep the existing pattern, or adopt a convention from §2? |
| Merge method (squash/merge/rebase) | Keep whatever is currently allowed, or enforce squash-only per §1? |
| Branch protection on `main` | Leave as-is, or add/change requirements? |
| Self-merge authority | Keep whatever authority split already exists (if any), or adopt the risk-tiered default in §2? |
| PR title convention | Keep the existing style, or adopt the "title = ledger heading" convention in §4? |
| Protocol-file hard-stop list | Keep an existing list of "always needs sign-off" files, or adopt/extend the one in §2? |

For each row, if the answer is "adopt this doc's version," write the concrete resolved decision
into the actual protocol file — a real branch prefix, a real name or "self-merge OK," a real file
list — not a placeholder, and show the human the diff before it lands rather than overwriting
silently.

**If you find a genuine discrepancy** (documented rule doesn't match observed practice, and it
isn't explained by a structural corollary like the commit-hash example above): present the specific
commits/PRs that show the mismatch, say which side you think is actually current and why, and ask
the human to resolve it. Don't silently pick one, and don't paper over a real disagreement with
vague language that could describe either side.

### 0.5 Hard gate: no changes until the human has understood and approved the plan

**Discovery and discussion are read-only. Nothing in this document authorizes writing, editing, or
running any state-changing command before that discussion is finished and explicitly approved.**
This is stricter than "ask before overwriting" in the sections above — it's a checkpoint the whole
setup has to clear before *any* of it is implemented, not a per-file courtesy.

Concretely:
- **Fine to do during discovery, any time, without asking first**: read-only investigation —
  `git log`, `git diff`, `gh pr view`, `gh pr list`, `gh api ... ` with `GET` (or no method, which
  defaults to GET), reading any file.
- **Not fine until the gate clears**: `gh api -X PATCH` (changing repo/merge settings), creating or
  editing `.gitattributes`/`CODEOWNERS`/a protocol file, `git commit`, `git push`, `gh pr create`,
  `gh repo create`, `git init` — anything that changes repo state or leaves a record, however small
  or reversible it seems.
- Once §0.1–§0.4 (and the ledger doc's own §0, if that's in scope too) are done, **assemble the
  findings and the per-decision table into one concrete, written plan** — not a re-explanation of
  this document's contents, but the actual resolved answers for *this* repo (the real branch prefix,
  the real merge-authority split, the real file list for the hard-stop rule, etc.).
- **Present that plan and stop.** Ask directly: *"Does this match your understanding, and do you
  approve implementing it as written?"* A one-word "ok" to a vague question doesn't clear the gate —
  the plan has to actually be in front of them (as text, not just implied by prior conversation) for
  their approval to mean anything. If they push back or want changes, revise and re-present; don't
  treat a partial or ambiguous response as approval to proceed.
- Only after an explicit, unambiguous "yes, do this" (or equivalent) do you move to writing files,
  running `gh api` mutations, or making commits — and even then, the per-section rules above (e.g.
  §2's hard-stop-file rule, which is about *merging*, not just writing) still apply on top of this
  gate; clearing this gate authorizes the setup work itself, not a blanket exemption from ordinary
  git-workflow discipline once the repo is live under it.
- This gate applies whether this is a brand-new repo or an established one. A brand-new repo has
  less to conflict with, but "there's nothing to overwrite" is not the same as "no discussion
  needed" — the human still needs to understand and approve what's about to become this repo's
  standing policy.

---

## 1. Why squash merge, and why enforce it server-side

When more than one contributor — human or AI session — merges into `main` over time, two problems
compound:

- A branch that falls behind `main` needs `main` merged back into it to resolve, which creates a
  "merge main in" commit on that branch. Left as an ordinary merge commit, that noise becomes
  permanent history.
- Multi-commit branches (WIP commits, fixup commits, "address review comment" commits) pollute
  `main`'s history with detail nobody will ever want to `git blame` or `git bisect` against.

Squash merge collapses a branch's entire commit sequence into exactly one commit on `main`, whose
message is the PR title (plus, on GitHub, a `(#N)` suffix). This makes the PR title load-bearing:
it becomes the permanent commit message, so it should be written as one (see §4).

**Enforce this at the repository settings level, not as a remembered convention.** Relying on every
contributor (or every AI session) to remember to pass `--squash` is fragile. GitHub lets you disable
the other merge methods outright, so a plain `--merge` is refused by the server, not just
discouraged by a doc:

```bash
# Requires admin rights on the repo. Check current settings first:
gh api repos/{owner}/{repo} --jq '{squash: .allow_squash_merge, merge: .allow_merge_commit, rebase: .allow_rebase_merge}'

# Enforce squash-only:
gh api -X PATCH repos/{owner}/{repo} \
  -f allow_squash_merge=true \
  -f allow_merge_commit=false \
  -f allow_rebase_merge=false
```

If the `gh api` call is rejected (insufficient permissions, org policy locks repo settings), tell
the human this needs to be done from the repo's Settings → General → "Pull Requests" page in the
GitHub web UI, and give them the exact checkboxes to change rather than guessing at a workaround.

**Ask the human:** *Do you want squash-only enforced server-side (recommended), or just documented
as a convention? Do you also want basic branch protection on `main`* (require a PR before merging,
optionally require a review) *— and if so, should the AI session itself be exempt from the review
requirement, or should every PR, including the assistant's own, wait for human review before
merge?*

---

## 2. The core rules

Copy or adapt the following into whatever protocol file this repo uses (see §5). Text below is
written to be pasted in as-is; replace bracketed placeholders.

> **Branch → PR → merge, never commit straight to `main`.** This repo runs on GitHub Issues + PRs,
> not a bare push log.
>
> - **Session/work-unit start**: in addition to any other required reading, check `gh issue list`
>   and `gh pr list` (open state) for standing work and review feedback before assuming the next
>   task is whatever a task list or backlog says next — an open issue or a review comment on your
>   own PR can supersede it.
> - **Per unit of work**: branch off `main` as `[naming convention]` (e.g. `claude/<slug>`,
>   `<initials>/<slug>`, `feature/<slug>` — pick one and stay consistent). Commit the code/data
>   change. `git status` before staging broadly — verify nothing that should be gitignored snuck
>   in, and that no unexpected file is staged.
> - **Open a PR** (`gh pr create`) once the unit of work is done; reference the issue it addresses
>   (`Fixes #N`) when there is one. Write a real description: what changed, how it was verified,
>   what's next, any blockers.
> - **If this project also uses a resumable ledger bundled into the same PR as its code** (see the
>   companion doc's §4 "bundled" option): expect that a small ledger-only follow-up PR after merge
>   is normal, not a policy break. An entry written before the squash-merge happens can't cite that
>   commit's own resulting SHA or confirm a merge that hasn't happened yet — especially if merge
>   authority (below) defers to a human, possibly in a later session. Once the PR actually merges,
>   a tiny follow-up that only updates the ledger's status/SHA is expected, routine, and normally
>   self-mergeable. Write this down explicitly once it happens a couple of times, so a later session
>   doesn't mistake the pattern for a reversal of the bundling rule (see companion doc §4).
> - **Merge authority is case-by-case.** Merge routine/low-risk PRs once clean (checks pass, no
>   protocol-file violations). Leave anything touching correctness, scope, or an established
>   design/UX contract — and any PR from a different session or contributor you didn't just write —
>   for explicit human go-ahead; when in doubt, summarize the diff and ask rather than merge.
> - **Merge with `--squash`, not `--merge`.** See §1 for why, and whether it's server-enforced in
>   this repo.
> - **Hard stop, stricter than the above: any change to a protocol/instruction file — anything a
>   session or contributor is expected to read before doing work (this file, a project kickoff
>   prompt, a ledger's own instance-protocol block, etc.) — always needs explicit human discussion
>   before merging, even if the rest of the PR is otherwise routine.** This has two distinct
>   triggers:
>   1. The PR's own diff touches one of these files directly.
>   2. The PR *implies* a needed change without touching them — it establishes a new standard,
>      policy, or invariant that a protocol file now describes incompletely or incorrectly unless
>      updated. Recognizing this takes reading a PR for what it establishes, not just diffing its
>      file list.
>   Flag either case explicitly and get a go-ahead on *that part* on its own before merging any of
>   it. This is something a human consciously signs off on, not a side effect of merging a feature
>   PR.
> - **When resolving a merge conflict on someone else's PR branch, commit it before doing anything
>   else.** A fully-resolved-but-uncommitted merge can be silently corrupted by an intervening
>   branch switch — git may carry some uncommitted changes across and drop others with no error. If
>   a resolution can't be committed immediately, stash it explicitly (`git stash push -u`) rather
>   than leaving it bare in the working tree. Verify the committed tree's actual content — not just
>   a green test run — before pushing, especially for a conflict that touched files beyond the
>   obvious one.
> - Skip opening a PR only if there is truly nothing to commit (pure investigation, no file
>   changes) — but still check issues/PRs at session/work start regardless.

**Ask the human:**
- *What branch-naming convention do you want* (`claude/<slug>`, `<initials>/<slug>`, something
  else)?
- *Should the assistant have standing authority to self-merge routine PRs, or should every PR wait
  for you regardless of risk level?* (Some projects want the former for velocity; others — e.g.
  anything with real users, real data, or a public repo — want every merge reviewed. There's no
  universally correct default here.)

---

## 3. Large/destructive changes: archive over delete

If this project expects the assistant to remove features or large chunks of code at a human's
request, consider adopting an archive-first convention:

> When removing a feature at explicit request, move its own code into `archive/<feature-slug>/`
> with a `NOTES.md` — what it was, why it was removed, what it depended on, and what reintroducing
> it would take — in the same PR as the removal, unless told otherwise for that specific removal.
>
> - Archive the feature's own code; delete everything the removal makes vestigial (dead state,
>   now-unused helpers, orphaned styles, dead config entries) outright — don't archive those.
> - State both categories explicitly in the PR description under a "Removed / made vestigial"
>   heading.
> - Verify in a running instance of the app before merging, not just from the diff — check the
>   surrounding surface, not only the removed feature's own footprint.
> - A pure data/content correction, or removing something that was never real functionality, needs
>   none of this — say so in the PR description instead.

This is optional — skip it if the project has no notion of "features" that get removed and
re-added (e.g. a data pipeline, a script collection). **Ask the human** whether this applies before
including it.

---

## 4. PR title / commit message convention

Because squash merge makes the PR title the permanent commit message, agree on a convention before
the first PR lands, not after ten inconsistent ones exist. Two patterns that work well:

- **`<Heading> — matches the ledger entry exactly`**, if this repo pairs with a progress ledger
  (see companion doc). Whatever heading you write in the ledger for this unit of work, use verbatim
  as the PR title, so the ledger entry, the PR, and the landed commit are all searchable by the same
  string.
- **Conventional-commit-style** (`fix: ...`, `feat: ...`, `chore: ...`) if the project already uses
  that convention elsewhere (e.g. for changelog generation).

**Ask the human** which they want, or whether an existing convention in git history should be kept.

---

## 5. Setup checklist (what to actually do, in order)

**Everything through step 3 is read-only** (per §0.5) — investigation and discussion, no writes,
no `git init`/`gh repo create`, no `gh api` mutations, no commits. Step 4 is the gate itself. Only
step 5 onward touches repo state.

1. Read-only: is this a git repo with a GitHub remote? (`git remote -v`.) If neither exists, note
   that it's needed — don't create it yet.
2. **Run §0 in full** (explicit sources, implicit sources, ask the human, per-decision
   reconciliation) before proposing or writing anything. Do not skip straight to "check merge
   settings" below without first knowing whether an existing protocol file, a `.gitattributes`, or
   just observed history already answers it.
3. Using §0's findings, work out the concrete resolution for every row in §0.4's table, plus
   whether a protocol file exists to hold it (and if not, where a new one should live). This is
   still discussion, not implementation — don't write the file yet.
4. **Clear the §0.5 gate**: present the assembled plan (repo init if needed, merge settings, branch
   protection, protocol-file location and its resolved content) as concrete text and get an explicit
   "yes, do this" before touching anything.
5. Now implement, in this order: `git init`/`gh repo create` if it was needed; the merge-method and
   branch-protection settings; then the protocol file —
   - **If one already exists**: you should already have read it in full during §0.1. Edit it in
     place with the decisions from the approved plan; do not create a second, competing protocol
     file.
   - **If none exists**: create it (`CLAUDE.md` at repo root is a reasonable default if there's no
     existing convention), pasting in the rule text from §2–§4 with placeholders resolved to the
     approved plan's actual answers, not left generic.
6. If this repo also wants a resumable progress ledger, hand off to `PROGRESS_LOG_SETUP.md` next —
   its own §0/§0.5/§5 are written to run right after this one, share the same discovery-first
   discipline, and clear their own gate before writing anything (a single combined plan covering
   both docs, presented and approved together, is fine if you're setting both up in one sitting —
   just don't implement either until both have been discussed to the human's satisfaction).
7. Confirm attribution/co-authorship conventions for commits and PRs if the human's tooling has
   its own default trailer — don't assume this document's own default applies; ask.

---

## 6. What this spec deliberately leaves generic

This document is a template, not a filled-in policy — it has been stripped of any single project's
specifics (issue numbers, session-naming schemes, dated "reversed on X, adopting Y" history). When
you apply it to a real repo, the answers to every "Ask the human" above become that repo's actual
policy, and should be written down in its protocol file in concrete terms (a real branch prefix, a
real reviewer name or "self-merge OK" statement, a real list of files under the hard-stop rule) —
not left as placeholders.
