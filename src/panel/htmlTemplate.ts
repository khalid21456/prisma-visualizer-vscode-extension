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
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' ${webview.cspSource}; script-src 'nonce-${cspNonce}';" />
	<title>Prisma ERD</title>
	<style>
		html, body, #app { height: 100%; margin: 0; padding: 0; }
		body { background: var(--vscode-editor-background); font-family: var(--vscode-font-family); }
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
	</style>
</head>
<body>
	<div id="app">
		<div id="diagram"></div>
		<div id="banner"></div>
	</div>
	<script nonce="${cspNonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
