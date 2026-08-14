import * as vscode from 'vscode';

/** Shows a native save dialog and writes the decoded image to disk, then offers to reveal it. */
export async function exportDiagramImage(format: 'png', dataBase64: string, suggestedName: string): Promise<void> {
	const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
	const defaultUri = workspaceRoot ? vscode.Uri.joinPath(workspaceRoot, suggestedName) : vscode.Uri.file(suggestedName);

	const uri = await vscode.window.showSaveDialog({
		defaultUri,
		filters: format === 'png' ? { Images: ['png'] } : undefined,
	});
	if (!uri) {
		return;
	}

	await vscode.workspace.fs.writeFile(uri, Buffer.from(dataBase64, 'base64'));

	const reveal = 'Reveal in Explorer';
	const selection = await vscode.window.showInformationMessage(`Exported ERD to ${uri.fsPath}`, reveal);
	if (selection === reveal) {
		await vscode.commands.executeCommand('revealFileInOS', uri);
	}
}
