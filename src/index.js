  const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const crypto = require('crypto');
const axios = require('axios');
require('dotenv').config();

const app = express();
const express = require('express');
const jwt = require('jsonwebtoken');
const app = express();

// ===== MIDDLEWARE =====
app.use(express.json());
app.use(cors());

// ===== AUTH MIDDLEWARE =====
const auth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  console.log('Auth header:', authHeader); // LOG
  
  if (!authHeader) {
    console.log('No auth header provided'); // LOG
    return res.status(401).json({ error: 'Unauthorized - No token' });
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    console.log('No token in header'); // LOG
    return res.status(401).json({ error: 'Unauthorized - Invalid format' });
  }

  try {
    const secret = process.env.JWT_SECRET || 'secret';
    console.log('Verifying token with secret:', secret.substring(0, 5) + '...'); // LOG
    
    const decoded = jwt.verify(token, secret);
    console.log('Token verified:', decoded); // LOG
    req.user = decoded;
    next();
  } catch (error) {
    console.error('Token verification failed:', error.message); // LOG
    res.status(401).json({ error: 'Unauthorized - Invalid token' });
  }
};

// ===== LOGIN ENDPOINT =====
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const secret = process.env.JWT_SECRET || 'secret';

  console.log('Login attempt:', username); // LOG

  if (username === 'ACG01' && password === '1084056653573147904098') {
    const token = jwt.sign({ username: 'ACG01', role: 'admin' }, secret, { expiresIn: '24h' });
    console.log('Admin login successful'); // LOG
    return res.json({ success: true, token });
  }

  if (username === 'guest') {
    const token = jwt.sign({ username: 'guest', role: 'guest' }, secret, { expiresIn: '24h' });
    console.log('Guest login successful'); // LOG
    return res.json({ success: true, token });
  }

  console.log('Invalid credentials'); // LOG
  res.json({ success: false, error: 'Invalid credentials' });
});

// ===== PROTECTED ENDPOINTS =====
app.get('/api/metrics', auth, (req, res) => {
  console.log('Metrics requested by:', req.user.username); // LOG
  res.json({
    success: true,
    currentCapital: 50.00,
    totalPnL: 0,
    totalTrades: 0,
    totalROI: 0,
  });
});

app.post('/api/wallet/connect', auth, (req, res) => {
  const { publicKey } = req.body;
  console.log('Wallet connect:', publicKey); // LOG

  if (!publicKey) {
    return res.status(400).json({ error: 'Public key required' });
  }

  try {
    res.json({
      success: true,
      message: 'Wallet connected',
      publicKey,
    });
  } catch (error) {
    res.json({
      success: false,
      error: error.message,
    });
  }
});

app.post('/api/wallet/balance', auth, async (req, res) => {
  const { publicKey } = req.body;
  console.log('Balance requested for:', publicKey); // LOG

  if (!publicKey) {
    return res.status(400).json({ error: 'Public key required' });
  }

  try {
    const heliusKey = process.env.HELIUS_API_KEY;
    if (!heliusKey) {
      console.log('Helius key missing'); // LOG
      return res.json({ success: false, error: 'Helius API key not configured' });
    }

    // Simular balance por ahora
    res.json({
      success: true,
      balance: {
        SOL: 0.5,
        solPrice: 180,
        totalValue: 90,
      },
    });
  } catch (error) {
    console.error('Balance error:', error.message); // LOG
    res.json({
      success: false,
      error: error.message,
    });
  }
});

app.post('/api/rpc/test', auth, async (req, res) => {
  const { rpc } = req.body;
  console.log('RPC test:', rpc); // LOG

  try {
    const startTime = Date.now();
    const latency = Date.now() - startTime;

    res.json({
      success: true,
      rpc,
      latency,
      status: 'online',
    });
  } catch (error) {
    console.error('RPC test error:', error.message); // LOG
    res.json({ success: false, error: error.message });
  }
});

