# CASIFLY Deployment Guide

Deploy CASIFLY for multi-user testing and production use. This guide covers **Railway** (recommended), **Render**, and **Vercel + Railway**.

---

## Recommended: Railway (Best for Multi-User Testing)

**Why Railway**
- One platform for frontend + backend
- Firestore for scalable, persistent data (no volumes needed)
- No cold starts; always-on for real users
- Simple env vars, GitHub auto-deploy
- ~$5/month credit on free tier; paid plans scale well

### Option A: Single-Service Deploy with Firestore (Easiest)

Deploy frontend + backend as one app. The API serves the built React app and uses **Firestore** as the database.

1. **Push to GitHub** (if not already)

2. **Connect Railway**
   - Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
   - Select your repo

3. **Configure Build**
   - Root Directory: `.` (project root)
   - Build Command: `npm run build:deploy`
   - Start Command: `npm run start:deploy`
   - Output Directory: leave empty

4. **Add Environment Variables** (Railway → Variables)

   | Variable                  | Value                          | Required |
   |---------------------------|--------------------------------|----------|
   | `JWT_SECRET`              | `openssl rand -hex 32`         | Yes      |
   | `NODE_ENV`                | `production`                   | Yes      |
   | `USE_FIRESTORE`           | `true`                         | Yes      |
   | `FIREBASE_SERVICE_ACCOUNT`| (see below)                    | Yes      |

5. **Get Firebase Service Account JSON (one-time)**
   - Go to [Firebase Console](https://console.firebase.google.com) → Your project → Project Settings → Service Accounts
   - Click **Generate new private key**
   - Open the downloaded JSON file
   - Copy the **entire JSON** (one line, no line breaks)
   - In Railway Variables, add `FIREBASE_SERVICE_ACCOUNT` and paste the JSON as the value

   If using a different project: also set `FIREBASE_PROJECT_ID` to your Firebase project ID.

6. **Seed Firestore** (one-time)
   - Set the same env vars locally or use Railway CLI:
   - `railway run npm run seed:firestore --prefix server`

---

### Option A2: SQLite (Alternative – requires persistent volume)

If you prefer SQLite instead of Firestore:
- Set `USE_FIRESTORE` = `false`
- Add a Volume at `/data` and set `DATA_DIR` = `/data`
- Seed with: `railway run npm run seed --prefix server`

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
5. **Env vars:** `JWT_SECRET`, `NODE_ENV=production`, `USE_FIRESTORE=true`, `FIREBASE_SERVICE_ACCOUNT` (JSON string)
6. Seed: `railway run npm run seed:firestore --prefix server`

### CORS

Set `CORS_ORIGIN` on Railway to your Vercel URL, e.g. `https://casifly.vercel.app`.

---

## Alternative: Render

**Render** offers a free tier (with 15-min spin-down; not ideal for multi-user) and paid always-on. Persistent disk requires a paid plan.

### Backend on Render (Firestore)

1. [render.com](https://render.com) → New → Web Service
2. Connect GitHub, root: `server`
3. Build: `npm install && npm run build`
4. Start: `npm start`
5. Env: `JWT_SECRET`, `NODE_ENV=production`, `USE_FIRESTORE=true`, `FIREBASE_SERVICE_ACCOUNT` (JSON string)
6. Seed: Run `npm run seed:firestore --prefix server` with same env vars

### Frontend on Render (Static Site)

1. New → Static Site
2. Root: `.`, Build: `npm run build`, Publish: `dist`
3. Env: `VITE_USE_API=true`, `VITE_API_URL` = your backend URL

---

## Production Checklist

| Item                    | Status |
|-------------------------|--------|
| JWT_SECRET set          | Required – never use dev default |
| FIREBASE_SERVICE_ACCOUNT| Required for Firestore (full JSON string) |
| USE_FIRESTORE           | `true` for Firestore, `false` for SQLite |
| CORS configured         | Set `CORS_ORIGIN` if frontend on different domain |
| Seed data               | Run `npm run seed:firestore` (Firestore) or `npm run seed` (SQLite) after first deploy |
| HTTPS                   | Handled by platform |

---

## Environment Variables

### Frontend (build-time)

| Variable         | Description                      | Example                    |
|------------------|----------------------------------|----------------------------|
| `VITE_USE_API`   | Use backend API                 | `true`                     |
| `VITE_API_URL`   | API base URL                    | `https://api.casifly.app/api` |

### Backend (runtime)

| Variable                  | Description                           | Example              |
|---------------------------|---------------------------------------|----------------------|
| `JWT_SECRET`              | Secret for JWT signing                | (random 32+ chars)   |
| `USE_FIRESTORE`           | Use Firestore (default: true)         | `true`               |
| `FIREBASE_SERVICE_ACCOUNT`| Firebase service account JSON (string) | `{"type":"service_account",...}` |
| `FIREBASE_PROJECT_ID`     | Firebase project ID (optional)        | `casifly-14574`      |
| `PORT`                    | Server port                           | `3001` or platform   |
| `NODE_ENV`                | Environment                           | `production`         |
| `DATA_DIR`                | SQLite data dir (only when USE_FIRESTORE=false) | `/data` |
| `CORS_ORIGIN`             | Allowed origin(s)                     | `https://app.casifly.app` |

---

## Default Credentials After Seed

- **Master Admin:** `admin@casifly.com` / `Admin@123`
- Create store users via Master Admin dashboard

---

## Troubleshooting

**Firestore connection failed:** Ensure `FIREBASE_SERVICE_ACCOUNT` is the full JSON string (no line breaks). Paste the entire contents of your service account JSON file.

**Database errors (SQLite):** Ensure `DATA_DIR` points to a persistent volume/disk when using SQLite.

**CORS errors:** Set `CORS_ORIGIN` to your frontend URL (or leave unset for same-origin).

**Blank page:** Check `VITE_API_URL` matches your API URL and includes `/api`.
