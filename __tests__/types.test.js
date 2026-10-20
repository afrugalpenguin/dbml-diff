'use strict';

// The committed emitJson snapshots in typecheck/ are what tsc checks against
// lib/index.d.ts (see typecheck/check.ts). This keeps them equal to the live
// output, so the type check is always run on what the code really emits.
// Regenerate with `npm run types:fixtures` when the output changes on purpose.

const fs = require('fs');
const path = require('path');
const { PAIRS, OUT_DIR, render } = require('../scripts/build-type-fixtures');

describe('committed type-check fixtures match live emitJson output', () => {
  test.each(PAIRS)('%s -> %s (%s)', (oldFile, newFile, outFile) => {
    const committed = JSON.parse(fs.readFileSync(path.join(OUT_DIR, outFile), 'utf8'));
    expect(committed).toEqual(JSON.parse(render([oldFile, newFile])));
  });

  // tsc alone cannot catch a missing "types" field: it falls back to the
  // .d.ts beside "main". Modern resolution reads only "exports" when it
  // exists, so an exports map must carry a "types" condition, listed first.
  test('package.json points TypeScript at lib/index.d.ts', () => {
    const pkg = require('../package.json');
    expect(pkg.types).toBe('lib/index.d.ts');
    expect(fs.existsSync(path.join(__dirname, '..', pkg.types))).toBe(true);
    expect(pkg.files).toContain('lib');
    if (pkg.exports) {
      const root = pkg.exports['.'] || pkg.exports;
      expect(Object.keys(root)[0]).toBe('types');
    }
  });

  test('types-a -> types-b covers every variant of the result shape', () => {
    const r = JSON.parse(render(['types-a.dbml', 'types-b.dbml']));
    const variants = {
      tables: ['added', 'removed', 'modified'],
      enums: ['added', 'removed', 'modified'],
      refs: ['added', 'removed', 'retargeted', 'unresolved'],
      groups: ['added', 'removed', 'modified'],
    };
    for (const [cat, kinds] of Object.entries(variants)) {
      for (const kind of kinds) expect([cat, kind, r[cat][kind].length > 0]).toEqual([cat, kind, true]);
    }
    const mods = r.tables.modified;
    for (const field of ['columnsAdded', 'columnsRemoved', 'columnsChanged', 'renames']) {
      expect([field, mods.some((m) => m[field].length > 0)]).toEqual([field, true]);
    }
    expect(mods.some((m) => m.columns.some((c) => typeof c.note === 'string'))).toBe(true);
  });
});
