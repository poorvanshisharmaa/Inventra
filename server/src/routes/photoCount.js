/**
 * POST /api/photo-count
 *
 * Accepts a shelf photo + productId + distributorId.
 * Sends image to Llama 4 Scout Vision (Groq free tier) → counts units →
 * compares with MongoDB stock → returns structured discrepancy report.
 *
 * Key design decisions:
 *  - response_format: json_object  → forces Llama to output valid JSON only
 *  - temperature: 0                → deterministic, repeatable counts
 *  - system message                → sets authoritative auditor role
 *  - chain-of-thought prompt       → guides systematic row-by-row counting
 *  - extractJSON()                 → multi-strategy fallback parser
 */

import express  from 'express';
import multer   from 'multer';
import Groq     from 'groq-sdk';
import mongoose from 'mongoose';
import InventoryItem from '../models/InventoryItem.js';
import { protect }   from '../middleware/auth.js';

const router = express.Router();

// ─── Multer ───────────────────────────────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 },   // 10 MB cap
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg','image/png','image/webp','image/gif'].includes(file.mimetype))
      return cb(null, true);
    cb(new Error('Only JPEG, PNG or WebP images are supported.'));
  },
});

// ─── Groq client ─────────────────────────────────────────────────────────────
const GROQ_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';

let _groq = null;
function getGroq() {
  if (_groq) return _groq;
  if (!process.env.GROQ_API_KEY)
    throw new Error('GROQ_API_KEY not set. Free key at console.groq.com/keys');
  _groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return _groq;
}

const REGION_COUNT = 4;

// ─── Robust JSON extractor ────────────────────────────────────────────────────
// Llama sometimes wraps JSON in text/markdown despite instructions.
// This tries four progressively lenient strategies before giving up.
function extractJSON(raw) {
  const s = raw.trim();

  // Strategy 1: entire string is valid JSON
  try { return JSON.parse(s); } catch {}

  // Strategy 2: strip ```json … ``` or ``` … ``` fences
  const fenceMatch = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    try { return JSON.parse(fenceMatch[1].trim()); } catch {}
  }

  // Strategy 3: extract outermost { … } block
  const braceMatch = s.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    try { return JSON.parse(braceMatch[0]); } catch {}
  }

  // Strategy 4: find first { and last } even if surrounding noise
  const first = s.indexOf('{');
  const last  = s.lastIndexOf('}');
  if (first !== -1 && last > first) {
    try { return JSON.parse(s.slice(first, last + 1)); } catch {}
  }

  return null;   // all strategies failed
}

// ─── Prompts ──────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are an expert warehouse inventory auditor.
Your ONLY job is to count product units visible in shelf photos.
You ALWAYS respond with a valid JSON object and NOTHING ELSE — no preamble, no explanation, no markdown.`;

function buildUserPrompt(name, sku, category) {
  return `Carefully examine this warehouse shelf photo and count the inventory.

TARGET PRODUCT: "${name}" (SKU: ${sku}, Category: ${category})

COUNTING STEPS — follow in order:
1. SCAN the full image. Note how many shelf levels/rows are visible.
2. SECTION the image (e.g. top shelf, bottom shelf; or left/right halves).
3. COUNT each section separately, left-to-right within each row.
4. FACTOR IN depth: if you can see items behind the front row, estimate how many layers deep.
5. SUM all section counts for the final total.

IDENTIFICATION RULE:
If you cannot clearly identify "${name}" by its exact packaging, count ALL products
of the same shape/size category on the shelf and note this in "notes".

OUTPUT RULES:
- Be conservative: when uncertain between N or N+2, use N.
- Set confidence = 0.3 if you are guessing; 0.7 if reasonably sure; 0.95 if certain.
- "sectionCounts" must show your working, e.g. "Top row: 6, Bottom row: 8 = 14"

