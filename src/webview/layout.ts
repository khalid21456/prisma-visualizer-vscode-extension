import * as dagre from '@dagrejs/dagre';
import { GraphModel } from '../shared/graphModel';

export const NODE_WIDTH = 240;
const HEADER_HEIGHT = 28;
const FIELD_ROW_HEIGHT = 20;
const PADDING_BOTTOM = 8;

export function nodeHeight(fieldCount: number): number {
	return HEADER_HEIGHT + fieldCount * FIELD_ROW_HEIGHT + PADDING_BOTTOM;
}

export interface PositionedNode {
	name: string;
	/** Top-left corner (dagre reports node centers; we convert here). */
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface PositionedEdge {
	id: string;
	fromModel: string;
	toModel: string;
	points: { x: number; y: number }[];
}

export interface LayoutResult {
	nodes: PositionedNode[];
	/** Edges between distinct models, routed by dagre. Self-relations are excluded — see selfRelationIds. */
	edges: PositionedEdge[];
	/** Relation ids where fromModel === toModel; rendered as a loop on the node itself, not via dagre routing. */
	selfRelationIds: Set<string>;
	width: number;
	height: number;
}

export function computeLayout(model: GraphModel): LayoutResult {
	const g = new dagre.graphlib.Graph({ multigraph: true, directed: true });
	g.setGraph({ rankdir: 'LR', nodesep: 40, ranksep: 100, marginx: 20, marginy: 20 });
	g.setDefaultEdgeLabel(() => ({}));

	for (const m of model.models) {
		g.setNode(m.name, { width: NODE_WIDTH, height: nodeHeight(m.fields.length) });
	}

	const selfRelationIds = new Set<string>();
	for (const rel of model.relations) {
		if (rel.fromModel === rel.toModel) {
			selfRelationIds.add(rel.id);
			continue;
		}
		if (!g.hasNode(rel.fromModel) || !g.hasNode(rel.toModel)) {
			continue;
		}
		g.setEdge(rel.fromModel, rel.toModel, {}, rel.id);
	}

	dagre.layout(g);

	const nodes: PositionedNode[] = g.nodes().map((name) => {
		const n = g.node(name);
		return { name, x: n.x - n.width / 2, y: n.y - n.height / 2, width: n.width, height: n.height };
	});

	const edges: PositionedEdge[] = g.edges().map((e) => {
		const edgeLabel = g.edge(e);
		return { id: e.name ?? `${e.v}->${e.w}`, fromModel: e.v, toModel: e.w, points: edgeLabel.points };
	});

	const graphLabel = g.graph();
	return {
		nodes,
		edges,
		selfRelationIds,
		width: graphLabel.width ?? 800,
		height: graphLabel.height ?? 600,
	};
}

export interface Rect {
	x: number;
	y: number;
	width: number;
	height: number;
}

/** Finds where the line from `rect`'s center toward (tx, ty) exits `rect`'s boundary. */
export function clipToRectBoundary(rect: Rect, tx: number, ty: number): { x: number; y: number } {
	const cx = rect.x + rect.width / 2;
	const cy = rect.y + rect.height / 2;
	const dx = tx - cx;
	const dy = ty - cy;
	if (dx === 0 && dy === 0) {
		return { x: cx, y: cy };
	}
	const scaleX = dx !== 0 ? rect.width / 2 / Math.abs(dx) : Infinity;
	const scaleY = dy !== 0 ? rect.height / 2 / Math.abs(dy) : Infinity;
	const scale = Math.min(scaleX, scaleY);
	return { x: cx + dx * scale, y: cy + dy * scale };
}

/**
 * Overrides node positions with any user-dragged coordinates, then re-routes edges touching a
 * dragged node as straight lines (dagre's original bend points would otherwise point at the old
 * position). Edges between two untouched nodes keep dagre's routed points unchanged.
 */
export function applyPositionOverrides(layout: LayoutResult, overrides: Map<string, { x: number; y: number }>): LayoutResult {
	if (overrides.size === 0) {
		return layout;
	}

	const nodes = layout.nodes.map((n) => {
		const override = overrides.get(n.name);
		return override ? { ...n, x: override.x, y: override.y } : n;
	});
	const nodeByName = new Map(nodes.map((n) => [n.name, n]));

	const edges = layout.edges.map((edge) => {
		if (!overrides.has(edge.fromModel) && !overrides.has(edge.toModel)) {
			return edge;
		}
		const from = nodeByName.get(edge.fromModel);
		const to = nodeByName.get(edge.toModel);
		if (!from || !to) {
			return edge;
		}
		const toCenter = { x: to.x + to.width / 2, y: to.y + to.height / 2 };
		const fromCenter = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
		return {
			...edge,
			points: [clipToRectBoundary(from, toCenter.x, toCenter.y), clipToRectBoundary(to, fromCenter.x, fromCenter.y)],
		};
	});

	return { ...layout, nodes, edges };
}
