# Setup Initialization Prompt

**What this is:** a ready-to-use kickoff message for a human to hand an AI coding assistant, to
start ingesting [`GIT_SQUASH_MERGE_SETUP.md`](./GIT_SQUASH_MERGE_SETUP.md) and
[`PROGRESS_LOG_SETUP.md`](./PROGRESS_LOG_SETUP.md) and running their setup process in a real repo.

**How to use it:**
1. Put copies of `GIT_SQUASH_MERGE_SETUP.md` and `PROGRESS_LOG_SETUP.md` somewhere the assistant
   can read them in the target repo (repo root, a `docs/` folder, or wherever you keep this kind of
   reference — the prompt below doesn't assume a specific path, and the assistant will ask if it
   can't find them).
2. Copy the prompt block below into your first message to the assistant in that repo.
   - **If the project already has its own onboarding/kickoff prompt** (an `INITIAL_PROMPT.md`, a
     first-message template, a section of `README.md` that new contributors or sessions are told
     to read first): paste this block *after* that existing content, in the same message, or send
     it as a follow-up once the assistant has read the existing one. Don't replace the existing
     kickoff prompt with this — they compose. The two specs are explicitly written to reconcile
     with whatever already exists (§0 of each), not to assume a blank slate.
   - **If the project has no existing kickoff prompt at all**: use the block below on its own as
     the first message.
3. The assistant will start with read-only discovery and is instructed not to change anything until
   it has shown you a concrete plan and you've explicitly approved it — expect a discussion before
   any file gets written, and treat that as working as intended, not as stalling.

---

## The prompt

```
Read GIT_SQUASH_MERGE_SETUP.md and PROGRESS_LOG_SETUP.md in full before doing anything else. (If
you can't find them, ask me where they are rather than guessing or skipping them.) These are
procedure specs for setting up, in this repository: a branch -> PR -> squash-merge git workflow,
and a resumable progress-log ledger. Both docs are templates meant to be reconciled with whatever
this repo already does, not applied blindly.

Follow their own internal process for how to run this setup:

1. Run each doc's discovery section in full before proposing anything: check for existing explicit
   conventions (a protocol file, actual GitHub repo/merge/branch-protection settings, .gitattributes,
   issue/PR templates, an existing progress-tracking mechanism of any kind) and existing implicit
   conventions (what recent git/PR history actually shows people or prior sessions doing, whether it
   matches what's written down anywhere). Ask me directly about anything neither source settles.

2. Do not create, edit, or commit any file, and do not run any state-changing git or gh command
   (this includes gh api calls that change settings, git commit, git push, gh pr create, git init,
   gh repo create), until you have presented a concrete, written plan covering every decision point
   in both docs, and I have explicitly confirmed that I understand it and approve it. Read-only
   investigation (reading files, git log, gh pr view, gh api GET calls) is fine at any point before
   that -- nothing else is.

3. If this repo already has an existing convention -- written down, or just visible in how things
   have actually been done -- that conflicts with either doc, tell me plainly rather than picking
   silently. Let me decide, per decision point (not as one blanket choice), whether to keep the
   existing convention, adopt the doc's version, or merge the two.

4. If this repo already has its own onboarding/kickoff prompt or protocol file (an INITIAL_PROMPT.md,
   AGENTS.md, CLAUDE.md, CONTRIBUTING.md, or similar), read it as part of discovery. This setup is
   meant to reconcile with it and fold into it where sensible, not replace it wholesale or create a
   second, competing source of truth.

5. Once I've approved the plan, implement it, then tell me plainly what changed and where.

Start with discovery now, and don't skip ahead to writing anything.
```
