import React, { useState } from 'react';
import { useERP } from '../context/ERPContext';
import { Layout } from '../components/Layout';
import { Input, Button } from '../components/ui/Elements';
import { Wallet, TrendingUp, TrendingDown, DollarSign, Sparkles, X, UserPlus } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { CreateCustomerDTO } from '../types';
import { safeParseFloat } from '../lib/utils';
import { DEFAULT_COMMISSION_RATES } from '../constants';

const PHONE_REGEX = /^\d{0,10}$/;
const validateAddCustomer = (data: CreateCustomerDTO, existingPhones: string[]) => {
  const err: Record<string, string> = {};
  const name = data.name?.trim() || '';
  const phone = data.phone?.trim() || '';
  if (!name) err.name = 'Full name is required';
  else if (name.length < 2) err.name = 'Name must be at least 2 characters';
  if (!phone) err.phone = 'Phone number is required';
  else if (!/^\d{10}$/.test(phone)) err.phone = 'Phone must be exactly 10 digits';
  else if (existingPhones.includes(phone)) err.phone = 'This phone number is already registered';
  (['visa', 'master', 'amex', 'rupay'] as const).forEach(key => {
    const v = data.commissionRates[key];
    if (typeof v !== 'number' || isNaN(v) || v < 0 || v > 100) err[`rate_${key}`] = 'Must be 0–100%';
  });
  return err;
};

