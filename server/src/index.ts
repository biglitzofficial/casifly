import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { authRouter } from './routes/auth.js';
import { productsRouter } from './routes/products.js';
import { erpRouter } from './routes/erp.js';
import './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3001;

const corsOrigin = process.env.CORS_ORIGIN;
app.use(cors({
  origin: corsOrigin ? corsOrigin.split(',').map((o: string) => o.trim()) : true,
  credentials: true,
}));
app.use(express.json());

app.use('/api/auth', authRouter);
app.use('/api/products', productsRouter);
app.use('/api/erp', erpRouter);

app.get('/api/health', async (_, res) => {
  const useFirestore = process.env.USE_FIRESTORE !== 'false' && process.env.USE_FIRESTORE !== '0';
  if (useFirestore) {
    const { getFirestore } = await import('./firestore.js');
    const dbOk = !!getFirestore();
    return res.json({ ok: true, db: dbOk ? 'Firestore' : 'not configured' });
  }
  res.json({ ok: true, db: 'SQLite' });
});

// Serve built frontend in production (single-service deploy)
const staticDir = path.join(__dirname, '..', 'public');
if (process.env.NODE_ENV === 'production' && fs.existsSync(staticDir)) {
  app.use(express.static(staticDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(staticDir, 'index.html'));
  });
}

const HOST = process.env.HOST || '0.0.0.0';
const useFirestore = process.env.USE_FIRESTORE !== 'false' && process.env.USE_FIRESTORE !== '0';
app.listen(Number(PORT), HOST, async () => {
  const db = useFirestore ? 'Firestore' : 'SQLite';
  console.log(`CASIFLY API running on ${HOST}:${PORT} (DB: ${db})`);
  if (useFirestore) {
    const { getFirestore } = await import('./firestore.js');
    if (!getFirestore()) console.error('WARNING: Firestore not configured. Set FIREBASE_SERVICE_ACCOUNT in Variables.');
  }
});
