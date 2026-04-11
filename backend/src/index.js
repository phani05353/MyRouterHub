'use strict';

// Load .env from repo root when running locally (no-op if already set via Docker env_file)
require('dotenv').config({ path: require('path').join(__dirname, '../../.env'), override: false });

const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const Poller = require('./poller');
const devicesRouter = require('./routes/devices');
const debugRouter  = require('./routes/debug');

const PORT = process.env.PORT || 3001;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';
const IS_PROD = process.env.NODE_ENV === 'production';

// ─── Express setup ───────────────────────────────────────────────────────────

const app = express();

// In production the frontend is served from /public — no CORS needed.
// In dev the Vite dev server runs separately and needs CORS.
if (!IS_PROD) {
  app.use(cors({ origin: [FRONTEND_ORIGIN, 'http://localhost:4173'] }));
}
app.use(express.json());

app.use('/api/devices', devicesRouter);
app.use('/api/debug',  debugRouter);

app.get('/api/status', (req, res) => {
  res.json({
    routerIp: process.env.ROUTER_IP || '192.168.50.1',
    connected: poller ? poller.connected : false,
    error: poller ? poller.lastError : null,
  });
});

// In production serve the Vite-built frontend as static files
const STATIC_DIR = path.join(__dirname, '..', 'public');
if (IS_PROD && fs.existsSync(STATIC_DIR)) {
  app.use(express.static(STATIC_DIR));
  // SPA fallback — any non-API route returns index.html
  app.get('*', (req, res) => {
    res.sendFile(path.join(STATIC_DIR, 'index.html'));
  });
}

// ─── Socket.io ───────────────────────────────────────────────────────────────

const server = http.createServer(app);
const io = new Server(server, {
  cors: IS_PROD ? {} : { origin: [FRONTEND_ORIGIN, 'http://localhost:4173'] },
});

let poller = null;

function startPoller() {
  if (poller) poller.stop();

  const config = {
    ip: process.env.ROUTER_IP || '192.168.50.1',
    username: process.env.ROUTER_USER || 'admin',
    password: process.env.ROUTER_PASS || 'admin',
    protocol: process.env.ROUTER_PROTOCOL || 'http',
  };

  poller = new Poller(config, (event, data) => {
    io.emit(event, data);
  });

  poller.start();
  console.log(`[poller] Started → ${config.protocol}://${config.ip} as ${config.username}`);
}

io.on('connection', (socket) => {
  console.log('[ws] client connected:', socket.id);

  if (poller) {
    socket.emit('status', { connected: poller.connected, error: poller.lastError });
  }

  socket.on('disconnect', () => {
    console.log('[ws] client disconnected:', socket.id);
  });
});

// ─── Boot ─────────────────────────────────────────────────────────────────────

server.listen(PORT, () => {
  console.log(`[server] RouterHub backend listening on port ${PORT} (${IS_PROD ? 'production' : 'development'})`);
  startPoller();
});

process.on('SIGTERM', () => { if (poller) poller.stop(); process.exit(0); });
process.on('SIGINT',  () => { if (poller) poller.stop(); process.exit(0); });
