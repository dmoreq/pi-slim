/**
 * Graph Renderer — generates HTML visualizations from graph analysis.
 *
 * Produces an interactive HTML dashboard showing:
 *   - Force-directed graph layout
 *   - Community-colored node clusters
 *   - God node highlighting
 *   - Surprising connection edge styling
 *   - Cycle detection markers
 *   - Clickable nodes with wiki links
 *
 * Uses D3.js (via CDN) for rendering and force simulation.
 */

import type { GraphifyAnalysis, GraphifyGraph, GodNode, CommunityAnalysis } from '../context/graph-types'

// ── Types ──────────────────────────────────────────────────────────────────

export interface GraphVisualizationOptions {
  /** Title for the visualization */
  title?: string
  /** Width in pixels */
  width?: number
  /** Height in pixels */
  height?: number
  /** Whether to show node labels */
  showLabels?: boolean
  /** Whether to highlight god nodes */
  highlightGodNodes?: boolean
  /** Whether to color by community */
  colorByCommunity?: boolean
  /** Maximum nodes to render (skip low-degree nodes) */
  maxNodes?: number
  /** Force simulation charge strength */
  chargeStrength?: number
  /** Force simulation link distance */
  linkDistance?: number
}

export const DEFAULT_VISUALIZATION_OPTIONS: GraphVisualizationOptions = {
  title: 'Code Graph Visualization',
  width: 960,
  height: 600,
  showLabels: true,
  highlightGodNodes: true,
  colorByCommunity: true,
  maxNodes: 200,
  chargeStrength: -300,
  linkDistance: 100,
}

// ── Color Palette ──────────────────────────────────────────────────────────

const COMMUNITY_COLORS = [
  '#4e79a7', '#f28e2b', '#e15759', '#76b7b2',
  '#59a14f', '#edc948', '#b07aa1', '#ff9da7',
  '#9c755f', '#bab0ac', '#6b6ecf', '#d4a6c8',
]

const GOD_NODE_COLOR = '#e74c3c'
const GOD_NODE_GLOW = 'rgba(231, 76, 60, 0.4)'
const CYCLE_EDGE_COLOR = '#e74c3c'
const SURPRISE_EDGE_COLOR = '#f39c12'
const NORMAL_EDGE_COLOR = '#999'
const DEFAULT_NODE_COLOR = '#69b3a2'

// ── HTML Template ─────────────────────────────────────────────────────────

/**
 * Generate an interactive HTML dashboard from graph analysis.
 * Requires both the graph topology and the analysis results.
 *
 * @param graph Graph node/edge data
 * @param analysis Graph analysis results (god nodes, communities, etc.)
 * @param options Visualization options
 * @returns Complete HTML string
 */
