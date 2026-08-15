import assert from 'node:assert/strict';
import { parseSchema } from '../parser';
import { SqlSchema } from '../sqlModel';
import { extractSqlSchema } from '../sqlExtractor';
import { loadFixture } from './testUtils';

function extractFromFixture(name: string): SqlSchema {
	const result = parseSchema(loadFixture(name));
	assert.equal(result.ok, true, `expected ${name} to parse successfully`);
	if (!result.ok) {
		throw new Error('unreachable');
	}
	return extractSqlSchema(result.schema);
}

function table(schema: SqlSchema, name: string) {
	const found = schema.tables.find((t) => t.name === name);
	assert.ok(found, `expected a table named ${name}`);
	return found;
}

function column(schema: SqlSchema, tableName: string, columnName: string) {
	const found = table(schema, tableName).columns.find((c) => c.name === columnName);
	assert.ok(found, `expected column ${tableName}.${columnName}`);
	return found;
}

describe('extractSqlSchema — types', () => {
	const schema = extractFromFixture('postgres-native-types.prisma');

	it('reads the datasource provider', () => {
		assert.equal(schema.provider, 'postgresql');
	});

	it('maps native @db types, including parameterized ones', () => {
		assert.equal(column(schema, 'Item', 'code').type.sql, 'VARCHAR(64)');
		assert.equal(column(schema, 'Item', 'label').type.sql, 'TEXT');
		assert.equal(column(schema, 'Item', 'reference').type.sql, 'UUID');
		assert.equal(column(schema, 'Item', 'ratio').type.sql, 'DECIMAL(10,2)');
		assert.equal(column(schema, 'Item', 'quantity').type.sql, 'SMALLINT');
		assert.equal(column(schema, 'Item', 'weight').type.sql, 'REAL');
		assert.equal(column(schema, 'Item', 'recordedAt').type.sql, 'TIMESTAMPTZ(6)');
		assert.equal(column(schema, 'Item', 'payload').type.sql, 'JSONB');
	});

	it('passes an unknown native type through and records a warning instead of dropping it', () => {
		const exotic = column(schema, 'Item', 'exotic');
		assert.equal(exotic.type.sql, 'SOMETHINGUNKNOWN');
		assert.ok(exotic.warnings.some((w) => w.includes('SomethingUnknown')));
	});

	it('folds autoincrement into SERIAL and BIGSERIAL with no separate default', () => {
		const id = column(schema, 'Item', 'id');
		assert.equal(id.type.sql, 'SERIAL');
		assert.equal(id.default, undefined);
		assert.equal(column(schema, 'Event', 'id').type.sql, 'BIGSERIAL');
	});
});

describe('extractSqlSchema — defaults', () => {
	const schema = extractFromFixture('defaults.prisma');

	it('emits no database default for client-side generators', () => {
		assert.equal(column(schema, 'Document', 'publicId').default, undefined);
		assert.equal(column(schema, 'Document', 'legacyId').default, undefined);
	});

	it('quotes string and enum defaults but not numeric or boolean ones', () => {
		assert.deepEqual(column(schema, 'Document', 'title').default, { kind: 'literal', value: 'untitled' });
		assert.deepEqual(column(schema, 'Document', 'status').default, { kind: 'literal', value: 'DRAFT' });
		assert.deepEqual(column(schema, 'Document', 'isArchived').default, { kind: 'expression', value: 'false' });
		assert.deepEqual(column(schema, 'Document', 'views').default, { kind: 'expression', value: '0' });
		assert.deepEqual(column(schema, 'Document', 'rating').default, { kind: 'expression', value: '1.5' });
	});

	it('maps now() and dbgenerated() to SQL expressions', () => {
		assert.deepEqual(column(schema, 'Document', 'createdAt').default, { kind: 'expression', value: 'CURRENT_TIMESTAMP' });
		assert.deepEqual(column(schema, 'Document', 'generated').default, { kind: 'expression', value: 'gen_random_uuid()' });
	});

	it('handles empty and populated list defaults', () => {
		assert.deepEqual(column(schema, 'Document', 'tags').default, { kind: 'emptyArray' });
		assert.deepEqual(column(schema, 'Document', 'presetTags').default, { kind: 'expression', value: "ARRAY['a', 'b']" });
	});

	it('treats array columns as nullable, matching what prisma migrate emits', () => {
		assert.equal(column(schema, 'Document', 'tags').isNullable, true);
	});

	it('creates the enum type from the enum block', () => {
		assert.deepEqual(schema.enums, [{ name: 'Status', values: ['DRAFT', 'PUBLISHED'] }]);
	});
});

