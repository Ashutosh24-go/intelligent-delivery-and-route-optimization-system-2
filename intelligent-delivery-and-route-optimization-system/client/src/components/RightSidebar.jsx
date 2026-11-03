import React, { useState } from 'react';
import {
  FiTruck,
  FiMapPin,
  FiClock,
  FiCheckCircle,
  FiTrash2,
  FiPlus,
  FiAlertCircle,
  FiChevronDown,
  FiChevronUp,
  FiLayers
} from 'react-icons/fi';

export default function RightSidebar({
  activeTab,
  warehouses = [],
  batches = [],
  activeBatchIndex = -1,
  expandedPlacedIndex = -1,
  selectedLocation,
  onAddWarehouse,
  onRemoveWarehouse,
  onAddOrder,
  onDiscardBatch,
  onPlaceAllOrders,
  onOptimiseHeldKarp,
  onFinishBatch,
  onAddMoreBatches,
  onExpandBatch,
  onEnsureBatch,
  selectedOrderDelivery,
  onSelectOrder,
  isOptimizing
}) {
  // Order Form State
  const [productName, setProductName] = useState('');
  const [urgency, setUrgency] = useState(1);
  const [toastMessage, setToastMessage] = useState(null);

  // Trigger brief toast message
  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleWarehouseAdd = async () => {
    if (!selectedLocation) return;
    await onAddWarehouse(selectedLocation);
    showToast('Warehouse added');
  };

  const handleWarehouseRemove = async (id) => {
    await onRemoveWarehouse(id);
    showToast('Warehouse removed');
  };

  const handleOrderSubmit = (e) => {
    e.preventDefault();
    if (!productName.trim() || !selectedLocation) return;

    onAddOrder({
      productName: productName.trim(),
      urgency: Number(urgency),
      lat: selectedLocation.lat,
      lng: selectedLocation.lng,
      address: selectedLocation.address,
      city: selectedLocation.city
    });

    setProductName('');
    setUrgency(1);
  };

  // Check if current selected location matches an existing warehouse
  const matchedWarehouse = selectedLocation
    ? warehouses.find(
        w =>
          w.id === selectedLocation.existingWarehouseId ||
          (Math.abs(w.lat - selectedLocation.lat) < 0.0005 && Math.abs(w.lng - selectedLocation.lng) < 0.0005)
      )
    : null;

  // Active batch helpers
  const currentEditingBatch = activeBatchIndex >= 0 && activeBatchIndex < batches.length
    ? batches[activeBatchIndex]
    : null;
  const isEditingBatch = currentEditingBatch && currentEditingBatch.status === 'editing';

  const expandedBatch = expandedPlacedIndex >= 0 && expandedPlacedIndex < batches.length
    ? batches[expandedPlacedIndex]
    : null;

  // Render mathematical formula component
  const renderFormulaBox = () => (
    <div className="custom-formula-card">
      <div className="formula-card-title">Custom Profit Formula for TSP:</div>
      <div className="formula-equation-wrapper">
        <span className="var-profit">profit</span>
        <span className="sym-equals">=</span>
        <div className="math-sigma">
          <span className="sigma-symbol">∑</span>
          <span className="sigma-index">k=1..n</span>
        </div>
        <span className="bracket-large">[</span>
        <div className="math-frac">
          <div className="frac-top">urgency[k] + (batch_placement_time − timestamp[k])</div>
          <div className="frac-mid"></div>
          <div className="frac-bottom">1 + distance[k]</div>
        </div>
        <span className="bracket-large">]</span>
        <span className="sym-plus">+</span>
        <div className="math-frac">
          <div className="frac-top">1</div>
          <div className="frac-mid"></div>
          <div className="frac-bottom">1 + distance[n+1]</div>
        </div>
      </div>
      <div className="formula-notes-list">
        <div>• <strong>batch_placement_time</strong>: time when batch orders were placed</div>
        <div>• Extra comeback term [n+1] to warehouse: urgency = 1, timestamp = batch_placement_time</div>
        <div>• Profit is updated and maximized as algorithm traverses candidate stops (k = 1..n)</div>
      </div>
    </div>
  );

  return (
    <aside className="right-sidebar">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="toast-notification">
          <FiCheckCircle className="toast-icon" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* TAB 1: STOREHOUSES */}
      {activeTab === 'storehouses' && (
        <div className="sidebar-content">
          <div className="section-header">
            <h3>Storehouses</h3>
            <span className="badge">{warehouses.length} active</span>
          </div>

          {selectedLocation ? (
            <div className="selection-card">
              <div className="location-line">
                <FiMapPin className="card-icon" />
                <div>
                  <div className="location-label">Selected Spot</div>
                  <div className="location-address">{selectedLocation.address}</div>
                </div>
              </div>

              {matchedWarehouse ? (
                <div className="warehouse-action-box">
                  <div className="wh-info-tag">Warehouse #{matchedWarehouse.id}</div>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => handleWarehouseRemove(matchedWarehouse.id)}
                  >
                    <FiTrash2 /> Remove warehouse
                  </button>
                </div>
              ) : (
                <div className="warehouse-action-box">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleWarehouseAdd}
                  >
                    <FiPlus /> Add warehouse to this location
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="empty-prompt">
              <FiMapPin className="empty-icon" />
              <p>Click any spot on the map to add or manage a storehouse.</p>
            </div>
          )}

          {/* List of existing warehouses */}
          <div className="list-container">
            <h4 className="list-title">Existing Warehouses</h4>
            {warehouses.length === 0 ? (
              <p className="subtext">No warehouses added yet. Click on the map to add one.</p>
            ) : (
              <div className="scrolling-list">
                {warehouses.map(w => (
                  <div key={w.id} className="warehouse-item">
                    <div className="wh-dot" />
                    <div className="wh-details">
                      <strong>Warehouse #{w.id}</strong>
                      <span>{w.address}</span>
                    </div>
                    <button
                      type="button"
                      className="btn-icon-danger"
                      onClick={() => handleWarehouseRemove(w.id)}
                      title="Remove warehouse"
                    >
                      <FiTrash2 />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: ORDERS */}
      {activeTab === 'orders' && (
        <div className="sidebar-content">
          <div className="section-header">
            <h3>Delivery Batches</h3>
            <span className="badge">{batches.length} {batches.length === 1 ? 'batch' : 'batches'}</span>
          </div>

          {warehouses.length === 0 ? (
            <div className="empty-prompt warning">
              <FiAlertCircle className="empty-icon warning" />
              <p>Please add storehouses first before placing orders. Storehouses and orders exist in the same city.</p>
            </div>
          ) : (
            <div className="batches-workflow-container">
              {/* LIST ALL BATCHES */}
              {batches.map((batch, idx) => {
                const isThisEditing = isEditingBatch && idx === activeBatchIndex;
                const isThisExpanded = !isEditingBatch && idx === expandedPlacedIndex;
                const isThisPlaced = batch.status === 'placed';

                // If this batch is placed and NOT expanded, display collapsed single field
                if (isThisPlaced && !isThisExpanded) {
                  return (
                    <div
                      key={batch.id || idx}
                      className={`batch-collapsed-card ${isEditingBatch ? 'disabled-expansion' : 'clickable'}`}
                      onClick={() => {
                        if (!isEditingBatch) {
                          onExpandBatch(idx);
                        }
                      }}
                      title={
                        isEditingBatch
                          ? 'Cannot expand a previously ordered batch while filling order details'
                          : `Click to expand Batch #${batch.id} details`
                      }
                    >
                      <div className="batch-collapsed-header">
                        <span className="batch-number-badge">Batch #{batch.id}</span>
                        <span className="batch-orders-count">Orders: {batch.orders?.length || 0}</span>
                        <span className="batch-distance-tag">
                          Round-trip distance: {batch.routeData?.totalDistance ?? batch.totalDistance ?? '0'} km
                        </span>
                        {!isEditingBatch && <FiChevronDown className="expand-chevron" />}
                      </div>
                    </div>
                  );
                }

                // If this batch is placed and IS expanded, show full details
                if (isThisPlaced && isThisExpanded) {
                  const routeData = batch.routeData || {};
                  return (
                    <div key={batch.id || idx} className="batch-expanded-card">
                      <div
                        className="batch-expanded-header"
                        onClick={() => onExpandBatch(idx)}
                        title="Click to collapse batch details"
                      >
                        <div className="header-left">
                          <span className="batch-number-badge active">Batch #{batch.id}</span>
                          <span className="batch-status-tag">Placed</span>
                        </div>
                        <FiChevronUp className="expand-chevron" />
                      </div>

                      <div className="batch-expanded-body">
                        {/* Algorithm explanation box */}
                        <div className="algorithm-explanation-box">
                          <div className="algo-header">Routing Computation Applied</div>
                          <p className="algo-line">• Dijkstra's algorithm computed shortest path road distances between all city points.</p>
                          <p className="algo-line">• 2-Opt local search iteratively swapped edges to maximize priority-over-distance delivery profit.</p>
                          <p className="algo-line">• Exact Search (branch and bound) used for optimisation.</p>
                          {renderFormulaBox()}
                        </div>

                        {/* Status message for Exact Search */}
                        {batch.heldKarpResult && (
                          <div className={`status-banner ${batch.heldKarpResult.improved ? 'success' : 'info'}`}>
                            {batch.heldKarpResult.message}
                          </div>
                        )}

                        {/* Warehouse & Driver Stats */}
                        <div className="delivery-stats-card">
                          <div className="stat-row highlight">
                            <span className="stat-label">Warehouse Assigned:</span>
                            <span className="stat-value">Warehouse #{routeData.assignedWarehouse?.id}</span>
                          </div>

                          <div className="stat-row">
                            <span className="stat-icon-label">
                              <FiTruck className="truck-icon" /> average driver speed:
                            </span>
                            <span className="stat-value">50km/h</span>
                          </div>

                          <div className="stat-row">
                            <span className="stat-label">Total Distance:</span>
                            <span className="stat-value">{routeData.totalDistance} km</span>
                          </div>

                          <div className="stat-row">
                            <span className="stat-label">Total time until driver comes back to warehouse:</span>
                            <span className="stat-value">approximately {routeData.calTime}</span>
                          </div>
                        </div>

                        {/* Selected Order Detail Card */}
                        {selectedOrderDelivery && (
                          <div className="selected-order-card">
                            <div className="card-header">
                              <strong>Order #{selectedOrderDelivery.orderId}</strong>
                              <span>{selectedOrderDelivery.productName}</span>
                            </div>
                            <div className="detail-row">
                              <span>Distance from start:</span>
                              <strong>{selectedOrderDelivery.distanceKm} km</strong>
                            </div>
                            <div className="detail-row">
                              <span>Time until delivery:</span>
                              <strong>{selectedOrderDelivery.timeUntilDelivery}</strong>
                            </div>
                          </div>
                        )}

                        {/* Route Orders Sequence list */}
                        <div className="list-container">
                          <h4 className="list-title">Tour Delivery Sequence ({batch.orders?.length || 0})</h4>
                          <div className="scrolling-list">
                            {(routeData.tour || batch.orders || []).map((order, orderIdx) => {
                              const isSelected = selectedOrderDelivery && selectedOrderDelivery.orderId === order.id;
                              const orderDetail = routeData.orderDetails ? routeData.orderDetails[order.id] : null;
                              return (
                                <div
                                  key={order.id}
                                  className={`order-collapsed-line ${isSelected ? 'active' : ''}`}
                                  onClick={() => onSelectOrder(order)}
                                >
                                  <span className="sequence-number">{orderIdx + 1}.</span>
                                  <span className="order-badge">#{order.id}</span>
                                  <span className="order-name">{order.productName}</span>
                                  {orderDetail && (
                                    <span className="order-eta">{orderDetail.timeUntilDelivery}</span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Bottom Actions for Placed Batch */}
                        <div className="sidebar-bottom-actions">
                          {/* Exact Search button if orders <= 14 and not already run */}
                          {!batch.heldKarpResult && (
                            <button
                              type="button"
                              disabled={batch.orders?.length > 14 || isOptimizing}
                              className="btn btn-secondary btn-block"
                              onClick={onOptimiseHeldKarp}
                              title={
                                batch.orders?.length > 14
                                  ? 'Disabled: Orders exceed 14'
                                  : 'Run Exact Search (branch and bound) optimisation'
                              }
                            >
                              Optimise route (no. of orders should be less than 15)
                            </button>
                          )}

                          {/* Finish Batch delivery button */}
                          <button
                            type="button"
                            className="btn btn-primary btn-block btn-finish"
                            onClick={onFinishBatch}
                          >
                            <FiClock /> Finish Batch Delivery
                          </button>

                          {/* Light green button: Add more batches */}
                          <button
                            type="button"
                            className="btn btn-add-more-batches btn-block"
                            onClick={onAddMoreBatches}
                          >
                            <FiPlus /> Add more batches
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                }

                // If this batch is in editing mode
                if (isThisEditing) {
                  return (
                    <div key={batch.id || idx} className="batch-editor-container">
                      <div className="batch-editor-header">
                        <span className="batch-number-badge editing">Batch #{batch.id}</span>
                        <span className="batch-editing-label">Entering Order Details</span>
                      </div>

                      {/* Routing computation and Custom Profit Formula for TSP explanation */}
                      <div className="algorithm-explanation-box">
                        <div className="algo-header">Routing Computation Applied</div>
                        <p className="algo-line">• Dijkstra's algorithm computes shortest road network distances between warehouses and order stops.</p>
                        <p className="algo-line">• 2-Opt local search iteratively swaps edges to maximize priority-over-distance delivery profit.</p>
                        <p className="algo-line">• Exact Search (branch and bound) used for optimisation.</p>
                        {renderFormulaBox()}
                      </div>

                      {/* Order Entry Form */}
                      {selectedLocation ? (
                        <div className="order-form-container">
                          <form onSubmit={handleOrderSubmit} className="order-form">
                            <div className="location-line">
                              <FiMapPin className="card-icon" />
                              <div className="location-address">{selectedLocation.address}</div>
                            </div>

                            <div className="form-group">
                              <label>Order ID</label>
                              <input
                                type="text"
                                disabled
                                value={`#${batch.orders.length + 1} (Auto)`}
                                className="form-input disabled"
                              />
                            </div>

                            <div className="form-group">
                              <label>Product Name</label>
                              <input
                                type="text"
                                placeholder="e.g. Groceries Package"
                                value={productName}
                                onChange={(e) => setProductName(e.target.value)}
                                className="form-input"
                                autoFocus
                              />
                            </div>

                            <div className="form-group">
                              <div className="slider-header">
                                <label>Urgency Level: <strong>{urgency}</strong></label>
                              </div>
                              <input
                                type="range"
                                min="1"
                                max="99"
                                value={urgency}
                                onChange={(e) => setUrgency(Number(e.target.value))}
                                className="urgency-slider"
                              />
                              <div className="slider-labels">
                                <span className="tag-green">Not urgent</span>
                                <span className="tag-red">Very urgent</span>
                              </div>
                            </div>

                            <button
                              type="submit"
                              disabled={!productName.trim()}
                              className="btn btn-primary btn-block"
                            >
                              Add Order
                            </button>
                          </form>
                        </div>
                      ) : (
                        <div className="empty-prompt">
                          <FiMapPin className="empty-icon" />
                          <p>Click a spot on map to add an order. Orders are placed in batch.</p>
                        </div>
                      )}

                      {/* Scrollable list of added orders */}
                      <div className="list-container">
                        <h4 className="list-title">Batch Orders ({batch.orders.length})</h4>
                        {batch.orders.length === 0 ? (
                          <p className="subtext">No orders added in this batch yet.</p>
                        ) : (
                          <div className="scrolling-list">
                            {batch.orders.map(order => (
                              <div
                                key={order.id}
                                className={`order-collapsed-line ${selectedOrderDelivery && selectedOrderDelivery.orderId === order.id ? 'active' : ''}`}
                                onClick={() => onSelectOrder(order)}
                              >
                                <span className="order-badge">#{order.id}</span>
                                <span className="order-name" title={order.productName}>{order.productName}</span>
                                <span className="order-time">added: {order.timeString}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Bottom actions: Discard Batch (with bin icon) above Place All Orders */}
                      <div className="sidebar-bottom-actions">
                        <button
                          type="button"
                          className="btn btn-danger-outline btn-block btn-discard-batch"
                          onClick={onDiscardBatch}
                          title="Discard this batch and clear orders"
                        >
                          <FiTrash2 /> Discard Batch
                        </button>

                        <button
                          type="button"
                          disabled={batch.orders.length === 0 || isOptimizing}
                          className="btn btn-primary btn-block btn-lg"
                          onClick={onPlaceAllOrders}
                        >
                          {isOptimizing ? 'Computing Route...' : `Place all orders (${batch.orders.length})`}
                        </button>
                      </div>
                    </div>
                  );
                }

                return null;
              })}

              {/* If no batches exist, prompt to add more batches */}
              {batches.length === 0 && (
                <div className="empty-prompt">
                  <FiLayers className="empty-icon" />
                  <p>No active delivery batches. Click below to add a new batch.</p>
                  <button
                    type="button"
                    className="btn btn-add-more-batches btn-block btn-lg"
                    onClick={onEnsureBatch}
                    style={{ marginTop: 12 }}
                  >
                    <FiPlus /> Add more batches
                  </button>
                </div>
              )}

              {/* If all batches are placed and collapsed, show Add More Batches button */}
              {batches.length > 0 && !isEditingBatch && expandedPlacedIndex === -1 && (
                <div className="sidebar-bottom-actions" style={{ marginTop: 16 }}>
                  <button
                    type="button"
                    className="btn btn-add-more-batches btn-block btn-lg"
                    onClick={onAddMoreBatches}
                  >
                    <FiPlus /> Add more batches
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
