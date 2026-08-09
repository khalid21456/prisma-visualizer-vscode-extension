import * as vscode from 'vscode';
import { buildGraphModel } from '../core/graphBuilder';
import { parseSchema } from '../core/parser';
import { buildCandidatePaths } from '../core/schemaLocator';
import { ErdPanel } from '../panel/erdPanel';

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

/** Reads, parses, and pushes `schemaPath` to `panel`, surfacing missing-file/parse-error states inline. */
export async function loadAndPushSchema(panel: ErdPanel, schemaPath: string): Promise<void> {
	let source: string;
	try {
		const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(schemaPath));
		source = Buffer.from(bytes).toString('utf8');
	} catch {
		panel.setSchemaMissing(schemaPath);
		return;
	}

	const parseResult = parseSchema(source);
	if (!parseResult.ok) {
		panel.setParseError(parseResult.error.message, parseResult.error.line, parseResult.error.column);
		return;
	}
	panel.setModel(buildGraphModel(parseResult.schema));
}

export function registerShowErdCommand(context: vscode.ExtensionContext): vscode.Disposable {
	return vscode.commands.registerCommand('prisma-visualizer.showERD', async () => {
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
		const schemaPath = (await findFirstExistingPath(candidates)) ?? candidates[0];

		const panel = ErdPanel.show(context.extensionUri);

		if (!schemaPath) {
			panel.setSchemaMissing('prisma/schema.prisma');
			return;
		}

		await loadAndPushSchema(panel, schemaPath);
		panel.watchSchema(schemaPath, () => {
			void loadAndPushSchema(panel, schemaPath);
		});
	});
}