export function generateGraphVisualization(
  graph: GraphifyGraph,
  analysis: GraphifyAnalysis,
  options?: Partial<GraphVisualizationOptions>
): string {
  const opts = { ...DEFAULT_VISUALIZATION_OPTIONS, ...options }

  // Limit nodes if needed
  const nodeIds = new Set<string>()
  let nodes = graph.nodes
  let edges = graph.edges

  if (nodes.length > opts.maxNodes!) {
    // Keep highest-degree nodes
    const degreeMap = new Map<string, number>()
    for (const e of edges) {
      degreeMap.set(e.source, (degreeMap.get(e.source) ?? 0) + 1)
      degreeMap.set(e.target, (degreeMap.get(e.target) ?? 0) + 1)
    }

    const sorted = [...nodes].sort((a, b) => (degreeMap.get(b.id) ?? 0) - (degreeMap.get(a.id) ?? 0))
    const kept = sorted.slice(0, opts.maxNodes!)
    for (const n of kept) nodeIds.add(n.id)
    nodes = kept
    edges = edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target))
  } else {
    for (const n of nodes) nodeIds.add(n.id)
  }

  // Build community color map
  const communityColorMap = new Map<string, string>()
  if (opts.colorByCommunity) {
    analysis.communities.forEach((c, i) => {
      const color = COMMUNITY_COLORS[i % COMMUNITY_COLORS.length]
      for (const nodeId of c.nodes) {
        communityColorMap.set(nodeId, color)
      }
    })
  }

  // Identify god nodes
  const godNodeSet = new Set(analysis.godNodes.map(g => g.nodeId))

  // Identify cycle edges
  const cycleEdgeSet = new Set<string>()
  const anomalySet = new Set<string>()
  for (const anomaly of analysis.anomalies) {
    if (anomaly.type === 'circular_dependency') {
      for (const n of anomaly.nodes) anomalySet.add(n)
    }
  }

  // Identify surprise edges
  const surpriseEdgeSet = new Set<string>()
  for (const s of analysis.surprises) {
    surpriseEdgeSet.add(`${s.source}→${s.target}`)
  }

  // Build nodes JSON
  const nodesJson = nodes.map(n => {
    const isGod = godNodeSet.has(n.id)
    const color = communityColorMap.get(n.id) ?? DEFAULT_NODE_COLOR
    const community = analysis.communities.find(c => c.nodes.includes(n.id))
    return {
      id: n.id,
      label: n.label || n.id,
      type: n.type,
      isGodNode: isGod,
      isInCycle: anomalySet.has(n.id),
      isBottleneck: analysis.bottlenecks.some(b => b.nodeId === n.id),
      community: community?.id ?? null,
      communityLabel: community?.label ?? null,
      color: isGod ? GOD_NODE_COLOR : color,
      size: isGod ? 12 : 6,
    }
  })

  // Build edges JSON
  const edgesJson = edges.map(e => {
    const isSurprise = surpriseEdgeSet.has(`${e.source}→${e.target}`)
    const isCycle = cycleEdgeSet.has(`${e.source}→${e.target}`)
    return {
      source: e.source,
      target: e.target,
      type: e.type,
      isSurprise,
      isCycle,
      color: isCycle ? CYCLE_EDGE_COLOR : isSurprise ? SURPRISE_EDGE_COLOR : NORMAL_EDGE_COLOR,
      width: isCycle ? 3 : isSurprise ? 2 : 1,
    }
  })

  const nodesStr = JSON.stringify(nodesJson)
  const edgesStr = JSON.stringify(edgesJson)
  const statsStr = JSON.stringify({
    totalNodes: analysis.metrics.totalNodes,
    totalEdges: analysis.metrics.totalEdges,
    godNodes: analysis.metrics.godNodeCount,
    communities: analysis.metrics.communityCount,
    cycles: analysis.metrics.cycleCount,
    bottlenecks: analysis.metrics.bottleneckCount,
    healthScore: 0,
  })

  return generateHtmlTemplate(opts, nodesStr, edgesStr, statsStr)
}

/**
 * Generate the full HTML template.
 */
function generateHtmlTemplate(
  opts: GraphVisualizationOptions,
  nodesJson: string,
  edgesJson: string,
  statsJson: string
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${opts.title ?? 'Graph Visualization'}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #1a1a2e; color: #eee; }
  
  #header {
    padding: 20px;
    background: linear-gradient(135deg, #16213e 0%, #1a1a2e 100%);
    border-bottom: 1px solid #333;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  
  #header h1 { font-size: 20px; font-weight: 600; }
  #header .subtitle { color: #888; font-size: 13px; margin-top: 4px; }
  
  #stats {
    display: flex; gap: 20px; font-size: 13px; color: #aaa; flex-wrap: wrap;
  }
  #stats .stat { text-align: center; }
  #stats .stat-value { font-size: 18px; font-weight: 700; color: #fff; }
  #stats .stat-label { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; }
  
  #legend {
    display: flex; gap: 16px; flex-wrap: wrap; padding: 10px 20px;
    background: #16213e; border-bottom: 1px solid #333; font-size: 12px;
  }
  .legend-item { display: flex; align-items: center; gap: 6px; }
  .legend-dot {
    width: 10px; height: 10px; border-radius: 50%; display: inline-block;
  }
  .legend-line {
    width: 20px; height: 2px; display: inline-block; border-radius: 1px;
  }
  
  #graph-container {
    width: 100%; height: calc(100vh - 160px);
    display: flex; justify-content: center; align-items: center;
    position: relative;
  }
  #graph-container svg { width: 100%; height: 100%; }
  
  .node-label {
    font-size: 11px; pointer-events: none; fill: #ccc;
    text-shadow: 0 0 3px rgba(0,0,0,0.8);
  }
  
  .tooltip {
    position: absolute; background: #2a2a4a; border: 1px solid #444;
    padding: 8px 12px; border-radius: 6px; font-size: 12px;
    pointer-events: none; display: none; max-width: 300px; z-index: 100;
  }
  .tooltip.visible { display: block; }
  .tooltip .tt-name { font-weight: 600; color: #fff; margin-bottom: 4px; }
  .tooltip .tt-detail { color: #aaa; font-size: 11px; }
  
  #toolbar {
    position: absolute; bottom: 20px; right: 20px; display: flex; gap: 8px;
  }
  #toolbar button {
    background: #2a2a4a; border: 1px solid #444; color: #ccc;
    padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 11px;
  }
  #toolbar button:hover { background: #3a3a5a; }
