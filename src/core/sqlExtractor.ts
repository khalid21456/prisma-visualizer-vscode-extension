import { Attribute, BlockAttribute, Datasource, Enum, Field, Model, Schema } from '@mrleebo/prisma-ast';
import { asUnquotedString, getArrayArg, getFuncArg, getKeyValueArg, getPositionalArgs, getPositionalStringArg, isFunc, unquote } from './astUtils';
import { pairKey } from './relations';
import { SqlColumn, SqlColumnType, SqlDefault, SqlEnum, SqlForeignKey, SqlIndex, SqlReferentialAction, SqlSchema, SqlTable } from './sqlModel';

const PRISMA_SCALARS = new Set(['String', 'Int', 'Float', 'Boolean', 'DateTime', 'Json', 'Bytes', 'Decimal', 'BigInt']);

/** Prisma scalar -> PostgreSQL, matching what `prisma migrate` emits for the postgresql provider. */
const SCALAR_TO_POSTGRES: Record<string, string> = {
	String: 'TEXT',
	Boolean: 'BOOLEAN',
	Int: 'INTEGER',
	BigInt: 'BIGINT',
	Float: 'DOUBLE PRECISION',
	Decimal: 'DECIMAL(65,30)',
	DateTime: 'TIMESTAMP(3)',
	Json: 'JSONB',
	Bytes: 'BYTEA',
};

/** `@db.X` -> PostgreSQL type name. Parameters are appended from the attribute's positional args. */
const NATIVE_TO_POSTGRES: Record<string, string> = {
	Text: 'TEXT',
	VarChar: 'VARCHAR',
	Char: 'CHAR',
	Bit: 'BIT',
	VarBit: 'VARBIT',
	Uuid: 'UUID',
	Xml: 'XML',
	Inet: 'INET',
	Citext: 'CITEXT',
	Money: 'MONEY',
	SmallInt: 'SMALLINT',
	Integer: 'INTEGER',
	BigInt: 'BIGINT',
	Oid: 'OID',
	Real: 'REAL',
	DoublePrecision: 'DOUBLE PRECISION',
	Decimal: 'DECIMAL',
	Date: 'DATE',
	Time: 'TIME',
	Timetz: 'TIMETZ',
	Timestamp: 'TIMESTAMP',
	Timestamptz: 'TIMESTAMPTZ',
	Json: 'JSON',
	JsonB: 'JSONB',
	ByteA: 'BYTEA',
};

const REFERENTIAL_ACTIONS: Record<string, SqlReferentialAction> = {
	Cascade: 'CASCADE',
	Restrict: 'RESTRICT',
	NoAction: 'NO ACTION',
	SetNull: 'SET NULL',
	SetDefault: 'SET DEFAULT',
};

/** Prisma-side generators — the value is produced by the client, so no database default is emitted. */
const CLIENT_SIDE_DEFAULT_FUNCS = new Set(['uuid', 'cuid', 'nanoid', 'ulid', 'auto']);

function isField(prop: Model['properties'][number]): prop is Field {
	return prop.type === 'field';
}

function isBlockAttribute(prop: Model['properties'][number]): prop is BlockAttribute {
	return prop.type === 'attribute' && prop.kind === 'object';
}

function fieldBaseType(field: Field): string {
	return typeof field.fieldType === 'string' ? field.fieldType : field.fieldType.name;
}

function findAttribute(field: Field, name: string): Attribute | undefined {
	return field.attributes?.find((a) => a.name === name && a.group === undefined);
}

function findNativeAttribute(field: Field): Attribute | undefined {
	return field.attributes?.find((a) => a.group === 'db');
}

function mappedName(attributes: Attribute[] | undefined, fallback: string): string {
	const mapAttr = attributes?.find((a) => a.name === 'map' && a.group === undefined);
	return (mapAttr && getPositionalStringArg(mapAttr)) ?? fallback;
}

