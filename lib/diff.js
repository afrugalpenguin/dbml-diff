'use strict';

const { parseSchema } = require('./parse');

/**
 * @typedef {import('./parse').Column} Column
 * @typedef {import('./parse').Table} Table
 * @typedef {import('./parse').EnumDef} EnumDef
 * @typedef {import('./parse').GroupDef} GroupDef
 * @typedef {import('./parse').RefDef} RefDef
 * @typedef {import('./parse').RefEndpoint} RefEndpoint
 * @typedef {import('./parse').Schema} Schema
 */

/**
 * @typedef {Object} RetargetedRef
 * @property {RefEndpoint} from The unchanged FK side
 * @property {RefEndpoint} oldTo Previous target
 * @property {RefEndpoint} newTo New target
 */

/**
 * @typedef {Object} UnresolvedRef
 * @property {RefEndpoint} from The FK side whose relationships changed ambiguously
 * @property {RefEndpoint[]} oldTargets Targets present in the old schema
 * @property {RefEndpoint[]} newTargets Targets present in the new schema
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
 * @typedef {Object} EnumEntry
 * @property {string} name
 * @property {string[]} values
 */

/**
 * @typedef {Object} ModifiedEnum
 * @property {string} name
 * @property {string[]} values Full value list in the new schema
 * @property {string[]} valuesAdded
 * @property {string[]} valuesRemoved
 */

/**
 * @typedef {Object} ModifiedGroup
 * @property {string} name
 * @property {string[]} tablesAdded Members added to the group
 * @property {string[]} tablesRemoved Members removed from the group
 */

/**
 * @typedef {Object} DiffResult
 * @property {{ added: TableEntry[], removed: TableEntry[], modified: ModifiedTable[] }} tables
 * @property {{ added: EnumEntry[], removed: EnumEntry[], modified: ModifiedEnum[] }} enums
 * @property {{ added: RefDef[], removed: RefDef[], retargeted: RetargetedRef[], unresolved: UnresolvedRef[] }} refs
 * @property {{ added: GroupDef[], removed: GroupDef[], modified: ModifiedGroup[] }} groups
 * @property {{ added: number, removed: number, modified: number }} counts Table counts only
 */

const colSig = (c) => `${c.type.toLowerCase()}|${c.notNull ? 1 : 0}|${c.pk ? 1 : 0}`;

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
      if (oc.pk !== nc.pk)
        changes.push(nc.pk ? 'became PK' : 'no longer PK');
      if (changes.length) columnsChanged.push({ column: nc, changes });
    }
    // Rename heuristic: fires ONLY for exactly one removed + one added column
    // with identical signature (type, nullability and PK membership; see
    // colSig). Reported as a candidate.
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
 * Structurally compare two enum collections. Values are compared as sets, so
 * reordering alone is not a change.
 * @param {Map<string, EnumDef>} oldEnums
 * @param {Map<string, EnumDef>} newEnums
 * @returns {{ added: EnumEntry[], removed: EnumEntry[], modified: ModifiedEnum[] }}
 */
function diffEnums(oldEnums, newEnums) {
  const added = [];
  const removed = [];
  const modified = [];
  for (const [name, e] of newEnums) {
    if (!oldEnums.has(name)) added.push({ name, values: e.values });
  }
  for (const [name, e] of oldEnums) {
    if (!newEnums.has(name)) removed.push({ name, values: e.values });
  }
  for (const [name, ne] of newEnums) {
    if (!oldEnums.has(name)) continue;
    const oe = oldEnums.get(name);
    const oldSet = new Set(oe.values);
    const newSet = new Set(ne.values);
    const valuesAdded = ne.values.filter((v) => !oldSet.has(v));
    const valuesRemoved = oe.values.filter((v) => !newSet.has(v));
    if (valuesAdded.length || valuesRemoved.length) {
      modified.push({ name, values: ne.values, valuesAdded, valuesRemoved });
    }
  }
  return { added, removed, modified };
}

/**
 * Structurally compare two TableGroup collections. Membership is compared as a
 * set, so reordering members alone is not a change.
 * @param {Map<string, GroupDef>} oldGroups
 * @param {Map<string, GroupDef>} newGroups
 * @returns {{ added: GroupDef[], removed: GroupDef[], modified: ModifiedGroup[] }}
 */
