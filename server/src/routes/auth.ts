import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db.js';
import { signToken, authMiddleware } from '../middleware/auth.js';

export const authRouter = Router();

authRouter.post('/login', async (req, res) => {
  try {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: 'Email and password required' });
    return;
  }
  const trimmedEmail = String(email).trim().toLowerCase();
  const trimmedPass = String(password).trim();

  const master = await db.getMasterAdmin(trimmedEmail) as { id: string; email: string; password_hash: string; name: string } | undefined;
  if (master) {
    const match = await bcrypt.compare(trimmedPass, master.password_hash);
    if (match) {
      const token = signToken({
        id: master.id,
        email: master.email,
        name: master.name,
        role: 'master_admin',
      });
      res.json({ token, user: { id: master.id, email: master.email, name: master.name, role: 'master_admin' } });
      return;
    }
  }

  const pu = await db.getProductUserByEmail(trimmedEmail, 'active') as { id: string; product_id: string; email: string; password_hash: string; name: string; role: string } | undefined;
  if (pu) {
    const match = await bcrypt.compare(trimmedPass, pu.password_hash);
    if (match) {
      const token = signToken({
        id: pu.id,
        email: pu.email,
        name: pu.name,
        role: pu.role === 'admin' ? 'product_admin' : 'user',
        productId: pu.product_id,
      });
      res.json({
        token,
        user: {
          id: pu.id,
          email: pu.email,
          name: pu.name,
          role: pu.role === 'admin' ? 'product_admin' : 'user',
          productId: pu.product_id,
        },
      });
      return;
    }
  }

  res.status(401).json({ error: 'Invalid email or password' });
  } catch (err: any) {
    console.error('Login error:', err?.message || err);
    const msg = err?.message?.includes('Firestore not initialized')
      ? 'Database not configured. Set FIREBASE_SERVICE_ACCOUNT.'
      : 'Login failed';
    res.status(503).json({ error: msg });
  }
});

authRouter.get('/me', authMiddleware, (req, res) => {
  const user = (req as unknown as { user?: { id: string; email: string; name: string; role: string; productId?: string } }).user!;
  res.json(user);
});