function blockMappedName(blockAttrs: BlockAttribute[], fallback: string): string {
	const mapAttr = blockAttrs.find((a) => a.name === 'map');
	return (mapAttr && getPositionalStringArg(mapAttr)) ?? fallback;
}

interface ModelInfo {
	model: Model;
	tableName: string;
	fields: Field[];
	/** Prisma field name -> database column name. */
	columnNames: Map<string, string>;
	primaryKeyFields: string[];
}

function resolveColumnType(field: Field, enumTypeNames: Map<string, string>, warnings: string[]): SqlColumnType {
	const base = fieldBaseType(field);
	const isArray = Boolean(field.array);
	const native = findNativeAttribute(field);

	if (native) {
		const mapped = NATIVE_TO_POSTGRES[native.name];
		const args = getPositionalArgs(native);
		const suffix = args.length ? `(${args.join(',')})` : '';
		if (mapped) {
			return { sql: `${mapped}${suffix}`, isArray };
		}
		warnings.push(`Unrecognized native type @db.${native.name} on "${field.name}" — emitted as-is.`);
		return { sql: `${native.name.toUpperCase()}${suffix}`, isArray };
	}

	const enumDbName = enumTypeNames.get(base);
	if (enumDbName) {
		return { sql: `"${enumDbName}"`, isArray };
	}

	if (isFunc(field.fieldType) && field.fieldType.name === 'Unsupported') {
		const raw = field.fieldType.params?.[0];
		const rawType = typeof raw === 'string' ? unquote(raw) : 'TEXT';
		warnings.push(`Field "${field.name}" uses Unsupported("${rawType}") — emitted verbatim, verify it is valid.`);
		return { sql: rawType, isArray };
	}

	const scalar = SCALAR_TO_POSTGRES[base];
	if (scalar) {
		return { sql: scalar, isArray };
	}

	warnings.push(`Unknown type "${base}" on field "${field.name}" — defaulted to TEXT.`);
	return { sql: 'TEXT', isArray };
}

/** Whether a default literal for this Prisma type must be single-quoted in SQL. */
function literalNeedsQuoting(baseType: string): boolean {
	return !['Int', 'BigInt', 'Float', 'Decimal', 'Boolean'].includes(baseType);
}

function sqlStringLiteral(value: string): string {
	return `'${value.replace(/'/g, "''")}'`;
}

function resolveDefault(field: Field, isSerial: boolean, warnings: string[]): SqlDefault | undefined {
	const attr = findAttribute(field, 'default');
	if (!attr || isSerial) {
		return undefined;
	}

	const func = getFuncArg(attr);
	if (func) {
		if (func.name === 'now') {
			return { kind: 'expression', value: 'CURRENT_TIMESTAMP' };
		}
		if (func.name === 'dbgenerated') {
			const raw = func.params?.[0];
			const expr = typeof raw === 'string' ? unquote(raw) : '';
			return expr ? { kind: 'expression', value: expr } : undefined;
		}
		if (CLIENT_SIDE_DEFAULT_FUNCS.has(func.name)) {
			// Generated by Prisma Client, not the database — no DEFAULT clause belongs in the DDL.
			return undefined;
		}
		warnings.push(`Unrecognized default function ${func.name}() on "${field.name}" — no default emitted.`);
		return undefined;
	}

	const raw = attr.args?.[0]?.value;

	// An empty `[]` parses to an array node; a non-empty one yields its entries.
	if (typeof raw === 'object' && raw !== null && !Array.isArray(raw) && (raw as { type?: string }).type === 'array') {
		const entries = getArrayArg(raw);
		if (entries.length === 0) {
			return { kind: 'emptyArray' };
		}
		const baseType = fieldBaseType(field);
		const rendered = entries.map((e) => (literalNeedsQuoting(baseType) ? sqlStringLiteral(e) : e));
		return { kind: 'expression', value: `ARRAY[${rendered.join(', ')}]` };
	}

	const literal = asUnquotedString(raw);
	if (literal === undefined) {
		return undefined;
	}
	return literalNeedsQuoting(fieldBaseType(field))
		? { kind: 'literal', value: literal }
		: { kind: 'expression', value: literal };
}

