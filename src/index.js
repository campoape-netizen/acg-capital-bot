const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const axios = require('axios');
require('dotenv').config();

// ===== INIT =====
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// ===== MIDDLEWARE =====
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cors());
app.use(express.static('public'));

// ===== AUTH MIDDLEWARE =====
const auth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    console.log('❌ No auth header');
    return res.status(401).json({ error: 'Unauthorized - No token' });
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    console.log('❌ No token in header');
    return res.status(401).json({ error: 'Unauthorized - Invalid format' });
  }

  try {
    const secret = process.env.JWT_SECRET || 'secret';
    const decoded = jwt.verify(token, secret);
    console.log('✅ Token verified:', decoded.username);
    req.user = decoded;
    next();
  } catch (error) {
    console.error('❌ Token verification failed:', error.message);
    res.status(401).json({ error: 'Unauthorized - Invalid token' });
  }
};

// ===== GLOBAL STATE =====
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

// ===== LOGIN ENDPOINT =====
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const secret = process.env.JWT_SECRET || 'secret';

  console.log('🔐 Login attempt:', username);

  if (username === 'ACG01' && password === '1084056653573147904098') {
    const token = jwt.sign({ username: 'ACG01', role: 'admin' }, secret, { expiresIn: '24h' });
    console.log('✅ Admin login successful');
    return res.json({ success: true, token });
  }

  if (username === 'guest') {
    const token = jwt.sign({ username: 'guest', role: 'guest' }, secret, { expiresIn: '24h' });
    console.log('✅ Guest login successful');
    return res.json({ success: true, token });
  }

  console.log('❌ Invalid credentials');
  res.json({ success: false, error: 'Invalid credentials' });
});

// ===== PROTECTED ENDPOINTS =====

// Get Metrics
app.get('/api/metrics', auth, (req, res) => {
  console.log('📊 Metrics requested by:', req.user.username);
  res.json(appState.database.metrics);
});

// Connect Wallet
app.post('/api/wallet/connect', auth, (req, res) => {
  const { publicKey } = req.body;
  console.log('💼 Wallet connect:', publicKey);

  if (!publicKey) {
    return res.status(400).json({ error: 'Public key required' });
  }

  res.json({
    success: true,
    message: 'Wallet connected',
    publicKey,
  });
});

// Get Wallet Balance
app.post('/api/wallet/balance', auth, async (req, res) => {
  const { publicKey } = req.body;
  console.log('💰 Balance requested for:', publicKey);

  if (!publicKey) {
    console.log('❌ No public key provided');
    return res.status(400).json({ error: 'Public key required' });
  }

  try {
    // Simulación de balance por ahora
    // TODO: Integrar con Helius cuando esté estable
    
    const simulatedBalance = {
      SOL: 0.5,
      solPrice: 180,
      totalValue: 90,
    };

    console.log(`✅ Balance: ${simulatedBalance.SOL} SOL = $${simulatedBalance.totalValue}`);

    return res.json({
      success: true,
      balance: simulatedBalance,
    });
  } catch (error) {
    console.error('❌ Balance error:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});
// Get Trades
app.get('/api/trades', auth, (req, res) => {
  console.log('📈 Trades requested');
  res.json(appState.database.trades.slice(-50));
});

// Record Trade
app.post('/api/trades', auth, (req, res) => {
  const trade = {
    id: Date.now(),
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

// Kill Switch
app.post('/api/trading/kill-switch', auth, (req, res) => {
  console.log('🛑 Kill switch activated');
  appState.isKilled = true;
  io.emit('kill-switch-activated', { timestamp: Date.now() });
  res.json({ success: true });
});

// Resume Trading
app.post('/api/trading/resume', auth, (req, res) => {
  console.log('▶️ Trading resumed');
  appState.isKilled = false;
  appState.portfolioLoss = 0;
  io.emit('trading-resumed', { timestamp: Date.now() });
  res.json({ success: true });
});

// Toggle Mode
app.post('/api/trading/mode/toggle', auth, (req, res) => {
  const { mode } = req.body;
  appState.tradingMode = mode;
  console.log('🔄 Mode changed to:', mode);
  io.emit('trading-mode-changed', { mode });
  res.json({ success: true, mode });
});

// Reset System
app.post('/api/system/reset', auth, (req, res) => {
  console.log('🔄 System reset');
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

// ===== WEBSOCKET =====
io.on('connection', (socket) => {
  console.log('👤 User connected:', socket.id);
  
  socket.emit('initial-data', {
    metrics: appState.database.metrics,
    trades: appState.database.trades.slice(-20),
    tradingMode: appState.tradingMode,
    isKilled: appState.isKilled,
  });

  socket.on('disconnect', () => {
    console.log('👤 User disconnected:', socket.id);
  });
});

// ===== STATIC FILES =====
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// ===== START SERVER =====
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
  console.log('🔐 JWT_SECRET:', process.env.JWT_SECRET ? '✅ SET' : '⚠️  NOT SET');
  console.log('🔑 Helius API:', process.env.HELIUS_API_KEY ? '✅ SET' : '⚠️  NOT SET');
  console.log('🔑 QuickNode API:', process.env.QUICKNODE_API_KEY ? '✅ SET' : '⚠️  NOT SET');
});
