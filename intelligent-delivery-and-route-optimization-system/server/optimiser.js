import axios from 'axios';
import { getRouteBetweenPoints, ensureGraphForCity, haversineDistance } from './graph.js';
import { runTwoOpt } from './twoOpt.js';
import { runHeldKarp } from './heldKarp.js';

export function formatTimeRange(distanceKm) {
  if (distanceKm <= 0) return '0 mins';
  const baseMinutes = (distanceKm / 50) * 60; // 50 km/h average speed
  const variation = 2 * distanceKm; // (2 min) * distance(km)

  // Ensure realistic, strictly positive lower bound
  const minMins = Math.max(1, Math.round(Math.max(baseMinutes * 0.5, baseMinutes - variation * 0.25)));
  const maxMins = Math.round(baseMinutes + variation);

  function fmt(mins) {
    if (mins < 60) return `${mins} mins`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }

  return `${fmt(minMins)} - ${fmt(maxMins)}`;
}

export async function optimizeRoute(orders, warehouses, algorithm = '2opt', referenceTime = null) {
  if (!orders || orders.length === 0) {
    throw new Error('No orders provided for route optimization.');
  }
  if (!warehouses || warehouses.length === 0) {
    throw new Error('No storehouses available in the city.');
  }

  const cityName = orders[0].city || warehouses[0].city || 'Delhi';
  const currentTime = referenceTime || Date.now();

  // Ensure OSM graph is loaded for this city
  await ensureGraphForCity(cityName, orders[0].lat, orders[0].lng);

  // Cache distances between points: key = `${from.lat},${from.lng}->${to.lat},${to.lng}`
  const distanceCache = new Map();
  const pathCache = new Map();

  async function getPairRoute(from, to) {
    const key = `${from.lat.toFixed(5)},${from.lng.toFixed(5)}->${to.lat.toFixed(5)},${to.lng.toFixed(5)}`;
    if (distanceCache.has(key)) {
      return {
        distance: distanceCache.get(key),
        path: pathCache.get(key)
      };
    }

    const res = await getRouteBetweenPoints(cityName, from.lat, from.lng, to.lat, to.lng);
    distanceCache.set(key, res.distance);
    pathCache.set(key, res.path);
    return res;
  }

  // Pre-calculate distances between all pairs
  const allLocations = [...warehouses, ...orders];
  for (let i = 0; i < allLocations.length; i++) {
    for (let j = 0; j < allLocations.length; j++) {
      if (i !== j) {
        await getPairRoute(allLocations[i], allLocations[j]);
      }
    }
  }

  function getDistance(from, to) {
    const key = `${from.lat.toFixed(5)},${from.lng.toFixed(5)}->${to.lat.toFixed(5)},${to.lng.toFixed(5)}`;
    if (distanceCache.has(key)) {
      return distanceCache.get(key);
    }
    return haversineDistance(from.lat, from.lng, to.lat, to.lng);
  }

  let bestWarehouse = null;
  let bestResult = null;

  // Evaluate EACH warehouse in the city
  for (const warehouse of warehouses) {
    let result;
    if (algorithm === 'heldKarp') {
      result = runHeldKarp(orders, warehouse, getDistance, currentTime);
    } else {
      result = runTwoOpt(orders, warehouse, getDistance, currentTime);
    }

    if (!bestResult || result.profit > bestResult.profit) {
      bestResult = result;
      bestWarehouse = warehouse;
    }
  }

  // Build full connected path polyline for the winning warehouse and tour
  let fullPolyline = [];

  // Attempt to fetch full continuous tour geometry along real roads via OSRM (continue_straight=false allows U-turns at stops)
  try {
    const stops = [bestWarehouse, ...bestResult.tour, bestWarehouse];
    const coordStr = stops.map(s => `${s.lng},${s.lat}`).join(';');
    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson&continue_straight=false`;
    const res = await axios.get(osrmUrl, { timeout: 4000 });
    if (res.data && res.data.routes && res.data.routes.length > 0) {
      const fullCoords = res.data.routes[0].geometry.coordinates.map(([lon, lat]) => [lat, lon]);
      if (fullCoords.length > 1) {
        fullPolyline = fullCoords;
      }
    }
  } catch (err) {
    // Fall back to pairwise segment concatenation
  }

  if (fullPolyline.length === 0) {
    let prevLoc = bestWarehouse;
    for (let i = 0; i < bestResult.tour.length; i++) {
      const currOrder = bestResult.tour[i];
      const pairRoute = await getPairRoute(prevLoc, currOrder);
      if (pairRoute.path && pairRoute.path.length > 0) {
        fullPolyline.push(...pairRoute.path);
      } else {
        fullPolyline.push([prevLoc.lat, prevLoc.lng], [currOrder.lat, currOrder.lng]);
      }
      prevLoc = currOrder;
    }

    // Return to warehouse leg
    const returnRoute = await getPairRoute(prevLoc, bestWarehouse);
    if (returnRoute.path && returnRoute.path.length > 0) {
      fullPolyline.push(...returnRoute.path);
    } else {
      fullPolyline.push([prevLoc.lat, prevLoc.lng], [bestWarehouse.lat, bestWarehouse.lng]);
    }
  }

  // Build per-order delivery details
  const orderDetails = {};
  for (let i = 0; i < bestResult.tour.length; i++) {
    const order = bestResult.tour[i];
    const cumDist = bestResult.cumulativeDistances[i] || 0;
    orderDetails[order.id] = {
      orderId: order.id,
      productName: order.productName,
      urgency: order.urgency,
      distanceKm: Number(cumDist.toFixed(2)),
      timeUntilDelivery: formatTimeRange(cumDist)
    };
  }

  const algorithmNotes =
    algorithm === 'heldKarp'
      ? [
          'Dijkstra\'s algorithm computed shortest path road distances between all city points.',
          'Exact Search (branch and bound) evaluated all permutations to find the optimal order sequence maximizing delivery profit.',
          'Custom Profit Formula for TSP: profit = Σ [ (urgency[k] + (batch_placement_time - timestamp[k])) / (1 + distance[k]) ] for k=1..n + 1 / (1 + distance[n+1]) (comeback term urgency=1, timestamp=batch_placement_time).'
        ]
      : [
          'Dijkstra\'s algorithm computed road network shortest paths for all junctions.',
          '2-Opt local search iteratively swapped edges to maximize priority-over-distance profit.',
          'Custom Profit Formula for TSP: profit = Σ [ (urgency[k] + (batch_placement_time - timestamp[k])) / (1 + distance[k]) ] for k=1..n + 1 / (1 + distance[n+1]) (comeback term urgency=1, timestamp=batch_placement_time).'
        ];

  return {
    assignedWarehouse: bestWarehouse,
    tour: bestResult.tour,
    profit: Number(bestResult.profit.toFixed(4)),
    totalDistance: Number(bestResult.totalDistance.toFixed(2)),
    calTime: formatTimeRange(bestResult.totalDistance),
    algorithmNotes,
    routePolyline: fullPolyline,
    orderDetails
  };
}
