import * as vscode from 'vscode';
import { parseSchema } from '../core/parser';
import { generatePostgresDdl } from '../core/postgresDdl';
import { extractSqlSchema } from '../core/sqlExtractor';
import { saveGeneratedFile } from '../panel/saveExport';
import { resolveSchemaPath } from './resolveSchemaPath';

/** Reads and parses `schemaPath`, then writes its PostgreSQL DDL through the save dialog. */
export async function exportSqlForSchema(schemaPath: string): Promise<void> {
	let source: string;
	try {
		const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(schemaPath));
		source = Buffer.from(bytes).toString('utf8');
	} catch {
		vscode.window.showErrorMessage(`Could not read the Prisma schema at ${schemaPath}.`);
		return;
	}

	const parseResult = parseSchema(source);
	if (!parseResult.ok) {
		const location = parseResult.error.line ? ` (line ${parseResult.error.line})` : '';
		vscode.window.showErrorMessage(`Cannot export SQL — the schema has a syntax error${location}: ${parseResult.error.message}`);
		return;
	}

	let sql: string;
	try {
		sql = generatePostgresDdl(extractSqlSchema(parseResult.schema), { sourcePath: schemaPath });
	} catch (error) {
		vscode.window.showErrorMessage(`Failed to generate SQL: ${error instanceof Error ? error.message : String(error)}`);
		return;
	}

	await saveGeneratedFile(Buffer.from(sql, 'utf8'), 'backup.sql', { SQL: ['sql'] });
}

export function registerExportSqlCommand(): vscode.Disposable {
	return vscode.commands.registerCommand('prisma-visualizer.exportSql', async () => {
		const schemaPath = await resolveSchemaPath();
		if (!schemaPath) {
			vscode.window.showErrorMessage('No schema.prisma found. Set "prisma-visualizer.schemaPath" or create prisma/schema.prisma.');
			return;
		}
		await exportSqlForSchema(schemaPath);
	});
}
