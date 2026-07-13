# Migration script (`--migrate`)

`--migrate` emits a T-SQL migration script (SQL Server / Azure Synapse) that transforms a database from the old schema to the new one, instead of a diff:

```sh
dbml-diff old.dbml new.dbml --migrate -o up.sql
```

For a quick start see the [README](../README.md).

## What it emits live (uncommented)

- Added tables become `CREATE TABLE` (with a `PK_<table>` constraint when the table has a primary key).
- Added columns become `ALTER TABLE ... ADD`.
- Type or nullability changes become `ALTER TABLE ... ALTER COLUMN` (the full target type is restated, as T-SQL requires).
- Added foreign keys become `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY` (with an inline `-- NOTE` that it fails if existing rows violate the constraint).

## What it comments out for safety

Destructive and heuristic statements are emitted **commented out**, so a pasted script cannot cause data loss on a straight run. Review and uncomment them deliberately:

- Removed tables (`-- DROP TABLE ...`) and removed columns (`-- ALTER TABLE ... DROP COLUMN ...`).
- Rename candidates (`-- EXEC sp_rename ...`), which are heuristic - verify before running.
- Removed foreign keys, and the old side of a retargeted foreign key (`-- ALTER TABLE ... DROP CONSTRAINT ...`). A retargeted key comments the old drop and emits the new `ADD CONSTRAINT` live.
- Ambiguous (unresolved) ref changes, emitted as an `-- UNRESOLVED ref change` comment for you to resolve by hand.

## Caveats

- Adding a `NOT NULL` column to a table that already has rows fails without a default, and tightening an existing column to `NOT NULL` fails if it holds any NULLs; both carry an inline `-- NOTE`.
- Enums and TableGroups are not represented in the SQL output.
- The generated FK constraint name (`FK_<child>_<parent>_<childCols>`) is synthesized and unqualified, so it will usually differ from the real constraint name in your database. Adjust the name on any `DROP CONSTRAINT` line before uncommenting it.
- `--migrate` cannot be combined with `--format`, and T-SQL is currently the only dialect.
