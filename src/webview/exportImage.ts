const SVG_NS = 'http://www.w3.org/2000/svg';
// Render at a higher pixel density than the on-screen viewBox so the exported PNG stays crisp.
const EXPORT_SCALE = 2;

/**
 * Copies each source element's resolved (computed) fill/stroke/color/etc onto the corresponding
 * clone element as an inline style. The live SVG's colors come from var(--vscode-*) custom
 * properties defined by VS Code's webview host — those references would be meaningless once the
 * SVG is serialized and rasterized standalone, so this bakes in literal values matching whatever
 * theme is currently active.
 */
function inlineComputedColors(source: Element, target: Element): void {
	if (source instanceof SVGElement && target instanceof SVGElement) {
		const computed = window.getComputedStyle(source);
		const declarations = ['fill', 'stroke', 'color', 'stop-color', 'font-family']
			.map((prop) => {
				const value = computed.getPropertyValue(prop);
				return value ? `${prop}:${value}` : '';
			})
			.filter(Boolean);
		if (declarations.length) {
			const existing = target.getAttribute('style');
			target.setAttribute('style', existing ? `${existing};${declarations.join(';')}` : declarations.join(';'));
		}
	}

	const sourceChildren = Array.from(source.children);
	const targetChildren = Array.from(target.children);
	sourceChildren.forEach((child, i) => {
		const targetChild = targetChildren[i];
		if (targetChild) {
			inlineComputedColors(child, targetChild);
		}
	});
}

function buildExportSvgString(liveSvg: SVGSVGElement): { svgString: string; width: number; height: number } {
	const viewBox = liveSvg.viewBox.baseVal;
	const width = Math.ceil(viewBox.width || liveSvg.clientWidth || 800);
	const height = Math.ceil(viewBox.height || liveSvg.clientHeight || 600);

	const clone = liveSvg.cloneNode(true) as SVGSVGElement;
	inlineComputedColors(liveSvg, clone);
	clone.setAttribute('xmlns', SVG_NS);
	clone.setAttribute('width', String(width));
	clone.setAttribute('height', String(height));
	clone.removeAttribute('style');

	const backgroundColor = window.getComputedStyle(document.body).getPropertyValue('background-color') || '#1e1e1e';
	const background = document.createElementNS(SVG_NS, 'rect');
	background.setAttribute('x', String(viewBox.x || 0));
	background.setAttribute('y', String(viewBox.y || 0));
	background.setAttribute('width', String(width));
	background.setAttribute('height', String(height));
	background.setAttribute('fill', backgroundColor);
	clone.insertBefore(background, clone.firstChild);

	return { svgString: new XMLSerializer().serializeToString(clone), width, height };
}

async function rasterizeToPngBlob(liveSvg: SVGSVGElement): Promise<Blob> {
	const { svgString, width, height } = buildExportSvgString(liveSvg);
	const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`;

	const image = new Image();
	await new Promise<void>((resolve, reject) => {
		image.onload = () => resolve();
		image.onerror = () => reject(new Error('Failed to rasterize the diagram'));
		image.src = dataUrl;
	});

	const canvas = document.createElement('canvas');
	canvas.width = width * EXPORT_SCALE;
	canvas.height = height * EXPORT_SCALE;
	const ctx = canvas.getContext('2d');
	if (!ctx) {
		throw new Error('Canvas 2D context is unavailable');
	}
	ctx.scale(EXPORT_SCALE, EXPORT_SCALE);
	ctx.drawImage(image, 0, 0, width, height);

	const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
	if (!blob) {
		throw new Error('Failed to encode the diagram as PNG');
	}
	return blob;
}

function blobToBase64(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onloadend = () => {
			const result = reader.result as string;
			resolve(result.slice(result.indexOf(',') + 1));
		};
		reader.onerror = () => reject(reader.error ?? new Error('Failed to read the rendered PNG'));
		reader.readAsDataURL(blob);
	});
}

/** Rasterizes the given SVG (with the current theme's colors baked in) to a base64 PNG string. */
export async function exportSvgAsPngBase64(liveSvg: SVGSVGElement): Promise<string> {
	const blob = await rasterizeToPngBlob(liveSvg);
	return blobToBase64(blob);
}
