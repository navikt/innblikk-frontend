# Agent & Contributor Guidelines

## Code style

Linting is enforced via ESLint. Run it on any files you change before finishing:

```bash
pnpm exec eslint --fix --report-unused-disable-directives <file1> <file2> ...
```

A husky pre-commit hook runs lint-staged automatically on commit. If you are not setting up husky then run the lint command manually instead.
