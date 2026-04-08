/**
 * GET /api/demand-signals
 *
 * External Demand Signal Detector
 * "Read the world, predict your demand"
 *
 * Pipeline:
 *  1. Fetch live weather for 4 major Indian cities (wttr.in — free, no key)
 *  2. Compute upcoming holidays / recurring events for the next 60 days
 *  3. Load product categories from MongoDB
 *  4. Feed all context to Groq Llama 3.3-70B (JSON mode) for correlation analysis
 *  5. Return structured demand-event signals + a 30-day calendar payload
 *
 * Cache: in-memory, keyed by calendar date, expires after 4 hours
 */

import express       from 'express';
import Groq          from 'groq-sdk';
import InventoryItem from '../models/InventoryItem.js';
import { protect }   from '../middleware/auth.js';

const router = express.Router();

// ─── Groq ─────────────────────────────────────────────────────────────────────
let _groq = null;
function getGroq() {
  if (_groq) return _groq;
  if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY not set.');
  _groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return _groq;
}

// ─── In-memory cache (key = YYYY-MM-DD, 4-hour TTL) ──────────────────────────
const _cache = new Map();   // key → { data, expiresAt }

function getCached(key) {
  const entry = _cache.get(key);
  if (entry && Date.now() < entry.expiresAt) return entry.data;
  _cache.delete(key);
  return null;
}
function setCache(key, data, ttlMs = 4 * 60 * 60 * 1000) {
  _cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function isoDate(d) { return d.toISOString().split('T')[0]; }
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function daysBetween(a, b) { return Math.round((b - a) / 86_400_000); }

// ─── 1. Live weather via wttr.in (no API key required) ────────────────────────
async function fetchWeather() {
  const cities = ['Delhi', 'Mumbai', 'Bangalore', 'Chennai'];
  const results = [];

  await Promise.all(cities.map(async (city) => {
    try {
      const res = await fetch(
        `https://wttr.in/${encodeURIComponent(city)}?format=j1`,
        { signal: AbortSignal.timeout(4000) }
      );
      if (!res.ok) return;
      const d = await res.json();
      const cur  = d.current_condition?.[0];
      const fc   = d.weather ?? [];
      if (!cur) return;

      results.push({
        city,
        tempC:       parseInt(cur.temp_C),
        feelsLikeC:  parseInt(cur.FeelsLikeC),
        humidity:    parseInt(cur.humidity),
        desc:        cur.weatherDesc?.[0]?.value ?? '',
        maxTempC:    parseInt(fc[0]?.maxtempC ?? cur.temp_C),
        minTempC:    parseInt(fc[0]?.mintempC ?? cur.temp_C),
        forecast3:   fc.slice(1, 3).map(f => ({
          date:   f.date,
          maxC:   parseInt(f.maxtempC),
          desc:   f.hourly?.[4]?.weatherDesc?.[0]?.value ?? '',
        })),
      });
    } catch { /* skip on timeout / error */ }
  }));

  return results;
}

// ─── 2. Upcoming events / holidays (computed, no API needed) ─────────────────
const DIWALI_DATES = {
  2024: '2024-11-01', 2025: '2025-10-20',
  2026: '2026-11-08', 2027: '2027-10-29',
};
const HOLI_DATES = {
  2024: '2024-03-25', 2025: '2025-03-14',
  2026: '2026-03-03', 2027: '2027-03-22',
};

function getUpcomingEvents(today) {
  const yr    = today.getFullYear();
  const events = [];
  const push   = (e) => {
    const start = new Date(e.startDate);
    const end   = e.endDate ? new Date(e.endDate) : start;
    const daysUntil = daysBetween(today, start);
    const daysUntilEnd = daysBetween(today, end);
    if (daysUntilEnd >= -3 && daysUntil <= 60) {
      events.push({ ...e, daysUntil: Math.max(0, daysUntil), ongoing: daysUntil <= 0 });
    }
  };

  // ── Fixed-date annual events ────────────────────────────────────────────────
  const fixed = [
    // Holidays
    { name: 'Republic Day', type: 'holiday', startDate: `${yr}-01-26`,
      icon: '🇮🇳', categories: ['Gifting', 'Clothing'], impactPct: 25, urgency: 'medium', region: 'National' },
    { name: 'Valentine\'s Day', type: 'holiday', startDate: `${yr}-02-14`,
      icon: '💝', categories: ['Gifting', 'Accessories', 'Clothing'], impactPct: 55, urgency: 'high', region: 'National' },
    { name: 'Baisakhi / New Year', type: 'holiday', startDate: `${yr}-04-13`, endDate: `${yr}-04-14`,
      icon: '🌾', categories: ['Clothing', 'Gifting', 'Food & Beverages'], impactPct: 35, urgency: 'medium', region: 'North India' },
    { name: 'Good Friday', type: 'holiday', startDate: `${yr}-04-18`,
      icon: '✝️', categories: ['Gifting', 'Food & Beverages'], impactPct: 20, urgency: 'low', region: 'National' },
    { name: 'Independence Day', type: 'holiday', startDate: `${yr}-08-15`,
      icon: '🇮🇳', categories: ['Clothing', 'Electronics', 'Gifting'], impactPct: 30, urgency: 'medium', region: 'National' },
    { name: 'Raksha Bandhan', type: 'holiday', startDate: `${yr}-08-09`,
      icon: '🎀', categories: ['Gifting', 'Accessories', 'Clothing'], impactPct: 60, urgency: 'high', region: 'National' },
    { name: 'Onam / Harvest Festival', type: 'holiday', startDate: `${yr}-09-05`,
      icon: '🌸', categories: ['Clothing', 'Gifting', 'Food & Beverages'], impactPct: 45, urgency: 'medium', region: 'South India' },
    { name: 'Navratri / Garba Season', type: 'event', startDate: `${yr}-09-22`, endDate: `${yr}-10-02`,
      icon: '🪔', categories: ['Clothing', 'Accessories', 'Gifting'], impactPct: 50, urgency: 'high', region: 'West India' },
    { name: 'Dussehra', type: 'holiday', startDate: `${yr}-10-02`,
      icon: '🏹', categories: ['Clothing', 'Electronics', 'Gifting'], impactPct: 45, urgency: 'high', region: 'National' },
    { name: 'Dhanteras (Pre-Diwali)', type: 'holiday', startDate: `${yr}-10-28`,
      icon: '🪙', categories: ['Electronics', 'Furniture', 'Jewellery'], impactPct: 120, urgency: 'critical', region: 'National' },
    { name: 'Christmas', type: 'holiday', startDate: `${yr}-12-25`, endDate: `${yr}-12-31`,
      icon: '🎄', categories: ['Gifting', 'Electronics', 'Furniture', 'Clothing'], impactPct: 85, urgency: 'high', region: 'National' },
    { name: 'New Year\'s Eve', type: 'holiday', startDate: `${yr}-12-31`,
      icon: '🎆', categories: ['Electronics', 'Accessories', 'Clothing'], impactPct: 40, urgency: 'medium', region: 'National' },
    // Next year carry-forward
    { name: 'Republic Day', type: 'holiday', startDate: `${yr+1}-01-26`,
      icon: '🇮🇳', categories: ['Gifting', 'Clothing'], impactPct: 25, urgency: 'medium', region: 'National' },
  ];

  for (const e of fixed) push(e);

  // ── Variable-date annual events ─────────────────────────────────────────────
  const holi  = HOLI_DATES[yr]   || HOLI_DATES[yr-1];
  const diwali = DIWALI_DATES[yr] || DIWALI_DATES[yr-1];

  if (holi)   push({ name: 'Holi Festival', type: 'holiday', startDate: holi, icon: '🎨',
    categories: ['Clothing', 'Accessories', 'Gifting', 'Personal Care'], impactPct: 70, urgency: 'high', region: 'National' });
  if (diwali) push({ name: 'Diwali Festival', type: 'holiday', startDate: diwali, endDate: addDays(new Date(diwali), 5).toISOString().split('T')[0],
    icon: '🪔', categories: ['Electronics', 'Furniture', 'Gifting', 'Clothing', 'Lighting'], impactPct: 200, urgency: 'critical', region: 'National' });

  // ── Recurring seasonal / sports events ──────────────────────────────────────
  const month = today.getMonth(); // 0-indexed

  // IPL: ~Mar 22 – May 26
  if (month >= 2 && month <= 4) {
    push({ name: 'IPL Cricket Season', type: 'event', startDate: isoDate(today),
      endDate: `${yr}-05-26`, icon: '🏏',
      categories: ['Electronics', 'Accessories', 'Streaming Devices', 'Furniture'],
      impactPct: 35, urgency: 'high', region: 'National', ongoing: true });
  }
  // ICC Cricket World Cup: Oct-Nov (odd years)
  if (yr % 2 === 1 && (month === 9 || month === 10)) {
    push({ name: 'ICC Cricket World Cup', type: 'event', startDate: `${yr}-10-05`, endDate: `${yr}-11-19`,
      icon: '🏆', categories: ['Electronics', 'Accessories', 'Streaming Devices'],
      impactPct: 45, urgency: 'high', region: 'National' });
  }
  // Budget season: Feb 1
  if (month === 0 && today.getDate() <= 15) {
    push({ name: 'Union Budget Announcement', type: 'news', startDate: `${yr}-02-01`,
      icon: '📊', categories: ['Electronics', 'Furniture', 'All Categories'],
      impactPct: 20, urgency: 'medium', region: 'National' });
  }
  // GST revision season: Mar, Sep (typically)
  if ((month === 2 || month === 8) && today.getDate() <= 10) {
    push({ name: 'Expected GST Rate Revision', type: 'news', startDate: isoDate(today),
      icon: '📋', categories: ['Electronics', 'Furniture', 'All Categories'],
      impactPct: 15, urgency: 'medium', region: 'National' });
  }
  // Monsoon pre-stocking: June
  if (month === 5) {
    push({ name: 'Monsoon Pre-Stocking Window', type: 'season', startDate: isoDate(today),
      endDate: `${yr}-06-30`, icon: '🌧️',
      categories: ['Electronics', 'Furniture'],
      impactPct: -20, urgency: 'medium', region: 'Coastal Regions', impactDirection: 'down' });
  }
  // Summer cooling: Apr–Jun
  if (month >= 3 && month <= 5) {
    push({ name: 'Peak Summer — Cooling Demand', type: 'weather', startDate: isoDate(today),
      endDate: `${yr}-06-15`, icon: '🌡️',
      categories: ['Cooling & Fans', 'Electronics', 'Personal Care'],
      impactPct: 40, urgency: 'high', region: 'North India' });
  }
  // Back-to-school: Jun–Jul
  if (month >= 5 && month <= 6) {
    push({ name: 'Back-to-School Season', type: 'season', startDate: `${yr}-06-01`,
      endDate: `${yr}-07-20`, icon: '🎒',
      categories: ['Electronics', 'Furniture', 'Accessories', 'Stationery'],
      impactPct: 50, urgency: 'high', region: 'National' });
  }
  // Festive sale season run-up: Sep–Oct
  if (month >= 8 && month <= 9) {
    push({ name: 'Festive Sale Season (Big Billion / Great Indian)', type: 'event',
      startDate: `${yr}-10-01`, endDate: `${yr}-10-10`, icon: '🛍️',
      categories: ['Electronics', 'Furniture', 'Clothing', 'Accessories', 'Gifting'],
      impactPct: 150, urgency: 'critical', region: 'National' });
  }
  // Global chip supply concern (evergreen news signal)
  push({ name: 'Ongoing Global Supply Chain Volatility', type: 'news',
    startDate: isoDate(today), icon: '⚠️',
    categories: ['Electronics', 'Accessories'],
    impactPct: 15, urgency: 'medium', region: 'Global', impactDirection: 'up',
    description: 'Periodic supply chain disruptions continue to affect semiconductor availability. Pre-ordering buffer stock for electronics is advisable.' });

  return events
    .filter((e, i, arr) => arr.findIndex(x => x.name === e.name) === i)  // dedupe
    .sort((a, b) => a.daysUntil - b.daysUntil);
}

// ─── 3. AI correlation via Groq ───────────────────────────────────────────────
async function analyzeWithGroq(today, weatherData, events, categories) {
  const groq = getGroq();

  const weatherSummary = weatherData.length > 0
    ? weatherData.map(w =>
        `${w.city}: ${w.tempC}°C (feels ${w.feelsLikeC}°C), ${w.desc}, max today ${w.maxTempC}°C, humidity ${w.humidity}%`
      ).join('\n')
    : 'Weather data unavailable (using seasonal estimates)';

  const eventsText = events.slice(0, 12).map(e =>
    `- [${e.type.toUpperCase()}] ${e.icon} "${e.name}" — ${e.daysUntil === 0 ? 'ONGOING' : `in ${e.daysUntil} days`}` +
    ` | Region: ${e.region} | Base impact: +${e.impactPct}% on [${e.categories.join(', ')}]`
  ).join('\n');

  const prompt = `You are a senior demand planning AI for an Indian B2B inventory management system.

TODAY: ${isoDate(today)} (${today.toLocaleDateString('en-IN', { weekday: 'long', month: 'long' })})

CURRENT INVENTORY CATEGORIES: ${categories.join(', ')}

LIVE WEATHER (Indian cities):
${weatherSummary}

UPCOMING SIGNALS (next 60 days):
${eventsText}

TASK:
Analyze each signal and generate precise demand forecasts correlated to the actual inventory categories listed above.
Ignore signals for categories not present in the inventory.
Focus on signals within the next 30 days first.

Output ONLY this JSON (no extra text):
{
  "signals": [
    {
      "id": "<slug>",
      "type": "weather|event|news|holiday|season",
      "title": "<concise signal title>",
      "description": "<2 sentences: what's happening and why it affects demand>",
      "icon": "<single emoji>",
      "startDate": "<YYYY-MM-DD>",
      "endDate": "<YYYY-MM-DD or null>",
      "daysUntil": <integer, 0 = ongoing>,
      "region": "<affected region>",
      "affectedCategories": ["<only categories from the inventory list above>"],
      "impactDirection": "up|down|neutral",
      "impactPercent": <integer, e.g. 40 means +40% demand expected>,
      "confidence": <float 0.0-1.0>,
      "urgency": "critical|high|medium|low",
      "actionRequired": "<one actionable instruction for the inventory manager>",
      "recommendation": "<specific stocking/procurement recommendation with numbers if possible>"
    }
  ],
  "summary": "<2-sentence overall demand outlook for the next 30 days>",
  "hotCategories": ["<top 3 categories to watch>"],
  "riskCategories": ["<categories at risk of stockout due to demand spike>"]
}`;

  const response = await groq.chat.completions.create({
    model:           'llama-3.3-70b-versatile',
    temperature:     0.3,
    max_tokens:      3000,
    response_format: { type: 'json_object' },
    messages: [
      {
        role:    'system',
        content: 'You are an expert demand planning AI. You ALWAYS respond with a valid JSON object and NOTHING ELSE.',
      },
      { role: 'user', content: prompt },
    ],
  });

  let parsed;
  try { parsed = JSON.parse(response.choices[0]?.message?.content ?? '{}'); }
  catch { parsed = {}; }

  return {
    ...parsed,
    signals: (parsed.signals ?? []).slice(0, 15),   // cap at 15
    meta: {
      model:      response.model,
      tokensUsed: response.usage?.total_tokens ?? null,
    },
  };
}

// ─── GET /api/demand-signals ──────────────────────────────────────────────────
router.get('/', protect, async (req, res) => {
  try {
    const today    = new Date();
    const cacheKey = `${isoDate(today)}_signals`;

    const cached = getCached(cacheKey);
    if (cached) return res.json({ ...cached, source: 'cache' });

    // Parallel: weather fetch + category query
    const [weatherData, allItems] = await Promise.all([
      fetchWeather(),
      InventoryItem.distinct('category'),
    ]);

    const events     = getUpcomingEvents(today);
    const categories = allItems.length > 0 ? allItems : ['Electronics', 'Furniture', 'Accessories'];

    const aiResult   = await analyzeWithGroq(today, weatherData, events, categories);

    // Merge AI signals with pre-computed events (AI may filter/enhance them)
    // If AI returned no signals, fall back to computed events
    const signals = aiResult.signals?.length > 0
      ? aiResult.signals
      : events.slice(0, 10).map(e => ({
          id:               e.name.toLowerCase().replace(/\s+/g, '_'),
          type:             e.type,
          title:            e.name,
          description:      e.description ?? `${e.name} is expected to drive demand changes across ${e.categories.join(', ')}.`,
          icon:             e.icon,
          startDate:        e.startDate,
          endDate:          e.endDate ?? null,
          daysUntil:        e.daysUntil,
          region:           e.region,
          affectedCategories: e.categories,
          impactDirection:  e.impactDirection ?? 'up',
          impactPercent:    e.impactPct,
          confidence:       0.70,
          urgency:          e.urgency,
          actionRequired:   'Review stock levels for affected categories.',
          recommendation:   `Ensure adequate buffer stock for ${e.categories.join(' and ')} before ${e.name}.`,
        }));

    // Build calendar payload — 30 day timeline
    const calendar = [];
    for (let i = 0; i <= 30; i++) {
      const d = isoDate(addDays(today, i));
      const daySignals = signals.filter(s => {
        if (!s.startDate) return false;
        const start = new Date(s.startDate);
        const end   = s.endDate ? new Date(s.endDate) : start;
        const cur   = addDays(today, i);
        return cur >= start && cur <= end;
      });
      if (daySignals.length > 0) {
        calendar.push({ date: d, daysFromNow: i, signals: daySignals.map(s => ({ id: s.id, icon: s.icon, urgency: s.urgency, title: s.title })) });
      }
    }

    const payload = {
      signals,
      calendar,
      summary:         aiResult.summary ?? 'Demand signal analysis complete.',
      hotCategories:   aiResult.hotCategories  ?? [],
      riskCategories:  aiResult.riskCategories ?? [],
      weatherSnapshot: weatherData,
      generatedAt:     today.toISOString(),
      meta:            aiResult.meta ?? {},
    };

    setCache(cacheKey, payload);
    res.json({ ...payload, source: 'live' });

  } catch (err) {
    if (err.message?.includes('GROQ_API_KEY'))
      return res.status(503).json({ message: err.message });
    if (err.status === 429)
      return res.status(429).json({ message: 'Groq rate limit reached. Wait a moment and retry.' });
    res.status(500).json({ message: err.message });
  }
});

// ─── DELETE /api/demand-signals/cache ────────────────────────────────────────
router.delete('/cache', protect, (req, res) => {
  _cache.clear();
  res.json({ message: 'Demand signal cache cleared.' });
});

export default router;
