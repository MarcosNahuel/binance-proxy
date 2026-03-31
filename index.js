import express from 'express';
import https from 'node:https';
import http from 'node:http';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();

app.use(cors());
// NO body parsers — proxy doesn't need them, and they can interfere

// Configuration
const BINANCE_BASE_URL = process.env.BINANCE_ENV === 'mainnet'
  ? 'https://api.binance.com'
  : 'https://testnet.binance.vision';

const API_KEY = process.env.BINANCE_TESTNET_API_KEY || process.env.BINANCE_API_KEY;
const PROXY_AUTH_SECRET = process.env.PROXY_AUTH_SECRET;
const PORT = process.env.PORT || 3001;

const binanceUrl = new URL(BINANCE_BASE_URL);
const httpModule = binanceUrl.protocol === 'https:' ? https : http;

// Logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Auth middleware
function verifyAuth(req, res, next) {
  if (!PROXY_AUTH_SECRET) {
    console.warn('\u26a0\ufe0f  WARNING: PROXY_AUTH_SECRET not set - proxy is open!');
    return next();
  }

  const token = req.headers.authorization?.replace('Bearer ', '');

  if (token !== PROXY_AUTH_SECRET) {
    console.error('\u274c Unauthorized request');
    return res.status(401).json({ error: 'Unauthorized', message: 'Invalid authentication token' });
  }

  next();
}

// Health check (no auth required)
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    binanceEndpoint: BINANCE_BASE_URL,
    authConfigured: !!PROXY_AUTH_SECRET
  });
});

// Proxy all Binance requests using raw Node.js http/https
// No axios, no body parsers, no interference — just passthrough
app.all('/binance/*', verifyAuth, (req, res) => {
  // Preserve exact query string from original request (already signed)
  const originalPath = req.originalUrl.replace('/binance', '');
  const targetUrl = `${BINANCE_BASE_URL}${originalPath}`;

  console.log(`\u2192 ${req.method} ${targetUrl}`);

  const parsed = new URL(targetUrl);

  const options = {
    hostname: parsed.hostname,
    port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
    path: parsed.pathname + parsed.search,
    method: req.method,
    headers: {
      'X-MBX-APIKEY': API_KEY,
      'User-Agent': 'Mozilla/5.0 (compatible; TradingBot/1.0)',
      'Content-Length': '0',
    },
    timeout: 15000,
  };

  const proxyReq = httpModule.request(options, (proxyRes) => {
    let body = '';
    proxyRes.on('data', (chunk) => { body += chunk; });
    proxyRes.on('end', () => {
      console.log(`${proxyRes.statusCode >= 400 ? '\u2717' : '\u2713'} ${proxyRes.statusCode}`);
      res.status(proxyRes.statusCode);
      try {
        res.json(JSON.parse(body));
      } catch {
        res.send(body);
      }
    });
  });

  proxyReq.on('error', (err) => {
    console.error(`\u2717 Proxy error: ${err.message}`);
    res.status(502).json({ error: 'Proxy error', message: err.message });
  });

  proxyReq.on('timeout', () => {
    proxyReq.destroy();
    res.status(504).json({ error: 'Proxy timeout' });
  });

  // Send request with NO body — just headers and URL
  proxyReq.end();
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
  console.log('\n\ud83d\ude80 Binance Proxy Server');
  console.log('\u2501'.repeat(41));
  console.log(`\ud83d\udce1 Port: ${PORT}`);
  console.log(`\ud83c\udf10 Binance: ${BINANCE_BASE_URL}`);
  console.log(`\ud83d\udd10 Auth: ${PROXY_AUTH_SECRET ? 'Enabled \u2713' : 'DISABLED \u26a0\ufe0f'}`);
  console.log('\u2501'.repeat(41) + '\n');
});
