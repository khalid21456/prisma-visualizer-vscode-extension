import { BlockAttribute, Enum, Field, Model, Schema } from '@mrleebo/prisma-ast';
import { EnumInfo, FieldInfo, GraphModel, ModelNode } from '../shared/graphModel';
import { asUnquotedString, getArrayArg, getKeyValueArg, getPositionalStringArg } from './astUtils';
import { deriveRelations, RawRelationField } from './relations';

const PRISMA_SCALARS = new Set(['String', 'Int', 'Float', 'Boolean', 'DateTime', 'Json', 'Bytes', 'Decimal', 'BigInt']);

function fieldTypeName(fieldType: Field['fieldType']): string {
	return typeof fieldType === 'string' ? fieldType : fieldType.name;
}

function isBlockAttribute(prop: Model['properties'][number]): prop is BlockAttribute {
	return prop.type === 'attribute' && prop.kind === 'object';
}

function isField(prop: Model['properties'][number]): prop is Field {
	return prop.type === 'field';
}

/** Extracts field names from an `@@id([...])`/`@@unique([...])` block attribute, if present. */
function compositeKeyFieldNames(attr: BlockAttribute): string[] {
	return getArrayArg(attr.args?.[0]?.value);
}

export function buildGraphModel(schema: Schema): GraphModel {
	const modelBlocks = schema.list.filter((b): b is Model => b.type === 'model');
	const enumBlocks = schema.list.filter((b): b is Enum => b.type === 'enum');

	const modelNames = new Set(modelBlocks.map((m) => m.name));
	const enumNames = new Set(enumBlocks.map((e) => e.name));
	const warnings: string[] = [];

	const enums: EnumInfo[] = enumBlocks.map((e) => ({
		name: e.name,
		values: e.enumerators.filter((en) => en.type === 'enumerator').map((en) => en.name),
	}));

	const models: ModelNode[] = [];
	const rawRelationFields: RawRelationField[] = [];

	for (const model of modelBlocks) {
		const fieldProps = model.properties.filter(isField);
		const blockAttrs = model.properties.filter(isBlockAttribute);

		const compositeKeyFields = new Set<string>();
		let dbName: string | undefined;
		for (const attr of blockAttrs) {
			if (attr.name === 'id' || attr.name === 'unique') {
				for (const fn of compositeKeyFieldNames(attr)) {
					compositeKeyFields.add(fn);
				}
			} else if (attr.name === 'map') {
				dbName = getPositionalStringArg(attr);
			}
		}

		const fields: FieldInfo[] = fieldProps.map((field) => {
			const typeName = fieldTypeName(field.fieldType);
			const isKnownModel = modelNames.has(typeName);
			const isKnownEnum = enumNames.has(typeName);

			const fieldLevelId = Boolean(field.attributes?.some((a) => a.name === 'id'));
			const fieldLevelUnique = Boolean(field.attributes?.some((a) => a.name === 'unique'));

			const relationAttr = field.attributes?.find((a) => a.name === 'relation');
			let relationName: string | undefined;
			let relationFkFieldNames: string[] | undefined;
			let fkReferences: string[] | undefined;

			if (relationAttr) {
				relationName = getPositionalStringArg(relationAttr) ?? asUnquotedString(getKeyValueArg(relationAttr, 'name'));
				const fieldsArg = getKeyValueArg(relationAttr, 'fields');
				const referencesArg = getKeyValueArg(relationAttr, 'references');
				relationFkFieldNames = fieldsArg ? getArrayArg(fieldsArg) : undefined;
				fkReferences = referencesArg ? getArrayArg(referencesArg) : undefined;
			}

			if (isKnownModel && !isKnownEnum) {
				rawRelationFields.push({
					modelName: model.name,
					fieldName: field.name,
					targetModel: typeName,
					isList: Boolean(field.array),
					isOptional: Boolean(field.optional),
					relationName,
					fkFields: relationFkFieldNames,
					fkReferences,
				});
			} else if (!isKnownModel && !isKnownEnum && !PRISMA_SCALARS.has(typeName)) {
				warnings.push(`Model "${model.name}" field "${field.name}" references unknown type "${typeName}".`);
			}

			return {
				name: field.name,
				type: typeName,
				isList: Boolean(field.array),
				isOptional: Boolean(field.optional),
				isId: fieldLevelId || compositeKeyFields.has(field.name),
				isUnique: fieldLevelUnique || compositeKeyFields.has(field.name),
				isForeignKey: false,
				relationFkFieldNames,
				documentation: field.comment,
			};
		});

		models.push({ name: model.name, dbName, fields });
	}

	const { relations, foreignKeyFields, warnings: relationWarnings } = deriveRelations(rawRelationFields, models);

	for (const model of models) {
		for (const field of model.fields) {
			if (foreignKeyFields.has(`${model.name}.${field.name}`)) {
				field.isForeignKey = true;
			}
		}
	}

	return {
		models,
		enums,
		relations,
		warnings: [...warnings, ...relationWarnings],
	};
}
