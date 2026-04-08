import mongoose from 'mongoose';

/**
 * Caches AI prediction results to avoid recomputing on every request.
 * Each prediction expires after `ttlSeconds` (default 10 minutes).
 */
const predictionSchema = new mongoose.Schema({
  type: {
    type:     String,
    enum:     ['anomaly', 'stockout', 'demand_surge', 'rebalance'],
    required: true,
    index:    true,
  },
  payload:     { type: mongoose.Schema.Types.Mixed, required: true },
  generatedAt: { type: Date, default: Date.now },
  expiresAt:   { type: Date, required: true, index: { expireAfterSeconds: 0 } },
  source:      { type: String, enum: ['python_service', 'js_fallback'], default: 'js_fallback' },
  meta:        { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

export default mongoose.model('Prediction', predictionSchema);
