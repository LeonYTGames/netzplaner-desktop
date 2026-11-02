const test = require('node:test');
const assert = require('node:assert/strict');

const { computeLayeredLayout } = require('../app/auto-layout.js');

const NODE_WIDTH = 256;
const NODE_HEIGHT = 160;
const GRID_SIZE = 32;

function createNode(id) {
  return { id, data: { id } };
}

function computeLayout(nodes, edges, options = {}) {
  return computeLayeredLayout({
    nodes,
    edges,
    nodeWidth: NODE_WIDTH,
    nodeHeight: NODE_HEIGHT,
    gridSize: GRID_SIZE,
    ...options
  });
}

function assertNoOverlap(positions, nodeWidth = NODE_WIDTH, nodeHeight = NODE_HEIGHT) {
  const entries = [...positions.entries()];

  for (let firstIndex = 0; firstIndex < entries.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < entries.length; secondIndex += 1) {
      const [firstId, firstPosition] = entries[firstIndex];
      const [secondId, secondPosition] = entries[secondIndex];
      const overlapsHorizontally =
        firstPosition.x < secondPosition.x + nodeWidth &&
        secondPosition.x < firstPosition.x + nodeWidth;
      const overlapsVertically =
        firstPosition.y < secondPosition.y + nodeHeight &&
        secondPosition.y < firstPosition.y + nodeHeight;

      assert.equal(
        overlapsHorizontally && overlapsVertically,
        false,
        `${firstId} overlaps ${secondId}`
      );
    }
  }
}

function assertGridAligned(positions) {
  for (const [nodeId, position] of positions) {
    assert.equal(position.x % GRID_SIZE, 0, `${nodeId} is not aligned horizontally`);
    assert.equal(position.y % GRID_SIZE, 0, `${nodeId} is not aligned vertically`);
  }
}

test('places a chain in left-to-right layers', () => {
  const positions = computeLayout(
    [createNode('a'), createNode('b'), createNode('c')],
    [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }]
  );

  assert.equal(positions.get('a').y, positions.get('b').y);
  assert.equal(positions.get('b').y, positions.get('c').y);
  assert.ok(positions.get('b').x > positions.get('a').x);
  assert.ok(positions.get('c').x > positions.get('b').x);
});

test('keeps parallel branches in the same layer without overlap', () => {
  const positions = computeLayout(
    [createNode('a'), createNode('b'), createNode('c'), createNode('d')],
    [
      { from: 'a', to: 'b' },
      { from: 'a', to: 'c' },
      { from: 'b', to: 'd' },
      { from: 'c', to: 'd' }
    ]
  );

  assert.equal(positions.get('b').x, positions.get('c').x);
  assert.notEqual(positions.get('b').y, positions.get('c').y);
  assert.ok(positions.get('d').x > positions.get('b').x);
  assert.ok(positions.get('d').x > positions.get('c').x);
  assertNoOverlap(positions);
});

test('spreads a connected cycle across readable layers', () => {
  const positions = computeLayout(
    [createNode('a'), createNode('b'), createNode('c')],
    [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
      { from: 'c', to: 'a' }
    ]
  );

  assert.equal(positions.size, 3);
  assert.ok(positions.get('b').x > positions.get('a').x);
  assert.ok(positions.get('c').x > positions.get('b').x);
  assertNoOverlap(positions);
});

test('places nodes before a cycle in earlier layers', () => {
  const positions = computeLayout(
    [createNode('start'), createNode('a'), createNode('b')],
    [
      { from: 'start', to: 'a' },
      { from: 'a', to: 'b' },
      { from: 'b', to: 'a' }
    ]
  );

  assert.ok(positions.get('start').x < positions.get('a').x);
  assert.ok(positions.get('a').x < positions.get('b').x);
  assertNoOverlap(positions);
});

test('stacks disconnected components instead of mixing them', () => {
  const positions = computeLayout(
    [createNode('a'), createNode('b'), createNode('c'), createNode('d')],
    [
      { from: 'a', to: 'b' },
      { from: 'c', to: 'd' }
    ]
  );

  assert.equal(positions.get('a').x, positions.get('c').x);
  assert.ok(positions.get('c').y > positions.get('a').y);
  assert.ok(positions.get('c').y > positions.get('b').y);
  assertNoOverlap(positions);
});

test('ignores self connections, duplicate connections and missing nodes', () => {
  const cleanPositions = computeLayout(
    [createNode('a'), createNode('b')],
    [{ from: 'a', to: 'b' }]
  );

  const noisyPositions = computeLayout(
    [createNode('a'), createNode('b')],
    [
      { from: 'a', to: 'a' },
      { from: 'a', to: 'b' },
      { from: 'a', to: 'b' },
      { from: 'a', to: 'missing' },
      { from: 'missing', to: 'b' }
    ]
  );

  assert.deepEqual([...noisyPositions.entries()], [...cleanPositions.entries()]);
});

test('sorts long connections without overlap and aligns every node to the grid', () => {
  const positions = computeLayout(
    [createNode('a'), createNode('b'), createNode('c'), createNode('d'), createNode('e')],
    [
      { from: 'a', to: 'd' },
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
      { from: 'c', to: 'd' },
      { from: 'b', to: 'e' }
    ]
  );

  assert.equal(positions.size, 5);
  assertNoOverlap(positions);
  assertGridAligned(positions);
});

test('works with the minified node height', () => {
  const positions = computeLayout(
    [createNode('a'), createNode('b'), createNode('c')],
    [{ from: 'a', to: 'b' }, { from: 'a', to: 'c' }],
    { nodeHeight: 128 }
  );

  assertNoOverlap(positions, NODE_WIDTH, 128);
  assertGridAligned(positions);
});

test('is deterministic and leaves the input untouched', () => {
  const nodes = [createNode('a'), createNode('b'), createNode('c'), createNode('d')];
  const edges = [
    { from: 'a', to: 'c' },
    { from: 'b', to: 'c' },
    { from: 'c', to: 'd' }
  ];
  const nodesBefore = JSON.stringify(nodes);
  const edgesBefore = JSON.stringify(edges);

  const firstPositions = [...computeLayout(nodes, edges).entries()];
  const secondPositions = [...computeLayout(nodes, edges).entries()];

  assert.deepEqual(firstPositions, secondPositions);
  assert.equal(JSON.stringify(nodes), nodesBefore);
  assert.equal(JSON.stringify(edges), edgesBefore);
});

test('returns an empty result for an empty project', () => {
  assert.equal(computeLayout([], []).size, 0);
});
