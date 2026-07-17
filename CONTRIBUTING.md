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

## What CI does and does not check

`--format dbml` output is parsed straight back through `@dbml/core` in the tests, which proves dbdiagram.io will accept it. There is no equivalent check for `--format mermaid`: CI never feeds the output to Mermaid itself.

That is deliberate. Doing it means taking `mermaid` as a devDependency, which drags in d3, cytoscape and friends - a heavy tree for a project with one runtime dependency and one devDependency. And it would prove less than it looks: GitHub and Azure DevOps each pin their own Mermaid version, so a green check against ours is evidence their renderers agree, not a guarantee.

Instead the grammar rules the emitter depends on are asserted directly, in the `emitMermaid grammar invariants` block in `__tests__/emit.test.js`. Those rules were measured against mermaid 11.16.0: entity names must be quoted and cannot contain `"`; attribute types and names must be a single bare token starting with a letter; comments cannot contain `"`; and a bare `%%` line is not a comment (Mermaid's stripper matches `%%[^\n]+`, so an empty one reaches the grammar and fails the whole diagram).

If you touch the Mermaid emitter, the honest check is still to paste the output into a real renderer and look at it. The invariants catch a regression against the rules we know; they cannot catch a rule we never learned.

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

Thanks for looking.
