import https from 'node:https';
import http from 'node:http';
import { config } from 'dotenv';

config();

const BINANCE_BASE_URL = process.env.BINANCE_ENV === 'mainnet'
  ? 'https://api.binance.com'
  : 'https://testnet.binance.vision';

const API_KEY = process.env.BINANCE_TESTNET_API_KEY || process.env.BINANCE_API_KEY;
const PROXY_AUTH_SECRET = process.env.PROXY_AUTH_SECRET;
const PORT = process.env.PORT || 3001;

const binanceUrl = new URL(BINANCE_BASE_URL);
const httpModule = binanceUrl.protocol === 'https:' ? https : http;

function jsonReply(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*',
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const url = req.url || '/';
  const method = req.method || 'GET';

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': '*',
      'Access-Control-Max-Age': '86400',
    });
    return res.end();
  }

  console.log(`[${new Date().toISOString()}] ${method} ${url}`);

  if (url === '/health' || url === '/health/') {
    return jsonReply(res, 200, {
      status: 'ok',
      timestamp: new Date().toISOString(),
      binanceEndpoint: BINANCE_BASE_URL,
      authConfigured: !!PROXY_AUTH_SECRET,
    });
  }

  if (!url.startsWith('/binance/')) {
    return jsonReply(res, 404, { error: 'Not Found' });
  }

  if (PROXY_AUTH_SECRET) {
    const auth = req.headers['authorization'] || '';
    const token = auth.replace('Bearer ', '');
    if (token !== PROXY_AUTH_SECRET) {
      return jsonReply(res, 401, { error: 'Unauthorized' });
    }
  }

  // Drain incoming body (ignore it)
  req.resume();

  const binancePath = url.slice('/binance'.length);
  const targetUrl = `${BINANCE_BASE_URL}${binancePath}`;
  const parsed = new URL(targetUrl);
  const forwardPath = parsed.pathname + parsed.search;

  console.log(`\u2192 ${method} ${forwardPath.slice(0, 150)}`);

  // CRITICAL: Do NOT send Content-Length on POST/DELETE — Binance interprets
  // Content-Length: 0 as "there is an empty body" and parses it as an extra
  // empty parameter, causing error -1104 "read 7 but sent 8"
  const headers = {
    'X-MBX-APIKEY': API_KEY,
    'User-Agent': 'Mozilla/5.0 (compatible; TradingBot/1.0)',
  };

  const options = {
    hostname: parsed.hostname,
    port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
    path: forwardPath,
    method: method,
    headers: headers,
    timeout: 15000,
  };

  const proxyReq = httpModule.request(options, (proxyRes) => {
    let resBody = '';
    proxyRes.on('data', (chunk) => { resBody += chunk; });
    proxyRes.on('end', () => {
      console.log(`${proxyRes.statusCode < 400 ? '\u2713' : '\u2717'} ${proxyRes.statusCode} ${resBody.slice(0, 120)}`);
      res.writeHead(proxyRes.statusCode, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(resBody);
    });
  });

  proxyReq.on('error', (err) => {
    console.error(`\u2717 Proxy error: ${err.message}`);
    jsonReply(res, 502, { error: 'Proxy error', message: err.message });
  });

  proxyReq.on('timeout', () => {
    proxyReq.destroy();
    jsonReply(res, 504, { error: 'Proxy timeout' });
  });

  // End request with NO body — and no Content-Length header
  proxyReq.end();
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('\n\ud83d\ude80 Binance Proxy Server (raw HTTP v3)');
  console.log('\u2501'.repeat(41));
  console.log(`\ud83d\udce1 Port: ${PORT}`);
  console.log(`\ud83c\udf10 Binance: ${BINANCE_BASE_URL}`);
  console.log(`\ud83d\udd10 Auth: ${PROXY_AUTH_SECRET ? 'Enabled \u2713' : 'DISABLED \u26a0\ufe0f'}`);
  console.log('\u2501'.repeat(41) + '\n');
});
