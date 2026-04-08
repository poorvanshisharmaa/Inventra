/**
 * AI Routes — /api/ai/*
 *
 * Architecture:
 *   1. Load data from MongoDB (real or synthetic from existing models).
 *   2. Try to call Python AI microservice (AI_SERVICE_URL).
 *   3. On timeout/failure, fall back to built-in JS implementations
 *      (same algorithms: Z-score, sales-velocity, moving-avg, greedy match).
 *   4. Cache result in Prediction collection (TTL 10 min).
 */

import express from 'express';
import InventoryItem  from '../models/InventoryItem.js';
import Order          from '../models/Order.js';
import SalesHistory   from '../models/SalesHistory.js';
import InventoryLog   from '../models/InventoryLog.js';
import Prediction     from '../models/Prediction.js';
import { protect, adminOnly } from '../middleware/auth.js';

const router = express.Router();
const AI_URL = process.env.AI_SERVICE_URL || 'http://localhost:5001';
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function callPython(path, body) {
  try {
    const res = await fetch(`${AI_URL}${path}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
      signal:  AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { ok: true, data: await res.json() };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function zscore(arr) {
  if (arr.length < 2) return arr.map(() => 0);
  const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
  const std  = Math.sqrt(arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length);
  return std === 0 ? arr.map(() => 0) : arr.map(v => (v - mean) / std);
}

function olsSlope(arr) {
  const n = arr.length;
  if (n < 2) return 0;
  const xs = Array.from({ length: n }, (_, i) => i);
  const xm = (n - 1) / 2;
  const ym = arr.reduce((s, v) => s + v, 0) / n;
  const num = xs.reduce((s, x, i) => s + (x - xm) * (arr[i] - ym), 0);
  const den = xs.reduce((s, x) => s + (x - xm) ** 2, 0);
  return den === 0 ? 0 : num / den;
}

function movingAvg(arr, w) {
  return arr.map((_, i) => {
    const slice = arr.slice(Math.max(0, i - w + 1), i + 1);
    return slice.reduce((s, v) => s + v, 0) / slice.length;
  });
}

async function getCached(type) {
  const now = new Date();
  return Prediction.findOne({ type, expiresAt: { $gt: now } }).sort({ generatedAt: -1 });
}

async function setCache(type, payload, source) {
  const expiresAt = new Date(Date.now() + CACHE_TTL_MS);
  await Prediction.findOneAndUpdate(
    { type },
    { type, payload, generatedAt: new Date(), expiresAt, source, meta: {} },
    { upsert: true, new: true }
  );
}

// Synthetic distributors used when no SalesHistory/InventoryLog data exists
const REGIONS = [
  { id: 'dist-north', name: 'North Region'  },
  { id: 'dist-south', name: 'South Region'  },
  { id: 'dist-east',  name: 'East Region'   },
  { id: 'dist-west',  name: 'West Region'   },
];

// Build 30 days of synthetic sales history from existing inventory data
function buildSyntheticSalesHistory(items) {
  const records = [];
  const now = Date.now();
  for (const item of items) {
    const baseDaily = Math.max(1, Math.round(item.quantity / 20));
    for (const region of REGIONS) {
      for (let d = 29; d >= 0; d--) {
        const date = new Date(now - d * 86_400_000).toISOString();
        // Add slight noise + weekly seasonality
        const seasonal = 1 + 0.3 * Math.sin((d % 7) * Math.PI / 3.5);
        const noise    = 0.8 + Math.random() * 0.4;
        const qty      = Math.max(0, Math.round(baseDaily * seasonal * noise / REGIONS.length));
        records.push({
          date,
          quantity:        qty,
          productId:       item._id.toString(),
          productName:     item.name,
          distributorId:   region.id,
          distributorName: region.name,
        });
      }
    }
  }
  return records;
}

// Build 30 days of synthetic inventory logs with injected anomalies
function buildSyntheticInventoryLogs(items) {
  const logs    = [];
  const anomaly = items.find(i => i.status === 'low') || items[0];
  const now     = Date.now();

  for (const item of items) {
    for (const region of REGIONS) {
      const perRegion    = Math.round(item.quantity / REGIONS.length);
      let   running      = perRegion + 30; // start higher 30 days ago
      const baseDaily    = Math.max(1, Math.round(item.quantity / 20 / REGIONS.length));

      for (let d = 29; d >= 0; d--) {
        const date = new Date(now - d * 86_400_000).toISOString();
        // Inject anomalous spike loss on days 5-8 for the anomaly product
        const isAnomalyProduct = item._id.toString() === anomaly._id.toString();
        const isAnomalyDay     = isAnomalyProduct && region.id === 'dist-north' && d >= 5 && d <= 8;
        const loss = isAnomalyDay
          ? baseDaily * 4           // 4× normal loss — anomalous
          : baseDaily * (0.9 + Math.random() * 0.2);

        running = Math.max(0, running - loss);
        logs.push({
          date,
          quantity:         Math.round(running),
          expectedQuantity: Math.round(running + loss),
          productId:        item._id.toString(),
          productName:      item.name,
          distributorId:    region.id,
          distributorName:  region.name,
          changeType:       isAnomalyDay ? 'shrinkage' : 'sale',
          changeAmount:     -Math.round(loss),
        });
      }
    }
  }
  return logs;
}

// ─── JS Fallback Implementations ─────────────────────────────────────────────

function jsAnomalies(salesHistory, inventoryLogs) {
  const groups = {};

  for (const log of inventoryLogs) {
    const k = `${log.productId}_${log.distributorId}`;
    if (!groups[k]) {
      groups[k] = {
        productId:       log.productId,       productName:     log.productName,
        distributorId:   log.distributorId,   distributorName: log.distributorName,
        invLogs: [], salesRecs: [],
      };
    }
    groups[k].invLogs.push(log);
  }

  for (const s of salesHistory) {
    const k = `${s.productId}_${s.distributorId}`;
    if (groups[k]) groups[k].salesRecs.push(s);
  }

  const results = [];
  for (const [, g] of Object.entries(groups)) {
    const invSorted   = [...g.invLogs].sort((a, b) => new Date(a.date) - new Date(b.date));
    const saleSorted  = [...g.salesRecs].sort((a, b) => new Date(a.date) - new Date(b.date));
    if (invSorted.length < 3) continue;

    const qtys      = invSorted.map(l => l.quantity);
    const drops     = qtys.slice(0, -1).map((q, i) => Math.max(0, q - qtys[i + 1]));
    const saleQtys  = saleSorted.map(s => s.quantity);
    const avgSales  = saleQtys.length ? saleQtys.reduce((s, v) => s + v, 0) / saleQtys.length : 1;
    const discrepancies = drops.map(d => Math.abs(d - avgSales));
    const dz        = zscore(discrepancies);
    const maxZ      = Math.max(...dz.map(Math.abs), 0);
    const score     = Math.min(1, maxZ / 3);

    const totalDrop  = drops.reduce((s, v) => s + v, 0);
    const totalSales = saleQtys.reduce((s, v) => s + v, 0);
    const unexplained = Math.max(0, totalDrop - totalSales);

    const severity = score > 0.8 ? 'critical' : score > 0.6 ? 'high' : score > 0.4 ? 'medium' : 'low';

    const reasons = [];
    if (unexplained > avgSales * 2) reasons.push(`Inventory dropping ${unexplained.toFixed(0)} units faster than sales explain`);
    if (drops.length && Math.max(...drops) > avgSales * 3) reasons.push('Sudden large single-day inventory drop detected');
    if (!reasons.length) reasons.push('Statistical deviation from expected inventory consumption pattern');

    results.push({
      productId:       g.productId,       productName:     g.productName,
      distributorId:   g.distributorId,   distributorName: g.distributorName,
      anomalyScore:    +score.toFixed(3),
      severity,
      isAnomaly:       score > 0.5,
      unexplainedLoss: +unexplained.toFixed(1),
      avgDailySales:   +avgSales.toFixed(1),
      explanation:     reasons[0],
      reasons,
      confidenceScore: +Math.min(0.99, 0.5 + score * 0.49).toFixed(2),
    });
  }

  results.sort((a, b) => b.anomalyScore - a.anomalyScore);
  return {
    status: 'success', algorithm: 'Z-Score Statistical Analysis (JS)',
    totalAnalyzed: results.length,
    anomaliesFound: results.filter(r => r.isAnomaly).length,
    results,
  };
}

function jsStockouts(salesHistory, inventoryItems) {
  const salesIdx = {};
  for (const s of salesHistory) {
    const k = `${s.productId}_${s.distributorId}`;
    (salesIdx[k] = salesIdx[k] || []).push(s);
  }

  const results = [];
  for (const item of inventoryItems) {
    for (const region of REGIONS) {
      const k    = `${item._id}_${region.id}`;
      const recs = (salesIdx[k] || []).sort((a, b) => new Date(a.date) - new Date(b.date));
      const perRegionStock = Math.round(item.quantity / REGIONS.length);

      let avgDs;
      if (recs.length) {
        const qtys = recs.map(r => r.quantity);
        const n = qtys.length;
        const weights = qtys.map((_, i) => Math.exp(0.12 * i));
        const tw = weights.reduce((s, w) => s + w, 0);
        avgDs = weights.reduce((s, w, i) => s + w * qtys[i], 0) / tw;
      } else {
        avgDs = Math.max(1, item.reorderLevel / 7 / REGIONS.length);
      }

      avgDs = Math.max(0.1, avgDs);
      const days = perRegionStock / avgDs;
      const urgency = days <= 2 ? 'critical' : days <= 5 ? 'high' : days <= 10 ? 'medium' : 'low';
      const color   = days <= 2 ? 'red'  : days <= 5 ? 'orange' : days <= 10 ? 'yellow' : 'green';

      let slope = 0, trend = 'stable';
      if (recs.length >= 4) {
        slope = olsSlope(recs.slice(-7).map(r => r.quantity));
        trend = slope > 0.1 ? 'increasing' : slope < -0.1 ? 'decreasing' : 'stable';
      }

      const adjusted   = trend === 'increasing' && slope > 0 ? days * 0.85 : days;
      const confidence = Math.min(0.99, 0.4 + Math.min(recs.length, 30) / 30 * 0.59);
      const reorderQty = Math.max(0, Math.round(avgDs * 14 - perRegionStock));

      results.push({
        productId:       item._id.toString(),   productName:     item.name,
        distributorId:   region.id,             distributorName: region.name,
        currentStock:    perRegionStock,
        avgDailySales:   +avgDs.toFixed(2),
        daysToStockout:  +adjusted.toFixed(1),
        urgency, color, trend,
        trendSlope:      +slope.toFixed(3),
        confidenceScore: +confidence.toFixed(2),
        explanation:     `At ${avgDs.toFixed(1)} units/day, stock of ${perRegionStock} will deplete in ~${adjusted.toFixed(1)} days`,
        recommendation:  `Reorder ${reorderQty} units to maintain a 2-week buffer`,
      });
    }
  }

  results.sort((a, b) => a.daysToStockout - b.daysToStockout);
  return {
    status: 'success', algorithm: 'Exponentially-Weighted Sales Velocity (JS)',
    totalProducts:  results.length,
    criticalCount:  results.filter(r => r.urgency === 'critical').length,
    highCount:      results.filter(r => r.urgency === 'high').length,
    results,
  };
}

function jsDemandSurges(salesHistory, windowDays = 7) {
  const groups = {};
  for (const s of salesHistory) {
    const k = `${s.productId}_${s.distributorId}`;
    (groups[k] = groups[k] || {
      productId: s.productId, productName: s.productName,
      region: s.distributorName, orders: [],
    }).orders.push({ date: s.date, quantity: s.quantity });
  }

  const results = [];
  for (const [, g] of Object.entries(groups)) {
    const sorted = [...g.orders].sort((a, b) => new Date(a.date) - new Date(b.date));
    if (sorted.length < windowDays + 2) continue;
    const qtys         = sorted.map(o => o.quantity);
    const recent       = qtys.slice(-windowDays);
    const baseline     = qtys.slice(0, -windowDays);
    if (!baseline.length) continue;
    const recentAvg    = recent.reduce((s, v) => s + v, 0) / recent.length;
    const baselineAvg  = baseline.reduce((s, v) => s + v, 0) / baseline.length;
    if (baselineAvg === 0) continue;

    const growthRate   = (recentAvg - baselineAvg) / baselineAvg;
    const slope        = olsSlope(recent);
    const normSlope    = slope / (baselineAvg + 1);
    const surgeScore   = Math.min(1, Math.max(0, growthRate * 0.6 + normSlope * 0.4));
    const isSurge      = surgeScore > 0.15 && growthRate > 0.10;
    const intensity    = surgeScore > 0.5 ? 'explosive' : surgeScore > 0.3 ? 'strong' : surgeScore > 0.15 ? 'moderate' : 'mild';
    const confidence   = Math.min(0.99, 0.3 + Math.min(sorted.length, 60) / 60 * 0.69);

    let zScore = 0;
    if (qtys.length >= 3) {
      const mean = qtys.reduce((s, v) => s + v, 0) / qtys.length;
      const std  = Math.sqrt(qtys.reduce((s, v) => s + (v - mean) ** 2, 0) / qtys.length);
      zScore = std > 0 ? (recentAvg - baselineAvg) / std : 0;
    }

    results.push({
      productId:         g.productId,   productName:       g.productName,
      region:            g.region,
      surgeScore:        +surgeScore.toFixed(3),
      growthRate:        +(growthRate * 100).toFixed(1),
      intensity,          isSurge,
      recentAvgDemand:   +recentAvg.toFixed(1),
      baselineAvgDemand: +baselineAvg.toFixed(1),
      trendSlope:        +slope.toFixed(3),
      zScore:            +zScore.toFixed(2),
      confidenceScore:   +confidence.toFixed(2),
      explanation:       `Demand up ${(growthRate * 100).toFixed(0)}% vs ${windowDays}-day baseline (${baselineAvg.toFixed(0)} → ${recentAvg.toFixed(0)} units/day)`,
      recommendation:    `Pre-position additional stock in ${g.region} before demand peaks`,
    });
  }

  results.sort((a, b) => b.surgeScore - a.surgeScore);
  return {
    status: 'success', algorithm: 'Moving Average Deviation + OLS Trend Slope (JS)',
    windowDays, totalAnalyzed: results.length,
    surgesDetected: results.filter(r => r.isSurge).length,
    results,
  };
}

function jsRebalance(inventoryItems) {
  const suggestions = [];
  let tid = 1;

  for (const item of inventoryItems) {
    const totalStock = item.quantity;
    const target     = Math.round(totalStock / REGIONS.length);
    const avgSales   = Math.max(1, item.reorderLevel / 7 / REGIONS.length);

    // Assign uneven distribution to make rebalancing interesting
    const allocations = REGIONS.map((r, i) => ({
      dist: r,
      stock: Math.round(target * [1.5, 0.4, 1.2, 0.9][i]), // skewed
    }));

    const surplus = [], deficit = [];
    for (const a of allocations) {
      const daysCover = a.stock / avgSales;
      if (a.stock > target * 1.2) surplus.push({ dist: a.dist, excess: a.stock - target, daysCover: +daysCover.toFixed(1), stock: a.stock });
      else if (a.stock < target * 0.8) deficit.push({ dist: a.dist, shortage: target - a.stock, daysCover: +daysCover.toFixed(1), stock: a.stock });
    }

    surplus.sort((a, b) => b.excess  - a.excess);
    deficit.sort((a, b) => a.daysCover - b.daysCover);

    let si = 0, di = 0;
    while (si < surplus.length && di < deficit.length) {
      const src = surplus[si], dst = deficit[di];
      const qty = Math.floor(Math.min(src.excess, dst.shortage));
      if (qty <= 0) { si++; di++; continue; }

      const urgency = dst.daysCover <= 2 ? 'critical' : dst.daysCover <= 5 ? 'high' : 'medium';
      suggestions.push({
        id:                  `TRF-${String(tid).padStart(3, '0')}`,
        productId:           item._id.toString(),
        productName:         item.name,
        fromDistributorId:   src.dist.id,
        fromDistributorName: src.dist.name,
        toDistributorId:     dst.dist.id,
        toDistributorName:   dst.dist.name,
        transferQuantity:    qty,
        fromCurrentStock:    src.stock,
        fromStockAfter:      src.stock - qty,
        toCurrentStock:      dst.stock,
        toStockAfter:        dst.stock + qty,
        costSaving:          +(qty * 0.8).toFixed(2),
        urgency,
        fromDaysCover:       src.daysCover,
        toDaysCover:         dst.daysCover,
        explanation:         `Transfer ${qty} units from ${src.dist.name} (excess: ${src.excess.toFixed(0)}) to ${dst.dist.name} (shortage: ${dst.shortage.toFixed(0)})`,
        status:              'pending',
      });
      tid++;
      src.excess   -= qty;
      dst.shortage -= qty;
      if (src.excess   <= 0) si++;
      if (dst.shortage <= 0) di++;
    }
  }

  const priority = { critical: 0, high: 1, medium: 2 };
  suggestions.sort((a, b) => priority[a.urgency] - priority[b.urgency] || b.transferQuantity - a.transferQuantity);

  return {
    status: 'success', algorithm: 'Greedy Surplus-Deficit Matching (JS)',
    suggestionsCount:      suggestions.length,
    estimatedTotalSavings: +suggestions.reduce((s, x) => s + x.costSaving, 0).toFixed(2),
    suggestions,
  };
}

// ─── Route: GET /api/ai/anomalies ─────────────────────────────────────────────

router.get('/anomalies', protect, adminOnly, async (req, res) => {
  try {
    const cached = await getCached('anomaly');
    if (cached) return res.json(cached.payload);

    const [items, salesDB, logsDB] = await Promise.all([
      InventoryItem.find(),
      SalesHistory.find().sort({ date: -1 }).limit(2000),
      InventoryLog.find().sort({ date: -1 }).limit(2000),
    ]);

    const sales = salesDB.length > 10 ? salesDB : buildSyntheticSalesHistory(items);
    const logs  = logsDB.length  > 10 ? logsDB  : buildSyntheticInventoryLogs(items);

    const pyResult = await callPython('/anomalies', { salesHistory: sales, inventoryLogs: logs });
    const result   = pyResult.ok ? pyResult.data : jsAnomalies(sales, logs);
    result.source  = pyResult.ok ? 'python_service' : 'js_fallback';

    await setCache('anomaly', result, result.source);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Route: GET /api/ai/stockout-predictions ──────────────────────────────────

router.get('/stockout-predictions', protect, adminOnly, async (req, res) => {
  try {
    const cached = await getCached('stockout');
    if (cached) return res.json(cached.payload);

    const [items, salesDB] = await Promise.all([
      InventoryItem.find(),
      SalesHistory.find().sort({ date: -1 }).limit(2000),
    ]);

    const sales = salesDB.length > 10 ? salesDB : buildSyntheticSalesHistory(items);

    const currentInventory = items.flatMap(item =>
      REGIONS.map(r => ({
        productId:       item._id.toString(),
        productName:     item.name,
        distributorId:   r.id,
        distributorName: r.name,
        currentStock:    Math.round(item.quantity / REGIONS.length),
        reorderLevel:    item.reorderLevel,
      }))
    );

    const pyResult = await callPython('/stockout-predictions', { salesHistory: sales, currentInventory });
    const result   = pyResult.ok ? pyResult.data : jsStockouts(sales, items);
    result.source  = pyResult.ok ? 'python_service' : 'js_fallback';

    await setCache('stockout', result, result.source);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Route: GET /api/ai/demand-surges ────────────────────────────────────────

router.get('/demand-surges', protect, adminOnly, async (req, res) => {
  try {
    const cached = await getCached('demand_surge');
    if (cached) return res.json(cached.payload);

    const [items, salesDB] = await Promise.all([
      InventoryItem.find(),
      SalesHistory.find().sort({ date: -1 }).limit(2000),
    ]);

    const sales = salesDB.length > 10 ? salesDB : buildSyntheticSalesHistory(items);

    const orderHistory = sales.map(s => ({
      productId:      s.productId,
      productName:    s.productName,
      distributorId:  s.distributorId,
      distributorName:s.distributorName,
      region:         s.distributorName,
      date:           s.date instanceof Date ? s.date.toISOString() : s.date,
      quantity:       s.quantity,
    }));

    const pyResult = await callPython('/demand-surges', { orderHistory, windowDays: 7 });
    const result   = pyResult.ok ? pyResult.data : jsDemandSurges(sales, 7);
    result.source  = pyResult.ok ? 'python_service' : 'js_fallback';

    await setCache('demand_surge', result, result.source);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Route: GET /api/ai/rebalance-suggestions ────────────────────────────────

router.get('/rebalance-suggestions', protect, adminOnly, async (req, res) => {
  try {
    const cached = await getCached('rebalance');
    if (cached) return res.json(cached.payload);

    const [items, salesDB] = await Promise.all([
      InventoryItem.find(),
      SalesHistory.find().sort({ date: -1 }).limit(2000),
    ]);

    const sales = salesDB.length > 10 ? salesDB : buildSyntheticSalesHistory(items);

    // Compute per-distributor average daily sales
    const salesAvg = {};
    for (const s of sales) {
      const k = `${s.productId}_${s.distributorId}`;
      if (!salesAvg[k]) salesAvg[k] = { total: 0, count: 0 };
      salesAvg[k].total += s.quantity;
      salesAvg[k].count += 1;
    }

    const distributorStocks = items.flatMap(item =>
      REGIONS.map((r, i) => {
        const k   = `${item._id}_${r.id}`;
        const ads = salesAvg[k] ? salesAvg[k].total / salesAvg[k].count : Math.max(1, item.reorderLevel / 7 / REGIONS.length);
        const mul = [1.5, 0.4, 1.2, 0.9][i]; // skew allocation to generate suggestions
        return {
          distributorId:   r.id,   distributorName: r.name,
          productId:       item._id.toString(),
          productName:     item.name,
          currentStock:    Math.round(item.quantity * mul / REGIONS.length),
          averageDailySales: +ads.toFixed(2),
          targetStock:     Math.round(item.quantity / REGIONS.length),
          location:        r.name,
        };
      })
    );

    const pyResult = await callPython('/rebalance-suggestions', { distributorStocks });
    const result   = pyResult.ok ? pyResult.data : jsRebalance(items);
    result.source  = pyResult.ok ? 'python_service' : 'js_fallback';

    await setCache('rebalance', result, result.source);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Route: GET /api/ai/status ────────────────────────────────────────────────

router.get('/status', protect, adminOnly, async (req, res) => {
  try {
    const pyHealth = await callPython('/health', {}).catch(() => ({ ok: false }));
    // Actually callPython only accepts POST — do a GET manually
    let aiOnline = false;
    try {
      const r = await fetch(`${AI_URL}/health`, { signal: AbortSignal.timeout(2000) });
      aiOnline = r.ok;
    } catch { /* offline */ }

    res.json({
      aiService:    { online: aiOnline, url: AI_URL },
      cacheEntries: await Prediction.countDocuments(),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Route: DELETE /api/ai/cache ─────────────────────────────────────────────

router.delete('/cache', protect, adminOnly, async (req, res) => {
  try {
    await Prediction.deleteMany({});
    res.json({ message: 'AI cache cleared — next request will recompute fresh results.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
