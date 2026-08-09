import { GraphModel } from './graphModel';

export type HostToWebviewMessage =
	| { type: 'model'; revision: number; model: GraphModel }
	| { type: 'parseError'; revision: number; message: string; line?: number; column?: number }
	| { type: 'schemaMissing'; revision: number; path: string };

export type WebviewToHostMessage = { type: 'ready' };
