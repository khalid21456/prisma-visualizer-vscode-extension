import { getSchema, Schema } from '@mrleebo/prisma-ast';

export interface ParseSuccess {
	ok: true;
	schema: Schema;
}

export interface ParseFailure {
	ok: false;
	error: {
		message: string;
		line?: number;
		column?: number;
	};
}

export type ParseResult = ParseSuccess | ParseFailure;

interface ChevrotainLikeError {
	message: string;
	token?: { startLine?: number; startColumn?: number };
}

function isChevrotainLikeError(error: unknown): error is ChevrotainLikeError {
	return typeof error === 'object' && error !== null && 'message' in error;
}

export function parseSchema(source: string): ParseResult {
	try {
		const schema = getSchema(source);
		return { ok: true, schema };
	} catch (error) {
		if (isChevrotainLikeError(error)) {
			return {
				ok: false,
				error: {
					message: error.message,
					line: error.token?.startLine,
					column: error.token?.startColumn,
				},
			};
		}
		return {
			ok: false,
			error: { message: error instanceof Error ? error.message : String(error) },
		};
	}
}
