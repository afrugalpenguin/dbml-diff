// Type declarations for the public API. Hand-written to mirror the JSDoc
// typedefs in diff.js and parse.js; typecheck/check.ts checks them
// against the emitJson output of every fixture, so the two cannot drift.

/** A column as it appears in the diff result. */
export interface Column {
  name: string;
  /** Raw type name, e.g. "NVARCHAR(200)" */
  type: string;
  notNull: boolean;
  pk: boolean;
  note: string | null;
}

/** An added or removed table. */
export interface TableEntry {
  /** Fully-qualified name (schema-prefixed unless the schema is "public") */
  name: string;
  columns: Column[];
}

export interface ColumnChange {
  /** The column as it appears in the new schema */
  column: Column;
  /** Human-readable change descriptions; the wording is not covered by semver */
  changes: string[];
}

export interface RenameCandidate {
  /** Column removed from the old schema */
  from: Column;
  /** Column added in the new schema */
  to: Column;
}

export interface ModifiedTable {
  name: string;
  /** Full column list of the table in the new schema */
  columns: Column[];
  columnsAdded: Column[];
  columnsRemoved: Column[];
  columnsChanged: ColumnChange[];
  /** Heuristic candidates only, never merged silently */
  renames: RenameCandidate[];
}

/** An added or removed enum. */
export interface EnumEntry {
  name: string;
  /** Value names, in declaration order */
  values: string[];
}

export interface ModifiedEnum {
  name: string;
  /** Full value list in the new schema */
  values: string[];
  valuesAdded: string[];
  valuesRemoved: string[];
}

/** An added or removed TableGroup. */
export interface GroupDef {
  name: string;
  /** Member table names (fully-qualified, sorted) */
  tables: string[];
}

export interface ModifiedGroup {
  name: string;
  /** Members added to the group */
  tablesAdded: string[];
  /** Members removed from the group */
  tablesRemoved: string[];
}

export interface RefEndpoint {
  /** Fully-qualified table name */
  table: string;
  columns: string[];
}

/** An added or removed relationship. */
export interface RefDef {
  /** The many/child (FK) side */
  from: RefEndpoint;
  /** The one/parent side */
  to: RefEndpoint;
}

export interface RetargetedRef {
  /** The unchanged FK side */
  from: RefEndpoint;
  /** Previous target */
  oldTo: RefEndpoint;
  /** New target */
  newTo: RefEndpoint;
}

export interface UnresolvedRef {
  /** The FK side whose relationships changed ambiguously */
  from: RefEndpoint;
  /** Targets present in the old schema */
  oldTargets: RefEndpoint[];
  /** Targets present in the new schema */
  newTargets: RefEndpoint[];
}

/** The value returned by diff(); emitJson() serialises it as-is. */
export interface DiffResult {
  tables: { added: TableEntry[]; removed: TableEntry[]; modified: ModifiedTable[] };
  enums: { added: EnumEntry[]; removed: EnumEntry[]; modified: ModifiedEnum[] };
  refs: { added: RefDef[]; removed: RefDef[]; retargeted: RetargetedRef[]; unresolved: UnresolvedRef[] };
  groups: { added: GroupDef[]; removed: GroupDef[]; modified: ModifiedGroup[] };
  /** Table counts only */
  counts: { added: number; removed: number; modified: number };
}

export interface DiffOptions {
  /** Treat a changed column `note` as a column change (`note changed`). Default false. */
  includeNotes?: boolean;
}

export interface EmitDbmlOptions {
  /** Label for the old schema in the header. Default "old". */
  oldLabel?: string;
  /** Label for the new schema in the header. Default "new". */
  newLabel?: string;
  /** Emit full column lists for added tables. Default false. */
  fullNewTables?: boolean;
  /** Add [headercolor: ...] annotations. Default false. */
  colors?: boolean;
  /** Suppress the unchanged primary-key row on modified tables. Default false. */
  hideUnchangedPk?: boolean;
  /** Generation date for the header. Defaults to today. */
  date?: Date | string;
}

export interface EmitD2Options {
  /** Default "old". */
  oldLabel?: string;
  /** Default "new". */
  newLabel?: string;
  /** Emit full column lists for added tables. Default false. */
  fullNewTables?: boolean;
  /** Suppress the unchanged primary-key row on modified tables. Default false. */
  hideUnchangedPk?: boolean;
  /** Generation date for the header comment. Defaults to today. */
  date?: Date | string;
}

export interface EmitMigrationOptions {
  /** Default "old". */
  oldLabel?: string;
  /** Default "new". */
  newLabel?: string;
  /** Defaults to today. */
  date?: Date | string;
}

export interface RenderSvgOptions extends EmitD2Options {
  /** D2 hand-drawn style. Default false. */
  sketch?: boolean;
  /** SVG scale; 1 renders at natural size. Default 1. */
  scale?: number;
}

/** Structurally diff two DBML documents (old, new). */
export function diff(oldDbml: string, newDbml: string, opts?: DiffOptions): DiffResult;
/** Human-readable summary. */
export function emitText(result: DiffResult): string;
/** Pretty-printed JSON of the result; JSON.parse gives back a DiffResult. */
export function emitJson(result: DiffResult): string;
/** Annotated DBML document that renders as a visual diff in dbdiagram.io. */
export function emitDbml(result: DiffResult, opts?: EmitDbmlOptions): string;
/** D2 diagram source. */
export function emitD2(result: DiffResult, opts?: EmitD2Options): string;
/** T-SQL migration script. */
export function emitMigration(result: DiffResult, opts?: EmitMigrationOptions): string;
/**
 * Self-contained SVG rendered via D2. Needs the optional `@terrastruct/d2`
 * package; rejects with an error whose `code` is `D2_NOT_INSTALLED` if absent.
 */
export function renderSvg(result: DiffResult, opts?: RenderSvgOptions): Promise<string>;
