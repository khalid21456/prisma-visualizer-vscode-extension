import { AttributeArgument, KeyValue, RelationArray, Value } from '@mrleebo/prisma-ast';

/** Structural shape shared by field-level Attribute and block-level BlockAttribute nodes. */
interface AttrLike {
	args?: AttributeArgument[];
}

export function unquote(value: string): string {
	if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
		return value.slice(1, -1);
	}
	return value;
}

function isKeyValue(value: unknown): value is KeyValue {
	return typeof value === 'object' && value !== null && !Array.isArray(value) && (value as KeyValue).type === 'keyValue';
}

function isRelationArray(value: unknown): value is RelationArray {
	return typeof value === 'object' && value !== null && !Array.isArray(value) && (value as RelationArray).type === 'array';
}

/** Finds a `key: value` attribute argument, e.g. `fields` in `@relation(fields: [id])`. */
export function getKeyValueArg(attr: AttrLike, key: string): Value | undefined {
	const arg = attr.args?.find((a) => isKeyValue(a.value) && a.value.key === key);
	return arg && isKeyValue(arg.value) ? arg.value.value : undefined;
}

/** Finds the first bare (non-keyed) string argument, e.g. the relation name in `@relation("Name", ...)`. */
export function getPositionalStringArg(attr: AttrLike): string | undefined {
	const arg = attr.args?.find((a) => typeof a.value === 'string');
	return typeof arg?.value === 'string' ? unquote(arg.value) : undefined;
}

/** Reads a `[a, b, c]` style array argument value into plain identifier/string names. */
export function getArrayArg(value: unknown): string[] {
	if (isRelationArray(value)) {
		return value.args.filter((v): v is string => typeof v === 'string').map(unquote);
	}
	if (Array.isArray(value)) {
		return value.filter((v): v is string => typeof v === 'string').map(unquote);
	}
	return [];
}

export function asUnquotedString(value: unknown): string | undefined {
	return typeof value === 'string' ? unquote(value) : undefined;
}
