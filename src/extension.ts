import * as vscode from 'vscode';
import { registerExportSqlCommand } from './commands/exportSql';
import { registerShowErdCommand } from './commands/showErd';

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(registerShowErdCommand(context), registerExportSqlCommand());
}

export function deactivate() {}
