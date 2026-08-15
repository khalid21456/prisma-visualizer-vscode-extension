import { saveGeneratedFile } from './saveExport';

/** Decodes the webview's rasterized diagram and saves it through the shared export dialog. */
export async function exportDiagramImage(format: 'png', dataBase64: string, suggestedName: string): Promise<void> {
	await saveGeneratedFile(Buffer.from(dataBase64, 'base64'), suggestedName, { Images: [format] });
}