export const Dashboard: React.FC<{ onNavigate?: (view: string) => void }> = ({ onNavigate }) => {
  const { accounts, wallets, customers, addCustomer, formatCurrency, getAccountBalance } = useERP();
  const [showCashSummary, setShowCashSummary] = useState(false);
  const [showAddUser, setShowAddUser] = useState(false);
  const [addUserForm, setAddUserForm] = useState<CreateCustomerDTO>({
    name: '',
    phone: '',
    commissionRates: { ...DEFAULT_COMMISSION_RATES }
  });
  const [addUserErrors, setAddUserErrors] = useState<Record<string, string>>({});

  const totalCash = getAccountBalance('A001');
  const totalBank = getAccountBalance('A002') + getAccountBalance('A003');
  const totalWallet = wallets.reduce((sum, w) => sum + getAccountBalance(w.ledgerAccountId), 0);
  const totalIncome = getAccountBalance('I001') + getAccountBalance('I002');

  const cashAccounts = accounts.filter(a => a.category === 'Cash');
  const bankAccounts = accounts.filter(a => a.category === 'Bank');

  const walletData = wallets.map(w => ({
    name: w.name,
    balance: getAccountBalance(w.ledgerAccountId)
  }));

  const grandTotal = totalCash + totalBank + totalWallet;

  return (
    <Layout
      title="Financial Dashboard"
      headerAction={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAddUser(true)}
            className="p-3 rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 border-2 border-emerald-100 hover:border-emerald-200 transition-all duration-300 flex items-center gap-2 font-bold text-emerald-700 hover:shadow-lg hover:shadow-emerald-500/20 hover:scale-105 active:scale-95"
            title="Add new customer"
          >
            <UserPlus className="w-6 h-6 text-emerald-600" />
            <span className="hidden sm:inline text-sm">Add User</span>
          </button>
          <button
            type="button"
            onClick={() => setShowCashSummary(true)}
            className="p-3 rounded-2xl bg-gradient-to-br from-indigo-50 to-violet-50 border-2 border-indigo-100 hover:border-indigo-200 transition-all duration-300 flex items-center gap-2 font-bold text-indigo-700 hover:shadow-lg hover:shadow-indigo-500/20 hover:scale-105 active:scale-95"
            title="View cash & liquidity summary"
          >
            <Wallet className="w-6 h-6 text-indigo-600" />
            <span className="hidden sm:inline text-sm">Cash Summary</span>
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10 min-w-0">
        <MetricCard 
          title="Total Cash" 
          amount={formatCurrency(totalCash)} 
          icon={<DollarSign className="w-6 h-6 text-emerald-600" />} 
          trend="+2.5%" 
          color="emerald"
        />
        <MetricCard 
          title="Total Bank Balance" 
          amount={formatCurrency(totalBank)} 
          icon={<TrendingUp className="w-6 h-6 text-indigo-600" />} 
          trend="+0.8%" 
          color="indigo"
        />
        <MetricCard 
          title="Total Wallet Balance" 
          amount={formatCurrency(totalWallet)} 
          icon={<Wallet className="w-6 h-6 text-violet-600" />} 
          trend="-1.2%" 
          color="violet"
        />
        <MetricCard 
          title="Revenue (YTD)" 
          amount={formatCurrency(totalIncome)} 
          icon={<Sparkles className="w-6 h-6 text-amber-600" />} 
          trend="+12%" 
          color="amber"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white/95 backdrop-blur-md p-8 rounded-3xl border border-slate-100/80 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.06)] transition-all duration-300 hover:shadow-[0_25px_50px_-12px_rgba(0,0,0,0.1)]">
          <h2 className="text-xl font-bold text-slate-900 mb-6 tracking-tight flex items-center gap-2">
            <div className="p-2 bg-indigo-100 rounded-xl"><TrendingUp className="w-4 h-4 text-indigo-600" /></div>
            Wallet Liquidity Overview
          </h2>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={walletData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12, fontWeight: 600}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12, fontWeight: 600}} />
                <Tooltip 
                  cursor={{fill: 'rgba(99,102,241,0.08)'}}
                  contentStyle={{borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.15)'}}
                />
                <Bar dataKey="balance" fill="url(#barGradient)" radius={[8, 8, 0, 0]} barSize={52} />
                <defs>
                  <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" />
                    <stop offset="100%" stopColor="#8b5cf6" />
                  </linearGradient>
                </defs>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white/95 backdrop-blur-md p-8 rounded-3xl border border-slate-100/80 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.06)] transition-all duration-300 hover:shadow-[0_25px_50px_-12px_rgba(0,0,0,0.1)]">
            <h2 className="text-xl font-bold text-slate-900 mb-6 tracking-tight">Quick Actions</h2>
            <div className="space-y-4">
               <button
                 type="button"
                 onClick={() => onNavigate?.('masters')}
                 className="group w-full text-left px-6 py-4 rounded-2xl bg-gradient-to-r from-indigo-50 to-indigo-50/50 hover:from-indigo-100 hover:to-indigo-100/80 border border-indigo-100 transition-all duration-300 flex items-center gap-4 font-bold text-indigo-700 hover:scale-[1.02] active:scale-[0.98] hover:shadow-lg hover:shadow-indigo-500/10 cursor-pointer"
               >
                  <div className="p-3 bg-white rounded-xl shadow-sm group-hover:shadow-md transition-shadow"><TrendingUp size={20} className="text-indigo-600" /></div>
                  Daily Reconciliation
               </button>
               <button
                 type="button"
                 onClick={() => onNavigate?.('money-transfer')}
                 className="group w-full text-left px-6 py-4 rounded-2xl bg-gradient-to-r from-violet-50 to-violet-50/50 hover:from-violet-100 hover:to-violet-100/80 border border-violet-100 transition-all duration-300 flex items-center gap-4 font-bold text-violet-700 hover:scale-[1.02] active:scale-[0.98] hover:shadow-lg hover:shadow-violet-500/10 cursor-pointer"
               >
                  <div className="p-3 bg-white rounded-xl shadow-sm group-hover:shadow-md transition-shadow"><Wallet size={20} className="text-violet-600" /></div>
                  Transfer Cash to Bank
               </button>
               <button
                 type="button"
                 onClick={() => onNavigate?.('ledgers')}
                 className="group w-full text-left px-6 py-4 rounded-2xl bg-gradient-to-r from-amber-50 to-amber-50/50 hover:from-amber-100 hover:to-amber-100/80 border border-amber-100 transition-all duration-300 flex items-center gap-4 font-bold text-amber-700 hover:scale-[1.02] active:scale-[0.98] hover:shadow-lg hover:shadow-amber-500/10 cursor-pointer"
               >
                  <div className="p-3 bg-white rounded-xl shadow-sm group-hover:shadow-md transition-shadow"><TrendingDown size={20} className="text-amber-600" /></div>
                  Record Expense
               </button>
            </div>

            <h2 className="text-xl font-bold text-slate-900 mt-10 mb-4 tracking-tight">System Alerts</h2>
            <div className="space-y-4">
              <div className="flex items-start gap-4 p-5 bg-gradient-to-r from-rose-50 to-rose-50/50 border border-rose-200/80 rounded-2xl group hover:shadow-lg hover:shadow-rose-500/10 transition-all">
                 <div className="w-3 h-3 rounded-full bg-rose-500 mt-1.5 shrink-0 shadow-lg shadow-rose-500/40" />
                 <p className="font-bold text-rose-800">Wallet B is running low on balance (Below ₹10,000).</p>
              </div>
              <div className="flex items-start gap-4 p-5 bg-gradient-to-r from-amber-50 to-amber-50/50 border border-amber-200/80 rounded-2xl group hover:shadow-lg hover:shadow-amber-500/10 transition-all">
                 <div className="w-3 h-3 rounded-full bg-amber-500 mt-1.5 shrink-0 shadow-lg shadow-amber-500/40" />
                 <p className="font-bold text-amber-800">3 Transactions pending approval.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showAddUser && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[9999] p-4" onClick={() => setShowAddUser(false)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-fade-in border-2 border-white/20" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-emerald-50 to-teal-50">
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <UserPlus className="w-6 h-6 text-emerald-600" />
                Add New Customer
              </h2>
              <button onClick={() => setShowAddUser(false)} className="p-2 hover:bg-slate-200/60 rounded-xl transition-colors">
                <X size={20} className="text-slate-600" />
              </button>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const payload = { ...addUserForm, name: addUserForm.name.trim(), phone: addUserForm.phone.trim() };
                const err = validateAddCustomer(payload, customers.map(c => c.phone));
                if (Object.keys(err).length > 0) { setAddUserErrors(err); return; }
                const id = await addCustomer(payload);
                if (id) {
                  setShowAddUser(false);
                  setAddUserForm({ name: '', phone: '', commissionRates: { ...DEFAULT_COMMISSION_RATES } });
                  setAddUserErrors({});
                }
              }}
              className="p-6 space-y-4"
            >
              <Input label="Full Name" value={addUserForm.name} onChange={e => setAddUserForm({...addUserForm, name: e.target.value})} error={addUserErrors.name} placeholder="Enter full name" maxLength={100} required />
              <Input
                label="Phone Number"
                value={addUserForm.phone}
                onChange={e => { if (PHONE_REGEX.test(e.target.value)) { setAddUserForm({...addUserForm, phone: e.target.value}); if (addUserErrors.phone) setAddUserErrors(p => ({...p, phone: undefined})); } }}
                error={addUserErrors.phone}
                placeholder="10 digits only"
                maxLength={10}
                inputMode="numeric"
                required
              />
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                <p className="text-sm font-bold text-slate-700 mb-3">Commission / Service Charges (%)</p>
                <div className="grid grid-cols-2 gap-4">
                  <Input label="Visa" type="number" step="0.1" min={0} max={100} value={addUserForm.commissionRates.visa} onChange={e => setAddUserForm({...addUserForm, commissionRates: {...addUserForm.commissionRates, visa: safeParseFloat(e.target.value)}})} error={addUserErrors.rate_visa} />
                  <Input label="Master" type="number" step="0.1" min={0} max={100} value={addUserForm.commissionRates.master} onChange={e => setAddUserForm({...addUserForm, commissionRates: {...addUserForm.commissionRates, master: safeParseFloat(e.target.value)}})} error={addUserErrors.rate_master} />
                  <Input label="Amex" type="number" step="0.1" min={0} max={100} value={addUserForm.commissionRates.amex} onChange={e => setAddUserForm({...addUserForm, commissionRates: {...addUserForm.commissionRates, amex: safeParseFloat(e.target.value)}})} error={addUserErrors.rate_amex} />
                  <Input label="Rupay" type="number" step="0.1" min={0} max={100} value={addUserForm.commissionRates.rupay} onChange={e => setAddUserForm({...addUserForm, commissionRates: {...addUserForm.commissionRates, rupay: safeParseFloat(e.target.value)}})} error={addUserErrors.rate_rupay} />
                </div>
              </div>
              <Button type="submit" className="w-full">Create Customer</Button>
            </form>
          </div>
        </div>
      )}

      {showCashSummary && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[9999] p-4" onClick={() => setShowCashSummary(false)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-fade-in border-2 border-white/20" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-indigo-50 to-violet-50">
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <Wallet className="w-6 h-6 text-indigo-600" />
                Cash & Liquidity Summary
              </h2>
              <button onClick={() => setShowCashSummary(false)} className="p-2 hover:bg-slate-200/60 rounded-xl transition-colors">
                <X size={20} className="text-slate-600" />
              </button>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Cash in Hand</h3>
                <div className="space-y-2">
                  {cashAccounts.map(a => (
                    <div key={a.id} className="flex justify-between items-center py-2 px-4 bg-emerald-50 rounded-xl border border-emerald-100">
                      <span className="font-semibold text-slate-800">{a.name}</span>
                      <span className="font-bold text-emerald-700 tabular-nums">{formatCurrency(getAccountBalance(a.id))}</span>
                    </div>
                  ))}
                  <div className="flex justify-between items-center py-3 px-4 bg-emerald-100/80 rounded-xl border-2 border-emerald-200 font-bold">
                    <span>Total Cash</span>
                    <span className="text-emerald-800 tabular-nums">{formatCurrency(totalCash)}</span>
                  </div>
                </div>
              </div>
              <div>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Bank Balances</h3>
                <div className="space-y-2">
                  {bankAccounts.map(a => (
                    <div key={a.id} className="flex justify-between items-center py-2 px-4 bg-indigo-50 rounded-xl border border-indigo-100">
                      <span className="font-semibold text-slate-800">{a.name}</span>
                      <span className="font-bold text-indigo-700 tabular-nums">{formatCurrency(getAccountBalance(a.id))}</span>
                    </div>
                  ))}
                  <div className="flex justify-between items-center py-3 px-4 bg-indigo-100/80 rounded-xl border-2 border-indigo-200 font-bold">
                    <span>Total Bank</span>
                    <span className="text-indigo-800 tabular-nums">{formatCurrency(totalBank)}</span>
                  </div>
                </div>
              </div>
              <div>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Wallet Balances</h3>
                <div className="space-y-2">
                  {wallets.map(w => (
                    <div key={w.id} className="flex justify-between items-center py-2 px-4 bg-violet-50 rounded-xl border border-violet-100">
                      <span className="font-semibold text-slate-800">{w.name}</span>
                      <span className="font-bold text-violet-700 tabular-nums">{formatCurrency(getAccountBalance(w.ledgerAccountId))}</span>
                    </div>
                  ))}
                  <div className="flex justify-between items-center py-3 px-4 bg-violet-100/80 rounded-xl border-2 border-violet-200 font-bold">
                    <span>Total Wallet</span>
                    <span className="text-violet-800 tabular-nums">{formatCurrency(totalWallet)}</span>
                  </div>
                </div>
              </div>
              <div className="pt-4 border-t-2 border-slate-200">
                <div className="flex justify-between items-center py-4 px-6 bg-slate-900 text-white rounded-2xl font-black text-lg">
                  <span>Total Liquidity</span>
                  <span className="tabular-nums">{formatCurrency(grandTotal)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

const colorMap: Record<string, { bg: string; icon: string; accent: string }> = {
  emerald: 'from-emerald-500/20 to-emerald-600/10 border-emerald-200/60',
  indigo: 'from-indigo-500/20 to-indigo-600/10 border-indigo-200/60',
  violet: 'from-violet-500/20 to-violet-600/10 border-violet-200/60',
  amber: 'from-amber-500/20 to-amber-600/10 border-amber-200/60',
};

const MetricCard = ({ title, amount, icon, trend, color }: any) => (
  <div className={`group relative overflow-hidden bg-white/95 backdrop-blur-md p-8 rounded-3xl border-2 bg-gradient-to-br ${colorMap[color] || colorMap.indigo} transition-all duration-300 hover:-translate-y-2 hover:shadow-[0_25px_50px_-12px_rgba(0,0,0,0.15)] min-w-0`}>
    <div className="absolute top-0 right-0 w-32 h-32 bg-white/20 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl group-hover:scale-150 transition-transform duration-500" />
    <div className="relative flex items-start gap-3 mb-2">
      <div className="p-2.5 bg-white/90 rounded-xl shadow-md border border-white/80 shrink-0">
        {icon}
      </div>
      <p className="text-xs font-bold text-slate-600 uppercase tracking-widest pt-1">{title}</p>
    </div>
    <div className="relative min-w-0 pr-0">
      <h3 
        className="font-black text-slate-900 tracking-tight tabular-nums whitespace-nowrap"
        style={{ fontSize: 'clamp(0.7rem, 1.8vw + 0.5rem, 1.5rem)' }}
      >
        {amount}
      </h3>
    </div>
    <div className="relative flex items-center gap-2 text-sm font-bold text-emerald-600 mt-4">
      <span className="px-2 py-0.5 bg-emerald-100 rounded-lg">{trend}</span>
      <span className="text-slate-500 font-medium">vs last month</span>
    </div>
  </div>
);
