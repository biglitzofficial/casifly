import React, { useState, useEffect, useMemo } from 'react';
import { useERP } from '../context/ERPContext';
import { useToast } from '../context/ToastContext';
import { Layout } from '../components/Layout';
import { LedgerEntry, TransactionType, Transaction, Rates, Customer, PGConfig } from '../types';
import {
  isSwipePayInflow,
  isSwipeInflowMarginSettledInBooks,
  swipeInflowPendingMarginAmount,
} from '../lib/swipeTxnEconomics';
import { Card, CardContent, CardHeader, Input, Select, Button } from '../components/ui/Elements';
import { safeParseFloat, roundCurrency } from '../lib/utils';
import { DEFAULT_COMMISSION_RATES } from '../constants';
import { ArrowRight, ArrowDownToLine, ArrowUpFromLine, Lock, Unlock, CheckCircle2, Info, UserPlus, Save, X, Users } from 'lucide-react';
import { TypedRecentTransactionsCard } from '../components/TypedRecentTransactionsCard';
import { TransactionEditRouter } from '../components/TransactionEditRouter';
import { TEMP_ALLOW_LEDGER_REPORT_PL_EDIT } from '../lib/tempUiFlags';

/** Coerce wallet/API PG charge values (number or string) to a safe rate. */
function coercePgRate(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' && Number.isFinite(v) ? v : safeParseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

/** Use Masters → Wallets PG card-wise % only (normalized keys visa/master/amex/rupay). */
function portalPctFromPg(pg: PGConfig | undefined, cardType: string): number {
  if (!pg?.charges) return 0;
  const c = pg.charges as unknown as Record<string, unknown>;
  const raw = c[cardType as keyof Rates as string];
  return roundCurrency(coercePgRate(raw));
}

export const SwipePay: React.FC = () => {
  const { customers, wallets, transactions, accounts, postTransaction, formatCurrency, getAccountBalance, addCustomer, updateCustomer, updateTransaction } = useERP();
  const toast = useToast();

  // --- Mode: Inflow or Outflow (separate entries) ---
  const [mode, setMode] = useState<'inflow' | 'outflow'>('inflow');

  // --- Step 1: Customer & Inflow Details ---
  const [phone, setPhone] = useState('');
  const [isPhoneLocked, setIsPhoneLocked] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [step1Errors, setStep1Errors] = useState<Record<string, string>>({});
  const [step2Errors, setStep2Errors] = useState<Record<string, string>>({});
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [isNewCustomer, setIsNewCustomer] = useState(false);
  const toRateStrings = (r: Rates) => ({ visa: String(r.visa), master: String(r.master), amex: String(r.amex), rupay: String(r.rupay) });
  const [commissionRates, setCommissionRates] = useState<Record<keyof Rates, string>>(toRateStrings(DEFAULT_COMMISSION_RATES));

  const [swipeWalletId, setSwipeWalletId] = useState(wallets[0]?.id || '');
  const [pgName, setPgName] = useState('');
  const [cardType, setCardType] = useState('visa');
  const [swipeAmount, setSwipeAmount] = useState<string>('');
  const [currentServiceRate, setCurrentServiceRate] = useState<string>('0');
  /** Editable margin % for this swipe (not the wallet PG / portal MDR). */
  const [ourChargeRate, setOurChargeRate] = useState<string>('0');

  // --- Step 2: Outflow / Payout Details ---
  const [outflowWalletId, setOutflowWalletId] = useState(wallets[0]?.id || ''); // Pay FROM this wallet (money leaves wallet)
  const [payoutAmount, setPayoutAmount] = useState<string>('');
  const [transferCommission, setTransferCommission] = useState<string>('0'); // e.g. IMPS charge
  const [extraCharges, setExtraCharges] = useState<string>('0'); // added to P&L profit on linked inflow
  const [transactionNote, setTransactionNote] = useState('');
  const [inflowLoading, setInflowLoading] = useState(false);
  const [outflowLoading, setOutflowLoading] = useState(false);
  const [createCustLoading, setCreateCustLoading] = useState(false);
  const [linkedInflowId, setLinkedInflowId] = useState('');
  const [outflowPickerQuery, setOutflowPickerQuery] = useState('');
  const [editingTxn, setEditingTxn] = useState<Transaction | null>(null);

  /** All Swipe & Pay journals — shown below the workflow for audit / correction. */
  const swipePayList = useMemo(
    () => transactions.filter((t) => t.type === TransactionType.SWIPE_PAY),
    [transactions],
  );

  /** All swipe inflows still awaiting linked payout (margin in L003). */
  const allPendingSwipeInflows = useMemo(
    () =>
      transactions.filter(
        (t) =>
          t.type === TransactionType.SWIPE_PAY &&
          t.status === 'COMPLETED' &&
          !!t.metadata?.customerId &&
          isSwipePayInflow(t) &&
          swipeInflowPendingMarginAmount(t) > 0.005 &&
          !isSwipeInflowMarginSettledInBooks(t.id, transactions)
      ),
    [transactions]
  );

  /** Customers with at least one pending inflow — primary outflow picker (handles high daily volume). */
  const customersWithPendingSwipe = useMemo(() => {
    const byCust = new Map<string, { customer: Customer; inflows: Transaction[]; latest: number }>();
    for (const t of allPendingSwipeInflows) {
      const cid = t.metadata!.customerId!;
      const cust = customers.find((c) => c.id === cid);
      if (!cust) continue;
      const d = new Date(t.date).getTime();
      const ex = byCust.get(cid);
      if (!ex) {
        byCust.set(cid, { customer: cust, inflows: [t], latest: d });
      } else {
        ex.inflows.push(t);
        if (d > ex.latest) ex.latest = d;
      }
    }
    return Array.from(byCust.values()).sort((a, b) => b.latest - a.latest);
  }, [allPendingSwipeInflows, customers]);

  const filteredPendingCustomers = useMemo(() => {
    const raw = outflowPickerQuery.trim();
    const q = raw.toLowerCase();
    const digits = raw.replace(/\D/g, '');
    if (!q && !digits) return customersWithPendingSwipe;
    return customersWithPendingSwipe.filter(({ customer }) => {
      const nameMatch = q.length > 0 && customer.name.toLowerCase().includes(q);
      const phoneMatch = digits.length > 0 && customer.phone.includes(digits);
      return nameMatch || phoneMatch;
    });
  }, [customersWithPendingSwipe, outflowPickerQuery]);

  const unsettledInflows = useMemo(() => {
    if (!customerId || mode !== 'outflow') return [];
    return allPendingSwipeInflows.filter((t) => t.metadata?.customerId === customerId);
  }, [allPendingSwipeInflows, customerId, mode]);

  // --- Logic ---
  const selectedWallet = wallets.find(w => w.id === swipeWalletId);
  /** When wallet changes, keep current PG if it exists on the new wallet; else first PG. */
  useEffect(() => {
    const w = wallets.find((x) => x.id === swipeWalletId);
    if (!w?.pgs?.length) {
      setPgName('');
      return;
    }
    setPgName((prev) => (prev && w.pgs.some((p) => p.name === prev) ? prev : w.pgs[0].name));
  }, [swipeWalletId, wallets]);

  useEffect(() => {
    const rate = commissionRates[cardType as keyof Rates] ?? '0';
    setCurrentServiceRate(String(rate));
    setOurChargeRate(String(rate));
  }, [cardType, commissionRates]);

  useEffect(() => {
    if (!linkedInflowId) return;
    if (!unsettledInflows.some((t) => t.id === linkedInflowId)) setLinkedInflowId('');
  }, [unsettledInflows, linkedInflowId]);

  const handlePhoneSearch = () => {
    if (phone.length !== 10) return;
    const found = customers.find(c => c.phone === phone);
    if (found) {
      setCustomerId(found.id);
      setCustomerName(found.name);
      setCommissionRates(toRateStrings(found.commissionRates));
      setIsNewCustomer(false);
      setIsPhoneLocked(true);
    } else {
      setCustomerId(null);
      setCustomerName(''); 
      setCommissionRates(toRateStrings(DEFAULT_COMMISSION_RATES));
      setIsNewCustomer(true);
      setIsPhoneLocked(true);
    }
  };

  const resetCustomer = () => {
    setIsPhoneLocked(false);
    setCustomerId(null);
    setCustomerName('');
    setPhone('');
    setIsNewCustomer(false);
    setLinkedInflowId('');
  };

  const selectOutflowCustomer = (cust: Customer) => {
    setCustomerId(cust.id);
    setCustomerName(cust.name);
    setPhone(cust.phone);
    setCommissionRates(toRateStrings(cust.commissionRates));
    setIsNewCustomer(false);
    setIsPhoneLocked(true);
    setLinkedInflowId('');
  };

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    const err: Record<string, string> = {};
    if (!customerName?.trim()) err.customerName = 'Full name is required';
    else if (customerName.trim().length < 2) err.customerName = 'Name must be at least 2 characters';
    if (phone.length !== 10) err.phone = 'Phone must be exactly 10 digits';
    setStep1Errors(err);
    if (Object.keys(err).length > 0) return;

    setCreateCustLoading(true);
    try {
      const parsedRates: Rates = {
        visa: safeParseFloat(commissionRates.visa),
        master: safeParseFloat(commissionRates.master),
        amex: safeParseFloat(commissionRates.amex),
        rupay: safeParseFloat(commissionRates.rupay)
      };
      const newId = await addCustomer({
        name: customerName,
        phone,
        commissionRates: parsedRates
      });
      if (!newId) return;
      setCustomerId(newId);
      setCommissionRates(toRateStrings(parsedRates));
      setIsNewCustomer(false); // Switch to "swipe" mode for this existing customer
    } finally {
      setCreateCustLoading(false);
    }
  };

  // Calculations — portal % always from Masters → Wallets for the selected PG + card (not customer commission).
  const selectedPG =
    !selectedWallet?.pgs?.length
      ? undefined
      : pgName
        ? selectedWallet.pgs.find((p) => p.name === pgName)
        : selectedWallet.pgs[0];
  const resolvedPortalPct = portalPctFromPg(selectedPG, cardType);
  const amountVal = safeParseFloat(swipeAmount);
  const serviceRateVal = safeParseFloat(currentServiceRate);
  const ourRateVal = safeParseFloat(ourChargeRate);
  const serviceFeeAmount = roundCurrency((amountVal * serviceRateVal) / 100);
  const ourChargeAmount = roundCurrency((amountVal * ourRateVal) / 100);

  const portalFeeAmount = roundCurrency((amountVal * resolvedPortalPct) / 100);

  const netPayableToCustomer = roundCurrency(amountVal - serviceFeeAmount);
  const estimatedProfit = roundCurrency(ourChargeAmount - portalFeeAmount);

  // Payout Math (Step 2) - Transfer fee is an expense that reduces net outflow
  const payVal = safeParseFloat(payoutAmount);
  const transCommVal = safeParseFloat(transferCommission);
  const extraChargesVal = safeParseFloat(extraCharges);
  const finalPayoutResult = roundCurrency(Math.max(0, payVal - transCommVal));

  const handleStep1Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err: Record<string, string> = {};
    if (!swipeAmount?.trim()) err.swipeAmount = 'Swipe amount is required';
    else if (amountVal <= 0) err.swipeAmount = 'Swipe amount must be greater than 0';
    const rateVal = safeParseFloat(currentServiceRate);
    if (isNaN(rateVal) || rateVal < 0 || rateVal > 100) err.currentServiceRate = 'Rate must be between 0 and 100%';
    const ourVal = safeParseFloat(ourChargeRate);
    if (isNaN(ourVal) || ourVal < 0 || ourVal > 100) err.ourChargeRate = 'Our charge must be between 0 and 100%';
    setStep1Errors(err);
    if (Object.keys(err).length > 0 || !selectedWallet || !customerId) return;
    if (!selectedWallet.pgs?.length) {
      toast.error('This wallet has no payment gateway. Add one in Masters → Wallets.');
      return;
    }
    const pgForPost = pgName ? selectedWallet.pgs.find((p) => p.name === pgName) : undefined;
    if (!pgForPost) {
      toast.error('Select a payment gateway for this inflow.');
      return;
    }
    const portalPctPosted = portalPctFromPg(pgForPost, cardType);
    const portalFeePosted = roundCurrency((amountVal * portalPctPosted) / 100);

    setInflowLoading(true);
    try {
    // Update customer rates if the specific one was edited during this transaction
    const parsedRates: Rates = {
      visa: safeParseFloat(commissionRates.visa),
      master: safeParseFloat(commissionRates.master),
      amex: safeParseFloat(commissionRates.amex),
      rupay: safeParseFloat(commissionRates.rupay)
    };
    const updatedRates = { ...parsedRates, [cardType]: serviceRateVal };
    updateCustomer(customerId, { commissionRates: updatedRates });

    // 1. Inflow transaction
    const inflowEntries: LedgerEntry[] = [
      { accountId: selectedWallet.ledgerAccountId, debit: amountVal, credit: 0 },
      { accountId: 'L001', debit: 0, credit: amountVal },
      { accountId: 'E001', debit: portalFeePosted, credit: 0 },
      { accountId: selectedWallet.ledgerAccountId, debit: 0, credit: portalFeePosted },
      { accountId: 'L001', debit: serviceFeeAmount, credit: 0 },
      { accountId: 'L003', debit: 0, credit: serviceFeeAmount }
    ];
      const p = postTransaction(
        `Swipe Inflow: ${customerName} (${cardType.toUpperCase()})`,
        TransactionType.SWIPE_PAY,
        inflowEntries,
        {
          customerId: customerId || undefined,
          walletId: selectedWallet.id,
          cardType: cardType,
          pgName: pgForPost.name,
          customerChargePct: serviceRateVal,
          ourChargePct: ourVal,
        }
      );
      if (p && typeof (p as Promise<unknown>).then === 'function') await p;

    // Outflow is recorded separately from Outflow tab when you actually transfer to customer.
    // Wallet balance shows inflow only until outflow is recorded; then balance = inflow − outflow.
    setStep1Errors({});
    toast.success('Inflow recorded! Record payout from Outflow tab when you transfer.');
    setSwipeAmount('');
    } finally { setInflowLoading(false); }
  };

  const handleStep2Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err: Record<string, string> = {};
    if (!payoutAmount?.trim()) err.payoutAmount = 'Settlement amount is required';
    else if (payVal <= 0) err.payoutAmount = 'Settlement amount must be greater than 0';
    if (transferCommission !== '' && (isNaN(transCommVal) || transCommVal < 0)) err.transferCommission = 'Transfer fee must be 0 or more';
    if (transCommVal > payVal) err.transferCommission = 'Transfer fee cannot exceed settlement amount';
    if (extraCharges !== '' && (isNaN(extraChargesVal) || extraChargesVal < 0)) err.extraCharges = 'Extra charges must be 0 or more';
    if (!linkedInflowId.trim()) {
      if (extraChargesVal > 0.005) {
        err.linkedInflow = 'Link the swipe inflow so extra charges add to that row’s net profit in Transaction P&L.';
      } else if (unsettledInflows.length > 0) {
        err.linkedInflow = 'Select the swipe inflow this payout settles to recognise margin in P&L.';
      }
    }
    setStep2Errors(err);
    if (Object.keys(err).length > 0) return;

    // Ledger: Pay FROM wallet (money leaves wallet). L001 reduced by payVal; transfer fee is our expense.
    const outflowWallet = wallets.find(w => w.id === outflowWalletId);
    if (!outflowWallet) {
      toast.error('Please select a wallet to pay from.');
      return;
    }
    const linkId = linkedInflowId.trim();
    let marginToRecognize = 0;
    if (linkId) {
      const linked = transactions.find(t => t.id === linkId);
      if (!linked || linked.metadata?.customerId !== customerId) {
        toast.error('Invalid linked inflow for this customer.');
        return;
      }
      marginToRecognize = swipeInflowPendingMarginAmount(linked);
      if (marginToRecognize < 0.005) {
        toast.error('Selected inflow has no pending margin (L003) to recognise.');
        return;
      }
      if (isSwipeInflowMarginSettledInBooks(linkId, transactions)) {
        toast.error('This inflow margin was already recognised.');
        return;
      }
    }
    setOutflowLoading(true);
    try {
    const totalFromWallet = roundCurrency(payVal + transCommVal);
    const entries: LedgerEntry[] = [
      { accountId: 'L001', debit: payVal, credit: 0 },
      { accountId: outflowWallet.ledgerAccountId, debit: 0, credit: totalFromWallet }
    ];
    if (transCommVal > 0) {
      entries.push({ accountId: 'E001', debit: transCommVal, credit: 0 });
    }
    if (marginToRecognize > 0.005) {
      entries.push(
        { accountId: 'L003', debit: marginToRecognize, credit: 0 },
        { accountId: 'I001', debit: 0, credit: marginToRecognize }
      );
    }
    if (extraChargesVal > 0.005) {
      entries.push(
        { accountId: 'L001', debit: extraChargesVal, credit: 0 },
        { accountId: 'I001', debit: 0, credit: extraChargesVal }
      );
    }

      const p = postTransaction(
        `Payout Outflow: ${customerName}${extraChargesVal > 0.005 ? ` (+${extraChargesVal} extra)` : ''}`,
        TransactionType.SWIPE_PAY,
        entries,
        {
          customerId: customerId || undefined,
          walletId: outflowWallet.id,
          relatedInflowId: linkId || undefined,
          extraCharges: extraChargesVal > 0.005 ? extraChargesVal : undefined,
          transferFee: transCommVal > 0.005 ? transCommVal : undefined,
        }
      );
      if (p && typeof (p as Promise<unknown>).then === 'function') await p;

    toast.success('Outflow recorded successfully!');
    setLinkedInflowId('');
    resetCustomer();
    setPayoutAmount('');
    setTransferCommission('0');
    setExtraCharges('0');
    setStep2Errors({});
    } finally { setOutflowLoading(false); }
  };

  const updateNewCustRate = (type: keyof Rates, val: string) => {
    setCommissionRates(prev => ({
      ...prev,
      [type]: val
    }));
  };

  return (
    <Layout title="Swipe & Pay">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
        
        <div className="lg:col-span-2 space-y-6">
          {/* Mode Tabs: Separate Inflow | Outflow entries */}
          <div className="flex gap-2 p-2 bg-slate-100 rounded-2xl">
            <button
              type="button"
              onClick={() => { setMode('inflow'); resetCustomer(); setSwipeAmount(''); setStep1Errors({}); setLinkedInflowId(''); }}
              className={`flex-1 flex items-center justify-center gap-2 py-4 px-6 rounded-xl font-bold text-sm uppercase tracking-wider transition-all ${mode === 'inflow' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-600 hover:bg-slate-200'}`}
            >
              <ArrowDownToLine size={20} /> Inflow Entry
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('outflow');
                resetCustomer();
                setOutflowPickerQuery('');
                setPayoutAmount('');
                setTransferCommission('0');
                setExtraCharges('0');
                setStep2Errors({});
                setLinkedInflowId('');
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-4 px-6 rounded-xl font-bold text-sm uppercase tracking-wider transition-all ${mode === 'outflow' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-600 hover:bg-slate-200'}`}
            >
              <ArrowUpFromLine size={20} /> Outflow Entry
            </button>
          </div>

          <Card className={`border-t-4 ${mode === 'inflow' ? 'border-t-indigo-500' : 'border-t-emerald-500'}`}>
            <CardHeader 
              title={mode === 'inflow' ? "Inflow Data Entry" : "Outflow Data Entry"} 
              subtitle={
                mode === 'inflow'
                  ? 'Record customer swipe (inflow)'
                  : 'Pick who received a swipe inflow, then record their payout'
              }
            />
            <CardContent>
              {mode === 'inflow' ? (
                <div className="space-y-6">
                  {/* Phone Validation Section */}
                  <div className="p-5 bg-slate-50/80 rounded-xl border border-slate-200 space-y-4">
                    <div className="flex items-end gap-3">
                      <div className="flex-1">
                         <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                           {isPhoneLocked ? <Lock size={14}/> : <Unlock size={14}/>} Mobile Number (10 Digits)
                         </label>
                         <div className="relative">
                           <input 
                              type="text"
                              maxLength={10}
                              className={`w-full px-4 py-3 border rounded-xl outline-none transition-all duration-200 text-lg font-mono ${isPhoneLocked ? 'bg-slate-100 text-slate-500 border-slate-300' : 'border-indigo-300 focus:ring-2 focus:ring-indigo-500/30 font-bold'}`}
                              value={phone}
                              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                              disabled={isPhoneLocked}
                              placeholder="00000 00000"
                           />
                         </div>
                      </div>
                      {isPhoneLocked ? (
                        <Button type="button" variant="outline" onClick={resetCustomer} className="h-[52px]">Change</Button>
                      ) : (
                        <Button type="button" onClick={handlePhoneSearch} disabled={phone.length !== 10} className="h-[52px]">Search</Button>
                      )}
                    </div>
                    
                    {isPhoneLocked && !isNewCustomer && (
                       <div className="p-4 bg-white rounded-xl border border-slate-200 flex justify-between items-center animate-fade-in shadow-sm">
                         <div>
                           <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Linked Profile</p>
                           <p className="font-bold text-slate-900">{customerName}</p>
                         </div>
                         <div className="text-emerald-600"><CheckCircle2 size={20}/></div>
                       </div>
                    )}
                  </div>

                  {/* New Customer Form */}
                  {isPhoneLocked && isNewCustomer && (
                    <div className="p-6 bg-amber-50 rounded-2xl border border-amber-200 space-y-6 animate-fade-in shadow-card">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2 text-amber-800 font-bold">
                          <UserPlus size={20}/> CREATE NEW CUSTOMER
                        </div>
                        <button onClick={resetCustomer} className="text-amber-500 hover:text-amber-700 p-1 rounded-lg hover:bg-amber-100 transition-colors"><X size={20}/></button>
                      </div>
                      
                      <form onSubmit={handleCreateCustomer} className="space-y-4">
                        <Input 
                          label="Full Customer Name" 
                          placeholder="e.g. John Doe"
                          value={customerName}
                          onChange={e => { setCustomerName(e.target.value); setStep1Errors(p => ({...p, customerName: ''})); }}
                          error={step1Errors.customerName}
                        />
                        
                        <div className="bg-white p-4 rounded-xl border border-amber-100 space-y-3">
                          <p className="text-xs font-bold text-amber-700 uppercase tracking-widest">Card-Wise Commission Setup (%)</p>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <Input label="Visa" type="number" step="0.1" value={commissionRates.visa} onChange={e => updateNewCustRate('visa', e.target.value)} />
                            <Input label="Master" type="number" step="0.1" value={commissionRates.master} onChange={e => updateNewCustRate('master', e.target.value)} />
                            <Input label="Amex" type="number" step="0.1" value={commissionRates.amex} onChange={e => updateNewCustRate('amex', e.target.value)} />
                            <Input label="Rupay" type="number" step="0.1" value={commissionRates.rupay} onChange={e => updateNewCustRate('rupay', e.target.value)} />
                          </div>
                        </div>

                        <Button type="submit" className="w-full bg-amber-600 hover:bg-amber-700" loading={createCustLoading}>
                          <Save size={18}/> Save & Continue Transaction
                        </Button>
                      </form>
                    </div>
                  )}

                  {/* Transaction Details (Only if customer is identified/created) */}
                  {isPhoneLocked && !isNewCustomer && (
                    <form onSubmit={handleStep1Submit} className="space-y-6 animate-fade-in">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Select label="Inflow Wallet" value={swipeWalletId} onChange={e => setSwipeWalletId(e.target.value)} options={wallets.map(w => ({ label: w.name, value: w.id }))} />
                        <div className="space-y-2">
                          <Select
                            label="Payment gateway"
                            value={pgName}
                            onChange={(e) => setPgName(e.target.value)}
                            options={
                              (selectedWallet?.pgs?.length ?? 0) > 0
                                ? selectedWallet!.pgs.map((p) => ({ label: p.name, value: p.name }))
                                : [{ label: 'Add a PG in Masters → Wallets', value: '' }]
                            }
                            disabled={!selectedWallet?.pgs?.length}
                          />
                          <div
                            className="flex items-center justify-between gap-3 rounded-xl border-2 border-slate-200 dark:border-slate-600 bg-slate-50/90 dark:bg-slate-800/60 px-4 py-2.5"
                            title="Portal MDR from Masters → Wallets for this PG and card type (not our charge)"
                          >
                            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                              PG % · {cardType}
                            </span>
                            <span className="text-sm font-black text-slate-800 dark:text-slate-100 tabular-nums">
                              {selectedPG ? `${resolvedPortalPct}%` : '—'}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Select label="Card Type" value={cardType} onChange={e => setCardType(e.target.value)} options={[{label:'Visa',value:'visa'},{label:'Master',value:'master'},{label:'Amex',value:'amex'},{label:'Rupay',value:'rupay'}]} />
                        <Input label="Swipe Amount (₹)" type="number" className="text-xl font-bold" value={swipeAmount} onChange={e => { setSwipeAmount(e.target.value); setStep1Errors(p => ({...p, swipeAmount: ''})); }} error={step1Errors.swipeAmount} placeholder="0" />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Input label="Customer charge %" type="number" step="0.1" value={currentServiceRate} onChange={e => { setCurrentServiceRate(e.target.value); setStep1Errors(p => ({...p, currentServiceRate: ''})); }} error={step1Errors.currentServiceRate} title="Total fee % charged to the customer for this card" />
                        <Input label="Our charge %" type="number" step="0.1" value={ourChargeRate} onChange={e => { setOurChargeRate(e.target.value); setStep1Errors(p => ({...p, ourChargeRate: ''})); }} error={step1Errors.ourChargeRate} title="Your margin % on this swipe (editable per deal — separate from PG % above)" />
                      </div>
                      <Button type="submit" size="lg" className="w-full h-14 text-lg" loading={inflowLoading}>Process Inflow <ArrowRight size={20}/></Button>
                    </form>
                  )}
                </div>
              ) : (
                <div className="space-y-6 animate-fade-in">
                  {!isPhoneLocked || isNewCustomer ? (
                    <div className="space-y-4">
                      <div className="p-4 bg-emerald-50/90 rounded-xl border border-emerald-100 flex gap-3 items-start">
                        <Users className="text-emerald-700 shrink-0 mt-0.5" size={20} />
                        <div className="text-sm text-emerald-900">
                          <p className="font-bold">Customers with pending swipe settlement</p>
                          <p className="text-emerald-800/90 mt-1">
                            These are people who have an inflow recorded but payout (and margin recognition) is not linked yet.
                            Tap one to continue, or search by phone below if they are not listed.
                          </p>
                        </div>
                      </div>
                      <Input
                        label="Filter by name or phone"
                        placeholder="Search…"
                        value={outflowPickerQuery}
                        onChange={(e) => setOutflowPickerQuery(e.target.value)}
                        className="font-medium"
                      />
                      <div className="max-h-[min(24rem,50vh)] overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                        {filteredPendingCustomers.length === 0 ? (
                          <p className="p-4 text-sm text-slate-600">
                            {customersWithPendingSwipe.length === 0
                              ? 'No pending swipe inflows to settle. Record an inflow first, or use phone search for other payouts.'
                              : 'No customers match your search.'}
                          </p>
                        ) : (
                          <ul className="divide-y divide-slate-100">
                            {filteredPendingCustomers.map(({ customer: c, inflows }) => {
                              const pendingMargin = roundCurrency(
                                inflows.reduce((sum, t) => sum + swipeInflowPendingMarginAmount(t), 0)
                              );
                              const latest = Math.max(...inflows.map((t) => new Date(t.date).getTime()));
                              return (
                                <li key={c.id}>
                                  <button
                                    type="button"
                                    onClick={() => selectOutflowCustomer(c)}
                                    className="w-full text-left px-4 py-3.5 hover:bg-emerald-50/90 transition-colors flex flex-wrap items-center justify-between gap-3"
                                  >
                                    <div>
                                      <p className="font-bold text-slate-900">{c.name}</p>
                                      <p className="text-sm font-mono text-slate-500 tracking-tight">{c.phone}</p>
                                    </div>
                                    <div className="text-right shrink-0">
                                      <p className="text-xs font-bold text-emerald-800 uppercase tracking-wide">
                                        {inflows.length} inflow{inflows.length !== 1 ? 's' : ''} pending
                                      </p>
                                      <p className="text-xs text-slate-600 mt-0.5">
                                        Margin {formatCurrency(pendingMargin)} ·{' '}
                                        {new Date(latest).toLocaleString(undefined, {
                                          dateStyle: 'short',
                                          timeStyle: 'short',
                                        })}
                                      </p>
                                    </div>
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                      <div className="p-5 bg-slate-50/80 rounded-xl border border-slate-200 space-y-4">
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Or search by phone</p>
                        <div className="flex items-end gap-3">
                          <div className="flex-1">
                            <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                              <Unlock size={14} /> Mobile Number (10 Digits)
                            </label>
                            <input
                              type="text"
                              maxLength={10}
                              className="w-full px-4 py-3 border border-emerald-300 rounded-xl outline-none transition-all duration-200 text-lg font-mono focus:ring-2 focus:ring-emerald-500/30 font-bold"
                              value={phone}
                              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                              placeholder="00000 00000"
                            />
                          </div>
                          <Button
                            type="button"
                            onClick={handlePhoneSearch}
                            disabled={phone.length !== 10}
                            className="h-[52px] bg-emerald-600 hover:bg-emerald-700"
                          >
                            Search
                          </Button>
                        </div>
                        {isPhoneLocked && isNewCustomer && (
                          <p className="text-sm text-amber-700">Customer not found. Create via Inflow first.</p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="p-5 bg-slate-50/80 rounded-xl border border-slate-200 space-y-4">
                      <div className="p-4 bg-white rounded-xl border border-slate-200 flex justify-between items-center gap-3">
                        <div>
                          <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Selected customer</p>
                          <p className="font-bold text-slate-900">{customerName}</p>
                          <p className="text-sm font-mono text-slate-600 mt-0.5">{phone}</p>
                        </div>
                        <CheckCircle2 className="text-emerald-600 shrink-0" size={22} />
                      </div>
                      <Button type="button" variant="outline" onClick={() => { resetCustomer(); setOutflowPickerQuery(''); }} className="w-full sm:w-auto">
                        Change customer
                      </Button>
                    </div>
                  )}

                  {isPhoneLocked && !isNewCustomer && (
                    <form onSubmit={handleStep2Submit} className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Input label="Settlement Amount (₹)" type="number" value={payoutAmount} onChange={e => { setPayoutAmount(e.target.value); setStep2Errors(p => ({...p, payoutAmount: ''})); }} className="font-bold" error={step2Errors.payoutAmount} placeholder="0" />
                        <Input label="Wallet Transfer Fee (₹)" type="number" value={transferCommission} onChange={e => { setTransferCommission(e.target.value); setStep2Errors(p => ({...p, transferCommission: ''})); }} error={step2Errors.transferCommission} placeholder="0" />
                        <Input label="Extra charges (₹)" type="number" value={extraCharges} onChange={e => { setExtraCharges(e.target.value); setStep2Errors(p => ({...p, extraCharges: ''})); }} error={step2Errors.extraCharges} placeholder="0" title="Additional income on this payout — added directly to net profit in Transaction P&L when inflow is linked" />
                      </div>
                      <Select 
                        label="Pay From Wallet" 
                        value={outflowWalletId} 
                        onChange={e => setOutflowWalletId(e.target.value)} 
                        options={wallets.map(w => ({ label: `${w.name} (${formatCurrency(getAccountBalance(w.ledgerAccountId))})`, value: w.id }))} 
                      />
                      {unsettledInflows.length > 0 && (
                        <div>
                          <Select
                            label="Link swipe inflow (recognises margin in P&L)"
                            value={linkedInflowId}
                            onChange={(e) => {
                              setLinkedInflowId(e.target.value);
                              setStep2Errors((p) => ({ ...p, linkedInflow: '' }));
                            }}
                            options={[
                              { label: '— Select matching inflow —', value: '' },
                              ...unsettledInflows.map((t) => ({
                                value: t.id,
                                label: `${new Date(t.date).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })} · pending margin ${formatCurrency(swipeInflowPendingMarginAmount(t))}`,
                              })),
                            ]}
                          />
                          {step2Errors.linkedInflow ? (
                            <p className="mt-2 text-sm font-medium text-rose-600">{step2Errors.linkedInflow}</p>
                          ) : null}
                        </div>
                      )}
                      <Input label="Internal Note" placeholder="IMPS Ref / Transfer Reason" value={transactionNote} onChange={e => setTransactionNote(e.target.value)} />
                      <Button type="submit" variant="success" size="lg" className="w-full" loading={outflowLoading}>Record Outflow</Button>
                    </form>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* --- SIDE CALCULATION PANEL --- */}
        <div className="space-y-6">
          <Card className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] border-0 overflow-hidden">
            <CardHeader 
              title="Live Billing Math" 
              subtitle="Real-time calculation breakdown" 
              className="bg-gradient-to-r from-indigo-900/90 to-slate-800 border-slate-600/50 [&>div>h3]:text-white [&>div>h3]:text-xl [&>div>p]:text-slate-300"
            />
            <CardContent className="bg-slate-800/50 rounded-2xl mx-4 mb-4 p-6 border border-slate-600/50">
              {mode === 'inflow' ? (
                <div className="space-y-6">
                   <div className="flex justify-between items-center">
                     <span className="text-base font-semibold text-slate-200">Swipe Amount</span>
                     <span className="text-2xl font-black text-white tabular-nums">{formatCurrency(amountVal)}</span>
                   </div>
                   <div className="flex justify-between items-center">
                     <span className="text-base font-semibold text-rose-300">PG charge ({resolvedPortalPct}%)</span>
                     <span className="text-lg font-bold text-white tabular-nums">-{formatCurrency(portalFeeAmount)}</span>
                   </div>
                   <div className="flex justify-between items-center">
                     <span className="text-base font-semibold text-indigo-300">Customer charge ({serviceRateVal}%)</span>
                     <span className="text-lg font-bold text-white tabular-nums">-{formatCurrency(serviceFeeAmount)}</span>
                   </div>
                   <div className="flex justify-between items-center pb-5 border-b-2 border-slate-600">
                     <span className="text-base font-semibold text-violet-300">Our charge ({ourRateVal}%)</span>
                     <span className="text-lg font-bold text-white tabular-nums">{formatCurrency(ourChargeAmount)}</span>
                   </div>
                   <div className="pt-5">
                     <p className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-2">Net Payable to Customer</p>
                     <p className="text-4xl font-black text-indigo-300 tabular-nums">{formatCurrency(netPayableToCustomer)}</p>
                   </div>
                   <div className="mt-6 pt-5 border-t-2 border-slate-600 space-y-2">
                     <p className="text-xs font-semibold text-slate-400 leading-snug">
                       PG % is from Masters (portal MDR). Our charge % is your margin on this swipe. Pre-settlement estimate = our charge − PG fee.
                     </p>
                     <div className="flex justify-between items-center">
                       <span className="text-base font-semibold text-slate-300">Pre-settlement estimate</span>
                       <span className="text-xl font-black text-amber-300/90 tabular-nums">+{formatCurrency(estimatedProfit)}</span>
                     </div>
                   </div>
                </div>
              ) : (
                <div className="space-y-6">
                   <div className="flex justify-between items-center">
                     <span className="text-base font-semibold text-slate-200">Liability Settle</span>
                     <span className="text-2xl font-black text-white tabular-nums">{formatCurrency(payVal)}</span>
                   </div>
                   <div className="flex justify-between items-center">
                     <span className="text-base font-semibold text-rose-300">Transfer Commission</span>
                     <span className="text-lg font-bold text-white tabular-nums">+{formatCurrency(transCommVal)}</span>
                   </div>
                   {extraChargesVal > 0.005 && (
                     <div className="flex justify-between items-center pb-5 border-b-2 border-slate-600">
                       <span className="text-base font-semibold text-amber-300">Extra charges (→ profit)</span>
                       <span className="text-lg font-bold text-amber-200 tabular-nums">+{formatCurrency(extraChargesVal)}</span>
                     </div>
                   )}
                   {extraChargesVal <= 0.005 && <div className="pb-5 border-b-2 border-slate-600" />}
                   <div className="pt-5">
                     <p className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-2">Total Result (Net Outflow)</p>
                     <p className="text-4xl font-black text-emerald-400 tabular-nums">{formatCurrency(finalPayoutResult)}</p>
                   </div>
                   {extraChargesVal > 0.005 && (
                     <p className="text-xs text-slate-400 leading-snug">
                       Extra charges do not change wallet outflow; they book as income and add to Transaction P&L net profit when you link the matching inflow.
                     </p>
                   )}
                </div>
              )}
            </CardContent>
          </Card>
          
          {mode === 'inflow' && (
            <Card className="bg-indigo-50/80 border-indigo-100">
              <CardContent className="flex items-start gap-3 text-sm text-indigo-800 font-medium">
                <Info className="shrink-0 mt-0.5 text-indigo-600" size={16}/>
                <p>The "Applied Rate" can be manually adjusted for one-time deals if necessary.</p>
              </CardContent>
            </Card>
          )}
        </div>

      </div>

      <div className="max-w-6xl mx-auto w-full px-1">
        <TypedRecentTransactionsCard
          title="Recent Swipe &amp; Pay transactions"
          subtitle="Inflow (card swipe entries) and outflow (payouts linked to customer). Edits persist to the ledger and reports when you save."
          items={swipePayList}
          formatCurrency={formatCurrency}
          customerNameForTxn={(t) =>
            (t.metadata?.customerId ? customers.find((c) => c.id === t.metadata!.customerId)?.name : undefined)
          }
          subtitleForTxn={(t) =>
            wallets.find((w) => w.id === t.metadata?.walletId)?.name ??
            (isSwipePayInflow(t) ? 'Inflow / swipe' : 'Outflow / payout')
          }
          onEditTxn={(t) => setEditingTxn(t)}
        />

        {editingTxn && TEMP_ALLOW_LEDGER_REPORT_PL_EDIT ? (
          <TransactionEditRouter
            transaction={editingTxn}
            accounts={accounts}
            customers={customers}
            wallets={wallets}
            transactions={transactions}
            formatCurrency={formatCurrency}
            onClose={() => setEditingTxn(null)}
            onSave={(id, patch) => updateTransaction(id, patch)}
          />
        ) : null}
      </div>
    </Layout>
  );
};
