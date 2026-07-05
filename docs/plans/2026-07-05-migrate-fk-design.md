# Design: `--migrate` foreign-key DDL (v2)

Issue: #18 (`ALTER statement generation`). Completes the `--migrate` T-SQL output
begun in `2026-07-05-migrate-output-design.md` (v1). The feature is NOT released
until this v2 (foreign keys) lands - the branch `feature/18-migrate-output` stays
unmerged until then.

## Goal

Extend `emitMigration` to represent foreign-key (`Ref:`) changes as T-SQL
`ADD/DROP CONSTRAINT ... FOREIGN KEY` statements, preserving the v1 safety model
(no uncommented `DROP` anywhere).

## Decisions (from brainstorming)

- Added FK: emitted **live** with an inline `-- NOTE: fails if existing rows violate it`.
- Constraint naming: `FK_<childBare>_<parentBare>_<childCols joined by _>` so two
  FKs between the same table pair do not collide.
- Removed FK and the old side of a retargeted FK: emitted **commented**
  `DROP CONSTRAINT` (keeps the no-uncommented-DROP invariant).
- Retargeted FK: commented drop of the old constraint + live add of the new.
- Unresolved FK: comment only, no DDL.
- Enums and TableGroups remain out of SQL scope.

## Data shapes (verified against lib/diff.js)

`result.refs = { added: RefDef[], removed: RefDef[], retargeted: RetargetedRef[], unresolved: UnresolvedRef[] }`

- `RefDef = { from: RefEndpoint, to: RefEndpoint }` where `from` is the child/FK
  side and `to` is the parent side.
- `RefEndpoint = { table, columns }` (table fully-qualified, columns an array).
- `RetargetedRef = { from, oldTo, newTo }` (from = unchanged child side).
- `UnresolvedRef = { from, oldTargets: RefEndpoint[], newTargets: RefEndpoint[] }`.

## Statement mapping

A `-- === foreign keys ===` section emitted AFTER the modified-table block and
BEFORE removed tables (so added FKs reference already-created tables/columns).

Constraint-name helper: `fkName(from, to) = FK_${bare(from.table)}_${bare(to.table)}_${from.columns.join('_')}`
where `bare(x) = x.split('.').pop()`.

FK reference clause helper: `FOREIGN KEY (${from.columns.map(qid).join(', ')}) REFERENCES ${qname(to.table)} (${to.columns.map(qid).join(', ')})`.

Section banner (once, if any ref change exists):

```sql
-- === foreign keys ===
-- DROP CONSTRAINT uses a synthesized name; adjust it to the actual constraint
-- name in your database before uncommenting.
```

**Added** (live, with note):

```sql
ALTER TABLE [dbo].[Orders] ADD CONSTRAINT [FK_Orders_Customers_CustomerId]
  FOREIGN KEY ([CustomerId]) REFERENCES [dbo].[Customers] ([Id]); -- NOTE: fails if existing rows violate it
```

(Emitted as a single line, not wrapped - wrapping shown here for readability.)

**Removed** (commented):

```sql
-- ALTER TABLE [dbo].[Orders] DROP CONSTRAINT [FK_Orders_Customers_CustomerId];
```

**Retargeted** (commented old drop + live new add):

```sql
-- ALTER TABLE [dbo].[Orders] DROP CONSTRAINT [FK_Orders_OldParent_Pid];
ALTER TABLE [dbo].[Orders] ADD CONSTRAINT [FK_Orders_NewParent_Pid] FOREIGN KEY ([Pid]) REFERENCES [dbo].[NewParent] ([Id]); -- NOTE: fails if existing rows violate it
```

**Unresolved** (comment only):

```sql
-- UNRESOLVED ref change on [dbo].[C].[Pid] - ambiguous. Review and write the
--   ALTER CONSTRAINT statements manually.
```

## Empty-diff guard fix

The current `-- No schema changes.` short-circuit keys only on table changes. A
refs-only diff would wrongly print "No schema changes". Extend the guard to also
consider `refs.added/removed/retargeted/unresolved` non-empty. (Enums/groups
still produce no SQL, so they stay excluded from the guard, consistent with the
header caveat.)

## Testing

The `v1.dbml -> v2.dbml` fixtures have NO refs, so the main snapshot is
unaffected. FK behavior is tested with inline DBML strings (like the existing
tightening test), one focused test per case:

- Added ref -> live `ADD CONSTRAINT [FK_Orders_Customers_CustomerId] FOREIGN KEY ([CustomerId]) REFERENCES [dbo].[Customers] ([Id])` with the note.
- Removed ref -> commented `DROP CONSTRAINT` (line starts with `--`).
- Retargeted ref -> old `DROP CONSTRAINT` commented AND new `ADD CONSTRAINT` live.
- Unresolved ref -> `UNRESOLVED` comment, no `ADD CONSTRAINT` for it.
- Composite key -> `FOREIGN KEY (c1, c2) REFERENCES parent (p1, p2)`.
- SAFETY: no uncommented DROP over an FK-heavy diff (added + removed + retargeted).
- Refs-only diff does NOT return `-- No schema changes.`
- CLI: `--migrate` on a schema with a new ref emits `ADD CONSTRAINT` on stdout.

Inline DBML ref syntax that parses: a column attribute `[ref: > Parent.Col]` on
the child column (verified).

## Docs

- README `## Migration script`: state that FKs are now represented (added live,
  removed/retargeted-old commented, unresolved as a comment; synthesized DROP
  name caveat).
- README roadmap bullet: drop the "foreign-key constraints still to come" note;
  `--migrate` now covers the full ALTER scope for #18.
- CHANGELOG `[Unreleased]`: add an FK line.

## Out of scope (unchanged)

- Non-T-SQL dialects.
- Enum and TableGroup SQL representation.
- Synthesizing defaults or data fixes for constraint/nullability failures.