function diffGroups(oldGroups, newGroups) {
  const added = [];
  const removed = [];
  const modified = [];
  for (const [name, g] of newGroups) {
    if (!oldGroups.has(name)) added.push(g);
  }
  for (const [name, g] of oldGroups) {
    if (!newGroups.has(name)) removed.push(g);
  }
  for (const [name, ng] of newGroups) {
    if (!oldGroups.has(name)) continue;
    const og = oldGroups.get(name);
    const oldSet = new Set(og.tables);
    const newSet = new Set(ng.tables);
    const tablesAdded = ng.tables.filter((t) => !oldSet.has(t));
    const tablesRemoved = og.tables.filter((t) => !newSet.has(t));
    if (tablesAdded.length || tablesRemoved.length) {
      modified.push({ name, tablesAdded, tablesRemoved });
    }
  }
  return { added, removed, modified };
}

/**
 * Structurally compare two relationship collections.
 *
 * Refs are keyed by canonical signature (FK side `>` parent side), so
 * declaration direction and inline-vs-standalone do not matter. Added and
 * removed are a straight set difference. When exactly one removed and one
 * added ref share the same FK side but point at a different target, they are
 * reported as a `retargeted` change instead. When an FK side has an ambiguous
 * many-to-many of changes, they go to `unresolved` rather than being
 * force-classified.
 * @param {Map<string, RefDef>} oldRefs
 * @param {Map<string, RefDef>} newRefs
 * @returns {{ added: RefDef[], removed: RefDef[], retargeted: RetargetedRef[], unresolved: UnresolvedRef[] }}
 */
function diffRefs(oldRefs, newRefs) {
  const rawAdded = [];
  const rawRemoved = [];
  for (const [key, r] of newRefs) if (!oldRefs.has(key)) rawAdded.push(r);
  for (const [key, r] of oldRefs) if (!newRefs.has(key)) rawRemoved.push(r);

  // Group by FK side so a target change surfaces as a retarget, not add + remove.
  const fkKey = (ep) => `${ep.table}(${ep.columns.join(',')})`;
  const byFrom = new Map();
  for (const r of rawAdded) {
    const k = fkKey(r.from);
    if (!byFrom.has(k)) byFrom.set(k, { added: [], removed: [] });
    byFrom.get(k).added.push(r);
  }
  for (const r of rawRemoved) {
    const k = fkKey(r.from);
    if (!byFrom.has(k)) byFrom.set(k, { added: [], removed: [] });
    byFrom.get(k).removed.push(r);
  }

  const added = [];
  const removed = [];
  const retargeted = [];
  const unresolved = [];
  for (const { added: a, removed: d } of byFrom.values()) {
    if (a.length === 1 && d.length === 1) {
      retargeted.push({ from: a[0].from, oldTo: d[0].to, newTo: a[0].to });
    } else if (a.length && d.length) {
      unresolved.push({
        from: a[0].from,
        oldTargets: d.map((r) => r.to),
        newTargets: a.map((r) => r.to),
      });
    } else {
      added.push(...a);
      removed.push(...d);
    }
  }
  return { added, removed, retargeted, unresolved };
}

/**
 * Structurally compare two parsed schemas (tables, enums, refs and groups).
 * @param {Schema} oldSchema
 * @param {Schema} newSchema
 * @returns {DiffResult}
 */
function diffSchemas(oldSchema, newSchema) {
  const t = diffTables(oldSchema.tables, newSchema.tables);
  return {
    tables: t.tables,
    enums: diffEnums(oldSchema.enums, newSchema.enums),
    refs: diffRefs(oldSchema.refs, newSchema.refs),
    groups: diffGroups(oldSchema.groups, newSchema.groups),
    counts: t.counts,
  };
}

/**
 * Structurally diff two DBML documents.
 * @param {string} oldDbml Old schema, DBML source text
 * @param {string} newDbml New schema, DBML source text
 * @returns {DiffResult}
 */
function diff(oldDbml, newDbml) {
  return diffSchemas(parseSchema(oldDbml), parseSchema(newDbml));
}

module.exports = { diff, diffTables, diffEnums, diffRefs, diffGroups, diffSchemas };
