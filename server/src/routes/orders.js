import express from 'express';
import Order from '../models/Order.js';
import Activity from '../models/Activity.js';
import Notification from '../models/Notification.js';
import { protect, adminOnly } from '../middleware/auth.js';

const router = express.Router();

// GET /api/orders
router.get('/', protect, async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/orders/:id
router.get('/:id', protect, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/orders  (admin only)
router.post('/', protect, adminOnly, async (req, res) => {
  try {
    const order = new Order(req.body);
    await order.save();
    await Activity.create({ action: 'Order Placed', detail: `${order.customer} placed order ${order.orderId}`, icon: 'order' });
    await Notification.create({ type: 'info', message: `New order received from ${order.customer}` });
    res.status(201).json(order);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// PATCH /api/orders/:id  (admin only)
router.patch('/:id', protect, adminOnly, async (req, res) => {
  try {
    const order = await Order.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!order) return res.status(404).json({ message: 'Order not found' });

    if (req.body.status === 'completed') {
      await Activity.create({ action: 'Order Completed', detail: `${order.orderId} delivered to ${order.customer}`, icon: 'order' });
      await Notification.create({ type: 'success', message: `Order ${order.orderId} completed successfully` });
    }

    res.json(order);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// DELETE /api/orders/:id  (admin only)
router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    const order = await Order.findByIdAndDelete(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    res.json({ message: 'Order deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
