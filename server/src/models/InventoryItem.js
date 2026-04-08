import mongoose from 'mongoose';

const inventoryItemSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  sku: { type: String, required: true, unique: true, trim: true },
  category: { type: String, required: true, trim: true },
  quantity: { type: Number, required: true, min: 0, default: 0 },
  reorderLevel: { type: Number, required: true, min: 0, default: 10 },
  price: { type: Number, required: true, min: 0 },
  status: {
    type: String,
    enum: ['healthy', 'medium', 'low'],
    default: 'healthy',
  },
}, { timestamps: true });

// Auto-compute status before save
inventoryItemSchema.pre('save', function (next) {
  const { quantity, reorderLevel } = this;
  if (quantity <= reorderLevel * 0.5) this.status = 'low';
  else if (quantity <= reorderLevel * 1.2) this.status = 'medium';
  else this.status = 'healthy';
  next();
});

export default mongoose.model('InventoryItem', inventoryItemSchema);
