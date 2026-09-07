---
name: Schema change request
about: Ask for a field, file, or shape change in the published data package
title: "[schema] "
labels: schema
---

<!--
Read docs/DATA_CONTRACT.md first — especially §6 (this process) and §7 (what is already
published). Additive requests are cheap and granted by default where the value is already
collected; this template exists to route the request, not to gate it.
-->

## What you need

**File and field**: <!-- e.g. judges_search.json, need `commission_date` -->

**Shape**: <!-- type, nullability, and for an enum, the values you expect -->

## What you're building with it

<!-- What the reader sees. This is the part that decides whether a narrower or wider field is the
right answer — e.g. "a sort by seniority in the search results" tells us more than "a date". -->

## Where the value lives today

- [ ] It is already in a published file, just not this one
- [ ] It is in a source CSV (`data/*.csv`) but not derived into any published file
- [ ] It is not collected anywhere yet
- [ ] Not sure

<!-- If it's not collected: this becomes a data-collection question (docs/DATA_SOURCES.md), which
is a bigger ask than a schema one — every value has to be sourced (CLAUDE.md §2). Say what source
you believe has it, if you know one. -->

## What you'd do without it

<!-- Recompute it client-side? Pull another file? Drop the feature? A workable fallback isn't a
reason to say no — it tells us how to sequence this. -->

## Consumer details

**Who is consuming**: <!-- project / team -->

**Currently pinned to**: <!-- schema_version and, if relevant, the data-v<version> release tag -->

**Would a MINOR (additive) bump reach you automatically?** <!-- i.e. does your sync pull new
releases unattended, or is upgrading a manual step on your side? -->
