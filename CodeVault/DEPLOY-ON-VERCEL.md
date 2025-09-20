# Deploy to Vercel (Serverless Express)

## What changed
- Replaced `express-session` with `cookie-session` (serverless-friendly).
- Removed `app.listen(...)` from `index.js` and exported the Express app instead.
- Added `api/index.js` as Vercel serverless entry point.
- Added `server.js` for local development.
- Updated `package.json` scripts and added `cookie-session` dependency.
- Added `vercel.json` to pin Node.js 20 on functions.

## Files to replace/add
- Replace: `CodeVault/index.js` → use the provided **CodeVault_index.js**
- Replace: `CodeVault/package.json` → use the provided **CodeVault_package.json**
- Add:     `CodeVault/api/index.js` → use the provided **CodeVault_api_index.js**
- Add:     `CodeVault/server.js` → use the provided **CodeVault_server.js**
- Add:     `CodeVault/vercel.json` → use the provided **CodeVault_vercel.json**

## Environment Variables (Vercel → Project Settings → Environment Variables)
- `Notion_API_Key`
- `Products_Database`
- `Products_list`
- `Team_Members`
- `School_Stocktaking_DB_ID`
- `Funds` (if used in code)
- `SESSION_SECRET`

## Local run
```bash
npm install
npm run dev
# http://localhost:5000
```

## Deploy
1. Push the repo to GitHub.
2. On Vercel: “New Project” → Import the repo.
3. Build command: none. Output: (auto) → Functions + Static.
4. After first deploy, set Environment Variables and re-deploy.

> Note: Serverless is not a 24/7 traditional server. If you need permanent background tasks or persistent WebSocket connections, consider a small always-on service on Railway/Render/Fly.io and keep Vercel for the frontend/API endpoints.
