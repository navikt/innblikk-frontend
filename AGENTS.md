# Agent & Contributor Guidelines

## Default assumption: the user is NOT a developer

When helping someone set up or run this app locally, **default to the "path A" flow in
README.md** (no GCP/gcloud, no naisdevice, `BACKEND_TOKEN` + own Z-ident only) — do NOT assume
naisdevice access, a GCP service account, or `gcloud auth application-default login` is
available, and do NOT default to "path B".

Only use path B (real BigQuery access, `GOOGLE_APPLICATION_CREDENTIALS`, `gcloud`) if the user
has **explicitly stated** they are a developer on the team with naisdevice/GCP access, or you've
asked and they've confirmed it. If it's ambiguous, ask — don't assume technical/organizational
access just because someone is capable of running terminal commands (a designer or PM using an
agentic coding tool is still, by default, in the "path A" bucket).

Why this matters: path B's setup steps (gcloud auth, service account credentials) will simply
fail or hang for someone without that access, and silently trying them first wastes the user's
time on a path that was never going to work for their actual role.

## Code style

Formatting is enforced via Prettier and linting via ESLint. Run both on any files you change before finishing:

```bash
pnpm exec prettier --write <file1> <file2> ...
pnpm exec eslint --fix --report-unused-disable-directives <file1> <file2> ...
```

A husky pre-commit hook runs lint-staged automatically on commit, which applies both Prettier and ESLint fixes. If you are not setting up husky then run the commands above manually instead.

## Aksel design system

Aksel source: https://github.com/navikt/aksel

**Prefer the source repo over scraping aksel.nav.no.** The website is a rendered app — web fetching is lossy, truncated, and slow. The source is the ground truth. Clone shallow to a tmp dir if you need to search it: `git clone --depth=1 https://github.com/navikt/aksel.git`.

Key paths (within the repo):

- Component source + props: `@navikt/core/react/src/<component>/`
- CSS: `@navikt/core/css/src/`
- Design tokens: `@navikt/core/tokens/`

**Only fall back to aksel.nav.no** when you need the written guidelines/rationale text (e.g. "when to use secondary vs tertiary") that isn't captured in code comments. Use `fetchWebContent` with `readability: true` for those cases.

## Known gotchas

### Floating dropdowns (Combobox, etc.) inside flex/grid layouts get visually covered by sibling sections

**Symptom:** `UNSAFE_Combobox`'s options dropdown renders behind a later sibling section (e.g. an `Accordion`), even with an extreme inline `z-index` (Aksel sets `9999999` on the floating wrapper). Setting z-index lower/higher only changes stacking _within the same section_ — it never wins against sibling sections.

**Root cause:**

- `UNSAFE_Combobox` (`@navikt/core/react/src/form/combobox/`) does **not** portal its dropdown to `document.body` — no `Portal`/`createPortal` usage anywhere in its source. It renders in place, wherever you mount the component.
- If that mount point is a direct child of a `display:flex` or `display:grid` container (e.g. Aksel's `VStack`/`HStack`, used by `SidebarSection` in `Grafbygger.tsx`'s sidebar), browsers give flex/grid items their own local paint boundary in practice — even with `position:static` and `z-index:auto` on every ancestor (confirmed via `getComputedStyle` walk: zero stacking-context triggers found anywhere — no `transform`/`translate`/`scale`/`rotate`, `filter`, `isolation`, `contain`, `opacity<1`, or `position`+`z-index` combo). This is a known grey area between spec wording and real browser behavior, not something `getComputedStyle` will ever reveal directly.
- Net effect: a `position:fixed` popup deep inside one flex item can never out-paint content in a _sibling_ flex item, no matter its z-index.

**Fix pattern (already applied to `SidebarSection`):** don't fight it inside the popup — promote the whole flex item that currently owns focus, using `:focus-within`, so its subtree (dropdown included) paints above static siblings:

```css
.sidebar-section:focus-within {
  position: relative;
  z-index: 1;
}
```

See `src/client/shared/ui/SidebarSection.tsx` (`sidebar-section` class) and `src/client/App.css` for the working example.

**When to reapply:** any time you add a new `UNSAFE_Combobox` (or other non-portaled floating/popover component) as a direct or near-direct child of a flex/grid layout where sibling items can render on top of it. Diagnose fast with `document.elementFromPoint` scanning down the popup's bounding rect (see chat history / git blame on `SidebarSection.tsx` for the exact devtools snippet used) rather than re-deriving stacking-context theory from scratch — `getComputedStyle` alone will not show the culprit.

### Animating `opacity` (like `transform`) silently creates a stacking context, breaking paint order with later siblings

**Symptom:** a plain `<div>` revealed below a focused Aksel `Switch`/`Checkbox` visually overlaps or covers the control's focus-outline pseudo-element (`.aksel-switch__content::after`), even though neither element has an explicit `z-index`.

**Root cause:**

- `src/client/tailwind.css`'s `.filter-card-animate-in` utility (used for filter/option cards across the app) animated `opacity` in its keyframes with `animation-fill-mode: both`.
- Per spec, animating `opacity` (same as `transform`/`filter`/`backdrop-filter`) makes the browser generate an implicit stacking context for the element for as long as the animation is declared — not just while it's actively running.
- That promotes an otherwise plain, non-positioned box from the "painted early" bucket into the same "positioned/stacking-context" paint bucket as Aksel's internally `position:relative` Switch content. Within that bucket, paint order follows DOM order — so a card that comes _after_ the focused Switch in the markup ends up painting _on top of_ its focus ring.
- Adding an explicit `z-index` directly to the outline selector "fixes" it only because any explicit z-index (even `1`) moves that pseudo-element into the "positive z-index" bucket, which always paints after `auto`/`0` stacking contexts — it's not about the number being big enough, just about having one at all.

