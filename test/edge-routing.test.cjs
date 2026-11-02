const test = require('node:test');
const assert = require('node:assert/strict');

const { computeEdgeRoutes } = require('../app/edge-routing.js');

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

function maximumY(points) {
  return Math.max(...points.map(point => point[1]));
}

function minimumY(points) {
  return Math.min(...points.map(point => point[1]));
}

test('routes a neighbouring forward connection between the two nodes', () => {
  const routes = computeRoutes(
    [createNode('a', 0, 0), createNode('b', 512, 64)],
    [createEdge('e1', 'a', 'b')]
  );
  const route = routeById(routes, 'e1');

  assert.equal(route.kind, 'short-forward');
  assert.deepEqual(route.points[0], [NODE_WIDTH, NODE_HEIGHT / 2]);
  assert.deepEqual(route.points.at(-1), [512, 64 + NODE_HEIGHT / 2]);

  const corridorX = route.points[1][0];
  assert.ok(corridorX > NODE_WIDTH, 'the corridor is right of the source');
  assert.ok(corridorX < 512, 'the corridor is left of the target');
});

test('routes a backward connection through a lane below both nodes', () => {
  const routes = computeRoutes(
    [createNode('a', 700, 0), createNode('b', 0, 0)],
    [createEdge('e1', 'a', 'b')]
  );
  const route = routeById(routes, 'e1');
  const lowestNodeEdge = NODE_HEIGHT;

  assert.equal(route.kind, 'backward');
  assert.deepEqual(route.points[0], [700 + NODE_WIDTH, NODE_HEIGHT / 2]);
  assert.deepEqual(route.points.at(-1), [0, NODE_HEIGHT / 2]);
  assert.ok(maximumY(route.points) > lowestNodeEdge, 'the backward route goes below the nodes');
});

test('routes a long forward connection around intermediate nodes', () => {
  const routes = computeRoutes(
    [
      createNode('a', 0, 0),
      createNode('blocker', 512, -200),
      createNode('b', 1024, 500)
    ],
    [createEdge('e1', 'a', 'b')]
  );
  const route = routeById(routes, 'e1');
  const blockerBottom = -200 + NODE_HEIGHT;

  assert.equal(route.kind, 'long-forward');
  assert.ok(maximumY(route.points) > 500 + NODE_HEIGHT, 'the long route goes below the target');
  assert.ok(maximumY(route.points) > blockerBottom, 'the long route avoids the intermediate node');
});

test('routes a long forward connection above the nodes when it goes upwards', () => {
  const routes = computeRoutes(
    [
      createNode('a', 0, 600),
      createNode('blocker', 512, 700),
      createNode('b', 1024, 0)
    ],
    [createEdge('e1', 'a', 'b')]
  );
  const route = routeById(routes, 'e1');

  assert.equal(route.kind, 'long-forward');
  assert.ok(minimumY(route.points) < 0, 'the long route goes above the highest node');
});

test('routes a same-column connection below the column', () => {
  const routes = computeRoutes(
    [createNode('a', 0, 0), createNode('b', 0, 500)],
    [createEdge('e1', 'a', 'b')]
  );
  const route = routeById(routes, 'e1');

  assert.equal(route.kind, 'backward');
  assert.ok(maximumY(route.points) > 500 + NODE_HEIGHT);
});

test('separates several backward connections into different lanes', () => {
  const routes = computeRoutes(
    [
      createNode('a', 700, 0),
      createNode('b', 0, 0),
      createNode('c', 700, 300)
    ],
    [createEdge('e1', 'a', 'b'), createEdge('e2', 'c', 'b')]
  );
  const firstLane = maximumY(routeById(routes, 'e1').points);
  const secondLane = maximumY(routeById(routes, 'e2').points);

  assert.notEqual(firstLane, secondLane);
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

test('rejects invalid node dimensions', () => {
  assert.throws(
    () => computeEdgeRoutes({ nodes: [], edges: [], nodeWidth: NaN, nodeHeight: NODE_HEIGHT }),
    TypeError
  );
});
