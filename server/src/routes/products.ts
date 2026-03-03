import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import { db } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

export const productsRouter = Router();
productsRouter.use(authMiddleware);

function slugify(s: string) {
  return s.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

productsRouter.get('/', async (req, res) => {
  const user = (req as any).user;
  if (user.role !== 'master_admin') {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const rows = await db.getProducts();
  const products = rows.map((p: any) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    description: p.description,
    status: p.status,
    storeType: p.store_type,
    createdAt: p.created_at,
  }));
  res.json(products);
});

productsRouter.post('/', async (req, res) => {
  const user = (req as any).user;
  if (user.role !== 'master_admin') {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const { name, description, storeType } = req.body;
  if (!name?.trim()) {
    res.status(400).json({ error: 'Name required' });
    return;
  }
  const slug = slugify(name.trim());
  const id = storeType === 'casifly' ? `c${Date.now().toString(36)}` : `o${Date.now().toString(36)}`;
  const createdAt = new Date().toISOString();
  await db.addProduct({ id, name: name.trim(), slug, description: description || null, status: 'active', store_type: storeType || 'other', created_at: createdAt });
  res.json({ id, name: name.trim(), slug, description, status: 'active', storeType: storeType || 'other', createdAt });
});

productsRouter.put('/:id', async (req, res) => {
  const user = (req as any).user;
  if (user.role !== 'master_admin') {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const { id } = req.params;
  const { name, description, status, storeType } = req.body;
  const existing = await db.getProduct(id);
  if (!existing) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }
  const n = name !== undefined ? name.trim() : existing.name;
  const slug = slugify(n);
  const updates: any = { name: n, slug, description: description ?? existing.description, status: status ?? existing.status, storeType: storeType ?? existing.store_type };
  await db.updateProduct(id, updates);
  res.json({ id, name: n, slug, description: description ?? existing.description, status: status ?? existing.status, storeType: storeType ?? existing.store_type, createdAt: existing.created_at });
});

productsRouter.delete('/:id', async (req, res) => {
  const user = (req as any).user;
  if (user.role !== 'master_admin') {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const { id } = req.params;
  await db.deleteProduct(id);
  res.json({ ok: true });
});

productsRouter.get('/:id/users', async (req, res) => {
  const user = (req as any).user;
  const { id } = req.params;
  const canRead = user.role === 'master_admin' || (user.role === 'product_admin' && user.productId === id);
  if (!canRead) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const rows = await db.getProductUsers(id);
  const users = rows.map((u: any) => ({
    id: u.id,
    productId: u.product_id,
    email: u.email,
    name: u.name,
    role: u.role,
    status: u.status,
    createdAt: u.created_at,
    password: '[HIDDEN]',
  }));
  res.json(users);
});

productsRouter.post('/:id/users', async (req, res) => {
  const user = (req as any).user;
  const { id: productId } = req.params;
  const canAdd = user.role === 'master_admin' || (user.role === 'product_admin' && user.productId === productId);
  if (!canAdd) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const { email, password, name, role } = req.body;
  if (!email?.trim() || !password?.trim() || !name?.trim()) {
    res.status(400).json({ error: 'Email, password, and name required' });
    return;
  }
  const effectiveRole = user.role === 'product_admin' ? 'user' : (role || 'user');
  const existing = await db.getProductUserByEmailAndProduct(email.trim().toLowerCase(), productId);
  if (existing) {
    res.status(400).json({ error: 'Email already registered for this store' });
    return;
  }
  const hash = await bcrypt.hash(password.trim(), 10);
  const uid = uuid().slice(0, 8);
  const createdAt = new Date().toISOString();
  await db.addProductUser({ id: uid, product_id: productId, email: email.trim().toLowerCase(), password_hash: hash, name: name.trim(), role: effectiveRole, status: 'active', created_at: createdAt });
  res.json({ id: uid, productId, email: email.trim().toLowerCase(), name: name.trim(), role: effectiveRole, status: 'active', createdAt });
});

productsRouter.put('/:productId/users/:userId', async (req, res) => {
  const user = (req as any).user;
  const { productId, userId } = req.params;
  const existing = await db.getProductUserByUserId(userId);
  if (!existing) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  const canEdit = user.role === 'master_admin' || (user.role === 'product_admin' && user.productId === productId && existing.product_id === productId);
  if (!canEdit) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const { name, role, status } = req.body;
  const updates: any = {};
  if (name !== undefined && user.role === 'master_admin') updates.name = name.trim();
  if (role !== undefined && user.role === 'master_admin') updates.role = role;
  if (status !== undefined) updates.status = status;
  if (Object.keys(updates).length > 0) await db.updateProductUser(userId, updates);
  const updated = await db.getProductUserByUserId(userId);
  res.json({ id: updated!.id, productId: updated!.product_id, email: updated!.email, name: updated!.name, role: updated!.role, status: updated!.status, createdAt: updated!.created_at });
});

productsRouter.delete('/:productId/users/:userId', async (req, res) => {
  const user = (req as any).user;
  const { productId, userId } = req.params;
  const existing = await db.getProductUserByUserId(userId);
  if (!existing) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  const canDelete = user.role === 'master_admin' || (user.role === 'product_admin' && user.productId === productId && existing.product_id === productId);
  if (!canDelete) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  await db.deleteProductUser(userId);
  res.json({ ok: true });
});
