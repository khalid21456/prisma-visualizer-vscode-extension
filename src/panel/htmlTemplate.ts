import * as vscode from 'vscode';

function nonce(): string {
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	let text = '';
	for (let i = 0; i < 32; i++) {
		text += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return text;
}

export function getHtmlForWebview(webview: vscode.Webview, extensionUri: vscode.Uri): string {
	const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'webview.js'));
	const cspNonce = nonce();

	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' ${webview.cspSource}; script-src 'nonce-${cspNonce}'; img-src data:;" />
	<title>Prisma ERD</title>
	<style>
		html, body, #app { height: 100%; margin: 0; padding: 0; }
		body {
			background: var(--vscode-editor-background);
			font-family: var(--vscode-font-family);
			/* Entity header: a deliberate blue, not a passthrough of the editor's title-bar color. */
			--erd-header-bg: #2a78d6;
			--erd-header-fg: #ffffff;
			--erd-header-accent: #184f95;
			/* Key markers get their own hue each, so PK/FK/unique read apart at a glance. */
			--erd-pk-color: #eda100;
			--erd-fk-color: #4a3aa7;
			--erd-unique-color: #1baf7a;
			/* Relation lines: blue for a resolved relation, orange dashed for a dangling one. */
			--erd-edge-color: #2a78d6;
			--erd-edge-unresolved-color: #eb6834;
			--erd-row-alt-bg: rgba(42, 120, 214, 0.05);
		}
		body.vscode-dark {
			--erd-header-bg: #3987e5;
			--erd-header-accent: #1c5cab;
			--erd-pk-color: #c98500;
			--erd-fk-color: #9085e9;
			--erd-unique-color: #199e70;
			--erd-edge-color: #3987e5;
			--erd-edge-unresolved-color: #d95926;
			--erd-row-alt-bg: rgba(57, 135, 229, 0.08);
		}
		/* High-contrast themes are an accessibility setting, not a look — defer to VS Code's own
		   (contrast-guaranteed) colors instead of asserting a fixed brand blue over them. */
		body.vscode-high-contrast {
			--erd-header-bg: var(--vscode-titleBar-activeBackground, #000000);
			--erd-header-fg: var(--vscode-titleBar-activeForeground, #ffffff);
			--erd-header-accent: var(--vscode-contrastBorder, #6fc3df);
			--erd-pk-color: var(--vscode-terminal-ansiYellow, #f5f543);
			--erd-fk-color: var(--vscode-terminal-ansiMagenta, #d670d6);
			--erd-unique-color: var(--vscode-terminal-ansiCyan, #29b8db);
			--erd-edge-color: var(--vscode-contrastActiveBorder, #6fc3df);
			--erd-edge-unresolved-color: var(--vscode-terminal-ansiYellow, #f5f543);
			--erd-row-alt-bg: transparent;
		}
		#app { position: relative; overflow: hidden; }
		#diagram { width: 100%; height: 100%; }
		#banner {
			display: none;
			position: absolute;
			top: 0; left: 0; right: 0;
			padding: 8px 12px;
			font-size: 12px;
			background: var(--vscode-statusBarItem-warningBackground, #7a5b00);
			color: var(--vscode-statusBarItem-warningForeground, #ffffff);
			border-bottom: 1px solid var(--vscode-contrastBorder, transparent);
			z-index: 1;
		}
		#banner.visible { display: block; }
		#export-button {
			position: absolute;
			bottom: 12px;
			right: 12px;
			z-index: 2;
			padding: 6px 12px;
			font-size: 12px;
			font-family: var(--vscode-font-family);
			border-radius: 4px;
			border: 1px solid var(--vscode-button-border, transparent);
			background: var(--vscode-button-background, #0e639c);
			color: var(--vscode-button-foreground, #ffffff);
			cursor: pointer;
		}
		#export-button:hover:not(:disabled) { background: var(--vscode-button-hoverBackground, #1177bb); }
		#export-button:disabled { opacity: 0.5; cursor: default; }
	</style>
</head>
<body>
	<div id="app">
		<div id="diagram"></div>
		<div id="banner"></div>
		<button id="export-button" type="button" disabled>Export PNG</button>
	</div>
	<script nonce="${cspNonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
