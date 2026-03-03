import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { db } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

export const erpRouter = Router();
erpRouter.use(authMiddleware);

function getId(prefix: string) {
  return prefix + Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 6);
}

erpRouter.get('/accounts', async (req, res) => {
  const rows = await db.getAccounts();
  res.json(rows.map((a: any) => ({ id: a.id, name: a.name, type: a.type, category: a.category, balance: a.balance || 0 })));
});

erpRouter.get('/customers', async (req, res) => {
  const user = (req as any).user;
  const rows = await db.getCustomers(user.productId);
  res.json(rows.map((c: any) => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    commissionRates: JSON.parse(c.commission_rates),
    ledgerAccountId: c.ledger_account_id,
    joinedAt: c.joined_at,
    storeId: c.store_id,
  })));
});

erpRouter.post('/customers', async (req, res) => {
  const user = (req as any).user;
  const { name, phone, commissionRates } = req.body;
  if (!name?.trim() || !phone?.trim()) {
    res.status(400).json({ error: 'Name and phone required' });
    return;
  }
  const digits = phone.replace(/\D/g, '');
  if (digits.length !== 10) {
    res.status(400).json({ error: 'Phone must be 10 digits' });
    return;
  }
  const existing = await db.getCustomerByPhone(digits, user.productId ?? null);
  if (existing && user.productId) {
    res.status(400).json({ error: 'Phone already registered for this store' });
    return;
  }
  const ledgerId = getId('L');
  const customerId = getId('C');
  const joinedAt = new Date().toISOString();
  await db.addAccount({ id: ledgerId, name: `${name.trim()} Payable`, type: 'LIABILITY', category: 'Customer', balance: 0 });
  await db.addCustomer({ id: customerId, name: name.trim(), phone: digits, commission_rates: JSON.stringify(commissionRates || { visa: 2, master: 2, amex: 3.5, rupay: 1 }), ledger_account_id: ledgerId, store_id: user.productId || null, joined_at: joinedAt });
  res.json({
    id: customerId,
    name: name.trim(),
    phone: digits,
    commissionRates: commissionRates || { visa: 2, master: 2, amex: 3.5, rupay: 1 },
    ledgerAccountId: ledgerId,
    joinedAt,
    storeId: user.productId || undefined,
  });
});

erpRouter.put('/customers/:id', async (req, res) => {
  const { id } = req.params;
  const { name, phone, commissionRates } = req.body;
  const existing = await db.getCustomerById(id);
  if (!existing) {
    res.status(404).json({ error: 'Customer not found' });
    return;
  }
  const updates: any = {};
  if (name !== undefined) updates.name = name.trim();
  if (phone !== undefined) updates.phone = phone.replace(/\D/g, '');
  if (commissionRates !== undefined) updates.commissionRates = commissionRates;
  if (Object.keys(updates).length > 0) await db.updateCustomer(id, updates);
  res.json({ id: existing.id, name: updates.name ?? existing.name, phone: updates.phone ?? existing.phone, commissionRates: updates.commissionRates ?? JSON.parse(existing.commission_rates || '{}'), ledgerAccountId: existing.ledger_account_id, joinedAt: existing.joined_at, storeId: existing.store_id, ...req.body });
});

erpRouter.delete('/customers/:id', async (req, res) => {
  const { id } = req.params;
  const c = await db.getCustomerById(id);
  if (!c) {
    res.status(404).json({ error: 'Customer not found' });
    return;
  }
  await db.deleteCustomer(id);
  res.json({ ok: true });
});

erpRouter.get('/wallets', async (req, res) => {
  const user = (req as any).user;
  const rows = await db.getWallets(user.productId);
  res.json(rows.map((w: any) => ({
    id: w.id,
    name: w.name,
    ledgerAccountId: w.ledger_account_id,
    pgs: JSON.parse(w.pgs),
    storeId: w.store_id || undefined,
  })));
});

erpRouter.post('/wallets', async (req, res) => {
  const user = (req as any).user;
  if (user.role !== 'master_admin') {
    res.status(403).json({ error: 'Store users cannot create wallets' });
    return;
  }
  const { name, pgName, charges, storeId } = req.body;
  if (!name?.trim()) {
    res.status(400).json({ error: 'Wallet name required' });
    return;
  }
  const ledgerId = getId('A');
  const walletId = getId('W');
  const pgs = [{ name: pgName || 'Default PG', charges: charges || { visa: 1.2, master: 1.2, amex: 2.5, rupay: 0.5 } }];
  await db.addAccount({ id: ledgerId, name: name.trim(), type: 'ASSET', category: 'Wallet', balance: 0 });
  await db.addWallet({ id: walletId, name: name.trim(), ledger_account_id: ledgerId, pgs: JSON.stringify(pgs), store_id: storeId || null });
  res.json({
    id: walletId,
    name: name.trim(),
    ledgerAccountId: ledgerId,
    pgs,
    storeId: storeId || undefined,
  });
});

