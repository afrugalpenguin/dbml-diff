# Design notes

Why `dbml-diff` reports what it reports, and what it deliberately won't do. For how to run each feature see the [README](../README.md) and the [CLI reference](cli.md).

## Decisions

**Matching is by name, never by position.** Tables and columns are keyed by name, so reordering columns or moving a table in the file is not a change. Enum values and TableGroup membership are compared as sets for the same reason - only a genuine add or remove counts. Type comparison is case-insensitive, so `INT` and `int` are the same type.

**Renames are reported as candidates, never applied silently.** There is no reliable way to know that a removed `user_id` and an added `account_id` are the same column, so `dbml-diff` does not guess and rewrite the diff around it. The rename heuristic fires only in the unambiguous case - exactly one removed column and one added column in the same table, with an identical signature (type, nullability, and PK membership) - and even then it surfaces the pair as a candidate for you to confirm, not a resolved fact. Anything less clear-cut stays as a plain add plus remove.

**Foreign keys are compared by canonical signature.** A relationship is keyed by its FK side pointing at its parent side, so declaration direction and inline-vs-standalone syntax do not produce false diffs. When a single FK's target moves, that surfaces as one `retargeted` change rather than an unrelated add and remove. When the change is genuinely ambiguous - several relationships on the same FK side changing at once - it goes to `unresolved` and is handed back verbatim rather than force-fit into a retarget.

**Everything counts through one place.** Every "did anything change, and how many" decision - the emitter section guards, the stderr summary, and the exit code - derives from a single `changeCounts()` function, so a new change category cannot drift out of sync between call sites.

**Output formats are views over the diff, and rendering is split from emitting.** Every format - text, JSON, dbml, d2, svg - renders the same `diff()` result and adds nothing to it. `--format d2` is a pure text emitter with no extra dependency; `--format svg` is that emitter plus one render step through [D2](https://d2lang.com). All the diagram logic lives in the dependency-free half, so it is fully testable without the renderer, and the multi-megabyte D2 WASM package stays an optional dependency that a plain install never pulls. The D2 formats exist for one concrete reason: the diff draws no relationships (it carries no cardinality), so its tables are a disconnected set, and D2's `grid` layout tiles them into a compact block where dbdiagram and Mermaid spread a large diff into an ever-wider, unreadable row.

## Limitations

Known edges, stated plainly so you can plan around them:

- **Rename detection is single-column only.** Two columns renamed in the same table at once fall back to add plus remove. This is deliberate: past that point the guess is unreliable, and a wrong rename is worse than an honest add and remove.
- **`--migrate` is T-SQL only** (SQL Server / Azure Synapse), and cannot be combined with `--format`. Other dialects are not implemented.
- **Enums and TableGroups do not appear in `--migrate` output.** They diff and render in the visual and text output, but have no SQL representation here.
- **Synthesized FK constraint names will not match your database.** `--migrate` builds names like `FK_child_parent_cols`; a real database almost certainly named the constraint something else, so any `DROP CONSTRAINT` line needs the real name before you uncomment it.
- **Some generated migrations can fail against existing data** - adding a `NOT NULL` column without a default, or tightening a column to `NOT NULL` while NULLs exist. These carry an inline `-- NOTE`; the tool flags them rather than pretending they are safe.
- **Column note changes are off by default.** Notes are documentation noise in most structural diffs; `--include-notes` opts them in.

The migration output is a reviewed starting point, not a frozen contract - see the [migration guide](migration.md) for the full statement-by-statement behaviour, and [stability](stability.md) for the semver contract.
