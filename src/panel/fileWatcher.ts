import * as vscode from 'vscode';

const DEBOUNCE_MS = 200;

/**
 * Watches a single schema file for editor saves and external changes, invoking `onChange`
 * (debounced) for either. FileSystemWatcher can fire multiple redundant events per logical save,
 * hence the debounce; onDidSaveTextDocument is the fast path for in-editor saves.
 */
export function watchSchema(schemaPath: string, onChange: () => void): vscode.Disposable {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const scheduleReparse = () => {
		if (timer) {
			clearTimeout(timer);
		}
		timer = setTimeout(onChange, DEBOUNCE_MS);
	};

	const saveListener = vscode.workspace.onDidSaveTextDocument((doc) => {
		if (doc.uri.fsPath === schemaPath) {
			scheduleReparse();
		}
	});

	// A plain absolute path is itself a valid glob pattern — matches only that exact file,
	// and still fires onDidCreate if the file doesn't exist yet (e.g. "schemaMissing" state).
	const fsWatcher = vscode.workspace.createFileSystemWatcher(schemaPath);
	fsWatcher.onDidChange(scheduleReparse);
	fsWatcher.onDidCreate(scheduleReparse);
	fsWatcher.onDidDelete(scheduleReparse);

	return new vscode.Disposable(() => {
		if (timer) {
			clearTimeout(timer);
		}
		saveListener.dispose();
		fsWatcher.dispose();
	});
}
