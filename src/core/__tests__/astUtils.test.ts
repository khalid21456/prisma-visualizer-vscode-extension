import assert from 'node:assert/strict';
import { getArrayArg, getFuncArg, getPositionalArgs, unquote } from '../astUtils';

describe('getArrayArg', () => {
	it('reads plain identifier entries', () => {
		assert.deepEqual(getArrayArg({ type: 'array', args: ['a', 'b'] }), ['a', 'b']);
	});

	it('does not throw on an empty array node, which the parser emits with no args key', () => {
		// `@default([])` parses to `{ type: 'array' }` even though RelationArray.args is declared required.
		assert.doesNotThrow(() => getArrayArg({ type: 'array' }));
		assert.deepEqual(getArrayArg({ type: 'array' }), []);
	});

	it('keeps columns that carry modifiers, which parse as function nodes', () => {
		// `@@index([name(sort: Desc), other])`
		const value = {
			type: 'array',
			args: [{ type: 'function', name: 'name', params: [] }, 'other'],
		};
		assert.deepEqual(getArrayArg(value), ['name', 'other']);
	});

	it('strips quotes from string entries', () => {
		assert.deepEqual(getArrayArg({ type: 'array', args: ['"quoted"'] }), ['quoted']);
	});

	it('returns an empty list for non-array values', () => {
		assert.deepEqual(getArrayArg(undefined), []);
		assert.deepEqual(getArrayArg('scalar'), []);
	});
});

describe('getPositionalArgs', () => {
	it('returns every bare argument in order, not just the first', () => {
		// `@db.Decimal(10, 2)` — the second argument is meaningless without the first.
		const attr = {
			args: [
				{ type: 'attributeArgument' as const, value: '10' },
				{ type: 'attributeArgument' as const, value: '2' },
			],
		};
		assert.deepEqual(getPositionalArgs(attr), ['10', '2']);
	});

	it('returns an empty list when the attribute has no args', () => {
		assert.deepEqual(getPositionalArgs({}), []);
	});
});

describe('getFuncArg', () => {
	it('finds a function-valued argument', () => {
		const attr = {
			args: [{ type: 'attributeArgument' as const, value: { type: 'function' as const, name: 'now' } }],
		};
		assert.equal(getFuncArg(attr)?.name, 'now');
	});

	it('returns undefined for a literal argument', () => {
		const attr = { args: [{ type: 'attributeArgument' as const, value: '5' }] };
		assert.equal(getFuncArg(attr), undefined);
	});
});

describe('unquote', () => {
	it('removes surrounding double quotes only', () => {
		assert.equal(unquote('"hello"'), 'hello');
		assert.equal(unquote('hello'), 'hello');
		assert.equal(unquote('"'), '"');
	});
});
