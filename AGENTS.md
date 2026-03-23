# Agent & Contributor Guidelines

## Code style

Formatting is enforced via Prettier and linting via ESLint. Run both on any files you change before finishing:

```bash
pnpm exec prettier --write <file1> <file2> ...
pnpm exec eslint --fix --report-unused-disable-directives <file1> <file2> ...
```

A husky pre-commit hook runs lint-staged automatically on commit, which applies both Prettier and ESLint fixes. If you are not setting up husky then run the commands above manually instead.
