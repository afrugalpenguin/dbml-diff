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

The visual diff shows *only what changed* — added, removed, and modified tables, with per-column annotations:

![A rendered schema diff: tables prefixed NEW/MOD/DEL, changed columns suffixed and annotated](docs/demo-diff.svg)

## Why

If you keep your database schema as DBML in version control, `git diff` between two versions is line-noise: attribute reordering, whitespace, and hundreds of unchanged lines drown the handful of real changes. dbdiagram.io has no built-in version compare, and existing schema-diff tools target live databases, not DBML files. `dbml-diff` compares the two documents *structurally* — tables, columns, types, nullability, primary keys — and tells you exactly what changed. Upstream proposal: [holistics/dbml#938](https://github.com/holistics/dbml/issues/938), which generalises the long-standing [#175](https://github.com/holistics/dbml/issues/175).

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
| `__RENAMED` column suffix | Rename candidate (heuristic — verify; never merged silently) |
| `__CHANGED` column suffix | Type or nullability changed (detail in the column `note`) |

Modified tables show only their primary key (annotated `unchanged columns omitted`) plus the changed columns. Added tables are stubbed to the PK with a `NEW TABLE - N columns` note by default (`--full-new-tables` emits everything); removed tables are emitted in full. A `Note diff_summary { ... }` block at the top lists the counts and the affected table names.

### Viewing the diff in dbdiagram.io

1. `dbml-diff old.dbml new.dbml --format dbml -o diff.dbml`
2. Open [dbdiagram.io](https://dbdiagram.io/d) and create a new diagram.
3. Paste the contents of `diff.dbml` into the editor.
4. The diagram now shows only what changed: scan for the `NEW ·` / `MOD ·` / `DEL ·` tables, and hover the annotated columns to read the change notes. With `--colors` (paid tier) the table headers are colour-coded too.

## Programmatic API

```js
const { diff, emitText, emitJson, emitDbml } = require('dbml-diff');

const result = diff(oldDbmlString, newDbmlString);
// {
//   tables: {
//     added:    [ { name, columns: [...] } ],
//     removed:  [ { name, columns: [...] } ],
//     modified: [ {
//       name,
//       columnsAdded: [...], columnsRemoved: [...],
//       columnsChanged: [ { column, changes: ['type X -> Y', ...] } ],
//       renames: [ { from, to } ]   // heuristic candidates only
//     } ]
//   },
//   counts: { added, removed, modified }
// }

console.log(emitText(result));
console.log(emitJson(result));
console.log(emitDbml(result, { oldLabel: 'v1', newLabel: 'v2', colors: true }));
```

## Exit codes

Useful for CI gates ("fail the build if the schema changed"):

| Exit code | Meaning |
| --- | --- |
| `0` | Schemas are identical |
| `1` | Differences found |
| `2` | Error (bad arguments, unreadable file, DBML parse failure) |

## Parsing behaviour

- dbdiagram-specific `DiagramView` and `TableGroup` top-level blocks are stripped before parsing (`@dbml/core` rejects `DiagramView`).
- Primary keys are detected from inline `[pk]` attributes **and** from `Indexes { Col [pk] }` blocks.
- Schema-qualified table names (e.g. `dbo.Shipments`) are preserved as-is.

## Roadmap

**[📍 Visual public roadmap](https://afrugalpenguin.github.io/dbml-diff/roadmap.html)** — what shipped, what's in progress, what's next.

- Refs / relationship diffing
- Enum diffing
- Table group diffing
- `--format sql` — ALTER statement generation (see upstream [holistics/dbml#175](https://github.com/holistics/dbml/issues/175))

## License

Apache-2.0 (matches upstream [holistics/dbml](https://github.com/holistics/dbml)).
