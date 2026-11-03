// 2-Opt route optimisation based on the custom profit formula

/**
 * Calculates profit for a given tour sequence of orders starting and ending at warehouse
 * @param {Array} tour - Array of orders in sequence to visit
 * @param {Object} warehouse - Warehouse object
 * @param {Function} getDistance - Function (fromObj, toObj) => distanceInKm
 * @param {number} currentTime - Timestamp (ms)
 */
export function calculateProfit(tour, warehouse, getDistance, currentTime) {
  if (!tour || tour.length === 0) {
    return { profit: 0, totalDistance: 0, cumulativeDistances: [] };
  }

  let totalDist = 0;
  let cumDists = [];
  let profit = 0;

  // From warehouse to first order
  let prev = warehouse;
  for (let i = 0; i < tour.length; i++) {
    const curr = tour[i];
    const segDist = getDistance(prev, curr);
    totalDist += segDist;
    cumDists.push(totalDist);

    // Elapsed time in minutes
    const elapsedMinutes = Math.max(0, (currentTime - curr.timestamp) / 60000);
    const term = (curr.urgency + elapsedMinutes) / (1 + totalDist);
    profit += term;

    prev = curr;
  }

  // Return to warehouse
  const returnDist = getDistance(prev, warehouse);
  totalDist += returnDist;

  // Final comeback term: urgency = 1, timestamp = currentTime (elapsed = 0)
  const finalTerm = 1.0 / (1 + totalDist);
  profit += finalTerm;

  return {
    profit,
    totalDistance: totalDist,
    cumulativeDistances: cumDists
  };
}

/**
 * Run 2-Opt optimization to maximize profit
 */
export function runTwoOpt(orders, warehouse, getDistance, currentTime) {
  if (!orders || orders.length === 0) {
    return { tour: [], profit: 0, totalDistance: 0, cumulativeDistances: [] };
  }

  if (orders.length === 1) {
    const singleRes = calculateProfit(orders, warehouse, getDistance, currentTime);
    return {
      tour: [...orders],
      ...singleRes
    };
  }

  // Start with current order sequence
  let bestTour = [...orders];
  let bestResult = calculateProfit(bestTour, warehouse, getDistance, currentTime);

  let improved = true;
  let iterations = 0;
  const maxIterations = 500;

  while (improved && iterations < maxIterations) {
    improved = false;
    iterations++;

    for (let i = 0; i < bestTour.length - 1; i++) {
      for (let j = i + 1; j < bestTour.length; j++) {
        // Reverse subarray from i to j
        const newTour = [
          ...bestTour.slice(0, i),
          ...bestTour.slice(i, j + 1).reverse(),
          ...bestTour.slice(j + 1)
        ];

        const newResult = calculateProfit(newTour, warehouse, getDistance, currentTime);

        // 2-opt chooses a path ONLY if it improves this profit
        if (newResult.profit > bestResult.profit + 1e-6) {
          bestTour = newTour;
          bestResult = newResult;
          improved = true;
          break; // restart search from new base
        }
      }
      if (improved) break;
    }
  }

  return {
    tour: bestTour,
    profit: bestResult.profit,
    totalDistance: bestResult.totalDistance,
    cumulativeDistances: bestResult.cumulativeDistances
  };
}
