/**
 * POST /api/orders/extract
 *
 * Accepts raw text (email / WhatsApp message / any prose) and uses
 * Llama 3.3-70B (JSON mode) to extract a structured order draft:
 *  - customer name
 *  - line items (matched to real SKUs via fuzzy name search)
 *  - estimated total
 *  - requested date
 *  - urgency flag
 *
 * Returns the draft order ready for the frontend to pre-fill the form.
 */

import express       from 'express';
import Groq          from 'groq-sdk';
import InventoryItem from '../models/InventoryItem.js';
import { protect }   from '../middleware/auth.js';

const router = express.Router();

let _groq = null;
function getGroq() {
  if (_groq) return _groq;
  if (!process.env.GROQ_API_KEY)
    throw new Error('GROQ_API_KEY not set.');
  _groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return _groq;
}

// ─── POST /api/orders/extract ─────────────────────────────────────────────────
router.post('/extract', protect, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text?.trim())
      return res.status(400).json({ message: 'text is required.' });
    if (text.length > 8000)
      return res.status(400).json({ message: 'Text too long (max 8000 chars).' });

    // Load all products so the AI can match names → SKUs & prices
    const products = await InventoryItem.find({}, 'name sku category price quantity');
    const productList = products.map(p =>
      `- ${p.name} (SKU: ${p.sku}, Category: ${p.category}, Price: $${p.price}, In stock: ${p.quantity})`
    ).join('\n');

    const groq = getGroq();

    const systemPrompt = `You are an order extraction assistant for a warehouse management system.
Extract order details from the given message and match product names to the inventory list provided.
You ALWAYS respond with a valid JSON object and NOTHING ELSE.`;

    const userPrompt = `AVAILABLE INVENTORY:
${productList}

MESSAGE TO EXTRACT ORDER FROM:
"""
${text}
"""

Extract the order details and respond with ONLY this JSON:
{
  "customer": "<customer/company name, or 'Unknown' if not found>",
  "requestedDate": "<ISO date string YYYY-MM-DD if mentioned, or null>",
  "isUrgent": <true if words like urgent, ASAP, rush, emergency, critical appear>,
  "notes": "<any special instructions or context worth noting>",
  "items": [
    {
      "rawName": "<product name as written in the message>",
      "matchedName": "<best matching product name from inventory list, or null if no match>",
      "matchedSku": "<SKU of matched product, or null>",
      "matchedPrice": <price of matched product as number, or null>,
      "quantity": <requested quantity as integer, or 1 if not specified>
    }
  ],
  "confidence": <overall confidence 0.0-1.0 that this is a valid order request>,
  "extractionNotes": "<brief note about what you were uncertain about>"
}`;

    const response = await groq.chat.completions.create({
      model:           'llama-3.3-70b-versatile',
      temperature:     0,
      max_tokens:      1500,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt   },
      ],
    });

    let extracted;
    try {
      extracted = JSON.parse(response.choices[0]?.message?.content ?? '{}');
    } catch {
      return res.status(500).json({ message: 'AI response could not be parsed. Try again.' });
    }

    // Calculate estimated total from matched items
    const items = (extracted.items ?? []).map(item => ({
      ...item,
      subtotal: item.matchedPrice != null ? +(item.matchedPrice * (item.quantity ?? 1)).toFixed(2) : null,
    }));

    const estimatedTotal = items
      .filter(i => i.subtotal != null)
      .reduce((s, i) => s + i.subtotal, 0);

    res.json({
      customer:       extracted.customer       ?? 'Unknown',
      requestedDate:  extracted.requestedDate  ?? null,
      isUrgent:       extracted.isUrgent       ?? false,
      notes:          extracted.notes          ?? '',
      items,
      estimatedTotal: +estimatedTotal.toFixed(2),
      confidence:     extracted.confidence     ?? null,
      extractionNotes: extracted.extractionNotes ?? '',
      meta: {
        model:       response.model,
        tokensUsed:  response.usage?.total_tokens ?? null,
        extractedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    if (err.message?.includes('GROQ_API_KEY'))
      return res.status(503).json({ message: err.message });
    if (err.status === 429)
      return res.status(429).json({ message: 'Groq rate limit reached. Wait a moment and retry.' });
    res.status(500).json({ message: err.message });
  }
});

export default router;
