const test = require('node:test');
const assert = require('node:assert/strict');

const { computeEdgeRoutes, buildBezierPath } = require('../app/edge-routing.js');

const NODE_WIDTH = 256;
const NODE_HEIGHT = 160;
const GRID_SIZE = 32;

function createNode(id, x, y) {
  return { id, x, y, data: { id } };
}

function createEdge(id, from, to) {
  return { id, from, to };
}

function computeRoutes(nodes, edges) {
  return computeEdgeRoutes({
    nodes,
    edges,
    nodeWidth: NODE_WIDTH,
    nodeHeight: NODE_HEIGHT,
    gridSize: GRID_SIZE
  });
}

function routeById(routes, edgeId) {
  return routes.find(route => route.edgeId === edgeId);
}

test('routes a forward connection between the facing sides', () => {
  const routes = computeRoutes(
    [createNode('a', 0, 0), createNode('b', 512, 64)],
    [createEdge('e1', 'a', 'b')]
  );
  const route = routeById(routes, 'e1');

  assert.equal(route.kind, 'bezier');
  assert.equal(route.startSide, 'right');
  assert.equal(route.endSide, 'left');
  assert.deepEqual(route.points[0], [NODE_WIDTH, NODE_HEIGHT / 2]);
  assert.deepEqual(route.points.at(-1), [512, 64 + NODE_HEIGHT / 2]);
  assert.equal(route.points.length, 4);
});

test('routes a backward connection between the facing sides', () => {
  const routes = computeRoutes(
    [createNode('a', 700, 0), createNode('b', 0, 0)],
    [createEdge('e1', 'a', 'b')]
  );
  const route = routeById(routes, 'e1');

  assert.equal(route.kind, 'bezier');
  assert.equal(route.startSide, 'left');
  assert.equal(route.endSide, 'right');
  assert.deepEqual(route.points[0], [700, NODE_HEIGHT / 2]);
  assert.deepEqual(route.points.at(-1), [NODE_WIDTH, NODE_HEIGHT / 2]);
});

test('routes a same-column connection from bottom to top', () => {
  const routes = computeRoutes(
    [createNode('a', 0, 0), createNode('b', 0, 500)],
    [createEdge('e1', 'a', 'b')]
  );
  const route = routeById(routes, 'e1');

  assert.equal(route.startSide, 'bottom');
  assert.equal(route.endSide, 'top');
  assert.deepEqual(route.points[0], [NODE_WIDTH / 2, NODE_HEIGHT]);
  assert.deepEqual(route.points.at(-1), [NODE_WIDTH / 2, 500]);
});

test('keeps long forward connections direct instead of detouring around nodes', () => {
  const routes = computeRoutes(
    [
      createNode('a', 0, 0),
      createNode('blocker', 512, -200),
      createNode('b', 1024, 500)
    ],
    [createEdge('e1', 'a', 'b')]
  );
  const route = routeById(routes, 'e1');
  const yCoordinates = route.points.map(point => point[1]);

  assert.deepEqual(route.points[0], [NODE_WIDTH, NODE_HEIGHT / 2]);
  assert.deepEqual(route.points.at(-1), [1024, 500 + NODE_HEIGHT / 2]);
  assert.equal(Math.min(...yCoordinates), NODE_HEIGHT / 2);
  assert.equal(Math.max(...yCoordinates), 500 + NODE_HEIGHT / 2);
  assert.equal(route.points.length, 4);
});

test('fans outgoing connections out over distinct source ports', () => {
  const routes = computeRoutes(
    [
      createNode('a', 0, 0),
      createNode('b', 512, -200),
      createNode('c', 512, 200)
    ],
    [createEdge('e1', 'a', 'b'), createEdge('e2', 'a', 'c')]
  );
  const firstStartY = routeById(routes, 'e1').points[0][1];
  const secondStartY = routeById(routes, 'e2').points[0][1];

  assert.notEqual(firstStartY, secondStartY);
});

