import { isAbsolute, join } from 'path';

export interface LocateSchemaOptions {
	/** From the `prisma-visualizer.schemaPath` setting; relative to workspaceRoot unless absolute. */
	configuredPath?: string;
	workspaceRoot?: string;
	/** Absolute path of the active .prisma editor, if any, used as a last-resort fallback. */
	activeEditorPath?: string;
}

/** Candidate paths in priority order: explicit setting > default prisma/schema.prisma > active editor. */
export function buildCandidatePaths(options: LocateSchemaOptions): string[] {
	const { configuredPath, workspaceRoot, activeEditorPath } = options;
	const candidates: string[] = [];

	if (configuredPath) {
		candidates.push(isAbsolute(configuredPath) || !workspaceRoot ? configuredPath : join(workspaceRoot, configuredPath));
	}
	if (workspaceRoot) {
		candidates.push(join(workspaceRoot, 'prisma', 'schema.prisma'));
	}
	if (activeEditorPath) {
		candidates.push(activeEditorPath);
	}

	return candidates;
}

/** Pure resolution: returns the first candidate path that `fileExists` accepts, if any. */
export function locateSchema(options: LocateSchemaOptions, fileExists: (path: string) => boolean): string | undefined {
	return buildCandidatePaths(options).find(fileExists);
}