// ===== START SERVER =====
const PORT = process.env.PORT || 3001;
const server = require('http').createServer(app);
const io = require('socket.io')(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

io.on('connection', (socket) => {
  console.log('User connected');
  socket.emit('initial-data', { message: 'Connected' });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('JWT_SECRET:', process.env.JWT_SECRET ? 'SET' : 'NOT SET');
});
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cors());
app.use(express.static('public'));

// Global State
const appState = {
  tradingMode: 'PAPER',
  isKilled: false,
  portfolioLoss: 0,
  crashScore: 0,
  
  database: {
    trades: [],
    metrics: {
      currentCapital: 50,
      initialCapital: 50,
      totalPnL: 0,
      totalROI: 0,
      totalTrades: 0,
      winCount: 0,
      winRate: 0,
    },
  },
};

// Users
const users = {
  'ACG01': { password: '1084056653573147904098', role: 'admin' },
  'guest': { password: null, role: 'viewer' },
};

const sessions = new Map();

// Auth Middleware
function generateToken(username) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { username, role: users[username].role });
  return token;
}

const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!sessions.has(token)) return res.status(401).json({ error: 'Unauthorized' });
  req.user = sessions.get(token);
  next();
};

// Login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  
  if (username === 'ACG01' && password === '1084056653573147904098') {
    const token = generateToken(username);
    return res.json({ success: true, token, role: 'admin' });
  }
  
  if (username === 'guest' && !password) {
    const token = generateToken(username);
    return res.json({ success: true, token, role: 'viewer' });
  }
  
  res.status(401).json({ error: 'Invalid credentials' });
});

// Get Metrics
app.get('/api/metrics', auth, (req, res) => {
  res.json(appState.database.metrics);
});

// Get Trades
app.get('/api/trades', auth, (req, res) => {
  res.json(appState.database.trades.slice(-50));
});

// Record Trade
app.post('/api/trades', auth, (req, res) => {
  const trade = {
    id: crypto.randomUUID(),
    ...req.body,
    timestamp: Date.now(),
  };
  
  appState.database.trades.push(trade);
  
  // Update metrics
  const pnl = trade.pnl || 0;
  appState.database.metrics.totalPnL += pnl;
  appState.database.metrics.currentCapital = 50 + appState.database.metrics.totalPnL;
  appState.database.metrics.totalTrades++;
  if (pnl > 0) appState.database.metrics.winCount++;
  appState.database.metrics.winRate = appState.database.metrics.winCount / appState.database.metrics.totalTrades;
  
  // Track loss
  if (pnl < 0) {
    appState.portfolioLoss += Math.abs(pnl);
  }
  
  // Check loss thresholds
  const lossPercent = (appState.portfolioLoss / 50) * 100;
  
  if (lossPercent >= 7) {
    appState.isKilled = true;
    io.emit('stop-total', { message: '🛑 STOP TOTAL - 7% loss reached' });
  } else if (lossPercent >= 5) {
    io.emit('alert-popup', { message: '⚠️ ALERT - 5% loss reached' });
  }
  
  io.emit('trade-recorded', { trade, metrics: appState.database.metrics });
  res.json({ success: true, trade });
});

// Stop Total
app.post('/api/trading/kill-switch', auth, (req, res) => {
  appState.isKilled = true;
  io.emit('kill-switch-activated', { timestamp: Date.now() });
  res.json({ success: true });
});

// Resume
app.post('/api/trading/resume', auth, (req, res) => {
  appState.isKilled = false;
  appState.portfolioLoss = 0;
  io.emit('trading-resumed', { timestamp: Date.now() });
  res.json({ success: true });
});

// Toggle Mode
app.post('/api/trading/mode/toggle', auth, (req, res) => {
  const { mode } = req.body;
  appState.tradingMode = mode;
  io.emit('trading-mode-changed', { mode });
  res.json({ success: true, mode });
});

