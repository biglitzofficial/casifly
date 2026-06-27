import React, { useState, useEffect, useMemo } from 'react';
import { useERP } from '../context/ERPContext';
import { useToast } from '../context/ToastContext';
import { Layout } from '../components/Layout';
import { AccountType, LedgerEntry, TransactionType, Rates, Customer, Transaction } from '../types';
import { Card, CardContent, Input, Select, Button } from '../components/ui/Elements';
import { safeParseFloat, roundCurrency } from '../lib/utils';
import { ArrowRight, CheckCircle2, Search, Users } from 'lucide-react';
import { DEFAULT_COMMISSION_RATES, INITIAL_ACCOUNTS } from '../constants';
import { customerPaySwipeReceivableOutstanding, paySwipeRecoveryTransferFeePreview } from '../lib/paySwipeTxnReport';
import { TypedRecentTransactionsCard } from '../components/TypedRecentTransactionsCard';
import { TransactionEditModal } from '../components/TransactionEditModal';
import { TEMP_ALLOW_LEDGER_REPORT_PL_EDIT } from '../lib/tempUiFlags';

export const PaySwipe: React.FC = () => {
  const { customers, wallets, accounts, transactions, postTransaction, formatCurrency, getAccountBalance, addCustomer, updateCustomer, updateTransaction } = useERP();
  const toast = useToast();
  const [mode, setMode] = useState<'advance' | 'recovery'>('advance');

  // --- Shared: Customer ---
  const [phone, setPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [isNewCustomer, setIsNewCustomer] = useState(false);
  const [commissionRates, setCommissionRates] = useState<Rates>(DEFAULT_COMMISSION_RATES);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // --- Pay Advance State ---
  const [payAmount, setPayAmount] = useState<string>('');
  const [paySourceId, setPaySourceId] = useState('A002');
  const [advanceTransferFee, setAdvanceTransferFee] = useState<string>('0');

  // --- Swipe Recovery State ---
  const [recoveryMethod, setRecoveryMethod] = useState<'card' | 'cash' | 'bank'>('card');
  const [recoveryErrors, setRecoveryErrors] = useState<Record<string, string>>({});
  const [recoveryAmount, setRecoveryAmount] = useState<string>('');
  const [swipeWalletId, setSwipeWalletId] = useState(wallets[0]?.id || '');
  const [pgName, setPgName] = useState('');
  const [cardType, setCardType] = useState('visa');
  const [collectionAmount, setCollectionAmount] = useState<string>('');
  const [collectAccount, setCollectAccount] = useState('A001');
  const [appliedMdrPercent, setAppliedMdrPercent] = useState<string>('0');
  const [currentCommRate, setCurrentCommRate] = useState<string>('0');
  const [recoveryPickerQuery, setRecoveryPickerQuery] = useState('');
  const [editingTxn, setEditingTxn] = useState<Transaction | null>(null);

  const paySwipeTxnList = useMemo(
    () => transactions.filter((t) => t.type === TransactionType.PAY_SWIPE),
    [transactions],
  );

  const resetForm = () => {
    setPhone('');
    setCustomerName('');
    setCustomerId(null);
    setIsNewCustomer(false);
    setPayAmount('');
    setAdvanceTransferFee('0');
    setRecoveryMethod('card');
    setRecoveryAmount('');
    setCollectionAmount('');
    setErrors({});
    setRecoveryErrors({});
    setRecoveryPickerQuery('');
  };


  /** Resolve against in-memory customer list (sync). Runs as soon as 10 digits are entered — not only on blur — so Swipe Recovery doesn’t feel “stuck” until you click away. */
  const resolveCustomerFromDigits = (digits: string) => {
    if (digits.length !== 10) return;
    const found = customers.find(c => c.phone === digits);
    if (found) {
      setCustomerId(found.id);
      setCustomerName(found.name);
      setCommissionRates(found.commissionRates);
      setIsNewCustomer(false);
    } else {
      setCustomerId(null);
      setCustomerName('');
      setCommissionRates(DEFAULT_COMMISSION_RATES);
      setIsNewCustomer(true);
    }
    setErrors(p => ({ ...p, phone: '' }));
    setRecoveryErrors(p => ({ ...p, phone: '' }));
  };

  const handlePhoneBlur = () => {
    resolveCustomerFromDigits(phone.replace(/\D/g, ''));
  };

  const handlePhoneChange = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 10);
    setPhone(digits);
    if (digits.length < 10) {
      setCustomerId(null);
      setCustomerName('');
      setIsNewCustomer(false);
      setCommissionRates(DEFAULT_COMMISSION_RATES);
      setErrors(p => ({ ...p, phone: '' }));
      setRecoveryErrors(p => ({ ...p, phone: '' }));
      return;
    }
    resolveCustomerFromDigits(digits);
  };

  const selectedWallet = wallets.find(w => w.id === swipeWalletId);
  const selectedPG = selectedWallet?.pgs.find(p => p.name === pgName) || selectedWallet?.pgs[0];

  const isAssetCashBankWallet = (a: { type: string; category: string }) => {
    if (a.type !== AccountType.ASSET && a.type !== 'ASSET') return false;
    return ['Bank', 'Cash', 'Wallet'].includes(a.category);
  };

  /**
   * Merge live `accounts` with seed COA so Bank lines (e.g. HDFC / ICICI) always appear even if
   * the store list was trimmed — same pattern as Masters defaults.
   */
  const assetDestinationAccounts = useMemo(() => {
    const byId = new Map<string, (typeof accounts)[0]>();
    for (const a of accounts) {
      if (isAssetCashBankWallet(a)) byId.set(a.id, a);
    }
    for (const a of INITIAL_ACCOUNTS) {
      if (!isAssetCashBankWallet(a)) continue;
      if (!byId.has(a.id)) {
        byId.set(a.id, a as (typeof accounts)[0]);
      }
    }
    return [...byId.values()];
  }, [accounts]);

  /** Bank first, then cash, then wallets — labels make “store in bank” obvious. */
  const collectIntoOptions = useMemo(() => {
    const order: Record<string, number> = { Bank: 0, Cash: 1, Wallet: 2 };
    return [...assetDestinationAccounts]
      .sort((a, b) => {
        const d = (order[a.category] ?? 99) - (order[b.category] ?? 99);
        return d !== 0 ? d : a.name.localeCompare(b.name);
      })
      .map((a) => {
        const prefix = a.category === 'Bank' ? 'Bank' : a.category === 'Cash' ? 'Cash' : 'Wallet';
        return {
          value: a.id,
          label: `${prefix} — ${a.name}`,
        };
      });
  }, [assetDestinationAccounts]);

  const cashCollectOptions = useMemo(
    () =>
      collectIntoOptions.filter((o) => assetDestinationAccounts.find((a) => a.id === o.value)?.category === 'Cash'),
    [collectIntoOptions, assetDestinationAccounts],
  );

  const bankCollectOptions = useMemo(
    () =>
      collectIntoOptions.filter((o) => assetDestinationAccounts.find((a) => a.id === o.value)?.category === 'Bank'),
    [collectIntoOptions, assetDestinationAccounts],
  );

  const recoveryCollectOptions =
    recoveryMethod === 'cash' ? cashCollectOptions : recoveryMethod === 'bank' ? bankCollectOptions : collectIntoOptions;

  useEffect(() => {
    if (collectIntoOptions.length === 0) return;
    if (!collectIntoOptions.some((o) => o.value === collectAccount)) {
      setCollectAccount(collectIntoOptions[0].value);
    }
  }, [collectIntoOptions, collectAccount]);

  useEffect(() => {
    if (mode !== 'recovery') return;
    if (recoveryMethod === 'cash' && cashCollectOptions.length > 0) {
      setCollectAccount(cashCollectOptions[0].value);
    } else if (recoveryMethod === 'bank' && bankCollectOptions.length > 0) {
      setCollectAccount(bankCollectOptions[0].value);
    }
  }, [recoveryMethod, mode, cashCollectOptions, bankCollectOptions]);

  // Auto-set initial PG
  useEffect(() => {
    if (selectedWallet && selectedWallet.pgs.length > 0) {
      setPgName(selectedWallet.pgs[0].name);
    }
  }, [swipeWalletId, selectedWallet]);

  // Sync Commission Rate input when Card Type changes (card swipe only)
  useEffect(() => {
    if (mode !== 'recovery' || recoveryMethod !== 'card') return;
    // @ts-ignore
    const rate = commissionRates[cardType] || 0;
    setCurrentCommRate(rate.toString());
  }, [cardType, commissionRates, mode, recoveryMethod]);

  // Sync MDR % from PG when wallet/pg/card changes (card swipe only)
  useEffect(() => {
    if (mode !== 'recovery' || recoveryMethod !== 'card') return;
    if (selectedWallet && selectedPG && cardType) {
      // @ts-ignore
      const mdr = selectedPG.charges[cardType] || 0;
      setAppliedMdrPercent(mdr.toString());
    }
  }, [swipeWalletId, pgName, cardType, mode, recoveryMethod, selectedWallet, selectedPG]);

  // Auto-calc service fee from rate on bill / swipe amount
  useEffect(() => {
    if (mode !== 'recovery') return;
    const amt = safeParseFloat(recoveryAmount);
    if (amt > 0) {
      const rate = safeParseFloat(currentCommRate);
      const suggestedCollection = roundCurrency(amt * (rate / 100));
      setCollectionAmount(suggestedCollection.toString());
    }
  }, [recoveryAmount, mode, recoveryMethod, currentCommRate]);

  const amount = safeParseFloat(payAmount);
  const advanceTransferFeeVal = safeParseFloat(advanceTransferFee);
  const advanceTotalDebit = roundCurrency(amount + Math.max(0, advanceTransferFeeVal));
  const recoveryAmt = safeParseFloat(recoveryAmount);
  const collAmount = safeParseFloat(collectionAmount);
  const mdrPercent = safeParseFloat(appliedMdrPercent);

  const validateStep1 = (): boolean => {
    const err: Record<string, string> = {};
    const p = phone.trim().replace(/\D/g, '');
    if (!p) err.phone = 'Phone number is required';
    else if (p.length !== 10) err.phone = 'Phone must be exactly 10 digits';
    if (!customerName?.trim()) err.customerName = 'Customer name is required';
    else if (customerName.trim().length < 2) err.customerName = 'Name must be at least 2 characters';
    if (!payAmount?.trim()) err.payAmount = 'Advance amount is required';
    else if (amount <= 0) err.payAmount = 'Advance amount must be greater than 0';
    if (advanceTransferFee !== '' && (isNaN(advanceTransferFeeVal) || advanceTransferFeeVal < 0)) {
      err.advanceTransferFee = 'Transfer fee must be 0 or more';
    } else if (advanceTransferFeeVal > amount) {
      err.advanceTransferFee = 'Transfer fee cannot exceed advance amount';
    }
    setErrors(err);
    return Object.keys(err).length === 0;
  };

  const handleStep1 = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateStep1()) return;

    let finalId = customerId;
    if (isNewCustomer) {
      const newId = await addCustomer({
        name: customerName.trim(),
        phone: phone.trim().replace(/\D/g, ''),
        commissionRates: commissionRates
      });
      if (!newId) return;
      finalId = newId;
      setCustomerId(finalId);
      setIsNewCustomer(false);
    }

    const transferFee = roundCurrency(Math.max(0, advanceTransferFeeVal));
    const totalFromSource = roundCurrency(amount + transferFee);
    const entries: LedgerEntry[] = [
      { accountId: 'A006', debit: amount, credit: 0 },
      { accountId: paySourceId, debit: 0, credit: totalFromSource },
    ];
    if (transferFee > 0.005) {
      entries.push({ accountId: 'E001', debit: transferFee, credit: 0 });
    }
    setErrors({});
    const pending = postTransaction(
      `Advance Pay: ${customerName.trim()}`,
      TransactionType.PAY_SWIPE,
      entries,
      {
        customerId: finalId || undefined,
        transferFee: transferFee > 0.005 ? transferFee : undefined,
      }
    );
    if (!pending) return;
    try {
      await pending;
    } catch {
      return;
    }
    toast.success('Advance recorded successfully!');
    resetForm();
  };

  const resetRecoveryForm = () => {
    setPhone('');
    setCustomerName('');
    setCustomerId(null);
    setRecoveryMethod('card');
    setRecoveryAmount('');
    setCollectionAmount('');
    setRecoveryErrors({});
    setRecoveryPickerQuery('');
  };

  const customersWithReceivable = useMemo(() => {
    return customers
      .map((c) => ({
        customer: c,
        outstanding: customerPaySwipeReceivableOutstanding(c.id, transactions),
      }))
      .filter((r) => r.outstanding > 0.005)
      .sort((a, b) => b.outstanding - a.outstanding);
  }, [customers, transactions]);

  const filteredReceivableCustomers = useMemo(() => {
    const raw = recoveryPickerQuery.trim();
    const q = raw.toLowerCase();
    const digits = raw.replace(/\D/g, '');
    if (!q && !digits) return customersWithReceivable;
    return customersWithReceivable.filter(({ customer: c }) => {
      const nameMatch = q.length > 0 && c.name.toLowerCase().includes(q);
      const phoneMatch = digits.length > 0 && c.phone.includes(digits);
      return nameMatch || phoneMatch;
    });
  }, [customersWithReceivable, recoveryPickerQuery]);

  const selectRecoveryCustomer = (cust: Customer) => {
    setCustomerId(cust.id);
    setCustomerName(cust.name);
    setPhone(cust.phone);
    setCommissionRates({ ...cust.commissionRates });
    setIsNewCustomer(false);
    setRecoveryPickerQuery('');
    setRecoveryErrors({});
  };

  const clearRecoveryCustomerSelection = () => {
    setCustomerId(null);
    setCustomerName('');
    setPhone('');
    setIsNewCustomer(false);
    setCommissionRates(DEFAULT_COMMISSION_RATES);
    setRecoveryPickerQuery('');
    setRecoveryErrors({});
  };

  const validateRecovery = (): boolean => {
    const err: Record<string, string> = {};
    const p = phone.trim().replace(/\D/g, '');
    if (!p) err.phone = 'Phone number is required';
    else if (p.length !== 10) err.phone = 'Phone must be exactly 10 digits';
    if (!customerId) err.phone = err.phone || 'Customer not found. Create via Pay Advance first.';
    if (!recoveryAmount?.trim()) err.recoveryAmount = 'Recovery amount is required';
    else if (recoveryAmt <= 0) err.recoveryAmount = 'Recovery amount must be greater than 0';
    const coll = safeParseFloat(collectionAmount);
    if (isNaN(coll) || coll < 0) err.collectionAmount = 'Charges collected must be 0 or more';
    const rateVal = safeParseFloat(currentCommRate);
    if (isNaN(rateVal) || rateVal < 0 || rateVal > 100) err.currentCommRate = 'Rate must be between 0 and 100%';
    const mdrVal = safeParseFloat(appliedMdrPercent);
    if (recoveryMethod === 'card' && appliedMdrPercent !== '' && (isNaN(mdrVal) || mdrVal < 0 || mdrVal > 100)) {
      err.appliedMdrPercent = 'Applied MDR must be between 0 and 100%';
    }
    if (recoveryMethod === 'card' && !wallets.find((w) => w.id === swipeWalletId)) {
      err.recoveryAmount = err.recoveryAmount || 'Select a wallet for card swipe';
    }
    if (recoveryMethod === 'cash' && cashCollectOptions.length === 0) {
      err.collectionAmount = 'No cash account found in Masters';
    }
    if (recoveryMethod === 'bank' && bankCollectOptions.length === 0) {
      err.collectionAmount = 'No bank account found in Masters';
    }
    setRecoveryErrors(err);
    return Object.keys(err).length === 0;
  };

  const handleRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateRecovery()) return;

    const rateVal = safeParseFloat(currentCommRate);
    if (customerId && recoveryMethod === 'card') {
      const updatedRates = { ...commissionRates, [cardType]: rateVal };
      updateCustomer(customerId, { commissionRates: updatedRates });
    }

    const attributedTransferFee =
      customerId != null
        ? paySwipeRecoveryTransferFeePreview(customerId, recoveryAmt, transactions)
        : 0;

    let entries: LedgerEntry[];
    let description: string;
    let metadata: Transaction['metadata'];

    if (recoveryMethod === 'cash' || recoveryMethod === 'bank') {
      const totalReceived = roundCurrency(recoveryAmt + collAmount);
      entries = [
        { accountId: collectAccount, debit: totalReceived, credit: 0 },
        { accountId: 'A006', debit: 0, credit: recoveryAmt },
      ];
      if (collAmount > 0.005) {
        entries.push({ accountId: 'I001', debit: 0, credit: collAmount });
      }
      const methodLabel = recoveryMethod === 'cash' ? 'CASH' : 'BANK';
      description = `Recovery: ${customerName} (${methodLabel})`;
      metadata = {
        customerId: customerId || undefined,
        paySwipeRecoveryMethod: recoveryMethod,
        transferFee: attributedTransferFee > 0.005 ? attributedTransferFee : undefined,
      };
    } else {
      const wallet = wallets.find((w) => w.id === swipeWalletId);
      if (!wallet) return;

      const mdr = roundCurrency(recoveryAmt * (mdrPercent / 100));
      const netToWallet = roundCurrency(recoveryAmt - mdr);
      entries = [
        { accountId: wallet.ledgerAccountId, debit: netToWallet, credit: 0 },
        { accountId: 'A006', debit: 0, credit: recoveryAmt },
        { accountId: 'E001', debit: mdr, credit: 0 },
        { accountId: collectAccount, debit: collAmount, credit: 0 },
        { accountId: 'I001', debit: 0, credit: collAmount },
      ];
      description = `Recovery: ${customerName} (${cardType.toUpperCase()})`;
      metadata = {
        customerId: customerId || undefined,
        walletId: wallet.id,
        cardType,
        paySwipeRecoveryMethod: 'card',
        transferFee: attributedTransferFee > 0.005 ? attributedTransferFee : undefined,
      };
    }

    const pending = postTransaction(description, TransactionType.PAY_SWIPE, entries, metadata);
    if (!pending) return;
    try {
      await pending;
    } catch {
      return;
    }
    toast.success('Recovery recorded successfully!');
    resetRecoveryForm();
  };

  const recoveryMdrAmt = mdrPercent > 0 ? roundCurrency(recoveryAmt * (mdrPercent / 100)) : 0;
  const recoveryNetToWallet = Math.max(0, roundCurrency(recoveryAmt - recoveryMdrAmt));
  const recoveryTransferFeePreview =
    customerId && !isNewCustomer
      ? paySwipeRecoveryTransferFeePreview(customerId, recoveryAmt, transactions)
      : 0;
  const recoveryNetMargin =
    recoveryMethod === 'card'
      ? roundCurrency(collAmount - recoveryMdrAmt - recoveryTransferFeePreview)
      : roundCurrency(collAmount - recoveryTransferFeePreview);
  const collectIntoLabel = recoveryCollectOptions.find((o) => o.value === collectAccount)?.label ?? '—';
  const payFromOptions = collectIntoOptions.map((o) => ({
    value: o.value,
    label: `${o.label} (${formatCurrency(getAccountBalance(o.value))})`,
  }));

  return (
    <Layout title="Pay & Swipe (Advance Flow)">
      <div className={`mx-auto ${mode === 'recovery' ? 'max-w-6xl' : 'max-w-3xl'}`}>
        <div className={mode === 'recovery' ? 'grid grid-cols-1 lg:grid-cols-3 gap-8' : ''}>
          <div className={mode === 'recovery' ? 'lg:col-span-2 space-y-6' : 'space-y-6'}>
        <div className="flex items-center gap-2 p-2 bg-slate-100 rounded-2xl mb-8">
          <button type="button" onClick={() => { setMode('advance'); resetForm(); }} className={`flex-1 py-3 px-5 rounded-xl font-bold transition-all ${mode === 'advance' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-600 hover:bg-white'}`}>
            Pay Bill (Advance)
          </button>
          <button type="button" onClick={() => { setMode('recovery'); resetForm(); }} className={`flex-1 py-3 px-5 rounded-xl font-bold transition-all ${mode === 'recovery' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-600 hover:bg-white'}`}>
            Collect from Customer
          </button>
        </div>

        <Card>
          <CardContent className="pt-6">
            {mode === 'advance' ? (
              <form onSubmit={handleStep1} className="space-y-6">
                <div className="bg-indigo-50/60 p-5 rounded-xl border border-indigo-100 grid grid-cols-2 gap-4">
                    <div className="relative col-span-2 md:col-span-1">
                      <Input 
                        label="Customer Phone" 
                        value={phone} 
                        onChange={(e) => handlePhoneChange(e.target.value)} 
                        onBlur={handlePhoneBlur}
                        placeholder="10-digit phone"
                        error={errors.phone}
                        maxLength={10}
                      />
                      <div className="absolute right-4 top-10 text-slate-400 pointer-events-none"><Search size={16}/></div>
                    </div>
                    <Input 
                      label="Customer Name" 
                      value={customerName} 
                      onChange={(e) => { setCustomerName(e.target.value); setErrors(p => ({...p, customerName: ''})); }} 
                      disabled={!isNewCustomer && !!customerId}
                      error={errors.customerName}
                      placeholder="Full name"
                    />
                </div>

                <Input label="Bill Amount (₹)" type="number" className="font-bold text-lg" value={payAmount} onChange={e => { setPayAmount(e.target.value); setErrors(p => ({...p, payAmount: ''})); }} error={errors.payAmount} placeholder="0" />
                <Input
                  label="Transfer Fee (₹)"
                  type="number"
                  value={advanceTransferFee}
                  onChange={(e) => {
                    setAdvanceTransferFee(e.target.value);
                    setErrors((p) => ({ ...p, advanceTransferFee: '' }));
                  }}
                  error={errors.advanceTransferFee}
                  placeholder="0"
                />
                <p className="text-xs text-slate-500 -mt-4 font-medium">
                  Wallet/bank-la customer credit card bill pay pannumbodhu extra fee (e.g. ₹10,000 bill + ₹15 fee = ₹10,015). Intha fee ungal profit-la minus aagum.
                </p>
                <Select label="Pay From" value={paySourceId} onChange={e => setPaySourceId(e.target.value)} options={payFromOptions.length ? payFromOptions : collectIntoOptions} />
                {amount > 0.005 ? (
                  <div className="p-4 rounded-xl bg-indigo-50/80 border border-indigo-100 space-y-2 text-sm">
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-600">Bill amount</span>
                      <span className="font-mono font-semibold tabular-nums">{formatCurrency(amount)}</span>
                    </div>
                    {advanceTransferFeeVal > 0.005 ? (
                      <div className="flex justify-between gap-3">
                        <span className="text-slate-600">Transfer fee</span>
                        <span className="font-mono font-semibold tabular-nums text-amber-800">+{formatCurrency(advanceTransferFeeVal)}</span>
                      </div>
                    ) : null}
                    <div className="flex justify-between gap-3 pt-2 border-t border-indigo-200/80">
                      <span className="font-bold text-slate-800">Total debit from account</span>
                      <span className="font-mono font-black tabular-nums text-indigo-900">{formatCurrency(advanceTotalDebit)}</span>
                    </div>
                  </div>
                ) : null}
                <Button type="submit" className="w-full">Pay Bill (Record Advance) <ArrowRight size={16}/></Button>
              </form>
            ) : (
              <form onSubmit={handleRecovery} className="space-y-6">
                {!customerId || isNewCustomer ? (
                  <div className="space-y-4">
                    <div className="p-4 bg-emerald-50/90 rounded-xl border border-emerald-100 flex gap-3 items-start">
                      <Users className="text-emerald-700 shrink-0 mt-0.5" size={20} />
                      <div className="text-sm text-emerald-900">
                        <p className="font-bold">Customers with Pay &amp; Swipe receivable</p>
                        <p className="text-emerald-800/90 mt-1">
                          Bill pay pannirukinga — ippo customer kitte amount edukka Cash, Bank, or Card swipe choose pannunga.
                        </p>
                      </div>
                    </div>
                    <Input
                      label="Filter by name or phone"
                      placeholder="Search…"
                      value={recoveryPickerQuery}
                      onChange={(e) => setRecoveryPickerQuery(e.target.value)}
                      className="font-medium"
                    />
                    <div className="max-h-[min(24rem,50vh)] overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                      {filteredReceivableCustomers.length === 0 ? (
                        <p className="p-4 text-sm text-slate-600">
                          {customersWithReceivable.length === 0
                            ? 'No outstanding receivables. Record Pay Advance first, then recover here.'
                            : 'No customers match your search.'}
                        </p>
                      ) : (
                        <ul className="divide-y divide-slate-100">
                          {filteredReceivableCustomers.map(({ customer: c, outstanding }) => (
                            <li key={c.id}>
                              <button
                                type="button"
                                onClick={() => selectRecoveryCustomer(c)}
                                className="w-full text-left px-4 py-3.5 hover:bg-emerald-50/90 transition-colors flex flex-wrap items-center justify-between gap-3"
                              >
                                <div>
                                  <p className="font-bold text-slate-900">{c.name}</p>
                                  <p className="text-sm font-mono text-slate-500 tracking-tight">{c.phone}</p>
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="text-xs font-bold text-emerald-800 uppercase tracking-wide">Receivable outstanding</p>
                                  <p className="text-sm font-mono font-semibold text-slate-800 tabular-nums mt-0.5">{formatCurrency(outstanding)}</p>
                                </div>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div className="p-5 bg-slate-50/80 rounded-xl border border-slate-200 space-y-3">
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Or search by phone</p>
                      <div className="relative">
                        <Input
                          label="Customer Phone"
                          value={phone}
                          onChange={(e) => handlePhoneChange(e.target.value)}
                          onBlur={handlePhoneBlur}
                          placeholder="10-digit phone"
                          error={recoveryErrors.phone}
                          maxLength={10}
                        />
                        <div className="absolute right-4 top-10 text-slate-400 pointer-events-none">
                          <Search size={16} />
                        </div>
                      </div>
                      {isNewCustomer && phone.length === 10 && (
                        <p className="text-sm text-amber-600 font-medium">Customer not found. Create via Pay Advance first.</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="p-5 bg-slate-50/80 rounded-xl border border-slate-200 space-y-4">
                      <div className="p-4 bg-white rounded-xl border border-emerald-200 flex justify-between items-start gap-3">
                        <div>
                          <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Selected customer</p>
                          <p className="font-bold text-slate-900">{customerName}</p>
                          <p className="text-sm font-mono text-slate-600 mt-0.5">{phone}</p>
                          <p className="text-xs text-slate-600 mt-2">
                            Receivable outstanding:{' '}
                            <span className="font-mono font-semibold text-emerald-800 tabular-nums">
                              {formatCurrency(customerPaySwipeReceivableOutstanding(customerId, transactions))}
                            </span>
                          </p>
                        </div>
                        <CheckCircle2 className="text-emerald-600 shrink-0" size={22} />
                      </div>
                      <Button type="button" variant="outline" onClick={clearRecoveryCustomerSelection} className="w-full sm:w-auto">
                        Change customer
                      </Button>
                    </div>

                    <div className="flex flex-wrap gap-2 p-2 bg-slate-100 rounded-xl">
                      {([
                        { id: 'card' as const, label: 'Card Swipe' },
                        { id: 'cash' as const, label: 'Cash' },
                        { id: 'bank' as const, label: 'Bank Transfer' },
                      ]).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setRecoveryMethod(opt.id)}
                          className={`flex-1 min-w-[7rem] py-2.5 px-3 rounded-lg text-sm font-bold transition-all ${
                            recoveryMethod === opt.id
                              ? 'bg-emerald-600 text-white shadow-md'
                              : 'bg-white text-slate-600 hover:bg-emerald-50'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-slate-500 font-medium -mt-2">
                      {recoveryMethod === 'card'
                        ? 'Customer card-la swipe pannuvanga — wallet-ku varum, portal MDR mattum expense.'
                        : recoveryMethod === 'cash'
                          ? 'Customer cash kudukaranga — principal + ungal fee cash account-la.'
                          : 'Customer bank transfer pannuvanga — principal + ungal fee bank account-la.'}
                    </p>

                <div>
                  <Input
                    label={recoveryMethod === 'card' ? 'Amount to be swiped — principal (₹)' : 'Principal to collect (₹)'}
                    type="number"
                    className="font-bold text-lg"
                    value={recoveryAmount}
                    onChange={e => { setRecoveryAmount(e.target.value); setRecoveryErrors(p => ({...p, recoveryAmount: ''})); }}
                    error={recoveryErrors.recoveryAmount}
                    placeholder="0"
                  />
                  <p className="text-xs text-slate-500 mt-1.5 font-medium">
                    {recoveryMethod === 'card'
                      ? 'Gross card amount cleared from receivables (same as Principal in Transaction P&L).'
                      : 'Bill pay pannirundha amount — receivable (A006) clear aagum.'}
                  </p>
                </div>

                {recoveryMethod === 'card' ? (
                <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Select label="Swipe Into Wallet" value={swipeWalletId} onChange={e => setSwipeWalletId(e.target.value)} options={wallets.map(w => ({ label: w.name, value: w.id }))} />
                  <Select 
                    label="Payment Gateway" 
                    value={pgName} 
                    onChange={e => setPgName(e.target.value)} 
                    options={selectedWallet?.pgs.map(p => ({ label: p.name, value: p.name })) || []} 
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Select 
                    label="Card Used"
                    value={cardType}
                    onChange={(e) => setCardType(e.target.value)}
                    options={[
                      { label: 'Visa', value: 'visa' },
                      { label: 'Mastercard', value: 'master' },
                      { label: 'Amex', value: 'amex' },
                      { label: 'Rupay', value: 'rupay' },
                    ]}
                  />
                  <Input 
                    label="Rate (%)" 
                    type="number" 
                    step="0.1" 
                    value={currentCommRate} 
                    onChange={e => { setCurrentCommRate(e.target.value); setRecoveryErrors(p => ({...p, currentCommRate: ''})); }} 
                    error={recoveryErrors.currentCommRate}
                  />
                  <Input
                    label="Applied MDR %"
                    type="number"
                    step="0.1"
                    value={appliedMdrPercent}
                    onChange={(e) => {
                      setAppliedMdrPercent(e.target.value);
                      setRecoveryErrors((p) => ({ ...p, appliedMdrPercent: '' }));
                    }}
                    error={recoveryErrors.appliedMdrPercent}
                    placeholder="e.g. 1.2"
                    title="Pre-filled from the wallet payment gateway for this card; edit for one-off portal rates"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Input label="Charges collected — your fee (₹)" type="number" value={collectionAmount} onChange={e => { setCollectionAmount(e.target.value); setRecoveryErrors(p => ({...p, collectionAmount: ''})); }} error={recoveryErrors.collectionAmount} />
                    <p className="text-xs text-slate-500 mt-1.5 font-medium">Default from rate {currentCommRate}% on principal; edit if needed. Books to income (I001) into the account below.</p>
                  </div>
                  <Select label="Fee collected into (cash / bank / wallet)" value={collectAccount} onChange={e => setCollectAccount(e.target.value)} options={collectIntoOptions} />
                </div>
                </>
                ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Input
                    label="Your service fee — rate (%)"
                    type="number"
                    step="0.1"
                    value={currentCommRate}
                    onChange={(e) => {
                      setCurrentCommRate(e.target.value);
                      setRecoveryErrors((p) => ({ ...p, currentCommRate: '' }));
                    }}
                    error={recoveryErrors.currentCommRate}
                  />
                  <Input
                    label="Your fee (₹)"
                    type="number"
                    value={collectionAmount}
                    onChange={(e) => {
                      setCollectionAmount(e.target.value);
                      setRecoveryErrors((p) => ({ ...p, collectionAmount: '' }));
                    }}
                    error={recoveryErrors.collectionAmount}
                  />
                  <Select
                    label={recoveryMethod === 'cash' ? 'Received into — Cash' : 'Received into — Bank'}
                    value={collectAccount}
                    onChange={(e) => setCollectAccount(e.target.value)}
                    options={recoveryCollectOptions.length ? recoveryCollectOptions : [{ value: '', label: 'No account' }]}
                  />
                </div>
                )}

                <Button type="submit" variant="success" className="w-full">
                  {recoveryMethod === 'card' ? 'Complete Card Recovery' : recoveryMethod === 'cash' ? 'Record Cash Collection' : 'Record Bank Collection'}
                </Button>
                  </>
                )}
              </form>
            )}
          </CardContent>
        </Card>
          </div>

          {mode === 'recovery' && (
            <div className="space-y-6 lg:sticky lg:top-6 lg:self-start">
              {customerId && !isNewCustomer ? (
                <Card className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border-0 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.45)] overflow-hidden text-white">
                  <div className="px-5 py-4 bg-gradient-to-r from-emerald-900/80 to-slate-800 border-b border-slate-600/50">
                    <h3 className="text-lg font-black tracking-tight">Recovery breakdown</h3>
                    <p className="text-xs text-slate-300 mt-1 leading-snug">Principal, charges collected, MDR, and net to wallet — same split as <strong className="text-slate-200">Reports → Transaction P&amp;L (Pay &amp; Swipe)</strong>.</p>
                  </div>
                  <CardContent className="p-6 space-y-5 bg-slate-800/40">
                    <div className="flex justify-between items-baseline gap-3">
                      <span className="text-sm font-semibold text-slate-300">
                        {recoveryMethod === 'card' ? 'Amount to be swiped (principal)' : 'Principal to collect'}
                      </span>
                      <span className="text-xl font-black tabular-nums text-white">{formatCurrency(recoveryAmt)}</span>
                    </div>
                    {recoveryMethod === 'card' ? (
                    <>
                    <div className="flex justify-between items-baseline gap-3">
                      <span className="text-sm font-semibold text-indigo-200">Charges collected ({String(currentCommRate)}%)</span>
                      <span className="text-lg font-bold tabular-nums text-indigo-100">{formatCurrency(collAmount)}</span>
                    </div>
                    <div className="border-t border-slate-600 pt-4 flex justify-between items-baseline gap-3">
                      <span className="text-sm font-semibold text-rose-300">Est. portal MDR ({String(appliedMdrPercent)}%)</span>
                      <span className="text-lg font-bold tabular-nums text-rose-100">−{formatCurrency(recoveryMdrAmt)}</span>
                    </div>
                    <div className="border-t border-slate-600 pt-4 flex justify-between items-baseline gap-3">
                      <span className="text-sm font-bold text-emerald-200 uppercase tracking-wide">Net to wallet</span>
                      <span className="text-2xl font-black tabular-nums text-emerald-300">{formatCurrency(recoveryNetToWallet)}</span>
                    </div>
                    </>
                    ) : (
                    <>
                    <div className="flex justify-between items-baseline gap-3">
                      <span className="text-sm font-semibold text-indigo-200">Your service fee ({String(currentCommRate)}%)</span>
                      <span className="text-lg font-bold tabular-nums text-indigo-100">{formatCurrency(collAmount)}</span>
                    </div>
                    <div className="border-t border-slate-600 pt-4 flex justify-between items-baseline gap-3">
                      <span className="text-sm font-bold text-emerald-200 uppercase tracking-wide">Total received</span>
                      <span className="text-2xl font-black tabular-nums text-emerald-300">{formatCurrency(roundCurrency(recoveryAmt + collAmount))}</span>
                    </div>
                    </>
                    )}
                    {recoveryTransferFeePreview > 0.005 ? (
                      <div className="flex justify-between items-baseline gap-3">
                        <span className="text-sm font-semibold text-amber-200">Transfer fee (from bill pay)</span>
                        <span className="text-lg font-bold tabular-nums text-amber-100">−{formatCurrency(recoveryTransferFeePreview)}</span>
                      </div>
                    ) : null}
                    <div className="border-t border-slate-600 pt-4">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                        {recoveryMethod === 'card' ? 'Fee collected into' : 'Received into'}
                      </p>
                      <p className="text-sm font-semibold text-slate-100 leading-snug">{collectIntoLabel}</p>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed pt-2">
                      Net margin (P&amp;L): your fee
                      {recoveryMethod === 'card' ? ' − MDR' : ''}
                      {recoveryTransferFeePreview > 0.005 ? ' − transfer fee' : ''} ={' '}
                      <span className="text-slate-300 font-semibold tabular-nums">{formatCurrency(recoveryNetMargin)}</span>.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="hidden lg:flex flex-col items-center justify-center p-8 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/80 text-center text-sm text-slate-500 font-medium min-h-[200px]">
                  Link a customer to see the live breakdown.
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className={`mx-auto w-full px-1 ${mode === 'recovery' ? 'max-w-6xl' : 'max-w-3xl'}`}>
        <TypedRecentTransactionsCard
          title="Recent Pay &amp; Swipe transactions"
          subtitle="Pay advance and swipe recovery entries. Edits update the journal and Profit &amp; Loss when you save (same temporary edit path as Ledger / Reports)."
          items={paySwipeTxnList}
          formatCurrency={formatCurrency}
          customerNameForTxn={(t) =>
            (t.metadata?.customerId ? customers.find((c) => c.id === t.metadata!.customerId)?.name : undefined)
          }
          subtitleForTxn={(t) => {
            const w = wallets.find((x) => x.id === t.metadata?.walletId);
            if (w) return `${w.name} · card swipe`;
            const desc = (t.description || '').toLowerCase();
            if (desc.includes('recovery')) {
              if (/\(cash\)/i.test(t.description)) return 'Cash collection';
              if (/\(bank\)/i.test(t.description)) return 'Bank collection';
              return 'Card recovery';
            }
            return 'Bill pay / advance';
          }}
          onEditTxn={(t) => setEditingTxn(t)}
        />
        {editingTxn && TEMP_ALLOW_LEDGER_REPORT_PL_EDIT ? (
          <TransactionEditModal
            transaction={editingTxn}
            accounts={accounts}
            formatCurrency={formatCurrency}
            onClose={() => setEditingTxn(null)}
            onSave={(id, patch) => updateTransaction(id, patch)}
          />
        ) : null}
      </div>
    </Layout>
  );
};
