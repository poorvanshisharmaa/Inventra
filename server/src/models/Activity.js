import mongoose from 'mongoose';

const activitySchema = new mongoose.Schema({
  action: { type: String, required: true },
  detail: { type: String, required: true },
  icon: { type: String, enum: ['order', 'stock', 'alert', 'user'], required: true },
}, { timestamps: true });

export default mongoose.model('Activity', activitySchema);
