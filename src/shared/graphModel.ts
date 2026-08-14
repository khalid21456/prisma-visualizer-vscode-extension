export interface FieldInfo {
	name: string;
	type: string;
	isList: boolean;
	isOptional: boolean;
	isId: boolean;
	isUnique: boolean;
	isForeignKey: boolean;
	relationFkFieldNames?: string[];
	documentation?: string;
}

export interface ModelNode {
	name: string;
	dbName?: string;
	fields: FieldInfo[];
}

export interface EnumInfo {
	name: string;
	values: string[];
}

export type RelationCardinality = 'one-to-one' | 'one-to-many' | 'many-to-many';

export interface RelationEdge {
	id: string;
	/** Explicit @relation name, if present. */
	name?: string;
	fromModel: string;
	fromField: string;
	toModel: string;
	toField?: string;
	cardinality: RelationCardinality;
	isSelfRelation: boolean;
	resolved: boolean;
}

export interface GraphModel {
	models: ModelNode[];
	enums: EnumInfo[];
	relations: RelationEdge[];
	warnings: string[];
}
