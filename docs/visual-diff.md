# Visual diff conventions (`--format dbml`, `--format d2`, `--format svg`)

The visual formats render the diff as a diagram showing only what changed. `--format dbml` emits an annotated DBML document for [dbdiagram.io](https://dbdiagram.io/), using the markers below; `--format d2` and `--format svg` render the same diff through [D2](https://d2lang.com) and are covered in [D2 and SVG](#d2-and-svg---format-d2---format-svg). For a quick start see the [README](../README.md).

## Markers

| Marker | Meaning |
| --- | --- |
| `NEW · ` table name prefix | Table added |
| `MOD · ` table name prefix | Table modified |
| `DEL · ` table name prefix | Table removed |
| `__ADDED` column suffix | Column added to a modified table |
| `__REMOVED` column suffix | Column removed from a modified table |
| `__RENAMED` column suffix | Rename candidate (heuristic - verify; never merged silently) |
| `__CHANGED` column suffix | Type, nullability or PK membership changed (detail in the column `note`) |
| `NEW · ` / `MOD · ` / `DEL · ` enum name prefix | Enum added / modified / removed |
| `[note: 'ADDED']` / `[note: 'REMOVED']` on an enum value | Value added / removed in a modified enum |

## What each block shows

- **Modified tables** show only their primary key (annotated `unchanged columns omitted`) plus the changed columns. `--hide-unchanged-pk` drops that PK row for a leaner delta-only view; the block stays valid because a modified table always has at least one changed column.
- **Added tables** are stubbed to the PK with a `NEW TABLE - N columns` note by default. `--full-new-tables` emits every column.
- **Removed tables** are emitted in full.
- **Enum changes** are emitted as `Enum` blocks under the same `NEW · / MOD · / DEL ·` prefixes. In a modified enum, the full new value list is shown with `ADDED` notes on new values, and the dropped values are re-listed with `REMOVED` notes.

## The `DIFF SUMMARY` table

A `DIFF SUMMARY` table at the top lists the counts, one column per metric, with the label as the column name and the count as the column type, so the numbers are visible on the canvas at a glance. It is a real table rather than a standalone `Note` block because dbdiagram renders standalone notes as Sticky Notes only on paid tiers, whereas a table always renders on the free tier. The three table counts (added / removed / modified) always appear; enum, ref, and TableGroup rows appear only for categories that changed.

## Relationships and groups

`Ref:` changes are counted in the `DIFF SUMMARY` table:

- `added` / `removed` - a relationship gained or dropped.
- `retargeted` - an FK side keeps its columns but points at a new parent.
- `unresolved` - a change that cannot be mapped to a single retarget.

The per-ref and per-group detail - which tables changed and how - lives in `--format text` and `--format json`, not in the diagram.

## Viewing the diff in dbdiagram.io

1. `dbml-diff old.dbml new.dbml --format dbml -o diff.dbml`
2. Open [dbdiagram.io](https://dbdiagram.io/d) and create a new diagram.
3. Paste the contents of `diff.dbml` into the editor.
4. The diagram now shows only what changed: scan for the `NEW ·` / `MOD ·` / `DEL ·` tables, and hover the annotated columns to read the change notes. With `--colors` (paid tier) the table headers are colour-coded too.

## D2 and SVG (`--format d2`, `--format svg`)

These render the same diff as `--format dbml`, but through [D2](https://d2lang.com) instead of dbdiagram.io. They exist because D2 solves a problem the other visual formats cannot: a diff with no relationship lines is a set of disconnected tables, and D2's `grid` layout tiles them into a compact block, where dbdiagram and Mermaid spread them into one ever-wider row.

- **`--format d2`** emits D2 diagram source. Pure text, no dependency to install. Render it with the [D2 CLI](https://d2lang.com/tour/install), the [playground](https://play.d2lang.com), or an editor plugin - or pipe it straight to `--format svg`.
- **`--format svg`** renders that D2 to a self-contained SVG locally (fonts embedded, no network), so it suits schemas that must not leave the machine. It needs the optional `@terrastruct/d2` package:

  ```sh
  npm i @terrastruct/d2
  dbml-diff old.dbml new.dbml --format svg -o diff.svg
  ```

  Without the package, `--format svg` exits `2` with an install hint; `--format d2` always works.

### What the diagram shows

- Each table is a D2 `sql_table` shape. The **header fill** encodes state: green added, amber modified, red removed - no paid tier, unlike dbdiagram's `--colors`. The `NEW ·` / `MOD ·` / `DEL ·` name prefix is kept as a redundant, colour-blind-safe signal.
- A column row is `name: type`, with a `primary_key` constraint badge on the PK. Changed columns carry a leading marker - `+` added, `-` removed, `~` changed, `?` rename candidate - and the change detail (`was NOT NULL, now nullable`) rides in a **tooltip** on hover, keeping the row short.
- The `DIFF SUMMARY` is its own `sql_table` carrying the same counts, with enum / ref / group rows shown only when non-zero.
- Tables tile into a grid of `ceil(sqrt(n))` columns, so the picture stays roughly square at any size.

`--full-new-tables` and `--hide-unchanged-pk` apply here exactly as they do to `--format dbml`. Relationships are not drawn, for the same reason as every other format: the diff carries no cardinality, and a grid of disconnected tables is what makes the layout compact in the first place.
