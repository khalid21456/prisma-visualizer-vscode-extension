import * as vscode from 'vscode';
import { GraphModel } from '../shared/graphModel';
import { HostToWebviewMessage, WebviewToHostMessage } from '../shared/protocol';
import { watchSchema } from './fileWatcher';
import { getHtmlForWebview } from './htmlTemplate';

type PanelState =
	| { kind: 'model'; model: GraphModel }
	| { kind: 'parseError'; message: string; line?: number; column?: number }
	| { kind: 'schemaMissing'; path: string };

/** Singleton WebviewPanel wrapper: owns the "ready" handshake and revision-tagged pushes. */
export class ErdPanel {
	private static current: ErdPanel | undefined;

	private readonly disposables: vscode.Disposable[] = [];
	private revision = 0;
	private latestState: PanelState | undefined;
	private webviewReady = false;
	private watcherDisposable: vscode.Disposable | undefined;

	private constructor(
		private readonly panel: vscode.WebviewPanel,
		extensionUri: vscode.Uri,
	) {
		this.panel.webview.html = getHtmlForWebview(this.panel.webview, extensionUri);
		this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
		this.panel.webview.onDidReceiveMessage(
			(message: WebviewToHostMessage) => {
				if (message.type === 'ready') {
					this.webviewReady = true;
					this.pushLatestState();
				}
			},
			null,
			this.disposables,
		);
	}

	static show(extensionUri: vscode.Uri): ErdPanel {
		if (ErdPanel.current) {
			ErdPanel.current.panel.reveal(vscode.ViewColumn.Beside);
			return ErdPanel.current;
		}
		const panel = vscode.window.createWebviewPanel('prismaVisualizer.erd', 'Prisma ERD', vscode.ViewColumn.Beside, {
			enableScripts: true,
			retainContextWhenHidden: true,
			localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist')],
		});
		ErdPanel.current = new ErdPanel(panel, extensionUri);
		return ErdPanel.current;
	}

	/** Re-establishes the file watcher for `schemaPath`, replacing any previous one. */
	watchSchema(schemaPath: string, onChange: () => void): void {
		this.watcherDisposable?.dispose();
		this.watcherDisposable = watchSchema(schemaPath, onChange);
	}

	setModel(model: GraphModel): void {
		this.revision++;
		this.latestState = { kind: 'model', model };
		this.pushLatestState();
	}

	setParseError(message: string, line?: number, column?: number): void {
		this.revision++;
		this.latestState = { kind: 'parseError', message, line, column };
		this.pushLatestState();
	}

	setSchemaMissing(path: string): void {
		this.revision++;
		this.latestState = { kind: 'schemaMissing', path };
		this.pushLatestState();
	}

	private pushLatestState(): void {
		if (!this.webviewReady || !this.latestState) {
			return;
		}
		this.panel.webview.postMessage(this.toMessage(this.latestState));
	}

	private toMessage(state: PanelState): HostToWebviewMessage {
		switch (state.kind) {
			case 'model':
				return { type: 'model', revision: this.revision, model: state.model };
			case 'parseError':
				return { type: 'parseError', revision: this.revision, message: state.message, line: state.line, column: state.column };
			case 'schemaMissing':
				return { type: 'schemaMissing', revision: this.revision, path: state.path };
		}
	}

	private dispose(): void {
		ErdPanel.current = undefined;
		this.watcherDisposable?.dispose();
		while (this.disposables.length) {
			this.disposables.pop()?.dispose();
		}
	}
}
