# Design: `--migrate` output (T-SQL migration script)

Issue: #18 (`--format sql: ALTER statement generation`). Upstream origin: holistics/dbml#175.

## Goal

Given an old and a new DBML schema, emit a T-SQL migration script (ALTER/CREATE
DDL) that transforms a database from the old schema to the new one. This is the
original upstream ask reframed as a migration, not a "schema as SQL" dump.

## Scope

### v1 (this work)

Dialect: **T-SQL only** (Synapse / SQL Server). No dialect abstraction, no
`--dialect` flag. `--migrate` means T-SQL.

Covered changes:

- Added tables -> `CREATE TABLE`
- Added columns -> `ALTER TABLE ... ADD`
- Type / nullability changes -> `ALTER TABLE ... ALTER COLUMN`
- Removed tables -> `DROP TABLE` (commented out)
- Removed columns -> `ALTER TABLE ... DROP COLUMN` (commented out)
- Heuristic renames -> `EXEC sp_rename ...` (commented out)

Not represented:

- Enums (no native T-SQL equivalent; ignored entirely in SQL output)
- TableGroups (pure dbdiagram visual concept; no SQL representation)

### v2 (future, separate issue)

- Foreign keys (refs) -> `ALTER TABLE ... ADD/DROP CONSTRAINT ... FOREIGN KEY`,
  retargeted = drop + add, unresolved = warning comment.

## Safety model

Destructive (`DROP`) and uncertain (heuristic `sp_rename`) statements are emitted
**commented out** with a warning. The user uncomments deliberately. A pasted
script can never cause data loss on a straight run. This is a hard contract and
gets a dedicated guard test (no uncommented `DROP` anywhere in the output).

## Architecture

New pure renderer `emitMigration(result, opts)` in `lib/emit.js`, mirroring the
existing `emitDbml` / `emitText` / `emitJson` signature (`DiffResult -> string`).
No new parsing or diffing; it walks the same result object.

Wiring:

- `lib/emit.js` - add and export `emitMigration`; add a private T-SQL
  identifier-quoting helper (`sales.orders` -> `[sales].[orders]`, split on `.`).
- `lib/index.js` - re-export `emitMigration` (extends the programmatic API).
- `bin/dbml-diff.js` - add a `--migrate` boolean flag, mutually exclusive with
  `--format` (passing both is a usage error, exit 2). When set, call
  `emitMigration(result, { oldLabel, newLabel, date })`. `--migrate` honors the
  existing `-o/--output` flag (already format-agnostic). Update usage text.

The counts-summary-to-stderr behavior is already format-agnostic, so stdout stays
pipeable.

## Statement mapping (T-SQL)

Emitted in dependency-safe order (creates first, drops last), grouped per table
under a `-- === table [dbo].[orders] ===` banner.

1. Added tables:

   ```sql
   CREATE TABLE [dbo].[customers] (
     [id] INT NOT NULL,
     [email] NVARCHAR(200) NOT NULL,
     CONSTRAINT [PK_customers] PRIMARY KEY ([id])
   );
   ```

   PK inlined as a table constraint when any `pk` column exists (composite PKs
   list all pk columns). Types passed through verbatim from the parser.

2. Added columns (one statement per column):

   ```sql
   ALTER TABLE [dbo].[orders] ADD [notes] NVARCHAR(MAX) NULL;
   ```

3. Type / nullability changes (one per changed column). `ALTER COLUMN` restates
   the full target type + nullability from `ch.column` (new-schema column),
   regardless of which attribute changed:

   ```sql
   ALTER TABLE [dbo].[orders] ALTER COLUMN [total] DECIMAL(18,2) NOT NULL;
   ```

4. Renames (heuristic, commented):

   ```sql
   -- RENAME (heuristic - verify before running):
   -- EXEC sp_rename '[dbo].[orders].[memo]', 'notes', 'COLUMN';
   ```

5. Dropped columns (commented):

   ```sql
   -- ALTER TABLE [dbo].[orders] DROP COLUMN [legacy_flag];
   ```

6. Dropped tables (commented):

   ```sql
   -- DROP TABLE [dbo].[audit_log];
   ```

## Formatting & edge cases

- Header banner documents old/new labels, date, and the "destructive/heuristic
  statements are commented out; enums and groups not represented" caveats.
- `NOT NULL` added column carries an inline warning (adding a NOT NULL column to
  a non-empty table fails without a default; we do not synthesize one):

  ```sql
  ALTER TABLE [dbo].[orders] ADD [status] INT NOT NULL; -- NOTE: fails on non-empty table without a default
  ```

- Identifier quoting: fully-qualified names split on `.`, each part
  bracket-wrapped. No forced `dbo.` - we do not invent a schema the source did
  not state.
- Empty diff -> single line `-- No schema changes.`
- Unchanged tables/enums/groups/refs produce no output.

## Testing (test-first)

Jest, matching `__tests__/emit.test.js` + `cli.test.js` conventions (snapshot +
targeted assertions, fixed `DATE` for a deterministic header).

Unit (`emit.test.js`), reusing the `v1.dbml -> v2.dbml` fixture pair:

- Full-output snapshot.
- Added table -> live `CREATE TABLE ... PRIMARY KEY`.
- Removed table -> `DROP TABLE` line present and commented (starts with `--`).
- Type/null change -> live `ALTER COLUMN` restating full type.
- Dropped column -> commented `DROP COLUMN`.
- Rename candidate -> commented `sp_rename` (add a dedicated fixture pair if the
  main pair yields no rename).
- Identical schemas -> `-- No schema changes.`
- `NOT NULL` added column carries the non-empty-table warning.
- Guard: no uncommented `DROP` anywhere (safety contract).

CLI (`cli.test.js`):

- `--migrate` exits 1 on the differing pair, emits `CREATE TABLE` on stdout,
  counts on stderr.
- `--migrate --format json` -> usage error, exit 2.
- `--migrate -o file.sql` writes the script to the file.

Docs / done criteria:

- README: document `--migrate`, its T-SQL scope, and the safety model.
- `--format`/usage text updated to mention `--migrate`.
- CHANGELOG entry.
