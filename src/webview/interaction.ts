import { GraphModel } from '../shared/graphModel';
import { clipToRectBoundary, Rect } from './layout';

export interface ViewBox {
	x: number;
	y: number;
	width: number;
	height: number;
}

const MIN_SCALE = 0.2;
const MAX_SCALE = 3;

function viewBoxToString(vb: ViewBox): string {
	return `${vb.x} ${vb.y} ${vb.width} ${vb.height}`;
}

function getNodeRect(svg: SVGSVGElement, modelName: string): Rect | null {
	const group = svg.querySelector<SVGGElement>(`.erd-node[data-model="${modelName}"]`);
	const rect = group?.querySelector('rect');
	if (!group || !rect) {
		return null;
	}
	const matrix = group.transform.baseVal.consolidate()?.matrix;
	return {
		x: matrix?.e ?? 0,
		y: matrix?.f ?? 0,
		width: Number(rect.getAttribute('width')) || 0,
		height: Number(rect.getAttribute('height')) || 0,
	};
}

interface ConnectedEdge {
	path: SVGPathElement;
	fromLabel: SVGTextElement | null;
	toLabel: SVGTextElement | null;
	otherModel: string;
	draggedIsFrom: boolean;
	isSelfLoop: boolean;
}

interface DragState {
	modelName: string;
	group: SVGGElement;
	startX: number;
	startY: number;
	originX: number;
	originY: number;
	width: number;
	height: number;
	connectedEdges: ConnectedEdge[];
}

/**
 * Owns pan/zoom viewBox state and user-dragged node positions across re-renders. The SVG element
 * itself is recreated on every render (renderGraph clears the container), so this state must live
 * outside it — attach() is called again after each render to re-wire listeners and reapply state.
 *
 * All listeners are scoped to an AbortController that's aborted at the start of each attach() call,
 * so re-attaching on every render never leaves stale window-level listeners behind.
 */
export class ViewportController {
	private viewBox: ViewBox | null = null;
	/** The un-zoomed diagram width, fixed at first render — the baseline MIN_SCALE/MAX_SCALE clamp against. */
	private baseWidth = 800;
	private readonly draggedPositions = new Map<string, { x: number; y: number }>();
	private highlighted: string | null = null;
	private abortController: AbortController | null = null;

	getDraggedPositions(): Map<string, { x: number; y: number }> {
		return this.draggedPositions;
	}

	attach(svg: SVGSVGElement, defaultViewBox: ViewBox, model: GraphModel, onNodeDragEnd: () => void): void {
		this.abortController?.abort();
		this.abortController = new AbortController();
		const { signal } = this.abortController;

		if (!this.viewBox) {
			this.viewBox = { ...defaultViewBox };
			this.baseWidth = defaultViewBox.width;
		}
		svg.setAttribute('viewBox', viewBoxToString(this.viewBox));
		svg.style.cursor = 'grab';

		this.wirePanAndZoom(svg, signal);
		this.wireNodeDrag(svg, signal, onNodeDragEnd);
		this.wireHighlight(svg, model, signal);
		this.applyHighlight(svg, model);
	}

