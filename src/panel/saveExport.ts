import * as vscode from 'vscode';

/**
 * Shows a native save dialog, writes the given bytes, and offers to reveal the result.
 * Shared by every export format so they behave identically; a cancelled dialog is a silent no-op.
 */
export async function saveGeneratedFile(
	contents: Uint8Array,
	suggestedName: string,
	filters: Record<string, string[]>,
): Promise<void> {
	const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
	const defaultUri = workspaceRoot ? vscode.Uri.joinPath(workspaceRoot, suggestedName) : vscode.Uri.file(suggestedName);

	const uri = await vscode.window.showSaveDialog({ defaultUri, filters });
	if (!uri) {
		return;
	}

	try {
		await vscode.workspace.fs.writeFile(uri, contents);
	} catch (error) {
		// Callers invoke this with `void`, so an unhandled rejection here would fail silently.
		vscode.window.showErrorMessage(`Failed to save ${uri.fsPath}: ${error instanceof Error ? error.message : String(error)}`);
		return;
	}

	const reveal = 'Reveal in Explorer';
	const selection = await vscode.window.showInformationMessage(`Exported to ${uri.fsPath}`, reveal);
	if (selection === reveal) {
		await vscode.commands.executeCommand('revealFileInOS', uri);
	}
}
