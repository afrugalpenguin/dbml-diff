'use strict';

const { changeCounts } = require('./diff');

/**
 * @typedef {import('./diff').DiffResult} DiffResult
 */

const PREFIX = { added: 'NEW · ', modified: 'MOD · ', removed: 'DEL · ' };
const COLORS = { added: '#2ecc71', modified: '#f39c12', removed: '#e74c3c' };

// Escape a value for a single-quoted DBML string: backslashes first (so the
// escapes we add below are not themselves re-escaped), then single quotes, then
// newlines (a raw newline in a single-quoted note is a parse error).
const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r\n|\r|\n/g, '\\n');
const attrs = (l) => (l.length ? ` [${l.join(', ')}]` : '');
/** Count with a correctly pluralised noun: `plural(1, 'column')` -> `1 column`. */
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

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
 * @param {boolean} [opts.hideUnchangedPk=false] Suppress the unchanged
 *   primary-key orientation row in MOD tables for a leaner delta-only view
 * @param {Date|string} [opts.date] Generation date for the header (defaults to today)
 * @returns {string} DBML source
 */
function emitDbml(result, opts = {}) {
  const oldLabel = opts.oldLabel || 'old';
  const newLabel = opts.newLabel || 'new';
  const fullNewTables = !!opts.fullNewTables;
  const colors = !!opts.colors;
  const hideUnchangedPk = !!opts.hideUnchangedPk;
  const stamp = (opts.date ? new Date(opts.date) : new Date()).toISOString().slice(0, 10);
  const header = (kind) => (colors ? ` [headercolor: ${COLORS[kind]}]` : '');
  const { added, removed, modified } = result.tables;
  const { enums, refs, groups } = result;
  const enumsChanged = changeCounts(result).enums;

  const L = [];
  L.push(`/*`, `  SCHEMA DIFF (generated ${stamp})`, `  ${oldLabel}  ->  ${newLabel}`, ``,
    `  Table prefixes : NEW · / MOD · / DEL ·`,
    `  Column suffixes: __ADDED / __REMOVED / __RENAMED / __CHANGED`,
    hideUnchangedPk
      ? `  MOD tables show only the changed columns (unchanged primary key hidden).`
      : `  MOD tables show only the primary key + changed columns.`, `*/`, ``);

  // Summary as a real Table node: dbdiagram renders standalone Note blocks
  // (Sticky Notes) only on paid tiers, but a Table always renders on the free
  // tier. Each metric is a column: label as the name, count as the type, so the
  // numbers show on the canvas without hovering. Affected-table names and ref /
  // group detail are dropped here (still available in --format text / json).
  L.push(`Table "DIFF SUMMARY  ·  ${oldLabel} -> ${newLabel}" {`);
  const row = (label, n) => `  "${label}" "${n}"`;
  const rowIf = (label, n) => { if (n) L.push(row(label, n)); };
  L.push(row('Tables added', added.length),
    row('Tables removed', removed.length),
    row('Tables modified', modified.length));
  rowIf('Enums added', enums.added.length);
  rowIf('Enums removed', enums.removed.length);
  rowIf('Enums modified', enums.modified.length);
  rowIf('Refs added', refs.added.length);
  rowIf('Refs removed', refs.removed.length);
  rowIf('Refs retargeted', refs.retargeted.length);
  rowIf('Refs unresolved', refs.unresolved.length);
  rowIf('Groups added', groups.added.length);
  rowIf('Groups removed', groups.removed.length);
  rowIf('Groups modified', groups.modified.length);
  L.push(`}`, ``);

  if (modified.length) {
    L.push(`////////// MODIFIED TABLES //////////`);
    for (const m of modified) {
      L.push(``, `Table "${PREFIX.modified}${m.name}"${header('modified')} {`);
      // The PK row anchors the block and orients the reader. hideUnchangedPk
      // drops it for a leaner delta-only view; a MOD table always has at least
      // one added/removed/renamed/changed column, so the block stays non-empty
      // and valid DBML without it.
      const pk = m.columns.find((c) => c.pk);
      if (pk && !hideUnchangedPk) L.push(emitColumn(pk.name, pk.type, { pk: true, note: 'unchanged columns omitted' }));
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
        if (stub) L.push(emitColumn(stub.name, stub.type, { pk: stub.pk, notNull: stub.notNull, note: `NEW TABLE - ${plural(t.columns.length, 'column')}` }));
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

// D2 treats a backslash in a quoted string as an escape introducer, so a raw
// one must be doubled first (or a Windows path like `C:\new.dbml` is read as
// having a `\n` newline - D2 then rejects it with "cannot have newlines in
// label"). After that: fold an embedded `"` to `'` (D2 has no escape for it),
// and fold real newlines to a space. Order matters - backslash first, so the
// escaping below is not itself re-escaped. Otherwise D2 imposes no restriction
// on quoted-string contents, so `·`, dots, commas and parens all pass: we own
// the renderer, so there is no grammar to skirt.
const d2q = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, "'").replace(/\r\n|\r|\n/g, ' ')}"`;

/**
 * Render a diff result as a D2 (https://d2lang.com) diagram source. This is a
 * pure text emitter with no dependency on the D2 renderer: `--format d2` emits
 * exactly this, and `--format svg` is this plus a render step (see
 * `renderSvg`). Same information as `emitDbml`, arranged for D2's `sql_table`
 * shape and a `grid` layout so the (relationship-free, hence disconnected)
 * tables stay a compact block instead of one wide row.
 * @param {DiffResult} result
 * @param {Object} [opts]
 * @param {string} [opts.oldLabel='old']
 * @param {string} [opts.newLabel='new']
 * @param {boolean} [opts.fullNewTables=false] Emit full column lists for added
 *   tables instead of a PK stub with a column count
 * @param {boolean} [opts.hideUnchangedPk=false] Suppress the unchanged
 *   primary-key orientation row in modified tables
 * @param {Date|string} [opts.date] Generation date for the header comment
 * @returns {string} D2 source
 */
function emitD2(result, opts = {}) {
  const oldLabel = opts.oldLabel || 'old';
  const newLabel = opts.newLabel || 'new';
  const fullNewTables = !!opts.fullNewTables;
  const hideUnchangedPk = !!opts.hideUnchangedPk;
  const stamp = (opts.date ? new Date(opts.date) : new Date()).toISOString().slice(0, 10);
  const { added, removed, modified } = result.tables;
  const { enums, refs, groups } = result;
  const cc = changeCounts(result);

  const L = [];
  L.push(`# SCHEMA DIFF (generated ${stamp})`,
    `#   ${oldLabel}  ->  ${newLabel}`,
    `#   header fill: green added / amber modified / red removed`,
    `#   row prefix : + added  - removed  ~ changed  ? rename candidate`);

  // A shape id must be unique; table names are not (two schemas, same name in
  // different roles never collide here, but the id must still be a safe key).
  // Use a numbered key and put the real name in the rendered `label`, so the
  // display name is free to carry `·`, dots and spaces.
  let n = 0;
  const table = (displayName, kind, rows) => {
    const id = `t${++n}`;
    L.push(``, `${id}: {`,
      `  shape: sql_table`,
      `  label: ${d2q(displayName)}`,
      `  style.fill: "${COLORS[kind]}"`);
    for (const r of rows) L.push(r);
    L.push(`}`);
  };
  // A row is `key: type`, with an optional constraint badge and a tooltip
  // carrying the change detail. The key must be unique within a table, so the
  // marker prefix (which is always distinct per column anyway) rides in it.
  const row = (name, type, { pk = false, tip = null } = {}) => {
    const con = pk ? ' {constraint: primary_key}' : '';
    const tt = tip ? `${d2q(name)}.tooltip: ${d2q(tip)}` : null;
    return `  ${d2q(name)}: ${d2q(type || '')}${con}` + (tt ? `\n  ${tt}` : '');
  };

  // Summary as its own sql_table so the counts show on the canvas, mirroring the
  // dbml DIFF SUMMARY table. Neutral fill - it is not a schema object.
  {
    const id = `t${++n}`;
    L.push(``, `${id}: {`, `  shape: sql_table`, `  label: ${d2q(`DIFF SUMMARY: ${oldLabel} -> ${newLabel}`)}`);
    const line = (k, v) => L.push(`  ${d2q(k)}: ${d2q(String(v))}`);
    const lineIf = (k, v) => { if (v) line(k, v); };
    line('Tables added', added.length);
    line('Tables removed', removed.length);
    line('Tables modified', modified.length);
    lineIf('Enums added', enums.added.length);
    lineIf('Enums removed', enums.removed.length);
    lineIf('Enums modified', enums.modified.length);
    lineIf('Refs added', refs.added.length);
    lineIf('Refs removed', refs.removed.length);
    lineIf('Refs retargeted', refs.retargeted.length);
    lineIf('Refs unresolved', refs.unresolved.length);
    lineIf('Groups added', groups.added.length);
    lineIf('Groups removed', groups.removed.length);
    lineIf('Groups modified', groups.modified.length);
    L.push(`}`);
  }

  for (const m of modified) {
    const rows = [];
    const pk = m.columns.find((c) => c.pk);
    if (pk && !hideUnchangedPk) rows.push(row(pk.name, pk.type, { pk: true }));
    for (const c of m.columnsAdded)
      rows.push(row(`+ ${c.name}`, c.type, { tip: c.notNull ? 'added, not null' : 'added' }));
    for (const c of m.columnsRemoved)
      rows.push(row(`- ${c.name}`, c.type, { tip: 'removed' }));
    for (const r of m.renames)
      rows.push(row(`? ${r.to.name}`, r.to.type, { tip: `rename candidate from ${r.from.name} (heuristic - verify)` }));
    for (const ch of m.columnsChanged)
      rows.push(row(`~ ${ch.column.name}`, ch.column.type, { tip: ch.changes.join('; ') }));
    table(`${PREFIX.modified}${m.name}`, 'modified', rows);
  }

  for (const t of added) {
    const rows = [];
    if (fullNewTables) {
      for (const c of t.columns) rows.push(row(c.name, c.type, { pk: c.pk, tip: c.note || null }));
    } else {
      const stub = t.columns.find((c) => c.pk) || t.columns[0];
      if (stub) rows.push(row(stub.name, stub.type, { pk: stub.pk }));
      rows.push(row(`+ ${plural(t.columns.length, 'column')} total`, '', { tip: 'new table' }));
    }
    table(`${PREFIX.added}${t.name}`, 'added', rows);
  }

  for (const t of removed) {
    const rows = t.columns.map((c) => row(c.name, c.type, { pk: c.pk }));
    table(`${PREFIX.removed}${t.name}`, 'removed', rows);
  }

  // Make the root board a grid so the disconnected tables tile into a roughly
  // square block instead of one wide row. ceil(sqrt(n)) columns keeps width and
  // height balanced at any size. n is the real shape count (tables + summary).
  const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
  return `grid-columns: ${cols}\n${L.join('\n')}`;
}

/**
 * Render a diff result as a human-readable text summary.
 * @param {DiffResult} result
 * @returns {string}
 */
function emitText(result) {
  const { added, removed, modified } = result.tables;
  const { enums, refs, groups } = result;
  const cc = changeCounts(result);
  if (!cc.total) return 'No differences found.';
  const colDesc = (c) => `${c.name} ${c.type}${c.notNull ? ' NOT NULL' : ''}`;
  const L = ['Legend: + added   - removed   ~ modified'];
  if (added.length) {
    if (L.length) L.push('');
    L.push(`Added tables (${added.length}):`);
    for (const t of added) L.push(`  + ${t.name} (${plural(t.columns.length, 'column')})`);
  }
  if (removed.length) {
    if (L.length) L.push('');
    L.push(`Removed tables (${removed.length}):`);
    for (const t of removed) L.push(`  - ${t.name} (${plural(t.columns.length, 'column')})`);
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
  if (cc.refs) {
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
  if (cc.groups) {
    if (L.length) L.push('');
    const total = groups.added.length + groups.removed.length + groups.modified.length;
    L.push(`Group changes (${total}):`);
    for (const g of groups.added) L.push(`  + ${g.name} (${g.tables.join(', ')})`);
    for (const g of groups.removed) L.push(`  - ${g.name}`);
    for (const g of groups.modified) {
      L.push(`  ~ ${g.name}`);
      for (const t of g.tablesAdded) L.push(`      + table ${t}`);
      for (const t of g.tablesRemoved) L.push(`      - table ${t}`);
    }
  }
  return L.join('\n');
}

/** Escape a `]` inside a bracket-quoted T-SQL identifier by doubling it. */
const escId = (id) => String(id).replace(/]/g, ']]');
/** Quote a fully-qualified T-SQL name: `sales.orders` -> `[sales].[orders]`. */
const qname = (name) => name.split('.').map((p) => `[${escId(p)}]`).join('.');
/** Quote a bare identifier: `col` -> `[col]`. */
const qid = (id) => `[${escId(id)}]`;
/**
 * Render a column's type + nullability for DDL. PK columns must be NOT NULL
 * regardless of the DBML flag, so callers pass forceNotNull for them.
 */
const colType = (c, forceNotNull) => `${c.type} ${c.notNull || forceNotNull ? 'NOT NULL' : 'NULL'}`;
/** Bare (unqualified) table name: `dbo.Orders` -> `Orders`. */
const bareName = (fq) => fq.split('.').pop();
/** Synthesized FK constraint name: FK_<child>_<parent>_<childCols>. */
const fkName = (from, to) => `FK_${bareName(from.table)}_${bareName(to.table)}_${from.columns.join('_')}`;
/** T-SQL FK reference clause. */
const fkClause = (from, to) =>
  `FOREIGN KEY (${from.columns.map(qid).join(', ')}) REFERENCES ${qname(to.table)} (${to.columns.map(qid).join(', ')})`;

/**
 * Render a diff result as a T-SQL migration script. Destructive (DROP) and
 * heuristic (rename) statements are emitted commented out.
 * @param {DiffResult} result
 * @param {Object} [opts]
 * @param {string} [opts.oldLabel='old']
 * @param {string} [opts.newLabel='new']
 * @param {Date|string} [opts.date] Defaults to today.
 * @returns {string} T-SQL source
 */
function emitMigration(result, opts = {}) {
  const oldLabel = opts.oldLabel || 'old';
  const newLabel = opts.newLabel || 'new';
  const stamp = (opts.date ? new Date(opts.date) : new Date()).toISOString().slice(0, 10);
  const { added, removed, modified } = result.tables;
  const { refs } = result;
  const cc = changeCounts(result);
  // Migration ignores enums and groups (not represented in SQL), so its no-op
  // guard looks only at table and ref changes, not cc.total.
  if (!cc.tables && !cc.refs) {
    return '-- No schema changes.';
  }

  const L = [];
  L.push(
    `-- Schema migration: ${oldLabel} -> ${newLabel}`,
    `-- Generated by dbml-diff on ${stamp}`,
    `-- Dialect: T-SQL (SQL Server / Synapse)`,
    `-- WARNING: destructive (DROP) and heuristic (RENAME) statements are commented`,
    `--          out below. Review and uncomment deliberately.`,
    `-- Enums and TableGroups are not represented in SQL.`,
    ``
  );

  for (const t of added) {
    L.push(`-- === table ${qname(t.name)} (added) ===`);
    const lines = t.columns.map((c) => `  ${qid(c.name)} ${colType(c, c.pk)}`);
    const pks = t.columns.filter((c) => c.pk).map((c) => qid(c.name));
    if (pks.length) {
      lines.push(`  CONSTRAINT ${qid(`PK_${bareName(t.name)}`)} PRIMARY KEY (${pks.join(', ')})`);
    }
    L.push(`CREATE TABLE ${qname(t.name)} (`, lines.join(',\n'), `);`, ``);
  }

  for (const m of modified) {
    L.push(`-- === table ${qname(m.name)} (modified) ===`);
    for (const c of m.columnsAdded) {
      const warn = c.notNull ? ' -- NOTE: fails on non-empty table without a default' : '';
      L.push(`ALTER TABLE ${qname(m.name)} ADD ${qid(c.name)} ${colType(c)};${warn}`);
    }
    for (const ch of m.columnsChanged) {
      const becamePk = ch.changes.includes('became PK');
      const droppedPk = ch.changes.includes('no longer PK');
      // T-SQL cannot add or drop PK membership via ALTER COLUMN, and a note is
      // not a DDL attribute, so a change that is *only* a PK-membership flip or
      // a note edit has no type/nullability statement.
      const nonAlter = new Set(['became PK', 'no longer PK', 'note changed']);
      const alterable = ch.changes.filter((c) => !nonAlter.has(c));
      if (alterable.length) {
        const tightensNull = alterable.includes('was nullable, now NOT NULL');
        const warn = tightensNull ? ' -- NOTE: fails if the column contains NULLs' : '';
        // A column that is now a PK must be NOT NULL, never rendered as NULL.
        L.push(`ALTER TABLE ${qname(m.name)} ALTER COLUMN ${qid(ch.column.name)} ${colType(ch.column, becamePk)};${warn}`);
      }
      // PK-membership changes are destructive/blocking on large tables, so emit
      // the constraint change commented out per the existing safety convention.
      if (becamePk) {
        L.push(`-- ALTER TABLE ${qname(m.name)} ADD CONSTRAINT ${qid(`PK_${bareName(m.name)}`)} PRIMARY KEY (${qid(ch.column.name)});`);
      } else if (droppedPk) {
        L.push(`-- ALTER TABLE ${qname(m.name)} DROP CONSTRAINT ${qid(`PK_${bareName(m.name)}`)};`);
      }
    }
    for (const r of m.renames) {
      L.push(`-- RENAME (heuristic - verify before running):`);
      L.push(`-- EXEC sp_rename '${m.name}.${r.from.name}', '${r.to.name}', 'COLUMN';`);
    }
    for (const c of m.columnsRemoved) {
      L.push(`-- ALTER TABLE ${qname(m.name)} DROP COLUMN ${qid(c.name)};`);
    }
    L.push(``);
  }

  if (cc.refs) {
    L.push(`-- === foreign keys ===`);
    if (refs.removed.length || refs.retargeted.length) {
      L.push(`-- DROP CONSTRAINT uses a synthesized name; adjust it to the actual constraint`);
      L.push(`-- name in your database before uncommenting.`);
    }
    for (const r of refs.added) {
      L.push(`ALTER TABLE ${qname(r.from.table)} ADD CONSTRAINT ${qid(fkName(r.from, r.to))} ${fkClause(r.from, r.to)}; -- NOTE: fails if existing rows violate it`);
    }
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
    L.push(``);
  }

  for (const t of removed) {
    L.push(`-- === table ${qname(t.name)} (removed) ===`);
    L.push(`-- DROP TABLE ${qname(t.name)};`, ``);
  }

  return L.join('\n').replace(/\n+$/, '');
}

/**
 * Render a diff result as pretty-printed JSON.
 * @param {DiffResult} result
 * @returns {string}
 */
function emitJson(result) {
  return JSON.stringify(result, null, 2);
}

module.exports = { emitDbml, emitD2, emitText, emitJson, emitMigration, PREFIX, COLORS };
