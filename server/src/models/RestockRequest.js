import mongoose from 'mongoose';

const restockRequestSchema = new mongoose.Schema({
  // Product being requested
  productId:    { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem', required: true },
  productName:  { type: String, required: true },
  sku:          { type: String, required: true },
  category:     { type: String, required: true },

  // Who raised it
  distributorEmail: { type: String, required: true },
  distributorName:  { type: String, required: true },

  // Request details
  requestedQty: { type: Number, required: true, min: 1 },
  currentStock: { type: Number, required: true },
  notes:        { type: String, default: '' },

  // Cross-distribution flag
  // 'central'  = fulfilled from central warehouse
  // 'transfer' = fulfilled by transferring from another distributor
  fulfillmentType: { type: String, enum: ['central', 'transfer'], default: 'central' },
  sourceDistributor: { type: String, default: '' }, // filled if transfer

  // Lifecycle
  status:       { type: String, enum: ['pending', 'approved', 'rejected', 'fulfilled'], default: 'pending' },
  adminNote:    { type: String, default: '' },
  approvedQty:  { type: Number, default: null },
}, { timestamps: true });

export default mongoose.model('RestockRequest', restockRequestSchema);
