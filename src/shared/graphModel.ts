export interface FieldInfo {
	name: string;
	/** Base type name with `[]` and `?` stripped, e.g. "User", "String", "Role". */
	type: string;
	isList: boolean;
	isOptional: boolean;
	isId: boolean;
	isUnique: boolean;
	isForeignKey: boolean;
	/** Scalar FK column names, e.g. ["authorId"], present on the owning side of a relation. */
	relationFkFieldNames?: string[];
	documentation?: string;
}

export interface ModelNode {
	name: string;
	/** From @@map, informational only — not resolved further in v1. */
	dbName?: string;
	fields: FieldInfo[];
}

export interface EnumInfo {
	name: string;
	values: string[];
}

export type RelationCardinality = 'one-to-one' | 'one-to-many' | 'many-to-many';

export interface RelationEdge {
	/** Synthetic stable id. */
	id: string;
	/** Explicit @relation name, if present. */
	name?: string;
	fromModel: string;
	fromField: string;
	toModel: string;
	/** Undefined if the counterpart field wasn't found (dangling/mid-edit relation). */
	toField?: string;
	cardinality: RelationCardinality;
	isSelfRelation: boolean;
	/** False when only one side of the relation could be resolved. */
	resolved: boolean;
}

export interface GraphModel {
	models: ModelNode[];
	enums: EnumInfo[];
	relations: RelationEdge[];
	/** Non-fatal issues, e.g. unresolved model references. */
	warnings: string[];
}
