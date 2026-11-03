let currentOrders = [];
let nextOrderId = 1;

export function getOrders() {
  return [...currentOrders];
}

export function addOrder({ productName, urgency, lat, lng, address, city }) {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const timeString = `${hours}:${minutes}:${seconds}`;

  const order = {
    id: nextOrderId++,
    productName: productName || `Product ${nextOrderId - 1}`,
    urgency: Number(urgency) || 1,
    lat: Number(lat),
    lng: Number(lng),
    address: address || `Lat: ${Number(lat).toFixed(4)}, Lng: ${Number(lng).toFixed(4)}`,
    city: city || 'Delhi',
    timestamp: now.getTime(),
    timeString: timeString
  };

  currentOrders.push(order);
  return order;
}

export function clearOrders() {
  currentOrders = [];
  nextOrderId = 1;
}

export function getOrderCount() {
  return currentOrders.length;
}
