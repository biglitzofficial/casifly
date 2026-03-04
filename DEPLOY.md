# CASIFLY Deployment Guide

Deploy CASIFLY for multi-user testing and production use. This guide covers **Railway** (recommended), **Render**, and **Vercel + Railway**.

---

## Recommended: Railway (Best for Multi-User Testing)

**Why Railway**
- One platform for frontend + backend
- Persistent volumes for SQLite (data survives restarts)
- No cold starts; always-on for real users
- Simple env vars, GitHub auto-deploy
- ~$5/month credit on free tier; paid plans scale well

### Option A: Single-Service Deploy (Easiest)

Deploy frontend + backend as one app. The API serves the built React app.

1. **Push to GitHub** (if not already)

2. **Connect Railway**
   - Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
   - Select your repo

3. **Configure Build**
   - Root Directory: `.` (project root)
   - Build Command: `npm run build:deploy` (see below)
   - Start Command: `npm run start:deploy`
   - Output Directory: leave empty

4. **Add Environment Variables** (Railway → Variables)

   | Variable         | Value                          | Required |
   |-----------------|---------------------------------|----------|
   | `JWT_SECRET`    | (generate: `openssl rand -hex 32`) | Yes    |
   | `NODE_ENV`      | `production`                    | Yes      |
   | `USE_FIRESTORE` | `false`                        | Optional (SQLite default) |

5. **Add Persistent Volume** (for SQLite)
   - Railway → Your service → Variables → Add Volume
   - Mount Path: `/data`
   - Set `DATA_DIR=/data` in env vars

6. **Seed the database** (one-time, for SQLite)
   - After first deploy: Railway CLI `railway run npm run seed --prefix server`
   - Or run locally with `USE_FIRESTORE=false` and `DATA_DIR` pointing to a copy of the DB

---

## Option B: Split Deploy (Vercel + Railway)

Use **Vercel** for the frontend and **Railway** for the API.

### Frontend (Vercel)

1. Push to GitHub
2. [vercel.com](https://vercel.com) → Import Project → Select repo
3. Root: `.`, Framework: Vite
4. **Env vars:**
   - `VITE_USE_API` = `true`
   - `VITE_API_URL` = `https://your-railway-api.up.railway.app/api`
5. Deploy

### Backend (Railway)

1. New Project → Deploy from GitHub
2. Root: `server`
3. Build: `npm install && npm run build`
4. Start: `npm start`
5. **Env vars:** `JWT_SECRET`, `NODE_ENV=production`, `DATA_DIR=/data`
6. Add volume at `/data` for SQLite

### CORS

Set `CORS_ORIGIN` on Railway to your Vercel URL, e.g. `https://casifly.vercel.app`.

---

## Alternative: Render

**Render** offers a free tier (with 15-min spin-down; not ideal for multi-user) and paid always-on. Persistent disk requires a paid plan.

### Backend on Render

1. [render.com](https://render.com) → New → Web Service
2. Connect GitHub, root: `server`
3. Build: `npm install && npm run build`
4. Start: `npm start`
5. Add **Disk** (Persistent Storage): Mount Path `/data`
6. Env: `DATA_DIR=/data`, `JWT_SECRET`, `NODE_ENV=production`

### Frontend on Render (Static Site)

1. New → Static Site
2. Root: `.`, Build: `npm run build`, Publish: `dist`
3. Env: `VITE_USE_API=true`, `VITE_API_URL` = your backend URL

---

## Production Checklist

| Item              | Status |
|-------------------|--------|
| JWT_SECRET set    | Required – never use dev default |
| CORS configured   | Set `CORS_ORIGIN` if frontend on different domain |
| SQLite persistence| Use volume/disk and `DATA_DIR` |
| Seed data         | Run `npm run seed` in server after first deploy |
| HTTPS             | Handled by platform |

---

## Environment Variables

### Frontend (build-time)

| Variable         | Description                      | Example                    |
|------------------|----------------------------------|----------------------------|
| `VITE_USE_API`   | Use backend API                 | `true`                     |
| `VITE_API_URL`   | API base URL                    | `https://api.casifly.app/api` |

### Backend (runtime)

| Variable          | Description                    | Example           |
|-------------------|--------------------------------|--------------------|
| `JWT_SECRET`      | Secret for JWT signing         | (random 32+ chars) |
| `PORT`            | Server port                    | `3001` (or platform default) |
| `NODE_ENV`        | Environment                    | `production`       |
| `USE_FIRESTORE`   | Use Firestore instead of SQLite| `false`            |
| `DATA_DIR`        | SQLite data directory          | `/data`            |
| `CORS_ORIGIN`     | Allowed origin(s)               | `https://app.casifly.app` |

---

## Default Credentials After Seed

- **Master Admin:** `admin@casifly.com` / `Admin@123`
- Create store users via Master Admin dashboard

---

## Troubleshooting

**Database errors:** Ensure `DATA_DIR` points to a persistent volume/disk.

**CORS errors:** Set `CORS_ORIGIN` to your frontend URL (or leave unset for same-origin).

**Blank page:** Check `VITE_API_URL` matches your API URL and includes `/api`.
