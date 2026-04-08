import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import User from '../models/User.js';
import InventoryItem from '../models/InventoryItem.js';
import Order from '../models/Order.js';
import Notification from '../models/Notification.js';
import Activity from '../models/Activity.js';

await connectDB();

console.log('Seeding database...');

// Clear existing data
await Promise.all([
  User.deleteMany(),
  InventoryItem.deleteMany(),
  Order.deleteMany(),
  Notification.deleteMany(),
  Activity.deleteMany(),
]);

// Users
await User.create([
  { email: 'admin@inventra.com', password: 'admin123', name: 'Admin User', role: 'admin' },
  { email: 'distributor@inventra.com', password: 'dist123', name: 'Metro Distributors', role: 'distributor' },
]);

// Inventory
const inventoryData = [
  { name: 'Wireless Keyboard', sku: 'WK-001', category: 'Electronics', quantity: 245, reorderLevel: 50, price: 49.99 },
  { name: 'USB-C Hub', sku: 'UH-002', category: 'Electronics', quantity: 18, reorderLevel: 30, price: 34.99 },
  { name: 'Monitor Stand', sku: 'MS-003', category: 'Accessories', quantity: 87, reorderLevel: 25, price: 79.99 },
  { name: 'Desk Lamp', sku: 'DL-004', category: 'Furniture', quantity: 42, reorderLevel: 40, price: 29.99 },
  { name: 'Webcam HD', sku: 'WC-005', category: 'Electronics', quantity: 156, reorderLevel: 30, price: 89.99 },
  { name: 'Ergonomic Mouse', sku: 'EM-006', category: 'Electronics', quantity: 8, reorderLevel: 20, price: 59.99 },
  { name: 'Cable Organizer', sku: 'CO-007', category: 'Accessories', quantity: 320, reorderLevel: 50, price: 12.99 },
  { name: 'Standing Desk Mat', sku: 'SM-008', category: 'Furniture', quantity: 35, reorderLevel: 30, price: 44.99 },
  { name: 'Bluetooth Speaker', sku: 'BS-009', category: 'Electronics', quantity: 5, reorderLevel: 15, price: 69.99 },
  { name: 'Laptop Sleeve', sku: 'LS-010', category: 'Accessories', quantity: 198, reorderLevel: 40, price: 24.99 },
];
await InventoryItem.insertMany(inventoryData);

// Orders
const ordersData = [
  { orderId: 'ORD-2024-001', customer: 'Acme Corp', items: [{ name: 'Wireless Keyboard', qty: 50, price: 49.99 }, { name: 'USB-C Hub', qty: 25, price: 34.99 }], total: 3374.25, status: 'completed', progress: 100, date: '2024-03-15' },
  { orderId: 'ORD-2024-002', customer: 'TechStart Inc', items: [{ name: 'Webcam HD', qty: 30, price: 89.99 }], total: 2699.70, status: 'processing', progress: 65, date: '2024-03-16' },
  { orderId: 'ORD-2024-003', customer: 'Design Studio', items: [{ name: 'Monitor Stand', qty: 15, price: 79.99 }, { name: 'Desk Lamp', qty: 15, price: 29.99 }], total: 1649.70, status: 'pending', progress: 10, date: '2024-03-17' },
  { orderId: 'ORD-2024-004', customer: 'Remote Works LLC', items: [{ name: 'Ergonomic Mouse', qty: 100, price: 59.99 }], total: 5999.00, status: 'processing', progress: 40, date: '2024-03-17' },
  { orderId: 'ORD-2024-005', customer: 'CloudNine Ltd', items: [{ name: 'Cable Organizer', qty: 200, price: 12.99 }], total: 2598.00, status: 'completed', progress: 100, date: '2024-03-14' },
  { orderId: 'ORD-2024-006', customer: 'ByteForce', items: [{ name: 'Bluetooth Speaker', qty: 20, price: 69.99 }], total: 1399.80, status: 'cancelled', progress: 0, date: '2024-03-13' },
  { orderId: 'ORD-2024-007', customer: 'NexGen Solutions', items: [{ name: 'Laptop Sleeve', qty: 75, price: 24.99 }, { name: 'Standing Desk Mat', qty: 30, price: 44.99 }], total: 3224.55, status: 'pending', progress: 5, date: '2024-03-18' },
];
await Order.insertMany(ordersData);

// Notifications
await Notification.insertMany([
  { type: 'warning', message: 'Bluetooth Speaker stock critically low (5 units)', createdAt: new Date(Date.now() - 2 * 60 * 1000) },
  { type: 'success', message: 'Order ORD-2024-001 completed successfully', createdAt: new Date(Date.now() - 15 * 60 * 1000) },
  { type: 'warning', message: 'Ergonomic Mouse stock below reorder level', createdAt: new Date(Date.now() - 30 * 60 * 1000) },
  { type: 'info', message: 'New order received from NexGen Solutions', createdAt: new Date(Date.now() - 60 * 60 * 1000) },
  { type: 'error', message: 'Failed to sync inventory with warehouse B', createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000) },
  { type: 'success', message: 'Inventory recount completed for Electronics', createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000) },
]);

// Activities
await Activity.insertMany([
  { action: 'Order Placed', detail: 'NexGen Solutions placed order for 105 items', icon: 'order', createdAt: new Date(Date.now() - 5 * 60 * 1000) },
  { action: 'Stock Updated', detail: 'Wireless Keyboard restocked +200 units', icon: 'stock', createdAt: new Date(Date.now() - 60 * 60 * 1000) },
  { action: 'Low Stock Alert', detail: 'Ergonomic Mouse dropped below reorder level', icon: 'alert', createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000) },
  { action: 'Order Completed', detail: 'ORD-2024-001 delivered to Acme Corp', icon: 'order', createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000) },
  { action: 'User Action', detail: 'Admin updated pricing for 3 products', icon: 'user', createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000) },
  { action: 'Stock Updated', detail: 'Cable Organizer restocked +150 units', icon: 'stock', createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000) },
]);

console.log('Seed complete!');
console.log('Admin login: admin@inventra.com / admin123');
console.log('Distributor login: distributor@inventra.com / dist123');

await mongoose.connection.close();
