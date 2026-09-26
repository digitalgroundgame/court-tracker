# Progress Log (Resumable Work Ledger) — Procedure Spec

**Audience:** an AI coding assistant being handed this document to set up — or reconcile with — a
resumable, dated work ledger for a project spanning multiple sessions and/or contributors.

**Companion doc:** [`GIT_SQUASH_MERGE_SETUP.md`](./GIT_SQUASH_MERGE_SETUP.md) — this ledger is
designed to pair with a branch → PR → squash-merge workflow. The two interlock at one point
specifically: whether a ledger entry rides in the same PR as the code it describes, or its own
follow-up PR (§4 below) — that's a live design choice, not a settled default, so don't assume one
over the other.

**[`SETUP_INIT_PROMPT.md`](./SETUP_INIT_PROMPT.md)** has a ready-to-paste kickoff message a human
can use to start this whole process in a real repo — if you were handed that prompt to get here,
you're already following it correctly.

**If you (the assistant) are reading this at the start of a setup task, do not silently impose this
structure.** This project may already have a progress-tracking mechanism — a `CHANGELOG.md`, a
`TODO.md`, an issue tracker used as the log, a Notion/Linear board, or nothing at all. Find out
what exists first (§0), then offer the choice explicitly, per element of the structure, not as one
blanket decision: adopt this spec as-is, adapt it to fit the existing mechanism, or adapt this
spec's structure onto the existing file. Don't assume a green-field project wants a new file when
an issue tracker already fills the same role, and don't assume an existing file's *current* content
is its *intended* structure — a log that has been running a while may have drifted from whatever
it originally documented about itself, exactly the way any other convention can. **See §0.5 for the
hard gate on when you're actually allowed to write anything** — discovery and discussion come
first, unconditionally.

---

## 0. Discovery first: find out what already exists before proposing anything

**Run this before §1.** The failure mode to avoid is proposing a brand-new ledger structure to a
project that already has a working one (just not shaped like this template), or — the subtler
version — trusting an existing ledger's *own written self-description* (its instance-protocol
block, its header) without checking whether recent entries actually still follow it.

**Explicit sources:**
- Any file already serving this role: `PROGRESS.md`, `CHANGELOG.md`, `TODO.md`, `NOTES.md`, a wiki
  page, a pinned issue used as a running log.
- An issue tracker or board (GitHub Projects, Linear, Jira) that may already be *the* mechanism —
  don't assume a markdown file is required just because this template uses one.
- Any protocol file (see companion doc) that references how the ledger should be written —
  bundled-vs-separate PRs, date discipline, phase structure — since that's a second explicit source
  independent of the ledger file itself.

**Implicit sources — mine actual history, don't trust the file's self-description alone:**
- `git log -- <ledger file>`: when was its own instance-protocol block (the part describing *how*
  to write entries) last changed, and does that match what recent entries actually look like? A
  ledger can accumulate real drift the same way any other convention can — e.g. a documented
  "two-zone" structure with a third undisciplined accumulation point that grew anyway, or a
  documented per-entry format that later entries stopped following without anyone updating the
  header.
- `gh pr view <N> --json files` on a handful of recent merged PRs: does the ledger file actually ride
  along with code changes, or land in its own PR? (See companion doc §0.2 on reading this
  correctly — a "separate PR" pattern doesn't necessarily mean the bundled convention was abandoned;
  check §4 below before concluding that.)
- Whether dated entries in the log actually match `git log --format=%ad` on the commits that
  introduced them — a project that's had date-drift once (see §3) may still be carrying it.

**Ask the human directly:**
- *"Is there an existing progress-tracking mechanism I should know about — even an informal one, or
  one that lives outside this repo (a board, a doc, a channel)?"*
- *"If there's a ledger file already, has anyone deliberately restructured it recently, or has it
  just accumulated organically? Is its own header still accurate?"*

