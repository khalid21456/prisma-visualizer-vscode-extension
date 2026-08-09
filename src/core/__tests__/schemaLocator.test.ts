import assert from 'node:assert/strict';
import { join } from 'path';
import { locateSchema } from '../schemaLocator';

describe('locateSchema', () => {
	const workspaceRoot = join('C:', 'workspace');
	const defaultPath = join(workspaceRoot, 'prisma', 'schema.prisma');
	const activeEditorPath = join(workspaceRoot, 'other', 'schema.prisma');
	const configuredRelative = 'db/schema.prisma';
	const configuredAbsolute = join('D:', 'external', 'schema.prisma');

	it('prefers an explicit configured path (resolved relative to the workspace root) over the default', () => {
		const exists = (p: string) => p === join(workspaceRoot, configuredRelative) || p === defaultPath;
		const result = locateSchema({ configuredPath: configuredRelative, workspaceRoot, activeEditorPath }, exists);
		assert.equal(result, join(workspaceRoot, configuredRelative));
	});

	it('uses an absolute configured path as-is', () => {
		const exists = (p: string) => p === configuredAbsolute;
		const result = locateSchema({ configuredPath: configuredAbsolute, workspaceRoot }, exists);
		assert.equal(result, configuredAbsolute);
	});

	it('falls back to prisma/schema.prisma under the workspace root when no override is configured', () => {
		const exists = (p: string) => p === defaultPath;
		const result = locateSchema({ workspaceRoot, activeEditorPath }, exists);
		assert.equal(result, defaultPath);
	});

	it('falls back to the active editor path when neither the setting nor the default exist', () => {
		const exists = (p: string) => p === activeEditorPath;
		const result = locateSchema({ workspaceRoot, activeEditorPath }, exists);
		assert.equal(result, activeEditorPath);
	});

	it('returns undefined when nothing exists', () => {
		const result = locateSchema({ workspaceRoot, activeEditorPath }, () => false);
		assert.equal(result, undefined);
	});
});
