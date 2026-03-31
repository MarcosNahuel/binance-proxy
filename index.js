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

  // DEBUG: Log exact URL received from Traefik
  const binancePath = url.slice('/binance'.length);
  const qIdx = binancePath.indexOf('?');
  const queryPart = qIdx >= 0 ? binancePath.slice(qIdx + 1) : '';
  const paramCount = queryPart ? queryPart.split('&').length : 0;
  console.log(`[DEBUG] raw req.url length=${url.length} params=${paramCount}`);
  console.log(`[DEBUG] query: ${queryPart.slice(0, 200)}`);
  
  // Collect any body data that Traefik might have forwarded
  let bodyChunks = [];
  req.on('data', (chunk) => bodyChunks.push(chunk));
  req.on('end', () => {
    const incomingBody = Buffer.concat(bodyChunks).toString();
    if (incomingBody.length > 0) {
      console.log(`[DEBUG] INCOMING BODY (${incomingBody.length} bytes): ${incomingBody.slice(0, 200)}`);
    }

    const targetUrl = `${BINANCE_BASE_URL}${binancePath}`;
    const parsed = new URL(targetUrl);
    const forwardPath = parsed.pathname + parsed.search;

    console.log(`\u2192 ${method} ${forwardPath.slice(0, 120)}`);

    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: forwardPath,
      method: method,
      headers: {
        'X-MBX-APIKEY': API_KEY,
        'User-Agent': 'Mozilla/5.0 (compatible; TradingBot/1.0)',
        'Content-Length': '0',
      },
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

    proxyReq.end();
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('\n\ud83d\ude80 Binance Proxy Server (raw HTTP v2 + debug)');
  console.log('\u2501'.repeat(41));
  console.log(`\ud83d\udce1 Port: ${PORT}`);
  console.log(`\ud83c\udf10 Binance: ${BINANCE_BASE_URL}`);
  console.log(`\ud83d\udd10 Auth: ${PROXY_AUTH_SECRET ? 'Enabled \u2713' : 'DISABLED \u26a0\ufe0f'}`);
  console.log('\u2501'.repeat(41) + '\n');
});
