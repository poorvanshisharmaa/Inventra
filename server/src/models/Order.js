import mongoose from 'mongoose';

const orderItemSchema = new mongoose.Schema({
  name: { type: String, required: true },
  qty: { type: Number, required: true, min: 1 },
  price: { type: Number, required: true, min: 0 },
}, { _id: false });

const orderSchema = new mongoose.Schema({
  orderId: { type: String, required: true, unique: true },
  customer: { type: String, required: true, trim: true },
  items: { type: [orderItemSchema], required: true },
  total: { type: Number, required: true },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'cancelled'],
    default: 'pending',
  },
  progress: { type: Number, default: 0, min: 0, max: 100 },
  date: { type: String, required: true },
}, { timestamps: true });

export default mongoose.model('Order', orderSchema);
