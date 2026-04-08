import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import connectDB from './config/db.js';
import authRoutes from './routes/auth.js';
import inventoryRoutes from './routes/inventory.js';
import orderRoutes from './routes/orders.js';
import notificationRoutes from './routes/notifications.js';
import analyticsRoutes from './routes/analytics.js';
import aiRoutes        from './routes/ai.js';
import photoCountRoutes from './routes/photoCount.js';
import voiceRoutes        from './routes/voice.js';
import orderExtractRoutes  from './routes/orderExtract.js';
import demandSignalRoutes  from './routes/demandSignals.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Connect to MongoDB
connectDB();

// Middleware
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()).filter(Boolean)
  : [
      'http://localhost:8080',
      'http://localhost:5173',
      'http://127.0.0.1:8080',
      'http://127.0.0.1:5173',
    ];

// In local dev, allow typical LAN origins (so you can access the frontend from another device).
// You can override/lock down behavior by setting ALLOWED_ORIGINS in your env.
const isProduction = process.env.NODE_ENV === 'production';
const devAllowedOriginPatterns = [
  /^http:\/\/localhost:\d+$/i,
  /^http:\/\/127\.0\.0\.1:\d+$/i,
  /^http:\/\/192\.168\.\d{1,3}\.\d{1,3}:\d+$/i,
  /^http:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d+$/i,
  /^http:\/\/172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}:\d+$/i,
  // Your current origin (as seen in logs)
  /^http:\/\/192\.0\.0\.2:\d+$/i,
];

app.use(cors({
  origin: (origin, callback) => {
    // allow requests with no origin (curl, Postman, server-to-server)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    if (!isProduction && devAllowedOriginPatterns.some(re => re.test(origin))) {
      return callback(null, true);
    }
    callback(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
}));
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/ai',          aiRoutes);
app.use('/api/photo-count', photoCountRoutes);
app.use('/api/voice',          voiceRoutes);
app.use('/api/orders',         orderExtractRoutes);      // adds /api/orders/extract
app.use('/api/demand-signals', demandSignalRoutes);

// Health check
app.get('/api/health', (_, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => console.log(`Inventra server running on port ${PORT}`));
