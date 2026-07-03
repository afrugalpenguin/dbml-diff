'use strict';

const { parseSchema } = require('./parse');

/**
 * @typedef {import('./parse').Column} Column
 * @typedef {import('./parse').Table} Table
 */

/**
 * @typedef {Object} ColumnChange
 * @property {Column} column The column as it appears in the new schema
 * @property {string[]} changes Human-readable change descriptions
 */

/**
 * @typedef {Object} RenameCandidate
 * @property {Column} from Column removed from the old schema
 * @property {Column} to Column added in the new schema
 */

/**
 * @typedef {Object} TableEntry
 * @property {string} name
 * @property {Column[]} columns
 */

/**
 * @typedef {Object} ModifiedTable
 * @property {string} name
 * @property {Column[]} columns Full column list of the table in the new schema
 * @property {Column[]} columnsAdded
 * @property {Column[]} columnsRemoved
 * @property {ColumnChange[]} columnsChanged
 * @property {RenameCandidate[]} renames Heuristic candidates only, never merged silently
 */

/**
 * @typedef {Object} DiffResult
 * @property {{ added: TableEntry[], removed: TableEntry[], modified: ModifiedTable[] }} tables
 * @property {{ added: number, removed: number, modified: number }} counts
 */

const colSig = (c) => `${c.type.toLowerCase()}|${c.notNull ? 1 : 0}`;

/**
 * Structurally compare two parsed table models.
 * @param {Map<string, Table>} oldTables
 * @param {Map<string, Table>} newTables
 * @returns {DiffResult}
 */
function diffTables(oldTables, newTables) {
  const added = [];
  const removed = [];
  const modified = [];
  for (const [name, t] of newTables) {
    if (!oldTables.has(name)) added.push({ name, columns: [...t.cols.values()] });
  }
  for (const [name, t] of oldTables) {
    if (!newTables.has(name)) removed.push({ name, columns: [...t.cols.values()] });
  }
  for (const [name, nt] of newTables) {
    if (!oldTables.has(name)) continue;
    const ot = oldTables.get(name);
    const columnsAdded = [];
    const columnsRemoved = [];
    const columnsChanged = [];
    for (const [cn, c] of nt.cols) if (!ot.cols.has(cn)) columnsAdded.push(c);
    for (const [cn, c] of ot.cols) if (!nt.cols.has(cn)) columnsRemoved.push(c);
    for (const [cn, nc] of nt.cols) {
      if (!ot.cols.has(cn)) continue;
      const oc = ot.cols.get(cn);
      const changes = [];
      if (oc.type.toLowerCase() !== nc.type.toLowerCase())
        changes.push(`type ${oc.type} -> ${nc.type}`);
      if (oc.notNull !== nc.notNull)
        changes.push(oc.notNull ? 'was NOT NULL, now nullable' : 'was nullable, now NOT NULL');
      if (changes.length) columnsChanged.push({ column: nc, changes });
    }
    // Rename heuristic: fires ONLY for exactly one removed + one added column
    // with identical type and nullability. Reported as a candidate.
    const renames = [];
    if (columnsRemoved.length === 1 && columnsAdded.length === 1 &&
        colSig(columnsRemoved[0]) === colSig(columnsAdded[0])) {
      renames.push({ from: columnsRemoved[0], to: columnsAdded[0] });
      columnsRemoved.length = 0;
      columnsAdded.length = 0;
    }
    if (columnsAdded.length || columnsRemoved.length || columnsChanged.length || renames.length) {
      modified.push({
        name,
        columns: [...nt.cols.values()],
        columnsAdded,
        columnsRemoved,
        columnsChanged,
        renames,
      });
    }
  }
  return {
    tables: { added, removed, modified },
    counts: { added: added.length, removed: removed.length, modified: modified.length },
  };
}

/**
 * Structurally diff two DBML documents.
 * @param {string} oldDbml Old schema, DBML source text
 * @param {string} newDbml New schema, DBML source text
 * @returns {DiffResult}
 */
function diff(oldDbml, newDbml) {
  return diffTables(parseSchema(oldDbml), parseSchema(newDbml));
}

module.exports = { diff, diffTables };
