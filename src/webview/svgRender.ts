import { GraphModel, RelationCardinality, RelationEdge } from '../shared/graphModel';
import { LayoutResult, nodeHeight, NODE_WIDTH, PositionedNode } from './layout';

const SVG_NS = 'http://www.w3.org/2000/svg';
const HEADER_HEIGHT = 28;
const FIELD_ROW_HEIGHT = 20;
const SELF_LOOP_RADIUS = 36;

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string> = {}): SVGElementTagNameMap[K] {
	const node = document.createElementNS(SVG_NS, tag);
	for (const [key, value] of Object.entries(attrs)) {
		node.setAttribute(key, value);
	}
	return node;
}

function edgeEndLabels(cardinality: RelationCardinality): { fromLabel: string; toLabel: string } {
	switch (cardinality) {
		case 'one-to-one':
			return { fromLabel: '1', toLabel: '1' };
		case 'one-to-many':
			return { fromLabel: 'N', toLabel: '1' };
		case 'many-to-many':
			return { fromLabel: 'N', toLabel: 'N' };
	}
}

function fieldRowText(field: GraphModel['models'][number]['fields'][number]): string {
	const suffix = `${field.isList ? '[]' : ''}${field.isOptional ? '?' : ''}`;
	return `${field.name}  ${field.type}${suffix}`;
}

function fieldKeyMarker(field: GraphModel['models'][number]['fields'][number]): string {
	if (field.isId) {
		return '⬤'; // ● primary key
	}
	if (field.isForeignKey) {
		return '→'; // → foreign key
	}
	if (field.isUnique) {
		return '◇'; // ◇ unique
	}
	return '';
}

function renderNode(host: SVGGElement, node: PositionedNode, model: GraphModel): void {
	const modelNode = model.models.find((m) => m.name === node.name);
	if (!modelNode) {
		return;
	}

	const group = el('g', { transform: `translate(${node.x}, ${node.y})`, class: 'erd-node', 'data-model': node.name });

	const rect = el('rect', {
		width: String(node.width),
		height: String(node.height),
		rx: '6',
		fill: 'var(--vscode-editorWidget-background, #252526)',
		stroke: 'var(--vscode-editorWidget-border, #454545)',
		'stroke-width': '1',
	});
	group.appendChild(rect);

	const headerRect = el('rect', {
		width: String(node.width),
		height: String(HEADER_HEIGHT),
		rx: '6',
		fill: 'var(--vscode-titleBar-activeBackground, #3c3c3c)',
	});
	group.appendChild(headerRect);
	// square off the bottom corners of the rounded header so it doesn't bulge into the body
	const headerMask = el('rect', {
		x: '0',
		y: String(HEADER_HEIGHT - 6),
		width: String(node.width),
		height: '6',
		fill: 'var(--vscode-titleBar-activeBackground, #3c3c3c)',
	});
	group.appendChild(headerMask);

	const title = el('text', {
		x: '10',
		y: '18',
		fill: 'var(--vscode-titleBar-activeForeground, #cccccc)',
		'font-weight': '600',
		'font-size': '13',
	});
	title.textContent = modelNode.dbName ? `${modelNode.name} (${modelNode.dbName})` : modelNode.name;
	group.appendChild(title);

	modelNode.fields.forEach((field, i) => {
		const rowY = HEADER_HEIGHT + i * FIELD_ROW_HEIGHT;

		const marker = fieldKeyMarker(field);
		if (marker) {
			const markerText = el('text', {
				x: '10',
				y: String(rowY + 14),
				fill: 'var(--vscode-textLink-foreground, #3794ff)',
				'font-size': '9',
			});
			markerText.textContent = marker;
			group.appendChild(markerText);
		}

		const text = el('text', {
			x: '22',
			y: String(rowY + 14),
			fill: 'var(--vscode-editor-foreground, #cccccc)',
			'font-size': '12',
			'font-family': 'var(--vscode-editor-font-family, monospace)',
		});
		text.textContent = fieldRowText(field);
		group.appendChild(text);
	});

	host.appendChild(group);
}

function nodeCenter(node: PositionedNode): { x: number; y: number } {
	return { x: node.x + node.width / 2, y: node.y + node.height / 2 };
}

