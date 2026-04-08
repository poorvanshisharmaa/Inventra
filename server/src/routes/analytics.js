import express from 'express';
import Order from '../models/Order.js';
import InventoryItem from '../models/InventoryItem.js';
import Activity from '../models/Activity.js';
import { protect, adminOnly } from '../middleware/auth.js';

const router = express.Router();

// GET /api/analytics/summary  (admin only)
router.get('/summary', protect, adminOnly, async (req, res) => {
  try {
    const [allItems, allOrders] = await Promise.all([
      InventoryItem.find(),
      Order.find(),
    ]);

    const totalInventory = allItems.reduce((sum, i) => sum + i.quantity, 0);
    const activeOrders = allOrders.filter(o => ['pending', 'processing'].includes(o.status)).length;
    const lowStockAlerts = allItems.filter(i => i.status === 'low').length;
    const currentMonth = new Date().toISOString().slice(0, 7);
    const revenueMTD = allOrders
      .filter(o => o.status === 'completed' && o.date.startsWith(currentMonth))
      .reduce((sum, o) => sum + o.total, 0);

    res.json({ totalInventory, activeOrders, lowStockAlerts, revenueMTD });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/analytics/inventory-trends  (admin only)
router.get('/inventory-trends', protect, adminOnly, async (req, res) => {
  try {
    const items = await InventoryItem.find();
    // Group by category for a snapshot of current levels
    const byCategory = {};
    for (const item of items) {
      byCategory[item.category] = (byCategory[item.category] || 0) + item.quantity;
    }

    // Return hardcoded 6-month trend based on seeded data (replace with real time-series if needed)
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
    const trend = months.map((month, i) => ({
      month,
      electronics: Math.round((byCategory['Electronics'] || 400) * (0.7 + i * 0.06)),
      accessories: Math.round((byCategory['Accessories'] || 300) * (0.75 + i * 0.05)),
      furniture: Math.round((byCategory['Furniture'] || 150) * (0.8 + i * 0.04)),
    }));

    res.json(trend);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/analytics/order-volume  (admin only)
router.get('/order-volume', protect, adminOnly, async (req, res) => {
  try {
    const orders = await Order.find({ status: 'completed' });

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const byMonth = {};

    for (const order of orders) {
      const d = new Date(order.date);
      const label = monthNames[d.getMonth()];
      if (!byMonth[label]) byMonth[label] = { orders: 0, revenue: 0 };
      byMonth[label].orders += 1;
      byMonth[label].revenue += order.total;
    }

    const result = monthNames
      .filter(m => byMonth[m])
      .map(month => ({ month, orders: byMonth[month].orders, revenue: Math.round(byMonth[month].revenue) }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/analytics/activities  (admin only)
router.get('/activities', protect, adminOnly, async (req, res) => {
  try {
    const activities = await Activity.find().sort({ createdAt: -1 }).limit(20);
    res.json(activities);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/analytics/category-breakdown  (admin only)
router.get('/category-breakdown', protect, adminOnly, async (req, res) => {
  try {
    const items = await InventoryItem.find();
    const byCategory = {};
    for (const item of items) {
      byCategory[item.category] = (byCategory[item.category] || 0) + item.quantity;
    }
    const total = Object.values(byCategory).reduce((a, b) => a + b, 0);
    const colors = ['hsl(99, 55%, 45%)', 'hsl(210, 55%, 53%)', 'hsl(337, 80%, 41%)', 'hsl(45, 80%, 50%)', 'hsl(270, 60%, 55%)'];
    const result = Object.entries(byCategory).map(([name, value], i) => ({
      name,
      value: total > 0 ? Math.round((value / total) * 100) : 0,
      color: colors[i % colors.length],
    }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
