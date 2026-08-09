import * as vscode from 'vscode';
import { registerShowErdCommand } from './commands/showErd';

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(registerShowErdCommand(context));
}

export function deactivate() {}
