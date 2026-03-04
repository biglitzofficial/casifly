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
  const meta: any = { ...metadata, storeId: user.productId || metadata?.storeId };
  if (user.role === 'user') meta.performedByUserId = user.id; // Track staff who performed transaction
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

// Staff targets (store admin only)
erpRouter.get('/staff-targets', async (req, res) => {
  const user = (req as any).user;
  const storeId = user.productId;
  if (!storeId) {
    res.status(403).json({ error: 'Store context required' });
    return;
  }
  const { month } = req.query;
  const rows = await db.getStaffTargets(storeId, month as string);
  res.json(rows.map((r: any) => ({ storeId: r.store_id, staffId: r.staff_id, month: r.month, target: r.target })));
});

erpRouter.post('/staff-targets', async (req, res) => {
  const user = (req as any).user;
  if (user.role !== 'product_admin') {
    res.status(403).json({ error: 'Only store admin can set targets' });
    return;
  }
  const storeId = user.productId;
  if (!storeId) {
    res.status(403).json({ error: 'Store context required' });
    return;
  }
  const { staffId, month, target } = req.body;
  if (!staffId || !month || typeof target !== 'number') {
    res.status(400).json({ error: 'staffId, month, and target required' });
    return;
  }
  if (!/^\d{4}-\d{2}$/.test(month)) {
    res.status(400).json({ error: 'month must be YYYY-MM' });
    return;
  }
  await db.setStaffTarget(storeId, staffId, month, target);
  res.json({ storeId, staffId, month, target });
});

// Staff analytics - staff sees own, admin sees all
// Supports month (YYYY-MM) or dateFrom/dateTo (YYYY-MM-DD) for custom range
erpRouter.get('/staff-analytics', async (req, res) => {
  const user = (req as any).user;
  const storeId = user.productId;
  if (!storeId) {
    res.status(403).json({ error: 'Store context required' });
    return;
  }
  const { month, staffId, dateFrom, dateTo } = req.query;

  let startDate: string;
  let endDate: string;
  let rangeLabel: string;

  if (dateFrom && dateTo) {
    const from = (dateFrom as string).trim();
    const to = (dateTo as string).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      res.status(400).json({ error: 'dateFrom and dateTo must be YYYY-MM-DD' });
      return;
    }
    startDate = new Date(from + 'T00:00:00.000Z').toISOString();
    endDate = new Date(to + 'T23:59:59.999Z').toISOString();
    if (startDate > endDate) {
      res.status(400).json({ error: 'dateFrom must be before dateTo' });
      return;
    }
    rangeLabel = `${from} to ${to}`;
  } else {
    const monthStr = (month as string) || new Date().toISOString().slice(0, 7);
    const [year, mon] = monthStr.split('-').map(Number);
    startDate = new Date(year, mon - 1, 1).toISOString();
    endDate = new Date(year, mon, 0, 23, 59, 59).toISOString();
    rangeLabel = monthStr;
  }

  const staffIds = staffId ? [staffId as string] : null;

  const [txns, allTargets, productUsers] = await Promise.all([
    db.getTransactions(storeId),
    db.getStaffTargets(storeId), // Get all targets; we'll filter by month overlap
    (db as any).getProductUsers?.(storeId) ?? Promise.resolve([]),
  ]);

  const staffNames: Record<string, string> = {};
  (productUsers as any[]).forEach((u: any) => { staffNames[u.id] = u.name || u.email; });

  const byStaff: Record<string, { achieved: number; count: number }> = {};
  const incomeAccounts = ['I001', 'I002'];

  for (const t of txns as any[]) {
    if (t.status !== 'COMPLETED') continue;
    const date = t.date || '';
    if (date < startDate || date > endDate) continue;
    const meta = t.metadata ? (typeof t.metadata === 'string' ? JSON.parse(t.metadata || '{}') : t.metadata) : {};
    const performerId = meta.performedByUserId;
    if (!performerId) continue;
    if (staffIds && !staffIds.includes(performerId)) continue;

    const entries = typeof t.entries === 'string' ? JSON.parse(t.entries) : t.entries;
    let revenue = 0;
    for (const e of entries) {
      if (incomeAccounts.includes(e.accountId)) revenue += e.credit || 0;
    }
    if (revenue > 0) {
      byStaff[performerId] = byStaff[performerId] || { achieved: 0, count: 0 };
      byStaff[performerId].achieved += revenue;
      byStaff[performerId].count += 1;
    }
  }

  const targetMap: Record<string, number> = {};
  (allTargets as any[]).forEach((t: any) => {
    const [y, m] = (t.month || '').split('-').map(Number);
    if (!y || !m) return;
    const monthStart = new Date(y, m - 1, 1).getTime();
    const monthEnd = new Date(y, m, 0, 23, 59, 59).getTime();
    if (new Date(startDate).getTime() <= monthEnd && new Date(endDate).getTime() >= monthStart) {
      targetMap[t.staff_id] = (targetMap[t.staff_id] || 0) + t.target;
    }
  });

  // Include staff from targets, transactions, AND all product users (so newly created staff appear)
  const allStaffIds = new Set([...Object.keys(byStaff), ...Object.keys(targetMap)]);
  (productUsers as any[]).forEach((u: any) => {
    if (u.role === 'user') allStaffIds.add(u.id); // staff only (excludes product_admin)
  });
  if (staffIds?.length) {
    staffIds.forEach(id => allStaffIds.add(id));
    allStaffIds.forEach(id => { if (!staffIds!.includes(id)) allStaffIds.delete(id); });
  }

  const result = Array.from(allStaffIds).map((sid) => {
    const data = byStaff[sid] || { achieved: 0, count: 0 };
    const targetVal = targetMap[sid] || 0;
    const pct = targetVal > 0 ? Math.round((data.achieved / targetVal) * 100) : (data.achieved > 0 ? 100 : 0);
    return {
      staffId: sid,
      staffName: staffNames[sid] || sid,
      month: rangeLabel,
      target: targetVal,
      achieved: data.achieved,
      percentage: pct,
      transactionCount: data.count,
    };
  });

  res.json(result);
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
