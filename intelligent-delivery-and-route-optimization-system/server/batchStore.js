import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BATCHES_FILE = path.join(__dirname, '../data/batches.json');
const dataDir = path.dirname(BATCHES_FILE);
const BATCHES_DIR = path.join(dataDir, 'batches');

// Ensure data directory and individual batches directory exist
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
if (!fs.existsSync(BATCHES_DIR)) {
  fs.mkdirSync(BATCHES_DIR, { recursive: true });
}

if (!fs.existsSync(BATCHES_FILE)) {
  fs.writeFileSync(BATCHES_FILE, '[]', 'utf8');
}

export function saveIndividualBatch(batch) {
  if (!batch || !batch.timestamp) return;
  try {
    const filePath = path.join(BATCHES_DIR, `batch_${batch.timestamp}.json`);
    fs.writeFileSync(filePath, JSON.stringify(batch, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing individual batch file:', err);
  }
}

export function deleteIndividualBatch(timestamp) {
  try {
    const filePath = path.join(BATCHES_DIR, `batch_${timestamp}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.error('Error deleting individual batch file:', err);
  }
}

export function getAllRawBatches() {
  try {
    const data = fs.readFileSync(BATCHES_FILE, 'utf8');
    return JSON.parse(data || '[]');
  } catch (err) {
    console.error('Error reading batches.json:', err);
    return [];
  }
}

export function getBatches() {
  try {
    const list = getAllRawBatches();
    // Filter out empty processing drafts (0 orders) so they never pollute order history
    const valid = list.filter(b => (b.orders && b.orders.length > 0) || b.status === 'placed' || b.status === 'delivered');
    // Keep sorted by updatedAt / timestamp descending so most recent is at the top
    return valid.sort((a, b) => (b.updatedAt || b.timestamp || 0) - (a.updatedAt || a.timestamp || 0));
  } catch (err) {
    console.error('Error in getBatches:', err);
    return [];
  }
}

export function saveBatches(batches) {
  try {
    fs.writeFileSync(BATCHES_FILE, JSON.stringify(batches, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Error writing batches.json:', err);
    return false;
  }
}

export function getNextBatchId() {
  const batches = getAllRawBatches();
  let maxId = 0;
  for (const b of batches) {
    const num = parseInt(b.id, 10);
    if (!isNaN(num) && num > maxId) {
      maxId = num;
    }
  }
  return maxId + 1;
}

export function createDraftBatch(orders = []) {
  const batches = getAllRawBatches();

  // If there is already an existing empty draft, reuse it rather than spawning new batch IDs
  const existingEmpty = batches.find(b => b.status === 'processing' && (!b.orders || b.orders.length === 0));
  if (existingEmpty && (!orders || orders.length === 0)) {
    return existingEmpty;
  }

  const id = getNextBatchId();
  const now = Date.now();
  const dateObj = new Date(now);
  const timeString = dateObj.toTimeString().split(' ')[0];

  const newBatch = {
    id,
    timestamp: now,
    status: 'processing',
    createdAt: timeString,
    updatedAt: now,
    orders: orders.map((o, idx) => ({
      ...o,
      id: o.id || idx + 1,
      timeString: o.timeString || timeString
    })),
    assignedWarehouse: null,
    algorithmUsed: null,
    profit: null,
    totalDistance: null,
    calTime: null,
    routePolyline: [],
    orderDetails: {},
    algorithmNotes: [],
    placedAt: null,
    placedTimestamp: null,
    deliveredAt: null,
    deliveredTimestamp: null
  };

  batches.unshift(newBatch);
  saveBatches(batches);
  saveIndividualBatch(newBatch);
  return newBatch;
}

export function updateBatch(idOrTimestamp, updates) {
  const batches = getAllRawBatches();
  const index = batches.findIndex(
    b => parseInt(b.id, 10) === parseInt(idOrTimestamp, 10) || b.timestamp === parseInt(idOrTimestamp, 10)
  );
  if (index === -1) {
    return null;
  }

  const updatedBatch = {
    ...batches[index],
    ...updates,
    updatedAt: Date.now()
  };

  // Move updated batch to the front of the list as requested:
  // "When a batch is added OR being added OR its delivery is finished, it comes to the top in this sequence of batches."
  batches.splice(index, 1);
  batches.unshift(updatedBatch);
  saveBatches(batches);
  saveIndividualBatch(updatedBatch);
  return updatedBatch;
}

export function deleteBatch(idOrTimestamp) {
  const batches = getAllRawBatches();
  const toDelete = batches.find(
    b => parseInt(b.id, 10) === parseInt(idOrTimestamp, 10) || b.timestamp === parseInt(idOrTimestamp, 10)
  );
  const filtered = batches.filter(
    b => parseInt(b.id, 10) !== parseInt(idOrTimestamp, 10) && b.timestamp !== parseInt(idOrTimestamp, 10)
  );
  if (filtered.length !== batches.length) {
    saveBatches(filtered);
    if (toDelete && toDelete.timestamp) {
      deleteIndividualBatch(toDelete.timestamp);
    }
    return true;
  }
  return false;
}
