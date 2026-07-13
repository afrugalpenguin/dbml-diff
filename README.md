# dbml-diff

[![npm version](https://img.shields.io/npm/v/dbml-diff)](https://www.npmjs.com/package/dbml-diff)
[![CI](https://github.com/afrugalpenguin/dbml-diff/actions/workflows/test.yml/badge.svg)](https://github.com/afrugalpenguin/dbml-diff/actions/workflows/test.yml)
[![license](https://img.shields.io/npm/l/dbml-diff)](LICENSE)

Structurally diff two [DBML](https://dbml.dbdiagram.io/) schema files and emit the result as text, JSON, or an annotated DBML document that renders as a **visual diff in [dbdiagram.io](https://dbdiagram.io/)**.

No install needed:

```sh
npx dbml-diff old.dbml new.dbml                             # readable text summary
npx dbml-diff old.dbml new.dbml --format dbml -o diff.dbml  # visual diff, paste into dbdiagram.io
```

## Why

If you keep your database schema as DBML in version control, `git diff` between two versions is line-noise: attribute reordering, whitespace, and hundreds of unchanged lines drown the handful of real changes. dbdiagram.io has no built-in version compare, and existing schema-diff tools target live databases, not DBML files. `dbml-diff` compares the two documents *structurally* - tables, columns, types, nullability, primary keys, enums - and tells you exactly what changed. Inspired by [holistics/dbml#175](https://github.com/holistics/dbml/issues/175).

The visual diff shows *only what changed* - added, removed, and modified tables, with per-column annotations:

<img src="docs/demo-diff.svg" alt="A rendered schema diff: tables prefixed NEW/MOD/DEL, changed columns suffixed and annotated, laid out in two columns" width="820">

## Install

```sh
npm i -g dbml-diff    # or keep using npx
```

## CLI usage

```
dbml-diff <old.dbml> <new.dbml> [options]

Options:
  --format <text|json|dbml>   output format (default: text)
  --full-new-tables           in dbml format, emit full column lists for
                              added tables (default: stub to PK + note with
                              column count, because full definitions drown
                              the diagram at scale)
  --colors                    in dbml format, use headercolor annotations
                              (#2ecc71 added / #f39c12 modified / #e74c3c
                              removed) instead of relying on name prefixes
                              alone. Requires dbdiagram paid tier to render;
                              name prefixes are always emitted regardless.
  --hide-unchanged-pk         in dbml format, drop the unchanged primary-key
                              row from modified tables (leaner delta-only view)
  --migrate                   emit a T-SQL migration script (ALTER/CREATE DDL)
                              instead of a diff; DROP and heuristic RENAME
                              statements are commented out. Cannot be combined
                              with --format. Honors -o.
  --include-notes             treat a changed column note as a column change
                              (reported as "note changed"); off by default
  -o, --output <file>         write to file instead of stdout
  -h, --help                  usage
  --version                   package version
```

The counts summary (`added: N, removed: N, modified: N`) always goes to **stderr**, so stdout stays pipeable.

## Visual diff conventions (`--format dbml`)

| Marker | Meaning |
| --- | --- |
| `NEW · ` table name prefix | Table added |
| `MOD · ` table name prefix | Table modified |
| `DEL · ` table name prefix | Table removed |
| `__ADDED` column suffix | Column added to a modified table |
| `__REMOVED` column suffix | Column removed from a modified table |
| `__RENAMED` column suffix | Rename candidate (heuristic - verify; never merged silently) |
| `__CHANGED` column suffix | Type, nullability or PK membership changed (detail in the column `note`) |
| `NEW · ` / `MOD · ` / `DEL · ` enum name prefix | Enum added / modified / removed |
| `[note: 'ADDED']` / `[note: 'REMOVED']` on an enum value | Value added / removed in a modified enum |

**What each block shows:**

- **Modified tables** show only their primary key (annotated `unchanged columns omitted`) plus the changed columns. `--hide-unchanged-pk` drops that PK row for a leaner delta-only view; the block stays valid because a modified table always has at least one changed column.
- **Added tables** are stubbed to the PK with a `NEW TABLE - N columns` note by default. `--full-new-tables` emits every column.
- **Removed tables** are emitted in full.
- **Enum changes** are emitted as `Enum` blocks under the same `NEW · / MOD · / DEL ·` prefixes. In a modified enum, the full new value list is shown with `ADDED` notes on new values, and the dropped values are re-listed with `REMOVED` notes.

**The `DIFF SUMMARY` table** at the top lists the counts, one column per metric, with the label as the column name and the count as the column type, so the numbers are visible on the canvas at a glance. It is a real table rather than a standalone `Note` block because dbdiagram renders standalone notes as Sticky Notes only on paid tiers, whereas a table always renders on the free tier. The three table counts (added / removed / modified) always appear; enum, ref, and TableGroup rows appear only for categories that changed.

**Relationships and groups.** `Ref:` changes are counted in the `DIFF SUMMARY` table:

- `added` / `removed` - a relationship gained or dropped.
- `retargeted` - an FK side keeps its columns but points at a new parent.
- `unresolved` - a change that cannot be mapped to a single retarget.

The per-ref and per-group detail - which tables changed and how - lives in `--format text` and `--format json`, not in the diagram.

### Viewing the diff in dbdiagram.io

1. `dbml-diff old.dbml new.dbml --format dbml -o diff.dbml`
2. Open [dbdiagram.io](https://dbdiagram.io/d) and create a new diagram.
3. Paste the contents of `diff.dbml` into the editor.
4. The diagram now shows only what changed: scan for the `NEW ·` / `MOD ·` / `DEL ·` tables, and hover the annotated columns to read the change notes. With `--colors` (paid tier) the table headers are colour-coded too.

## Migration script (`--migrate`)

`--migrate` emits a T-SQL migration script (SQL Server / Azure Synapse) that
transforms a database from the old schema to the new one, instead of a diff:

    dbml-diff old.dbml new.dbml --migrate -o up.sql

What it emits live (uncommented):

- Added tables become `CREATE TABLE` (with a `PK_<table>` constraint when the
  table has a primary key).
- Added columns become `ALTER TABLE ... ADD`.
- Type or nullability changes become `ALTER TABLE ... ALTER COLUMN` (the full
  target type is restated, as T-SQL requires).
- Added foreign keys become `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY`
  (with an inline `-- NOTE` that it fails if existing rows violate the constraint).

For safety, destructive and heuristic statements are emitted **commented out**, so
a pasted script cannot cause data loss on a straight run - review and uncomment
them deliberately:

- Removed tables (`-- DROP TABLE ...`) and removed columns
  (`-- ALTER TABLE ... DROP COLUMN ...`).
- Rename candidates (`-- EXEC sp_rename ...`), which are heuristic - verify
  before running.
- Removed foreign keys, and the old side of a retargeted foreign key
  (`-- ALTER TABLE ... DROP CONSTRAINT ...`). A retargeted key comments the old
  drop and emits the new `ADD CONSTRAINT` live.
- Ambiguous (unresolved) ref changes, emitted as an `-- UNRESOLVED ref change`
  comment for you to resolve by hand.

Caveats:

- Adding a `NOT NULL` column to a table that already has rows fails without a
  default, and tightening an existing column to `NOT NULL` fails if it holds any
  NULLs; both carry an inline `-- NOTE`.
- Enums and TableGroups are not represented in the SQL output.
- The generated FK constraint name (`FK_<child>_<parent>_<childCols>`) is
  synthesized and unqualified, so it will usually differ from the real
  constraint name in your database. Adjust the name on any `DROP CONSTRAINT`
  line before uncommenting it.
- `--migrate` cannot be combined with `--format`, and T-SQL is currently the
  only dialect.

## Programmatic API

```js
const { diff, emitText, emitJson, emitDbml, emitMigration } = require('dbml-diff');

const result = diff(oldDbmlString, newDbmlString);
// {
//   tables: {
//     added:    [ { name, columns: [...] } ],
//     removed:  [ { name, columns: [...] } ],
//     modified: [ {
//       name,
//       columns: [...],             // full column list after the change
//       columnsAdded: [...], columnsRemoved: [...],
//       columnsChanged: [ { column, changes: ['type X -> Y', ...] } ], // changes: human-readable
//       renames: [ { from, to } ]   // from/to are column objects; heuristic candidates only
//     } ]
//   },
//   enums: {
//     added:    [ { name, values: [...] } ],
//     removed:  [ { name, values: [...] } ],
//     modified: [ { name, values: [...], valuesAdded: [...], valuesRemoved: [...] } ]
//   },
//   refs: {
//     added:      [ { from: { table, columns }, to: { table, columns } } ],
//     removed:    [ { from, to } ],
//     retargeted: [ { from, oldTo, newTo } ],   // same FK side, new parent
//     unresolved: [ { from, oldTargets: [...], newTargets: [...] } ]  // ambiguous
//   },
//   groups: {   // TableGroups (membership diffed as a set)
//     added:    [ { name, tables: [...] } ],
//     removed:  [ { name, tables: [...] } ],
//     modified: [ { name, tablesAdded: [...], tablesRemoved: [...] } ]
//   },
//   counts: { added, removed, modified }   // tables only
// }

console.log(emitText(result));
console.log(emitJson(result));
console.log(emitDbml(result, { oldLabel: 'v1', newLabel: 'v2', colors: true }));
console.log(emitMigration(result, { oldLabel: 'v1', newLabel: 'v2' })); // T-SQL migration script
```

Every column in the result is `{ name, type, notNull, pk, note }` (`type` is a string, `notNull` and `pk` are booleans, `note` is a string or `null`). Enum entries are `{ name, values }`, groups `{ name, tables }`, and ref endpoints `{ table, columns }`.

## Exit codes

Useful for CI gates ("fail the build if the schema changed"):

| Exit code | Meaning |
| --- | --- |
| `0` | Schemas are identical |
| `1` | Differences found |
| `2` | Error (bad arguments, unreadable file, DBML parse failure) |

## Parsing behaviour

- dbdiagram-specific `DiagramView` top-level blocks are stripped before parsing (`@dbml/core` rejects them). `TableGroup` blocks are kept and diffed for group-membership changes.
- Primary keys are detected from inline `[pk]` attributes **and** from `Indexes { Col [pk] }` blocks.
- Schema-qualified table names (e.g. `dbo.Shipments`) are preserved as-is.

## Stability

`dbml-diff` follows [Semantic Versioning](https://semver.org/). From `1.0.0` onward, the surface below is the public API: a breaking change to any of it only lands in a new major version.

**Covered by semver (breaking changes bump the major):**

- The CLI flags and their meaning: `--format <text|json|dbml>`, `--migrate`, `--include-notes`, `--hide-unchanged-pk`, `--full-new-tables`, `--colors`, `-o/--output`, `--version`, `-h/--help`.
- The two CLI guards: `--migrate` cannot be combined with `--format` (exit `2`), and `--full-new-tables` / `--colors` / `--hide-unchanged-pk` are ignored with a warning outside `--format dbml`.
- The [exit codes](#exit-codes): `0` identical, `1` differences found, `2` error.
- The stdout/stderr split: diff or migration output goes to stdout (or the `-o` file); the counts summary and warnings go to stderr.
- That destructive (`DROP`) and heuristic (`RENAME`) statements in `--migrate` output are emitted commented out, so a straight run of that output is non-destructive.
- The programmatic API: the exported `diff()` return shape documented under [Programmatic API](#programmatic-api), and the signatures of `emitText()`, `emitJson()`, `emitDbml()`, and `emitMigration()`.

**Not covered (may change in a minor or patch):**

- The exact wording and layout of `--format text` output. It is meant to be read by a human, not parsed; scripts should use `--format json`.
- The exact wording of the stderr counts summary. A summary is always printed to stderr, but its text is for humans; scripts should key off the exit code and `--format json`.
- The human-readable phrases in `columnsChanged[].changes` (for example `type int -> bigint`, `became PK`). The array is part of the return shape, but the exact wording may change in a minor; consumers should key off the structured fields, not the phrases.
- The layout of the annotated `--format dbml` document: table stubbing, the `DIFF SUMMARY` table, column annotations, and note text. These render a diagram and are tuned for readability, not for machine consumption.
- The generated `--migrate` T-SQL: statement ordering, comments, and synthesized constraint names. `--migrate` is T-SQL-only and its output is a starting point for review, not a frozen contract.
- Any behavior reached only through an undocumented export or internal module.

`@dbml/core` is a runtime dependency; parse behavior it defines (which DBML constructs are accepted, how they are normalized) can shift when that dependency is upgraded.

## Roadmap

**[Visual public roadmap](https://afrugalpenguin.github.io/dbml-diff/roadmap.html)** - what shipped, what's in progress, what's next. Generated from the issue tracker: issues labelled `roadmap` become cards, `status:` labels set the column, closed issues land in Done.

- `--migrate` T-SQL migration script (`CREATE`/`ALTER`, foreign-key constraints,
  commented `DROP`/rename) - the ALTER-generation ask in upstream
  [holistics/dbml#175](https://github.com/holistics/dbml/issues/175).

## License

Apache-2.0.
