# Intelligent Delivery and Route Optimization System

A clean, professional delivery route optimizer built with **Leaflet** and **OpenStreetMap** (100% open-source, no Google Maps API key required).

---

## Features

1. **OpenStreetMap & Leaflet Integration**:
   - Interactive map centered on Delhi, India by default.
   - Zoom controls (+ / -) and drag-to-pan with left mouse button.
   - Dynamic city OSM road graph fetching on the first order placed in any city.

2. **Storehouses Management**:
   - Add warehouses by clicking anywhere on the map.
   - 3D dark-blue square markers with depth and drop shadow.
   - Reverse-geocoded addresses and auto-incrementing warehouse IDs.
   - Persistent storage in `data/warehouses.json`.
   - Toggle button with colour changes: Blue (`Add warehouse`) / Red (`Remove warehouse`).

3. **Orders & Batch Delivery**:
   - Add orders by clicking on the map (requires at least one warehouse in the city).
   - Multi-batch support: Add more batches with auto-incrementing batch IDs (`Batch #1`, `Batch #2`, etc.).
   - Collapsed past batches display batch number, order count, and round-trip distance.
   - Distinct map route rendering: Light blue for active/expanded batch, dark blue for all other batches.
   - Order fields: Auto-incrementing Order ID, Product Name, and Urgency slider (1–99).
   - "Discard Batch" button with bin icon above "Place all orders".
   - Light green "Add more batches" button below "Finish Batch Delivery".

4. **Algorithmic Routing & Profit Maximization**:
   - **Dijkstra's Algorithm**: Computes road network distances between warehouses and order stops.
   - **2-Opt Optimization**: Maximizes custom delivery profit:
     $$\text{profit} = \sum_{k=1}^{n} \frac{\text{urgency}[k] + (\text{current\_time} - \text{timestamp}[k])}{1 + \text{distance travelled to reach } [k]} + \frac{1}{1 + \text{distance travelled to reach } [n+1]}$$
     where $\text{current\_time}$ is the time when all orders were placed, and term $[n+1]$ represents comeback to the warehouse after serving the last order (urgency = 1, timestamp = $\text{current\_time}$).
   - **Optimal Warehouse Assignment**: The warehouse with the highest profit across the city is assigned and encircled on the map.
   - **Light Blue Highlighted Path**: Connects the complete delivery tour on the road network with directional heading arrows.
   - **Driver Statistics**: Average driver speed 50 km/h, total distance, and ETA range.

5. **Exact Search (branch and bound) Route Optimization**:
   - "Optimise route (no. of orders should be less than 15)" button (automatically disabled when orders exceed 14).
   - Evaluates all candidate warehouses using Exact Search (branch and bound), reusing the batch's saved `placedTimestamp` as `current_time`.
   - Reflects improved profit/warehouse updates on the map and sidebar.

6. **Orders History & Reordering**:
   - Left sidebar icon for "Order History".
   - Replaces map with full white background history view showing batches sequence (most recent on top).
   - Displays Batch #x, Orders count, Status (processing, placed at, delivered at), Algorithms used (including Custom Profit Formula for TSP), and Warehouse assigned.
   - Reorder action with small right-indicating dark blue arrow forwards batch orders directly into the Orders view for re-placement.
   - Automatic warehouse validation stops reordering if the warehouse is not found and displays an appropriate error banner.
   - Structured JSON storage in `data/batches.json` and `data/batches/batch_{timestamp}.json`.

---

## Running the Application

### 1. Install Dependencies
```bash
cd leaflet-order-manager
npm install
```

### 2. Run Development Server
```bash
npm run dev
```
- **Backend API**: Runs on [http://localhost:3001](http://localhost:3001)
- **Frontend App**: Runs on [http://localhost:3000](http://localhost:3000)

Open [http://localhost:3000](http://localhost:3000) in your browser.
