/**
 * A database-shaped view of a Prisma schema: tables and columns rather than models and fields,
 * with db names already resolved and Prisma's implicit many-to-many join tables materialized.
 * Deliberately separate from GraphModel, which is shaped for drawing a diagram and drops
 * almost everything DDL needs (defaults, native types, indexes, referential actions).
 */

/** A column's SQL type, already resolved from the Prisma scalar plus any `@db.*` override. */
export interface SqlColumnType {
	/** Emitted verbatim, e.g. "TEXT", "VARCHAR(255)", "TIMESTAMP(3)", `"Role"` for an enum. */
	sql: string;
	isArray: boolean;
}

export type SqlDefault =
	| { kind: 'literal'; value: string }
	/** Emitted unquoted — a SQL expression such as CURRENT_TIMESTAMP or gen_random_uuid(). */
	| { kind: 'expression'; value: string }
	| { kind: 'emptyArray' };

export interface SqlColumn {
	name: string;
	type: SqlColumnType;
	isNullable: boolean;
	default?: SqlDefault;
	/** Autoincrement folds into the type (SERIAL/BIGSERIAL), so no DEFAULT clause is emitted. */
	isSerial: boolean;
	/** Non-fatal notes surfaced as `-- WARNING:` comments above the column. */
	warnings: string[];
}

export interface SqlPrimaryKey {
	name: string;
	columns: string[];
}

export interface SqlIndex {
	name: string;
	table: string;
	columns: string[];
	isUnique: boolean;
}

export type SqlReferentialAction = 'CASCADE' | 'RESTRICT' | 'NO ACTION' | 'SET NULL' | 'SET DEFAULT';

export interface SqlForeignKey {
	name: string;
	table: string;
	columns: string[];
	referencedTable: string;
	referencedColumns: string[];
	onDelete: SqlReferentialAction;
	onUpdate: SqlReferentialAction;
}

export interface SqlTable {
	name: string;
	columns: SqlColumn[];
	primaryKey?: SqlPrimaryKey;
}

export interface SqlEnum {
	name: string;
	values: string[];
}

export interface SqlSchema {
	enums: SqlEnum[];
	tables: SqlTable[];
	indexes: SqlIndex[];
	foreignKeys: SqlForeignKey[];
	/** The datasource provider, when declared — used to flag schemas not targeting PostgreSQL. */
	provider?: string;
	/** Schema-level notes surfaced as `-- WARNING:` comments in the file header. */
	warnings: string[];
}
