'use strict';

const fs = require('fs');
const path = require('path');
const { Parser } = require('@dbml/core');
const { diff, emitText, emitJson, emitDbml, emitMigration } = require('../lib');

const FIXTURES = path.join(__dirname, 'fixtures');
const v1 = fs.readFileSync(path.join(FIXTURES, 'v1.dbml'), 'utf8');
const v2 = fs.readFileSync(path.join(FIXTURES, 'v2.dbml'), 'utf8');

// Fixed date so the emitted header is deterministic across runs.
const DATE = '2026-01-01';

describe('emit (v1 -> v2 fixtures)', () => {
  const result = diff(v1, v2);

  test('fixture pair has the expected counts', () => {
    expect(result.counts).toEqual({ added: 1, removed: 1, modified: 4 });
  });

  test('emitDbml default matches snapshot', () => {
    expect(emitDbml(result, { oldLabel: 'v1.dbml', newLabel: 'v2.dbml', date: DATE }))
      .toMatchSnapshot();
  });

  test('emitDbml with fullNewTables matches snapshot', () => {
    expect(emitDbml(result, { oldLabel: 'v1.dbml', newLabel: 'v2.dbml', date: DATE, fullNewTables: true }))
      .toMatchSnapshot();
  });

  test('emitDbml with colors matches snapshot', () => {
    expect(emitDbml(result, { oldLabel: 'v1.dbml', newLabel: 'v2.dbml', date: DATE, colors: true }))
      .toMatchSnapshot();
  });

  test('emitText matches snapshot', () => {
    expect(emitText(result)).toMatchSnapshot();
  });

  test('emitJson matches snapshot', () => {
    expect(emitJson(result)).toMatchSnapshot();
  });

  test('emitJson is valid JSON with the documented shape', () => {
    const parsed = JSON.parse(emitJson(result));
    expect(parsed.counts).toEqual({ added: 1, removed: 1, modified: 4 });
    expect(parsed.tables.added[0].name).toBe('dbo.PlanKind');
  });

  test('emitText reports no differences for identical schemas', () => {
    expect(emitText(diff(v1, v1))).toBe('No differences found.');
  });

  test('emitText opens with a legend explaining the markers', () => {
    const out = emitText(result);
    const firstLine = out.split('\n')[0];
    expect(firstLine).toBe('Legend: + added   - removed   ~ modified');
    // Legend precedes the first change section.
    expect(out.indexOf('Legend:')).toBeLessThan(out.indexOf('tables'));
  });

  test('emitText omits the legend when there are no differences', () => {
    expect(emitText(diff(v1, v1))).not.toContain('Legend:');
  });

  // Acceptance check: guarantees dbdiagram.io will accept the output.
  test.each([
    ['default', {}],
    ['fullNewTables', { fullNewTables: true }],
    ['colors', { colors: true }],
  ])('emitDbml output (%s) parses cleanly back through @dbml/core', (_label, opts) => {
    const out = emitDbml(result, { oldLabel: 'v1.dbml', newLabel: 'v2.dbml', date: DATE, ...opts });
    expect(() => new Parser().parse(out, 'dbmlv2')).not.toThrow();
  });
});

test('emitMigration is exported from the package entry point', () => {
  expect(typeof require('../lib').emitMigration).toBe('function');
});

test('a refs-only diff is not reported as no schema changes', () => {
  const before = 'Table Customers {\n  Id INT [pk]\n}\nTable Orders {\n  Id INT [pk]\n  CustomerId INT\n}';
  const after = 'Table Customers {\n  Id INT [pk]\n}\nTable Orders {\n  Id INT [pk]\n  CustomerId INT [ref: > Customers.Id]\n}';
  const out = emitMigration(diff(before, after));
  expect(out).not.toBe('-- No schema changes.');
  expect(out).toContain('Schema migration');
});

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

test('removed foreign key is a commented DROP CONSTRAINT', () => {
  const before = 'Table P {\n  Id INT [pk]\n}\nTable C {\n  Id INT [pk]\n  Pid INT [ref: > P.Id]\n}';
  const after = 'Table P {\n  Id INT [pk]\n}\nTable C {\n  Id INT [pk]\n  Pid INT\n}';
  const out = emitMigration(diff(before, after));
  const line = out.split('\n').find((l) => l.includes('ALTER TABLE') && l.includes('DROP CONSTRAINT'));
  expect(line).toBeDefined();
  expect(line.trim().startsWith('--')).toBe(true);
  expect(line).toContain('[FK_C_P_Pid]');
});

