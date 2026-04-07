/**
 * Language Learning Server — Inworld Realtime API
 *
 * Uses @inworld/agents + @openai/agents/realtime for speech-to-speech.
 * Each WebSocket client gets a RealtimeSession that handles STT + LLM + TTS.
 */

import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';

import { serverConfig } from './config/server.js';
import { serverLogger as logger } from './utils/logger.js';
import { setupWebSocketHandlers } from './services/websocket-handler.js';
import { apiRouter } from './services/api-routes.js';

// Initialize Express and servers
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, maxPayload: 10 * 1024 * 1024 });

// Middleware
app.use(express.json({ limit: '1mb' }));
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : '*',
    methods: ['GET', 'POST', 'OPTIONS'],
  })
);

// API routes
app.use('/api', apiRouter);
app.get('/health', (_req, res) => {
  res
    .status(200)
    .json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Serve frontend static files when the build exists
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDistPath = path.join(__dirname, '../../frontend/dist');

if (fs.existsSync(path.join(frontendDistPath, 'index.html'))) {
  app.use(express.static(frontendDistPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(frontendDistPath, 'index.html'));
  });
}

// WebSocket handlers
setupWebSocketHandlers(wss);

// Server-side heartbeat: ping all clients every 30s, terminate unresponsive ones
const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    const ext = ws as typeof ws & { isAlive?: boolean };
    if (ext.isAlive === false) {
      logger.warn('terminating_unresponsive_ws_client');
      return ws.terminate();
    }
    ext.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('connection', (ws) => {
  const ext = ws as typeof ws & { isAlive?: boolean };
  ext.isAlive = true;
  ws.on('pong', () => {
    ext.isAlive = true;
  });
});

wss.on('close', () => {
  clearInterval(heartbeatInterval);
});

// Server startup
server.listen(serverConfig.port, () => {
  logger.info({ port: serverConfig.port }, 'server_started');
  logger.info('using_inworld_realtime_api');
});

// Graceful shutdown
function gracefulShutdown(signal: string) {
  logger.info({ signal }, 'shutdown_signal_received');
  clearInterval(heartbeatInterval);

  wss.clients.forEach((ws) => {
    ws.close(1001, 'Server shutting down');
  });

  server.close(() => {
    logger.info('server_closed');
    process.exit(0);
  });

  // Force exit after 10s
  setTimeout(() => {
    logger.warn('forced_shutdown');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
