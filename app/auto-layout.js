(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NetzplanerAutoLayout = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function computeLayeredLayout({
    nodes,
    edges,
    nodeWidth,
    nodeHeight,
    gridSize = 32,
    horizontalGap = gridSize * 4,
    verticalGap = gridSize,
    componentGap = gridSize * 2
  }) {
    if (!Array.isArray(nodes) || nodes.length === 0) return new Map();
    if (!Number.isFinite(nodeWidth) || !Number.isFinite(nodeHeight)) {
      throw new TypeError('nodeWidth and nodeHeight must be finite numbers');
    }

    const nodeIds = new Set(nodes.map(node => node.id));
    const layoutEdges = collectValidEdges(edges, nodeIds);
    const connectedComponents = findConnectedComponents(nodes, layoutEdges);

    const positions = new Map();
    let componentTop = 0;

    for (const componentNodeIds of connectedComponents) {
      const componentLayout = layoutComponent(componentNodeIds, layoutEdges, {
        nodeWidth,
        nodeHeight,
        gridSize,
        horizontalGap,
        verticalGap
      });

      for (const [nodeId, position] of componentLayout.positions) {
        positions.set(nodeId, { x: position.x, y: position.y + componentTop });
      }
      componentTop += componentLayout.height + componentGap;
    }

    return positions;
  }

  function collectValidEdges(edges, nodeIds) {
    const validEdges = [];
    const seenConnections = new Set();

    for (const edge of edges || []) {
      if (!edge || !nodeIds.has(edge.from) || !nodeIds.has(edge.to)) continue;
      if (edge.from === edge.to) continue;

      const connectionKey = `${edge.from}\u0000${edge.to}`;
      if (seenConnections.has(connectionKey)) continue;

      seenConnections.add(connectionKey);
      validEdges.push({ from: edge.from, to: edge.to });
    }

    return validEdges;
  }

  function findConnectedComponents(nodes, edges) {
    const parentByIndex = nodes.map((node, index) => index);
    const indexByNodeId = new Map(nodes.map((node, index) => [node.id, index]));

    function findRoot(index) {
      let root = index;
      while (parentByIndex[root] !== root) root = parentByIndex[root];

      while (parentByIndex[index] !== root) {
        const nextIndex = parentByIndex[index];
        parentByIndex[index] = root;
        index = nextIndex;
      }

      return root;
    }

    for (const edge of edges) {
      const fromRoot = findRoot(indexByNodeId.get(edge.from));
      const toRoot = findRoot(indexByNodeId.get(edge.to));
      if (fromRoot !== toRoot) parentByIndex[toRoot] = fromRoot;
    }

    const componentByRoot = new Map();
    for (let index = 0; index < nodes.length; index += 1) {
      const root = findRoot(index);
      if (!componentByRoot.has(root)) componentByRoot.set(root, []);
      componentByRoot.get(root).push(nodes[index].id);
    }

    return [...componentByRoot.values()];
  }

  function layoutComponent(nodeIds, edges, options) {
    const nodeIdSet = new Set(nodeIds);
    const outgoingByNodeId = new Map(nodeIds.map(nodeId => [nodeId, []]));

    for (const edge of edges) {
      if (!nodeIdSet.has(edge.from) || !nodeIdSet.has(edge.to)) continue;
      outgoingByNodeId.get(edge.from).push(edge.to);
    }

    const forwardOutgoingByNodeId = breakCycles(nodeIds, outgoingByNodeId);
    const forwardIncomingByNodeId = new Map(nodeIds.map(nodeId => [nodeId, []]));

    for (const [fromNodeId, targetNodeIds] of forwardOutgoingByNodeId) {
      for (const targetNodeId of targetNodeIds) {
        forwardIncomingByNodeId.get(targetNodeId).push(fromNodeId);
      }
    }

    const layerByNodeId = assignLayers(nodeIds, forwardOutgoingByNodeId, forwardIncomingByNodeId);
    const maxLayer = [...layerByNodeId.values()].reduce((maximum, layer) => Math.max(maximum, layer), 0);
    const layers = Array.from({ length: maxLayer + 1 }, () => []);

    for (const nodeId of nodeIds) layers[layerByNodeId.get(nodeId)].push(nodeId);

    const nodeOrderById = new Map(nodeIds.map((nodeId, index) => [nodeId, index]));
    for (const layer of layers) {
      layer.sort((firstId, secondId) => nodeOrderById.get(firstId) - nodeOrderById.get(secondId));
    }

    orderWithinLayers(layers, forwardIncomingByNodeId, forwardOutgoingByNodeId);

    return buildPositions(layers, options);
  }

  function breakCycles(nodeIds, outgoingByNodeId) {
    const visitStateByNodeId = new Map();
    const forwardOutgoingByNodeId = new Map(nodeIds.map(nodeId => [nodeId, []]));

    for (const startNodeId of nodeIds) {
      if (visitStateByNodeId.get(startNodeId) === 2) continue;

      visitStateByNodeId.set(startNodeId, 1);
      const callStack = [{ nodeId: startNodeId, neighborIndex: 0 }];

      while (callStack.length > 0) {
        const frame = callStack[callStack.length - 1];
        const neighbors = outgoingByNodeId.get(frame.nodeId) || [];

        if (frame.neighborIndex < neighbors.length) {
          const neighborId = neighbors[frame.neighborIndex];
          frame.neighborIndex += 1;
          const neighborState = visitStateByNodeId.get(neighborId) || 0;

          if (neighborState === 1) {
            // This connection closes a cycle. Leave it out of the forward graph;
            // the renderer draws it as a backward connection instead.
            continue;
          }

          forwardOutgoingByNodeId.get(frame.nodeId).push(neighborId);

          if (neighborState === 0) {
            visitStateByNodeId.set(neighborId, 1);
            callStack.push({ nodeId: neighborId, neighborIndex: 0 });
          }
          continue;
        }

        visitStateByNodeId.set(frame.nodeId, 2);
        callStack.pop();
      }
    }

    return forwardOutgoingByNodeId;
  }

  function assignLayers(nodeIds, outgoingByNodeId, incomingByNodeId) {
    const layerByNodeId = new Map(nodeIds.map(nodeId => [nodeId, 0]));
    const remainingIndegreeByNodeId = new Map(
      nodeIds.map(nodeId => [nodeId, (incomingByNodeId.get(nodeId) || []).length])
    );
    const layerQueue = nodeIds.filter(nodeId => remainingIndegreeByNodeId.get(nodeId) === 0);

    let queueIndex = 0;
    while (queueIndex < layerQueue.length) {
      const nodeId = layerQueue[queueIndex];
      queueIndex += 1;

      for (const targetNodeId of outgoingByNodeId.get(nodeId) || []) {
        layerByNodeId.set(
          targetNodeId,
          Math.max(layerByNodeId.get(targetNodeId), layerByNodeId.get(nodeId) + 1)
        );

        const remainingIndegree = remainingIndegreeByNodeId.get(targetNodeId) - 1;
        remainingIndegreeByNodeId.set(targetNodeId, remainingIndegree);
        if (remainingIndegree === 0) layerQueue.push(targetNodeId);
      }
    }

    return layerByNodeId;
  }

  function orderWithinLayers(layers, incomingByNodeId, outgoingByNodeId) {
    const layerIndexByNodeId = new Map();
    const positionByNodeId = new Map();

    layers.forEach((layer, layerIndex) => {
      layer.forEach((nodeId, position) => {
        layerIndexByNodeId.set(nodeId, layerIndex);
        positionByNodeId.set(nodeId, position);
      });
    });

    const sweepCount = 4;

    for (let sweep = 0; sweep < sweepCount; sweep += 1) {
      const movingDown = sweep % 2 === 0;
      const firstLayerIndex = movingDown ? 1 : layers.length - 2;
      const lastLayerIndex = movingDown ? layers.length : -1;
      const layerStep = movingDown ? 1 : -1;

      for (let layerIndex = firstLayerIndex; layerIndex !== lastLayerIndex; layerIndex += layerStep) {
        const layer = layers[layerIndex];
        const referenceLayerIndex = movingDown ? layerIndex - 1 : layerIndex + 1;
        const neighborsByNodeId = movingDown ? incomingByNodeId : outgoingByNodeId;
        const previousPositionByNodeId = new Map(layer.map((nodeId, position) => [nodeId, position]));
        const barycenterByNodeId = new Map();

        for (const nodeId of layer) {
          const referencePositions = [];

          for (const neighborId of neighborsByNodeId.get(nodeId) || []) {
            if (layerIndexByNodeId.get(neighborId) !== referenceLayerIndex) continue;
            referencePositions.push(positionByNodeId.get(neighborId));
          }

          const barycenter = referencePositions.length === 0
            ? previousPositionByNodeId.get(nodeId)
            : referencePositions.reduce((sum, position) => sum + position, 0) / referencePositions.length;
          barycenterByNodeId.set(nodeId, barycenter);
        }

        layer.sort((firstId, secondId) => {
          const difference = barycenterByNodeId.get(firstId) - barycenterByNodeId.get(secondId);
          if (difference !== 0) return difference;
          return previousPositionByNodeId.get(firstId) - previousPositionByNodeId.get(secondId);
        });

        layer.forEach((nodeId, position) => positionByNodeId.set(nodeId, position));
      }
    }
  }

  function buildPositions(layers, { nodeWidth, nodeHeight, gridSize, horizontalGap, verticalGap }) {
    const layerHeights = layers.map(layer => (
      layer.length === 0 ? 0 : layer.length * nodeHeight + (layer.length - 1) * verticalGap
    ));
    const totalHeight = layerHeights.reduce((maximum, height) => Math.max(maximum, height), 0);
    const positions = new Map();

    layers.forEach((layer, layerIndex) => {
      const layerHeight = layerHeights[layerIndex];
      const centeredTop = (totalHeight - layerHeight) / 2;
      const topOffset = Math.round(centeredTop / gridSize) * gridSize;
      const leftOffset = layerIndex * (nodeWidth + horizontalGap);

      layer.forEach((nodeId, positionInLayer) => {
        positions.set(nodeId, {
          x: leftOffset,
          y: topOffset + positionInLayer * (nodeHeight + verticalGap)
        });
      });
    });

    return { positions, height: totalHeight };
  }

  return Object.freeze({ computeLayeredLayout });
});
