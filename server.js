import express from 'express';
import cors from 'cors';
import config from './config/env.js';
import { initDb } from './services/conversationStore.js';
import chatRoutes from './routes/chatRoutes.js';
import conversationRoutes from './routes/conversationRoutes.js';
import cvRoutes from './routes/cvRoutes.js';

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Middleware
app.use(cors({
  origin: config.corsOrigin === '*' ? true : config.corsOrigin,
  credentials: true,
}));
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[AI-agents] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// Test UI Route
app.get(['/test', '/demo'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

// Root Route
app.get('/', (req, res) => {
  if (req.headers.accept && req.headers.accept.includes('text/html')) {
    return res.sendFile(path.join(__dirname, 'public/index.html'));
  }
  res.json({
    status: 'online',
    service: 'AI-agents Multi-Agent System',
    version: '3.0.0-multi-agent',
    uiUrl: `http://localhost:${config.port}/test`,
    description: 'AI Multi-Agent Recruitment Assistant powered by Node.js & Google Gemini',
    groups: {
      groupA: 'Nhóm A — Tìm kiếm việc làm',
      groupB: 'Nhóm B — CV & Tư vấn nghề nghiệp',
      groupC: 'Nhóm C — Hành động trên hệ thống',
      groupD: 'Nhóm D — Hỏi đáp & Tra cứu Backend',
    },
    endpoints: [
      'POST /chatbot/message',
      'POST /chatbot/message/stream',
      'GET /chatbot/conversation',
      'GET /chatbot/conversation/:id/message',
      'POST /cv/analyze',
      'POST /cv/match-jd',
      'GET /chatbot/health',
    ],
  });
});

// Mount Routes
app.use('/chatbot', chatRoutes);
app.use('/chatbot', conversationRoutes);
app.use('/cv', cvRoutes);

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
});

// Error Handler
app.use((err, req, res, next) => {
  console.error('[AI-agents] Unhandled Error:', err);
  res.status(500).json({ error: err.message || 'Internal Server Error' });
});

// Start Server
async function startServer() {
  const primaryPort = config.port; // 8000
  const compatPort = 8001; // Compatible with React Frontend VITE_AI_API_URL

  const server1 = app.listen(primaryPort, () => {
    console.log('====================================================');
    console.log(`🚀 [AI-agents] Multi-Agent Server running on port ${primaryPort}`);
    console.log(`📡 Backend API: ${config.backendApiUrl}`);
    console.log(`🤖 Gemini Model: ${config.geminiModel}`);
    console.log(`🌐 Test UI available at: http://localhost:${primaryPort}/test`);
    console.log(`🌐 Health endpoint: http://localhost:${primaryPort}/chatbot/health`);
  });

  let server2 = null;
  if (primaryPort !== compatPort) {
    server2 = app.listen(compatPort, () => {
      console.log(`🚀 [AI-agents] Also listening on port ${compatPort} (React Frontend compatibility)`);
      console.log('====================================================');
    }).on('error', (err) => {
      console.warn(`[AI-agents] Compatibility port ${compatPort} notice:`, err.message);
    });
  }

  // Connect to Database in background without blocking server
  initDb().catch((err) => {
    console.warn('[ConversationStore] Background DB init warning:', err.message);
  });

  // Graceful shutdown
  const shutdown = () => {
    console.log('\n[AI-agents] Shutting down gracefully...');
    server1.close(() => {
      if (server2) {
        server2.close(() => {
          console.log('[AI-agents] All servers closed.');
          process.exit(0);
        });
      } else {
        console.log('[AI-agents] Server closed.');
        process.exit(0);
      }
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

startServer().catch((err) => {
  console.error('[AI-agents] Fatal error during startup:', err);
  process.exit(1);
});