erpRouter.put('/wallets/:id', async (req, res) => {
  const user = (req as any).user;
  if (user.role !== 'master_admin') {
    res.status(403).json({ error: 'Store users cannot edit wallets' });
    return;
  }
  const { id } = req.params;
  const { name } = req.body;
  const w = await db.getWallet(id);
  if (!w) {
    res.status(404).json({ error: 'Wallet not found' });
    return;
  }
  if (name !== undefined) await db.updateWallet(id, { name: name.trim() });
  const updated = await db.getWallet(id);
  res.json({ id: updated!.id, name: updated!.name, ledgerAccountId: updated!.ledger_account_id, pgs: typeof updated!.pgs === 'string' ? JSON.parse(updated!.pgs) : updated!.pgs, storeId: updated!.store_id || undefined });
});

erpRouter.delete('/wallets/:id', async (req, res) => {
  const user = (req as any).user;
  if (user.role !== 'master_admin') {
    res.status(403).json({ error: 'Store users cannot delete wallets' });
    return;
  }
  const { id } = req.params;
  const w = await db.getWallet(id);
  if (!w) {
    res.status(404).json({ error: 'Wallet not found' });
    return;
  }
  await db.deleteWallet(id);
  res.json({ ok: true });
});

erpRouter.patch('/wallets/:id/pgs', async (req, res) => {
  const { id } = req.params;
  const { action, pgConfig, oldPgName } = req.body;
  const w = await db.getWallet(id);
  if (!w) {
    res.status(404).json({ error: 'Wallet not found' });
    return;
  }
  let pgs = typeof w.pgs === 'string' ? JSON.parse(w.pgs) : w.pgs;
  if (action === 'add' && pgConfig) {
    pgs.push(pgConfig);
  } else if (action === 'update' && oldPgName && pgConfig) {
    pgs = pgs.map((pg: any) => pg.name === oldPgName ? pgConfig : pg);
  }
  await db.updateWallet(id, { pgs });
  res.json({ id, name: w.name, ledgerAccountId: w.ledger_account_id, pgs, storeId: w.store_id || undefined });
});

erpRouter.get('/transactions', async (req, res) => {
  const user = (req as any).user;
  const rows = await db.getTransactions(user.productId);
  res.json(rows.map((t: any) => ({
    id: t.id,
    date: t.date,
    description: t.description,
    type: t.type,
    entries: JSON.parse(t.entries),
    status: t.status,
    metadata: t.metadata ? JSON.parse(t.metadata) : undefined,
    referenceId: t.reference_id,
  })));
});

erpRouter.post('/transactions', async (req, res) => {
  const user = (req as any).user;
  const { description, type, entries, metadata, date } = req.body;
  if (!description || !type || !entries?.length) {
    res.status(400).json({ error: 'Description, type, and entries required' });
    return;
  }
  const totalDr = entries.reduce((s: number, e: any) => s + (e.debit || 0), 0);
  const totalCr = entries.reduce((s: number, e: any) => s + (e.credit || 0), 0);
  if (Math.abs(totalDr - totalCr) > 0.01) {
    res.status(400).json({ error: 'Transaction must balance' });
    return;
  }
  const meta = { ...metadata, storeId: user.productId || metadata?.storeId };
  const id = uuid();
  const dateStr = date || new Date().toISOString();
  await db.addTransaction({ id, date: dateStr, description, type, entries: JSON.stringify(entries), status: 'COMPLETED', metadata: JSON.stringify(meta), reference_id: metadata?.customerId || null });
  res.json({
    id,
    date: dateStr,
    description,
    type,
    entries,
    status: 'COMPLETED',
    metadata: meta,
  });
});

erpRouter.get('/balance/:accountId', async (req, res) => {
  const { accountId } = req.params;
  const user = (req as any).user;
  const acc = await db.getAccount(accountId);
  if (!acc) {
    res.status(404).json({ error: 'Account not found' });
    return;
  }
  const rows = (await db.getTransactions(user.productId)).filter((t: any) => t.status === 'COMPLETED');
  let balance = user.productId ? 0 : (acc.balance || 0);
  const isAssetOrExpense = ['ASSET', 'EXPENSE'].includes(acc.type);
  rows.forEach((t: any) => {
    const entries = typeof t.entries === 'string' ? JSON.parse(t.entries) : t.entries;
    entries.forEach((e: any) => {
      if (e.accountId === accountId) {
        balance += isAssetOrExpense ? (e.debit || 0) - (e.credit || 0) : (e.credit || 0) - (e.debit || 0);
      }
    });
  });
  res.json({ accountId, balance });
});
