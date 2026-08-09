import assert from 'node:assert/strict';
import { parseSchema } from '../parser';
import { loadFixture } from './testUtils';

describe('parseSchema', () => {
	it('parses a valid schema into models', () => {
		const result = parseSchema(loadFixture('simple-one-to-many.prisma'));
		assert.equal(result.ok, true);
		if (result.ok) {
			const modelNames = result.schema.list.filter((b) => b.type === 'model').map((b) => b.name);
			assert.deepEqual(modelNames.sort(), ['Post', 'User']);
		}
	});

	it('returns a failure result instead of throwing on malformed syntax', () => {
		const result = parseSchema(loadFixture('malformed-syntax.prisma'));
		assert.equal(result.ok, false);
		if (!result.ok) {
			assert.equal(typeof result.error.message, 'string');
			assert.ok(result.error.message.length > 0);
		}
	});

	it('never throws, even on empty input', () => {
		assert.doesNotThrow(() => parseSchema(''));
	});
});
