import express from 'express';
import axios from 'axios';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configuration
const BINANCE_BASE = process.env.BINANCE_ENV === 'mainnet'
  ? 'https://api.binance.com'
  : 'https://testnet.binance.vision';

const API_KEY = process.env.BINANCE_TESTNET_API_KEY || process.env.BINANCE_API_KEY;
const PROXY_AUTH_SECRET = process.env.PROXY_AUTH_SECRET;
const PORT = process.env.PORT || 3001;

// Logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Auth middleware
function verifyAuth(req, res, next) {
  if (!PROXY_AUTH_SECRET) {
    console.warn('⚠️  WARNING: PROXY_AUTH_SECRET not set - proxy is open!');
    return next();
  }

  const token = req.headers.authorization?.replace('Bearer ', '');

  if (token !== PROXY_AUTH_SECRET) {
    console.error('❌ Unauthorized request');
    return res.status(401).json({ error: 'Unauthorized', message: 'Invalid authentication token' });
  }

  next();
}

// Health check (no auth required)
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    binanceEndpoint: BINANCE_BASE,
    authConfigured: !!PROXY_AUTH_SECRET
  });
});

// Proxy all Binance requests
// The calling app handles signing - the proxy just forwards with the Binance API key
app.all('/binance/*', verifyAuth, async (req, res) => {
  try {
    // Use originalUrl to preserve exact query string (no re-parsing).
    // This avoids URLSearchParams mangling signed params.
    const originalPath = req.originalUrl.replace('/binance', '');
    const url = `${BINANCE_BASE}${originalPath}`;

    // Replace our auth header with Binance API key
    const headers = {
      'X-MBX-APIKEY': API_KEY,
      'User-Agent': 'Mozilla/5.0 (compatible; TradingBot/1.0)',
    };

    // Do NOT send Content-Type or body for signed requests —
    // all params are in the query string (already signed by calling app).
    // Sending a body would cause Binance error -1104 (extra params).

    console.log(`→ ${req.method} ${url}`);

    const response = await axios({
      method: req.method,
      url,
      headers,
      timeout: 15000,
    });

    console.log(`✓ ${response.status}`);
    res.status(response.status).json(response.data);

  } catch (error) {
    const status = error.response?.status || 500;
    const data = error.response?.data || { error: error.message };
    console.error(`✗ ${status} - ${JSON.stringify(data).substring(0, 200)}`);
    res.status(status).json(data);
  }
});

// 404
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: 'Use /binance/* to proxy Binance API requests',
    examples: ['/health', '/binance/api/v3/time', '/binance/api/v3/ticker/price?symbol=BTCUSDT']
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('\n🚀 Binance Proxy Server');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📡 Port: ${PORT}`);
  console.log(`🌐 Binance: ${BINANCE_BASE}`);
  console.log(`🔐 Auth: ${PROXY_AUTH_SECRET ? 'Enabled ✓' : 'DISABLED ⚠️'}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
});
