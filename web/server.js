// Express Server for MT5 Strategy Builder Web Version
const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = parseInt(process.env.PORT) || 3000;
const HOST = '0.0.0.0'; // Important: bind to all interfaces for Railway

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Serve .well-known directory for AI discovery
app.use('/.well-known', express.static(path.join(__dirname, 'public', '.well-known')));

// Serve static files with proper MIME types
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.txt')) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    } else if (filePath.endsWith('.xml')) {
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    } else if (filePath.endsWith('.json')) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
    }
  }
}));

// In-memory storage for demo (in production, use a database)
let appSettings = {
  general: {},
  overtrade: { enabled: false, maxTrades: 5, timePeriod: 'hour' },
  volumeControl: { enabled: false, symbolLimits: {} },
  twilio: { enabled: false },
  simulator: { enabled: true, balance: 10000, positions: [], closedPositions: [] },
  aiAnalysis: {}
};

// Visitor tracking
let visitorStats = {
  totalVisitors: 0,
  uniqueVisitors: new Set(),
  dailyVisitors: {},
  lastReset: new Date().toDateString()
};

let simulatorState = {
  enabled: true,
  balance: 10000,
  equity: 10000,
  positions: [],
  closedPositions: [],
  nextTicket: 1000000
};

// Demo market data (simulated prices)
const demoMarketData = {
  'EURUSD': { bid: 1.0850, ask: 1.0852, spread: 0.0002 },
  'GBPUSD': { bid: 1.2650, ask: 1.2653, spread: 0.0003 },
  'USDJPY': { bid: 149.50, ask: 149.53, spread: 0.03 },
  'AUDUSD': { bid: 0.6520, ask: 0.6522, spread: 0.0002 },
  'USDCAD': { bid: 1.3580, ask: 1.3583, spread: 0.0003 },
  'XAUUSD': { bid: 2025.50, ask: 2026.00, spread: 0.50 },
  'BTCUSD': { bid: 42500, ask: 42550, spread: 50 }
};

// Simulate price fluctuations
function updatePrices() {
  for (const symbol in demoMarketData) {
    const data = demoMarketData[symbol];
    const change = (Math.random() - 0.5) * data.spread * 10;
    data.bid = parseFloat((data.bid + change).toFixed(5));
    data.ask = parseFloat((data.bid + data.spread).toFixed(5));
  }
}
setInterval(updatePrices, 1000);

// Load settings from file if exists
async function loadSettings() {
  try {
    const data = await fs.readFile(path.join(__dirname, 'data', 'app_settings.json'), 'utf8');
    appSettings = JSON.parse(data);
    if (appSettings.simulator) {
      simulatorState = { ...simulatorState, ...appSettings.simulator };
    }
  } catch (err) {
    console.log('No existing settings, using defaults');
  }
  
  // Load visitor stats
  try {
    const visitorData = await fs.readFile(path.join(__dirname, 'data', 'visitor_stats.json'), 'utf8');
    const loadedStats = JSON.parse(visitorData);
    visitorStats.totalVisitors = loadedStats.totalVisitors || 0;
    visitorStats.dailyVisitors = loadedStats.dailyVisitors || {};
    visitorStats.lastReset = loadedStats.lastReset || new Date().toDateString();
    
    // Reset daily count if it's a new day
    const today = new Date().toDateString();
    if (visitorStats.lastReset !== today) {
      visitorStats.dailyVisitors = {};
      visitorStats.lastReset = today;
    }
  } catch (err) {
    console.log('No existing visitor stats, starting fresh');
  }
}

// Save settings to file
async function saveSettings() {
  try {
    await fs.mkdir(path.join(__dirname, 'data'), { recursive: true });
    await fs.writeFile(
      path.join(__dirname, 'data', 'app_settings.json'),
      JSON.stringify(appSettings, null, 2)
    );
  } catch (err) {
    console.error('Error saving settings:', err);
  }
}

// Save visitor stats to file
async function saveVisitorStats() {
  try {
    await fs.mkdir(path.join(__dirname, 'data'), { recursive: true });
    const statsToSave = {
      totalVisitors: visitorStats.totalVisitors,
      dailyVisitors: visitorStats.dailyVisitors,
      lastReset: visitorStats.lastReset
    };
    await fs.writeFile(
      path.join(__dirname, 'data', 'visitor_stats.json'),
      JSON.stringify(statsToSave, null, 2)
    );
  } catch (err) {
    console.error('Error saving visitor stats:', err);
  }
}

