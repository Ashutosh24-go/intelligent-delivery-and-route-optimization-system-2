import { calculateProfit } from './twoOpt.js';

/**
 * Held-Karp exact optimisation algorithm to maximize the custom profit function.
 * Handles up to 14 orders.
 */
export function runHeldKarp(orders, warehouse, getDistance, currentTime) {
  const n = orders.length;

  if (n === 0) {
    return { tour: [], profit: 0, totalDistance: 0, cumulativeDistances: [] };
  }

  if (n === 1) {
    const res = calculateProfit(orders, warehouse, getDistance, currentTime);
    return { tour: [...orders], ...res };
  }

  if (n > 14) {
    throw new Error('Held-Karp optimisation only supports up to 14 orders.');
  }

  let bestTour = [...orders];
  let bestResult = calculateProfit(bestTour, warehouse, getDistance, currentTime);

  // Exact search with branch and bound / memoization
  const visited = new Array(n).fill(false);
  const currentTour = new Array(n);

  function search(depth, currentLast, currentDist, currentProfit) {
    if (depth === n) {
      // Return to warehouse
      const returnDist = getDistance(currentLast, warehouse);
      const totalDist = currentDist + returnDist;
      const finalProfit = currentProfit + 1.0 / (1 + totalDist);

      if (finalProfit > bestResult.profit) {
        bestTour = [...currentTour];
        bestResult = {
          profit: finalProfit,
          totalDistance: totalDist,
          cumulativeDistances: [] // will be recomputed cleanly
        };
      }
      return;
    }

    // Branch and bound: calculate theoretical maximum upper bound remaining
    // Each unvisited order could at best contribute (urgency + elapsed) / (1 + currentDist)
    let maxRemaining = 0;
    for (let i = 0; i < n; i++) {
      if (!visited[i]) {
        const o = orders[i];
        const elapsed = Math.max(0, (currentTime - o.timestamp) / 60000);
        maxRemaining += (o.urgency + elapsed) / (1 + currentDist);
      }
    }
    maxRemaining += 1.0 / (1 + currentDist);

    if (currentProfit + maxRemaining <= bestResult.profit) {
      return; // Prune branch
    }

    // Try each unvisited node
    for (let i = 0; i < n; i++) {
      if (!visited[i]) {
        visited[i] = true;
        currentTour[depth] = orders[i];

        const segDist = getDistance(currentLast, orders[i]);
        const newDist = currentDist + segDist;
        const elapsed = Math.max(0, (currentTime - orders[i].timestamp) / 60000);
        const term = (orders[i].urgency + elapsed) / (1 + newDist);

        search(depth + 1, orders[i], newDist, currentProfit + term);

        visited[i] = false;
      }
    }
  }

  // Start search from warehouse
  search(0, warehouse, 0, 0);

  // Recompute full result details with cumulative distances
  const finalEval = calculateProfit(bestTour, warehouse, getDistance, currentTime);
  return {
    tour: bestTour,
    profit: finalEval.profit,
    totalDistance: finalEval.totalDistance,
    cumulativeDistances: finalEval.cumulativeDistances
  };
}
