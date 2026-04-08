/**
 * POST /api/voice/transcribe   — Groq Whisper STT (audio → text)
 * POST /api/voice/execute      — Llama 3.3 70B function calling (text → action → result)
 */

import express  from 'express';
import multer   from 'multer';
import Groq     from 'groq-sdk';
import fs       from 'fs';
import path     from 'path';
import os       from 'os';
import InventoryItem from '../models/InventoryItem.js';
import Order         from '../models/Order.js';
import { protect }   from '../middleware/auth.js';

const router = express.Router();

// ─── Multer for audio ─────────────────────────────────────────────────────────
const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 25 * 1024 * 1024 },   // 25 MB (Whisper limit)
  fileFilter: (_req, file, cb) => {
    const allowed = ['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg',
                     'audio/wav', 'audio/flac', 'audio/x-m4a', 'audio/mp3'];
    if (allowed.includes(file.mimetype) || file.originalname.match(/\.(webm|mp4|mp3|ogg|wav|flac|m4a)$/i))
      return cb(null, true);
    cb(new Error('Unsupported audio format. Use webm, mp3, wav, or ogg.'));
  },
});

// ─── Groq client ─────────────────────────────────────────────────────────────
let _groq = null;
function getGroq() {
  if (_groq) return _groq;
  if (!process.env.GROQ_API_KEY)
    throw new Error('GROQ_API_KEY not set.');
  _groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return _groq;
}

// ─── Tool definitions for Llama function calling ─────────────────────────────
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_inventory_levels',
      description: 'Get current stock levels for all products or a specific product. Use for questions like "how much stock do we have", "what is the quantity of X".',
      parameters: {
        type: 'object',
        properties: {
          productName: { type: 'string', description: 'Optional product name to filter by (partial match OK). Omit to get all.' },
          category:    { type: 'string', description: 'Optional category filter (Electronics, Furniture, Accessories, etc.).' },
          lowStockOnly: { type: 'boolean', description: 'If true, return only items with low or critical stock status.' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_low_stock_alerts',
      description: 'Get products that are at or below their reorder level. Use for "what is running low", "low stock alerts", "what needs reordering".',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Maximum number of items to return (default 10).' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_recent_orders',
      description: 'Get recent orders, optionally filtered by status. Use for "show recent orders", "pending orders", "what orders are processing".',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['pending', 'processing', 'completed', 'cancelled', 'all'], description: 'Filter by order status.' },
          limit:  { type: 'number', description: 'Number of orders to return (default 5).' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_inventory_summary',
      description: 'Get a high-level summary: total products, total value, category breakdown, critical items. Use for "summarize inventory", "give me an overview", "dashboard summary".',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_product',
      description: 'Search for a specific product by name or SKU and return its details.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Product name or SKU to search for.' },
        },
        required: ['query'],
      },
    },
  },
];

