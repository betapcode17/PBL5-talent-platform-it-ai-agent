import express from 'express';
import multer from 'multer';
import orchestrator from '../agents/orchestrator.js';
import conversationStore from '../services/conversationStore.js';
import pdfService from '../services/pdfService.js';
import backendClient from '../services/backendClient.js';

const router = express.Router();
const upload = multer({
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

function sseEvent(event, data) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

// Health check
router.get('/health', async (req, res) => {
  const backendHealth = await backendClient.getBackendHealth();
  res.json({
    status: 'ok',
    service: 'AI-agents Multi-Agent System',
    backend: backendHealth,
    timestamp: new Date().toISOString(),
  });
});

// Service info
router.get('/info', (req, res) => {
  res.json({
    version: '3.0.0-multi-agent',
    name: 'AI-agents (Node.js / Gemini)',
    engine: 'Google Gemini Multi-Agent System',
    groups: [
      'Nhóm A — Tìm kiếm việc làm',
      'Nhóm B — CV & Tư vấn nghề nghiệp',
      'Nhóm C — Hành động trên hệ thống',
      'Nhóm D — Hỏi đáp & Tra cứu Backend',
    ],
  });
});

// Text Chat Message
router.post('/message', async (req, res) => {
  try {
    const { message, conversationId, extraContext } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message cannot be empty.' });
    }

    const authToken = req.headers.authorization || null;

    // Resolve or create conversation ID
    let resolvedConvId = conversationId;
    if (!resolvedConvId) {
      const newConv = await conversationStore.createConversation(message.trim().substring(0, 50));
      resolvedConvId = newConv.id;
    } else {
      const existing = await conversationStore.getConversation(resolvedConvId);
      if (!existing) {
        const newConv = await conversationStore.createConversation(message.trim().substring(0, 50));
        resolvedConvId = newConv.id;
      }
    }

    // Save user message
    await conversationStore.addMessage({
      conversationId: resolvedConvId,
      role: 'user',
      content: message.trim(),
      messageType: 'user_query',
    });

    // Execute multi-agent orchestrator
    const result = await orchestrator.chat({
      userMessage: message.trim(),
      conversationId: resolvedConvId,
      extraContext: extraContext ? extraContext.trim() : null,
      authToken,
    });

    return res.json(result);
  } catch (err) {
    console.error('[Route /message] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Stream Chat Message (SSE)
router.post('/message/stream', async (req, res) => {
  try {
    const { message, conversationId, extraContext } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message cannot be empty.' });
    }

    const authToken = req.headers.authorization || null;

    // Resolve or create conversation
    let resolvedConvId = conversationId;
    if (!resolvedConvId) {
      const newConv = await conversationStore.createConversation(message.trim().substring(0, 50));
      resolvedConvId = newConv.id;
    }

    // Save user message
    await conversationStore.addMessage({
      conversationId: resolvedConvId,
      role: 'user',
      content: message.trim(),
      messageType: 'user_query',
    });

    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    res.write(sseEvent('conversation', { conversationId: resolvedConvId }));

    for await (const event of orchestrator.chatStream({
      userMessage: message.trim(),
      conversationId: resolvedConvId,
      extraContext,
      authToken,
    })) {
      if (event.type === 'status') {
        res.write(sseEvent('status', { stage: event.stage, message: event.message }));
      } else if (event.type === 'chunk') {
        res.write(sseEvent('chunk', { conversationId: resolvedConvId, delta: event.delta }));
      } else if (event.type === 'final') {
        res.write(sseEvent('status', { stage: 'formatting', message: 'Đang chuẩn hóa kết quả...' }));
        res.write(sseEvent('final', event.payload));
      }
    }

    res.end();
  } catch (err) {
    console.error('[Route /message/stream] Error:', err);
    res.write(sseEvent('error', { message: err.message }));
    res.end();
  }
});

// Query endpoint (backward compatibility alias)
router.post('/query', async (req, res) => {
  try {
    const { message, conversationId, extraContext } = req.body;
    let resolvedConvId = conversationId;
    if (!resolvedConvId) {
      const newConv = await conversationStore.createConversation(message ? message.substring(0, 50) : 'Test Query');
      resolvedConvId = newConv.id;
    }

    const result = await orchestrator.chat({
      userMessage: message || '',
      conversationId: resolvedConvId,
      extraContext,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Upload context PDF
router.post('/context/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    let filename = req.file.originalname || 'CV.pdf';
    try {
      const decoded = Buffer.from(filename, 'latin1').toString('utf8');
      if (!decoded.includes('\uFFFD') && /[ÃÂÁÀẢÃẠĂẮẰẲẴẶĐÉÈẺẼẸÊÍÌỈĨỊÓÒỎÕỌÔƠÚÙỦŨỤƯÝỲỶỸỴáàảãạăắằẳẵặâấầẩẫậđéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵ]/.test(filename)) {
        filename = decoded;
      }
    } catch (e) {}

    const text = await pdfService.extractText(req.file.buffer);
    return res.json({
      filename,
      characters: text.length,
      extractedContext: text.substring(0, 4000),
    });
  } catch (err) {
    console.error('[Route /context/upload] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
