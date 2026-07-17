# Visual diff conventions (`--format dbml`, `--format mermaid`)

There are two visual formats, and they render the same diff in different notations:

- **`--format dbml`** emits an annotated DBML document that renders in [dbdiagram.io](https://dbdiagram.io/).
- **`--format mermaid`** emits a Mermaid `erDiagram` block, which renders natively in GitHub and Azure DevOps with nothing to install.

Both show only what changed, using the markers below. Neither invents information: a format renders what the diff holds and nothing more, which is why neither one draws relationship lines (see [Relationships and groups](#relationships-and-groups)). For a quick start see the [README](../README.md).

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

Neither visual format draws relationship lines. `Ref:` changes are counted in the `DIFF SUMMARY`:

- `added` / `removed` - a relationship gained or dropped.
- `retargeted` - an FK side keeps its columns but points at a new parent.
- `unresolved` - a change that cannot be mapped to a single retarget.

The per-ref and per-group detail - which tables changed and how - lives in `--format text` and `--format json`, not in the diagram.

Mermaid could draw the lines, but it requires a cardinality marker on both ends of every relationship and has no token for "unknown". The diff does not carry cardinality - the parser normalises a ref to its FK and parent sides and drops the rest - so drawing a line would mean guessing at the notation layer. In a pipeline with no human reading the diagram, a confident wrong arrow is worse than no arrow. If cardinality is ever carried through the diff itself, every format gets it at once.

## Mermaid (`--format mermaid`)

The block is emitted bare, without a markdown fence, so `-o diff.mmd` produces a usable `.mmd` file. Wrap it in a ```` ```mermaid ```` fence to embed it in a PR comment or a README.

`--full-new-tables` and `--hide-unchanged-pk` work here exactly as they do for DBML. `--colors` does not: it emits dbdiagram `headercolor` annotations, and Mermaid has no equivalent, so it is ignored with a warning.

Two things differ from the DBML view, both forced by Mermaid's grammar:

- **The summary is a three-column grid.** Mermaid attributes are `type name "comment"`, and all three render, so each metric becomes category, action, count: `Tables added "3"`. The DBML trick of label-as-name plus count-as-type is not expressible - Mermaid allows neither a quoted attribute name nor a type starting with a digit.
- **Enums render as entities marked `(enum)`.** Mermaid has no enum construct, so a changed enum becomes an entity whose attributes are its values, carrying the same `ADDED` / `REMOVED` notes.

### Identifier sanitising

Mermaid is far stricter than DBML about identifiers. A column type or name must be a single bare token starting with a letter, so anything else is folded to underscores:

| DBML | Mermaid |
| --- | --- |
| `c "character varying(50)"` | `character_varying(50) c` |
| `"my col" int` | `int my_col` |
| `"2fa" bool` | `bool _2fa` |

Single-token types (`varchar(50)`, `decimal(18,2)`, `int[]`, `NVARCHAR(MAX)`) pass through untouched, so most schemas are unaffected. Mermaid also has no escape for a double quote, so a `"` inside a note or a name is folded to `'`, and it has no NOT NULL concept, so nullability is carried in the column comment instead of being dropped.

## Viewing the diff in dbdiagram.io

1. `dbml-diff old.dbml new.dbml --format dbml -o diff.dbml`
2. Open [dbdiagram.io](https://dbdiagram.io/d) and create a new diagram.
3. Paste the contents of `diff.dbml` into the editor.
4. The diagram now shows only what changed: scan for the `NEW ·` / `MOD ·` / `DEL ·` tables, and hover the annotated columns to read the change notes. With `--colors` (paid tier) the table headers are colour-coded too.
