import * as vscode from 'vscode';
import { buildCandidatePaths } from '../core/schemaLocator';

async function findFirstExistingPath(candidates: string[]): Promise<string | undefined> {
	for (const candidate of candidates) {
		try {
			await vscode.workspace.fs.stat(vscode.Uri.file(candidate));
			return candidate;
		} catch {
			// candidate doesn't exist on disk (or isn't reachable) — try the next one
		}
	}
	return undefined;
}

/**
 * Resolves which schema.prisma to use: the configured path, then prisma/schema.prisma, then the
 * active .prisma editor. Falls back to the first candidate when none exist so callers can report
 * a concrete "not found here" path rather than an empty one.
 */
export async function resolveSchemaPath(): Promise<string | undefined> {
	const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	const activeEditor = vscode.window.activeTextEditor;
	const activeEditorPath =
		activeEditor && (activeEditor.document.languageId === 'prisma' || activeEditor.document.fileName.endsWith('.prisma'))
			? activeEditor.document.uri.fsPath
			: undefined;
	const configuredPath = vscode.workspace.getConfiguration('prisma-visualizer').get<string>('schemaPath');

	const candidates = buildCandidatePaths({
		configuredPath: configuredPath || undefined,
		workspaceRoot,
		activeEditorPath,
	});

	return (await findFirstExistingPath(candidates)) ?? candidates[0];
}
