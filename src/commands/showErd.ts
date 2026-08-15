import * as vscode from 'vscode';
import { buildGraphModel } from '../core/graphBuilder';
import { parseSchema } from '../core/parser';
import { ErdPanel } from '../panel/erdPanel';
import { exportSqlForSchema } from './exportSql';
import { resolveSchemaPath } from './resolveSchemaPath';

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
		const schemaPath = await resolveSchemaPath();
		const panel = ErdPanel.show(context.extensionUri);

		if (!schemaPath) {
			panel.setSchemaMissing('prisma/schema.prisma');
			return;
		}

		await loadAndPushSchema(panel, schemaPath);
		panel.watchSchema(schemaPath, () => {
			void loadAndPushSchema(panel, schemaPath);
		});
		panel.onExportSql(() => exportSqlForSchema(schemaPath));
	});
}
