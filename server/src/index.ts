import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { authRouter } from './routes/auth.js';
import { productsRouter } from './routes/products.js';
import { erpRouter } from './routes/erp.js';
import './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.use('/api/auth', authRouter);
app.use('/api/products', productsRouter);
app.use('/api/erp', erpRouter);

app.get('/api/health', (_, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  const db = process.env.USE_FIRESTORE !== 'false' && process.env.USE_FIRESTORE !== '0' ? 'Firestore' : 'SQLite';
  console.log(`FinLedger API running at http://localhost:${PORT} (DB: ${db})`);
});
