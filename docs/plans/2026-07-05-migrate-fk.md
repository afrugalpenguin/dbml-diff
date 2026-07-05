# `--migrate` Foreign-Key DDL (v2) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extend `emitMigration` to render foreign-key (`Ref:`) changes as T-SQL `ADD/DROP CONSTRAINT ... FOREIGN KEY`, completing issue #18.

**Architecture:** Add a `-- === foreign keys ===` section to the existing `emitMigration` in `lib/emit.js`, between the modified-table block and the removed-table block. Added FKs are live (with a note); removed and retargeted-old FKs are commented `DROP CONSTRAINT` (preserving the no-uncommented-DROP invariant); unresolved refs are a comment. Also fix the empty-diff guard so a refs-only diff is not reported as "No schema changes".

**Tech Stack:** Node.js, Jest. T-SQL only.

**Design doc:** `docs/plans/2026-07-05-migrate-fk-design.md`

**Working dir:** worktree `.worktrees/18-migrate` on branch `feature/18-migrate-output`. Run all commands there.

**Current `emitMigration` structure (lib/emit.js):** empty-diff guard at line 303; helpers `qname`/`qid`/`colType` above the function (~lines 282-286); added-table loop 316-325; modified-table loop 327-346; removed-table loop 348-351; final `return L.join('\n').replace(/\n+$/, '')` at 353.

**Verified ref shapes (result.refs):**
- `added`/`removed`: `{ from: {table, columns}, to: {table, columns} }` (from = child/FK side, to = parent).
- `retargeted`: `{ from, oldTo, newTo }`.
- `unresolved`: `{ from, oldTargets: [...], newTargets: [...] }`.

**Verified inline DBML ref syntax for tests:**
- Single-column: child column attribute `[ref: > Parent.Col]`.
- Composite: a top-level block `Ref: Child.(X, Y) > Parent.(A, B)`.
- Retargeted: same child `[ref: > P1.Id]` in old, `[ref: > P2.Id]` in new.
- Removed: `[ref: > P.Id]` in old, plain column in new.

**Constraint naming:** `FK_<childBare>_<parentBare>_<childCols joined by _>`, bare = unqualified table name. Example: child `dbo.Orders`.(CustomerId) -> parent `dbo.Customers` gives `FK_Orders_Customers_CustomerId`.

---

### Task 1: Empty-diff guard - do not report refs-only diffs as "No schema changes"

**Files:**
- Modify: `lib/emit.js` (guard at line 303)
- Test: `__tests__/emit.test.js`

**Step 1: Write the failing test.** Add to `__tests__/emit.test.js` (top level, near the other inline-DBML tests):

```js
test('a refs-only diff is not reported as no schema changes', () => {
  const before = 'Table Customers {\n  Id INT [pk]\n}\nTable Orders {\n  Id INT [pk]\n  CustomerId INT\n}';
  const after = 'Table Customers {\n  Id INT [pk]\n}\nTable Orders {\n  Id INT [pk]\n  CustomerId INT [ref: > Customers.Id]\n}';
  const out = emitMigration(diff(before, after));
  expect(out).not.toBe('-- No schema changes.');
  expect(out).toContain('Schema migration');
});
```

**Step 2: Run to verify failure.** Run: `npx jest emit -t "refs-only"`. Expected: FAIL (returns `-- No schema changes.` because the guard ignores refs).

**Step 3: Implement.** In `lib/emit.js`, replace the guard block at lines 302-303:

```js
  const { added, removed, modified } = result.tables;
  if (!added.length && !removed.length && !modified.length) return '-- No schema changes.';
```

with (compute refs + anyRef once, reuse later in Task 2):

```js
  const { added, removed, modified } = result.tables;
  const refs = result.refs || { added: [], removed: [], retargeted: [], unresolved: [] };
  const anyRef = refs.added.length || refs.removed.length ||
    refs.retargeted.length || refs.unresolved.length;
  if (!added.length && !removed.length && !modified.length && !anyRef) {
    return '-- No schema changes.';
  }
```