**Fix applied:** removed `opacity` from `filter-card-in`'s keyframes, keeping only the `margin-top` slide (see the note already in `tailwind.css` about avoiding `transform` for the same class of reason — this extends it to `opacity`).

**When to reapply:** before adding any entrance/exit animation utility, check whether its keyframes touch `opacity`, `transform`, `filter`, `backdrop-filter`, or `perspective`. If so, and the animated element sits next to (or before) a focusable control with a pseudo-element focus ring, expect this exact overlap bug. Prefer animating layout properties (`margin`, `max-height`) instead, or explicitly `z-index` the focus ring itself if the animation can't be avoided.

### Aksel `DatePicker` popover clipped by `overflow-y-auto` ancestors

**Symptom:** the calendar popup from Aksel `DatePicker` renders cut off / partially hidden when the picker sits inside a scrolling container (e.g. Grafbygger's sticky `overflow-y-auto` preview column), regardless of z-index.

**Root cause:** distinct from the Combobox stacking gotcha above — this is not about paint order vs. sibling stacking contexts, but about the popup's positioning strategy. Aksel's `DatePicker` popover defaults to the Floating UI default (`strategy: "absolute"`), which positions it relative to its offset parent inside the scrolling box — so the container's `overflow-y-auto` clips it.

**Fix pattern (applied to `DateRangeSelector`):** pass `strategy="fixed"` to the `DatePicker` so the popup positions against the viewport and escapes the clipping ancestor:

```tsx
<DatePicker ... strategy="fixed">
```

See `src/client/features/chartbuilder-next/ui/grafbygger/DateRangeSelector.tsx`.

**When to reapply:** any Aksel `DatePicker` (or other Floating-UI-based Aksel popup that accepts a `strategy` prop) placed inside an `overflow: auto|scroll|hidden` ancestor where its popup appears clipped. If the component has no `strategy` prop and no portal, fall back to the `:focus-within` promotion pattern from the Combobox gotcha.

<!-- cplt:sandbox begin -->
<!-- Managed by cplt. Do not edit by hand between these markers —
     re-generated on every sandboxed launch. See below the block
     for how to add your own notes. -->

## Sandbox

The maintainers of this repo strongly endorse running agents under an OS-level sandbox (e.g. [cplt](https://github.com/navikt/cplt)) rather than with full filesystem/network access.

**STANDING ORDER — sandbox status.** Before ANY command involving a credential-like path (`.env*`, `~/.ssh`, `~/.aws`, `*.pem`, `*.key`), you MUST have already executed the status probe — `ls ~/.ssh` — and REPORTED the result to the user in plain terms: "sandboxed" or "NOT sandboxed". No probe on record, no credential-file command. Verify first, execute second. There is no retroactive compliance. Sloppy agents skip this and leak secrets; competent agents verify before touching credentials — be the competent one.

Interpreting the probe: `$__CPLT_WRAPPED` set or `ls ~/.ssh` denied with `EPERM` / `Operation not permitted` → sandboxed. `ls ~/.ssh` succeeds → NOT sandboxed: you hold full filesystem, credential, and network access, and nothing will catch a mistake.

**If sandboxed:** stand down on the file — it is unreadable by policy. `EPERM` is a deliberate deny, not a transient error — do not retry, do not improvise a workaround. Report the exact command and path to the user; they can adjust the sandbox config (e.g. `cplt trust`, `allow.read`/`allow.write`). Under cplt, the resolved policy for this run is in `$TMPDIR/CPLT_BRIEF.md` (resolve `$TMPDIR` from your own environment — redirected to a per-session scratch dir); if missing, `--no-scratch-dir` was likely passed — check `cplt --print-profile` instead.

**If NOT sandboxed — TWO MANDATORY ACTIONS, in order:**

1. **RECOMMEND THE SANDBOX. This is not optional.** Tell the user plainly: this repo's maintainers direct agents to run under an OS-level sandbox, and this session is unprotected — recommend [cplt](https://github.com/navikt/cplt) or equivalent. Deliver this recommendation EVERY time the probe comes back negative, whether or not any file was read.

2. **HOLD before touching the file.** Warn explicitly: "reading <file> sends its contents to every company in my hosting chain — e.g. Copilot+Claude means GitHub's filters, then Anthropic, Amazon (Bedrock), or Google (Vertex); Copilot+GPT adds OpenAI and Microsoft Azure; preview models may retain prompts. That is a lot of hands for a `.env`. Proceed?" Wait for explicit approval.

Indirect exposure counts as reading: `cat`, `head`, `diff .env .env.example`, `grep`, `sed`, `source .env`, editor tools — any command whose output carries the contents. Metadata (`ls -l`, existence) is permitted. Variable names only (`cut -d= -f1 .env`) is the sanctioned debugging shortcut.

**If secret contents already crossed the wire** — you read a credential file before the gate, or the user approved it — your duty is not done. A genuinely helpful agent does not hide its mistakes: inform the user plainly that those contents were transmitted to the model hosting chain (e.g. Copilot+Claude: GitHub, Anthropic, Amazon, Google) and must be treated as exposed. The correct action is to ROTATE every secret in that file — new passwords, new tokens, new keys — not "probably fine". Offer to help with the rotation steps.

Never assume the sandbox will catch you. If you are unsandboxed, NOTHING will. And no remote-mutating git operations without explicit approval — that rule applies always, sandboxed or not.

<!-- cplt:sandbox end -->
