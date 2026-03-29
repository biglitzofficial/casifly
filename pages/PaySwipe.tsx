import React, { useState, useEffect, useMemo } from 'react';
import { useERP } from '../context/ERPContext';
import { useToast } from '../context/ToastContext';
import { Layout } from '../components/Layout';
import { AccountType, LedgerEntry, TransactionType, Rates } from '../types';
import { Card, CardContent, Input, Select, Button } from '../components/ui/Elements';
import { safeParseFloat, roundCurrency } from '../lib/utils';
import { ArrowRight, CheckCircle2, Search } from 'lucide-react';
import { DEFAULT_COMMISSION_RATES } from '../constants';

export const PaySwipe: React.FC = () => {
  const { customers, wallets, accounts, postTransaction, formatCurrency, getAccountBalance, addCustomer, updateCustomer } = useERP();
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

  // --- Swipe Recovery State ---
  const [recoveryErrors, setRecoveryErrors] = useState<Record<string, string>>({});
  const [recoveryAmount, setRecoveryAmount] = useState<string>('');
  const [swipeWalletId, setSwipeWalletId] = useState(wallets[0]?.id || '');
  const [pgName, setPgName] = useState('');
  const [cardType, setCardType] = useState('visa');
  const [collectionAmount, setCollectionAmount] = useState<string>('');
  const [collectAccount, setCollectAccount] = useState('A001');
  const [appliedMdrPercent, setAppliedMdrPercent] = useState<string>('0');
  const [currentCommRate, setCurrentCommRate] = useState<string>('0');

  const resetForm = () => {
    setPhone('');
    setCustomerName('');
    setCustomerId(null);
    setIsNewCustomer(false);
    setPayAmount('');
    setRecoveryAmount('');
    setCollectionAmount('');
    setErrors({});
    setRecoveryErrors({});
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

  /** Bank first, then cash, then wallets — labels make “store in bank” obvious. */
  const collectIntoOptions = useMemo(() => {
    const order: Record<string, number> = { Bank: 0, Cash: 1, Wallet: 2 };
    const list = accounts.filter(
      (a) => a.type === AccountType.ASSET && ['Bank', 'Cash', 'Wallet'].includes(a.category)
    );
    return [...list]
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
  }, [accounts]);

  // Auto-set initial PG
  useEffect(() => {
    if (selectedWallet && selectedWallet.pgs.length > 0) {
      setPgName(selectedWallet.pgs[0].name);
    }
  }, [swipeWalletId, selectedWallet]);

  // Sync Commission Rate input when Card Type changes
  useEffect(() => {
    // @ts-ignore
    const rate = commissionRates[cardType] || 0;
    setCurrentCommRate(rate.toString());
  }, [cardType, commissionRates]);

  // Sync MDR % from PG when wallet/pg/card changes; auto-calc collection for both advance & recovery
  useEffect(() => {
    if (selectedWallet && selectedPG && cardType) {
      // @ts-ignore
      const mdr = selectedPG.charges[cardType] || 0;
      setAppliedMdrPercent(mdr.toString());
    }
    const amt = mode === 'advance' ? safeParseFloat(payAmount) : safeParseFloat(recoveryAmount);
    if (amt > 0) {
      const rate = safeParseFloat(currentCommRate);
      const suggestedCollection = roundCurrency(amt * (rate / 100));
      setCollectionAmount(suggestedCollection.toString());
    }
  }, [swipeWalletId, pgName, cardType, payAmount, recoveryAmount, mode, selectedWallet, selectedPG, currentCommRate]);

  const amount = safeParseFloat(payAmount);
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

    const entries: LedgerEntry[] = [
      { accountId: 'A006', debit: amount, credit: 0 },
      { accountId: paySourceId, debit: 0, credit: amount }
    ];
    setErrors({});
    postTransaction(
      `Advance Pay: ${customerName.trim()}`, 
      TransactionType.PAY_SWIPE, 
      entries,
      { customerId: finalId || undefined }
    );
    toast.success("Advance recorded successfully!");
    resetForm();
  };

  const resetRecoveryForm = () => {
    setPhone('');
    setCustomerName('');
    setCustomerId(null);
    setRecoveryAmount('');
    setCollectionAmount('');
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
    setRecoveryErrors(err);
    return Object.keys(err).length === 0;
  };

  const handleRecovery = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateRecovery()) return;
    const wallet = wallets.find(w => w.id === swipeWalletId);
    if (!wallet) return;

    const rateVal = safeParseFloat(currentCommRate);
    if (customerId) {
      const updatedRates = { ...commissionRates, [cardType]: rateVal };
      updateCustomer(customerId, { commissionRates: updatedRates });
    }

    // 2. Financial Calculation: PG charges MDR, so wallet receives (recoveryAmt - MDR)
    const mdr = roundCurrency(recoveryAmt * (mdrPercent / 100));
    const netToWallet = roundCurrency(recoveryAmt - mdr);

    const entries: LedgerEntry[] = [
      // 1. Principal Recovery: Wallet receives NET (after MDR), Customer Debt cleared
      { accountId: wallet.ledgerAccountId, debit: netToWallet, credit: 0 },
      { accountId: 'A006', debit: 0, credit: recoveryAmt },
      { accountId: 'E001', debit: mdr, credit: 0 },
      
      // 2. Charges Collection (Bank UP, Income UP)
      { accountId: collectAccount, debit: collAmount, credit: 0 },
      { accountId: 'I001', debit: 0, credit: collAmount }
    ];

    postTransaction(
      `Recovery: ${customerName} (${cardType.toUpperCase()})`,
      TransactionType.PAY_SWIPE,
      entries,
      { customerId: customerId || undefined, walletId: wallet.id, cardType: cardType }
    );
    toast.success("Recovery recorded successfully!");
    resetRecoveryForm();
  };

  return (
    <Layout title="Pay & Swipe (Advance Flow)">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-2 p-2 bg-slate-100 rounded-2xl mb-8">
          <button type="button" onClick={() => { setMode('advance'); resetForm(); }} className={`flex-1 py-3 px-5 rounded-xl font-bold transition-all ${mode === 'advance' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-600 hover:bg-white'}`}>
            Pay Advance
          </button>
          <button type="button" onClick={() => { setMode('recovery'); resetForm(); }} className={`flex-1 py-3 px-5 rounded-xl font-bold transition-all ${mode === 'recovery' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-600 hover:bg-white'}`}>
            Swipe Recovery
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

                <Input label="Advance Amount" type="number" className="font-bold text-lg" value={payAmount} onChange={e => { setPayAmount(e.target.value); setErrors(p => ({...p, payAmount: ''})); }} error={errors.payAmount} placeholder="0" />
                <Select label="Pay From" value={paySourceId} onChange={e => setPaySourceId(e.target.value)} options={accounts.filter(a => ['Bank', 'Cash', 'Wallet'].includes(a.category)).map(a => ({ label: `${a.name} (${formatCurrency(getAccountBalance(a.id))})`, value: a.id }))} />
                <Button type="submit" className="w-full">Pay Bill (Record Advance) <ArrowRight size={16}/></Button>
              </form>
            ) : (
              <form onSubmit={handleRecovery} className="space-y-6">
                <div className="bg-slate-50/80 p-5 rounded-xl border border-slate-200 space-y-4">
                  <div className="relative">
                    <Input label="Customer Phone" value={phone} onChange={(e) => handlePhoneChange(e.target.value)} onBlur={handlePhoneBlur} placeholder="10-digit phone" error={recoveryErrors.phone} maxLength={10} />
                    <div className="absolute right-4 top-10 text-slate-400 pointer-events-none"><Search size={16}/></div>
                  </div>
                  {customerId && !isNewCustomer && (
                    <div className="p-4 bg-white rounded-xl border border-emerald-200 flex justify-between items-center">
                      <div>
                        <p className="text-xs text-slate-500 font-bold uppercase">Linked Profile</p>
                        <p className="font-bold text-slate-900">{customerName}</p>
                      </div>
                      <CheckCircle2 className="text-emerald-600" size={20}/>
                    </div>
                  )}
                  {isNewCustomer && (
                    <p className="text-sm text-amber-600 font-medium">Customer not found. Create via Pay Advance first.</p>
                  )}
                </div>

                {customerId && !isNewCustomer && (
                  <>
                <Input label="Recovery Amount (₹)" type="number" className="font-bold text-lg" value={recoveryAmount} onChange={e => { setRecoveryAmount(e.target.value); setRecoveryErrors(p => ({...p, recoveryAmount: ''})); }} error={recoveryErrors.recoveryAmount} placeholder="0" />
                
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
                    onChange={e => setAppliedMdrPercent(e.target.value)} 
                    disabled
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Input label="Charges Collected" type="number" value={collectionAmount} onChange={e => { setCollectionAmount(e.target.value); setRecoveryErrors(p => ({...p, collectionAmount: ''})); }} error={recoveryErrors.collectionAmount} />
                    <p className="text-xs text-slate-500 mt-1.5 font-medium">Calculated via {currentCommRate}%</p>
                  </div>
                  <Select label="Collected Into" value={collectAccount} onChange={e => setCollectAccount(e.target.value)} options={collectIntoOptions} />
                </div>
                
                <div className="flex flex-wrap justify-end gap-4 text-xs font-medium">
                  <span className="text-slate-500">Est. MDR Cost: {formatCurrency(mdrPercent > 0 ? roundCurrency(recoveryAmt * (mdrPercent / 100)) : 0)}</span>
                  <span className="text-emerald-600">Net to Wallet: {formatCurrency(Math.max(0, recoveryAmt - (mdrPercent > 0 ? roundCurrency(recoveryAmt * (mdrPercent / 100)) : 0)))}</span>
                </div>

                <Button type="submit" variant="success" className="w-full">Complete Recovery</Button>
                  </>
                )}
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};