**Step 4: Run to verify pass.** Run: `npx jest emit`. Expected: all pass (the new test + existing; the identical-schemas `-- No schema changes.` test still passes because a no-change diff has no refs either).

**Step 5: Commit.**
```bash
git add lib/emit.js __tests__/emit.test.js
git commit -m "fix(migrate): do not report refs-only diff as no changes (#18)"
```

---

### Task 2: FK helpers + section banner + added FK (live)

**Files:**
- Modify: `lib/emit.js` (helpers near lines 282-286; FK section after the modified loop, before the removed loop at line 348)
- Test: `__tests__/emit.test.js`

**Step 1: Write failing tests.** Add to `__tests__/emit.test.js` (top level):

```js
test('added foreign key becomes a live ADD CONSTRAINT with a note', () => {
  const before = 'Table Customers {\n  Id INT [pk]\n}\nTable Orders {\n  Id INT [pk]\n  CustomerId INT\n}';
  const after = 'Table Customers {\n  Id INT [pk]\n}\nTable Orders {\n  Id INT [pk]\n  CustomerId INT [ref: > Customers.Id]\n}';
  const out = emitMigration(diff(before, after));
  const line = out.split('\n').find((l) => l.includes('ADD CONSTRAINT'));
  expect(line).toBeDefined();
  expect(line.trim().startsWith('--')).toBe(false); // live
  expect(line).toContain('ALTER TABLE [Orders] ADD CONSTRAINT [FK_Orders_Customers_CustomerId]');
  expect(line).toContain('FOREIGN KEY ([CustomerId]) REFERENCES [Customers] ([Id])');
  expect(line).toMatch(/NOTE: fails if existing rows violate it/);
  expect(out).toContain('-- === foreign keys ===');
});

test('composite foreign key lists all columns on both sides', () => {
  const before = 'Table P {\n  A INT\n  B INT\n  indexes { (A,B) [pk] }\n}\nTable C {\n  Id INT [pk]\n  X INT\n  Y INT\n}';
  const after = before + '\nRef: C.(X, Y) > P.(A, B)';
  const out = emitMigration(diff(before, after));
  const line = out.split('\n').find((l) => l.includes('ADD CONSTRAINT'));
  expect(line).toContain('[FK_C_P_X_Y]');
  expect(line).toContain('FOREIGN KEY ([X], [Y]) REFERENCES [P] ([A], [B])');
});
```

**Step 2: Run to verify failure.** Run: `npx jest emit -t "foreign key"`. Expected: FAIL (no `ADD CONSTRAINT` emitted yet).

**Step 3: Implement.**

(a) Add three helpers next to the existing `qname`/`qid`/`colType` (around line 286 in `lib/emit.js`):

```js
/** Bare (unqualified) table name: `dbo.Orders` -> `Orders`. */
const bareName = (fq) => fq.split('.').pop();
/** Synthesized FK constraint name: FK_<child>_<parent>_<childCols>. */
const fkName = (from, to) => `FK_${bareName(from.table)}_${bareName(to.table)}_${from.columns.join('_')}`;
/** T-SQL FK reference clause. */
const fkClause = (from, to) =>
  `FOREIGN KEY (${from.columns.map(qid).join(', ')}) REFERENCES ${qname(to.table)} (${to.columns.map(qid).join(', ')})`;
```

(b) Insert the FK section in `emitMigration` AFTER the `for (const m of modified) { ... }` loop (ends ~line 346) and BEFORE the `for (const t of removed) { ... }` loop (~line 348). `refs` and `anyRef` are already in scope from Task 1:

```js
  if (anyRef) {
    L.push(`-- === foreign keys ===`);
    L.push(`-- DROP CONSTRAINT uses a synthesized name; adjust it to the actual constraint`);
    L.push(`-- name in your database before uncommenting.`);
    for (const r of refs.added) {
      L.push(`ALTER TABLE ${qname(r.from.table)} ADD CONSTRAINT ${qid(fkName(r.from, r.to))} ${fkClause(r.from, r.to)}; -- NOTE: fails if existing rows violate it`);
    }
    L.push(``);
  }
```

(Removed/retargeted/unresolved handling is added in Task 3 - leave the loops out for now.)

**Step 4: Run to verify pass.** Run: `npx jest emit -t "foreign key"` then `npx jest emit`. Expected: all pass.

**Step 5: Commit.**
```bash
git add lib/emit.js __tests__/emit.test.js
git commit -m "feat(migrate): live ADD CONSTRAINT for added foreign keys (#18)"
```

---

### Task 3: Removed, retargeted, and unresolved foreign keys

**Files:**
- Modify: `lib/emit.js` (FK section)
- Test: `__tests__/emit.test.js`

**Step 1: Write failing tests.** Add to `__tests__/emit.test.js` (top level):

```js
test('removed foreign key is a commented DROP CONSTRAINT', () => {
  const before = 'Table P {\n  Id INT [pk]\n}\nTable C {\n  Id INT [pk]\n  Pid INT [ref: > P.Id]\n}';
  const after = 'Table P {\n  Id INT [pk]\n}\nTable C {\n  Id INT [pk]\n  Pid INT\n}';
  const out = emitMigration(diff(before, after));
  const line = out.split('\n').find((l) => l.includes('DROP CONSTRAINT'));
  expect(line).toBeDefined();
  expect(line.trim().startsWith('--')).toBe(true);
  expect(line).toContain('[FK_C_P_Pid]');
});

test('retargeted foreign key drops the old (commented) and adds the new (live)', () => {
  const before = 'Table P1 {\n  Id INT [pk]\n}\nTable P2 {\n  Id INT [pk]\n}\nTable C {\n  Id INT [pk]\n  Pid INT [ref: > P1.Id]\n}';
  const after = 'Table P1 {\n  Id INT [pk]\n}\nTable P2 {\n  Id INT [pk]\n}\nTable C {\n  Id INT [pk]\n  Pid INT [ref: > P2.Id]\n}';
  const out = emitMigration(diff(before, after));
  const dropLine = out.split('\n').find((l) => l.includes('DROP CONSTRAINT'));
  const addLine = out.split('\n').find((l) => l.includes('ADD CONSTRAINT'));
  expect(dropLine).toContain('[FK_C_P1_Pid]');
  expect(dropLine.trim().startsWith('--')).toBe(true);
  expect(addLine).toContain('[FK_C_P2_Pid]');
  expect(addLine.trim().startsWith('--')).toBe(false);
  expect(addLine).toContain('REFERENCES [P2] ([Id])');
});

test('unresolved ref change is a comment, not DDL', () => {
  // Two FKs from the same child column to two parents in old, different pair in new -> unresolved.
  const before = 'Table A {\n  Id INT [pk]\n}\nTable B {\n  Id INT [pk]\n}\nTable C {\n  Id INT [pk]\n  Pid INT\n}\nRef: C.Pid > A.Id\nRef: C.Pid > B.Id';
  const after = 'Table A {\n  Id INT [pk]\n}\nTable B {\n  Id INT [pk]\n}\nTable C {\n  Id INT [pk]\n  Pid INT\n}';
  const result = diff(before, after);
  // Only run assertions meaningful if the diff actually produced an unresolved entry;
  // otherwise fall back to removed (both are acceptable diff classifications).
  const out = emitMigration(result);
  if (result.refs.unresolved.length) {
    expect(out).toContain('-- UNRESOLVED ref change');
    const addForUnresolved = out.split('\n').filter((l) => l.includes('ADD CONSTRAINT') && !l.trim().startsWith('--'));
    // unresolved must not generate a live ADD CONSTRAINT
    expect(addForUnresolved.every((l) => !l.includes('[C]'))).toBe(true);
  } else {
    // If classified as removed instead, they must be commented DROPs (safety holds).
    const live = out.split('\n').filter((l) => !l.trim().startsWith('--') && /\bDROP\b/i.test(l));
    expect(live).toEqual([]);
  }
});
```