**Reconcile per-element, not all-or-nothing** — see §5's table for the concrete list (filename,
phase structure, bundled-vs-separate, date discipline, merge-conflict mitigation). For each: keep
what exists, adopt this template's version, or merge the two — and show the human the resulting
diff before it lands, exactly as the companion doc requires for its own decisions.

### 0.5 Hard gate: no changes until the human has understood and approved the plan

**Discovery and discussion are read-only.** Nothing above authorizes creating or editing the ledger
file, writing `.gitattributes`, or committing anything, before that discussion is finished and
explicitly approved. This mirrors the companion doc's §0.5 exactly, and if you're setting up both
docs together, one combined plan/approval covering both is fine — just don't implement either
before both have been discussed.

- **Fine any time, without asking first**: reading any file, `git log`, `git log -- <ledger file>`,
  `gh pr view`, `gh api ...` `GET` calls.
- **Not fine until the gate clears**: creating or editing the ledger file, writing `.gitattributes`,
  `git commit`, `git push`, `gh pr create` — anything that changes repo state.
- Once §0.1–§0.4 are done, assemble the per-element table's resolved answers into one concrete plan
  — the actual filename, the actual phase list (or "no phases"), the actual bundled-vs-separate
  choice, stated for *this* project, not a re-explanation of the template.
- **Present that plan and stop.** Ask directly: *"Does this match your understanding, and do you
  approve implementing it as written?"* Don't treat a vague or partial reply as approval — the plan
  needs to be visible as text and the "yes" needs to be unambiguous.
- Only after that explicit approval do you write the ledger file, add the `.gitattributes` line, or
  make any commit.

---

## 1. What problem this solves

A project built across many sessions (an AI assistant with no persistent memory between sessions,
or a rotating set of human contributors) needs a single artifact that answers, cold: *where are we,
what's done, what's next, and what shouldn't be re-discovered from scratch.* Git history alone
answers "what changed" but not "why we're mid-phase-4" or "what the next session should pick up."

The ledger is that artifact. It is read at the start of every session, before doing anything else,
alongside whatever protocol file governs workflow (see companion doc).

---

## 2. File structure

A single file (`PROGRESS.md` is a fine default name — ask if the project prefers something else)
with exactly this shape:

```markdown
# PROGRESS.md — resumable work ledger

> **Instance protocol.** At session/work-unit start, read [protocol file] then this file. Find
> `CURRENT PHASE` and the first unchecked task. Restate them in one line, then work. Before
> stopping (or at a natural pause point), check off what you finished, add a dated Session Log
> entry, and leave the repo in a runnable state. Do not advance a phase until its definition of
> done is met. `[x]` done · `[~]` in progress · `[ ]` not started · `[!]` blocked (note why).

**CURRENT PHASE:** [one line: phase name + one-clause status]
**Last updated:** [YYYY-MM-DD — see §3 on getting this right]

## Resume briefing
<!-- Replaced wholesale at the end of each session/work unit — this is not an appended log, it's
a handoff note for whoever picks this up next. Narrative belongs in Session Log below. -->

[The immediate next task. Any standing/parked issues worth knowing about. Conventions or gotchas
established this session that aren't obvious from the code. Nothing here should require reading
old Session Log entries to understand — if something from before is still relevant, the previous
session's replacement of this section should have folded it forward.]

## Phase 0 — [name]  [status marker]
- [ ] [task]
- [ ] [task]

## Phase 1 — [name]
...

## Session log
[Permanent, append-only. Newest or oldest first — pick one and stay consistent. Each entry is a
CONDENSED dated paragraph or a few bullets — not a blow-by-blow. Write it condensed the first
time; don't plan to compress it later, because nobody will.]

### YYYY-MM-DD — [heading]
[What changed, what's next, any blockers. This is the same text that should appear in the PR
description for the unit of work it describes, per the companion git-workflow doc §4.]
```