function renderEdge(
	host: SVGGElement,
	edgeId: string,
	relation: RelationEdge,
	points: { x: number; y: number }[],
): void {
	if (points.length === 0) {
		return;
	}
	const { fromLabel, toLabel } = edgeEndLabels(relation.cardinality);
	const pathData = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

	const path = el('path', {
		d: pathData,
		fill: 'none',
		stroke: relation.resolved ? 'var(--vscode-charts-blue, #3794ff)' : 'var(--vscode-charts-orange, #d18616)',
		'stroke-width': '1.5',
		'stroke-dasharray': relation.resolved ? '' : '4 3',
		'data-edge-id': edgeId,
		'data-from': relation.fromModel,
		'data-to': relation.toModel,
		class: 'erd-edge',
	});
	host.appendChild(path);

	const first = points[0];
	const last = points[points.length - 1];
	const fromText = el('text', {
		x: String(first.x + 4),
		y: String(first.y - 4),
		fill: 'var(--vscode-descriptionForeground, #999999)',
		'font-size': '10',
		'data-edge-id': edgeId,
		'data-end': 'from',
	});
	fromText.textContent = fromLabel;
	host.appendChild(fromText);

	const toText = el('text', {
		x: String(last.x - 12),
		y: String(last.y - 4),
		fill: 'var(--vscode-descriptionForeground, #999999)',
		'font-size': '10',
		'data-edge-id': edgeId,
		'data-end': 'to',
	});
	toText.textContent = toLabel;
	host.appendChild(toText);
}

function renderSelfRelationLoop(host: SVGGElement, node: PositionedNode, relation: RelationEdge, stackIndex: number): void {
	const { fromLabel, toLabel } = edgeEndLabels(relation.cardinality);
	const startX = node.x + node.width;
	const startY = node.y + HEADER_HEIGHT + 10 + stackIndex * 14;
	const loopOut = SELF_LOOP_RADIUS + stackIndex * 10;

	const path = el('path', {
		d: `M ${startX} ${startY} C ${startX + loopOut} ${startY}, ${startX + loopOut} ${startY + 24}, ${startX} ${startY + 24}`,
		fill: 'none',
		stroke: relation.resolved ? 'var(--vscode-charts-blue, #3794ff)' : 'var(--vscode-charts-orange, #d18616)',
		'stroke-width': '1.5',
		'stroke-dasharray': relation.resolved ? '' : '4 3',
		'data-edge-id': relation.id,
		'data-from': relation.fromModel,
		'data-to': relation.toModel,
		class: 'erd-edge erd-self-loop',
	});
	host.appendChild(path);

	const label = el('text', {
		x: String(startX + loopOut - 4),
		y: String(startY + 16),
		fill: 'var(--vscode-descriptionForeground, #999999)',
		'font-size': '9',
		'data-edge-id': relation.id,
		'data-end': 'loop',
	});
	label.textContent = `${fromLabel}:${toLabel}${relation.name ? ` ${relation.name}` : ''}`;
	host.appendChild(label);
}

export function renderGraph(container: HTMLElement, model: GraphModel, layout: LayoutResult): void {
	container.innerHTML = '';

	const svg = el('svg', {
		width: '100%',
		height: '100%',
		viewBox: `0 0 ${layout.width + 80} ${layout.height + 80}`,
	});
	svg.style.display = 'block';

	const root = el('g', { class: 'erd-root' });

	const edgesLayer = el('g', { class: 'erd-edges-layer' });
	const nodesLayer = el('g', { class: 'erd-nodes-layer' });
	root.appendChild(edgesLayer);
	root.appendChild(nodesLayer);

	const nodeByName = new Map(layout.nodes.map((n) => [n.name, n]));

	for (const edge of layout.edges) {
		const relation = model.relations.find((r) => r.id === edge.id);
		if (relation) {
			renderEdge(edgesLayer, edge.id, relation, edge.points);
		}
	}

	const selfLoopCounts = new Map<string, number>();
	for (const relation of model.relations) {
		if (!layout.selfRelationIds.has(relation.id)) {
			continue;
		}
		const node = nodeByName.get(relation.fromModel);
		if (!node) {
			continue;
		}
		const stackIndex = selfLoopCounts.get(relation.fromModel) ?? 0;
		selfLoopCounts.set(relation.fromModel, stackIndex + 1);
		renderSelfRelationLoop(edgesLayer, node, relation, stackIndex);
	}

	for (const node of layout.nodes) {
		renderNode(nodesLayer, node, model);
	}

	svg.appendChild(root);
	container.appendChild(svg);
}

export { NODE_WIDTH, nodeHeight };
