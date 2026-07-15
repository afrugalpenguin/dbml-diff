# dbml-diff

[![npm version](https://img.shields.io/npm/v/dbml-diff)](https://www.npmjs.com/package/dbml-diff)
[![CI](https://github.com/afrugalpenguin/dbml-diff/actions/workflows/test.yml/badge.svg)](https://github.com/afrugalpenguin/dbml-diff/actions/workflows/test.yml)
[![license](https://img.shields.io/npm/l/dbml-diff)](LICENSE)

Structurally diff two [DBML](https://dbml.dbdiagram.io/) schema files and emit the result as text, JSON, or an annotated DBML document that renders as a **visual diff in [dbdiagram.io](https://dbdiagram.io/)**.

```sh
npx dbml-diff old.dbml new.dbml                             # readable text summary
npx dbml-diff old.dbml new.dbml --format dbml -o diff.dbml  # visual diff, paste into dbdiagram.io
npx dbml-diff old.dbml new.dbml --migrate -o up.sql         # T-SQL migration script
```

## Why

If you keep your database schema as DBML in version control, `git diff` between two versions is line-noise: attribute reordering, whitespace, and hundreds of unchanged lines drown the handful of real changes. dbdiagram.io has no built-in version compare, and existing schema-diff tools target live databases, not DBML files. `dbml-diff` compares the two documents *structurally* - tables, columns, types, nullability, primary keys, enums - and tells you exactly what changed. Inspired by [holistics/dbml#175](https://github.com/holistics/dbml/issues/175).

The visual diff shows *only what changed* - added, removed, and modified tables, with per-column annotations:

<img src="docs/demo-diff.svg" alt="A rendered schema diff: tables prefixed NEW/MOD/DEL, changed columns suffixed and annotated, laid out in two columns" width="820">

## Install

```sh
npm i -g dbml-diff    # or keep using npx
```

## Usage

```sh
dbml-diff <old.dbml> <new.dbml> [options]
```

The default output is a readable text summary. `--format json` gives a machine-readable result, and `--format dbml` gives the annotated document for the visual diff. Diff output goes to stdout (or the `-o` file); the counts summary goes to stderr, so stdout stays pipeable. Exit codes are `0` (identical), `1` (differences found), and `2` (error), which makes it a drop-in CI gate.

See the [CLI reference](docs/cli.md) for the full flag list, output streams, exit codes, and parsing behaviour.

## Visual diff

`--format dbml` emits an annotated DBML document that renders in dbdiagram.io as a diff of only what changed, using `NEW · / MOD · / DEL ·` table prefixes and `__ADDED / __REMOVED / __RENAMED / __CHANGED` column suffixes. See the [visual diff guide](docs/visual-diff.md) for every marker and how to view it in dbdiagram.io.

## Migration script

`--migrate` emits a T-SQL migration script (SQL Server / Azure Synapse) that transforms the old schema into the new one. Additive statements (`CREATE`, `ALTER ... ADD`, foreign keys) are emitted live; destructive and heuristic statements (`DROP`, rename) are commented out, so a straight run is non-destructive. See the [migration guide](docs/migration.md) for the full detail and caveats.

## Programmatic API

```js
const { diff, emitText, emitJson, emitDbml, emitMigration } = require('dbml-diff');

const result = diff(oldDbmlString, newDbmlString);
console.log(emitText(result));
```

See the [API reference](docs/api.md) for the full `diff()` return shape and emitter options.

## Documentation

- [CLI reference](docs/cli.md) - flags, output streams, exit codes, parsing behaviour
- [Visual diff guide](docs/visual-diff.md) - markers and viewing in dbdiagram.io
- [Migration guide](docs/migration.md) - the `--migrate` T-SQL script in full
- [API reference](docs/api.md) - the programmatic `diff()` and emitters
- [Design notes](docs/design.md) - why the diff behaves as it does, and known limitations
- [Stability](docs/stability.md) - the semver contract for `1.0`

## Roadmap

**[Visual public roadmap](https://afrugalpenguin.github.io/dbml-diff/roadmap.html)** - what shipped, what's in progress, what's next. Generated from the issue tracker: issues labelled `roadmap` become cards, `status:` labels set the column, closed issues land in Done.

## License

Apache-2.0.