function buildColumn(field: Field, enumTypeNames: Map<string, string>, columnName: string): SqlColumn {
	const warnings: string[] = [];
	const defaultAttr = findAttribute(field, 'default');
	const defaultFunc = defaultAttr ? getFuncArg(defaultAttr) : undefined;
	const isAutoincrement = defaultFunc?.name === 'autoincrement';

	const type = resolveColumnType(field, enumTypeNames, warnings);
	let sqlType = type.sql;
	if (isAutoincrement) {
		// Autoincrement folds into the column type rather than becoming a DEFAULT clause.
		sqlType = sqlType === 'BIGINT' ? 'BIGSERIAL' : sqlType === 'SMALLINT' ? 'SMALLSERIAL' : 'SERIAL';
	}

	return {
		name: columnName,
		type: { sql: sqlType, isArray: type.isArray },
		// Prisma forbids optional list fields and emits array columns without NOT NULL, so an
		// array is nullable at the database level even though it reads as required in the schema.
		isNullable: Boolean(field.optional) || type.isArray,
		default: resolveDefault(field, isAutoincrement, warnings),
		isSerial: isAutoincrement,
		warnings,
	};
}

function collectEnums(schema: Schema): { enums: SqlEnum[]; typeNames: Map<string, string> } {
	const enumBlocks = schema.list.filter((b): b is Enum => b.type === 'enum');
	const typeNames = new Map<string, string>();
	const enums: SqlEnum[] = enumBlocks.map((block) => {
		const blockAttrs = block.enumerators.filter((e): e is BlockAttribute => e.type === 'attribute' && e.kind === 'object');
		const dbName = blockMappedName(blockAttrs, block.name);
		typeNames.set(block.name, dbName);
		const values = block.enumerators
			.filter((e) => e.type === 'enumerator')
			.map((e) => mappedName(e.attributes, e.name));
		return { name: dbName, values };
	});
	return { enums, typeNames };
}

function collectModels(schema: Schema): ModelInfo[] {
	return schema.list
		.filter((b): b is Model => b.type === 'model')
		.map((model) => {
			const fields = model.properties.filter(isField);
			const blockAttrs = model.properties.filter(isBlockAttribute);
			const columnNames = new Map(fields.map((f) => [f.name, mappedName(f.attributes, f.name)]));

			const compositeId = blockAttrs.find((a) => a.name === 'id');
			const primaryKeyFields = compositeId
				? getArrayArg(compositeId.args?.[0]?.value)
				: fields.filter((f) => findAttribute(f, 'id')).map((f) => f.name);

			return {
				model,
				tableName: blockMappedName(blockAttrs, model.name),
				fields,
				columnNames,
				primaryKeyFields,
			};
		});
}

function referentialAction(relationAttr: Attribute, key: string, fallback: SqlReferentialAction): SqlReferentialAction {
	const raw = asUnquotedString(getKeyValueArg(relationAttr, key));
	return (raw ? REFERENTIAL_ACTIONS[raw] : undefined) ?? fallback;
}