</style>
</head>
<body>
<div id="header">
  <div>
    <h1>${opts.title ?? 'Graph Visualization'}</h1>
    <div class="subtitle">Interactive code dependency graph — drag to explore, scroll to zoom</div>
  </div>
  <div id="stats"></div>
</div>

<div id="legend">
  <div class="legend-item">
    <span class="legend-dot" style="background: #e74c3c;"></span> God Node
  </div>
  <div class="legend-item">
    <span class="legend-dot" style="background: #69b3a2;"></span> Regular Node
  </div>
  <div class="legend-item">
    <span class="legend-line" style="background: #f39c12;"></span> Surprising Connection
  </div>
  <div class="legend-item">
    <span class="legend-line" style="background: #e74c3c; height: 3px;"></span> Cycle
  </div>
  <div class="legend-item">
    <span class="legend-line" style="background: #999;"></span> Normal Edge
  </div>
</div>

<div id="graph-container">
  <div id="tooltip" class="tooltip"></div>
  <div id="toolbar">
    <button onclick="resetZoom()">Reset View</button>
  </div>
</div>

<script src="https://d3js.org/d3.v7.min.js"></script>
<script>
const nodes = ${nodesJson};
const edges = ${edgesJson};
const stats = ${statsJson};

// ── Populate stats ──
const statsEl = document.getElementById('stats');
const statItems = [
  { label: 'Nodes', value: stats.totalNodes },
  { label: 'Edges', value: stats.totalEdges },
  { label: 'God Nodes', value: stats.godNodes },
  { label: 'Communities', value: stats.communities },
  { label: 'Cycles', value: stats.cycles },
  { label: 'Bottlenecks', value: stats.bottlenecks },
];
statItems.forEach(s => {
  const div = document.createElement('div');
  div.className = 'stat';
  div.innerHTML = \`<div class="stat-value">\${s.value}</div><div class="stat-label">\${s.label}</div>\`;
  statsEl.appendChild(div);
});

// ── SVG Setup ──
const container = document.getElementById('graph-container');
const width = container.clientWidth || ${opts.width ?? 960};
const height = container.clientHeight || ${opts.height ?? 600};
const tooltip = document.getElementById('tooltip');

const svg = d3.select('#graph-container')
  .append('svg')
  .attr('width', width)
  .attr('height', height);

const g = svg.append('g');

// ── Zoom ──
const zoom = d3.zoom()
  .scaleExtent([0.1, 4])
  .on('zoom', (event) => {
    g.attr('transform', event.transform);
  });
svg.call(zoom);

window.resetZoom = function() {
  svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity);
};

// ── Arrows ──
svg.append('defs').selectAll('marker')
  .data(['end'])
  .enter().append('marker')
  .attr('id', 'arrow')
  .attr('viewBox', '0 -5 10 10')
  .attr('refX', 18)
  .attr('refY', 0)
  .attr('markerWidth', 6)
  .attr('markerHeight', 6)
  .attr('orient', 'auto')
  .append('path')
  .attr('d', 'M0,-5L10,0L0,5')
  .attr('fill', '#999');

// ── Force Simulation ──
const simulation = d3.forceSimulation(nodes)
  .force('link', d3.forceLink(edges).id(d => d.id).distance(${opts.linkDistance ?? 100}))
  .force('charge', d3.forceManyBody().strength(${opts.chargeStrength ?? -300}))
  .force('center', d3.forceCenter(width / 2, height / 2))
  .force('collision', d3.forceCollide().radius(d => d.size + 10));

// ── Draw Edges ──
const link = g.append('g')
  .selectAll('line')
  .data(edges)
  .enter().append('line')
  .attr('stroke', d => d.color)
  .attr('stroke-width', d => d.width)
  .attr('stroke-opacity', d => d.isSurprise ? 0.7 : 0.4)
  .attr('marker-end', d => d.isCycle ? '' : 'url(#arrow)');

// ── Draw Nodes ──
const node = g.append('g')
  .selectAll('circle')
  .data(nodes)
  .enter().append('circle')
  .attr('r', d => d.size)
  .attr('fill', d => d.color)
  .attr('stroke', d => d.isGodNode ? GOD_NODE_GLOW : '#333')
  .attr('stroke-width', d => d.isGodNode ? 4 : 1)
  .style('cursor', 'pointer')
  .on('mouseover', function(event, d) {
    const connected = edges.filter(e => e.source.id === d.id || e.target.id === d.id);
    const dependents = connected.filter(e => e.target.id === d.id);
    const dependencies = connected.filter(e => e.source.id === d.id);
    
    tooltip.innerHTML = \`
      <div class="tt-name">\${d.label} \${d.isGodNode ? '⭐' : ''} \${d.isInCycle ? '🔄' : ''}</div>
      <div class="tt-detail">Type: \${d.type}</div>
      <div class="tt-detail">Dependents: \${dependents.length} | Dependencies: \${dependencies.length}</div>
      \${d.community ? '<div class="tt-detail">Community: ' + d.communityLabel + '</div>' : ''}
      \${d.isBottleneck ? '<div class="tt-detail">⚠️ Bottleneck node</div>' : ''}
    \`;
    tooltip.className = 'tooltip visible';
    
    // Highlight connected nodes
    const connectedIds = new Set(connected.flatMap(e => [e.source.id, e.target.id]));
    node.attr('opacity', n => connectedIds.has(n.id) || n.id === d.id ? 1 : 0.2);
    link.attr('stroke-opacity', e => connectedIds.has(e.source.id) && connectedIds.has(e.target.id) ? 1 : 0.05);
  })
  .on('mousemove', function(event) {
    tooltip.style.left = (event.pageX - container.getBoundingClientRect().left + 12) + 'px';
    tooltip.style.top = (event.pageY - container.getBoundingClientRect().top - 10) + 'px';
  })
  .on('mouseout', function() {
    tooltip.className = 'tooltip';
    node.attr('opacity', 1);
    link.attr('stroke-opacity', e => e.isSurprise ? 0.7 : 0.4);
  })
  .call(d3.drag()
    .on('start', (event, d) => {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    })
    .on('drag', (event, d) => {
      d.fx = event.x;
      d.fy = event.y;
    })
    .on('end', (event, d) => {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    })
  );

// ── Draw Labels ──
const label = g.append('g')
  .selectAll('text')
  .data(nodes)
  .enter().append('text')
  .text(d => d.label)
  .attr('class', 'node-label')
  .attr('dx', 14)
  .attr('dy', 4)
  .style('display', '${opts.showLabels ? 'block' : 'none'}');

// ── Simulation Tick ──
simulation.on('tick', () => {
  link
    .attr('x1', d => d.source.x)
    .attr('y1', d => d.source.y)
    .attr('x2', d => d.target.x)
    .attr('y2', d => d.target.y);
  node
    .attr('cx', d => d.x)
    .attr('cy', d => d.y);
  label
    .attr('x', d => d.x)
    .attr('y', d => d.y);
});

// ── Resize ──
window.addEventListener('resize', () => {
  const w = container.clientWidth;
  const h = container.clientHeight;
  svg.attr('width', w).attr('height', h);
  simulation.force('center', d3.forceCenter(w / 2, h / 2));
  simulation.alpha(0.3).restart();
});
</script>
</body>
</html>`
}

/**
 * Save the visualization to a file path.
 *
 * @param graph Graph node/edge data
 * @param analysis Graph analysis results
 * @param filePath Path to write the HTML file
 * @param options Visualization options
 */
export async function saveVisualization(
  graph: GraphifyGraph,
  analysis: GraphifyAnalysis,
  filePath: string,
  options?: Partial<GraphVisualizationOptions>
): Promise<boolean> {
  try {
    const { writeFile, mkdir } = await import('node:fs/promises')
    const { dirname } = await import('node:path')
    const { existsSync } = await import('node:fs')

    const dir = dirname(filePath)
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true })
    }

    const html = generateGraphVisualization(graph, analysis, options)
    await writeFile(filePath, html, 'utf-8')
    return true
  } catch (err) {
    console.error('[graph-viz] Failed to save visualization:', err)
    return false
  }
}
