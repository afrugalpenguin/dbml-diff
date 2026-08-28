# Programmatic API

`dbml-diff` can be used as a library. For a quick start see the [README](../README.md); for the stability guarantees on this surface see [stability.md](stability.md).

```js
const { diff, emitText, emitJson, emitDbml, emitD2, emitMigration, renderSvg } = require('dbml-diff');

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
emitD2(result, { oldLabel: 'v1', newLabel: 'v2' });           // D2 diagram source
emitMigration(result, { oldLabel: 'v1', newLabel: 'v2' });    // T-SQL migration script
```

- `emitDbml` options: `oldLabel`, `newLabel`, `colors`, `fullNewTables`, `hideUnchangedPk` (the last three mirror the matching CLI flags).
- `emitD2` options: `oldLabel`, `newLabel`, `fullNewTables`, `hideUnchangedPk`. Returns D2 source: `sql_table` shapes in a grid, headers filled by state. Pure text, no dependency on the D2 renderer. See [visual-diff.md](visual-diff.md#d2-and-svg---format-d2---format-svg).
- `emitMigration` options: `oldLabel`, `newLabel`. See [migration.md](migration.md) for what the script contains.

## renderSvg(result, opts?)

Returns a `Promise<string>`: a self-contained SVG (fonts embedded, no external fetches) rendered by feeding `emitD2` output to the D2 renderer.

```js
const svg = await renderSvg(result, { oldLabel: 'v1', newLabel: 'v2' });
```

Options: everything `emitD2` takes, plus `sketch` (hand-drawn style, default `false`) and `scale` (default `1`, which renders at natural size rather than fitting to screen).

Rendering needs the optional [`@terrastruct/d2`](https://www.npmjs.com/package/@terrastruct/d2) package, which is **not** a hard dependency (it ships a multi-megabyte WASM blob). Install it with `npm i @terrastruct/d2`. If it is absent, `renderSvg` rejects with an error whose `code` is `D2_NOT_INSTALLED` and whose message carries the install hint. `emitD2` needs nothing extra, so `--format d2` (or `emitD2`) is the no-install path.
