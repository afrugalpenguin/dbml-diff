'use strict';

const fs = require('fs');
const path = require('path');
const { Parser } = require('@dbml/core');
const { diff, emitText, emitJson, emitDbml } = require('../lib');

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
