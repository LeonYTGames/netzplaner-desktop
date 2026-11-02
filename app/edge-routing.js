(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NetzplanerEdgeRouting = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function computeEdgeRoutes({ nodes, edges, nodeWidth, nodeHeight, gridSize = 32 }) {
    if (!Array.isArray(nodes) || !Array.isArray(edges)) return [];
    if (!Number.isFinite(nodeWidth) || !Number.isFinite(nodeHeight)) {
      throw new TypeError('nodeWidth and nodeHeight must be finite numbers');
    }

    const nodeById = new Map(nodes.map(node => [node.id, node]));
    const clearance = Math.max(12, gridSize / 2);
    const laneSpacing = Math.max(10, gridSize / 2);
    const laneCounts = { below: 0, above: 0 };
    const outgoingCountByNodeId = new Map(nodes.map(node => [node.id, 0]));
    const incomingCountByNodeId = new Map(nodes.map(node => [node.id, 0]));

    for (const edge of edges) {
      if (!edge) continue;
      const source = nodeById.get(edge.from);
      const target = nodeById.get(edge.to);
      if (!source || !target || edge.from === edge.to) continue;
      outgoingCountByNodeId.set(edge.from, outgoingCountByNodeId.get(edge.from) + 1);
      incomingCountByNodeId.set(edge.to, incomingCountByNodeId.get(edge.to) + 1);
    }

    const outgoingIndexByNodeId = new Map();
    const incomingIndexByNodeId = new Map();
    const routes = [];

    for (const edge of edges) {
      if (!edge) continue;
      const source = nodeById.get(edge.from);
      const target = nodeById.get(edge.to);
      if (!source || !target || edge.from === edge.to) continue;

      const sourcePortY = calculatePortY({
        node: source,
        nodeHeight,
        usedIndex: outgoingIndexByNodeId.get(edge.from) || 0,
        connectionCount: outgoingCountByNodeId.get(edge.from)
      });
      const targetPortY = calculatePortY({
        node: target,
        nodeHeight,
        usedIndex: incomingIndexByNodeId.get(edge.to) || 0,
        connectionCount: incomingCountByNodeId.get(edge.to)
      });
      outgoingIndexByNodeId.set(edge.from, (outgoingIndexByNodeId.get(edge.from) || 0) + 1);
      incomingIndexByNodeId.set(edge.to, (incomingIndexByNodeId.get(edge.to) || 0) + 1);

      const route = routeEdge({
        source,
        target,
        sourcePortY,
        targetPortY,
        nodes,
        nodeWidth,
        nodeHeight,
        gridSize,
        clearance,
        laneSpacing,
        laneCounts
      });

      routes.push({ edgeId: edge.id, kind: route.kind, points: route.points, path: route.path });
    }

    return routes;
  }

  function calculatePortY({ node, nodeHeight, usedIndex, connectionCount }) {
    if (connectionCount <= 1) return node.y + nodeHeight / 2;
    const portSpacing = Math.min(18, (nodeHeight - 24) / connectionCount);
    const centeredIndex = usedIndex - (connectionCount - 1) / 2;
    return node.y + nodeHeight / 2 + centeredIndex * portSpacing;
  }

  function routeEdge({ source, target, sourcePortY, targetPortY, nodes, nodeWidth, nodeHeight, gridSize, clearance, laneSpacing, laneCounts }) {
    const sourceRight = source.x + nodeWidth;
    const targetLeft = target.x;
    const horizontalGap = targetLeft - sourceRight;

    if (horizontalGap > 0 && horizontalGap <= nodeWidth) {
      // Neighbouring columns: a short orthogonal step through the gap is enough.
      const corridorX = sourceRight + Math.max(8, Math.min(horizontalGap / 2, gridSize * 1.5));
      const points = [
        [sourceRight, sourcePortY],
        [corridorX, sourcePortY],
        [corridorX, targetPortY],
        [targetLeft, targetPortY]
      ];
      return createRoute('short-forward', points);
    }

    // Long forward connections and backward connections use a lane outside the
    // nodes they pass. This keeps the line away from unrelated nodes instead of
    // cutting through the whole plan.
    const spanLeft = Math.min(sourceRight, targetLeft) - clearance;
    const spanRight = Math.max(sourceRight, targetLeft) + clearance;
    const spannedNodes = nodes.filter(node => (
      node.x + nodeWidth >= spanLeft && node.x <= spanRight
    ));

    const useBelowLane = horizontalGap <= 0 || targetPortY >= sourcePortY;
    const baseLaneY = useBelowLane
      ? Math.max(...spannedNodes.map(node => node.y + nodeHeight)) + clearance
      : Math.min(...spannedNodes.map(node => node.y)) - clearance;

    const laneKey = useBelowLane ? 'below' : 'above';
    const laneY = useBelowLane
      ? baseLaneY + laneCounts[laneKey] * laneSpacing
      : baseLaneY - laneCounts[laneKey] * laneSpacing;
    laneCounts[laneKey] += 1;

    const sourceApproachX = sourceRight + clearance;
    const targetApproachX = targetLeft - clearance;
    const points = [
      [sourceRight, sourcePortY],
      [sourceApproachX, sourcePortY],
      [sourceApproachX, laneY],
      [targetApproachX, laneY],
      [targetApproachX, targetPortY],
      [targetLeft, targetPortY]
    ];

    return createRoute(horizontalGap > 0 ? 'long-forward' : 'backward', points);
  }

  function createRoute(kind, rawPoints) {
    const points = removeDuplicatePoints(rawPoints);
    return { kind, points, path: pointsToPath(points) };
  }

  function removeDuplicatePoints(points) {
    return points.filter((point, index) => {
      if (index === 0) return true;
      const previous = points[index - 1];
      return point[0] !== previous[0] || point[1] !== previous[1];
    });
  }

  function pointsToPath(points) {
    return points
      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${roundCoordinate(point[0])} ${roundCoordinate(point[1])}`)
      .join(' ');
  }

  function roundCoordinate(value) {
    return Math.round(value * 100) / 100;
  }

  return Object.freeze({ computeEdgeRoutes });
});
