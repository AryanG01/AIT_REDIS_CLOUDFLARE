# Deployment Guide: Gemini OS on Cloudflare

This guide walks you through deploying your AI roguelike game to Cloudflare Pages with Workers, Redis, and KV caching.

---

## Architecture Overview

- **Frontend**: Vite/React app on Cloudflare Pages
- **API**: Cloudflare Workers (Hono framework)
- **Session Storage**: Upstash Redis (serverless)
- **Content Cache**: Cloudflare KV (edge caching)
- **CDN**: Global edge network

---

## Prerequisites

1. **Cloudflare Account** (free tier works)
2. **Upstash Account** (free tier: 10k commands/day)
3. **GitHub Account** (for automatic deployments)
4. **Node.js 18+** and **pnpm** installed locally

---

## Step 1: Set Up Upstash Redis

### 1.1 Create Redis Instance

1. Go to [Upstash Console](https://console.upstash.com/)
2. Create a new database:
   - **Name**: `gemini-os-sessions`
   - **Type**: Regional
   - **Region**: Choose closest to your users
   - **TLS**: Enabled

3. Copy credentials:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

### 1.2 Test Connection (Optional)

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://YOUR_REDIS_URL/get/test
```

---

## Step 2: Set Up Cloudflare

### 2.1 Install Wrangler CLI

```bash
npm install -g wrangler
wrangler login
```

### 2.2 Create KV Namespaces

Run these commands in `gemini-os-starter/`:

```bash
# Production namespaces
wrangler kv:namespace create "SPRITE_CACHE"
wrangler kv:namespace create "ROOM_CACHE"
wrangler kv:namespace create "AUDIO_CACHE"

# Development namespaces
wrangler kv:namespace create "SPRITE_CACHE" --preview
wrangler kv:namespace create "ROOM_CACHE" --preview
wrangler kv:namespace create "AUDIO_CACHE" --preview
```

**Save the namespace IDs** - you'll need them for `wrangler.toml`.

### 2.3 Update wrangler.toml

Replace `placeholder` with actual KV namespace IDs:

```toml
[[kv_namespaces]]
binding = "SPRITE_CACHE"
id = "abc123def456"  # Replace with your actual ID

[[kv_namespaces]]
binding = "ROOM_CACHE"
id = "ghi789jkl012"  # Replace with your actual ID

[[kv_namespaces]]
binding = "AUDIO_CACHE"
id = "mno345pqr678"  # Replace with your actual ID
```

---

## Step 3: Configure Environment Variables

### 3.1 Local Development

```bash
cd gemini-os-starter
cp .env.example .env
```

Edit `.env` with your actual values:

```bash
GEMINI_API_KEY=your_real_key
FAL_KEY=your_real_fal_key
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...
```

### 3.2 Cloudflare Workers (Secrets)

Set sensitive secrets via Wrangler:

```bash
cd gemini-os-starter
wrangler secret put FAL_KEY
# Paste your FAL key when prompted

wrangler secret put UPSTASH_REDIS_REST_TOKEN
# Paste your Upstash token when prompted
```

Set non-sensitive environment variables:

```bash
wrangler secret put UPSTASH_REDIS_REST_URL
# Or add to wrangler.toml:
[vars]
UPSTASH_REDIS_REST_URL = "https://your-redis-url.upstash.io"
```

---

## Step 4: Deploy to Cloudflare Pages

### Option A: Automatic Deployment (Recommended)

1. **Push to GitHub**:
   ```bash
   git add .
   git commit -m "Add Cloudflare integration"
   git push origin main
   ```

2. **Connect to Cloudflare Pages**:
   - Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
   - Navigate to **Pages** → **Create a project**
   - Connect your GitHub repository
   - Select `main` branch

3. **Configure Build Settings**:
   - **Framework preset**: `Vite`
   - **Build command**: `pnpm run build`
   - **Build output directory**: `dist`
   - **Root directory**: `gemini-os-starter`

4. **Add Environment Variables**:
   - In Pages settings, add:
     - `GEMINI_API_KEY` (if using VITE_ prefix in code)
     - `FAL_KEY`
     - `UPSTASH_REDIS_REST_URL`
     - `UPSTASH_REDIS_REST_TOKEN`

5. **Deploy**:
   - Click **Save and Deploy**
   - Wait ~2 minutes for build

### Option B: Manual Deployment

```bash
cd gemini-os-starter

# Build the app
pnpm run build

# Deploy to Pages
wrangler pages deploy dist --project-name=gemini-os
```

---

## Step 5: Deploy Workers (API Routes)

### 5.1 Deploy Workers

```bash
cd gemini-os-starter
wrangler deploy
```

This deploys:
- `/api/fal-proxy` - FAL.ai API proxy
- `/api/session/*` - Session management
- `/api/cache/*` - KV cache API
- `/api/analytics/*` - Event logging

### 5.2 Bind Workers to Pages

In **Cloudflare Dashboard → Pages → Settings → Functions**:

1. Enable **Workers compatibility**
2. Set **Functions route**: `/api/*`
3. Bind KV namespaces (should auto-detect from wrangler.toml)

---

## Step 6: Verify Deployment

### 6.1 Test Endpoints

```bash
# Health check
curl https://your-app.pages.dev/api/health

# Should return: {"status":"ok","timestamp":...}
```

### 6.2 Test in Browser

1. Open `https://your-app.pages.dev`
2. Check browser console for:
   - `[SpriteCache] L2 HIT (KV)` - KV cache working
   - `[SessionService] Session created` - Redis working
   - `[EventLogger] Flushed N events to Redis` - Analytics working

### 6.3 Monitor KV Usage

```bash
# Check SPRITE_CACHE
wrangler kv:key list --namespace-id=YOUR_SPRITE_CACHE_ID

# Check ROOM_CACHE
wrangler kv:key list --namespace-id=YOUR_ROOM_CACHE_ID
```

---

## Step 7: Custom Domain (Optional)

1. **Add Custom Domain** in Cloudflare Pages:
   - Go to **Pages → Your Project → Custom domains**
   - Add `yourgame.com`
   - Cloudflare will auto-configure DNS

2. **Enable HTTPS**:
   - Free SSL certificate auto-provisioned
   - Force HTTPS redirects enabled by default

---

## Troubleshooting

### Issue: Workers not responding

**Solution**:
```bash
# Check Worker logs
wrangler tail

# Re-deploy Workers
wrangler deploy --force
```

### Issue: KV cache not working

**Symptoms**: No `L2 HIT (KV)` logs

**Solution**:
1. Verify KV namespace IDs in `wrangler.toml`
2. Check bindings: `wrangler kv:namespace list`
3. Manually test KV:
   ```bash
   wrangler kv:key put --namespace-id=YOUR_ID "test" "value"
   wrangler kv:key get --namespace-id=YOUR_ID "test"
   ```

### Issue: Redis errors

**Symptoms**: `Failed to save session` errors

**Solution**:
1. Verify Upstash credentials:
   ```bash
   curl -H "Authorization: Bearer $UPSTASH_REDIS_REST_TOKEN" \
     $UPSTASH_REDIS_REST_URL/ping
   ```
2. Check Upstash dashboard for rate limits
3. Verify secrets are set:
   ```bash
   wrangler secret list
   ```

### Issue: Build fails

**Solution**:
```bash
# Clear cache and rebuild
rm -rf node_modules .pnpm-store
pnpm install
pnpm run build
```

---

## Performance Optimization

### 1. Enable Cloudflare Caching

Add `_headers` file to `public/`:

```
/*
  Cache-Control: public, max-age=3600
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff

/assets/*
  Cache-Control: public, max-age=31536000, immutable
```

### 2. Monitor Analytics

**Cloudflare Dashboard → Analytics**:
- Requests per day
- Bandwidth usage
- Cache hit rate

**Upstash Dashboard**:
- Commands per day
- Memory usage
- Latency

### 3. Cost Estimation (Free Tier Limits)

| Service | Free Tier | Typical Usage |
|---------|-----------|---------------|
| Cloudflare Pages | 500 builds/month | ~10/month |
| Cloudflare Workers | 100k requests/day | ~5k/day |
| Cloudflare KV | 100k reads/day | ~10k/day |
| Upstash Redis | 10k commands/day | ~3k/day |

**Total cost**: $0/month for small-medium traffic

---

## Rollback

If you need to rollback:

```bash
# List deployments
wrangler pages deployments list --project-name=gemini-os

# Rollback to specific deployment
wrangler pages deployment rollback --project-name=gemini-os <DEPLOYMENT_ID>
```

---

## Next Steps

1. **Set up monitoring**: Cloudflare Web Analytics
2. **Add custom domain**: `yourgame.com`
3. **Enable DDoS protection**: Cloudflare Security settings
4. **Review costs**: Monitor usage dashboards

---

## Support

- **Cloudflare Docs**: https://developers.cloudflare.com/pages
- **Upstash Docs**: https://docs.upstash.com/redis
- **Wrangler CLI**: https://developers.cloudflare.com/workers/wrangler

---

## Migration Checklist

- [ ] Upstash Redis created and tested
- [ ] KV namespaces created (3 total)
- [ ] `wrangler.toml` updated with KV IDs
- [ ] Environment variables set (local + Cloudflare)
- [ ] Secrets configured via `wrangler secret put`
- [ ] GitHub repo connected to Cloudflare Pages
- [ ] Build settings configured
- [ ] Workers deployed successfully
- [ ] KV bindings verified
- [ ] Endpoints tested (`/api/health`, `/api/fal-proxy`)
- [ ] Browser testing (check console logs)
- [ ] Custom domain configured (optional)

**Estimated setup time**: 30-45 minutes

---

**Congratulations!** 🎉 Your game is now deployed on Cloudflare with Redis persistence and edge caching.
