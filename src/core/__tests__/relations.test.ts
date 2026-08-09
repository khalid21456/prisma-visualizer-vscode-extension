import assert from 'node:assert/strict';
import { ModelNode } from '../../shared/graphModel';
import { deriveRelations, RawRelationField } from '../relations';

function field(name: string, overrides: Partial<ModelNode['fields'][number]> = {}): ModelNode['fields'][number] {
	return {
		name,
		type: 'String',
		isList: false,
		isOptional: false,
		isId: false,
		isUnique: false,
		isForeignKey: false,
		...overrides,
	};
}

describe('deriveRelations', () => {
	it('resolves a simple one-to-many relation', () => {
		const models: ModelNode[] = [
			{ name: 'User', fields: [field('id', { isId: true })] },
			{ name: 'Post', fields: [field('authorId')] },
		];
		const raw: RawRelationField[] = [
			{ modelName: 'User', fieldName: 'posts', targetModel: 'Post', isList: true, isOptional: false },
			{ modelName: 'Post', fieldName: 'author', targetModel: 'User', isList: false, isOptional: false, fkFields: ['authorId'] },
		];
		const { relations, foreignKeyFields, warnings } = deriveRelations(raw, models);
		assert.equal(relations.length, 1);
		assert.equal(relations[0].cardinality, 'one-to-many');
		assert.equal(relations[0].resolved, true);
		assert.equal(relations[0].isSelfRelation, false);
		assert.ok(foreignKeyFields.has('Post.authorId'));
		assert.equal(warnings.length, 0);
	});

	it('resolves a one-to-one relation when the FK column is unique', () => {
		const models: ModelNode[] = [
			{ name: 'User', fields: [field('id', { isId: true })] },
			{ name: 'Profile', fields: [field('userId', { isUnique: true })] },
		];
		const raw: RawRelationField[] = [
			{ modelName: 'User', fieldName: 'profile', targetModel: 'Profile', isList: false, isOptional: true },
			{ modelName: 'Profile', fieldName: 'user', targetModel: 'User', isList: false, isOptional: false, fkFields: ['userId'] },
		];
		const { relations } = deriveRelations(raw, models);
		assert.equal(relations.length, 1);
		assert.equal(relations[0].cardinality, 'one-to-one');
	});

	it('resolves an implicit many-to-many relation when both sides are lists with no owner', () => {
		const raw: RawRelationField[] = [
			{ modelName: 'Post', fieldName: 'tags', targetModel: 'Tag', isList: true, isOptional: false },
			{ modelName: 'Tag', fieldName: 'posts', targetModel: 'Post', isList: true, isOptional: false },
		];
		const { relations, warnings } = deriveRelations(raw, []);
		assert.equal(relations.length, 1);
		assert.equal(relations[0].cardinality, 'many-to-many');
		assert.equal(relations[0].resolved, true);
		assert.equal(warnings.length, 0);
	});

	it('resolves a named self-relation without merging it with other buckets', () => {
		const models: ModelNode[] = [{ name: 'Employee', fields: [field('managerId')] }];
		const raw: RawRelationField[] = [
			{
				modelName: 'Employee',
				fieldName: 'manager',
				targetModel: 'Employee',
				isList: false,
				isOptional: true,
				relationName: 'ManagerReports',
				fkFields: ['managerId'],
			},
			{
				modelName: 'Employee',
				fieldName: 'reports',
				targetModel: 'Employee',
				isList: true,
				isOptional: false,
				relationName: 'ManagerReports',
			},
		];
		const { relations } = deriveRelations(raw, models);
		assert.equal(relations.length, 1);
		assert.equal(relations[0].isSelfRelation, true);
		assert.equal(relations[0].cardinality, 'one-to-many');
		assert.equal(relations[0].fromField, 'manager');
		assert.equal(relations[0].toField, 'reports');
	});

	it('keeps two distinct named self-relations on the same model separate', () => {
		const raw: RawRelationField[] = [
			{ modelName: 'User', fieldName: 'friendsOf', targetModel: 'User', isList: true, isOptional: false, relationName: 'Friends' },
			{ modelName: 'User', fieldName: 'friendedBy', targetModel: 'User', isList: true, isOptional: false, relationName: 'Friends' },
			{ modelName: 'User', fieldName: 'blocked', targetModel: 'User', isList: true, isOptional: false, relationName: 'Blocks' },
			{ modelName: 'User', fieldName: 'blockedBy', targetModel: 'User', isList: true, isOptional: false, relationName: 'Blocks' },
		];
		const { relations } = deriveRelations(raw, []);
		assert.equal(relations.length, 2);
		const byName = new Map(relations.map((r) => [r.name, r]));
		assert.deepEqual(new Set(byName.keys()), new Set(['Friends', 'Blocks']));
		assert.equal(byName.get('Friends')?.fromField, 'friendsOf');
		assert.equal(byName.get('Friends')?.toField, 'friendedBy');
		assert.equal(byName.get('Blocks')?.fromField, 'blocked');
		assert.equal(byName.get('Blocks')?.toField, 'blockedBy');
	});

	it('keeps two named relations from one model to the same target model separate', () => {
		const models: ModelNode[] = [{ name: 'Post', fields: [field('authorId'), field('editorId')] }];
		const raw: RawRelationField[] = [
			{ modelName: 'User', fieldName: 'authoredPosts', targetModel: 'Post', isList: true, isOptional: false, relationName: 'PostAuthor' },
			{
				modelName: 'Post',
				fieldName: 'author',
				targetModel: 'User',
				isList: false,
				isOptional: false,
				relationName: 'PostAuthor',
				fkFields: ['authorId'],
			},
			{ modelName: 'User', fieldName: 'editedPosts', targetModel: 'Post', isList: true, isOptional: false, relationName: 'PostEditor' },
			{
				modelName: 'Post',
				fieldName: 'lastEditedBy',
				targetModel: 'User',
				isList: false,
				isOptional: false,
				relationName: 'PostEditor',
				fkFields: ['editorId'],
			},
		];
		const { relations } = deriveRelations(raw, models);
		assert.equal(relations.length, 2);
		const byName = new Map(relations.map((r) => [r.name, r]));
		assert.equal(byName.get('PostAuthor')?.fromField, 'author');
		assert.equal(byName.get('PostEditor')?.fromField, 'lastEditedBy');
	});

	it('does not cross-contaminate a self-relation bucket with a separate shared-model relation', () => {
		const models: ModelNode[] = [{ name: 'Employee', fields: [field('managerId'), field('departmentId')] }];
		const raw: RawRelationField[] = [
			{
				modelName: 'Employee',
				fieldName: 'manager',
				targetModel: 'Employee',
				isList: false,
				isOptional: true,
				relationName: 'ManagerReports',
				fkFields: ['managerId'],
			},
			{
				modelName: 'Employee',
				fieldName: 'reports',
				targetModel: 'Employee',
				isList: true,
				isOptional: false,
				relationName: 'ManagerReports',
			},
			{
				modelName: 'Employee',
				fieldName: 'department',
				targetModel: 'Department',
				isList: false,
				isOptional: false,
				fkFields: ['departmentId'],
			},
			{ modelName: 'Department', fieldName: 'employees', targetModel: 'Employee', isList: true, isOptional: false },
		];
		const { relations } = deriveRelations(raw, models);
		assert.equal(relations.length, 2);
		const self = relations.find((r) => r.isSelfRelation);
		const shared = relations.find((r) => !r.isSelfRelation);
		assert.ok(self);
		assert.ok(shared);
		assert.equal(self?.fromField, 'manager');
		assert.equal(self?.toField, 'reports');
		assert.equal(shared?.fromModel, 'Employee');
		assert.equal(shared?.toModel, 'Department');
	});

	it('marks a one-sided (dangling) relation as unresolved without throwing', () => {
		const raw: RawRelationField[] = [{ modelName: 'Post', fieldName: 'author', targetModel: 'User', isList: false, isOptional: false }];
		const { relations, warnings } = deriveRelations(raw, []);
		assert.equal(relations.length, 1);
		assert.equal(relations[0].resolved, false);
		assert.equal(relations[0].toField, undefined);
		assert.ok(warnings.length > 0);
	});

	it('carries composite (multi-column) FK names through without affecting cardinality', () => {
		const models: ModelNode[] = [{ name: 'Organization', fields: [field('orgCode'), field('region')] }];
		const raw: RawRelationField[] = [
			{
				modelName: 'Membership',
				fieldName: 'org',
				targetModel: 'Organization',
				isList: false,
				isOptional: false,
				fkFields: ['orgCode', 'orgRegion'],
				fkReferences: ['orgCode', 'region'],
			},
			{ modelName: 'Organization', fieldName: 'members', targetModel: 'Membership', isList: true, isOptional: false },
		];
		const { relations, foreignKeyFields } = deriveRelations(raw, models);
		assert.equal(relations.length, 1);
		assert.equal(relations[0].cardinality, 'one-to-many');
		assert.ok(foreignKeyFields.has('Membership.orgCode'));
		assert.ok(foreignKeyFields.has('Membership.orgRegion'));
	});
});
