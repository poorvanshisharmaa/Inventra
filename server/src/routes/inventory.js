import express from 'express';
import InventoryItem from '../models/InventoryItem.js';
import Activity from '../models/Activity.js';
import Notification from '../models/Notification.js';
import { protect, adminOnly } from '../middleware/auth.js';

const router = express.Router();

// GET /api/inventory
router.get('/', protect, async (req, res) => {
  try {
    const items = await InventoryItem.find().sort({ createdAt: -1 });
    res.json(items);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/inventory/:id
router.get('/:id', protect, async (req, res) => {
  try {
    const item = await InventoryItem.findById(req.params.id);
    if (!item) return res.status(404).json({ message: 'Item not found' });
    res.json(item);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/inventory  (admin only)
router.post('/', protect, adminOnly, async (req, res) => {
  try {
    const item = new InventoryItem(req.body);
    await item.save();
    await Activity.create({ action: 'Product Added', detail: `${item.name} added to inventory`, icon: 'stock' });
    res.status(201).json(item);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// PATCH /api/inventory/:id  (admin only)
router.patch('/:id', protect, adminOnly, async (req, res) => {
  try {
    const item = await InventoryItem.findById(req.params.id);
    if (!item) return res.status(404).json({ message: 'Item not found' });

    const prevQty = item.quantity;
    Object.assign(item, req.body);
    await item.save();

    // Log activity & trigger low-stock notification
    if (req.body.quantity !== undefined) {
      const diff = item.quantity - prevQty;
      const sign = diff >= 0 ? `+${diff}` : `${diff}`;
      await Activity.create({ action: 'Stock Updated', detail: `${item.name} updated ${sign} units`, icon: 'stock' });

      if (item.status === 'low') {
        await Notification.create({ type: 'warning', message: `${item.name} stock is critically low (${item.quantity} units)` });
      }
    }

    res.json(item);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// DELETE /api/inventory/:id  (admin only)
router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    const item = await InventoryItem.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ message: 'Item not found' });
    res.json({ message: 'Item deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
