export interface InventoryItem {
  id: string;
  name: string;
  sku: string;
  category: string;
  quantity: number;
  reorderLevel: number;
  price: number;
  status: 'healthy' | 'medium' | 'low';
  lastUpdated: string;
}

export interface Order {
  id: string;
  customer: string;
  items: { name: string; qty: number; price: number }[];
  total: number;
  status: 'pending' | 'processing' | 'completed' | 'cancelled';
  date: string;
  progress: number;
}

export interface Notification {
  id: string;
  type: 'warning' | 'info' | 'success' | 'error';
  message: string;
  time: string;
}

export interface Activity {
  id: string;
  action: string;
  detail: string;
  time: string;
  icon: 'order' | 'stock' | 'alert' | 'user';
}

export const inventoryItems: InventoryItem[] = [
  { id: '1', name: 'Wireless Keyboard', sku: 'WK-001', category: 'Electronics', quantity: 245, reorderLevel: 50, price: 49.99, status: 'healthy', lastUpdated: '2 hours ago' },
  { id: '2', name: 'USB-C Hub', sku: 'UH-002', category: 'Electronics', quantity: 18, reorderLevel: 30, price: 34.99, status: 'low', lastUpdated: '1 hour ago' },
  { id: '3', name: 'Monitor Stand', sku: 'MS-003', category: 'Accessories', quantity: 87, reorderLevel: 25, price: 79.99, status: 'healthy', lastUpdated: '3 hours ago' },
  { id: '4', name: 'Desk Lamp', sku: 'DL-004', category: 'Furniture', quantity: 42, reorderLevel: 40, price: 29.99, status: 'medium', lastUpdated: '5 hours ago' },
  { id: '5', name: 'Webcam HD', sku: 'WC-005', category: 'Electronics', quantity: 156, reorderLevel: 30, price: 89.99, status: 'healthy', lastUpdated: '30 min ago' },
  { id: '6', name: 'Ergonomic Mouse', sku: 'EM-006', category: 'Electronics', quantity: 8, reorderLevel: 20, price: 59.99, status: 'low', lastUpdated: '15 min ago' },
  { id: '7', name: 'Cable Organizer', sku: 'CO-007', category: 'Accessories', quantity: 320, reorderLevel: 50, price: 12.99, status: 'healthy', lastUpdated: '1 day ago' },
  { id: '8', name: 'Standing Desk Mat', sku: 'SM-008', category: 'Furniture', quantity: 35, reorderLevel: 30, price: 44.99, status: 'medium', lastUpdated: '4 hours ago' },
  { id: '9', name: 'Bluetooth Speaker', sku: 'BS-009', category: 'Electronics', quantity: 5, reorderLevel: 15, price: 69.99, status: 'low', lastUpdated: '10 min ago' },
  { id: '10', name: 'Laptop Sleeve', sku: 'LS-010', category: 'Accessories', quantity: 198, reorderLevel: 40, price: 24.99, status: 'healthy', lastUpdated: '6 hours ago' },
];

export const orders: Order[] = [
  { id: 'ORD-2024-001', customer: 'Acme Corp', items: [{ name: 'Wireless Keyboard', qty: 50, price: 49.99 }, { name: 'USB-C Hub', qty: 25, price: 34.99 }], total: 3374.25, status: 'completed', date: '2024-03-15', progress: 100 },
  { id: 'ORD-2024-002', customer: 'TechStart Inc', items: [{ name: 'Webcam HD', qty: 30, price: 89.99 }], total: 2699.70, status: 'processing', date: '2024-03-16', progress: 65 },
  { id: 'ORD-2024-003', customer: 'Design Studio', items: [{ name: 'Monitor Stand', qty: 15, price: 79.99 }, { name: 'Desk Lamp', qty: 15, price: 29.99 }], total: 1649.70, status: 'pending', date: '2024-03-17', progress: 10 },
  { id: 'ORD-2024-004', customer: 'Remote Works LLC', items: [{ name: 'Ergonomic Mouse', qty: 100, price: 59.99 }], total: 5999.00, status: 'processing', date: '2024-03-17', progress: 40 },
  { id: 'ORD-2024-005', customer: 'CloudNine Ltd', items: [{ name: 'Cable Organizer', qty: 200, price: 12.99 }], total: 2598.00, status: 'completed', date: '2024-03-14', progress: 100 },
  { id: 'ORD-2024-006', customer: 'ByteForce', items: [{ name: 'Bluetooth Speaker', qty: 20, price: 69.99 }], total: 1399.80, status: 'cancelled', date: '2024-03-13', progress: 0 },
  { id: 'ORD-2024-007', customer: 'NexGen Solutions', items: [{ name: 'Laptop Sleeve', qty: 75, price: 24.99 }, { name: 'Standing Desk Mat', qty: 30, price: 44.99 }], total: 3224.55, status: 'pending', date: '2024-03-18', progress: 5 },
];

export const notifications: Notification[] = [
  { id: '1', type: 'warning', message: 'Bluetooth Speaker stock critically low (5 units)', time: '2 min ago' },
  { id: '2', type: 'success', message: 'Order ORD-2024-001 completed successfully', time: '15 min ago' },
  { id: '3', type: 'warning', message: 'Ergonomic Mouse stock below reorder level', time: '30 min ago' },
  { id: '4', type: 'info', message: 'New order received from NexGen Solutions', time: '1 hour ago' },
  { id: '5', type: 'error', message: 'Failed to sync inventory with warehouse B', time: '2 hours ago' },
  { id: '6', type: 'success', message: 'Inventory recount completed for Electronics', time: '3 hours ago' },
];

export const activities: Activity[] = [
  { id: '1', action: 'Order Placed', detail: 'NexGen Solutions placed order for 105 items', time: '5 min ago', icon: 'order' },
  { id: '2', action: 'Stock Updated', detail: 'Wireless Keyboard restocked +200 units', time: '1 hour ago', icon: 'stock' },
  { id: '3', action: 'Low Stock Alert', detail: 'Ergonomic Mouse dropped below reorder level', time: '2 hours ago', icon: 'alert' },
  { id: '4', action: 'Order Completed', detail: 'ORD-2024-001 delivered to Acme Corp', time: '3 hours ago', icon: 'order' },
  { id: '5', action: 'User Action', detail: 'Admin updated pricing for 3 products', time: '4 hours ago', icon: 'user' },
  { id: '6', action: 'Stock Updated', detail: 'Cable Organizer restocked +150 units', time: '5 hours ago', icon: 'stock' },
];

export const inventoryTrendData = [
  { month: 'Jan', electronics: 850, accessories: 620, furniture: 340 },
  { month: 'Feb', electronics: 920, accessories: 580, furniture: 380 },
  { month: 'Mar', electronics: 780, accessories: 710, furniture: 320 },
  { month: 'Apr', electronics: 1050, accessories: 680, furniture: 410 },
  { month: 'May', electronics: 960, accessories: 750, furniture: 390 },
  { month: 'Jun', electronics: 1120, accessories: 820, furniture: 450 },
];

export const orderVolumeData = [
  { month: 'Jan', orders: 45, revenue: 28500 },
  { month: 'Feb', orders: 52, revenue: 34200 },
  { month: 'Mar', orders: 61, revenue: 41800 },
  { month: 'Apr', orders: 48, revenue: 31500 },
  { month: 'May', orders: 73, revenue: 52100 },
  { month: 'Jun', orders: 67, revenue: 47300 },
];
