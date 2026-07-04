'use strict';

/**
 * @typedef {import('./diff').DiffResult} DiffResult
 */

const PREFIX = { added: 'NEW · ', modified: 'MOD · ', removed: 'DEL · ' };
const COLORS = { added: '#2ecc71', modified: '#f39c12', removed: '#e74c3c' };

const esc = (s) => s.replace(/'/g, "\\'");
const attrs = (l) => (l.length ? ` [${l.join(', ')}]` : '');

/** Format a ref endpoint as `table.col` (or `table.(c1, c2)` for composites). */
const endpoint = (ep) =>
  `${ep.table}.${ep.columns.length > 1 ? `(${ep.columns.join(', ')})` : ep.columns[0]}`;
const refSig = (r) => `${endpoint(r.from)} > ${endpoint(r.to)}`;

function emitColumn(name, type, opts = {}) {
  const a = [];
  if (opts.pk) a.push('pk');
  if (opts.notNull && !opts.pk) a.push('not null');
  if (opts.note) a.push(`note: '${esc(opts.note)}'`);
  const quoted = /[^A-Za-z0-9_]/.test(name) || name.includes('__') ? `"${name}"` : name;
  return `  ${quoted} ${type}${attrs(a)}`;
}

function emitEnumValue(name, noteText) {
  const quoted = /[^A-Za-z0-9_]/.test(name) ? `"${name}"` : name;
  const note = noteText ? ` [note: '${esc(noteText)}']` : '';
  return `  ${quoted}${note}`;
}

/**
 * Render a diff result as an annotated DBML document that renders as a
 * visual diff in dbdiagram.io.
 * @param {DiffResult} result
 * @param {Object} [opts]
 * @param {string} [opts.oldLabel='old'] Label for the old schema in the header
 * @param {string} [opts.newLabel='new'] Label for the new schema in the header
 * @param {boolean} [opts.fullNewTables=false] Emit full column lists for added
 *   tables instead of a PK stub with a column count
 * @param {boolean} [opts.colors=false] Add [headercolor: ...] annotations
 *   alongside the name prefixes (requires dbdiagram paid tier to render)
 * @param {Date|string} [opts.date] Generation date for the header (defaults to today)
 * @returns {string} DBML source
 */
function emitDbml(result, opts = {}) {
  const oldLabel = opts.oldLabel || 'old';
  const newLabel = opts.newLabel || 'new';
  const fullNewTables = !!opts.fullNewTables;
  const colors = !!opts.colors;
  const stamp = (opts.date ? new Date(opts.date) : new Date()).toISOString().slice(0, 10);
  const header = (kind) => (colors ? ` [headercolor: ${COLORS[kind]}]` : '');
  const { added, removed, modified } = result.tables;
  const enums = result.enums || { added: [], removed: [], modified: [] };
  const enumsChanged = enums.added.length || enums.removed.length || enums.modified.length;
  const refs = result.refs || { added: [], removed: [], retargeted: [], unresolved: [] };
  const refsChanged = refs.added.length || refs.removed.length ||
    refs.retargeted.length || refs.unresolved.length;

  const L = [];
  L.push(`/*`, `  SCHEMA DIFF (generated ${stamp})`, `  ${oldLabel}  ->  ${newLabel}`, ``,
    `  Table prefixes : NEW · / MOD · / DEL ·`,
    `  Column suffixes: __ADDED / __REMOVED / __RENAMED / __CHANGED`,
    `  MOD tables show only the primary key + changed columns.`, `*/`, ``);

  L.push(`Note diff_summary {`, `  '''`,
    `  ## Schema diff: ${oldLabel} -> ${newLabel}`,
    `  - Tables added: ${added.length}`,
    `  - Tables removed: ${removed.length}`,
    `  - Tables modified: ${modified.length}`);
  if (enumsChanged) {
    L.push(`  - Enums added: ${enums.added.length}`,
      `  - Enums removed: ${enums.removed.length}`,
      `  - Enums modified: ${enums.modified.length}`);
  }
  if (refsChanged) {
    L.push(`  - Refs added: ${refs.added.length}`,
      `  - Refs removed: ${refs.removed.length}`,
      `  - Refs retargeted: ${refs.retargeted.length}`,
      `  - Refs unresolved: ${refs.unresolved.length}`);
  }
  if (added.length) L.push(`\n  **Added**: ${added.map((t) => t.name).join(', ')}`);
  if (removed.length) L.push(`\n  **Removed**: ${removed.map((t) => t.name).join(', ')}`);
  if (modified.length) L.push(`\n  **Modified**: ${modified.map((m) => m.name).join(', ')}`);
  if (refsChanged) {
    const lines = [
      ...refs.added.map((r) => `  + ${refSig(r)}`),
      ...refs.removed.map((r) => `  - ${refSig(r)}`),
      ...refs.retargeted.map((r) => `  ~ ${endpoint(r.from)} now > ${endpoint(r.newTo)} (was ${endpoint(r.oldTo)})`),
      ...refs.unresolved.map((r) => `  ? ${endpoint(r.from)} ambiguous`),
    ];
    L.push(`\n  **Ref changes**:`, ...lines);
  }
  L.push(`  '''`, `}`, ``);

  if (modified.length) {
    L.push(`////////// MODIFIED TABLES //////////`);
    for (const m of modified) {
      L.push(``, `Table "${PREFIX.modified}${m.name}"${header('modified')} {`);
      const pk = m.columns.find((c) => c.pk);
      if (pk) L.push(emitColumn(pk.name, pk.type, { pk: true, note: 'unchanged columns omitted' }));
      for (const c of m.columnsAdded)
        L.push(emitColumn(`${c.name}__ADDED`, c.type, { notNull: c.notNull, note: 'ADDED' }));
      for (const c of m.columnsRemoved)
        L.push(emitColumn(`${c.name}__REMOVED`, c.type, { note: 'REMOVED' }));
      for (const r of m.renames)
        L.push(emitColumn(`${r.to.name}__RENAMED`, r.to.type, { notNull: r.to.notNull, note: `RENAMED from ${r.from.name} (heuristic - verify)` }));
      for (const ch of m.columnsChanged)
        L.push(emitColumn(`${ch.column.name}__CHANGED`, ch.column.type, { notNull: ch.column.notNull, note: `CHANGED: ${ch.changes.join('; ')}` }));
      L.push(`}`);
    }
    L.push(``);
  }

  if (added.length) {
    L.push(`////////// ADDED TABLES //////////`);
    for (const t of added) {
      L.push(``, `Table "${PREFIX.added}${t.name}"${header('added')} {`);
      if (fullNewTables) {
        let first = true;
        for (const c of t.columns) {
          L.push(emitColumn(c.name, c.type, { pk: c.pk, notNull: c.notNull, note: first ? 'NEW TABLE' : c.note }));
          first = false;
        }
      } else {
        const stub = t.columns.find((c) => c.pk) || t.columns[0];
        if (stub) L.push(emitColumn(stub.name, stub.type, { pk: stub.pk, notNull: stub.notNull, note: `NEW TABLE - ${t.columns.length} columns` }));
      }
      L.push(`}`);
    }
    L.push(``);
  }

  if (removed.length) {
    L.push(`////////// REMOVED TABLES //////////`);
    for (const t of removed) {
      L.push(``, `Table "${PREFIX.removed}${t.name}"${header('removed')} {`);
      let first = true;
      for (const c of t.columns) {
        L.push(emitColumn(c.name, c.type, { pk: c.pk, notNull: c.notNull, note: first ? 'TABLE REMOVED' : null }));
        first = false;
      }
      L.push(`}`);
    }
    L.push(``);
  }

  if (enumsChanged) {
    L.push(`////////// ENUMS //////////`);
    for (const en of enums.modified) {
      L.push(``, `Enum "${PREFIX.modified}${en.name}" {`);
      const addedSet = new Set(en.valuesAdded);
      for (const v of en.values) L.push(emitEnumValue(v, addedSet.has(v) ? 'ADDED' : null));
      for (const v of en.valuesRemoved) L.push(emitEnumValue(v, 'REMOVED'));
      L.push(`}`);
    }
    for (const en of enums.added) {
      L.push(``, `Enum "${PREFIX.added}${en.name}" {`);
      let first = true;
      for (const v of en.values) { L.push(emitEnumValue(v, first ? 'NEW ENUM' : null)); first = false; }
      L.push(`}`);
    }
    for (const en of enums.removed) {
      L.push(``, `Enum "${PREFIX.removed}${en.name}" {`);
      let first = true;
      for (const v of en.values) { L.push(emitEnumValue(v, first ? 'ENUM REMOVED' : null)); first = false; }
      L.push(`}`);
    }
    L.push(``);
  }

  return L.join('\n');
}

/**
 * Render a diff result as a human-readable text summary.
 * @param {DiffResult} result
 * @returns {string}
 */
function emitText(result) {
  const { added, removed, modified } = result.tables;
  const enums = result.enums || { added: [], removed: [], modified: [] };
  const refs = result.refs || { added: [], removed: [], retargeted: [], unresolved: [] };
  const refsChanged = refs.added.length || refs.removed.length ||
    refs.retargeted.length || refs.unresolved.length;
  const anyChange = added.length || removed.length || modified.length ||
    enums.added.length || enums.removed.length || enums.modified.length || refsChanged;
  if (!anyChange) return 'No differences found.';
  const colDesc = (c) => `${c.name} ${c.type}${c.notNull ? ' NOT NULL' : ''}`;
  const L = [];
  if (added.length) {
    L.push(`Added tables (${added.length}):`);
    for (const t of added) L.push(`  + ${t.name} (${t.columns.length} columns)`);
  }
  if (removed.length) {
    if (L.length) L.push('');
    L.push(`Removed tables (${removed.length}):`);
    for (const t of removed) L.push(`  - ${t.name} (${t.columns.length} columns)`);
  }
  if (modified.length) {
    if (L.length) L.push('');
    L.push(`Modified tables (${modified.length}):`);
    for (const m of modified) {
      L.push(`  ~ ${m.name}`);
      for (const c of m.columnsAdded) L.push(`      + column ${colDesc(c)}`);
      for (const c of m.columnsRemoved) L.push(`      - column ${colDesc(c)}`);
      for (const r of m.renames) L.push(`      ~ rename? ${r.from.name} -> ${r.to.name} (heuristic - verify)`);
      for (const ch of m.columnsChanged) L.push(`      ~ column ${ch.column.name}: ${ch.changes.join('; ')}`);
    }
  }
  if (enums.added.length) {
    if (L.length) L.push('');
    L.push(`Added enums (${enums.added.length}):`);
    for (const e of enums.added) L.push(`  + ${e.name} (${e.values.join(', ')})`);
  }
  if (enums.removed.length) {
    if (L.length) L.push('');
    L.push(`Removed enums (${enums.removed.length}):`);
    for (const e of enums.removed) L.push(`  - ${e.name} (${e.values.join(', ')})`);
  }
  if (enums.modified.length) {
    if (L.length) L.push('');
    L.push(`Modified enums (${enums.modified.length}):`);
    for (const m of enums.modified) {
      L.push(`  ~ ${m.name}`);
      for (const v of m.valuesAdded) L.push(`      + value ${v}`);
      for (const v of m.valuesRemoved) L.push(`      - value ${v}`);
    }
  }
  if (refsChanged) {
    if (L.length) L.push('');
    const total = refs.added.length + refs.removed.length +
      refs.retargeted.length + refs.unresolved.length;
    L.push(`Ref changes (${total}):`);
    for (const r of refs.added) L.push(`  + ${refSig(r)}`);
    for (const r of refs.removed) L.push(`  - ${refSig(r)}`);
    for (const r of refs.retargeted)
      L.push(`  ~ ${endpoint(r.from)} now > ${endpoint(r.newTo)} (was ${endpoint(r.oldTo)})`);
    for (const r of refs.unresolved) {
      const was = r.oldTargets.map(endpoint).join(', ') || '(none)';
      const now = r.newTargets.map(endpoint).join(', ') || '(none)';
      L.push(`  ? ${endpoint(r.from)} ambiguous: was ${was}, now ${now}`);
    }
  }
  return L.join('\n');
}

/**
 * Render a diff result as pretty-printed JSON.
 * @param {DiffResult} result
 * @returns {string}
 */
function emitJson(result) {
  return JSON.stringify(result, null, 2);
}

module.exports = { emitDbml, emitText, emitJson, PREFIX, COLORS };
