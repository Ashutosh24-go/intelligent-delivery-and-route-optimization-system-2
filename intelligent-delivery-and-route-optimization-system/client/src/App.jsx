import React, { useState, useEffect, useCallback } from 'react';
import LeftSidebar from './components/LeftSidebar.jsx';
import RightSidebar from './components/RightSidebar.jsx';
import MapView from './components/MapView.jsx';
import OrderHistory from './components/OrderHistory.jsx';
import * as api from './utils/api.js';

export default function App() {
  const [activeTab, setActiveTab] = useState('storehouses');
  const [warehouses, setWarehouses] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState(null);

  // Multi-batch state
  // Each batch: { id, orders:[], routeData:null, heldKarpResult:null, status:'editing'|'placed'|'delivered', serverBatchId:null, totalDistance:0 }
  const [batches, setBatches] = useState([]);
  const [activeBatchIndex, setActiveBatchIndex] = useState(-1); // Which batch is being edited
  const [expandedPlacedIndex, setExpandedPlacedIndex] = useState(-1); // Which placed batch is expanded
  const [selectedOrderDelivery, setSelectedOrderDelivery] = useState(null);
  const [isOptimizing, setIsOptimizing] = useState(false);

  // Order History from server
  const [allBatchHistory, setAllBatchHistory] = useState([]);

  // Load initial warehouses and restore batches from server
  useEffect(() => {
    const initApp = async () => {
      await loadWarehouses();
      await loadBatchHistoryAndRestore();
    };
    initApp();
  }, []);

  const loadWarehouses = async () => {
    try {
      const data = await api.getWarehouses();
      setWarehouses(data || []);
    } catch (err) {
      console.error('Failed to load warehouses:', err);
    }
  };

  const loadBatchHistory = async () => {
    try {
      const data = await api.getBatches();
      setAllBatchHistory(data || []);
    } catch (err) {
      console.error('Failed to load batch history:', err);
    }
  };

  const loadBatchHistoryAndRestore = async () => {
    try {
      const historyData = await api.getBatches();
      setAllBatchHistory(historyData || []);

      // Restore only active 'placed' batches (finished 'delivered' batches are kept in history only)
      const restoredBatches = (historyData || [])
        .filter(b => b.status === 'placed')
        .sort((a, b) => (parseInt(a.id, 10) || 0) - (parseInt(b.id, 10) || 0))
        .map(b => ({
          id: b.id,
          orders: b.orders || [],
          routeData: {
            assignedWarehouse: b.assignedWarehouse,
            tour: b.orders || [],
            profit: b.profit,
            totalDistance: b.totalDistance,
            calTime: b.calTime,
            algorithmNotes: b.algorithmNotes,
            routePolyline: b.routePolyline || [],
            orderDetails: b.orderDetails || {}
          },
          heldKarpResult: b.algorithmUsed?.toLowerCase().includes('exact')
            ? { improved: true, message: 'Delivery route optimised with Exact Search (branch and bound)' }
            : null,
          status: b.status,
          serverBatchId: b.id,
          totalDistance: b.totalDistance
        }));

      if (restoredBatches.length > 0) {
        setBatches(restoredBatches);
        setActiveBatchIndex(-1);
        setExpandedPlacedIndex(restoredBatches.length - 1);
        if (restoredBatches[restoredBatches.length - 1].routeData?.tour?.[0]) {
          const firstOrder = restoredBatches[restoredBatches.length - 1].routeData.tour[0];
          const details = restoredBatches[restoredBatches.length - 1].routeData.orderDetails?.[firstOrder.id];
          if (details) setSelectedOrderDelivery(details);
        }
      }
    } catch (err) {
      console.error('Failed to load batch history:', err);
    }
  };

  // Current editing batch helpers
  const currentBatch = activeBatchIndex >= 0 && activeBatchIndex < batches.length
    ? batches[activeBatchIndex]
    : null;
  const isEditingBatch = currentBatch && currentBatch.status === 'editing';

  // Expanded placed batch (for viewing details)
  const expandedBatch = expandedPlacedIndex >= 0 && expandedPlacedIndex < batches.length
    ? batches[expandedPlacedIndex]
    : null;

  // Determine which routeData & orders to show in active view on map
  const visibleRouteData = isEditingBatch
    ? null
    : (expandedBatch && expandedBatch.status === 'placed' ? expandedBatch.routeData : null);
  const visibleOrders = isEditingBatch
    ? (currentBatch ? currentBatch.orders : [])
    : (expandedBatch && expandedBatch.status === 'placed' ? expandedBatch.orders : []);

  // Background routes (Requirement 4 & 5: other batches' polylines shown in dark blue)
  const backgroundRoutes = batches
    .filter((b, idx) => {
      if (b.status !== 'placed') return false;
      if (isEditingBatch) return true; // all placed batches are background when editing
      if (expandedPlacedIndex >= 0) return idx !== expandedPlacedIndex;
      return true;
    })
    .map(b => b.routeData?.routePolyline)
    .filter(Boolean);

  // Update a batch in the array
  const updateBatchAt = (index, updates) => {
    setBatches(prev => {
      const copy = [...prev];
      if (index >= 0 && index < copy.length) {
        copy[index] = { ...copy[index], ...updates };
      }
      return copy;
    });
  };

  // Ensure an editing batch exists locally without creating empty drafts on the server
  const ensureBatch = () => {
    setBatches(prev => {
      if (prev.some(b => b.status === 'editing')) {
        const editingIdx = prev.findIndex(b => b.status === 'editing');
        setActiveBatchIndex(editingIdx);
        setExpandedPlacedIndex(-1);
        return prev;
      }
      // Compute next sequential ID from existing batches AND history
      const historyMax = (allBatchHistory || []).reduce((max, b) => Math.max(max, parseInt(b.id, 10) || 0), 0);
      const prevMax = prev.reduce((max, b) => Math.max(max, parseInt(b.id, 10) || 0), 0);
      const maxId = Math.max(historyMax, prevMax);
      const newId = maxId + 1;
      const newBatch = {
        id: newId,
        orders: [],
        routeData: null,
        heldKarpResult: null,
        status: 'editing',
        serverBatchId: null,
        totalDistance: 0
      };
      setActiveBatchIndex(prev.length);
      setExpandedPlacedIndex(-1);
      return [...prev, newBatch];
    });
  };

  // Map Click Handler
  const handleMapClick = useCallback(async ({ lat, lng }) => {
    if (activeTab === 'order_history') return;

    // Check if clicked near an existing warehouse
    const existing = (warehouses || []).find(
      w => Math.abs(w.lat - lat) < 0.0015 && Math.abs(w.lng - lng) < 0.0015
    );

    if (existing) {
      setSelectedLocation({
        lat: existing.lat,
        lng: existing.lng,
        address: existing.address,
        city: existing.city,
        existingWarehouseId: existing.id
      });
      return;
    }

    const geocoded = await api.reverseGeocode(lat, lng);
    setSelectedLocation({
      lat,
      lng,
      address: geocoded.address,
      city: geocoded.city,
      existingWarehouseId: null
    });
  }, [activeTab, warehouses]);

  const handleSelectWarehouse = useCallback((wh) => {
    setSelectedLocation({
      lat: wh.lat,
      lng: wh.lng,
      address: wh.address,
      city: wh.city,
      existingWarehouseId: wh.id
    });
  }, []);

  const handleAddWarehouse = async (loc) => {
    try {
      const newWh = await api.addWarehouse(loc);
      await loadWarehouses();
      setSelectedLocation(prev => ({
        ...prev,
        existingWarehouseId: newWh.id
      }));
    } catch (err) {
      console.error('Error adding warehouse:', err);
    }
  };

  const handleRemoveWarehouse = async (id) => {
    try {
      await api.removeWarehouse(id);
      await loadWarehouses();
      setSelectedLocation(null);
    } catch (err) {
      console.error('Error removing warehouse:', err);
    }
  };

  // Add Order to current editing batch
  const handleAddOrder = async (orderData) => {
    if (activeBatchIndex < 0 || activeBatchIndex >= batches.length) return;
    const batch = batches[activeBatchIndex];
    const newOrder = {
      ...orderData,
      id: batch.orders.length + 1,
      timestamp: Date.now(),
      timeString: new Date().toTimeString().split(' ')[0]
    };

    const updatedOrders = [...batch.orders, newOrder];

    // If server batch doesn't exist yet, create it now that we actually have orders!
    let serverId = batch.serverBatchId;
    if (!serverId) {
      try {
        const serverBatch = await api.createBatch({ orders: updatedOrders });
        serverId = serverBatch.id;
        updateBatchAt(activeBatchIndex, {
          id: serverBatch.id,
          orders: updatedOrders,
          serverBatchId: serverBatch.id
        });
        await loadBatchHistory();
      } catch (err) {
        console.error('Error creating server batch for order:', err);
        updateBatchAt(activeBatchIndex, { orders: updatedOrders });
      }
    } else {
      try {
        await api.updateBatch(serverId, { orders: updatedOrders });
        await loadBatchHistory();
        updateBatchAt(activeBatchIndex, { orders: updatedOrders, serverBatchId: serverId });
      } catch (err) {
        console.error('Error updating server batch orders:', err);
        updateBatchAt(activeBatchIndex, { orders: updatedOrders });
      }
    }
    setSelectedLocation(null);
  };

  // Discard current batch (Requirement 2: Discard Batch button)
  const handleDiscardBatch = async () => {
    if (activeBatchIndex < 0 || activeBatchIndex >= batches.length) return;
    const batch = batches[activeBatchIndex];
    if (batch.serverBatchId) {
      try {
        await api.discardBatch(batch.serverBatchId);
      } catch (err) {
        console.error('Error discarding batch from server:', err);
      }
    }

    const remaining = batches.filter((_, idx) => idx !== activeBatchIndex);
    setBatches(remaining);
    setActiveBatchIndex(-1);
    setSelectedLocation(null);
    setSelectedOrderDelivery(null);

    // Expand the latest placed batch if any exists
    const placedIndices = [];
    remaining.forEach((b, i) => {
      if (b.status === 'placed' || b.status === 'delivered') placedIndices.push(i);
    });
    if (placedIndices.length > 0) {
      const lastPlacedIdx = placedIndices[placedIndices.length - 1];
      setExpandedPlacedIndex(lastPlacedIdx);
      if (remaining[lastPlacedIdx].routeData?.tour?.[0]) {
        const firstOrder = remaining[lastPlacedIdx].routeData.tour[0];
        const details = remaining[lastPlacedIdx].routeData.orderDetails?.[firstOrder.id];
        if (details) setSelectedOrderDelivery(details);
      }
    } else {
      setExpandedPlacedIndex(-1);
    }

    await loadBatchHistory();
  };

  // Place current batch orders (runs 2-Opt)
  const handlePlaceAllOrders = async () => {
    if (activeBatchIndex < 0 || activeBatchIndex >= batches.length) return;
    const batch = batches[activeBatchIndex];
    if (batch.orders.length === 0 || warehouses.length === 0) return;

    setIsOptimizing(true);
    try {
      let serverId = batch.serverBatchId;
      if (!serverId) {
        const newServerBatch = await api.createBatch({ orders: batch.orders });
        serverId = newServerBatch.id;
      }

      const placedBatch = await api.placeBatchOrders(serverId, batch.orders);

      // Fetch road geometry for smooth continuous map path
      let routePolyline = placedBatch.routePolyline || [];
      if (placedBatch.assignedWarehouse && placedBatch.orders && placedBatch.orders.length > 0) {
        const stops = [placedBatch.assignedWarehouse, ...placedBatch.orders, placedBatch.assignedWarehouse];
        const roadPath = await api.fetchRoadGeometry(stops);
        if (roadPath && roadPath.length > 1) {
          routePolyline = roadPath;
        }
      }

      const routeData = {
        assignedWarehouse: placedBatch.assignedWarehouse,
        tour: placedBatch.orders || batch.orders,
        profit: placedBatch.profit,
        totalDistance: placedBatch.totalDistance,
        calTime: placedBatch.calTime,
        algorithmNotes: placedBatch.algorithmNotes,
        routePolyline,
        orderDetails: placedBatch.orderDetails
      };

      updateBatchAt(activeBatchIndex, {
        id: placedBatch.id || batch.id,
        status: 'placed',
        routeData,
        heldKarpResult: null,
        serverBatchId: serverId,
        totalDistance: placedBatch.totalDistance
      });

      setExpandedPlacedIndex(activeBatchIndex);
      setActiveBatchIndex(-1);
      setSelectedLocation(null);

      if (routeData.tour && routeData.tour.length > 0 && routeData.orderDetails) {
        setSelectedOrderDelivery(routeData.orderDetails[routeData.tour[0].id]);
      }

      await loadBatchHistory();
    } catch (err) {
      alert(`Error placing orders: ${err.message}`);
    } finally {
      setIsOptimizing(false);
    }
  };

  // Optimise route using Exact Search (branch and bound)
  const handleOptimiseHeldKarp = async () => {
    const idx = expandedPlacedIndex >= 0 ? expandedPlacedIndex : activeBatchIndex;
    if (idx < 0 || idx >= batches.length) return;
    const batch = batches[idx];
    if (!batch.serverBatchId) return;

    const orderCount = batch.orders?.length || 0;
    if (orderCount > 14) return;

    setIsOptimizing(true);
    try {
      const res = await api.optimiseBatchHeldKarp(batch.serverBatchId);

      const hkResult = {
        improved: res.improved,
        warehouseChanged: res.warehouseChanged,
        message: res.message
      };

      if (res.improved && res.batch) {
        let routePolyline = res.batch.routePolyline || [];
        if (res.batch.assignedWarehouse && res.batch.orders && res.batch.orders.length > 0) {
          const stops = [res.batch.assignedWarehouse, ...res.batch.orders, res.batch.assignedWarehouse];
          const roadPath = await api.fetchRoadGeometry(stops);
          if (roadPath && roadPath.length > 1) {
            routePolyline = roadPath;
          }
        }

        const routeData = {
          assignedWarehouse: res.batch.assignedWarehouse,
          tour: res.batch.orders || batch.orders,
          profit: res.batch.profit,
          totalDistance: res.batch.totalDistance,
          calTime: res.batch.calTime,
          algorithmNotes: res.batch.algorithmNotes,
          routePolyline,
          orderDetails: res.batch.orderDetails
        };

        updateBatchAt(idx, {
          routeData,
          heldKarpResult: hkResult,
          totalDistance: res.batch.totalDistance
        });

        if (selectedOrderDelivery && routeData.orderDetails) {
          setSelectedOrderDelivery(routeData.orderDetails[selectedOrderDelivery.orderId]);
        }
      } else {
        updateBatchAt(idx, { heldKarpResult: hkResult });
      }

      await loadBatchHistory();
    } catch (err) {
      alert(`Error during Exact Search optimisation: ${err.message}`);
    } finally {
      setIsOptimizing(false);
    }
  };

  // Finish batch delivery
  const handleFinishBatch = async () => {
    const idx = expandedPlacedIndex >= 0 ? expandedPlacedIndex : -1;
    if (idx < 0 || idx >= batches.length) return;
    const batch = batches[idx];
    if (!batch.serverBatchId) return;

    try {
      await api.finishBatchDelivery(batch.serverBatchId);
      await loadBatchHistory();

      // Remove the finished batch from active batches in Orders section so its route disappears from map
      // and its field disappears from the Delivery batches sidebar
      setBatches(prev => {
        const remaining = prev.filter((_, i) => i !== idx);

        // Find remaining placed batches
        const remainingPlaced = [];
        remaining.forEach((b, i) => {
          if (b.status === 'placed') remainingPlaced.push(i);
        });

        if (activeBatchIndex >= 0) {
          // If an editing batch was active, adjust its index
          const newEditingIdx = remaining.findIndex(b => b.status === 'editing');
          setActiveBatchIndex(newEditingIdx);
          setExpandedPlacedIndex(-1);
        } else if (remainingPlaced.length > 0) {
          // Expand the latest remaining placed batch
          const lastPlacedIdx = remainingPlaced[remainingPlaced.length - 1];
          setExpandedPlacedIndex(lastPlacedIdx);
          if (remaining[lastPlacedIdx].routeData?.tour?.[0]) {
            const firstOrder = remaining[lastPlacedIdx].routeData.tour[0];
            const details = remaining[lastPlacedIdx].routeData.orderDetails?.[firstOrder.id];
            setSelectedOrderDelivery(details || null);
          }
        } else {
          setExpandedPlacedIndex(-1);
          setSelectedOrderDelivery(null);
        }

        return remaining;
      });

      setSelectedOrderDelivery(null);
      setSelectedLocation(null);
    } catch (err) {
      console.error('Error finishing batch:', err);
    }
  };

  // Add more batches (Requirement 2 & 3: light green button below finish batch delivery)
  const handleAddMoreBatches = () => {
    setExpandedPlacedIndex(-1);
    setSelectedOrderDelivery(null);
    ensureBatch();
  };

  // Expand / collapse a placed batch (Requirement 4 & 5)
  const handleExpandBatch = (idx) => {
    if (isEditingBatch) return; // Requirement 4: cannot expand while filling details of a batch
    if (expandedPlacedIndex === idx) {
      setExpandedPlacedIndex(-1);
      setSelectedOrderDelivery(null);
    } else {
      setExpandedPlacedIndex(idx);
      const batch = batches[idx];
      if (batch.routeData?.tour?.[0] && batch.routeData.orderDetails) {
        setSelectedOrderDelivery(batch.routeData.orderDetails[batch.routeData.tour[0].id]);
      }
    }
  };

  // Order selection
  const handleSelectOrder = useCallback((order) => {
    const rd = isEditingBatch ? null : (expandedBatch ? expandedBatch.routeData : null);
    if (rd && rd.orderDetails) {
      setSelectedOrderDelivery(rd.orderDetails[order.id] || null);
    } else {
      setSelectedOrderDelivery({
        orderId: order.id,
        productName: order.productName,
        distanceKm: 'N/A',
        timeUntilDelivery: 'Pending batch placement'
      });
    }
  }, [expandedBatch, isEditingBatch]);

  // Reorder from history (Requirement 9 & 10)
  const handleReorderBatch = async (historyBatch) => {
    setActiveTab('orders');
    setExpandedPlacedIndex(-1);
    setSelectedOrderDelivery(null);

    const placedBatches = batches.filter(b => b.status !== 'editing');
    const historyMax = (allBatchHistory || []).reduce((max, b) => Math.max(max, parseInt(b.id, 10) || 0), 0);
    const currentMax = placedBatches.reduce((max, b) => Math.max(max, parseInt(b.id, 10) || 0), 0);
    const newId = Math.max(historyMax, currentMax) + 1;

    const reOrders = (historyBatch.orders || []).map((o, idx) => ({
      ...o,
      id: idx + 1,
      timestamp: Date.now(),
      timeString: new Date().toTimeString().split(' ')[0]
    }));

    try {
      const serverBatch = await api.createBatch({ orders: reOrders });
      const newBatch = {
        id: serverBatch.id || newId,
        orders: reOrders,
        routeData: null,
        heldKarpResult: null,
        status: 'editing',
        serverBatchId: serverBatch.id,
        totalDistance: 0
      };
      setBatches([...placedBatches, newBatch]);
      setActiveBatchIndex(placedBatches.length);
      await loadBatchHistory();
    } catch (err) {
      console.error('Error creating reorder draft batch:', err);
      const newBatch = {
        id: newId,
        orders: reOrders,
        routeData: null,
        heldKarpResult: null,
        status: 'editing',
        serverBatchId: null,
        totalDistance: 0
      };
      setBatches([...placedBatches, newBatch]);
      setActiveBatchIndex(placedBatches.length);
    }
  };

  // Tab change handler
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSelectedLocation(null);
    if (tab === 'orders') {
      if (!batches.some(b => b.status === 'editing') && batches.length === 0) {
        ensureBatch();
      }
    }
  };

  return (
    <div className="app-layout">
      <LeftSidebar
        activeTab={activeTab}
        onTabChange={handleTabChange}
      />

      {/* Main Content Area */}
      <div className="main-content-area" style={{ position: 'relative', flex: 1, height: '100%', display: 'flex', overflow: 'hidden' }}>
        {/* Requirement 7: On clicking Order History, map disappears and last added batch is displayed at top with white background */}
        {activeTab === 'order_history' && (
          <div className="history-full-view" style={{ flex: 1, width: '100%', height: '100%', overflowY: 'auto', backgroundColor: '#ffffff' }}>
            <OrderHistory
              batches={allBatchHistory}
              warehouses={warehouses}
              onReorderBatch={handleReorderBatch}
            />
          </div>
        )}

        {/* Map & RightSidebar stay mounted to ensure Leaflet instance and warehouse markers are preserved */}
        <div
          className="map-and-sidebar-container"
          style={{
            display: activeTab === 'order_history' ? 'none' : 'flex',
            flex: 1,
            height: '100%',
            width: '100%'
          }}
        >
          <MapView
            warehouses={warehouses}
            orders={visibleOrders}
            activeTab={activeTab}
            selectedLocation={selectedLocation}
            onMapClick={handleMapClick}
            onSelectWarehouse={handleSelectWarehouse}
            onSelectOrder={handleSelectOrder}
            routeData={visibleRouteData}
            selectedOrderDelivery={selectedOrderDelivery}
            backgroundRoutes={backgroundRoutes}
          />

          <RightSidebar
            activeTab={activeTab}
            warehouses={warehouses}
            batches={batches}
            activeBatchIndex={activeBatchIndex}
            expandedPlacedIndex={expandedPlacedIndex}
            selectedLocation={selectedLocation}
            onAddWarehouse={handleAddWarehouse}
            onRemoveWarehouse={handleRemoveWarehouse}
            onAddOrder={handleAddOrder}
            onDiscardBatch={handleDiscardBatch}
            onPlaceAllOrders={handlePlaceAllOrders}
            onOptimiseHeldKarp={handleOptimiseHeldKarp}
            onFinishBatch={handleFinishBatch}
            onAddMoreBatches={handleAddMoreBatches}
            onExpandBatch={handleExpandBatch}
            onEnsureBatch={ensureBatch}
            selectedOrderDelivery={selectedOrderDelivery}
            onSelectOrder={handleSelectOrder}
            isOptimizing={isOptimizing}
          />
        </div>
      </div>
    </div>
  );
}
