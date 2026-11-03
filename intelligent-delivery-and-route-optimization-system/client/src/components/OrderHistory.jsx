import React, { useState } from 'react';
import { FiArrowRight, FiCheckCircle, FiClock, FiAlertTriangle, FiPackage, FiTruck, FiLayers } from 'react-icons/fi';

export default function OrderHistory({ batches = [], warehouses = [], onReorderBatch }) {
  const [errorMessage, setErrorMessage] = useState(null);

  const handleReorderClick = (batch) => {
    setErrorMessage(null);

    // If batch has no orders
    if (!batch.orders || batch.orders.length === 0) {
      setErrorMessage(`Cannot reorder Batch #${batch.id}: No orders found in this batch.`);
      return;
    }

    // Requirement 10: If the warehouse is not found, user is stopped from reaching the ORDERS window and appropriate error appears.
    if (batch.assignedWarehouse) {
      const exists = (warehouses || []).some(w => parseInt(w.id, 10) === parseInt(batch.assignedWarehouse.id, 10));
      if (!exists) {
        setErrorMessage(
          `Cannot reorder Batch #${batch.id}: Assigned warehouse (Warehouse #${batch.assignedWarehouse.id}) was not found in the existing storehouses. Please re-add this warehouse first.`
        );
        return;
      }
    } else {
      // If batch was in processing and had no assigned warehouse yet, check if there are storehouses in the city
      const city = batch.orders[0]?.city || 'Delhi';
      const cityWarehouses = (warehouses || []).filter(w => (w.city || 'Delhi').toLowerCase() === city.toLowerCase());
      if (cityWarehouses.length === 0 && (warehouses || []).length === 0) {
        setErrorMessage(`Cannot reorder Batch #${batch.id}: No storehouses found in storehouses. Please add a storehouse first.`);
        return;
      }
    }

    onReorderBatch(batch);
  };

  // Filter out any ghost/empty processing drafts so only actual batches appear
  const validBatches = (batches || []).filter(
    b => (b.orders && b.orders.length > 0) || b.status === 'placed' || b.status === 'delivered'
  );

  // Requirement 7: When a batch is added OR being added OR its delivery is finished, it comes to the top in this sequence of batches.
  const sortedBatches = [...validBatches].sort(
    (a, b) => (b.updatedAt || b.timestamp || 0) - (a.updatedAt || a.timestamp || 0)
  );

  return (
    <div className="order-history-container">
      <div className="order-history-header">
        <div className="header-left">
          <FiLayers className="header-icon" />
          <div>
            <h2>Orders History</h2>
            <p>Track all batches, algorithm execution, and reorder past delivery routes.</p>
          </div>
        </div>
        <span className="history-count-badge">
          {sortedBatches.length} {sortedBatches.length === 1 ? 'Batch' : 'Batches'}
        </span>
      </div>

      {errorMessage && (
        <div className="history-error-banner">
          <FiAlertTriangle className="error-icon" />
          <span className="error-text">{errorMessage}</span>
          <button type="button" className="close-btn" onClick={() => setErrorMessage(null)}>×</button>
        </div>
      )}

      {sortedBatches.length === 0 ? (
        <div className="history-empty">
          <FiClock className="empty-icon" />
          <h3>No Orders Placed Yet</h3>
          <p>Once you add or place batch orders in the Orders tab, their complete route and algorithmic computation history will appear here.</p>
        </div>
      ) : (
        <div className="history-list">
          {sortedBatches.map(batch => {
            const isDelivered = batch.status === 'delivered';
            const isPlaced = batch.status === 'placed';
            const isProcessing = batch.status === 'processing';

            // Requirement 4: replace "Dijkstra algorithm and 2-Opt algorithm and Custom Profit Formula for TSP"
            // with "Dijkstra and 2-Opt algorithms, Custom Profit formula for TSP"
            let algoName = '2-Opt';
            if (batch.algorithmUsed) {
              if (batch.algorithmUsed.toLowerCase().includes('held') || batch.algorithmUsed.toLowerCase().includes('exact')) {
                algoName = 'Exact Search (branch and bound)';
              } else {
                algoName = '2-Opt';
              }
            }

            const algoLabel = `Dijkstra and ${algoName} algorithms, Custom Profit formula for TSP`;

            // Determine warehouse assigned label
            let whLabel = 'Pending assignment';
            if (batch.assignedWarehouse) {
              whLabel = `Warehouse #${batch.assignedWarehouse.id} (${batch.assignedWarehouse.address || batch.assignedWarehouse.city || 'Storehouse'})`;
            }

            return (
              <div key={batch.id || batch.timestamp} className="history-batch-card">
                <div className="batch-card-header">
                  <div className="batch-title-row">
                    <span className="batch-number">Batch #{batch.id}</span>
                    <span className="orders-count-tag">Orders: {batch.orders?.length || 0}</span>
                  </div>

                  {/* Requirement 8.6: Reorder {a small right indicating dark blue arrow} */}
                  <button
                    type="button"
                    className="btn-reorder"
                    onClick={() => handleReorderClick(batch)}
                    title="Reorder this batch in the Orders view"
                  >
                    <span>Reorder</span>
                    <FiArrowRight className="reorder-arrow" />
                  </button>
                </div>

                <div className="batch-card-body">
                  {/* Requirement 8.3: Status */}
                  <div className="card-field">
                    <span className="field-label">Status:</span>
                    <div className="status-values">
                      {isProcessing && <span className="status-pill processing">processing…</span>}
                      {isPlaced && !isDelivered && (
                        <span className="status-pill placed">Placed at: {batch.placedAt || batch.createdAt || 'N/A'}</span>
                      )}
                      {isDelivered && (
                        <div className="status-delivered-group">
                          <span className="status-pill placed">Placed at: {batch.placedAt || 'N/A'}</span>
                          <span className="status-divider">•</span>
                          <span className="status-pill delivered">Delivered at: {batch.deliveredAt || 'N/A'}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Requirement 4: Algorithms used */}
                  <div className="card-field">
                    <span className="field-label">Algorithms used:</span>
                    <span className="field-value highlight">{algoLabel}</span>
                  </div>

                  {/* Requirement 3: Custom Profit Formula for TSP with (batch_placement_time) and nice math layout */}
                  <div className="card-formula-box">
                    <div className="formula-label">Custom Profit Formula for TSP:</div>
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
                    <div className="formula-explanation">
                      <div>• <strong>batch_placement_time</strong>: time when batch orders were placed.</div>
                      <div>• A last extra term [n+1] represents the comeback to the warehouse after serving the last order, with urgency=1 and timestamp=batch_placement_time.</div>
                      <div>• Profit is updated and maximized as the algorithm visits delivery stops (k varies over all orders from 1 to n).</div>
                    </div>
                  </div>

                  {/* Requirement 8.5: Warehouse assigned */}
                  <div className="card-field">
                    <span className="field-label">Warehouse assigned:</span>
                    <span className="field-value">{whLabel}</span>
                  </div>

                  {/* Distance and Round-trip details if calculated */}
                  {batch.totalDistance && (
                    <div className="card-meta-row">
                      <span className="meta-item">
                        <FiTruck className="meta-icon" /> Round-trip Distance: <strong>{batch.totalDistance} km</strong>
                      </span>
                      {batch.calTime && (
                        <span className="meta-item">
                          <FiClock className="meta-icon" /> Round-trip ETA: <strong>{batch.calTime}</strong>
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