	private wirePanAndZoom(svg: SVGSVGElement, signal: AbortSignal): void {
		let panning = false;
		let lastClientX = 0;
		let lastClientY = 0;

		svg.addEventListener(
			'mousedown',
			(event) => {
				if ((event.target as Element).closest('.erd-node')) {
					return;
				}
				panning = true;
				lastClientX = event.clientX;
				lastClientY = event.clientY;
				svg.style.cursor = 'grabbing';
			},
			{ signal },
		);

		window.addEventListener(
			'mousemove',
			(event) => {
				if (!panning || !this.viewBox) {
					return;
				}
				const scale = this.viewBox.width / svg.clientWidth;
				this.viewBox.x -= (event.clientX - lastClientX) * scale;
				this.viewBox.y -= (event.clientY - lastClientY) * scale;
				lastClientX = event.clientX;
				lastClientY = event.clientY;
				svg.setAttribute('viewBox', viewBoxToString(this.viewBox));
			},
			{ signal },
		);

		window.addEventListener(
			'mouseup',
			() => {
				if (panning) {
					panning = false;
					svg.style.cursor = 'grab';
				}
			},
			{ signal },
		);

		svg.addEventListener(
			'wheel',
			(event) => {
				if (!this.viewBox) {
					return;
				}
				event.preventDefault();
				const zoomFactor = Math.exp(event.deltaY * 0.001);
				const proposedWidth = this.viewBox.width * zoomFactor;
				const clampedWidth = Math.min(Math.max(proposedWidth, MIN_SCALE * this.baseWidth), MAX_SCALE * this.baseWidth);
				const appliedScale = clampedWidth / this.viewBox.width;

				const rect = svg.getBoundingClientRect();
				const cursorRatioX = (event.clientX - rect.left) / rect.width;
				const cursorRatioY = (event.clientY - rect.top) / rect.height;

				this.viewBox.x += this.viewBox.width * cursorRatioX * (1 - appliedScale);
				this.viewBox.y += this.viewBox.height * cursorRatioY * (1 - appliedScale);
				this.viewBox.width *= appliedScale;
				this.viewBox.height *= appliedScale;
				svg.setAttribute('viewBox', viewBoxToString(this.viewBox));
			},
			{ passive: false, signal },
		);
	}

	private wireNodeDrag(svg: SVGSVGElement, signal: AbortSignal, onNodeDragEnd: () => void): void {
		let dragging: DragState | null = null;

		svg.addEventListener(
			'mousedown',
			(event) => {
				const target = event.target as Element;
				const group = target.closest('.erd-node') as SVGGElement | null;
				if (!group) {
					return;
				}
				event.stopPropagation();
				const modelName = group.getAttribute('data-model');
				if (!modelName || !this.viewBox) {
					return;
				}

				const rectEl = group.querySelector('rect');
				const matrix = group.transform.baseVal.consolidate()?.matrix;

				const connectedEdges: ConnectedEdge[] = [];
				svg.querySelectorAll<SVGPathElement>('.erd-edge').forEach((path) => {
					const from = path.getAttribute('data-from');
					const to = path.getAttribute('data-to');
					if (from !== modelName && to !== modelName) {
						return;
					}
					const edgeId = path.getAttribute('data-edge-id');
					const isSelfLoop = path.classList.contains('erd-self-loop');
					connectedEdges.push({
						path,
						fromLabel: edgeId ? svg.querySelector<SVGTextElement>(`text[data-edge-id="${edgeId}"][data-end="from"]`) : null,
						toLabel: edgeId ? svg.querySelector<SVGTextElement>(`text[data-edge-id="${edgeId}"][data-end="to"]`) : null,
						otherModel: from === modelName ? (to ?? modelName) : (from ?? modelName),
						draggedIsFrom: from === modelName,
						isSelfLoop,
					});
				});

				dragging = {
					modelName,
					group,
					startX: event.clientX,
					startY: event.clientY,
					originX: matrix?.e ?? 0,
					originY: matrix?.f ?? 0,
					width: Number(rectEl?.getAttribute('width')) || 0,
					height: Number(rectEl?.getAttribute('height')) || 0,
					connectedEdges,
				};
			},
			{ signal },
		);

		window.addEventListener(
			'mousemove',
			(event) => {
				if (!dragging || !this.viewBox) {
					return;
				}
				const scale = this.viewBox.width / svg.clientWidth;
				const dx = (event.clientX - dragging.startX) * scale;
				const dy = (event.clientY - dragging.startY) * scale;
				const x = dragging.originX + dx;
				const y = dragging.originY + dy;
				dragging.group.setAttribute('transform', `translate(${x}, ${y})`);

				const draggedRect: Rect = { x, y, width: dragging.width, height: dragging.height };
				const draggedCenter = { x: x + dragging.width / 2, y: y + dragging.height / 2 };

				for (const edge of dragging.connectedEdges) {
					if (edge.isSelfLoop) {
						edge.path.setAttribute('transform', `translate(${dx}, ${dy})`);
						const loopLabel = edge.path.getAttribute('data-edge-id');
						if (loopLabel) {
							svg
								.querySelector<SVGTextElement>(`text[data-edge-id="${loopLabel}"][data-end="loop"]`)
								?.setAttribute('transform', `translate(${dx}, ${dy})`);
						}
						continue;
					}
					const otherRect = getNodeRect(svg, edge.otherModel);
					if (!otherRect) {
						continue;
					}
					const otherCenter = { x: otherRect.x + otherRect.width / 2, y: otherRect.y + otherRect.height / 2 };
					const draggedExit = clipToRectBoundary(draggedRect, otherCenter.x, otherCenter.y);
					const otherExit = clipToRectBoundary(otherRect, draggedCenter.x, draggedCenter.y);
					const fromPoint = edge.draggedIsFrom ? draggedExit : otherExit;
					const toPoint = edge.draggedIsFrom ? otherExit : draggedExit;

					edge.path.setAttribute('d', `M ${fromPoint.x} ${fromPoint.y} L ${toPoint.x} ${toPoint.y}`);
					edge.fromLabel?.setAttribute('x', String(fromPoint.x + 4));
					edge.fromLabel?.setAttribute('y', String(fromPoint.y - 4));
					edge.toLabel?.setAttribute('x', String(toPoint.x - 12));
					edge.toLabel?.setAttribute('y', String(toPoint.y - 4));
				}
			},
			{ signal },
		);

		window.addEventListener(
			'mouseup',
			() => {
				if (!dragging) {
					return;
				}
				const matrix = dragging.group.transform.baseVal.consolidate()?.matrix;
				this.draggedPositions.set(dragging.modelName, { x: matrix?.e ?? 0, y: matrix?.f ?? 0 });
				dragging = null;
				onNodeDragEnd();
			},
			{ signal },
		);
	}