test('retargeted foreign key drops the old (commented) and adds the new (live)', () => {
  const before = 'Table P1 {\n  Id INT [pk]\n}\nTable P2 {\n  Id INT [pk]\n}\nTable C {\n  Id INT [pk]\n  Pid INT [ref: > P1.Id]\n}';
  const after = 'Table P1 {\n  Id INT [pk]\n}\nTable P2 {\n  Id INT [pk]\n}\nTable C {\n  Id INT [pk]\n  Pid INT [ref: > P2.Id]\n}';
  const out = emitMigration(diff(before, after));
  const dropLine = out.split('\n').find((l) => l.includes('ALTER TABLE') && l.includes('DROP CONSTRAINT'));
  const addLine = out.split('\n').find((l) => l.includes('ADD CONSTRAINT'));
  expect(dropLine).toContain('[FK_C_P1_Pid]');
  expect(dropLine.trim().startsWith('--')).toBe(true);
  expect(addLine).toContain('[FK_C_P2_Pid]');
  expect(addLine.trim().startsWith('--')).toBe(false);
  expect(addLine).toContain('REFERENCES [P2] ([Id])');
});

test('SAFETY: FK-heavy diff still emits no uncommented DROP', () => {
  const before = 'Table P1 {\n  Id INT [pk]\n}\nTable P2 {\n  Id INT [pk]\n}\nTable C {\n  Id INT [pk]\n  Pid INT [ref: > P1.Id]\n  Qid INT [ref: > P2.Id]\n}';
  const after = 'Table P1 {\n  Id INT [pk]\n}\nTable P2 {\n  Id INT [pk]\n}\nTable C {\n  Id INT [pk]\n  Pid INT [ref: > P2.Id]\n}';
  const out = emitMigration(diff(before, after));
  const offending = out.split('\n').filter((l) => !l.trim().startsWith('--')).filter((l) => /\bDROP\b/i.test(l));
  expect(offending).toEqual([]);
});

test('added-only FK diff does not print the DROP-name caveat', () => {
  const before = 'Table Customers {\n  Id INT [pk]\n}\nTable Orders {\n  Id INT [pk]\n  CustomerId INT\n}';
  const after = 'Table Customers {\n  Id INT [pk]\n}\nTable Orders {\n  Id INT [pk]\n  CustomerId INT [ref: > Customers.Id]\n}';
  const out = emitMigration(diff(before, after));
  expect(out).toContain('-- === foreign keys ===');
  expect(out).not.toContain('synthesized name');
});

test('unresolved ref change is a comment, not a live constraint', () => {
  const before = 'Table A {\n  Id INT [pk]\n}\nTable B {\n  Id INT [pk]\n}\nTable D {\n  Id INT [pk]\n}\nTable C {\n  Id INT [pk]\n  Pid INT\n}\nRef: C.Pid > A.Id\nRef: C.Pid > B.Id';
  const after = 'Table A {\n  Id INT [pk]\n}\nTable B {\n  Id INT [pk]\n}\nTable D {\n  Id INT [pk]\n}\nTable C {\n  Id INT [pk]\n  Pid INT\n}\nRef: C.Pid > D.Id';
  const result = diff(before, after);
  expect(result.refs.unresolved.length).toBeGreaterThan(0); // guard: genuinely unresolved
  const out = emitMigration(result);
  expect(out).toContain('-- UNRESOLVED ref change');
  const liveConstraint = out.split('\n').filter((l) => !l.trim().startsWith('--') && l.includes('CONSTRAINT'));
  expect(liveConstraint).toEqual([]);
});

test('added table with an un-annotated PK column renders that column NOT NULL', () => {
  const before = 'Table Customers {\n  Id INT [pk]\n}';
  const after = 'Table Customers {\n  Id INT [pk]\n}\nTable dbo.Settlement {\n  Id int [pk]\n  Amount decimal(18,2)\n}';
  const out = emitMigration(diff(before, after));
  const idLine = out.split('\n').find((l) => /^\s+\[Id\]/.test(l));
  expect(idLine).toBeDefined();
  expect(idLine).toMatch(/NOT NULL/);
  // Reject a bare NULL — a NULL not preceded by NOT. (A naive /NULL/ or a
  // look-*ahead* would also flag the NULL inside "NOT NULL"; use a lookbehind.)
  expect(idLine).not.toMatch(/(?<!NOT )\bNULL\b/);
});

