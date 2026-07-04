# Contributing to dbml-diff

Thanks for stopping by! `dbml-diff` is a small, focused tool - a structural diff
for DBML schema files - lets keep it that way! Small fixes? Just send a PR.
Something bigger? Open an issue first so we can talk it through.

## Getting set up

You'll need **Node 18+**:

```bash
npm ci && npm test
```

If the tests pass, you're good. The code is tiny and reads in one sitting:
`parse.js` (DBML → model) → `diff.js` (compare) → `emit.js` (render). Most
features follow that grain — extend the model, teach the diff, render it.

## The workflow

1. **Start from an issue** (create one if needed; label it `bug`,
   `enhancement`, `documentation`, or `question`).
2. **Branch off `main`** with a `feature/`, `fix/`, or `chore/` prefix.
3. **Add a test** where it makes sense — snapshots included.
4. **Open a PR** with `Closes #N` so the issue auto-closes on merge.

`main` is protected: the test suite must pass on Node 18 and 20. Thats it - for now.

## Commit messages

Please use [Conventional Commits](https://www.conventionalcommits.org/), enforced by
a git hook: `type(scope): description`.

- **Type**: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `build`, `ci`,
  `perf`, `style`.
- **Scope required** — no empty parens. First line **≤ 72 chars**.

```
feat(emit): add mermaid erDiagram output format
```

Changing emitter output on purpose? Run `npx jest -u` and eyeball the snapshot
diff before committing — that diff *is* the review.

Thanks for looking.
