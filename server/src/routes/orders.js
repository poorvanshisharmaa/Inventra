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

// Progress values tied to each status
const STATUS_PROGRESS = {
  pending:    10,
  processing: 60,
  completed:  100,
  cancelled:  0,
};

// PATCH /api/orders/:id  (admin only)
router.patch('/:id', protect, adminOnly, async (req, res) => {
  try {
    const existing = await Order.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Order not found' });

    // Prevent moving backwards or changing terminal states
    const terminal = ['completed', 'cancelled'];
    if (terminal.includes(existing.status)) {
      return res.status(400).json({ message: `Order is already ${existing.status} and cannot be changed.` });
    }

    const update = { ...req.body };

    // Auto-set progress when status changes
    if (update.status && STATUS_PROGRESS[update.status] !== undefined) {
      update.progress = STATUS_PROGRESS[update.status];
    }

    const order = await Order.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });

    // Activity + notification side-effects
    if (update.status === 'processing') {
      await Activity.create({ action: 'Order Processing', detail: `${order.orderId} for ${order.customer} is now being processed`, icon: 'order' });
      await Notification.create({ type: 'info', message: `Order ${order.orderId} is now processing` });
    }
    if (update.status === 'completed') {
      await Activity.create({ action: 'Order Completed', detail: `${order.orderId} delivered to ${order.customer}`, icon: 'order' });
      await Notification.create({ type: 'success', message: `Order ${order.orderId} completed successfully` });
    }
    if (update.status === 'cancelled') {
      await Activity.create({ action: 'Order Cancelled', detail: `${order.orderId} for ${order.customer} was cancelled`, icon: 'alert' });
      await Notification.create({ type: 'error', message: `Order ${order.orderId} has been cancelled` });
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