describe('emitMigration (v1 -> v2 fixtures)', () => {
  const result = diff(v1, v2);
  const sql = emitMigration(result, { oldLabel: 'v1.dbml', newLabel: 'v2.dbml', date: DATE });

  test('opens with a header banner naming the dialect and safety caveat', () => {
    const lines = sql.split('\n');
    expect(lines[0]).toBe('-- Schema migration: v1.dbml -> v2.dbml');
    expect(sql).toContain('-- Generated by dbml-diff on 2026-01-01');
    expect(sql).toContain('T-SQL');
    expect(sql).toMatch(/destructive .*commented/i);
  });

  test('identical schemas produce a no-op comment', () => {
    expect(emitMigration(diff(v1, v1))).toBe('-- No schema changes.');
  });

  test('added table becomes a live CREATE TABLE with a PK constraint', () => {
    expect(sql).toContain('CREATE TABLE [dbo].[PlanKind] (');
    expect(sql).toContain('[Id] INT NOT NULL');
    expect(sql).toContain('[Title] NVARCHAR(100) NOT NULL');
    expect(sql).toMatch(/CONSTRAINT \[PK_PlanKind\] PRIMARY KEY \(\[Id\]\)/);
  });

  test('added column becomes a live ALTER TABLE ADD', () => {
    expect(sql).toContain('ALTER TABLE [dbo].[Subscriptions] ADD [PlanKindId] INT NOT NULL;');
  });

  test('NOT NULL added column carries a non-empty-table warning', () => {
    const line = sql.split('\n').find((l) => l.includes('ADD [PlanKindId]'));
    expect(line).toMatch(/NOTE: fails on non-empty table without a default/);
  });

  test('type/nullability change becomes a live ALTER COLUMN restating full type', () => {
    expect(sql).toContain('ALTER TABLE [dbo].[Refunds] ALTER COLUMN [ProcessedOn] BIGINT NULL;');
    expect(sql).toContain('ALTER TABLE [dbo].[Subscriptions] ALTER COLUMN [EnrolledOn] DATETIME NULL;');
  });

  test('loosening a column to nullable carries no warning', () => {
    const line = sql.split('\n').find((l) => l.includes('ALTER COLUMN [EnrolledOn]'));
    expect(line).not.toMatch(/NOTE/);
  });

  test('tightening a column to NOT NULL carries a NULLs warning', () => {
    const before = 'Table t {\n  id INT [pk]\n  x INT\n}';
    const after = 'Table t {\n  id INT [pk]\n  x INT [not null]\n}';
    const out = emitMigration(diff(before, after));
    const line = out.split('\n').find((l) => l.includes('ALTER COLUMN [x]'));
    expect(line).toContain('[x] INT NOT NULL;');
    expect(line).toMatch(/NOTE: fails if the column contains NULLs/);
  });

  test('heuristic rename is emitted commented as sp_rename', () => {
    const line = sql.split('\n').find((l) => l.includes('sp_rename'));
    expect(line).toBeDefined();
    expect(line.trim().startsWith('--')).toBe(true);
    expect(line).toContain("'dbo.SubscriptionLines.ZoneId', 'GeoZoneId', 'COLUMN'");
  });

  test('dropped column is emitted commented', () => {
    const line = sql.split('\n').find((l) => l.includes('DROP COLUMN [CarrierLabel]'));
    expect(line).toBeDefined();
    expect(line.trim().startsWith('--')).toBe(true);
  });

  test('removed table is emitted commented as DROP TABLE', () => {
    const line = sql.split('\n').find((l) => l.includes('DROP TABLE'));
    expect(line).toBeDefined();
    expect(line).toContain('[dbo].[LegacyLog]');
    expect(line.trim().startsWith('--')).toBe(true);
  });

  test('SAFETY: no uncommented DROP statement anywhere', () => {
    const offending = sql
      .split('\n')
      .filter((l) => !l.trim().startsWith('--'))
      .filter((l) => /\bDROP\b/i.test(l));
    expect(offending).toEqual([]);
  });

  test('emitMigration output matches snapshot', () => {
    expect(sql).toMatchSnapshot();
  });
});

describe('emit (enums)', () => {
  const added = () => diff(
    `Table t { id int [pk] }`,
    `Table t { id int [pk] }
Enum status {
  a
  b
}`,
  );
  const modified = () => diff(
    `Enum status {
  pending
  cancelled
}`,
    `Enum status {
  pending
  shipped
}`,
  );

  test('emitText reports an enum-only change instead of "no differences"', () => {
    const out = emitText(added());
    expect(out).not.toBe('No differences found.');
    expect(out).toContain('Added enums (1):');
    expect(out).toContain('+ status (a, b)');
  });

  test('emitText lists added and removed enum values for a modified enum', () => {
    const out = emitText(modified());
    expect(out).toContain('Modified enums (1):');
    expect(out).toContain('~ status');
    expect(out).toContain('+ value shipped');
    expect(out).toContain('- value cancelled');
  });

  test('emitDbml renders an added enum with the NEW prefix', () => {
    const out = emitDbml(added(), { date: DATE });
    expect(out).toContain('Enum "NEW · status"');
    expect(out).toContain('Enums added: 1');
  });

  test('emitDbml renders a modified enum with ADDED/REMOVED value notes', () => {
    const out = emitDbml(modified(), { date: DATE });
    expect(out).toContain('Enum "MOD · status"');
    expect(out).toContain("shipped [note: 'ADDED']");
    expect(out).toContain("cancelled [note: 'REMOVED']");
  });

  test('emitDbml enum output parses cleanly back through @dbml/core', () => {
    for (const r of [added(), modified()]) {
      const out = emitDbml(r, { date: DATE });
      expect(() => new Parser().parse(out, 'dbmlv2')).not.toThrow();
    }
  });

  test('emitDbml is unchanged for a table-only diff (no enum section)', () => {
    const tableOnly = diff(`Table t { id int [pk] }`, `Table t { id int [pk]
  name varchar(50) }`);
    const out = emitDbml(tableOnly, { date: DATE });
    expect(out).not.toContain('ENUMS');
    expect(out).not.toContain('Enums added');
  });
});

