import assert from 'node:assert/strict';
import { GraphModel } from '../../shared/graphModel';
import { buildGraphModel } from '../graphBuilder';
import { parseSchema } from '../parser';
import { loadFixture } from './testUtils';

function buildFromFixture(name: string): GraphModel {
	const result = parseSchema(loadFixture(name));
	assert.equal(result.ok, true, `expected ${name} to parse successfully`);
	if (!result.ok) {
		throw new Error('unreachable');
	}
	return buildGraphModel(result.schema);
}

describe('buildGraphModel', () => {
	it('builds a one-to-many relation with correct field flags', () => {
		const graph = buildFromFixture('simple-one-to-many.prisma');
		assert.equal(graph.models.length, 2);
		assert.equal(graph.relations.length, 1);
		const [relation] = graph.relations;
		assert.equal(relation.cardinality, 'one-to-many');
		assert.equal(relation.resolved, true);

		const post = graph.models.find((m) => m.name === 'Post');
		const authorId = post?.fields.find((f) => f.name === 'authorId');
		assert.equal(authorId?.isForeignKey, true);
	});

	it('builds a one-to-one relation', () => {
		const graph = buildFromFixture('simple-one-to-one.prisma');
		assert.equal(graph.relations.length, 1);
		assert.equal(graph.relations[0].cardinality, 'one-to-one');
	});

	it('builds an implicit many-to-many relation', () => {
		const graph = buildFromFixture('implicit-many-to-many.prisma');
		assert.equal(graph.relations.length, 1);
		assert.equal(graph.relations[0].cardinality, 'many-to-many');
	});

	it('builds a named self-relation', () => {
		const graph = buildFromFixture('self-relation.prisma');
		assert.equal(graph.models.length, 1);
		assert.equal(graph.relations.length, 1);
		assert.equal(graph.relations[0].isSelfRelation, true);
		assert.equal(graph.relations[0].name, 'ManagerReports');
	});

	it('keeps two distinct named self-relations separate', () => {
		const graph = buildFromFixture('self-relation-multiple.prisma');
		assert.equal(graph.relations.length, 2);
		const names = graph.relations.map((r) => r.name).sort();
		assert.deepEqual(names, ['Blocks', 'Friends']);
	});

	it('keeps two named relations to the same target model separate', () => {
		const graph = buildFromFixture('multiple-relations-same-models.prisma');
		assert.equal(graph.relations.length, 2);
		const names = graph.relations.map((r) => r.name).sort();
		assert.deepEqual(names, ['PostAuthor', 'PostEditor']);
	});

	it('does not cross-contaminate a self-relation with a separate shared-model relation', () => {
		const graph = buildFromFixture('mixed-self-and-shared.prisma');
		assert.equal(graph.relations.length, 2);
		assert.equal(graph.relations.filter((r) => r.isSelfRelation).length, 1);
		assert.equal(graph.relations.filter((r) => !r.isSelfRelation).length, 1);
	});

	it('does not mistake enum list fields for relations', () => {
		const graph = buildFromFixture('enum-fields.prisma');
		assert.equal(graph.relations.length, 0);
		assert.equal(graph.enums.length, 1);
		assert.deepEqual(graph.enums[0].values, ['ADMIN', 'USER', 'GUEST']);
	});

	it('carries composite FK column names through to the owning field', () => {
		const graph = buildFromFixture('composite-fk.prisma');
		assert.equal(graph.relations.length, 1);
		const membership = graph.models.find((m) => m.name === 'Membership');
		const orgField = membership?.fields.find((f) => f.name === 'org');
		assert.deepEqual(orgField?.relationFkFieldNames, ['orgCode', 'orgRegion']);
		const orgCode = membership?.fields.find((f) => f.name === 'orgCode');
		const orgRegion = membership?.fields.find((f) => f.name === 'orgRegion');
		assert.equal(orgCode?.isForeignKey, true);
		assert.equal(orgRegion?.isForeignKey, true);
	});

	it('marks a dangling one-sided relation as unresolved without throwing', () => {
		const graph = buildFromFixture('dangling-relation.prisma');
		assert.equal(graph.relations.length, 1);
		assert.equal(graph.relations[0].resolved, false);
		assert.ok(graph.warnings.length > 0);
	});

	it('records a warning for an unresolved model reference without throwing', () => {
		const graph = buildFromFixture('unresolved-model-reference.prisma');
		assert.equal(graph.relations.length, 0);
		assert.ok(graph.warnings.some((w) => w.includes('Usre')));
	});

	it('captures @map/@@map names without affecting relation logic', () => {
		const graph = buildFromFixture('map-attributes.prisma');
		const user = graph.models.find((m) => m.name === 'User');
		assert.equal(user?.dbName, 'users');
		const fullName = user?.fields.find((f) => f.name === 'fullName');
		assert.equal(fullName?.type, 'String');
		assert.equal(graph.relations.length, 0);
	});
});
