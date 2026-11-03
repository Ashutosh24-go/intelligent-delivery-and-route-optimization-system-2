import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';

export default function MapView({
  warehouses,
  orders,
  activeTab,
  selectedLocation,
  onMapClick,
  onSelectWarehouse,
  onSelectOrder,
  routeData,
  selectedOrderDelivery,
  backgroundRoutes = []
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const [map, setMap] = useState(null);

  const warehouseMarkersRef = useRef(new Map());
  const orderMarkersRef = useRef(new Map());
  const routePolylineRef = useRef(null);
  const backgroundPolylinesRef = useRef([]);
  const selectedWarehouseCircleRef = useRef(null);
  const tempMarkerRef = useRef(null);
  const arrowMarkersRef = useRef([]);

  // Initialize Leaflet map once
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    // Default to zoomed Delhi, India
    const mapObj = L.map(mapContainerRef.current, {
      center: [28.6139, 77.2090],
      zoom: 12,
      zoomControl: true,
      dragging: true
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    }).addTo(mapObj);

    mapObj.on('click', (e) => {
      const { lat, lng } = e.latlng;
      if (onMapClick) onMapClick({ lat, lng });
    });

    mapInstanceRef.current = mapObj;
    setMap(mapObj);

    return () => {
      mapObj.remove();
      mapInstanceRef.current = null;
      setMap(null);
    };
  }, []);

  // Invalidate map size when returning from order_history to ensure perfect rendering
  useEffect(() => {
    if (map && activeTab !== 'order_history') {
      const timer = setTimeout(() => {
        map.invalidateSize();
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [map, activeTab]);

  // Update temporary click marker
  useEffect(() => {
    if (!map) return;

    if (tempMarkerRef.current) {
      tempMarkerRef.current.remove();
      tempMarkerRef.current = null;
    }

    if (selectedLocation && !selectedLocation.existingWarehouseId) {
      const tempIcon = L.divIcon({
        className: 'custom-temp-marker',
        html: `<div class="temp-pulse-dot"></div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10]
      });

      tempMarkerRef.current = L.marker([selectedLocation.lat, selectedLocation.lng], { icon: tempIcon }).addTo(map);
    }
  }, [map, selectedLocation]);

  // Update warehouse markers
  useEffect(() => {
    if (!map) return;

    // Clear removed warehouses
    const currentWhIds = new Set((warehouses || []).map(w => String(w.id)));
    for (const [id, marker] of warehouseMarkersRef.current.entries()) {
      if (!currentWhIds.has(id)) {
        marker.remove();
        warehouseMarkersRef.current.delete(id);
      }
    }

    // Add or update warehouses
    (warehouses || []).forEach(wh => {
      const idStr = String(wh.id);
      if (!warehouseMarkersRef.current.has(idStr)) {
        // Dark blue square with depth / 3D styling
        const warehouseIcon = L.divIcon({
          className: 'custom-warehouse-marker',
          html: `
            <div class="warehouse-box-3d" title="Warehouse ${wh.id}">
              <div class="warehouse-inner">
                <span class="wh-label">W${wh.id}</span>
              </div>
            </div>
          `,
          iconSize: [34, 34],
          iconAnchor: [17, 17]
        });

        const marker = L.marker([wh.lat, wh.lng], { icon: warehouseIcon }).addTo(map);
        marker.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          if (onSelectWarehouse) onSelectWarehouse(wh);
        });

        warehouseMarkersRef.current.set(idStr, marker);
      }
    });
  }, [map, warehouses, onSelectWarehouse]);

  // Helper to calculate pin color based on urgency (1 = green, 99 = red)
  function getUrgencyColor(urgency) {
    const ratio = Math.min(1, Math.max(0, (urgency - 1) / 98));
    const r = Math.round(16 + (239 - 16) * ratio);
    const g = Math.round(185 + (68 - 185) * ratio);
    const b = Math.round(129 + (68 - 129) * ratio);
    return `rgb(${r}, ${g}, ${b})`;
  }

  // Update order markers
  useEffect(() => {
    if (!map) return;

    // Clear removed orders
    const currentOrderIds = new Set((orders || []).map(o => String(o.id)));
    for (const [id, marker] of orderMarkersRef.current.entries()) {
      if (!currentOrderIds.has(id)) {
        marker.remove();
        orderMarkersRef.current.delete(id);
      }
    }

    // Add orders
    (orders || []).forEach(order => {
      const idStr = String(order.id);
      const isSelected = selectedOrderDelivery && selectedOrderDelivery.orderId === order.id;

      if (orderMarkersRef.current.has(idStr)) {
        orderMarkersRef.current.get(idStr).remove();
        orderMarkersRef.current.delete(idStr);
      }

      const color = getUrgencyColor(order.urgency);
      const orderIcon = L.divIcon({
        className: 'custom-order-pin',
        html: `
          <div class="order-pin-wrapper ${isSelected ? 'selected' : ''}">
            <svg width="28" height="36" viewBox="0 0 28 36" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M14 0C6.268 0 0 6.268 0 14C0 24.5 14 36 14 36C14 36 28 24.5 28 14C28 6.268 21.732 0 14 0Z" fill="${color}" filter="url(#drop-shadow)"/>
              <circle cx="14" cy="14" r="9" fill="white"/>
              <text x="14" y="18" font-size="11" font-weight="bold" fill="#1e293b" text-anchor="middle">${order.id}</text>
              <defs>
                <filter id="drop-shadow" x="-2" y="0" width="32" height="40" filterUnits="userSpaceOnUse">
                  <feDropShadow dx="0" dy="2" stdDeviation="2" flood-opacity="0.3"/>
                </filter>
              </defs>
            </svg>
          </div>
        `,
        iconSize: [28, 36],
        iconAnchor: [14, 36]
      });

      const marker = L.marker([order.lat, order.lng], { icon: orderIcon }).addTo(map);
      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        if (onSelectOrder) onSelectOrder(order);
      });

      orderMarkersRef.current.set(idStr, marker);
    });
  }, [map, orders, selectedOrderDelivery, onSelectOrder]);

  // Helper to calculate bearing between two coordinates
  function getBearing(lat1, lon1, lat2, lon2) {
    const y = Math.sin(((lon2 - lon1) * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180);
    const x =
      Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
      Math.sin((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.cos(((lon2 - lon1) * Math.PI) / 180);
    return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  }

  // Generate directional arrows along traced path
  function createHeadingArrows(mapInst, coords) {
    if (!coords || coords.length < 2) return [];

    const markers = [];
    let distSinceLastArrow = 0;
    const ARROW_INTERVAL_KM = 0.22;

    for (let i = 0; i < coords.length - 1; i++) {
      const [lat1, lng1] = coords[i];
      const [lat2, lng2] = coords[i + 1];

      const dLat = (lat2 - lat1) * 111.32;
      const dLng = (lng2 - lng1) * (111.32 * Math.cos((lat1 * Math.PI) / 180));
      const segDist = Math.sqrt(dLat * dLat + dLng * dLng);

      distSinceLastArrow += segDist;

      if (distSinceLastArrow >= ARROW_INTERVAL_KM) {
        distSinceLastArrow = 0;
        if (segDist < 0.001) continue;

        const bearing = getBearing(lat1, lng1, lat2, lng2);
        const midLat = (lat1 + lat2) / 2;
        const midLng = (lng1 + lng2) / 2;

        const arrowIcon = L.divIcon({
          className: 'route-heading-arrow',
          html: `
            <div style="transform: rotate(${bearing}deg); width: 14px; height: 14px; display: flex; align-items: center; justify-content: center; pointer-events: none;">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M7 11.5V3M3.5 6.5L7 3L10.5 6.5" stroke="#0284C7" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
          `,
          iconSize: [14, 14],
          iconAnchor: [7, 7]
        });

        const arrowMarker = L.marker([midLat, midLng], {
          icon: arrowIcon,
          interactive: false,
          zIndexOffset: 600
        }).addTo(mapInst);

        markers.push(arrowMarker);
      }
    }

    if (markers.length === 0 && coords.length >= 2) {
      const midIdx = Math.floor((coords.length - 1) / 2);
      const [lat1, lng1] = coords[midIdx];
      const [lat2, lng2] = coords[midIdx + 1];
      const bearing = getBearing(lat1, lng1, lat2, lng2);

      const arrowIcon = L.divIcon({
        className: 'route-heading-arrow',
        html: `
          <div style="transform: rotate(${bearing}deg); width: 14px; height: 14px; display: flex; align-items: center; justify-content: center; pointer-events: none;">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M7 11.5V3M3.5 6.5L7 3L10.5 6.5" stroke="#0284C7" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
        `,
        iconSize: [14, 14],
        iconAnchor: [7, 7]
      });

      const arrowMarker = L.marker([(lat1 + lat2) / 2, (lng1 + lng2) / 2], {
        icon: arrowIcon,
        interactive: false,
        zIndexOffset: 600
      }).addTo(mapInst);

      markers.push(arrowMarker);
    }

    return markers;
  }

  // Render background routes in dark blue (for other batches)
  useEffect(() => {
    if (!map) return;

    // Clear existing background polylines
    backgroundPolylinesRef.current.forEach((p) => p.remove());
    backgroundPolylinesRef.current = [];

    if (backgroundRoutes && backgroundRoutes.length > 0) {
      backgroundRoutes.forEach((polylineCoords) => {
        if (polylineCoords && polylineCoords.length > 1) {
          const polyline = L.polyline(polylineCoords, {
            color: '#1e3a8a', // Dark blue shade
            weight: 5,
            opacity: 0.85,
            lineCap: 'round',
            lineJoin: 'round'
          }).addTo(map);
          backgroundPolylinesRef.current.push(polyline);
        }
      });
    }
  }, [map, backgroundRoutes]);

  // Update Route Polyline & Encircled Warehouse
  useEffect(() => {
    if (!map) return;

    // Clear existing polyline
    if (routePolylineRef.current) {
      routePolylineRef.current.remove();
      routePolylineRef.current = null;
    }

    // Clear existing arrows
    if (arrowMarkersRef.current) {
      arrowMarkersRef.current.forEach((m) => m.remove());
      arrowMarkersRef.current = [];
    }

    // Clear existing warehouse circle
    if (selectedWarehouseCircleRef.current) {
      selectedWarehouseCircleRef.current.remove();
      selectedWarehouseCircleRef.current = null;
    }

    if (routeData && routeData.routePolyline && routeData.routePolyline.length > 0) {
      // Highlight path in light blue shade
      routePolylineRef.current = L.polyline(routeData.routePolyline, {
        color: '#38BDF8', // Light blue shade
        weight: 6,
        opacity: 0.9,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(map);

      // Add directional arrows along the path
      arrowMarkersRef.current = createHeadingArrows(map, routeData.routePolyline);

      // Fit map bounds to show full route
      try {
        const bounds = routePolylineRef.current.getBounds();
        map.fitBounds(bounds, { padding: [60, 60], maxZoom: 14 });
      } catch (err) {
        // Singular bounds
      }

      // Encircle selected warehouse
      if (routeData.assignedWarehouse) {
        const wh = routeData.assignedWarehouse;
        selectedWarehouseCircleRef.current = L.circle([wh.lat, wh.lng], {
          radius: 700,
          color: '#0284C7',
          weight: 3,
          dashArray: '6, 6',
          fillColor: '#38BDF8',
          fillOpacity: 0.18
        }).addTo(map);
      }
    }
  }, [map, routeData]);

  return (
    <div className="map-wrapper">
      <div id="map" ref={mapContainerRef} className="map-view" />

      {/* Lower middle note */}
      {(!routeData || activeTab === 'storehouses') && (
        <div className="map-bottom-note">
          <p>add storehouses to start placing orders. Storehouses and orders exist in the same city.</p>
        </div>
      )}
    </div>
  );
}
