# Future features — design capture

Decisions and context from feedback session 2026-09-04. Not scheduled work; captured so future implementation doesn't re-litigate settled questions.

## 1. Edit dashboard graph in grafbygger (LLM SQL → form backfill)

**Goal:** "Rediger" a dashboard graph should open `/grafbygger_next` with the form pre-filled from the graph's stored SQL.

**Decided:**

- SQL stays the atomic storage format — graphs live outside Innblikk too (Metabase, BQ console). Never migrate old SQL; forward-only.
- An LLM backfills the grafbygger form from a SQL blob. Progressive-disclosure form makes static mapping brittle; LLM "guess + leave unknown fields empty" always works and never needs migration code when the form changes.
- Old grafbygger versions' SQL is expected to mostly parse; genuine incompatibilities are fine — user sees partial fill, fixes manually.
- **No special SQL convention added today.** Considered a `-- innblikk:grafbygger v1` header marker; decided unnecessary — if SQL is machine-readable it's LLM-readable. Revisit only if real-world backfill quality suffers.
- Dashboard "rediger"-link flow (`?websiteId&config&filters=...` URL params) must **override** any persisted localStorage state when implemented (URL wins, and replaces storage).

**Open questions (future):**

- Which LLM, where it runs, latency budget.
- Partial-fill UX: how do we show "these fields were guessed, check them"?
- Round-trip fidelity: does form → SQL → LLM → form preserve intent?

## 2. Brukergrupper everywhere

Brukergroup support is grafbygger-only today (`COHORTS_ENABLED`). Plan: roll out to other features (eventexplorer, funnel, retention, …) once grafbygger proves the UX. The autocomplete/autosuggest infra built for the cohort editor (see CHANGELOG/ADR when implemented) should be designed as a shared hook + API endpoint from day one so other features reuse it.
