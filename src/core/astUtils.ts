import { AttributeArgument, Func, KeyValue, RelationArray, Value } from '@mrleebo/prisma-ast';

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

export function isFunc(value: unknown): value is Func {
	return typeof value === 'object' && value !== null && !Array.isArray(value) && (value as Func).type === 'function';
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

/**
 * All bare (non-keyed) arguments in source order — needed where position carries meaning and the
 * first argument alone isn't enough, e.g. `@db.Decimal(10, 2)`. Note the parser hands back every
 * scalar literal as a string, so numeric args arrive as e.g. "10".
 */
export function getPositionalArgs(attr: AttrLike): string[] {
	return (attr.args ?? []).filter((a) => typeof a.value === 'string').map((a) => unquote(a.value as string));
}

/** The first function-valued argument, e.g. `now()` in `@default(now())`. */
export function getFuncArg(attr: AttrLike): Func | undefined {
	const arg = attr.args?.find((a) => isFunc(a.value));
	return arg && isFunc(arg.value) ? arg.value : undefined;
}

/**
 * Reads a `[a, b, c]` style array argument into plain column names.
 *
 * Entries carrying modifiers (`@@index([name(sort: Desc)])`) parse as function nodes rather than
 * strings; we keep the function's name so the column survives, dropping only the modifier. An
 * empty `[]` parses to a node with no `args` at all despite the type declaring it required, so
 * the access has to be optional.
 */
export function getArrayArg(value: unknown): string[] {
	const entries: Value[] | undefined = isRelationArray(value) ? value.args : Array.isArray(value) ? value : undefined;
	if (!entries) {
		return [];
	}
	return entries
		.map((entry) => (typeof entry === 'string' ? unquote(entry) : isFunc(entry) ? entry.name : undefined))
		.filter((name): name is string => name !== undefined);
}

export function asUnquotedString(value: unknown): string | undefined {
	return typeof value === 'string' ? unquote(value) : undefined;
}