test('fans incoming connections in over distinct target ports', () => {
  const routes = computeRoutes(
    [
      createNode('a', 0, -200),
      createNode('b', 0, 200),
      createNode('c', 512, 0)
    ],
    [createEdge('e1', 'a', 'c'), createEdge('e2', 'b', 'c')]
  );
  const firstEndY = routeById(routes, 'e1').points.at(-1)[1];
  const secondEndY = routeById(routes, 'e2').points.at(-1)[1];

  assert.notEqual(firstEndY, secondEndY);
});

test('separates backward connections arriving at the same target', () => {
  const routes = computeRoutes(
    [
      createNode('a', 700, 0),
      createNode('b', 0, 0),
      createNode('c', 700, 300)
    ],
    [createEdge('e1', 'a', 'b'), createEdge('e2', 'c', 'b')]
  );
  const firstEndY = routeById(routes, 'e1').points.at(-1)[1];
  const secondEndY = routeById(routes, 'e2').points.at(-1)[1];

  assert.equal(routeById(routes, 'e1').endSide, 'right');
  assert.equal(routeById(routes, 'e2').endSide, 'right');
  assert.notEqual(firstEndY, secondEndY);
});

test('ignores self connections and edges with missing nodes', () => {
  const routes = computeRoutes(
    [createNode('a', 0, 0), createNode('b', 512, 0)],
    [
      createEdge('self', 'a', 'a'),
      createEdge('missing', 'a', 'missing'),
      createEdge('valid', 'a', 'b')
    ]
  );

  assert.deepEqual(routes.map(route => route.edgeId), ['valid']);
});

test('renders computed routes as cubic bezier paths instead of straight segments', () => {
  const routes = computeRoutes(
    [createNode('a', 0, 0), createNode('b', 512, 64)],
    [createEdge('e1', 'a', 'b')]
  );
  const route = routeById(routes, 'e1');

  assert.match(route.path, /^M /);
  assert.doesNotMatch(route.path, / L /);
  assert.equal((route.path.match(/ C /g) || []).length, route.points.length - 1);
});

test('builds a cubic bezier path through custom waypoints', () => {
  const path = buildBezierPath([[0, 0], [100, -80], [200, 40], [300, 0]]);

  assert.match(path, /^M 0 0/);
  assert.ok(path.endsWith('300 0'));
  assert.equal((path.match(/ C /g) || []).length, 3);
});

test('keeps endpoint handles inside the first and last segment', () => {
  const path = buildBezierPath([[0, 0], [16, 0], [16, 100], [32, 100]]);
  const coordinates = path.match(/-?\d+(?:\.\d+)?/g).map(Number);

  const firstControlX = coordinates[2];
  const lastControlX = coordinates[coordinates.length - 4];

  assert.ok(firstControlX > 0 && firstControlX <= 16);
  assert.ok(lastControlX >= 16 && lastControlX < 32);
});

test('points endpoint tangents away from the node sides', () => {
  const horizontalPath = buildBezierPath([[0, 0], [100, 40]], { startSide: 'left', endSide: 'right' });
  const horizontalCoordinates = horizontalPath.match(/-?\d+(?:\.\d+)?/g).map(Number);
  assert.ok(horizontalCoordinates[2] < 0);
  assert.ok(horizontalCoordinates[horizontalCoordinates.length - 4] > 100);

  const verticalPath = buildBezierPath([[0, 0], [40, 100]], { startSide: 'bottom', endSide: 'top' });
  const verticalCoordinates = verticalPath.match(/-?\d+(?:\.\d+)?/g).map(Number);
  assert.ok(verticalCoordinates[3] > 0);
  assert.ok(verticalCoordinates[verticalCoordinates.length - 3] < 100);
});

test('returns an empty bezier path when fewer than two points are given', () => {
  assert.equal(buildBezierPath([[10, 10]]), '');
  assert.equal(buildBezierPath([]), '');
  assert.equal(buildBezierPath(null), '');
});

test('rejects invalid node dimensions', () => {
  assert.throws(
    () => computeEdgeRoutes({ nodes: [], edges: [], nodeWidth: NaN, nodeHeight: NODE_HEIGHT }),
    TypeError
  );
});
