// Type test, run by `npm test` (tsc -p tsconfig.types.json). Checks the
// committed emitJson output of each fixture against the declared DiffResult
// in both directions: assignability catches missing or mistyped fields, and
// NoExtraKeys catches fields the output has but the declarations lack.
// The JSON files are kept equal to live output by __tests__/types.test.js.

// Resolved through package.json "types" (paths maps the name to the repo root).
import type { DiffResult } from 'dbml-diff';
import { diff, emitText, emitJson, emitDbml, emitD2, emitMigration, renderSvg } from 'dbml-diff';

import typesAB = require('./types-a-types-b.json');
import v1v2 = require('./v1-v2.json');
import emptyAB = require('./empty-a-empty-b.json');

// true when T (and everything nested in it) has no key that S lacks.
// Distributes over unions, so every element shape of a JSON array is checked.
type NoExtraKeys<T, S> =
  T extends null ? true
  : T extends readonly (infer E)[]
    ? (S extends readonly (infer SE)[] ? NoExtraKeys<E, SE> : false)
  : T extends object
    ? (S extends object
      ? (Exclude<keyof T, keyof S> extends never
        ? ({ [K in keyof T & keyof S]: NoExtraKeys<T[K], S[K]> }[keyof T & keyof S] extends true ? true : false)
        : false)
      : false)
  : true;
type Assert<T extends true> = T;

const a1: DiffResult = typesAB;
const a2: DiffResult = v1v2;
const a3: DiffResult = emptyAB;
type E1 = Assert<NoExtraKeys<typeof typesAB, DiffResult>>;
type E2 = Assert<NoExtraKeys<typeof v1v2, DiffResult>>;
type E3 = Assert<NoExtraKeys<typeof emptyAB, DiffResult>>;

// The guard itself must reject an undeclared field, or E1-E3 prove nothing.
// @ts-expect-error extra key on a nested column
type Guard = Assert<NoExtraKeys<{ tables: { added: [{ name: string; columns: [{ name: string; extra: 1 }] }] } }, DiffResult>>;

// Every exported function is declared with its current signature.
const r: DiffResult = diff('', '', { includeNotes: true });
const s: string[] = [
  emitText(r),
  emitJson(r),
  emitDbml(r, { oldLabel: 'v1', newLabel: 'v2', colors: true, fullNewTables: true, hideUnchangedPk: true, date: '2026-01-01' }),
  emitD2(r, { oldLabel: 'v1', newLabel: 'v2', fullNewTables: true, hideUnchangedPk: true, date: new Date() }),
  emitMigration(r, { oldLabel: 'v1', newLabel: 'v2', date: '2026-01-01' }),
];
const svg: Promise<string> = renderSvg(r, { sketch: true, scale: 1, oldLabel: 'v1' });

// The variant that bit the web front end: modified groups have no `tables`.
const g = r.groups.modified[0];
// @ts-expect-error modified groups carry tablesAdded/tablesRemoved, not tables
g.tables;

export { a1, a2, a3, s, svg };
export type { E1, E2, E3, Guard };
