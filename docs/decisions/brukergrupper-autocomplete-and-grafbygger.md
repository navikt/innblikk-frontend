# Brukergrupper filter-autocomplete + grafbygger staleness — decisions (2026-09-04)

Locked answers from grilling session. Implementation order: endpoint → cohort editor comboboxes → grafbygger focus-refetch.

## 1. `column-values` endpoint

- `GET /api/bigquery/websites/:id/column-values?column=X[&key=Y]`
- Backend **allowlist**: `url_path, referrer_domain, browser, os, device, country, event_name, event_data_key, event_data_value`. `event_data_value` scoped by `key` (event-data key). `url_path` gets higher LIMIT + optional `q=contains` param.
- **Cost policy lives server-side, client never sees it**: BigQuery dry-run bytes estimate first (free), $ = bytes/TiB × $6.25. Ladder: try **30d → 14d → 7d**, first step under **$1** executes. If even 7d exceeds → error response.
- Response: `{ values: string[], scannedDays: number }`.
- Client on total failure: **degrade to free-text input + inline error note** («Kunne ikke hente forslag — du kan fortsatt skrive verdien manuelt»). Never block the user.
- When `scannedDays` < 30, caption under combobox: «Forslag fra siste N dager» — explains why a known value may be missing.

## 2. Cohort editor (react-querybuilder) comboboxes

- All value inputs → Aksel `UNSAFE_Combobox`, single-select + autocomplete + `allowNewValues` (free text always allowed — case-sensitivity stays the user's escape hatch).
- Fetch fires **on field-pick** (not on focus), cached per `(websiteId, column)` for the session.
- Same value-editor component reused inside **sequence steps** (`StepConditionsEditor`).
- `IN_SET`/`NOT_IN_SET` operators → multi-select combobox.
- Suggestions shown for ALL operators (incl. `inneholder`) — harmless hints.

### «Detalj om hendelsen» — replaces three confusing fields

Drop `event_data_key` («Hendelsesdata — nøkkel»), `event_data_value` («Hendelsesdata — verdi») and `__param__` («Egendefinert hendelsesparameter») from the field picker. Replace with ONE field:

- Label: **«Detalj om hendelsen»**. Help text: «Noen hendelser har ekstra informasjon, f.eks. hvilken knapp som ble trykket.»
- Renders two comboboxes: **«Detalj»** (key, from `column=event_data_key`) and **«Verdi»** (from `column=event_data_value&key=X`, key-scoped only — do NOT scope by event_name).
- «Verdi» disabled with placeholder «Velg en detalj først» until key chosen (conditional cascade — accepted UX).
- Toggle: «Sjekk bare at detaljen finnes» → key-only EXISTS (keeps the legitimate "events that have any value for skjemaId" case).
- **No legacy/migration support** — feature not live, old cohort data can be wiped or left to break gracefully (users archive/delete).

### Country display

Stored value is ISO alpha-2 (`NO`, `SE`) from dbip GeoIP (see reops-event-pipeline skill / `GeoIpService.kt`). Combobox label: **flag emoji + localized name + code** — e.g. «🇳🇴 Norge (NO)» — name via `Intl.DisplayNames('nb-NO', { type: 'region' })` (no hardcoded list). Never emoji alone. Browser/OS/device values shown as-is.

## 3. Grafbygger cross-tab cohort staleness

On window focus: re-run `fetchCohortsDeep(selectedCohortIds)`; if the resolved tree changed → silently regenerate SQL + inline note in the Brukergrupper sidebar section («Oppdatert — en brukergruppe ble endret i en annen fane»). No manual refresh button (CohortPicker already refetches the list on focus; this extends it to the resolved criteria used by SQL gen).

## Deferred / notes

- `docs/future-features.md` — LLM SQL→form backfill for editing dashboard graphs (no SQL marker convention needed) + brukergrupper rollout to other features.
- Nettside picker got placeholder only; proper redesign later (acknowledged a11y tradeoff).
- AGENTS.md known-gotchas: consider adding DatePicker-inside-overflow-container variant (fix: `strategy="fixed"`) — distinct from the existing Combobox stacking gotcha.