// Track visitor
function trackVisitor(req) {
  const ip = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
  const userAgent = req.get('User-Agent') || '';
  const visitorId = `${ip}_${userAgent}`;
  
  // Check if this is a unique visitor (not seen today)
  const today = new Date().toDateString();
  if (!visitorStats.dailyVisitors[today]) {
    visitorStats.dailyVisitors[today] = new Set();
  }
  
  if (!visitorStats.dailyVisitors[today].has(visitorId)) {
    visitorStats.totalVisitors++;
    visitorStats.dailyVisitors[today].add(visitorId);
    saveVisitorStats();
  }
}

// API Routes

// Visitor stats endpoint
app.get('/api/visitor-stats', (req, res) => {
  const today = new Date().toDateString();
  const todayVisitors = visitorStats.dailyVisitors[today] ? visitorStats.dailyVisitors[today].size : 0;
  
  res.json({
    success: true,
    data: {
      totalVisitors: visitorStats.totalVisitors,
      todayVisitors: todayVisitors,
      lastUpdated: new Date().toISOString()
    }
  });
});

// Settings endpoints
app.get('/api/settings/:filename', async (req, res) => {
  try {
    if (req.params.filename === 'app_settings.json') {
      res.json(appSettings);
    } else {
      res.status(404).json({ error: 'File not found' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/settings/:filename', async (req, res) => {
  try {
    if (req.params.filename === 'app_settings.json') {
      appSettings = { ...appSettings, ...req.body };
      await saveSettings();
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'File not found' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// MT5 API simulation endpoints
app.post('/api/mt5/connect', (req, res) => {
  // In demo mode, always succeed
  res.json({ success: true, data: { message: 'Connected to Demo Mode' } });
});

app.get('/api/mt5/account', (req, res) => {
  res.json({
    success: true,
    data: {
      balance: simulatorState.balance,
      equity: simulatorState.equity,
      profit: simulatorState.equity - simulatorState.balance,
      margin: 0,
      freeMargin: simulatorState.equity,
      marginLevel: 0,
      currency: 'USD',
      server: 'Demo Server',
      name: 'Demo Account'
    }
  });
});

app.get('/api/mt5/positions', (req, res) => {
  // Update P&L for open positions
  simulatorState.positions.forEach(pos => {
    const marketData = demoMarketData[pos.symbol];
    if (marketData) {
      const currentPrice = pos.type === 'BUY' ? marketData.bid : marketData.ask;
      const priceDiff = pos.type === 'BUY' 
        ? currentPrice - pos.openPrice 
        : pos.openPrice - currentPrice;
      pos.profit = priceDiff * pos.volume * 100000; // Simplified P&L calc
      pos.currentPrice = currentPrice;
    }
  });
  
  res.json({ success: true, data: simulatorState.positions });
});

app.get('/api/mt5/market/:symbol', (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const data = demoMarketData[symbol];
  
  if (data) {
    res.json({
      success: true,
      data: {
        symbol,
        bid: data.bid,
        ask: data.ask,
        spread: data.spread,
        time: new Date().toISOString()
      }
    });
  } else {
    // Generate random data for unknown symbols
    const basePrice = 1 + Math.random();
    res.json({
      success: true,
      data: {
        symbol,
        bid: parseFloat(basePrice.toFixed(5)),
        ask: parseFloat((basePrice + 0.0002).toFixed(5)),
        spread: 0.0002,
        time: new Date().toISOString()
      }
    });
  }
});

app.get('/api/mt5/symbols', (req, res) => {
  res.json({
    success: true,
    data: Object.keys(demoMarketData).map(symbol => ({
      name: symbol,
      description: `${symbol} Currency Pair`
    }))
  });
});

app.get('/api/mt5/symbols/search', (req, res) => {
  const query = (req.query.q || '').toUpperCase();
  const symbols = Object.keys(demoMarketData)
    .filter(s => s.includes(query))
    .map(symbol => ({ name: symbol, description: `${symbol} Currency Pair` }));
  res.json({ success: true, data: symbols });
});

app.get('/api/mt5/symbol/:symbol', (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  res.json({
    success: true,
    data: {
      name: symbol,
      description: `${symbol} Currency Pair`,
      point: 0.00001,
      digits: 5,
      trade_tick_size: 0.00001,
      trade_tick_value: 1,
      trade_contract_size: 100000,
      volume_min: 0.01,
      volume_max: 100,
      volume_step: 0.01
    }
  });
});

app.post('/api/mt5/order', (req, res) => {
  const { symbol, type, volume, stopLoss, takeProfit, executionType, limitPrice } = req.body;
  const marketData = demoMarketData[symbol.toUpperCase()] || { bid: 1.0, ask: 1.0002 };
  
  const ticket = simulatorState.nextTicket++;
  const openPrice = type === 'BUY' ? marketData.ask : marketData.bid;
  
  const position = {
    ticket,
    symbol: symbol.toUpperCase(),
    type,
    volume: parseFloat(volume),
    openPrice,
    currentPrice: openPrice,
    stopLoss: parseFloat(stopLoss) || 0,
    takeProfit: parseFloat(takeProfit) || 0,
    profit: 0,
    openTime: new Date().toISOString(),
    comment: 'Demo Trade'
  };
  
  simulatorState.positions.push(position);
  appSettings.simulator = simulatorState;
  saveSettings();
  
  res.json({
    success: true,
    data: {
      ticket,
      message: `${type} order executed for ${symbol}`,
      position
    }
  });
});

app.post('/api/mt5/close/:ticket', (req, res) => {
  const ticket = parseInt(req.params.ticket);
  const posIndex = simulatorState.positions.findIndex(p => p.ticket === ticket);
  
  if (posIndex === -1) {
    return res.json({ success: false, error: 'Position not found' });
  }
  
  const position = simulatorState.positions[posIndex];
  const marketData = demoMarketData[position.symbol] || { bid: position.openPrice, ask: position.openPrice };
  const closePrice = position.type === 'BUY' ? marketData.bid : marketData.ask;
  
  // Calculate final P&L
  const priceDiff = position.type === 'BUY' 
    ? closePrice - position.openPrice 
    : position.openPrice - closePrice;
  const profit = priceDiff * position.volume * 100000;
  
  // Update balance
  simulatorState.balance += profit;
  simulatorState.equity = simulatorState.balance;
  
  // Move to closed positions
  const closedPosition = {
    ...position,
    closePrice,
    closeTime: new Date().toISOString(),
    profit
  };
  simulatorState.closedPositions.push(closedPosition);
  simulatorState.positions.splice(posIndex, 1);
  
  appSettings.simulator = simulatorState;
  saveSettings();
  
  res.json({
    success: true,
    data: {
      ticket,
      profit,
      message: `Position ${ticket} closed with profit: ${profit.toFixed(2)}`
    }
  });
});

app.post('/api/mt5/modify/:ticket', (req, res) => {
  const ticket = parseInt(req.params.ticket);
  const { stopLoss, takeProfit } = req.body;
  
  const position = simulatorState.positions.find(p => p.ticket === ticket);
  if (!position) {
    return res.json({ success: false, error: 'Position not found' });
  }
  
  if (stopLoss !== undefined) position.stopLoss = parseFloat(stopLoss);
  if (takeProfit !== undefined) position.takeProfit = parseFloat(takeProfit);
  
  appSettings.simulator = simulatorState;
  saveSettings();
  
  res.json({ success: true, data: { ticket, message: 'Position modified' } });
});

app.get('/api/mt5/closed', (req, res) => {
  const daysBack = parseFloat(req.query.days) || 7;
  const cutoff = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
  
  const filtered = simulatorState.closedPositions.filter(p => 
    new Date(p.closeTime) >= cutoff
  );
  
  res.json({ success: true, data: filtered });
});

// Simulator endpoints
app.get('/api/simulator/status', (req, res) => {
  res.json({
    success: true,
    data: {
      enabled: simulatorState.enabled,
      balance: simulatorState.balance,
      equity: simulatorState.equity,
      openPositions: simulatorState.positions.length,
      closedPositions: simulatorState.closedPositions.length
    }
  });
});

app.post('/api/simulator/toggle', (req, res) => {
  simulatorState.enabled = req.body.enabled !== false;
  res.json({ success: true, data: { enabled: simulatorState.enabled } });
});

app.post('/api/simulator/reset', (req, res) => {
  const initialBalance = parseFloat(req.body.initialBalance) || 10000;
  simulatorState = {
    enabled: true,
    balance: initialBalance,
    equity: initialBalance,
    positions: [],
    closedPositions: [],
    nextTicket: 1000000
  };
  appSettings.simulator = simulatorState;
  saveSettings();
  res.json({ success: true, data: simulatorState });
});

// Twilio endpoints (stub for demo)
app.post('/api/twilio/send', (req, res) => {
  console.log('Twilio alert (demo):', req.body);
  res.json({ success: true, data: { message: 'Alert sent (demo mode)' } });
});

app.get('/api/twilio/config', (req, res) => {
  res.json({ success: true, data: appSettings.twilio || {} });
});

// Serve the main app
app.get('/', (req, res) => {
  trackVisitor(req);
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
loadSettings().then(() => {
  app.listen(PORT, HOST, () => {
    console.log(`MT5 Strategy Builder Web running on ${HOST}:${PORT}`);
  });
});