export function extractSqlSchema(schema: Schema): SqlSchema {
	const warnings: string[] = [];
	const { enums, typeNames: enumTypeNames } = collectEnums(schema);
	const modelInfos = collectModels(schema);
	const byModelName = new Map(modelInfos.map((m) => [m.model.name, m]));

	const datasource = schema.list.find((b): b is Datasource => b.type === 'datasource');
	const providerAssignment = datasource?.assignments.find((a) => a.type === 'assignment' && a.key === 'provider');
	const provider =
		providerAssignment && providerAssignment.type === 'assignment' ? asUnquotedString(providerAssignment.value) : undefined;

	const tables: SqlTable[] = [];
	const indexes: SqlIndex[] = [];
	const foreignKeys: SqlForeignKey[] = [];

	for (const info of modelInfos) {
		const { model, tableName, fields, columnNames } = info;
		const blockAttrs = model.properties.filter(isBlockAttribute);
		const columns: SqlColumn[] = [];

		for (const field of fields) {
			// Relation fields describe an association, not a column — the scalar FK field is the column.
			if (byModelName.has(fieldBaseType(field))) {
				continue;
			}
			const column = buildColumn(field, enumTypeNames, columnNames.get(field.name) ?? field.name);
			columns.push(column);

			if (findAttribute(field, 'unique')) {
				indexes.push({
					name: `${tableName}_${column.name}_key`,
					table: tableName,
					columns: [column.name],
					isUnique: true,
				});
			}
		}

		const toColumn = (fieldName: string) => columnNames.get(fieldName) ?? fieldName;
		const pkColumns = info.primaryKeyFields.map(toColumn);

		for (const attr of blockAttrs) {
			if (attr.name !== 'unique' && attr.name !== 'index') {
				continue;
			}
			const cols = getArrayArg(attr.args?.[0]?.value).map(toColumn);
			if (cols.length === 0) {
				continue;
			}
			const isUnique = attr.name === 'unique';
			const explicitName = asUnquotedString(getKeyValueArg(attr, 'map')) ?? asUnquotedString(getKeyValueArg(attr, 'name'));
			indexes.push({
				name: explicitName ?? `${tableName}_${cols.join('_')}_${isUnique ? 'key' : 'idx'}`,
				table: tableName,
				columns: cols,
				isUnique,
			});
		}

		for (const field of fields) {
			const relationAttr = findAttribute(field, 'relation');
			const fkFields = relationAttr ? getArrayArg(getKeyValueArg(relationAttr, 'fields')) : [];
			if (!relationAttr || fkFields.length === 0) {
				continue;
			}
			const target = byModelName.get(fieldBaseType(field));
			if (!target) {
				warnings.push(`Relation "${model.name}.${field.name}" points at unknown model "${fieldBaseType(field)}" — foreign key skipped.`);
				continue;
			}
			const references = getArrayArg(getKeyValueArg(relationAttr, 'references'));
			const localColumns = fkFields.map(toColumn);
			const explicitName = asUnquotedString(getKeyValueArg(relationAttr, 'map'));
			foreignKeys.push({
				name: explicitName ?? `${tableName}_${localColumns.join('_')}_fkey`,
				table: tableName,
				columns: localColumns,
				referencedTable: target.tableName,
				referencedColumns: references.map((r) => target.columnNames.get(r) ?? r),
				// Prisma's defaults differ by optionality: a required relation restricts, an optional one nulls out.
				onDelete: referentialAction(relationAttr, 'onDelete', field.optional ? 'SET NULL' : 'RESTRICT'),
				onUpdate: referentialAction(relationAttr, 'onUpdate', 'CASCADE'),
			});
		}

		tables.push({
			name: tableName,
			columns,
			primaryKey: pkColumns.length ? { name: `${tableName}_pkey`, columns: pkColumns } : undefined,
		});
	}

	extractImplicitJoinTables(modelInfos, byModelName, enumTypeNames, { tables, indexes, foreignKeys, warnings });

	return { enums, tables, indexes, foreignKeys, provider, warnings };
}

interface JoinTableSink {
	tables: SqlTable[];
	indexes: SqlIndex[];
	foreignKeys: SqlForeignKey[];
	warnings: string[];
}

/**
 * Materializes the join tables Prisma creates implicitly for `A[] <-> B[]` relations, which have no
 * declared model of their own: `_RelationName` (or `_AToB` for the alphabetically sorted model
 * pair), with "A"/"B" columns cascading to each side's primary key.
 */