Respond with ONLY this JSON object — no other text:
{
  "sectionCounts": "<row-by-row breakdown>",
  "counted": <final integer, or null if truly unidentifiable>,
  "confidence": <float 0.0–1.0>,
  "countingMethod": "<one sentence summary of method>",
  "shelfCondition": "<organized|messy|partial_view|empty>",
  "productVisible": <true|false>,
  "notes": "<packaging observations, stacking, mixed SKUs, etc.>"
}`;
}

// ─── Discrepancy classifier ───────────────────────────────────────────────────
function classify(counted, systemCount, daysSinceUpdate) {
  if (counted === null) {
    return {
      severity:      'unknown',
      alertMessage:  'Product could not be identified in the photo.',
      recommendation:'Retake the photo with better lighting, closer framing, and ensure the product label is visible.',
    };
  }

  const diff    = counted - systemCount;
  const diffPct = systemCount > 0 ? +((diff / systemCount) * 100).toFixed(1) : null;
  const absPct  = diffPct !== null ? Math.abs(diffPct) : 0;

  if (absPct >= 20) return {
    severity:      'critical',
    alertMessage:  `${Math.abs(diff)} units ${diff < 0 ? 'unaccounted for' : 'over system count'} — ${absPct}% variance.`,
    recommendation:'Initiate a formal stock audit immediately. Check for theft, unreported transfers, or data entry errors.',
  };
  if (absPct >= 10) return {
    severity:      'high',
    alertMessage:  `Significant discrepancy of ${diffPct}% — ${Math.abs(diff)} units difference.`,
    recommendation:`Schedule a physical stock count. Last system update: ${daysSinceUpdate} day(s) ago.`,
  };
  if (absPct >= 5) return {
    severity:      'medium',
    alertMessage:  `Minor discrepancy of ${diffPct}% noted.`,
    recommendation:'Monitor over the next cycle. Could be in-transit or pending data entry.',
  };
  return {
    severity:      'ok',
    alertMessage:  `Count within acceptable tolerance (±${absPct}%).`,
    recommendation:'No action needed.',
  };
}

// ─── POST /api/photo-count ────────────────────────────────────────────────────
router.post(
  '/',
  protect,
  (req, res, next) => {
    upload.single('image')(req, res, (err) => {
      if (err instanceof multer.MulterError)
        return res.status(400).json({ message: `Upload error: ${err.message}` });
      if (err)
        return res.status(400).json({ message: err.message });
      next();
    });
  },
  async (req, res) => {
    try {
      const { productId, distributorId, distributorName } = req.body;

      if (!req.file)
        return res.status(400).json({ message: 'No image file received.' });
      if (!productId)
        return res.status(400).json({ message: 'productId is required.' });
      if (!mongoose.Types.ObjectId.isValid(productId))
        return res.status(400).json({ message: 'Invalid productId.' });

      const product = await InventoryItem.findById(productId);
      if (!product)
        return res.status(404).json({ message: 'Product not found.' });

      const systemCount      = distributorId
        ? Math.round(product.quantity / REGION_COUNT)
        : product.quantity;
      const daysSinceUpdate  = Math.floor(
        (Date.now() - new Date(product.updatedAt).getTime()) / 86_400_000
      );

      // ── Send to Groq ──────────────────────────────────────────────────────────
      const base64   = req.file.buffer.toString('base64');
      const mimeType = req.file.mimetype;
      const groq     = getGroq();

      const response = await groq.chat.completions.create({
        model:           GROQ_MODEL,
        temperature:     0,          // deterministic counts
        max_tokens:      600,
        response_format: { type: 'json_object' },   // force valid JSON output
        messages: [
          {
            role:    'system',
            content: SYSTEM_PROMPT,
          },
          {
            role: 'user',
            content: [
              {
                type:      'image_url',
                image_url: { url: `data:${mimeType};base64,${base64}` },
              },
              {
                type: 'text',
                text: buildUserPrompt(product.name, product.sku, product.category),
              },
            ],
          },
        ],
      });

      // ── Parse response ────────────────────────────────────────────────────────
      const raw      = (response.choices[0]?.message?.content ?? '').trim();
      const aiResult = extractJSON(raw);

      if (!aiResult) {
        return res.status(500).json({
          message: 'AI response could not be parsed as JSON. Try again with a clearer photo.',
          rawResponse: raw,
        });
      }

      const counted = typeof aiResult.counted === 'number' ? Math.round(aiResult.counted) : null;
      const diff    = counted !== null ? counted - systemCount : null;
      const diffPct = diff !== null && systemCount > 0
        ? +((diff / systemCount) * 100).toFixed(1)
        : null;

      const { severity, alertMessage, recommendation } = classify(counted, systemCount, daysSinceUpdate);

      res.json({
        product: {
          id:       product._id,
          name:     product.name,
          sku:      product.sku,
          category: product.category,
          status:   product.status,
        },
        location: {
          distributorId:   distributorId   || 'all',
          distributorName: distributorName || 'All Regions',
        },
        systemCount,
        aiAnalysis: {
          counted,
          sectionCounts:  aiResult.sectionCounts   ?? '',
          confidence:     aiResult.confidence       ?? null,
          countingMethod: aiResult.countingMethod   ?? '',
          shelfCondition: aiResult.shelfCondition   ?? 'unknown',
          productVisible: aiResult.productVisible   ?? (counted !== null),
          notes:          aiResult.notes            ?? '',
        },
        discrepancy: {
          units:         diff,
          percentage:    diffPct,
          severity,
          alertMessage,
          recommendation,
        },
        meta: {
          daysSinceLastUpdate: daysSinceUpdate,
          lastUpdated:         product.updatedAt,
          model:               response.model,
          tokensUsed:          response.usage?.total_tokens ?? null,
          analyzedAt:          new Date().toISOString(),
        },
      });

    } catch (err) {
      if (err.message?.includes('GROQ_API_KEY'))
        return res.status(503).json({ message: err.message });
      if (err.status === 429)
        return res.status(429).json({ message: 'Groq rate limit reached. Wait a moment and retry.' });
      res.status(500).json({ message: err.message });
    }
  }
);

export default router;
