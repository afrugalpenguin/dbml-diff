# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `--format mermaid` emits a Mermaid `erDiagram` block, rendering the same diff as `--format dbml` in a notation that GitHub and Azure DevOps render natively - nothing for the reader to install. The block is emitted bare, without a markdown code fence, so `-o diff.mmd` writes a usable file; wrap it yourself to embed it. Also exported programmatically as `emitMermaid()`. (#3)

### Changed

- `--full-new-tables` and `--hide-unchanged-pk` now apply to both visual formats (`--format dbml` and `--format mermaid`) instead of `--format dbml` alone. `--colors` remains dbml-only: it emits dbdiagram `headercolor` annotations, which Mermaid has no equivalent for. The warning printed when a flag is ignored names the formats it does apply to. (#3)

## [1.0.0] - 2026-07-13

First stable release. The public API is now covered by Semantic Versioning: the CLI flags, exit codes, the stdout/stderr split, and the programmatic `diff()` / `emit*()` surface will not change incompatibly without a major version bump. See the stability contract in `docs/stability.md` for exactly what is and is not covered.

### Changed

- `@dbml/core` is pinned to an exact version, so DBML parsing is reproducible across installs of a given `dbml-diff` release and changes only when a new release deliberately upgrades it. (#113)
- Documentation reorganised into a short pick-up README with full reference (CLI, visual diff, migration, API, stability) under `docs/`. (#110)

## [0.7.0] - 2026-07-09

### Added

- `dbml-diff` now warns on stderr when a dbml-only flag (`--full-new-tables`, `--colors`, `--hide-unchanged-pk`) is passed with an incompatible `--format`, or with `--migrate`, instead of silently ignoring it. The command still succeeds and produces its output. (#87)

### Fixed

- Security: `--migrate` now doubles a `]` inside a bracket-quoted T-SQL identifier (`]]`), so a crafted quoted column or table name can no longer terminate the identifier early and inject live SQL into the generated migration script. (#79)
- `--migrate`: a note-only column change (surfaced under `--include-notes`) no longer emits a spurious no-op `ALTER COLUMN`. (#78)
- dbml output: backslashes and newlines in a column note are now escaped, so emitted DBML with such notes stays valid and re-parses through `@dbml/core` instead of being rejected. (#80)
- Parsing: an indented `DiagramView` block is now brace-matched and no longer swallows the following `Table`, which previously showed up as a spurious removed + added table. (#88)
- Composite refs are keyed by their column pairing rather than positional order, so a consistent column-order flip on both endpoints (for example `(x, y)` listed as `(y, x)`) is no longer reported as a change; a genuine re-pairing still is. (#90)
- CLI: a large diff written to a pipe on Linux/macOS is no longer truncated at the ~64KB OS pipe buffer; the process now flushes stdout before exiting. Writing to a file with `-o` was never affected. (#89)

## [0.6.0] - 2026-07-07

### Added

- `--include-notes` flag: treat a changed column `note` as a column change,
  reported as `note changed` in text, json and dbml output. Off by default -
  notes are noise in most diffs. The library `diff()` / `diffSchemas()` take a
  matching `{ includeNotes }` option. (#68)
- `--hide-unchanged-pk` flag (and `emitDbml` `{ hideUnchangedPk }` option): in
  `--format dbml`, drop the unchanged primary-key orientation row from modified
  tables for a leaner delta-only view. Default keeps the row (valid, orientable
  DBML). NEW/DEL tables are unaffected. (#64)

### Changed

- Minimum supported Node.js is now `>=22` (was `>=18`); Node 18 and 20 have
  reached end-of-life / maintenance. CI test matrix runs on Node 22 and 24. (#61)

## [0.5.0] - 2026-07-07

### Fixed

- A column gaining or losing primary-key membership (with type and nullability
  otherwise unchanged) is now detected and reported as a changed column
  (`became PK` / `no longer PK`). (#65)
- `--migrate`: an added table with an un-annotated PK column now emits that
  column as `NOT NULL` in its `CREATE TABLE`, instead of an invalid explicit
  `NULL` under a `PRIMARY KEY` constraint (SQL Server Msg 8111). (#66)
- `--migrate`: a PK-only membership change no longer emits a no-op `ALTER COLUMN`
  that both fails to apply the PK and could render a becoming-PK column as `NULL`.
  The membership change is now surfaced as a commented-out `ADD` / `DROP
  CONSTRAINT ... PRIMARY KEY`, consistent with the destructive-statement safety
  convention. (#69)
- Column counts are now correctly pluralised: single-column tables read
  `1 column` instead of `1 columns` in text and dbml output. (#67)

### Changed

- `--format dbml`: the diff summary is now emitted as a `DIFF SUMMARY` table
  instead of a standalone `Note diff_summary` block. dbdiagram renders standalone
  notes (Sticky Notes) only on paid tiers, so free-tier users never saw the
  summary; a table always renders. Each metric is a column (label as the name,
  count as the type). The three table counts always show; enum/ref/group rows
  show only for categories that changed. Affected-table names and per-ref/group
  detail are dropped from the diagram (still available in `--format text` and
  `--format json`). (#62)

## [0.4.0] - 2026-07-05

### Added

- `--migrate` flag and `emitMigration()` API: generate a T-SQL migration script
  (CREATE / ALTER / foreign-key constraints) from a schema diff. Additive
  statements (CREATE TABLE, ALTER ADD/COLUMN, added `ADD CONSTRAINT`) are live;
  destructive (DROP) and heuristic (rename) statements, plus removed and
  retargeted-old foreign keys, are emitted commented out; ambiguous ref changes
  are emitted as a comment. Enums and TableGroups are not represented in SQL. (#18)

### Fixed

- A schema diff that changes only foreign keys or TableGroups now exits 1 and is
  summarized on stderr, instead of reporting no changes and exiting 0. (#18)

## [0.3.0] - 2026-07-04

### Added

- TableGroup membership diffing: detects added and removed `TableGroup` blocks
  and, for groups present in both schemas, the tables added to or removed from a
  group (membership compared as a set, so reordering is not a change). Rendered
  in `--format text` and in the `--format dbml` summary note.

## [0.2.0] - 2026-07-04

### Added

- Enum diffing: detects added and removed enums and value additions/removals.
- Relationship (`Ref:`) diffing: reports added and removed refs, plus
  `retargeted` when an FK side keeps its columns but points at a new parent, and
  `unresolved` for ambiguous many-to-many changes.
- Legend in the `--format text` output explaining the `+` / `-` / `~` markers.

## [0.1.1] - 2026-07-03

### Added

- Quickstart summary on bare invocation and worked examples in `--help`.
- Public roadmap page generated from the issue tracker.

### Changed

- npm releases now publish via OIDC trusted publishing (no stored tokens).

## [0.1.0] - 2026-07-03

### Added

- Initial release: the `dbml-diff` CLI and programmatic library for structurally
  diffing two DBML schemas, with `text`, `json`, and annotated `dbml` output.

[0.3.0]: https://github.com/afrugalpenguin/dbml-diff/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/afrugalpenguin/dbml-diff/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/afrugalpenguin/dbml-diff/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/afrugalpenguin/dbml-diff/releases/tag/v0.1.0
