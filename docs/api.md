# Programmatic API

`dbml-diff` can be used as a library. For a quick start see the [README](../README.md); for the stability guarantees on this surface see [stability.md](stability.md).

```js
const { diff, emitText, emitJson, emitDbml, emitMigration } = require('dbml-diff');

const result = diff(oldDbmlString, newDbmlString);
```

## `diff(oldDbml, newDbml, opts?)`

Structurally diffs two DBML documents and returns the result object below. `opts.includeNotes` (default `false`) treats a changed column `note` as a column change.

```js
// {
//   tables: {
//     added:    [ { name, columns: [...] } ],
//     removed:  [ { name, columns: [...] } ],
//     modified: [ {
//       name,
//       columns: [...],             // full column list after the change
//       columnsAdded: [...], columnsRemoved: [...],
//       columnsChanged: [ { column, changes: ['type X -> Y', ...] } ], // changes: human-readable
//       renames: [ { from, to } ]   // from/to are column objects; heuristic candidates only
//     } ]
//   },
//   enums: {
//     added:    [ { name, values: [...] } ],
//     removed:  [ { name, values: [...] } ],
//     modified: [ { name, values: [...], valuesAdded: [...], valuesRemoved: [...] } ]
//   },
//   refs: {
//     added:      [ { from: { table, columns }, to: { table, columns } } ],
//     removed:    [ { from, to } ],
//     retargeted: [ { from, oldTo, newTo } ],   // same FK side, new parent
//     unresolved: [ { from, oldTargets: [...], newTargets: [...] } ]  // ambiguous
//   },
//   groups: {   // TableGroups (membership diffed as a set)
//     added:    [ { name, tables: [...] } ],
//     removed:  [ { name, tables: [...] } ],
//     modified: [ { name, tablesAdded: [...], tablesRemoved: [...] } ]
//   },
//   counts: { added, removed, modified }   // tables only
// }
```

Every column in the result is `{ name, type, notNull, pk, note }` (`type` is a string, `notNull` and `pk` are booleans, `note` is a string or `null`). Enum entries are `{ name, values }`, groups `{ name, tables }`, and ref endpoints `{ table, columns }`.

## Emitters

Each emitter takes the `diff()` result and returns a string.

```js
emitText(result);                                             // human-readable summary
emitJson(result);                                             // pretty-printed JSON
emitDbml(result, { oldLabel: 'v1', newLabel: 'v2', colors: true });  // annotated DBML for dbdiagram.io
emitMigration(result, { oldLabel: 'v1', newLabel: 'v2' });    // T-SQL migration script
```

- `emitDbml` options: `oldLabel`, `newLabel`, `colors`, `fullNewTables`, `hideUnchangedPk` (the last three mirror the matching CLI flags).
- `emitMigration` options: `oldLabel`, `newLabel`. See [migration.md](migration.md) for what the script contains.
