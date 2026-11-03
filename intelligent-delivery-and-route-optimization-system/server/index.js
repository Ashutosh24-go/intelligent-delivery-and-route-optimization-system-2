import express from 'express';
import cors from 'cors';
import axios from 'axios';
import { getWarehouses, addWarehouse, removeWarehouse } from './warehouseStore.js';
import { getOrders, addOrder, clearOrders, getOrderCount } from './orderStore.js';
import {
  getBatches,
  getAllRawBatches,
  createDraftBatch,
  updateBatch,
  deleteBatch,
  getNextBatchId,
  saveBatches,
  saveIndividualBatch
} from './batchStore.js';
import { optimizeRoute } from './optimiser.js';
import { ensureGraphForCity } from './graph.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// In-memory route state for batch delivery
let currentRouteState = null;

// Reverse geocode helper using Nominatim with fallback
app.get('/api/reverseGeocode', async (req, res) => {
  const { lat, lng } = req.query;
  if (!lat || !lng) {
    return res.status(400).json({ error: 'lat and lng parameters are required' });
  }

  const latNum = parseFloat(lat);
  const lngNum = parseFloat(lng);

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${latNum}&lon=${lngNum}&format=json&addressdetails=1`;
    const response = await axios.get(url, {
      headers: { 'User-Agent': 'leaflet-order-manager/1.0' },
      timeout: 3000
    });

    if (response.data) {
      const addr = response.data.address || {};
      const city = addr.city || addr.town || addr.municipality || addr.state_district || addr.state || 'Delhi';
      const addressLine = response.data.display_name
        ? response.data.display_name.split(',').slice(0, 3).join(', ')
        : `Location near ${city} (${latNum.toFixed(4)}, ${lngNum.toFixed(4)})`;

      return res.json({
        address: addressLine,
        city: city,
        lat: latNum,
        lng: lngNum
      });
    }
  } catch (err) {
    // Graceful fallback if external geocoding service is unavailable
  }

  res.json({
    address: `Point (${latNum.toFixed(4)}, ${lngNum.toFixed(4)})`,
    city: 'Delhi',
    lat: latNum,
    lng: lngNum
  });
});

// WAREHOUSE ENDPOINTS
app.get('/api/warehouses', (req, res) => {
  const list = getWarehouses();
  res.json(list);
});

app.post('/api/warehouses', (req, res) => {
  const { lat, lng, address, city } = req.body;
  if (lat === undefined || lng === undefined) {
    return res.status(400).json({ error: 'lat and lng are required' });
  }

  const warehouse = addWarehouse({ lat, lng, address, city });
  res.status(201).json(warehouse);
});

app.delete('/api/warehouses/:id', (req, res) => {
  const { id } = req.params;
  const removed = removeWarehouse(id);
  if (removed) {
    res.json({ success: true, message: `Warehouse ${id} removed` });
  } else {
    res.status(404).json({ error: 'Warehouse not found' });
  }
});

// ORDER ENDPOINTS
app.get('/api/orders', (req, res) => {
  res.json(getOrders());
});

app.post('/api/orders', async (req, res) => {
  const { productName, urgency, lat, lng, address, city } = req.body;
  if (lat === undefined || lng === undefined) {
    return res.status(400).json({ error: 'lat and lng are required' });
  }

  const order = addOrder({ productName, urgency, lat, lng, address, city });

  // When first order is placed in a city, trigger OSM road graph download/caching
  if (getOrderCount() === 1 || city) {
    ensureGraphForCity(order.city, order.lat, order.lng).catch(err => {
      console.warn('Background graph prefetch warning:', err.message);
    });
  }

  res.status(201).json(order);
});

// BATCH MANAGEMENT ENDPOINTS

// Get all batches
app.get('/api/batches', (req, res) => {
  res.json(getBatches());
});

// Create draft batch
app.post('/api/batches', (req, res) => {
  const { orders } = req.body;
  const batch = createDraftBatch(orders || []);
  res.status(201).json(batch);
});

// Update draft batch orders
app.put('/api/batches/:id', (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  const updated = updateBatch(id, updates);
  if (updated) {
    res.json(updated);
  } else {
    res.status(404).json({ error: 'Batch not found' });
  }
});

// Discard/delete batch
app.delete('/api/batches/:id', (req, res) => {
  const { id } = req.params;
  const deleted = deleteBatch(id);
  if (deleted) {
    res.json({ success: true, message: `Batch ${id} discarded` });
  } else {
    res.status(404).json({ error: 'Batch not found' });
  }
});

// Place orders for a batch (runs 2-Opt)
app.post('/api/batches/:id/place', async (req, res) => {
  const { id } = req.params;
  const batches = getAllRawBatches();
  const batch = batches.find(b => parseInt(b.id, 10) === parseInt(id, 10) || b.timestamp === parseInt(id, 10));
  const orders = (req.body.orders && req.body.orders.length > 0) ? req.body.orders : (batch ? batch.orders : []);
  const warehouses = getWarehouses();

  if (!orders || orders.length === 0) {
    return res.status(400).json({ error: 'No orders have been added in this batch yet.' });
  }
  if (!warehouses || warehouses.length === 0) {
    return res.status(400).json({ error: 'No storehouses available in the city.' });
  }

  try {
    const now = new Date();
    const placedTimestamp = now.getTime();
    const timeString = now.toTimeString().split(' ')[0];
    const routeResult = await optimizeRoute(orders, warehouses, '2opt', placedTimestamp);

    const targetId = batch ? (batch.id || batch.timestamp) : id;
    let updated = updateBatch(targetId, {
      status: 'placed',
      placedAt: timeString,
      placedTimestamp: placedTimestamp,
      orders: routeResult.tour || orders,
      assignedWarehouse: routeResult.assignedWarehouse,
      algorithmUsed: '2-Opt',
      profit: routeResult.profit,
      totalDistance: routeResult.totalDistance,
      calTime: routeResult.calTime,
      routePolyline: routeResult.routePolyline,
      orderDetails: routeResult.orderDetails,
      algorithmNotes: routeResult.algorithmNotes
    });

    if (!updated) {
      const all = getAllRawBatches();
      const newBatchId = parseInt(id, 10) || getNextBatchId();
      const newPlaced = {
        id: newBatchId,
        timestamp: placedTimestamp,
        status: 'placed',
        createdAt: timeString,
        placedAt: timeString,
        placedTimestamp: placedTimestamp,
        updatedAt: placedTimestamp,
        orders: routeResult.tour || orders,
        assignedWarehouse: routeResult.assignedWarehouse,
        algorithmUsed: '2-Opt',
        profit: routeResult.profit,
        totalDistance: routeResult.totalDistance,
        calTime: routeResult.calTime,
        routePolyline: routeResult.routePolyline,
        orderDetails: routeResult.orderDetails,
        algorithmNotes: routeResult.algorithmNotes,
        deliveredAt: null,
        deliveredTimestamp: null
      };
      all.unshift(newPlaced);
      saveBatches(all);
      saveIndividualBatch(newPlaced);
      updated = newPlaced;
    }

    res.json(updated);
  } catch (err) {
    console.error('Error placing batch:', err);
    res.status(500).json({ error: err.message });
  }
});

// Optimise batch with Exact Search (branch and bound)
app.post('/api/batches/:id/optimiseHeldKarp', async (req, res) => {
  const { id } = req.params;
  const batches = getAllRawBatches();
  const batch = batches.find(b => parseInt(b.id, 10) === parseInt(id, 10) || b.timestamp === parseInt(id, 10));
  if (!batch) {
    return res.status(404).json({ error: 'Batch not found' });
  }

  const orders = batch.orders || [];
  const warehouses = getWarehouses();

  if (orders.length > 14) {
    return res.status(400).json({ error: 'Exact Search (branch and bound) is restricted to 14 orders or fewer.' });
  }
  if (orders.length === 0 || warehouses.length === 0) {
    return res.status(400).json({ error: 'Orders and warehouses required.' });
  }

  try {
    // Reuse the batch's placedTimestamp, which is already saved, as current_time
    const currentTime = batch.placedTimestamp || batch.timestamp || Date.now();
    const hkResult = await optimizeRoute(orders, warehouses, 'heldKarp', currentTime);
    const previousProfit = batch.profit || 0;
    const isImproved = hkResult.profit > previousProfit + 1e-4;
    const isWarehouseChanged = batch.assignedWarehouse && batch.assignedWarehouse.id !== hkResult.assignedWarehouse.id;

    let updatedBatch = batch;
    if (isImproved) {
      updatedBatch = updateBatch(id, {
        orders: hkResult.tour || orders,
        assignedWarehouse: hkResult.assignedWarehouse,
        algorithmUsed: 'Exact Search (branch and bound)',
        profit: hkResult.profit,
        totalDistance: hkResult.totalDistance,
        calTime: hkResult.calTime,
        routePolyline: hkResult.routePolyline,
        orderDetails: hkResult.orderDetails,
        algorithmNotes: hkResult.algorithmNotes
      });
    }

    res.json({
      improved: isImproved,
      warehouseChanged: isWarehouseChanged,
      batch: updatedBatch,
      message: isImproved
        ? (isWarehouseChanged ? `Warehouse updated to Warehouse ${hkResult.assignedWarehouse.id}` : 'Delivery route optimised with Exact Search (branch and bound)')
        : 'No optimisation was possible'
    });
  } catch (err) {
    console.error('Error in Exact Search (branch and bound) optimization:', err);
    res.status(500).json({ error: err.message });
  }
});

// Finish batch delivery
app.post('/api/batches/:id/finish', (req, res) => {
  const { id } = req.params;
  const now = new Date();
  const timeString = now.toTimeString().split(' ')[0];

  const updated = updateBatch(id, {
    status: 'delivered',
    deliveredAt: timeString,
    deliveredTimestamp: now.getTime()
  });

  if (updated) {
    res.json({ success: true, message: `Batch ${id} delivery finished.`, batch: updated });
  } else {
    res.status(404).json({ error: 'Batch not found' });
  }
});

// ROUTE OPTIMISATION ENDPOINTS (Legacy compatibility)

// 1. Place all orders using 2-opt
app.post('/api/placeAllOrders', async (req, res) => {
  try {
    const orders = getOrders();
    const warehouses = getWarehouses();

    if (orders.length === 0) {
      return res.status(400).json({ error: 'No orders have been added yet.' });
    }
    if (warehouses.length === 0) {
      return res.status(400).json({ error: 'No storehouses available in the city.' });
    }

    const routeResult = await optimizeRoute(orders, warehouses, '2opt');
    currentRouteState = routeResult;
    res.json(routeResult);
  } catch (err) {
    console.error('Error placing orders:', err);
    res.status(500).json({ error: err.message });
  }
});

// 2. Optimise route using Held-Karp (max 14 orders)
app.post('/api/optimiseHeldKarp', async (req, res) => {
  try {
    const orders = getOrders();
    const warehouses = getWarehouses();

    if (orders.length > 14) {
      return res.status(400).json({ error: 'Exact Search (branch and bound) is restricted to 14 orders or fewer.' });
    }
    if (orders.length === 0 || warehouses.length === 0) {
      return res.status(400).json({ error: 'Orders and warehouses required.' });
    }

    const hkResult = await optimizeRoute(orders, warehouses, 'heldKarp');

    const previousProfit = currentRouteState ? currentRouteState.profit : 0;
    const isImproved = hkResult.profit > previousProfit + 1e-4;
    const isWarehouseChanged = currentRouteState && currentRouteState.assignedWarehouse.id !== hkResult.assignedWarehouse.id;

    if (isImproved) {
      currentRouteState = hkResult;
    }

    res.json({
      improved: isImproved,
      warehouseChanged: isWarehouseChanged,
      route: isImproved ? hkResult : currentRouteState,
      message: isImproved
        ? (isWarehouseChanged ? `Warehouse updated to Warehouse ${hkResult.assignedWarehouse.id}` : 'Delivery optimised')
        : 'No optimisation was possible'
    });
  } catch (err) {
    console.error('Error in Held-Karp optimization:', err);
    res.status(500).json({ error: err.message });
  }
});

// 3. Finish batch delivery
app.post('/api/finishBatch', (req, res) => {
  clearOrders();
  currentRouteState = null;
  res.json({ success: true, message: 'Batch delivery finished. Orders cleared.' });
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
