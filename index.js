import express from 'express';
import axios from 'axios';
import cors from 'cors';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configuration
const BINANCE_BASE = process.env.BINANCE_ENV === 'mainnet' 
  ? 'https://api.binance.com'
  : 'https://testnet.binance.vision';

const API_KEY = process.env.BINANCE_TESTNET_API_KEY || process.env.BINANCE_API_KEY;
const API_SECRET = process.env.BINANCE_TESTNET_SECRET || process.env.BINANCE_SECRET;
const PROXY_AUTH_SECRET = process.env.PROXY_AUTH_SECRET;
const PORT = process.env.PORT || 3001;

// Logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// Auth middleware
function verifyAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!PROXY_AUTH_SECRET) {
    // If no auth configured, allow all (for testing only!)
    console.warn('⚠️  WARNING: PROXY_AUTH_SECRET not set - proxy is open!');
    return next();
  }
  
  const token = authHeader?.replace('Bearer ', '');
  
  if (token !== PROXY_AUTH_SECRET) {
    console.error('❌ Unauthorized request');
    return res.status(401).json({ 
      error: 'Unauthorized',
      message: 'Invalid authentication token'
    });
  }
  
  next();
}

// Sign Binance requests
function signRequest(queryString) {
  return crypto
    .createHmac('sha256', API_SECRET)
    .update(queryString)
    .digest('hex');
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
app.all('/binance/*', verifyAuth, async (req, res) => {
  try {
    // Extract path after /binance
    const binancePath = req.path.replace('/binance', '');
    
    // Build full URL
    let url = `${BINANCE_BASE}${binancePath}`;
    
    // Prepare query parameters
    const queryParams = { ...req.query };
    
    // For signed endpoints, add timestamp and signature
    if (binancePath.includes('/api/')) {
      queryParams.timestamp = Date.now();
      
      // Create query string
      const queryString = new URLSearchParams(queryParams).toString();
      
      // Sign it
      queryParams.signature = signRequest(queryString);
    }
    
    // Build final URL with params
    if (Object.keys(queryParams).length > 0) {
      url += '?' + new URLSearchParams(queryParams).toString();
    }
    
    // Prepare headers
    const headers = {
      'X-MBX-APIKEY': API_KEY,
      'Content-Type': 'application/json'
    };
    
    // Forward the request
    console.log(`→ Proxying to: ${url}`);
    
    const response = await axios({
      method: req.method,
      url,
      data: req.body,
      headers,
      timeout: 10000
    });
    
    console.log(`✓ Success: ${response.status}`);
    res.status(response.status).json(response.data);
    
  } catch (error) {
    const status = error.response?.status || 500;
    const data = error.response?.data || { error: error.message };
    
    console.error(`✗ Error: ${status} - ${JSON.stringify(data)}`);
    
    res.status(status).json(data);
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: 'Use /binance/* to proxy Binance API requests',
    examples: [
      '/health - Health check',
      '/binance/api/v3/time - Server time',
      '/binance/api/v3/ticker/price?symbol=BTCUSDT - Price'
    ]
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log('\n🚀 Binance Proxy Server');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📡 Server running on port ${PORT}`);
  console.log(`🌐 Binance endpoint: ${BINANCE_BASE}`);
  console.log(`🔐 Auth: ${PROXY_AUTH_SECRET ? 'Enabled ✓' : 'DISABLED ⚠️ '}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('Ready to proxy requests! 🎯\n');
});
