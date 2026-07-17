# Stability

`dbml-diff` follows [Semantic Versioning](https://semver.org/). From `1.0.0` onward, the surface below is the public API: a breaking change to any of it only lands in a new major version.

## Covered by semver (breaking changes bump the major)

- The CLI flags and their meaning: `--format <text|json|dbml|mermaid>`, `--migrate`, `--include-notes`, `--hide-unchanged-pk`, `--full-new-tables`, `--colors`, `-o/--output`, `--version`, `-h/--help`.
- The two CLI guards: `--migrate` cannot be combined with `--format` (exit `2`), and a flag that the chosen format ignores is dropped with a warning rather than a failure. `--full-new-tables` / `--hide-unchanged-pk` apply to the visual formats (`--format dbml` and `--format mermaid`); `--colors` applies to `--format dbml` only.
- The [exit codes](cli.md#exit-codes): `0` identical, `1` differences found, `2` error.
- The stdout/stderr split: diff or migration output goes to stdout (or the `-o` file); the counts summary and warnings go to stderr.
- That destructive (`DROP`) and heuristic (`RENAME`) statements in `--migrate` output are emitted commented out, so a straight run of that output is non-destructive.
- The programmatic API: the exported `diff()` return shape documented in [api.md](api.md), and the signatures of `emitText()`, `emitJson()`, `emitDbml()`, `emitMermaid()`, and `emitMigration()`.

## Not covered (may change in a minor or patch)

- The exact wording and layout of `--format text` output. It is meant to be read by a human, not parsed; scripts should use `--format json`.
- The exact wording of the stderr counts summary. A summary is always printed to stderr, but its text is for humans; scripts should key off the exit code and `--format json`.
- The human-readable phrases in `columnsChanged[].changes` (for example `type int -> bigint`, `became PK`). The array is part of the return shape, but the exact wording may change in a minor; consumers should key off the structured fields, not the phrases.
- The layout of the annotated `--format dbml` document: table stubbing, the `DIFF SUMMARY` table, column annotations, and note text. These render a diagram and are tuned for readability, not for machine consumption.
- The layout of the `--format mermaid` block, on the same grounds, plus the identifier sanitising it applies to satisfy Mermaid's grammar. Mermaid's own syntax is defined by Mermaid, and the renderers we target ship their own versions of it, so this output tracks them rather than freezing.
- The generated `--migrate` T-SQL: statement ordering, comments, and synthesized constraint names. `--migrate` is T-SQL-only and its output is a starting point for review, not a frozen contract.
- Any behavior reached only through an undocumented export or internal module.

`@dbml/core` is the runtime dependency that does the actual DBML parsing. It is pinned to an exact version, so parsing behaviour (which DBML constructs are accepted, how they are normalized) is reproducible across installs: everyone on a given `dbml-diff` version gets the same parser. That behaviour changes only when a new release of `dbml-diff` deliberately upgrades `@dbml/core`.
