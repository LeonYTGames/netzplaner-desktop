(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NetzplanerEdgeRouting = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const sideDirections = Object.freeze({
    right: Object.freeze({ x: 1, y: 0 }),
    left: Object.freeze({ x: -1, y: 0 }),
    bottom: Object.freeze({ x: 0, y: 1 }),
    top: Object.freeze({ x: 0, y: -1 })
  });
  const defaultStartSide = 'right';
  const defaultEndSide = 'left';

  function computeEdgeRoutes({ nodes, edges, nodeWidth, nodeHeight }) {
    if (!Array.isArray(nodes) || !Array.isArray(edges)) return [];
    if (!Number.isFinite(nodeWidth) || !Number.isFinite(nodeHeight)) {
      throw new TypeError('nodeWidth and nodeHeight must be finite numbers');
    }

    const nodeById = new Map(nodes.map(node => [node.id, node]));
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

      const sides = chooseConnectionSides(source, target, nodeWidth, nodeHeight);
      const sourcePort = calculatePortPoint({
        node: source,
        nodeWidth,
        nodeHeight,
        side: sides.start,
        usedIndex: outgoingIndexByNodeId.get(edge.from) || 0,
        connectionCount: outgoingCountByNodeId.get(edge.from)
      });
      const targetPort = calculatePortPoint({
        node: target,
        nodeWidth,
        nodeHeight,
        side: sides.end,
        usedIndex: incomingIndexByNodeId.get(edge.to) || 0,
        connectionCount: incomingCountByNodeId.get(edge.to)
      });
      outgoingIndexByNodeId.set(edge.from, (outgoingIndexByNodeId.get(edge.from) || 0) + 1);
      incomingIndexByNodeId.set(edge.to, (incomingIndexByNodeId.get(edge.to) || 0) + 1);

      const route = createDirectRoute(sourcePort, targetPort, sides.start, sides.end);
      routes.push({
        edgeId: edge.id,
        kind: route.kind,
        points: route.points,
        startSide: sides.start,
        endSide: sides.end,
        path: route.path
      });
    }

    return routes;
  }

  // Connections leave and enter the sides that face each other most directly.
  // This keeps legacy projects readable instead of sending every line around
  // the outside of the whole plan.
  function chooseConnectionSides(source, target, nodeWidth, nodeHeight) {
    const deltaX = target.x - source.x;
    const deltaY = target.y - source.y;
    if (Math.abs(deltaX) >= Math.abs(deltaY)) {
      return deltaX >= 0
        ? { start: 'right', end: 'left' }
        : { start: 'left', end: 'right' };
    }
    return deltaY >= 0
      ? { start: 'bottom', end: 'top' }
      : { start: 'top', end: 'bottom' };
  }

  function calculatePortPoint({ node, nodeWidth, nodeHeight, side, usedIndex, connectionCount }) {
    const onVerticalSide = side === 'left' || side === 'right';
    const sideLength = onVerticalSide ? nodeHeight : nodeWidth;
    const offset = calculatePortOffset(sideLength, usedIndex, connectionCount);
    const centerX = node.x + nodeWidth / 2;
    const centerY = node.y + nodeHeight / 2;

    if (onVerticalSide) {
      return [side === 'right' ? node.x + nodeWidth : node.x, centerY + offset];
    }
    return [centerX + offset, side === 'bottom' ? node.y + nodeHeight : node.y];
  }

  function calculatePortOffset(sideLength, usedIndex, connectionCount) {
    if (connectionCount <= 1) return 0;
    const portSpacing = Math.min(18, (sideLength - 24) / connectionCount);
    const centeredIndex = usedIndex - (connectionCount - 1) / 2;
    return centeredIndex * portSpacing;
  }

  function createDirectRoute(startPoint, endPoint, startSide, endSide) {
    const points = removeDuplicatePoints([
      startPoint,
      interpolatePoint(startPoint, endPoint, 1 / 3),
      interpolatePoint(startPoint, endPoint, 2 / 3),
      endPoint
    ]);
    return {
      kind: 'bezier',
      points,
      path: buildBezierPath(points, { startSide, endSide })
    };
  }

  function interpolatePoint(start, end, fraction) {
    return [
      start[0] + (end[0] - start[0]) * fraction,
      start[1] + (end[1] - start[1]) * fraction
    ];
  }

  function removeDuplicatePoints(points) {
    return points.filter((point, index) => {
      if (index === 0) return true;
      const previous = points[index - 1];
      return coordinate(point, 0) !== coordinate(previous, 0) || coordinate(point, 1) !== coordinate(previous, 1);
    });
  }

  function coordinate(point, index) {
    return Array.isArray(point) ? point[index] : (index === 0 ? point.x : point.y);
  }

  function toPathPoint(point) {
    const x = coordinate(point, 0);
    const y = coordinate(point, 1);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
  }

  // Builds a cubic bezier chain through every point. Endpoint tangents point
  // away from the node side they touch, while interior points use Catmull-Rom
  // tangents for a smooth, bendable line.
  function buildBezierPath(rawPoints, options = {}) {
    if (!Array.isArray(rawPoints)) return '';
    const points = removeDuplicatePoints(rawPoints.map(toPathPoint).filter(Boolean));
    if (points.length < 2) return '';

    const startDirection = sideDirection(options.startSide, defaultStartSide);
    const endDirection = sideDirection(options.endSide, defaultEndSide);
    const parts = [`M ${roundCoordinate(points[0].x)} ${roundCoordinate(points[0].y)}`];

    for (let index = 0; index < points.length - 1; index += 1) {
      const start = points[index];
      const end = points[index + 1];
      const previous = points[index - 1] || start;
      const next = points[index + 2] || end;
      const startHandle = index === 0
        ? offsetEndpoint(start, startDirection, endpointHandleLength(start, end, startDirection))
        : { x: start.x + (end.x - previous.x) / 6, y: start.y + (end.y - previous.y) / 6 };
      const endHandle = index === points.length - 2
        ? offsetEndpoint(end, endDirection, endpointHandleLength(start, end, endDirection))
        : { x: end.x - (next.x - start.x) / 6, y: end.y - (next.y - start.y) / 6 };
      parts.push(
        `C ${roundCoordinate(startHandle.x)} ${roundCoordinate(startHandle.y)} ` +
        `${roundCoordinate(endHandle.x)} ${roundCoordinate(endHandle.y)} ` +
        `${roundCoordinate(end.x)} ${roundCoordinate(end.y)}`
      );
    }
    return parts.join(' ');
  }

  function sideDirection(side, fallbackSide) {
    return sideDirections[side] || sideDirections[fallbackSide];
  }

  function offsetEndpoint(point, direction, length) {
    return {
      x: point.x + direction.x * length,
      y: point.y + direction.y * length
    };
  }

  // Keep endpoint handles short enough that they never overshoot the first or
  // last segment; otherwise the curve forms a small hook at the node edge.
  function endpointHandleLength(start, end, direction) {
    const projection = (end.x - start.x) * direction.x + (end.y - start.y) * direction.y;
    return Math.min(32, Math.max(12, Math.abs(projection) * 0.5));
  }

  function roundCoordinate(value) {
    return Math.round(value * 100) / 100;
  }

  return Object.freeze({ computeEdgeRoutes, buildBezierPath });
});
