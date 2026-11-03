// Dijkstra algorithm on an adjacency list graph

export function dijkstra(graph, startNodeId, endNodeId) {
  if (startNodeId === endNodeId) {
    return { distance: 0, path: [startNodeId] };
  }

  const distances = new Map();
  const previous = new Map();
  const visited = new Set();

  distances.set(startNodeId, 0);

  // Priority queue using simple min search (efficient enough for city graphs) or binary heap
  // We maintain a set of unvisited nodes that have a finite distance
  const pq = new Map();
  pq.set(startNodeId, 0);

  while (pq.size > 0) {
    // Find node with minimum distance in pq
    let minNode = null;
    let minDist = Infinity;
    for (const [node, dist] of pq.entries()) {
      if (dist < minDist) {
        minDist = dist;
        minNode = node;
      }
    }

    if (minNode === null || minDist === Infinity) break;
    pq.delete(minNode);
    visited.add(minNode);

    if (minNode === endNodeId) {
      break;
    }

    const neighbors = graph.get(minNode) || [];
    for (const edge of neighbors) {
      if (visited.has(edge.node)) continue;

      const alt = minDist + edge.weight;
      const currentDist = distances.has(edge.node) ? distances.get(edge.node) : Infinity;

      if (alt < currentDist) {
        distances.set(edge.node, alt);
        previous.set(edge.node, minNode);
        pq.set(edge.node, alt);
      }
    }
  }

  if (!distances.has(endNodeId)) {
    return { distance: Infinity, path: [] };
  }

  // Reconstruct path
  const path = [];
  let curr = endNodeId;
  while (curr !== undefined) {
    path.unshift(curr);
    curr = previous.get(curr);
  }

  return {
    distance: distances.get(endNodeId),
    path: path
  };
}