	private wireHighlight(svg: SVGSVGElement, model: GraphModel, signal: AbortSignal): void {
		svg.addEventListener(
			'click',
			(event) => {
				const target = event.target as Element;
				const group = target.closest('.erd-node') as SVGGElement | null;
				const modelName = group?.getAttribute('data-model') ?? null;
				this.highlighted = this.highlighted === modelName ? null : modelName;
				this.applyHighlight(svg, model);
			},
			{ signal },
		);
	}

	private applyHighlight(svg: SVGSVGElement, model: GraphModel): void {
		const highlighted = this.highlighted;
		const nodes = svg.querySelectorAll<SVGGElement>('.erd-node');
		const edges = svg.querySelectorAll<SVGElement>('.erd-edge');

		if (!highlighted) {
			nodes.forEach((n) => (n.style.opacity = '1'));
			edges.forEach((e) => (e.style.opacity = '1'));
			return;
		}

		const relatedModels = new Set<string>([highlighted]);
		const relatedEdgeIds = new Set<string>();
		for (const rel of model.relations) {
			if (rel.fromModel === highlighted || rel.toModel === highlighted) {
				relatedModels.add(rel.fromModel);
				relatedModels.add(rel.toModel);
				relatedEdgeIds.add(rel.id);
			}
		}

		nodes.forEach((n) => {
			const name = n.getAttribute('data-model');
			n.style.opacity = name && relatedModels.has(name) ? '1' : '0.35';
		});
		edges.forEach((e) => {
			const id = e.getAttribute('data-edge-id');
			e.style.opacity = id && relatedEdgeIds.has(id) ? '1' : '0.15';
		});
	}
}
