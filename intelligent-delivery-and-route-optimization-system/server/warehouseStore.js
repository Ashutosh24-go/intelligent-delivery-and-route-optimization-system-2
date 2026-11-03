import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_FILE = path.join(__dirname, '../data/warehouses.json');

// Ensure data directory exists
const dataDir = path.dirname(DATA_FILE);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, '[]', 'utf8');
}

export function getWarehouses() {
  try {
    const data = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(data || '[]');
  } catch (err) {
    console.error('Error reading warehouses:', err);
    return [];
  }
}

export function saveWarehouses(warehouses) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(warehouses, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Error saving warehouses:', err);
    return false;
  }
}

export function addWarehouse({ lat, lng, address, city }) {
  const warehouses = getWarehouses();
  // Auto-increment ID based on highest existing numerical ID
  let maxId = 0;
  for (const wh of warehouses) {
    const num = parseInt(wh.id, 10);
    if (!isNaN(num) && num > maxId) {
      maxId = num;
    }
  }
  const newId = maxId + 1;

  const newWarehouse = {
    id: newId,
    name: `Warehouse ${newId}`,
    lat: Number(lat),
    lng: Number(lng),
    address: address || `Lat: ${Number(lat).toFixed(4)}, Lng: ${Number(lng).toFixed(4)}`,
    city: city || 'Delhi',
    createdAt: new Date().toISOString()
  };

  warehouses.push(newWarehouse);
  saveWarehouses(warehouses);
  return newWarehouse;
}

export function removeWarehouse(id) {
  const warehouses = getWarehouses();
  const idNum = parseInt(id, 10);
  const filtered = warehouses.filter(w => parseInt(w.id, 10) !== idNum);
  if (filtered.length !== warehouses.length) {
    saveWarehouses(filtered);
    return true;
  }
  return false;
}
