'use strict';

const { Parser } = require('@dbml/core');

/**
 * @typedef {Object} Column
 * @property {string} name
 * @property {string} type Raw type name, e.g. "NVARCHAR(200)"
 * @property {boolean} notNull
 * @property {boolean} pk
 * @property {string|null} note
 */

/**
 * @typedef {Object} Table
 * @property {string} name Fully-qualified name (schema-prefixed unless the schema is "public")
 * @property {Map<string, Column>} cols Columns keyed by name, in declaration order
 */

/**
 * @typedef {Object} EnumDef
 * @property {string} name Fully-qualified name (schema-prefixed unless the schema is "public")
 * @property {string[]} values Value names, in declaration order
 */

/**
 * @typedef {Object} GroupDef
 * @property {string} name Fully-qualified group name
 * @property {string[]} tables Member table names (fully-qualified, sorted)
 */

/**
 * @typedef {Object} RefEndpoint
 * @property {string} table Fully-qualified table name
 * @property {string[]} columns Referenced column names
 */

/**
 * @typedef {Object} RefDef
 * @property {RefEndpoint} from The many/child (FK) side (relation `*`)
 * @property {RefEndpoint} to The one/parent side (relation `1`)
 */

/**
 * @typedef {Object} Schema
 * @property {Map<string, Table>} tables Tables keyed by fully-qualified name
 * @property {Map<string, EnumDef>} enums Enums keyed by fully-qualified name
 * @property {Map<string, RefDef>} refs Relationships keyed by canonical signature
 * @property {Map<string, GroupDef>} groups TableGroups keyed by fully-qualified name
 */

/**
 * Remove dbdiagram-specific `DiagramView` top-level blocks, which @dbml/core
 * rejects. `TableGroup` blocks are kept and parsed for group-membership diffing.
 * @param {string} src
 * @returns {string}
 */
function stripDbdiagramExtras(src) {
  // Brace-match each DiagramView block rather than stopping at the first
  // column-0 `}`: an indented block (closing brace not at column 0) would
  // otherwise let a lazy `^\}` run on and swallow a following table.
  let s = src;
  for (;;) {
    const m = s.match(/^[ \t]*DiagramView\b[^\n]*/m);
    if (!m) break;
    const open = s.indexOf('{', m.index);
    if (open === -1) break; // no body; leave as-is to avoid an infinite loop
    let depth = 0;
    let end = -1;
    for (let i = open; i < s.length; i++) {
      if (s[i] === '{') depth++;
      else if (s[i] === '}' && --depth === 0) { end = i + 1; break; }
    }
    if (end === -1) break; // unbalanced; leave the rest untouched
    s = s.slice(0, m.index) + s.slice(end);
  }
  return s;
}

/**
 * Parse DBML text into a normalised table model.
 *
 * Primary keys are detected both from inline `[pk]` attributes and from
 * `Indexes { Col [pk] }` blocks.
 * @param {string} text DBML source
 * @returns {Schema} Parsed tables and enums, each keyed by fully-qualified name
 */
function parseSchema(text) {
  const db = new Parser().parse(stripDbdiagramExtras(text), 'dbmlv2');
  const tables = new Map();
  const enums = new Map();
  const groups = new Map();
  const refs = new Map();
  const qualifyName = (schemaName, name) =>
    schemaName && schemaName !== 'public' ? `${schemaName}.${name}` : name;
  const qualify = (schema, name) => qualifyName(schema.name, name);
  const epStr = (e) => `${e.table}(${e.columns.join(',')})`;
  for (const schema of db.schemas) {
    for (const e of (schema.enums || [])) {
      const fq = qualify(schema, e.name);
      enums.set(fq, { name: fq, values: e.values.map((v) => v.name) });
    }
    for (const g of (schema.tableGroups || [])) {
      const fq = qualify(schema, g.name);
      const members = (g.tables || [])
        .map((m) => qualifyName(m.schema && m.schema.name, m.name))
        .sort();
      groups.set(fq, { name: fq, tables: members });
    }
    for (const r of (schema.refs || [])) {
      const eps = r.endpoints.map((ep) => ({
        table: qualifyName(ep.schemaName, ep.tableName),
        columns: [...ep.fieldNames],
        relation: ep.relation,
      }));
      if (eps.length !== 2) continue;
      const [a, b] = eps;
      let from;
      let to;
      if (a.relation === '*' && b.relation === '1') { [from, to] = [a, b]; }
      else if (a.relation === '1' && b.relation === '*') { [from, to] = [b, a]; }
      else { [from, to] = epStr(a) <= epStr(b) ? [a, b] : [b, a]; }
      const key = `${epStr(from)} > ${epStr(to)}`;
      refs.set(key, {
        from: { table: from.table, columns: from.columns },
        to: { table: to.table, columns: to.columns },
      });
    }
    for (const t of schema.tables) {
      const fq = qualify(schema, t.name);
      const pkCols = new Set();
      for (const idx of (t.indexes || [])) {
        if (idx.pk) for (const c of idx.columns) pkCols.add(c.value);
      }
      const cols = new Map();
      for (const f of t.fields) {
        const note = f.note && typeof f.note === 'object' ? f.note.value : f.note;
        cols.set(f.name, {
          name: f.name,
          type: f.type.type_name,
          notNull: !!f.not_null,
          pk: !!f.pk || pkCols.has(f.name),
          note: note || null,
        });
      }
      tables.set(fq, { name: fq, cols });
    }
  }
  return { tables, enums, refs, groups };
}

module.exports = { stripDbdiagramExtras, parseSchema };