NOTE to implementer: before writing the unresolved branch, run a quick node check to confirm the `before`/`after` above actually yields `result.refs.unresolved.length > 0`. If it does not (the diff classifies it differently), construct a schema pair that does produce an unresolved entry (inspect `lib/diff.js` `diffRefs`, which routes an FK side with an ambiguous many-to-many of target changes to `unresolved`), and update the test's `before`/`after` accordingly. The test is written to not give a false pass, but the goal is to genuinely exercise the unresolved branch.

**Step 2: Run to verify failure.** Run: `npx jest emit -t "foreign key|retargeted|unresolved|CONSTRAINT"`. Expected: removed + retargeted tests FAIL.

**Step 3: Implement.** In the FK section of `emitMigration`, add the three loops after the `refs.added` loop (before the `L.push('')` that closes the section):

```js
    for (const r of refs.removed) {
      L.push(`-- ALTER TABLE ${qname(r.from.table)} DROP CONSTRAINT ${qid(fkName(r.from, r.to))};`);
    }
    for (const r of refs.retargeted) {
      L.push(`-- ALTER TABLE ${qname(r.from.table)} DROP CONSTRAINT ${qid(fkName(r.from, r.oldTo))};`);
      L.push(`ALTER TABLE ${qname(r.from.table)} ADD CONSTRAINT ${qid(fkName(r.from, r.newTo))} ${fkClause(r.from, r.newTo)}; -- NOTE: fails if existing rows violate it`);
    }
    for (const r of refs.unresolved) {
      L.push(`-- UNRESOLVED ref change on ${qname(r.from.table)}.${r.from.columns.map(qid).join(', ')} - ambiguous. Review and`);
      L.push(`--   write the ALTER CONSTRAINT statements manually.`);
    }
```

**Step 4: Run to verify pass.** Run: `npx jest emit`. Expected: all pass.

**Step 5: Commit.**
```bash
git add lib/emit.js __tests__/emit.test.js
git commit -m "feat(migrate): commented DROP/retargeted/unresolved FK handling (#18)"
```

---

### Task 4: FK safety guard + CLI-level test

**Files:**
- Test: `__tests__/emit.test.js`, `__tests__/cli.test.js`

**Step 1: Write failing/behavior tests.**

In `__tests__/emit.test.js` (top level):

```js
test('SAFETY: FK-heavy diff still emits no uncommented DROP', () => {
  const before = 'Table P1 {\n  Id INT [pk]\n}\nTable P2 {\n  Id INT [pk]\n}\nTable C {\n  Id INT [pk]\n  Pid INT [ref: > P1.Id]\n  Qid INT [ref: > P2.Id]\n}';
  const after = 'Table P1 {\n  Id INT [pk]\n}\nTable P2 {\n  Id INT [pk]\n}\nTable C {\n  Id INT [pk]\n  Pid INT [ref: > P2.Id]\n}';
  const out = emitMigration(diff(before, after));
  const offending = out.split('\n').filter((l) => !l.trim().startsWith('--')).filter((l) => /\bDROP\b/i.test(l));
  expect(offending).toEqual([]);
});
```

In `__tests__/cli.test.js` (inside `describe('CLI', ...)`), create temp fixture files with a new ref and assert the CLI emits `ADD CONSTRAINT`:

```js
test('--migrate emits ADD CONSTRAINT for a new foreign key', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dbml-diff-fk-'));
  const oldF = path.join(dir, 'old.dbml');
  const newF = path.join(dir, 'new.dbml');
  try {
    fs.writeFileSync(oldF, 'Table Customers {\n  Id INT [pk]\n}\nTable Orders {\n  Id INT [pk]\n  CustomerId INT\n}\n');
    fs.writeFileSync(newF, 'Table Customers {\n  Id INT [pk]\n}\nTable Orders {\n  Id INT [pk]\n  CustomerId INT [ref: > Customers.Id]\n}\n');
    const res = run(oldF, newF, '--migrate');
    expect(res.status).toBe(1);
    expect(res.stdout).toContain('ADD CONSTRAINT [FK_Orders_Customers_CustomerId]');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
```

**Step 2: Run.** Run: `npx jest`. These should PASS immediately (behavior already implemented in Tasks 2-3); they lock in the safety contract and CLI wiring. If any fails, fix before committing.

**Step 3: Commit.**
```bash
git add __tests__/emit.test.js __tests__/cli.test.js
git commit -m "test(migrate): FK safety guard and CLI ADD CONSTRAINT coverage (#18)"
```

---

### Task 5: Docs + full suite green

**Files:**
- Modify: `README.md`, `CHANGELOG.md`

**Step 1: README `## Migration script` section.** Update the "What it emits live" and "commented out" lists and caveats to include foreign keys: added FKs emit live `ADD CONSTRAINT ... FOREIGN KEY` (with an inline note that it fails if existing rows violate it); removed FKs and the old side of a retargeted FK emit commented `DROP CONSTRAINT`; retargeted FKs drop-then-add; unresolved ref changes emit an explanatory comment. Add a caveat: the `DROP CONSTRAINT` name is synthesized (`FK_child_parent_col`) and must be matched to the real constraint name in the target database. Update the "Enums, TableGroups, and foreign keys are not represented" caveat to remove foreign keys from that exclusion (only enums and TableGroups remain excluded).

**Step 2: README roadmap bullet.** The bullet currently reads that FK constraint DDL is "still to come". Replace it to state that `--migrate` now covers the full T-SQL ALTER scope for #18 (CREATE/ALTER/constraints), or remove the "still to come" clause. Do not add time commitments.

**Step 3: CHANGELOG.** Under the existing `## [Unreleased]` / `### Added`, add:
```
- `--migrate` now emits foreign-key DDL: added refs as live `ADD CONSTRAINT ...
  FOREIGN KEY`, removed and retargeted-old refs as commented `DROP CONSTRAINT`,
  and ambiguous ref changes as a comment. (#18)
```

**Step 4: Full suite + smoke test.** Run: `npx jest` (all green). Then:
```bash
node bin/dbml-diff.js <(printf 'Table Customers {\n  Id INT [pk]\n}\nTable Orders {\n  Id INT [pk]\n  CustomerId INT\n}\n') <(printf 'Table Customers {\n  Id INT [pk]\n}\nTable Orders {\n  Id INT [pk]\n  CustomerId INT [ref: > Customers.Id]\n}\n') --migrate
```
(If process substitution is unavailable on the shell, write two temp files instead.) Confirm the output contains a live `ADD CONSTRAINT ... FOREIGN KEY` and the `-- === foreign keys ===` banner.

**Step 5: Commit.**
```bash
git add README.md CHANGELOG.md
git commit -m "docs(migrate): document foreign-key DDL in --migrate (#18)"
```

---

## Done criteria

- `npx jest` fully green.
- `--migrate` emits FK DDL: added live (with note), removed/retargeted-old commented, unresolved as comment.
- Safety invariant intact: no uncommented `DROP` for any FK case.
- Refs-only diff is not reported as "No schema changes".
- README + CHANGELOG updated; foreign keys removed from the "not represented" caveat.
- All work committed on `feature/18-migrate-output`; branch still unmerged (release gated until #18 complete).

## Style reminders

- No emojis, no em dashes, no Unicode arrows (plain `-`/`>`), no AI/Claude references.
- Commit messages: `type(scope): description`, subject <= 72 chars, no co-authors, no `--no-verify`.
