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
