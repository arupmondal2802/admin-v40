# A Big Engine Backend - Cloudflare Workers Deployment

This directory contains the production-ready edge backend for A Big Engine, providing ultra-fast (< 50ms) Neon PostgreSQL access, Google Sheets proxying, edge caching, and bandwidth protection.

---

## 🚀 Deploying from GitHub to Cloudflare Workers

If you connect this GitHub repository directly to **Cloudflare Workers Builds** (Cloudflare Dashboard > Workers & Pages > Create Worker > Deploy from Git), configure your build settings as follows:

### Option 1: Worker from Root Directory (Recommended)
- **Root Directory**: `/` (leave default)
- **Build command**: `npm run build:worker` (or leave blank; Wrangler will compile `worker.ts`)
- **Deploy command**: `npx wrangler deploy`
- **Environment variables / Secrets**:
  - `DATABASE_URL`: Your Neon PostgreSQL pooler URL
  - `BANDWIDTH_SAVER`: `true`
  - `ENVIRONMENT`: `production`

### Option 2: Worker from Subfolder (`cloudflare-worker`)
If you chose the `cloudflare-worker` directory as the root:
- **Root Directory**: `cloudflare-worker`
- **Build command**: `npm run build` (or leave blank)
- **Deploy command**: `npx wrangler deploy`
- **Environment variables / Secrets**:
  - `DATABASE_URL`: Your Neon PostgreSQL pooler URL
  - `BANDWIDTH_SAVER`: `true`
  - `ENVIRONMENT`: `production`

---

## 🌐 Deploying the Frontend App (Cloudflare Pages)

If you are deploying the **React/Vite web application** to **Cloudflare Pages**:
- **Framework Preset**: `Vite`
- **Root Directory**: `/`
- **Build Command**: `npm run build`
- **Build Output Directory**: `dist`
- **Node.js Version**: `20` (add environment variable `NODE_VERSION=20`)

---

## 🛠️ CLI Deployment (Manual / Terminal)

```bash
# 1. Login to Cloudflare
npx wrangler login

# 2. Deploy directly from repository root
npm run deploy:worker

# Or from cloudflare-worker folder:
cd cloudflare-worker
npx wrangler deploy
```

---

## 🔍 Resolving Common Cloudflare Git Errors

1. **`no script build found`**:
   - Cause: Cloudflare automatically runs `npm run build`, but `package.json` in `cloudflare-worker` had no `build` script.
   - Solution: Fixed! Both root and `cloudflare-worker/package.json` now include a valid `"build"` script.

2. **`no dependencies found`**:
   - Cause: Missing `package-lock.json` in the worker directory.
   - Solution: Fixed! `cloudflare-worker/package-lock.json` is generated and committed.

3. **`no build output detected`**:
   - Cause: Cloudflare expected output in a specific directory or a build step failed silently.
   - Solution: For Workers, ensure the deploy command is `npx wrangler deploy`. For Pages, set Build Output Directory to `dist`.
