# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `--migrate` flag and `emitMigration()` API: generate a T-SQL migration script
  (CREATE/ALTER DDL) from a schema diff. Destructive (DROP) and heuristic
  (rename) statements are emitted commented out. Enums, TableGroups, and foreign
  keys are not yet represented. (#18)
- `--migrate` now emits foreign-key DDL: added refs as live `ADD CONSTRAINT ...
  FOREIGN KEY`, removed and retargeted-old refs as commented `DROP CONSTRAINT`,
  and ambiguous ref changes as a comment. A refs-only or groups-only diff now
  correctly exits 1 and is summarized on stderr. (#18)

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