// ─── Tool executors ───────────────────────────────────────────────────────────
async function executeTool(name, args) {
  switch (name) {
    case 'get_inventory_levels': {
      let query = {};
      if (args.productName) query.name = { $regex: args.productName, $options: 'i' };
      if (args.category)    query.category = { $regex: args.category, $options: 'i' };
      if (args.lowStockOnly) query.status = { $in: ['low', 'medium'] };

      const items = await InventoryItem.find(query).sort({ quantity: 1 }).limit(20);
      if (items.length === 0) return { found: 0, message: 'No products matched the filter.' };

      return {
        found: items.length,
        items: items.map(i => ({
          name: i.name, sku: i.sku, category: i.category,
          quantity: i.quantity, reorderLevel: i.reorderLevel,
          status: i.status, price: i.price,
        })),
      };
    }

    case 'get_low_stock_alerts': {
      const limit = args.limit ?? 10;
      const items = await InventoryItem.find({ status: { $in: ['low', 'medium'] } })
        .sort({ quantity: 1 })
        .limit(limit);

      return {
        count: items.length,
        alerts: items.map(i => ({
          name: i.name, sku: i.sku, category: i.category,
          quantity: i.quantity, reorderLevel: i.reorderLevel, status: i.status,
        })),
      };
    }

    case 'get_recent_orders': {
      const limit  = args.limit ?? 5;
      const status = args.status;
      let query = {};
      if (status && status !== 'all') query.status = status;

      const orders = await Order.find(query).sort({ date: -1 }).limit(limit);
      return {
        count: orders.length,
        orders: orders.map(o => ({
          orderId: o.orderId, customer: o.customer,
          total: o.total, status: o.status, progress: o.progress,
          itemCount: o.items?.length ?? 0, date: o.date,
        })),
      };
    }

    case 'get_inventory_summary': {
      const all = await InventoryItem.find();
      const totalValue = all.reduce((s, i) => s + i.quantity * i.price, 0);
      const byCategory = {};
      const byStatus   = { healthy: 0, medium: 0, low: 0 };

      for (const i of all) {
        byCategory[i.category] = (byCategory[i.category] ?? 0) + 1;
        if (byStatus[i.status] !== undefined) byStatus[i.status]++;
      }

      const totalOrders = await Order.countDocuments();
      const activeOrders = await Order.countDocuments({ status: { $in: ['pending', 'processing'] } });

      return {
        totalProducts: all.length,
        totalInventoryValue: +totalValue.toFixed(2),
        categoryBreakdown: byCategory,
        stockStatus: byStatus,
        totalOrders, activeOrders,
        criticalItems: all.filter(i => i.status === 'low').slice(0, 5).map(i => i.name),
      };
    }

    case 'search_product': {
      const query = args.query;
      const item  = await InventoryItem.findOne({
        $or: [
          { name: { $regex: query, $options: 'i' } },
          { sku:  { $regex: query, $options: 'i' } },
        ],
      });
      if (!item) return { found: false, message: `No product found matching "${query}".` };
      return {
        found: true,
        product: {
          id: item._id, name: item.name, sku: item.sku, category: item.category,
          quantity: item.quantity, reorderLevel: item.reorderLevel,
          price: item.price, status: item.status,
          updatedAt: item.updatedAt,
        },
      };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ─── POST /api/voice/transcribe ───────────────────────────────────────────────
router.post(
  '/transcribe',
  protect,
  (req, res, next) => {
    audioUpload.single('audio')(req, res, (err) => {
      if (err instanceof multer.MulterError)
        return res.status(400).json({ message: `Upload error: ${err.message}` });
      if (err) return res.status(400).json({ message: err.message });
      next();
    });
  },
  async (req, res) => {
    try {
      if (!req.file)
        return res.status(400).json({ message: 'No audio file received.' });

      const groq = getGroq();

      // Groq Whisper requires a File-like object — write to a temp file
      const tmpDir  = os.tmpdir();
      const ext     = req.file.originalname?.split('.').pop() || 'webm';
      const tmpPath = path.join(tmpDir, `voice_${Date.now()}.${ext}`);
      fs.writeFileSync(tmpPath, req.file.buffer);

      let transcript;
      try {
        const response = await groq.audio.transcriptions.create({
          file:     fs.createReadStream(tmpPath),
          model:    'whisper-large-v3-turbo',
          language: 'en',
          response_format: 'json',
        });
        transcript = response.text;
      } finally {
        try { fs.unlinkSync(tmpPath); } catch {}
      }

      res.json({ transcript: transcript?.trim() ?? '' });
    } catch (err) {
      if (err.message?.includes('GROQ_API_KEY'))
        return res.status(503).json({ message: err.message });
      if (err.status === 429)
        return res.status(429).json({ message: 'Groq rate limit reached. Wait a moment and retry.' });
      res.status(500).json({ message: err.message });
    }
  }
);

// ─── POST /api/voice/execute ──────────────────────────────────────────────────
router.post('/execute', protect, async (req, res) => {
  try {
    const { transcript } = req.body;
    if (!transcript?.trim())
      return res.status(400).json({ message: 'transcript is required.' });

    const groq = getGroq();

    // Round 1: ask Llama to call a tool
    const messages = [
      {
        role:    'system',
        content: `You are Inventra AI, a voice assistant for a warehouse inventory management system.
When the user speaks a command, call the most appropriate function to retrieve data.
Always call a function — never answer without calling one first.
Be concise and conversational in your final reply (2-3 sentences max).`,
      },
      { role: 'user', content: transcript },
    ];

    const round1 = await groq.chat.completions.create({
      model:       'llama-3.3-70b-versatile',
      temperature: 0.2,
      max_tokens:  1024,
      tools:       TOOLS,
      tool_choice: 'auto',
      messages,
    });

    const choice    = round1.choices[0];
    const toolCalls = choice.message?.tool_calls;

    // If no tool was called, return text directly
    if (!toolCalls || toolCalls.length === 0) {
      return res.json({
        transcript,
        toolCalled:  null,
        toolResult:  null,
        reply:       choice.message?.content ?? "I couldn't understand that command. Please try again.",
      });
    }

    // Execute the tool
    const toolCall   = toolCalls[0];
    const toolName   = toolCall.function.name;
    let   toolArgs   = {};
    try { toolArgs = JSON.parse(toolCall.function.arguments ?? '{}'); } catch {}

    const toolResult = await executeTool(toolName, toolArgs);

    // Round 2: feed tool result back → get natural language reply
    messages.push(choice.message);
    messages.push({
      role:        'tool',
      tool_call_id: toolCall.id,
      content:     JSON.stringify(toolResult),
    });

    const round2 = await groq.chat.completions.create({
      model:       'llama-3.3-70b-versatile',
      temperature: 0.4,
      max_tokens:  256,
      messages,
    });

    const reply = round2.choices[0]?.message?.content ?? 'Done.';

    res.json({ transcript, toolCalled: toolName, toolArgs, toolResult, reply });
  } catch (err) {
    if (err.message?.includes('GROQ_API_KEY'))
      return res.status(503).json({ message: err.message });
    if (err.status === 429)
      return res.status(429).json({ message: 'Groq rate limit reached. Wait a moment and retry.' });
    res.status(500).json({ message: err.message });
  }
});

export default router;
