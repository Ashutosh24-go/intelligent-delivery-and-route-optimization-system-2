import axios from 'axios';
import { dijkstra } from './dijkstra.js';

// Cache for city graphs: cityName -> { nodes, adjacency, city }
const cityGraphs = new Map();

// Calculate Haversine distance in kilometers between two points
export function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Download and parse OpenStreetMap road network via Overpass API for a city or coordinates
export async function ensureGraphForCity(cityName = 'Delhi', sampleLat = 28.6139, sampleLng = 77.2090) {
  const cityKey = cityName.trim().toLowerCase();

  if (cityGraphs.has(cityKey)) {
    return cityGraphs.get(cityKey);
  }

  console.log(`[OSM Graph] Initializing road graph for city: "${cityName}" at (${sampleLat}, ${sampleLng})...`);

  // Compact bounding box (~8km box around coordinates) to ensure fast Overpass response
  const delta = 0.04;
  const minLat = (sampleLat - delta).toFixed(4);
  const minLng = (sampleLng - delta).toFixed(4);
  const maxLat = (sampleLat + delta).toFixed(4);
  const maxLng = (sampleLng + delta).toFixed(4);

  const overpassQuery = `[out:json][timeout:15];
(
  way["highway"~"primary|secondary|tertiary|trunk|residential|unclassified"](${minLat},${minLng},${maxLat},${maxLng});
);
out body geom;`;

  const overpassMirrors = [
    'https://overpass-api.de/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter'
  ];

  for (const url of overpassMirrors) {
    try {
      const response = await axios.post(url, overpassQuery, {
        headers: { 'Content-Type': 'text/plain' },
        timeout: 6000
      });

      if (response.data && response.data.elements && response.data.elements.length > 0) {
        const elements = response.data.elements;
        const nodes = new Map();
        const adjacency = new Map();

        // Extract nodes and way segments with road geometry
        for (const el of elements) {
          if (el.type === 'way' && el.geometry && el.geometry.length > 1) {
            for (let i = 0; i < el.geometry.length - 1; i++) {
              const u = el.geometry[i];
              const v = el.geometry[i + 1];

              const uId = `${u.lat.toFixed(5)},${u.lon.toFixed(5)}`;
              const vId = `${v.lat.toFixed(5)},${v.lon.toFixed(5)}`;

              if (!nodes.has(uId)) nodes.set(uId, { id: uId, lat: u.lat, lon: u.lon });
              if (!nodes.has(vId)) nodes.set(vId, { id: vId, lat: v.lat, lon: v.lon });

              if (!adjacency.has(uId)) adjacency.set(uId, []);
              if (!adjacency.has(vId)) adjacency.set(vId, []);

              const dist = haversineDistance(u.lat, u.lon, v.lat, v.lon);
              adjacency.get(uId).push({ node: vId, weight: dist });
              adjacency.get(vId).push({ node: uId, weight: dist });
            }
          }
        }

        console.log(`[OSM Graph] Successfully loaded real OSM road network for ${cityName}: ${nodes.size} road nodes.`);
        const graphData = { nodes, adjacency, city: cityName, isSynthetic: false };
        cityGraphs.set(cityKey, graphData);
        return graphData;
      }
    } catch (err) {
      // Try next mirror
    }
  }

  console.warn(`[OSM Graph] Overpass mirrors busy or offline for ${cityName}. OSM routing will use OSRM router.`);
  const placeholderGraph = { nodes: new Map(), adjacency: new Map(), city: cityName, isSynthetic: true };
  cityGraphs.set(cityKey, placeholderGraph);
  return placeholderGraph;
}

// Cache for calculated point-to-point road routes
const routeCache = new Map();

// Compute shortest road path and distance between two coordinates along real OpenStreetMap roads
export async function getRouteBetweenPoints(cityName, startLat, startLng, endLat, endLng) {
  const cacheKey = `${startLat.toFixed(5)},${startLng.toFixed(5)}->${endLat.toFixed(5)},${endLng.toFixed(5)}`;
  if (routeCache.has(cacheKey)) {
    return routeCache.get(cacheKey);
  }

  // 1. Primary method: Query Open Source Routing Machine (OSRM) on OpenStreetMap roads
  // OSRM snaps to actual OSM streets and returns exact road-following coordinates
  const osrmEndpoints = [
    `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson&continue_straight=false`,
    `https://routing.openstreetmap.de/routed-car/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson&continue_straight=false`
  ];

  for (const url of osrmEndpoints) {
    try {
      const res = await axios.get(url, { timeout: 4000 });
      if (res.data && res.data.routes && res.data.routes.length > 0) {
        const route = res.data.routes[0];
        // Convert [lon, lat] from GeoJSON to Leaflet [lat, lon]
        const roadCoords = route.geometry.coordinates.map(([lon, lat]) => [lat, lon]);
        const distKm = route.distance / 1000;

        const result = {
          distance: distKm,
          path: roadCoords
        };
        routeCache.set(cacheKey, result);
        return result;
      }
    } catch (err) {
      // Try next mirror
    }
  }

  // 2. Secondary method: Use downloaded Overpass OSM graph with Dijkstra
  const graph = await ensureGraphForCity(cityName, startLat, startLng);
  if (graph.nodes.size > 0) {
    let nearestStart = null;
    let nearestEnd = null;
    let minStartDist = Infinity;
    let minEndDist = Infinity;

    for (const [id, node] of graph.nodes.entries()) {
      const dS = haversineDistance(startLat, startLng, node.lat, node.lon);
      if (dS < minStartDist) {
        minStartDist = dS;
        nearestStart = node;
      }
      const dE = haversineDistance(endLat, endLng, node.lat, node.lon);
      if (dE < minEndDist) {
        minEndDist = dE;
        nearestEnd = node;
      }
    }

    if (nearestStart && nearestEnd) {
      const res = dijkstra(graph.adjacency, nearestStart.id, nearestEnd.id);
      if (res && res.path && res.path.length > 0) {
        const detailedCoords = [[startLat, startLng]];
        for (const nId of res.path) {
          const n = graph.nodes.get(nId);
          if (n) detailedCoords.push([n.lat, n.lon]);
        }
        detailedCoords.push([endLat, endLng]);

        const totalDist = res.distance + minStartDist + minEndDist;
        const result = { distance: totalDist, path: detailedCoords };
        routeCache.set(cacheKey, result);
        return result;
      }
    }
  }

  // 3. Fallback: Direct road connection
  const directDist = haversineDistance(startLat, startLng, endLat, endLng);
  const fallbackResult = {
    distance: directDist * 1.3, // Approximate road factor
    path: [
      [startLat, startLng],
      [endLat, endLng]
    ]
  };
  routeCache.set(cacheKey, fallbackResult);
  return fallbackResult;
}
