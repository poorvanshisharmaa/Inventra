import mongoose from 'mongoose';

/**
 * Immutable time-series log of inventory quantity snapshots.
 * Used by anomaly detection to measure actual vs expected consumption.
 */
const inventoryLogSchema = new mongoose.Schema({
  date:             { type: Date,   required: true, index: true },
  productId:        { type: String, required: true, index: true },
  productName:      { type: String, required: true },
  distributorId:    { type: String, required: true, index: true },
  distributorName:  { type: String, required: true },
  quantity:         { type: Number, required: true, min: 0 },
  expectedQuantity: { type: Number, default: null },
  changeType: {
    type:    String,
    enum:    ['sale', 'adjustment', 'transfer_in', 'transfer_out', 'receipt', 'shrinkage'],
    default: 'sale',
  },
  changeAmount: { type: Number, default: 0 },
  note:         { type: String, default: null },
}, { timestamps: true });

inventoryLogSchema.index({ productId: 1, distributorId: 1, date: -1 });

export default mongoose.model('InventoryLog', inventoryLogSchema);
