import { GraphModel } from './graphModel';

export type HostToWebviewMessage =
	| { type: 'model'; revision: number; model: GraphModel }
	| { type: 'parseError'; revision: number; message: string; line?: number; column?: number }
	| { type: 'schemaMissing'; revision: number; path: string };

export type WebviewToHostMessage =
	| { type: 'ready' }
	| { type: 'export'; format: 'png'; dataBase64: string; suggestedName: string }
	// SQL is generated host-side from the full Prisma AST, so the webview only asks; it sends no data.
	| { type: 'exportSql' };