// Reset System
app.post('/api/system/reset', auth, (req, res) => {
  appState.database.trades = [];
  appState.database.metrics = {
    currentCapital: 50,
    initialCapital: 50,
    totalPnL: 0,
    totalROI: 0,
    totalTrades: 0,
    winCount: 0,
    winRate: 0,
  };
  appState.portfolioLoss = 0;
  appState.isKilled = false;
  appState.tradingMode = 'PAPER';
  
  io.emit('system-reset', { timestamp: Date.now() });
  res.json({ success: true });
});

// WebSocket
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.emit('initial-data', {
    metrics: appState.database.metrics,
    trades: appState.database.trades.slice(-20),
    tradingMode: appState.tradingMode,
    isKilled: appState.isKilled,
  });
});

// Serve Dashboard
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// Start Server// ===== RPC TESTING =====
app.post('/api/rpc/test', auth, async (req, res) => {
  const { rpc } = req.body;
  
  try {
    const startTime = Date.now();
    let success = false;
    let latency = 0;

    if (rpc === 'helius') {
      const heliusKey = process.env.HELIUS_API_KEY;
      if (!heliusKey) {
        return res.json({ success: false, error: 'Helius API key not configured' });
      }

      try {
        const response = await axios.post(
          'https://api.helius.xyz/v0/rpc',
          {
            jsonrpc: '2.0',
            id: 1,
            method: 'getHealth',
          },
          {
            headers: { 'Authorization': `Bearer ${heliusKey}` },
            timeout: 5000,
          }
        );

        latency = Date.now() - startTime;
        success = response.status === 200;
      } catch (error) {
        latency = Date.now() - startTime;
      }
    } else if (rpc === 'quicknode') {
      const quicknodeUrl = process.env.QUICKNODE_API_KEY;
      if (!quicknodeUrl) {
        return res.json({ success: false, error: 'QuickNode API key not configured' });
      }

      try {
        const response = await axios.post(
          quicknodeUrl,
          {
            jsonrpc: '2.0',
            id: 1,
            method: 'getHealth',
          },
          { timeout: 5000 }
        );

        latency = Date.now() - startTime;
        success = response.status === 200;
      } catch (error) {
        latency = Date.now() - startTime;
      }
    }

    if (success) {
      res.json({
        success: true,
        rpc,
        latency,
        status: 'online',
      });
    } else {
      res.json({
        success: false,
        rpc,
        latency,
        status: 'offline',
      });
    }
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

app.post('/api/wallet/balance', auth, async (req, res) => {
  const { publicKey } = req.body;

  if (!publicKey) {
    return res.status(400).json({ error: 'Public key required' });
  }

  try {
    const heliusKey = process.env.HELIUS_API_KEY;
    if (!heliusKey) {
      return res.json({ success: false, error: 'Helius API key not configured' });
    }

    const response = await axios.get(
      `https://api.helius.xyz/v0/addresses/${publicKey}/balances?api-key=${heliusKey}`
    );

    const data = response.data;
    const solBalance = data.nativeBalance ? data.nativeBalance / 1_000_000_000 : 0;

    const priceData = await axios.get(
      'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd',
      { timeout: 5000 }
    );

    const solPrice = priceData.data.solana.usd || 180;
    const totalValue = solBalance * solPrice;

    res.json({
      success: true,
      balance: {
        SOL: solBalance,
        solPrice,
        totalValue,
      },
    });
  } catch (error) {
    res.json({
      success: false,
      error: error.message,
    });
  }
});

app.post('/api/wallet/connect', auth, async (req, res) => {
  const { publicKey } = req.body;

  if (!publicKey) {
    return res.status(400).json({ error: 'Public key required' });
  }

  try {
    res.json({
      success: true,
      message: 'Wallet connected',
      publicKey,
    });
  } catch (error) {
    res.json({
      success: false,
      error: error.message,
    });
  }
});
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║          ⚡ ACG CAPITAL BOT v14.0                         ║
║          PRODUCTION READY                                  ║
║                                                            ║
║  Server running on http://localhost:${PORT}               ║
║  Capital: $50 USD                                         ║
║  Target: $1-2M in 168 days                               ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
  `);
});