describe('emit (groups)', () => {
  const tables = `Table users { id int [pk] }
Table posts { id int [pk] }
Table comments { id int [pk] }
`;
  const added = () => diff(tables, `${tables}TableGroup social {
  users
  posts
}`);
  const modified = () => diff(
    `${tables}TableGroup social {
  users
  posts
}`,
    `${tables}TableGroup social {
  users
  comments
}`,
  );

  test('emitText reports an added group instead of "no differences"', () => {
    const out = emitText(added());
    expect(out).not.toBe('No differences found.');
    expect(out).toContain('Group changes (1):');
    expect(out).toContain('+ social (posts, users)');
  });

  test('emitText lists membership added and removed for a modified group', () => {
    const out = emitText(modified());
    expect(out).toContain('~ social');
    expect(out).toContain('+ table comments');
    expect(out).toContain('- table posts');
  });

  test('emitDbml records group counts in the summary note', () => {
    const out = emitDbml(added(), { date: DATE });
    expect(out).toContain('Groups added: 1');
  });

  test('emitDbml group output parses cleanly back through @dbml/core', () => {
    for (const r of [added(), modified()]) {
      const out = emitDbml(r, { date: DATE });
      expect(() => new Parser().parse(out, 'dbmlv2')).not.toThrow();
    }
  });

  test('emitDbml is unchanged for a table-only diff (no groups section)', () => {
    const tableOnly = diff(`Table t { id int [pk] }`, `Table t { id int [pk]
  name varchar(50) }`);
    const out = emitDbml(tableOnly, { date: DATE });
    expect(out).not.toContain('Groups added');
  });
});

describe('emit (refs)', () => {
  const tables = `Table users { id int [pk] }
Table members { id int [pk] }
Table posts { id int [pk]
  uid int
  eid int }
`;
  const added = () => diff(tables, `${tables}Ref: posts.uid > users.id`);
  const removed = () => diff(`${tables}Ref: posts.uid > users.id`, tables);
  const retargeted = () => diff(
    `${tables}Ref: posts.uid > users.id`,
    `${tables}Ref: posts.uid > members.id`,
  );
  const unresolved = () => diff(
    `${tables}Ref: posts.uid > users.id`,
    `${tables}Ref: posts.uid > members.id
Ref: posts.uid > posts.id`,
  );

  test('emitText reports an added ref instead of "no differences"', () => {
    const out = emitText(added());
    expect(out).not.toBe('No differences found.');
    expect(out).toContain('Ref changes (1):');
    expect(out).toContain('+ posts.uid > users.id');
  });

  test('emitText reports a removed ref', () => {
    expect(emitText(removed())).toContain('- posts.uid > users.id');
  });

  test('emitText reports a retargeted ref', () => {
    const out = emitText(retargeted());
    expect(out).toContain('~ posts.uid now > members.id (was users.id)');
  });

  test('emitText flags an unresolved ref change', () => {
    const out = emitText(unresolved());
    expect(out).toContain('? posts.uid ambiguous:');
  });

  test('emitDbml records ref counts in the summary note', () => {
    const out = emitDbml(retargeted(), { date: DATE });
    expect(out).toContain('Refs retargeted: 1');
  });

  test('emitDbml ref output parses cleanly back through @dbml/core', () => {
    for (const r of [added(), removed(), retargeted(), unresolved()]) {
      const out = emitDbml(r, { date: DATE });
      expect(() => new Parser().parse(out, 'dbmlv2')).not.toThrow();
    }
  });

  test('emitDbml is unchanged for a table-only diff (no refs section)', () => {
    const tableOnly = diff(`Table t { id int [pk] }`, `Table t { id int [pk]
  name varchar(50) }`);
    const out = emitDbml(tableOnly, { date: DATE });
    expect(out).not.toContain('Refs added');
  });
});
