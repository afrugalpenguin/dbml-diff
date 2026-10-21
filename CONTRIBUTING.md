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
`parse.js` (DBML > model) > `diff.js` (compare) > `emit.js` (render). Most
features follow that grain - extend the model, teach the diff, render it.

## The workflow

1. **Start from an issue** (create one if needed; label it `bug`,
   `enhancement`, `documentation`, or `question`).
2. **Branch off `main`** with a `feature/`, `fix/`, or `chore/` prefix.
3. **Add a test** where it makes sense.
4. **Open a PR** with `Closes #N` so the issue auto-closes on merge.

`main` is protected: the test suite must pass on Node 18 and 20. Thats it - for now.

## Commit messages

Please use [Conventional Commits](https://www.conventionalcommits.org/), enforced by
a git hook: `type(scope): description`.

- **Type**: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `build`, `ci`,
  `perf`, `style`.
- **Scope required**: no empty parens. First line **≤ 72 chars**.

```
feat(emit): add mermaid erDiagram output format
```

Changing emitter output on purpose? Run `npx jest -u` and eyeball the snapshot
diff before committing. Make sure it makes sense!

## Types

`npm test` runs Jest and then `tsc -p tsconfig.types.json`, which checks the
hand-written declarations in `lib/index.d.ts` against the committed `emitJson`
output in `typecheck/*.json`. A Jest test fails if those JSON files no longer
match the live output.

- Changed the `diff()` output on purpose? Run `npm run types:fixtures` to
  regenerate `typecheck/*.json`, then run `npm test`. If tsc now fails, update
  `lib/index.d.ts` (and the JSDoc typedefs in `diff.js` / `parse.js`) to match.
- Added a new variant to the result? Extend the `types-a.dbml` / `types-b.dbml`
  fixture pair so its diff produces it, and the type check sees it.

Thanks for looking.
