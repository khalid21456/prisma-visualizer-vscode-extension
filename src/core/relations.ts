import { ModelNode, RelationCardinality, RelationEdge } from '../shared/graphModel';

export interface RawRelationField {
	modelName: string;
	fieldName: string;
	targetModel: string;
	isList: boolean;
	isOptional: boolean;
	relationName?: string;
	/** Scalar FK column names, present only on the side holding `@relation(fields: [...])`. */
	fkFields?: string[];
	fkReferences?: string[];
}

export interface RelationDerivationResult {
	relations: RelationEdge[];
	/** "ModelName.fieldName" keys for scalar columns that back a foreign key. */
	foreignKeyFields: Set<string>;
	warnings: string[];
}

function pairKey(a: string, b: string): string {
	return [a, b].sort().join('::');
}

function isUniqueOrId(models: ModelNode[], modelName: string, fieldNames: string[] | undefined): boolean {
	if (!fieldNames || fieldNames.length === 0) {
		return false;
	}
	const model = models.find((m) => m.name === modelName);
	if (!model) {
		return false;
	}
	return fieldNames.every((fn) => {
		const field = model.fields.find((f) => f.name === fn);
		return field ? field.isId || field.isUnique : false;
	});
}

/**
 * Groups relation fields by unordered model pair + relation name, then resolves cardinality
 * per bucket. This mirrors Prisma's own rule that explicit @relation names are only required
 * to disambiguate self-relations and multiple relations between the same two models — those
 * fields carry distinct names and so land in different buckets rather than colliding.
 */
export function deriveRelations(relationFields: RawRelationField[], models: ModelNode[]): RelationDerivationResult {
	const buckets = new Map<string, RawRelationField[]>();
	for (const rf of relationFields) {
		const key = `${pairKey(rf.modelName, rf.targetModel)}::${rf.relationName ?? ''}`;
		const bucket = buckets.get(key);
		if (bucket) {
			bucket.push(rf);
		} else {
			buckets.set(key, [rf]);
		}
	}

	const relations: RelationEdge[] = [];
	const foreignKeyFields = new Set<string>();
	const warnings: string[] = [];
	let idCounter = 0;

	for (const fields of buckets.values()) {
		const owning = fields.filter((f) => f.fkFields && f.fkFields.length > 0);
		const nonOwning = fields.filter((f) => !f.fkFields || f.fkFields.length === 0);

		if (owning.length >= 1) {
			const owner = owning[0];
			owner.fkFields?.forEach((fn) => foreignKeyFields.add(`${owner.modelName}.${fn}`));
			const counterpart = nonOwning[0];
			const cardinality: RelationCardinality =
				!owner.isList && isUniqueOrId(models, owner.modelName, owner.fkFields) ? 'one-to-one' : 'one-to-many';
			relations.push({
				id: `rel_${idCounter++}`,
				name: owner.relationName,
				fromModel: owner.modelName,
				fromField: owner.fieldName,
				toModel: owner.targetModel,
				toField: counterpart?.fieldName,
				cardinality,
				isSelfRelation: owner.modelName === owner.targetModel,
				resolved: counterpart !== undefined,
			});
			if (owning.length > 1) {
				warnings.push(
					`Multiple owning relation fields found for ${owner.modelName} <-> ${owner.targetModel}` +
						`${owner.relationName ? ` (${owner.relationName})` : ''}; using ${owner.fieldName}.`,
				);
			}
		} else if (fields.length === 2) {
			const [a, b] = fields;
			const bothList = a.isList && b.isList;
			if (!bothList) {
				warnings.push(
					`Relation between ${a.modelName} and ${b.modelName}${a.relationName ? ` (${a.relationName})` : ''} ` +
						'has no @relation/foreign key info on either side; cardinality inferred as one-to-many.',
				);
			}
			relations.push({
				id: `rel_${idCounter++}`,
				name: a.relationName,
				fromModel: a.modelName,
				fromField: a.fieldName,
				toModel: a.targetModel,
				toField: b.fieldName,
				cardinality: bothList ? 'many-to-many' : 'one-to-many',
				isSelfRelation: a.modelName === a.targetModel,
				resolved: true,
			});
		} else if (fields.length === 1) {
			const only = fields[0];
			relations.push({
				id: `rel_${idCounter++}`,
				name: only.relationName,
				fromModel: only.modelName,
				fromField: only.fieldName,
				toModel: only.targetModel,
				toField: undefined,
				cardinality: only.isList ? 'many-to-many' : 'one-to-many',
				isSelfRelation: only.modelName === only.targetModel,
				resolved: false,
			});
			warnings.push(`Relation field ${only.modelName}.${only.fieldName} has no matching back-relation field on ${only.targetModel}.`);
		} else if (fields.length > 2) {
			warnings.push(
				`Unable to fully resolve relation bucket for ${fields.map((f) => `${f.modelName}.${f.fieldName}`).join(', ')}; ` +
					'using the first two fields found.',
			);
			const [a, b] = fields;
			relations.push({
				id: `rel_${idCounter++}`,
				name: a.relationName,
				fromModel: a.modelName,
				fromField: a.fieldName,
				toModel: a.targetModel,
				toField: b.fieldName,
				cardinality: 'one-to-many',
				isSelfRelation: a.modelName === a.targetModel,
				resolved: true,
			});
		}
	}

	return { relations, foreignKeyFields, warnings };
}
