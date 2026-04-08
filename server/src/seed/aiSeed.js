/**
 * AI Seed Script
 * Populates SalesHistory and InventoryLog collections with 30-day realistic
 * mock data. Injects anomalies and demand surges to make AI outputs interesting.
 *
 * Usage:  node --experimental-vm-modules src/seed/aiSeed.js
 *    or:  add "seed:ai": "node src/seed/aiSeed.js" to package.json scripts
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import InventoryItem from '../models/InventoryItem.js';
import SalesHistory  from '../models/SalesHistory.js';
import InventoryLog  from '../models/InventoryLog.js';
import Prediction    from '../models/Prediction.js';

await connectDB();
console.log('Seeding AI collections...');

// Clear existing AI data
await Promise.all([
  SalesHistory.deleteMany(),
  InventoryLog.deleteMany(),
  Prediction.deleteMany(),
]);

const items = await InventoryItem.find();
if (!items.length) {
  console.error('No inventory items found. Run `npm run seed` first.');
  process.exit(1);
}

const REGIONS = [
  { id: 'dist-north', name: 'North Region' },
  { id: 'dist-south', name: 'South Region' },
  { id: 'dist-east',  name: 'East Region'  },
  { id: 'dist-west',  name: 'West Region'  },
];

const now          = Date.now();
const salesRecords = [];
const logRecords   = [];

// Choose products for special patterns
const anomalyProduct = items.find(i => i.status === 'low') || items[0];
const surgeProduct   = items.find(i => i.status === 'healthy' && i.category === 'Electronics') || items[1];

for (const item of items) {
  const isAnomaly = item._id.toString() === anomalyProduct._id.toString();
  const isSurge   = item._id.toString() === surgeProduct._id.toString();
  const baseDaily = Math.max(1, Math.round(item.quantity / 20));

  for (const region of REGIONS) {
    const perRegion  = Math.round(item.quantity / REGIONS.length);
    let   invRunning = perRegion + baseDaily * 30; // start higher

    for (let d = 29; d >= 0; d--) {
      const date    = new Date(now - d * 86_400_000);
      const dayOfWk = date.getDay(); // 0 = Sun

      // --- Sales pattern ---
      let salesQty = baseDaily / REGIONS.length;

      // Demand surge: last 7 days, North Region, surge product
      if (isSurge && region.id === 'dist-north' && d < 7) {
        salesQty *= 2.8; // 180 % spike
      }

      // Weekly seasonality: weekends are quieter
      const seasonal = dayOfWk === 0 || dayOfWk === 6 ? 0.5 : 1.2;
      salesQty = Math.max(0, Math.round(salesQty * seasonal * (0.85 + Math.random() * 0.3)));

      salesRecords.push({
        date,
        quantity:        salesQty,
        productId:       item._id.toString(),
        productName:     item.name,
        distributorId:   region.id,
        distributorName: region.name,
        region:          region.name,
      });

      // --- Inventory log ---
      let dropQty = salesQty;

      // Anomaly: 4× unexplained drop on days 5–8 at North Region
      const isAnomalyDay = isAnomaly && region.id === 'dist-north' && d >= 5 && d <= 8;
      if (isAnomalyDay) {
        dropQty = salesQty * 4; // massive unexplained loss
      }

      const expectedQty = Math.max(0, invRunning - salesQty); // what it SHOULD be
      invRunning        = Math.max(0, invRunning - dropQty);

      logRecords.push({
        date,
        quantity:         Math.round(invRunning),
        expectedQuantity: Math.round(expectedQty),
        productId:        item._id.toString(),
        productName:      item.name,
        distributorId:    region.id,
        distributorName:  region.name,
        changeType:       isAnomalyDay ? 'shrinkage' : 'sale',
        changeAmount:     -Math.round(dropQty),
        note:             isAnomalyDay ? 'Unexplained inventory loss — flagged for review' : null,
      });
    }
  }
}

await SalesHistory.insertMany(salesRecords);
await InventoryLog.insertMany(logRecords);

console.log(`Inserted ${salesRecords.length} sales history records`);
console.log(`Inserted ${logRecords.length} inventory log records`);
console.log(`Anomaly product:      ${anomalyProduct.name} (${anomalyProduct._id})`);
console.log(`Demand surge product: ${surgeProduct.name} (${surgeProduct._id})`);
console.log('AI seed complete!');

await mongoose.connection.close();
