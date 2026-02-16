# 🚀 Binance Proxy Server

Lightweight proxy server for Binance API to bypass geo-restrictions on platforms like Vercel.

## ✨ Features

- ✅ Proxies all Binance API requests
- ✅ Automatic request signing
- ✅ Token-based authentication
- ✅ Docker support
- ✅ Health checks
- ✅ Request logging
- ✅ Works with Testnet and Mainnet

## 🎯 Use Case

Deploy this on a VPS in an allowed location (Brazil ✅) to proxy Binance API requests from restricted locations (Vercel servers).

## 📦 Quick Start

### Option 1: Docker (Recommended)

```bash
# 1. Clone repo
git clone https://github.com/yourusername/binance-proxy.git
cd binance-proxy

# 2. Create .env file
cp .env.example .env
nano .env  # Add your keys

# 3. Build and run
docker build -t binance-proxy .
docker run -p 3001:3001 --env-file .env binance-proxy
```

### Option 2: Node.js

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
nano .env  # Add your keys

# 3. Run
npm start
```

### Option 3: EasyPanel

1. Connect your GitHub repo to EasyPanel
2. Set build method: `Dockerfile`
3. Set port: `3001`
4. Add environment variables from `.env.example`
5. Deploy!

## ⚙️ Configuration

### Environment Variables

```env
# Required
BINANCE_ENV=spot_testnet                    # or 'mainnet'
BINANCE_TESTNET_API_KEY=your_key
BINANCE_TESTNET_SECRET=your_secret
PROXY_AUTH_SECRET=your_random_token         # Generate: openssl rand -hex 32

# Optional
PORT=3001                                    # Default: 3001
```

## 🔧 Usage

### Health Check

```bash
curl http://localhost:3001/health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2026-02-16T20:30:00.000Z",
  "binanceEndpoint": "https://testnet.binance.vision",
  "authConfigured": true
}
```

### Proxy Requests

All requests to `/binance/*` are proxied to Binance:

```bash
# Get server time
curl -H "Authorization: Bearer your_token" \
  http://localhost:3001/binance/api/v3/time

# Get price
curl -H "Authorization: Bearer your_token" \
  http://localhost:3001/binance/api/v3/ticker/price?symbol=BTCUSDT

# Get account balance
curl -H "Authorization: Bearer your_token" \
  http://localhost:3001/binance/api/v3/account
```

## 🔐 Security

1. **Always use HTTPS** in production
2. **Rotate PROXY_AUTH_SECRET** regularly
3. **Never expose API keys** in logs or errors
4. **Use firewall** to restrict access
5. **Monitor** logs for suspicious activity

## 📊 Integration

### From Next.js/Vercel

```typescript
// lib/exchanges/binance-testnet.ts
const USE_PROXY = process.env.NODE_ENV === 'production';
const PROXY_URL = process.env.BINANCE_PROXY_URL;
const PROXY_AUTH = process.env.BINANCE_PROXY_AUTH_SECRET;

export async function getBinanceAPI(endpoint: string) {
  const url = USE_PROXY
    ? `${PROXY_URL}/binance${endpoint}`
    : `https://testnet.binance.vision${endpoint}`;

  const headers: any = {};

  if (USE_PROXY) {
    headers.Authorization = `Bearer ${PROXY_AUTH}`;
  } else {
    headers['X-MBX-APIKEY'] = process.env.BINANCE_TESTNET_API_KEY;
  }

  const response = await fetch(url, { headers });
  return response.json();
}
```

### Vercel Environment Variables

```bash
vercel env add BINANCE_PROXY_URL production
# Value: https://your-vps-domain.com

vercel env add BINANCE_PROXY_AUTH_SECRET production
# Value: same token as in proxy .env
```

## 🚀 Deployment

### VPS (Ubuntu/Debian)

```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Clone and run
git clone https://github.com/yourusername/binance-proxy.git
cd binance-proxy
cp .env.example .env
nano .env

# Build and run
docker build -t binance-proxy .
docker run -d -p 3001:3001 --name binance-proxy --restart unless-stopped --env-file .env binance-proxy

# Check logs
docker logs -f binance-proxy
```

### EasyPanel

1. Dashboard → Create App
2. Source: GitHub
3. Build: Dockerfile
4. Port: 3001
5. Environment: Copy from `.env.example`
6. Deploy!

### Railway

```bash
railway init
railway up
railway variables set BINANCE_TESTNET_API_KEY=xxx
railway variables set PROXY_AUTH_SECRET=xxx
```

## 📈 Monitoring

```bash
# Check logs
docker logs -f binance-proxy

# Check health
curl http://localhost:3001/health

# Test proxy
curl -H "Authorization: Bearer $PROXY_AUTH_SECRET" \
  http://localhost:3001/binance/api/v3/time
```

## 🐛 Troubleshooting

**Issue:** 401 Unauthorized
- **Fix:** Check `PROXY_AUTH_SECRET` matches in proxy and client

**Issue:** 403 Forbidden from Binance
- **Fix:** Verify VPS location is allowed by Binance (check IP country)

**Issue:** Timeout errors
- **Fix:** Check network connectivity, increase timeout in code

**Issue:** Signature errors
- **Fix:** Verify `BINANCE_TESTNET_SECRET` is correct

## 📝 License

MIT

## 🤝 Contributing

PRs welcome!

## 📧 Support

For issues: https://github.com/yourusername/binance-proxy/issues
