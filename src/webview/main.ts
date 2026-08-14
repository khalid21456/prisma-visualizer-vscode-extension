import { GraphModel } from '../shared/graphModel';
import { HostToWebviewMessage, WebviewToHostMessage } from '../shared/protocol';
import { exportSvgAsPngBase64 } from './exportImage';
import { ViewportController } from './interaction';
import { applyPositionOverrides, computeLayout } from './layout';
import { renderGraph } from './svgRender';

declare function acquireVsCodeApi(): { postMessage: (message: WebviewToHostMessage) => void };

const vscodeApi = acquireVsCodeApi();
let lastRevision = -1;
let lastModel: GraphModel | null = null;
const viewport = new ViewportController();

function getDiagramContainer(): HTMLElement | null {
	return document.getElementById('diagram');
}

function getBanner(): HTMLElement | null {
	return document.getElementById('banner');
}

function getExportButton(): HTMLButtonElement | null {
	return document.getElementById('export-button') as HTMLButtonElement | null;
}

function showBanner(text: string): void {
	const banner = getBanner();
	if (!banner) {
		return;
	}
	banner.textContent = text;
	banner.classList.add('visible');
}

function hideBanner(): void {
	getBanner()?.classList.remove('visible');
}

function renderModel(model: GraphModel): void {
	lastModel = model;
	const container = getDiagramContainer();
	if (!container) {
		return;
	}
	hideBanner();

	const rawLayout = computeLayout(model);
	const layout = applyPositionOverrides(rawLayout, viewport.getDraggedPositions());
	renderGraph(container, model, layout);

	const svg = container.querySelector('svg');
	if (svg) {
		viewport.attach(svg, { x: 0, y: 0, width: layout.width + 80, height: layout.height + 80 }, model, () => {
			if (lastModel) {
				renderModel(lastModel);
			}
		});
	}

	const exportButton = getExportButton();
	if (exportButton) {
		exportButton.disabled = false;
	}
}

async function handleExportClick(): Promise<void> {
	const container = getDiagramContainer();
	const svg = container?.querySelector('svg');
	if (!svg) {
		return;
	}

	const exportButton = getExportButton();
	if (exportButton) {
		exportButton.disabled = true;
		exportButton.textContent = 'Exporting…';
	}

	try {
		const dataBase64 = await exportSvgAsPngBase64(svg);
		vscodeApi.postMessage({ type: 'export', format: 'png', dataBase64, suggestedName: 'prisma-erd.png' });
	} catch (error) {
		showBanner(`Failed to export diagram: ${error instanceof Error ? error.message : String(error)}`);
	} finally {
		if (exportButton) {
			exportButton.disabled = false;
			exportButton.textContent = 'Export PNG';
		}
	}
}

getExportButton()?.addEventListener('click', () => {
	void handleExportClick();
});

window.addEventListener('message', (event: MessageEvent<HostToWebviewMessage>) => {
	const message = event.data;
	if (message.revision <= lastRevision) {
		return;
	}
	lastRevision = message.revision;

	try {
		switch (message.type) {
			case 'model':
				renderModel(message.model);
				break;
			case 'parseError':
				// Keep showing the last successfully-parsed diagram (if any) underneath — most saves
				// during active editing are momentary syntax errors mid-keystroke, and blanking the
				// canvas on every one would be disruptive. The banner alone covers the first-load case.
				showBanner(`Schema parse error: ${message.message}${message.line ? ` (line ${message.line})` : ''}`);
				break;
			case 'schemaMissing':
				showBanner(`No schema.prisma found at ${message.path}. Set "prisma-visualizer.schemaPath" or create prisma/schema.prisma.`);
				break;
		}
	} catch (error) {
		showBanner(`Failed to render diagram: ${error instanceof Error ? error.message : String(error)}`);
	}
});

vscodeApi.postMessage({ type: 'ready' });