describe('extractSqlSchema — keys, indexes and name mapping', () => {
	const schema = extractFromFixture('indexes-and-constraints.prisma');

	it('applies @@map and @map to table and column names', () => {
		assert.ok(schema.tables.some((t) => t.name === 'accounts'));
		assert.ok(table(schema, 'accounts').columns.some((c) => c.name === 'nick_name'));
	});

	it('keeps composite primary key columns ordered', () => {
		assert.deepEqual(table(schema, 'accounts').primaryKey?.columns, ['tenantId', 'accountId']);
		assert.equal(table(schema, 'accounts').primaryKey?.name, 'accounts_pkey');
	});

	it('distinguishes a composite unique constraint from the primary key', () => {
		const unique = schema.indexes.find((i) => i.name === 'accounts_email_region_key');
		assert.ok(unique);
		assert.equal(unique?.isUnique, true);
		assert.deepEqual(unique?.columns, ['email', 'region']);
	});

	it('emits a unique index for a field-level @unique', () => {
		const unique = schema.indexes.find((i) => i.name === 'accounts_email_key');
		assert.equal(unique?.isUnique, true);
	});

	it('emits non-unique indexes for @@index and honors an explicit map name', () => {
		const regionIdx = schema.indexes.find((i) => i.name === 'accounts_region_idx');
		assert.equal(regionIdx?.isUnique, false);
		const named = schema.indexes.find((i) => i.name === 'custom_nickname_idx');
		assert.ok(named, 'expected the @@index(map:) name to be used verbatim');
		assert.deepEqual(named?.columns, ['nick_name']);
	});
});

describe('extractSqlSchema — foreign keys', () => {
	const schema = extractFromFixture('referential-actions.prisma');

	it('honors explicit onDelete and onUpdate actions', () => {
		const fk = schema.foreignKeys.find((f) => f.name === 'Post_authorId_fkey');
		assert.equal(fk?.onDelete, 'CASCADE');
		assert.equal(fk?.onUpdate, 'NO ACTION');
	});

	it("defaults a required relation to Prisma's RESTRICT / CASCADE", () => {
		const fk = schema.foreignKeys.find((f) => f.table === 'Comment');
		assert.equal(fk?.onDelete, 'RESTRICT');
		assert.equal(fk?.onUpdate, 'CASCADE');
	});

	it('defaults an optional relation to SET NULL', () => {
		const fk = schema.foreignKeys.find((f) => f.table === 'Profile');
		assert.equal(fk?.onDelete, 'SET NULL');
	});

	it('uses an explicit constraint name when @relation(map:) is given', () => {
		assert.ok(schema.foreignKeys.some((f) => f.name === 'comment_author_constraint'));
	});

	it('points the foreign key at the referenced table and column', () => {
		const fk = schema.foreignKeys.find((f) => f.name === 'Post_authorId_fkey');
		assert.deepEqual(fk?.columns, ['authorId']);
		assert.equal(fk?.referencedTable, 'User');
		assert.deepEqual(fk?.referencedColumns, ['id']);
	});

	it('does not treat relation fields as columns', () => {
		assert.deepEqual(
			table(schema, 'Post').columns.map((c) => c.name),
			['id', 'authorId'],
		);
	});
});

describe('extractSqlSchema — implicit many-to-many', () => {
	it('materializes the join table Prisma creates implicitly', () => {
		const schema = extractFromFixture('implicit-many-to-many.prisma');
		const join = table(schema, '_PostToTag');
		assert.deepEqual(
			join.columns.map((c) => c.name),
			['A', 'B'],
		);
		// The referenced keys are SERIAL; the join columns must be the plain underlying type.
		assert.equal(join.columns[0].type.sql, 'INTEGER');
		assert.equal(join.primaryKey, undefined);

		assert.ok(schema.indexes.some((i) => i.name === '_PostToTag_AB_unique' && i.isUnique));
		assert.ok(schema.indexes.some((i) => i.name === '_PostToTag_B_index' && !i.isUnique));

		const fkA = schema.foreignKeys.find((f) => f.name === '_PostToTag_A_fkey');
		const fkB = schema.foreignKeys.find((f) => f.name === '_PostToTag_B_fkey');
		assert.equal(fkA?.referencedTable, 'Post', 'A must reference the alphabetically first model');
		assert.equal(fkB?.referencedTable, 'Tag');
		assert.equal(fkA?.onDelete, 'CASCADE');
	});

	it('does not create a join table for a one-to-many relation', () => {
		const schema = extractFromFixture('simple-one-to-many.prisma');
		assert.deepEqual(
			schema.tables.map((t) => t.name).sort(),
			['Post', 'User'],
		);
	});

	it('does not create a join table for a named one-to-many self relation', () => {
		const schema = extractFromFixture('self-relation.prisma');
		assert.deepEqual(schema.tables.map((t) => t.name), ['Employee']);
		assert.equal(schema.foreignKeys.length, 1);
	});

	it('creates one join table per named self many-to-many relation', () => {
		const schema = extractFromFixture('self-relation-multiple.prisma');
		const joinTables = schema.tables.map((t) => t.name).filter((n) => n.startsWith('_')).sort();
		assert.deepEqual(joinTables, ['_Blocks', '_Friends']);
	});
});