**Two, and only two, places narrative goes** — the Resume Briefing and the Session Log — and they
serve different purposes. This is deliberate: without this split, projects tend to grow a third,
undisciplined accumulation point (usually the top of the file gets both a "latest status" edit and
a running log mixed together) that becomes an unbounded, unreadable blockquote buffer over many
sessions. If you're retrofitting this onto a project whose log has already grown that way, the fix
is a one-time pass: split the existing accumulated text into a condensed Session Log history plus a
fresh Resume Briefing, then enforce the two-zone discipline going forward.

- **Resume Briefing**: replace wholesale, every time. Never append to it. If something in the old
  briefing is still relevant, the new one restates it — it doesn't survive by being left in place.
- **Session Log**: append-only, permanent, condensed on first write.

**Ask the human:** *Do you want phase checklists (a fixed roadmap with definitions-of-done), or is
this project's work better tracked as a flat backlog / issue-by-issue with no phases?* Not every
project has discrete phases — a maintenance-mode project might just want Resume Briefing + Session
Log with no phase structure at all. Don't force phases onto a project that doesn't have them.

---

## 3. Date discipline

**Verify the actual current date before writing any dated entry.** Check a system clock / date
source available in the session, or run `date +%Y-%m-%d` — do this immediately before writing a
date into the ledger (session-log headers, the "Last updated" line), not from memory or inference.

**Never infer today's date from:**
- the date on the last logged entry (assumes no time gap, which is exactly the failure mode of a
  multi-session project),
- a session/letter/number sequence,
- how many turns the current conversation has had.

These all compound the same drift: one session estimates "today" instead of checking it, and every
session after copies the drift forward silently, because each one trusts the previous entry instead
of an authoritative source. This is a real, recurring failure mode across projects that use this
pattern — not a hypothetical.

If a logged date ever looks suspicious (out of order, oddly far from neighboring entries),
cross-check it against actual commit timestamps (`git log --format=%ad`) before trusting or
"correcting" it further — those are ground truth; the ledger's own prose is not.

---

## 4. Ledger entry vs. PR: bundled or separate

Two conventions, both workable — **pick one explicitly and write the choice down**, don't leave it
ambiguous:

**Option A — bundled.** The ledger entry for a unit of work is committed in the same branch/PR as
the code it describes. One PR per unit of work, total.
- Pro: one PR to review, ledger and code can't drift apart.
- Con: if the ledger's "top of file" (Resume Briefing, or the top of Session Log depending on
  ordering) is a shared insertion point, two branches open concurrently will both try to edit the
  same lines and collide on merge. Mitigate with a merge-strategy driver (see below) rather than
  banning concurrent branches.

**Option B — separate.** The code PR merges first; a small follow-up PR (just the ledger edit) is
cut immediately after, referencing the merged PR.
- Pro: code PR diffs stay focused on the actual change; the ledger-update PR is trivially reviewable
  (or self-mergeable) on its own.
- Con: one extra PR per unit of work; a brief window where `main` has the code but not yet the
  matching ledger entry.

Either way, **mitigate the shared-insertion-point collision** with a git merge driver so concurrent
edits at the same spot don't block on conflict markers:

```gitattributes
# .gitattributes
PROGRESS.md merge=union
```

```bash
# One-time repo config (or set via git config --global if every clone needs it):
git config merge.union.driver true
```

(`merge=union` with the built-in `union` driver keeps both sides' inserted lines instead of
conflicting — a same-spot collision auto-resolves by keeping both, and chronological ordering
between the two entries may need a quick manual nudge afterward, but the merge itself won't get
stuck.)

**Ask the human:** *Bundled or separate PRs for the ledger entry?* If they're unsure, bundled is
simpler for a solo or low-concurrency project; separate is worth it once multiple sessions/PRs are
routinely open against `main` at the same time, since it keeps the "who's touching the shared file"
surface smaller per PR.