function extractImplicitJoinTables(
	modelInfos: ModelInfo[],
	byModelName: Map<string, ModelInfo>,
	enumTypeNames: Map<string, string>,
	sink: JoinTableSink,
): void {
	interface ListRelationField {
		modelName: string;
		targetModel: string;
		relationName?: string;
	}

	const buckets = new Map<string, ListRelationField[]>();
	for (const info of modelInfos) {
		for (const field of info.fields) {
			const targetName = fieldBaseType(field);
			if (!byModelName.has(targetName) || !field.array) {
				continue;
			}
			const relationAttr = findAttribute(field, 'relation');
			// A side holding `fields:` owns a real foreign key, so this is not an implicit m2m.
			if (relationAttr && getArrayArg(getKeyValueArg(relationAttr, 'fields')).length > 0) {
				continue;
			}
			const relationName = relationAttr
				? getPositionalStringArg(relationAttr) ?? asUnquotedString(getKeyValueArg(relationAttr, 'name'))
				: undefined;
			const key = `${pairKey(info.model.name, targetName)}::${relationName ?? ''}`;
			const bucket = buckets.get(key);
			const entry = { modelName: info.model.name, targetModel: targetName, relationName };
			if (bucket) {
				bucket.push(entry);
			} else {
				buckets.set(key, [entry]);
			}
		}
	}

	for (const bucket of buckets.values()) {
		// Both sides must be list-typed and present; a lone side is a dangling/mid-edit relation.
		if (bucket.length !== 2) {
			continue;
		}
		const [first] = bucket;
		const [modelA, modelB] = [first.modelName, first.targetModel].sort();
		const joinTable = first.relationName ? `_${first.relationName}` : `_${modelA}To${modelB}`;

		const sides = [
			{ column: 'A', modelName: modelA },
			{ column: 'B', modelName: modelB },
		];
		const columns: SqlColumn[] = [];
		const pendingForeignKeys: SqlForeignKey[] = [];
		let resolvable = true;

		for (const side of sides) {
			const target = byModelName.get(side.modelName);
			const pkFieldName = target?.primaryKeyFields[0];
			const pkField = pkFieldName ? target?.fields.find((f) => f.name === pkFieldName) : undefined;
			if (!target || !pkFieldName || !pkField) {
				sink.warnings.push(`Implicit many-to-many table "${joinTable}" skipped — "${side.modelName}" has no single-column primary key.`);
				resolvable = false;
				break;
			}
			const referenced = buildColumn(pkField, enumTypeNames, side.column);
			columns.push({
				name: side.column,
				// The join column mirrors the referenced key's type, but is never itself a sequence.
				type: { sql: unwrapSerial(referenced.type.sql), isArray: false },
				isNullable: false,
				isSerial: false,
				warnings: [],
			});
			pendingForeignKeys.push({
				name: `${joinTable}_${side.column}_fkey`,
				table: joinTable,
				columns: [side.column],
				referencedTable: target.tableName,
				referencedColumns: [target.columnNames.get(pkFieldName) ?? pkFieldName],
				onDelete: 'CASCADE',
				onUpdate: 'CASCADE',
			});
		}

		// Only commit once both sides resolved, so a skipped table never leaves dangling foreign keys.
		if (!resolvable) {
			continue;
		}

		sink.foreignKeys.push(...pendingForeignKeys);
		sink.tables.push({ name: joinTable, columns });
		sink.indexes.push(
			{ name: `${joinTable}_AB_unique`, table: joinTable, columns: ['A', 'B'], isUnique: true },
			{ name: `${joinTable}_B_index`, table: joinTable, columns: ['B'], isUnique: false },
		);
	}
}

/** SERIAL/BIGSERIAL are sequence-backed INTEGER/BIGINT — a referencing column needs the plain type. */
function unwrapSerial(sql: string): string {
	switch (sql) {
		case 'SERIAL':
			return 'INTEGER';
		case 'BIGSERIAL':
			return 'BIGINT';
		case 'SMALLSERIAL':
			return 'SMALLINT';
		default:
			return sql;
	}
}
