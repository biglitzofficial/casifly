import React, { useState, useEffect } from 'react';
import { useERP } from '../context/ERPContext';
import { useToast } from '../context/ToastContext';
import { Layout } from '../components/Layout';
import { LedgerEntry, TransactionType, Rates } from '../types';
import { Card, CardContent, Input, Select, Button } from '../components/ui/Elements';
import { safeParseFloat, roundCurrency } from '../lib/utils';
import { ArrowRight, CheckCircle2, Search } from 'lucide-react';
import { DEFAULT_COMMISSION_RATES } from '../constants';

export const PaySwipe: React.FC = () => {
  const { customers, wallets, accounts, postTransaction, formatCurrency, getAccountBalance, addCustomer, updateCustomer } = useERP();
  const toast = useToast();
  const [step, setStep] = useState<1|2>(1);
  
  // --- Step 1 State: Customer & Advance ---
  const [phone, setPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [isNewCustomer, setIsNewCustomer] = useState(false);
  const [commissionRates, setCommissionRates] = useState<Rates>(DEFAULT_COMMISSION_RATES);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [payAmount, setPayAmount] = useState<string>('');
  const [paySourceId, setPaySourceId] = useState('A002');
  
  // --- Step 2 State: Recovery ---
  const [step2Errors, setStep2Errors] = useState<Record<string, string>>({});
  const [swipeWalletId, setSwipeWalletId] = useState(wallets[0]?.id || '');
  const [pgName, setPgName] = useState('');
  const [cardType, setCardType] = useState('visa');
  
  const [collectionAmount, setCollectionAmount] = useState<string>('');
  const [collectAccount, setCollectAccount] = useState('A001');
  const [appliedMdrPercent, setAppliedMdrPercent] = useState<string>('0');
  
  // Editable Commission Rate for this transaction
  const [currentCommRate, setCurrentCommRate] = useState<string>('0');

  // Customer Lookup
  const handlePhoneBlur = () => {
    const digits = phone.replace(/\D/g, '');
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
  };

  const selectedWallet = wallets.find(w => w.id === swipeWalletId);
  const selectedPG = selectedWallet?.pgs.find(p => p.name === pgName) || selectedWallet?.pgs[0];

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

  // Sync MDR % from PG when wallet/pg/card changes (user can override manually)
  useEffect(() => {
    if (selectedWallet && selectedPG && cardType) {
      // @ts-ignore
      const mdr = selectedPG.charges[cardType] || 0;
      setAppliedMdrPercent(mdr.toString());
    }
  }, [swipeWalletId, pgName, cardType, selectedWallet, selectedPG]);

  // Auto-calculate suggested collection amount based on Advance Amount * Commission Rate
  useEffect(() => {
    if (payAmount) {
      const amt = safeParseFloat(payAmount);
      const rate = safeParseFloat(currentCommRate);
      const suggestedCollection = roundCurrency(amt * (rate / 100));
      setCollectionAmount(suggestedCollection.toString());
    }
  }, [payAmount, currentCommRate]);

  const amount = safeParseFloat(payAmount);
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
    setStep(2);
  };

  const validateStep2 = (): boolean => {
    const err: Record<string, string> = {};
    const coll = safeParseFloat(collectionAmount);
    if (isNaN(coll) || coll < 0) err.collectionAmount = 'Charges collected must be 0 or more';
    const rateVal = safeParseFloat(currentCommRate);
    if (isNaN(rateVal) || rateVal < 0 || rateVal > 100) err.currentCommRate = 'Rate must be between 0 and 100%';
    setStep2Errors(err);
    return Object.keys(err).length === 0;
  };

  const handleStep2 = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateStep2()) return;
    const wallet = wallets.find(w => w.id === swipeWalletId);
    if (!wallet) return;

    // 1. Update Customer Rate if changed
    const rateVal = safeParseFloat(currentCommRate);
    if (customerId) {
        const updatedRates = { ...commissionRates, [cardType]: rateVal };
        updateCustomer(customerId, { commissionRates: updatedRates });
    }

    // 2. Financial Calculation: PG charges MDR, so wallet receives (amount - MDR)
    const mdr = roundCurrency(amount * (mdrPercent / 100));
    const netToWallet = roundCurrency(amount - mdr);

    const entries: LedgerEntry[] = [
      // 1. Principal Recovery: Wallet receives NET (after MDR), Customer Debt cleared
      { accountId: wallet.ledgerAccountId, debit: netToWallet, credit: 0 },
      { accountId: 'A006', debit: 0, credit: amount },
      { accountId: 'E001', debit: mdr, credit: 0 },
      
      // 2. Charges Collection (Bank UP, Income UP)
      { accountId: collectAccount, debit: collAmount, credit: 0 },
      { accountId: 'I001', debit: 0, credit: collAmount }
    ];

    postTransaction(
      `Recovery: ${customerName} (${cardType.toUpperCase()})`, 
      TransactionType.PAY_SWIPE, 
      entries,
      { 
        customerId: customerId || undefined,
        walletId: wallet.id,
        cardType: cardType
      }
    );
    toast.success("Cycle Completed!");
    setStep(1);
    setPayAmount('');
    setCollectionAmount('');
    setPhone('');
    setCustomerName('');
    setCustomerId(null);
    setErrors({});
    setStep2Errors({});
  };

  return (
    <Layout title="Pay & Swipe (Advance Flow)">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-4 mb-8 p-5 bg-white rounded-2xl shadow-card border border-slate-100">
           <StepIndicator num={1} title="Pay Advance" active={step === 1} done={step > 1} />
           <div className="flex-1 h-0.5 bg-slate-200 rounded" />
           <StepIndicator num={2} title="Swipe Recovery" active={step === 2} done={false} />
        </div>

        <Card>
          <CardContent className="pt-6">
            {step === 1 ? (
              <form onSubmit={handleStep1} className="space-y-6">
                <div className="bg-indigo-50/60 p-5 rounded-xl border border-indigo-100 grid grid-cols-2 gap-4">
                    <div className="relative col-span-2 md:col-span-1">
                      <Input 
                        label="Customer Phone" 
                        value={phone} 
                        onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} 
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
              <form onSubmit={handleStep2} className="space-y-6">
                <div className="bg-emerald-50 p-5 rounded-xl border border-emerald-100">
                  <p className="text-sm font-medium text-emerald-800">Recovering: <span className="font-bold">{formatCurrency(amount)}</span> from {customerName}</p>
                </div>
                
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
                    onChange={e => { setCurrentCommRate(e.target.value); setStep2Errors(p => ({...p, currentCommRate: ''})); }} 
                    error={step2Errors.currentCommRate}
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
                    <Input label="Charges Collected" type="number" value={collectionAmount} onChange={e => { setCollectionAmount(e.target.value); setStep2Errors(p => ({...p, collectionAmount: ''})); }} error={step2Errors.collectionAmount} />
                    <p className="text-xs text-slate-500 mt-1.5 font-medium">Calculated via {currentCommRate}%</p>
                  </div>
                  <Select label="Collected Into" value={collectAccount} onChange={e => setCollectAccount(e.target.value)} options={accounts.filter(a => ['Bank', 'Cash', 'Wallet'].includes(a.category)).map(a => ({ label: a.name, value: a.id }))} />
                </div>
                
                <div className="flex flex-wrap justify-end gap-4 text-xs font-medium">
                  <span className="text-slate-500">Est. MDR Cost: {formatCurrency(mdrPercent > 0 ? roundCurrency(amount * (mdrPercent / 100)) : 0)}</span>
                  <span className="text-emerald-600">Net to Wallet: {formatCurrency(Math.max(0, amount - (mdrPercent > 0 ? roundCurrency(amount * (mdrPercent / 100)) : 0)))}</span>
                </div>

                <Button type="submit" variant="success" className="w-full">Complete Recovery</Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

const StepIndicator = ({ num, title, active, done }: any) => (
  <div className={`flex items-center gap-3 ${active ? 'text-indigo-600' : 'text-slate-400'}`}>
    <div className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold transition-all duration-200 ${active ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/30' : done ? 'bg-emerald-500 text-white' : 'bg-slate-100'}`}>
      {done ? <CheckCircle2 size={20} /> : num}
    </div>
    <span className="font-semibold">{title}</span>
  </div>
);
