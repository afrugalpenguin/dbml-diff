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
 * Remove dbdiagram-specific top-level blocks (DiagramView, TableGroup) that
 * @dbml/core rejects or that carry no schema information.
 * @param {string} src
 * @returns {string}
 */
function stripDbdiagramExtras(src) {
  let out = src.replace(/^\s*DiagramView[\s\S]*?^\}/gm, '');
  out = out.replace(/^\s*TableGroup[\s\S]*?^\}/gm, '');
  return out;
}

/**
 * Parse DBML text into a normalised table model.
 *
 * Primary keys are detected both from inline `[pk]` attributes and from
 * `Indexes { Col [pk] }` blocks.
 * @param {string} text DBML source
 * @returns {Map<string, Table>} Tables keyed by fully-qualified name
 */
function parseSchema(text) {
  const db = new Parser().parse(stripDbdiagramExtras(text), 'dbmlv2');
  const tables = new Map();
  for (const schema of db.schemas) {
    for (const t of schema.tables) {
      const fq = schema.name && schema.name !== 'public' ? `${schema.name}.${t.name}` : t.name;
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
  return tables;
}

module.exports = { stripDbdiagramExtras, parseSchema };
