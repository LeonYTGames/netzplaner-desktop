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
  const defaultClearance = 24;
  const turnPenalty = 48;
  const coordinateTolerance = 0.01;

  function computeEdgeRoutes({ nodes, edges, nodeWidth, nodeHeight, gridSize = 32, clearance, directOnly = false }) {
    if (!Array.isArray(nodes) || !Array.isArray(edges)) return [];
    if (!Number.isFinite(nodeWidth) || !Number.isFinite(nodeHeight)) {
      throw new TypeError('nodeWidth and nodeHeight must be finite numbers');
    }

    const nodeById = new Map(nodes.map(node => [node.id, node]));
    const connections = [];

    for (const edge of edges) {
      if (!edge) continue;
      const source = nodeById.get(edge.from);
      const target = nodeById.get(edge.to);
      if (!source || !target || edge.from === edge.to) continue;
      connections.push({
        edge,
        source,
        target,
        sides: chooseConnectionSides(source, target)
      });
    }

    assignPortIndices(connections);
    const resolvedClearance = Number.isFinite(clearance) ? Math.max(4, clearance) : resolveClearance(gridSize);

    for (const connection of connections) {
      connection.startPoint = calculatePortPoint({
        node: connection.source,
        nodeWidth,
        nodeHeight,
        side: connection.sides.start,
        usedIndex: connection.startIndex,
        connectionCount: connection.startCount
      });
      connection.endPoint = calculatePortPoint({
        node: connection.target,
        nodeWidth,
        nodeHeight,
        side: connection.sides.end,
        usedIndex: connection.endIndex,
        connectionCount: connection.endCount
      });
    }

    const router = createObstacleRouter({
      nodes,
      nodeWidth,
      nodeHeight,
      clearance: resolvedClearance,
      extraPoints: connections.flatMap(connection => {
        return [
          connection.startPoint,
          connection.endPoint,
          escapePoint(connection.source, connection.startPoint, connection.sides.start, nodeWidth, nodeHeight, resolvedClearance),
          approachPoint(connection.target, connection.endPoint, connection.sides.end, nodeWidth, nodeHeight, resolvedClearance)
        ];
      })
    });

    const routes = [];

    for (const connection of connections) {
      const { edge, source, target, sides, startPoint, endPoint } = connection;
      const directPoints = createDirectPoints(startPoint, endPoint);
      const directOptions = { startSide: sides.start, endSide: sides.end };
      const directIsClear = directOnly || curveAvoidsNodes({
        points: directPoints,
        options: directOptions,
        nodes,
        nodeWidth,
        nodeHeight,
        ignoredNodeIds: new Set([source.id, target.id])
      });

      const route = directIsClear
        ? createBezierRoute(directPoints, directOptions, 'bezier')
        : routeAroundNodes({
          router,
          source,
          target,
          sides,
          startPoint,
          endPoint,
          nodeWidth,
          nodeHeight,
          directPoints,
          directOptions
        });

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

  function resolveClearance(gridSize) {
    return Number.isFinite(gridSize) ? Math.max(16, gridSize * 0.75) : defaultClearance;
  }

  // Connections leave and enter the sides that face each other most directly.
  // Port positions are then ordered by destination so bundles do not cross
  // immediately at the node edge.
  function chooseConnectionSides(source, target) {
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

  function assignPortIndices(connections) {
    const outgoingGroups = new Map();
    const incomingGroups = new Map();

    for (const connection of connections) {
      const outgoingKey = connection.source.id + '\u0000' + connection.sides.start;
      const incomingKey = connection.target.id + '\u0000' + connection.sides.end;
      if (!outgoingGroups.has(outgoingKey)) outgoingGroups.set(outgoingKey, []);
      if (!incomingGroups.has(incomingKey)) incomingGroups.set(incomingKey, []);
      outgoingGroups.get(outgoingKey).push(connection);
      incomingGroups.get(incomingKey).push(connection);
    }

    for (const [key, group] of outgoingGroups) {
      const side = key.slice(key.indexOf('\u0000') + 1);
      group.sort((first, second) => compareConnections(first, second, side, 'target'));
      group.forEach((connection, index) => {
        connection.startIndex = index;
        connection.startCount = group.length;
      });
    }

    for (const [key, group] of incomingGroups) {
      const side = key.slice(key.indexOf('\u0000') + 1);
      group.sort((first, second) => compareConnections(first, second, side, 'source'));
      group.forEach((connection, index) => {
        connection.endIndex = index;
        connection.endCount = group.length;
      });
    }
  }

  function compareConnections(first, second, side, otherNodeKey) {
    const firstValue = portSortCoordinate(first[otherNodeKey], side);
    const secondValue = portSortCoordinate(second[otherNodeKey], side);
    if (firstValue !== secondValue) return firstValue - secondValue;
    return first.edge.id.localeCompare(second.edge.id);
  }

  function portSortCoordinate(node, side) {
    if (side === 'left' || side === 'right') return node.y;
    return node.x;
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
    const portSpacing = Math.min(24, (sideLength - 32) / (connectionCount - 1));
    const centeredIndex = usedIndex - (connectionCount - 1) / 2;
    return centeredIndex * portSpacing;
  }

  function createDirectPoints(startPoint, endPoint) {
    return removeDuplicatePoints([
      startPoint,
      interpolatePoint(startPoint, endPoint, 1 / 3),
      interpolatePoint(startPoint, endPoint, 2 / 3),
      endPoint
    ]);
  }

  function interpolatePoint(start, end, fraction) {
    return [
      start[0] + (end[0] - start[0]) * fraction,
      start[1] + (end[1] - start[1]) * fraction
    ];
  }

  function routeAroundNodes({ router, source, target, sides, startPoint, endPoint, nodeWidth, nodeHeight, directPoints, directOptions }) {
    const path = router.findPath({
      source,
      target,
      startPoint,
      endPoint,
      startSide: sides.start,
      endSide: sides.end,
      nodeWidth,
      nodeHeight
    });
    if (!path) return createBezierRoute(directPoints, directOptions, 'bezier');
    return createBezierRoute(path, directOptions, 'avoiding');
  }

  function escapePoint(node, portPoint, side, nodeWidth, nodeHeight, clearance) {
    if (side === 'right') return [node.x + nodeWidth + clearance, portPoint[1]];
    if (side === 'left') return [node.x - clearance, portPoint[1]];
    if (side === 'bottom') return [portPoint[0], node.y + nodeHeight + clearance];
    return [portPoint[0], node.y - clearance];
  }

  function approachPoint(node, portPoint, side, nodeWidth, nodeHeight, clearance) {
    if (side === 'left') return [node.x - clearance, portPoint[1]];
    if (side === 'right') return [node.x + nodeWidth + clearance, portPoint[1]];
    if (side === 'top') return [portPoint[0], node.y - clearance];
    return [portPoint[0], node.y + nodeHeight + clearance];
  }

  function createBezierRoute(points, options, kind) {
    return {
      kind,
      points,
      path: buildBezierPath(points, options)
    };
  }

  function curveAvoidsNodes({ points, options, nodes, nodeWidth, nodeHeight, ignoredNodeIds }) {
    const segments = buildBezierSegments(points, options);
    for (const segment of segments) {
      const approximateLength =
        distanceBetween(segment.start, segment.startHandle) +
        distanceBetween(segment.startHandle, segment.endHandle) +
        distanceBetween(segment.endHandle, segment.end);
      const stepCount = Math.min(160, Math.max(8, Math.ceil(approximateLength / 12)));
      const bounds = cubicBounds(segment);
      for (let step = 0; step <= stepCount; step += 1) {
        const point = pointOnCubic(segment, step / stepCount);
        for (const node of nodes) {
          if (ignoredNodeIds.has(node.id)) continue;
          if (!boundsOverlapNode(bounds, node, nodeWidth, nodeHeight, 2)) continue;
          if (pointInsideNode(point, node, nodeWidth, nodeHeight, 2)) return false;
        }
      }
    }
    return true;
  }

  function cubicBounds(segment) {
    return {
      minX: Math.min(segment.start.x, segment.startHandle.x, segment.endHandle.x, segment.end.x),
      maxX: Math.max(segment.start.x, segment.startHandle.x, segment.endHandle.x, segment.end.x),
      minY: Math.min(segment.start.y, segment.startHandle.y, segment.endHandle.y, segment.end.y),
      maxY: Math.max(segment.start.y, segment.startHandle.y, segment.endHandle.y, segment.end.y)
    };
  }

  function boundsOverlapNode(bounds, node, nodeWidth, nodeHeight, padding) {
    return bounds.maxX > node.x + padding &&
      bounds.minX < node.x + nodeWidth - padding &&
      bounds.maxY > node.y + padding &&
      bounds.minY < node.y + nodeHeight - padding;
  }

  function distanceBetween(first, second) {
    return Math.hypot(second.x - first.x, second.y - first.y);
  }

  function pointInsideNode(point, node, nodeWidth, nodeHeight, padding) {
    return point.x > node.x + padding &&
      point.x < node.x + nodeWidth - padding &&
      point.y > node.y + padding &&
      point.y < node.y + nodeHeight - padding;
  }

  function createObstacleRouter({ nodes, nodeWidth, nodeHeight, clearance, extraPoints }) {
    const obstacles = nodes.map(node => ({
      node,
      left: node.x - clearance,
      right: node.x + nodeWidth + clearance,
      top: node.y - clearance,
      bottom: node.y + nodeHeight + clearance
    }));
    const horizontalIntervals = obstacles.map(obstacle => [obstacle.left, obstacle.right]);
    const verticalIntervals = obstacles.map(obstacle => [obstacle.top, obstacle.bottom]);
    const xCoordinates = collectChannelCoordinates(horizontalIntervals, extraPoints.map(point => point[0]));
    const yCoordinates = collectChannelCoordinates(verticalIntervals, extraPoints.map(point => point[1]));
    const width = xCoordinates.length;
    const height = yCoordinates.length;
    const pointFree = new Uint8Array(width * height);
    const horizontalFree = new Uint8Array(width * height);
    const verticalFree = new Uint8Array(width * height);
    const xIndexByValue = new Map(xCoordinates.map((value, index) => [value, index]));
    const yIndexByValue = new Map(yCoordinates.map((value, index) => [value, index]));

    for (let yIndex = 0; yIndex < height; yIndex += 1) {
      for (let xIndex = 0; xIndex < width; xIndex += 1) {
        const pointIndex = yIndex * width + xIndex;
        const point = [xCoordinates[xIndex], yCoordinates[yIndex]];
        pointFree[pointIndex] = pointIsFree(point[0], point[1]) ? 1 : 0;
        if (xIndex + 1 < width) {
          horizontalFree[pointIndex] = segmentIsFree(point, [xCoordinates[xIndex + 1], yCoordinates[yIndex]]) ? 1 : 0;
        }
        if (yIndex + 1 < height) {
          verticalFree[pointIndex] = segmentIsFree(point, [xCoordinates[xIndex], yCoordinates[yIndex + 1]]) ? 1 : 0;
        }
      }
    }

    function findPath({ source, target, startPoint, endPoint, startSide, endSide, nodeWidth, nodeHeight }) {
      const start = escapePoint(source, startPoint, startSide, nodeWidth, nodeHeight, clearance);
      const end = approachPoint(target, endPoint, endSide, nodeWidth, nodeHeight, clearance);
      const startX = xIndexByValue.get(start[0]);
      const startY = yIndexByValue.get(start[1]);
      const endX = xIndexByValue.get(end[0]);
      const endY = yIndexByValue.get(end[1]);
      if (startX === undefined || startY === undefined || endX === undefined || endY === undefined) return null;

      const startIndex = startY * width + startX;
      const endIndex = endY * width + endX;
      if (!pointFree[startIndex] || !pointFree[endIndex]) return null;

      const path = findGridPath({ startIndex, endIndex, startCoordinates: start, endCoordinates: end });
      if (!path) return null;
      return removeDuplicatePoints([startPoint, ...path, endPoint]);
    }

    function findGridPath({ startIndex, endIndex, startCoordinates, endCoordinates }) {
      const stateCount = width * height * 3;
      const costs = new Float64Array(stateCount);
      costs.fill(Infinity);
      const previous = new Int32Array(stateCount);
      previous.fill(-1);
      const queue = new MinHeap();
      const startState = startIndex * 3;
      costs[startState] = 0;
      queue.push(startState, heuristic(startIndex, endIndex));

      while (queue.size > 0) {
        const state = queue.pop();
        const pointIndex = Math.floor(state / 3);
        const direction = state % 3;
        if (pointIndex === endIndex) {
          return reconstructPath(state, previous, startCoordinates, endCoordinates);
        }

        const xIndex = pointIndex % width;
        const yIndex = Math.floor(pointIndex / width);
        const neighbors = [
          { x: xIndex - 1, y: yIndex, direction: 1 },
          { x: xIndex + 1, y: yIndex, direction: 1 },
          { x: xIndex, y: yIndex - 1, direction: 2 },
          { x: xIndex, y: yIndex + 1, direction: 2 }
        ];

        for (const neighbor of neighbors) {
          if (neighbor.x < 0 || neighbor.x >= width || neighbor.y < 0 || neighbor.y >= height) continue;
          const neighborIndex = neighbor.y * width + neighbor.x;
          if (!pointFree[neighborIndex]) continue;
          if (neighbor.direction === 1) {
            const leftX = Math.min(xIndex, neighbor.x);
            if (!horizontalFree[yIndex * width + leftX]) continue;
          } else {
            const topY = Math.min(yIndex, neighbor.y);
            if (!verticalFree[topY * width + xIndex]) continue;
          }
          const nextState = neighborIndex * 3 + neighbor.direction;
          const stepCost = neighbor.direction === 1
            ? Math.abs(xCoordinates[neighbor.x] - xCoordinates[xIndex])
            : Math.abs(yCoordinates[neighbor.y] - yCoordinates[yIndex]);
          const turnCost = direction !== 0 && direction !== neighbor.direction ? turnPenalty : 0;
          const nextCost = costs[state] + stepCost + turnCost;
          if (nextCost >= costs[nextState]) continue;
          costs[nextState] = nextCost;
          previous[nextState] = state;
          queue.push(nextState, nextCost + heuristic(neighborIndex, endIndex));
        }
      }

      return null;
    }

    function reconstructPath(endState, previous, startCoordinates, endCoordinates) {
      const points = [];
      let state = endState;
      while (state !== -1) {
        const pointIndex = Math.floor(state / 3);
        const xIndex = pointIndex % xCoordinates.length;
        const yIndex = Math.floor(pointIndex / xCoordinates.length);
        points.push([xCoordinates[xIndex], yCoordinates[yIndex]]);
        state = previous[state];
      }
      points.reverse();
      points[0] = startCoordinates;
      points[points.length - 1] = endCoordinates;
      return simplifyOrthogonalPath(points);
    }

    function heuristic(firstIndex, secondIndex) {
      const firstX = firstIndex % xCoordinates.length;
      const firstY = Math.floor(firstIndex / xCoordinates.length);
      const secondX = secondIndex % xCoordinates.length;
      const secondY = Math.floor(secondIndex / xCoordinates.length);
      return Math.abs(xCoordinates[firstX] - xCoordinates[secondX]) +
        Math.abs(yCoordinates[firstY] - yCoordinates[secondY]);
    }

    function pointIsFree(x, y) {
      return !obstacles.some(obstacle => (
        x > obstacle.left + coordinateTolerance &&
        x < obstacle.right - coordinateTolerance &&
        y > obstacle.top + coordinateTolerance &&
        y < obstacle.bottom - coordinateTolerance
      ));
    }

    function segmentIsFree(first, second) {
      for (const obstacle of obstacles) {
        if (segmentCrossesObstacle(first, second, obstacle)) return false;
      }
      return true;
    }

    return Object.freeze({ findPath });
  }

  function segmentCrossesObstacle(first, second, obstacle) {
    if (Math.abs(first[0] - second[0]) < coordinateTolerance) {
      const x = first[0];
      const from = Math.min(first[1], second[1]);
      const to = Math.max(first[1], second[1]);
      return x > obstacle.left + coordinateTolerance &&
        x < obstacle.right - coordinateTolerance &&
        to > obstacle.top + coordinateTolerance &&
        from < obstacle.bottom - coordinateTolerance;
    }
    if (Math.abs(first[1] - second[1]) < coordinateTolerance) {
      const y = first[1];
      const from = Math.min(first[0], second[0]);
      const to = Math.max(first[0], second[0]);
      return y > obstacle.top + coordinateTolerance &&
        y < obstacle.bottom - coordinateTolerance &&
        to > obstacle.left + coordinateTolerance &&
        from < obstacle.right - coordinateTolerance;
    }
    return false;
  }

  function collectChannelCoordinates(intervals, extraValues) {
    const merged = mergeIntervals(intervals);
    const coordinates = new Set(extraValues);
    for (const [start, end] of merged) {
      coordinates.add(start);
      coordinates.add(end);
    }
    for (let index = 0; index < merged.length - 1; index += 1) {
      coordinates.add((merged[index][1] + merged[index + 1][0]) / 2);
    }
    return [...coordinates].sort((first, second) => first - second);
  }

  function mergeIntervals(intervals) {
    const sorted = intervals
      .map(interval => [Math.min(interval[0], interval[1]), Math.max(interval[0], interval[1])])
      .sort((first, second) => first[0] - second[0]);
    const merged = [];
    for (const interval of sorted) {
      const latest = merged[merged.length - 1];
      if (latest && interval[0] <= latest[1]) {
        latest[1] = Math.max(latest[1], interval[1]);
      } else {
        merged.push([interval[0], interval[1]]);
      }
    }
    return merged;
  }

  function simplifyOrthogonalPath(points) {
    const cleaned = removeDuplicatePoints(points);
    if (cleaned.length <= 2) return cleaned;
    const result = [cleaned[0]];
    for (let index = 1; index < cleaned.length - 1; index += 1) {
      const previous = result[result.length - 1];
      const current = cleaned[index];
      const next = cleaned[index + 1];
      const horizontal = Math.abs(previous[1] - current[1]) < coordinateTolerance &&
        Math.abs(current[1] - next[1]) < coordinateTolerance;
      const vertical = Math.abs(previous[0] - current[0]) < coordinateTolerance &&
        Math.abs(current[0] - next[0]) < coordinateTolerance;
      if (!horizontal && !vertical) result.push(current);
    }
    result.push(cleaned[cleaned.length - 1]);
    return removeDuplicatePoints(result);
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

  function buildBezierSegments(rawPoints, options = {}) {
    if (!Array.isArray(rawPoints)) return [];
    const points = removeDuplicatePoints(rawPoints.map(toPathPoint).filter(Boolean));
    if (points.length < 2) return [];

    const startDirection = sideDirection(options.startSide, defaultStartSide);
    const endDirection = sideDirection(options.endSide, defaultEndSide);
    const segments = [];

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
      segments.push({ start, startHandle, endHandle, end });
    }

    return segments;
  }

  // Builds a cubic bezier chain through every point. Endpoint tangents point
  // away from the node side they touch, while interior points use Catmull-Rom
  // tangents for a smooth, bendable line.
  function buildBezierPath(rawPoints, options = {}) {
    if (options.rounded) return buildRoundedOrthogonalPath(rawPoints);
    const segments = buildBezierSegments(rawPoints, options);
    if (!segments.length) return '';
    const parts = [`M ${roundCoordinate(segments[0].start.x)} ${roundCoordinate(segments[0].start.y)}`];
    for (const segment of segments) {
      parts.push(
        `C ${roundCoordinate(segment.startHandle.x)} ${roundCoordinate(segment.startHandle.y)} ` +
        `${roundCoordinate(segment.endHandle.x)} ${roundCoordinate(segment.endHandle.y)} ` +
        `${roundCoordinate(segment.end.x)} ${roundCoordinate(segment.end.y)}`
      );
    }
    return parts.join(' ');
  }

  function buildRoundedOrthogonalPath(rawPoints) {
    if (!Array.isArray(rawPoints)) return '';
    const points = removeDuplicatePoints(rawPoints.map(toPathPoint).filter(Boolean));
    if (points.length < 2) return '';

    const parts = [`M ${roundCoordinate(points[0].x)} ${roundCoordinate(points[0].y)}`];
    for (let index = 1; index < points.length - 1; index += 1) {
      const previous = points[index - 1];
      const corner = points[index];
      const next = points[index + 1];
      const incomingLength = distanceBetween(previous, corner);
      const outgoingLength = distanceBetween(corner, next);
      const radius = Math.min(18, incomingLength / 2, outgoingLength / 2);
      const before = pointTowards(corner, previous, radius);
      const after = pointTowards(corner, next, radius);
      parts.push(`L ${roundCoordinate(before.x)} ${roundCoordinate(before.y)}`);
      parts.push(`Q ${roundCoordinate(corner.x)} ${roundCoordinate(corner.y)} ${roundCoordinate(after.x)} ${roundCoordinate(after.y)}`);
    }
    const last = points[points.length - 1];
    parts.push(`L ${roundCoordinate(last.x)} ${roundCoordinate(last.y)}`);
    return parts.join(' ');
  }

  function pointTowards(from, to, distance) {
    const length = distanceBetween(from, to);
    if (length === 0) return { x: from.x, y: from.y };
    const ratio = Math.min(1, distance / length);
    return {
      x: from.x + (to.x - from.x) * ratio,
      y: from.y + (to.y - from.y) * ratio
    };
  }

  function pointOnCubic(segment, t) {
    const inverse = 1 - t;
    const inverseSquared = inverse * inverse;
    const tSquared = t * t;
    return {
      x: inverseSquared * inverse * segment.start.x +
        3 * inverseSquared * t * segment.startHandle.x +
        3 * inverse * tSquared * segment.endHandle.x +
        tSquared * t * segment.end.x,
      y: inverseSquared * inverse * segment.start.y +
        3 * inverseSquared * t * segment.startHandle.y +
        3 * inverse * tSquared * segment.endHandle.y +
        tSquared * t * segment.end.y
    };
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

  class MinHeap {
    constructor() {
      this.items = [];
    }

    get size() {
      return this.items.length;
    }

    push(item, priority) {
      this.items.push({ item, priority });
      this.bubbleUp(this.items.length - 1);
    }

    pop() {
      const first = this.items[0];
      const last = this.items.pop();
      if (this.items.length > 0) {
        this.items[0] = last;
        this.sinkDown(0);
      }
      return first.item;
    }

    bubbleUp(index) {
      while (index > 0) {
        const parentIndex = Math.floor((index - 1) / 2);
        if (this.items[parentIndex].priority <= this.items[index].priority) break;
        [this.items[parentIndex], this.items[index]] = [this.items[index], this.items[parentIndex]];
        index = parentIndex;
      }
    }

    sinkDown(index) {
      while (true) {
        const leftIndex = index * 2 + 1;
        const rightIndex = leftIndex + 1;
        let smallestIndex = index;
        if (leftIndex < this.items.length && this.items[leftIndex].priority < this.items[smallestIndex].priority) {
          smallestIndex = leftIndex;
        }
        if (rightIndex < this.items.length && this.items[rightIndex].priority < this.items[smallestIndex].priority) {
          smallestIndex = rightIndex;
        }
        if (smallestIndex === index) break;
        [this.items[smallestIndex], this.items[index]] = [this.items[index], this.items[smallestIndex]];
        index = smallestIndex;
      }
    }
  }

  return Object.freeze({ computeEdgeRoutes, buildBezierPath });
});
