import mongoose from 'mongoose';

/**
 * Tracks daily sales records per product per distributor.
 * Populated by the AI seed script and updated when orders complete.
 */
const salesHistorySchema = new mongoose.Schema({
  date:            { type: Date,   required: true, index: true },
  productId:       { type: String, required: true, index: true },
  productName:     { type: String, required: true },
  distributorId:   { type: String, required: true, index: true },
  distributorName: { type: String, required: true },
  quantity:        { type: Number, required: true, min: 0 },
  orderId:         { type: String, default: null },
  region:          { type: String, default: 'General' },
}, { timestamps: true });

salesHistorySchema.index({ productId: 1, distributorId: 1, date: -1 });

export default mongoose.model('SalesHistory', salesHistorySchema);
