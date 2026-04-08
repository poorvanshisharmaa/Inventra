import express from 'express';
import RestockRequest from '../models/RestockRequest.js';
import InventoryItem from '../models/InventoryItem.js';
import Notification from '../models/Notification.js';
import Activity from '../models/Activity.js';
import { protect, adminOnly } from '../middleware/auth.js';

const router = express.Router();

// GET /api/restock-requests
// Admin → all requests. Distributor → only their own.
router.get('/', protect, async (req, res) => {
  try {
    const filter = req.user.role === 'admin' ? {} : { distributorEmail: req.user.email };
    const requests = await RestockRequest.find(filter).sort({ createdAt: -1 });
    res.json(requests);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/restock-requests  (distributors raise requests)
router.post('/', protect, async (req, res) => {
  try {
    const { productId, requestedQty, notes, fulfillmentType } = req.body;

    const product = await InventoryItem.findById(productId);
    if (!product) return res.status(404).json({ message: 'Product not found' });

    const request = await RestockRequest.create({
      productId,
      productName:      product.name,
      sku:              product.sku,
      category:         product.category,
      distributorEmail: req.user.email,
      distributorName:  req.user.name,
      requestedQty,
      currentStock:     product.quantity,
      notes:            notes || '',
      fulfillmentType:  fulfillmentType || 'central',
    });

    // Notify admins
    await Notification.create({
      type: 'info',
      message: `${req.user.name} requested restock of ${product.name} (×${requestedQty})`,
    });
    await Activity.create({
      action: 'Restock Requested',
      detail: `${req.user.name} requested ${requestedQty} units of ${product.name}`,
      icon: 'stock',
    });

    res.status(201).json(request);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// PATCH /api/restock-requests/:id  (admin approves / rejects / fulfils)
router.patch('/:id', protect, adminOnly, async (req, res) => {
  try {
    const { status, adminNote, approvedQty, fulfillmentType, sourceDistributor } = req.body;

    const request = await RestockRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: 'Request not found' });

    if (['fulfilled', 'rejected'].includes(request.status)) {
      return res.status(400).json({ message: `Request is already ${request.status}` });
    }

    request.status = status;
    if (adminNote !== undefined)       request.adminNote = adminNote;
    if (approvedQty !== undefined)     request.approvedQty = approvedQty;
    if (fulfillmentType !== undefined) request.fulfillmentType = fulfillmentType;
    if (sourceDistributor !== undefined) request.sourceDistributor = sourceDistributor;

    // When fulfilled → actually update inventory stock
    if (status === 'fulfilled') {
      const qty = approvedQty ?? request.requestedQty;
      const product = await InventoryItem.findById(request.productId);
      if (product) {
        product.quantity += qty;
        await product.save(); // triggers auto status recalculation
      }

      await Activity.create({
        action: 'Restock Fulfilled',
        detail: `${request.productName} restocked +${qty} units for ${request.distributorName}`,
        icon: 'stock',
      });
      await Notification.create({
        type: 'success',
        message: `Restock request for ${request.productName} has been fulfilled (${qty} units added)`,
      });
    }

    if (status === 'rejected') {
      await Notification.create({
        type: 'warning',
        message: `Your restock request for ${request.productName} was not approved`,
      });
    }

    if (status === 'approved') {
      await Notification.create({
        type: 'info',
        message: `Restock request for ${request.productName} approved — awaiting fulfilment`,
      });
    }

    await request.save();
    res.json(request);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

export default router;