**If the project picks bundled *and* uses case-by-case/deferred merge authority (companion doc
§2)**, expect a corollary: a small ledger-only follow-up PR after the code PR actually merges is
normal, not a sign the bundled choice was abandoned. A bundled entry is written *before* the
squash-merge happens, so it can't yet state that commit's own resulting SHA, and it may describe
the PR as "open, awaiting review" if a human hasn't merged it yet — sometimes in a session later
than the one that wrote the code. Once merge actually happens, a tiny follow-up PR that only
updates the ledger's status/SHA is expected and normally self-mergeable. **Write this down in the
protocol file once it's happened even once or twice**, so a later session (or a human skimming
history) doesn't misread the pattern as quietly reverting to "separate" — this exact confusion is
why this spec calls it out explicitly rather than leaving it to be rediscovered.

---

## 5. Setup checklist (what to actually do, in order)

**Steps 1–2 are read-only** (per §0.5) — discovery and discussion, no file writes or commits. Step
3 is the gate. Only step 4 onward touches repo state.

1. **Run §0 in full** first — explicit sources, implicit sources (including checking whether the
   ledger's own self-description still matches recent entries), and asking the human. Do not treat
   this step as a formality to rush past; a stale self-description is the single most common way
   this kind of file drifts without anyone noticing.
2. **Work out the resolution for each element**, using §0's findings — not a single "keep vs.
   replace" choice:

   | Element | Ask |
   |---|---|
   | Filename / location | Keep whatever file already serves this role, or use this template's default (`PROGRESS.md`)? |
   | Resume Briefing / Session Log split | Adopt the two-zone structure, or keep however narrative is currently organized (and if it's drifted into a single undisciplined buffer, offer the one-time retroactive split described in §2)? |
   | Phase checklists | Adopt phase/definition-of-done structure, or keep a flat backlog — does this project even have discrete phases? |
   | Bundled vs. separate ledger PR | Which convention does history actually show (§0.2), and does the project's merge-authority policy create the follow-up-PR corollary above — should that be written down explicitly if it isn't already? |
   | Date-verification discipline | Adopt the verify-before-write rule (§3), or does an equivalent already exist? |
   | Merge-conflict mitigation | Add the `.gitattributes` union driver, or is there already an equivalent mitigation for concurrent edits to this file? |

   If a genuine mismatch turns up between the file's own header and how recent entries actually
   read, treat it the same way the companion doc treats a git-workflow discrepancy: present the
   specific entries that show the drift, say which you think is current, and ask rather than
   picking silently. This is still discussion — don't write anything yet.
3. **Clear the §0.5 gate**: present the assembled plan (filename, structure, phases-or-not,
   bundled-vs-separate, date discipline, merge-conflict mitigation, and — if migrating from an
   existing mechanism — what happens to its old content: archived, deleted, or left in place) as
   concrete text, and get an explicit "yes, do this" before writing anything.
4. Now implement: write (or update) the skeleton from §2, with `CURRENT PHASE` and the first
   phase's checklist filled in from whatever the human described as the project's actual starting
   point — don't invent phases, and don't invent a "Phase 0" for work that already happened without
   having confirmed what it actually was during discussion.
5. Add the `.gitattributes` union-merge line (§4) for the ledger file if it doesn't already exist,
   matching the approved bundled-vs-separate choice.
6. Get today's date the verified way (§3) for the initial `Last updated` line and first Session Log
   entry — do not hand-write a plausible-looking date.
7. If the companion git-workflow doc is also being set up in this session, make sure its protocol
   file (§5 of that doc) references this ledger by its actual filename, and that this ledger's
   instance-protocol block references that protocol file by its actual filename — they should
   name each other correctly, not with placeholder text left in from either template.

---

## 6. What this spec deliberately leaves generic

Like its companion, this is a template with the project-specific history stripped out (no real
phase names, no real dated "session X changed the rule" trail). When applied to a real project,
the phase list, the bundled-vs-separate choice, and the filename should all become concrete
decisions written into the actual ledger — not left as placeholders for the next session to
puzzle over.
