# Agent & Contributor Guidelines

## Code style

Formatting is enforced via Prettier and linting via ESLint. Run both on any files you change before finishing:

```bash
pnpm exec prettier --write <file1> <file2> ...
pnpm exec eslint --fix --report-unused-disable-directives <file1> <file2> ...
```

A husky pre-commit hook runs lint-staged automatically on commit, which applies both Prettier and ESLint fixes. If you are not setting up husky then run the commands above manually instead.

## Aksel design system

The Aksel repo is available locally at `/Users/juliannymark/Repos/aksel`.

**Prefer the local repo over scraping aksel.nav.no.** The website is a rendered app — web fetching is lossy, truncated, and slow. The source is the ground truth.

Key paths:

- Component source + props: `@navikt/core/react/src/<component>/`
- CSS: `@navikt/core/css/src/`
- Design tokens: `@navikt/core/tokens/`

Use `rg` to search across components:

```bash
rg "variant" /Users/juliannymark/Repos/aksel/@navikt/core/react/src/button/Button.tsx
```

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
