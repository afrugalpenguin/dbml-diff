# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
