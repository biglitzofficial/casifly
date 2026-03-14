import React, { useState, useEffect } from 'react';
import { useERP } from '../context/ERPContext';
import { useToast } from '../context/ToastContext';
import { Layout } from '../components/Layout';
import { LedgerEntry, TransactionType, Rates } from '../types';
import { Card, CardContent, CardHeader, Input, Select, Button } from '../components/ui/Elements';
import { safeParseFloat, roundCurrency } from '../lib/utils';
import { DEFAULT_COMMISSION_RATES } from '../constants';
import { ArrowRight, ArrowDownToLine, ArrowUpFromLine, Lock, Unlock, CheckCircle2, Info, UserPlus, Save, X } from 'lucide-react';

export const SwipePay: React.FC = () => {
  const { customers, wallets, accounts, postTransaction, formatCurrency, getAccountBalance, addCustomer, updateCustomer } = useERP();
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
  const [appliedPortalRate, setAppliedPortalRate] = useState<string>('0'); // Wallet PG charge % - manual override

  // --- Step 2: Outflow / Payout Details ---
  const [outflowWalletId, setOutflowWalletId] = useState(wallets[0]?.id || ''); // Pay FROM this wallet (money leaves wallet)
  const [payoutAmount, setPayoutAmount] = useState<string>('');
  const [transferCommission, setTransferCommission] = useState<string>('0'); // e.g. IMPS charge
  const [transactionNote, setTransactionNote] = useState('');
  const [inflowLoading, setInflowLoading] = useState(false);
  const [outflowLoading, setOutflowLoading] = useState(false);
  const [createCustLoading, setCreateCustLoading] = useState(false);

  // --- Logic ---
  const selectedWallet = wallets.find(w => w.id === swipeWalletId);
  useEffect(() => {
    if (selectedWallet && selectedWallet.pgs.length > 0) {
      setPgName(selectedWallet.pgs[0].name);
    }
  }, [swipeWalletId, selectedWallet]);

  useEffect(() => {
    const rate = commissionRates[cardType as keyof Rates] ?? '0';
    setCurrentServiceRate(String(rate));
  }, [cardType, commissionRates]);

  // Sync Wallet PG Charge % from selected PG when wallet/pg/card changes
  useEffect(() => {
    const pg = selectedWallet?.pgs.find(p => p.name === pgName) || selectedWallet?.pgs[0];
    const mdr = (pg?.charges as any)?.[cardType] ?? 0;
    setAppliedPortalRate(String(mdr));
  }, [swipeWalletId, pgName, cardType, selectedWallet]);

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

  // Calculations
  const selectedPG = selectedWallet?.pgs.find(p => p.name === pgName) || selectedWallet?.pgs[0];
  const amountVal = safeParseFloat(swipeAmount);
  const serviceRateVal = safeParseFloat(currentServiceRate);
  const serviceFeeAmount = roundCurrency((amountVal * serviceRateVal) / 100);

  const portalRateVal = safeParseFloat(appliedPortalRate); // Manual entry, synced from PG
  const portalFeeAmount = roundCurrency((amountVal * portalRateVal) / 100);

  const netPayableToCustomer = roundCurrency(amountVal - serviceFeeAmount);
  const estimatedProfit = roundCurrency(serviceFeeAmount - portalFeeAmount);

  // Payout Math (Step 2) - Transfer fee is an expense that reduces net outflow
  const payVal = safeParseFloat(payoutAmount);
  const transCommVal = safeParseFloat(transferCommission);
  const finalPayoutResult = roundCurrency(Math.max(0, payVal - transCommVal));

  const handleStep1Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err: Record<string, string> = {};
    if (!swipeAmount?.trim()) err.swipeAmount = 'Swipe amount is required';
    else if (amountVal <= 0) err.swipeAmount = 'Swipe amount must be greater than 0';
    const rateVal = safeParseFloat(currentServiceRate);
    if (isNaN(rateVal) || rateVal < 0 || rateVal > 100) err.currentServiceRate = 'Rate must be between 0 and 100%';
    setStep1Errors(err);
    if (Object.keys(err).length > 0 || !selectedWallet || !customerId) return;

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
      { accountId: 'E001', debit: portalFeeAmount, credit: 0 },
      { accountId: selectedWallet.ledgerAccountId, debit: 0, credit: portalFeeAmount },
      { accountId: 'L001', debit: serviceFeeAmount, credit: 0 },
      { accountId: 'I001', debit: 0, credit: serviceFeeAmount }
    ];
      const p = postTransaction(
        `Swipe Inflow: ${customerName} (${cardType.toUpperCase()})`,
        TransactionType.SWIPE_PAY,
        inflowEntries,
        { customerId: customerId || undefined, walletId: selectedWallet.id, cardType: cardType }
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
    setStep2Errors(err);
    if (Object.keys(err).length > 0) return;

    // Ledger: Pay FROM wallet (money leaves wallet). L001 reduced by payVal; transfer fee is our expense.
    const outflowWallet = wallets.find(w => w.id === outflowWalletId);
    if (!outflowWallet) {
      toast.error('Please select a wallet to pay from.');
      return;
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

      const p = postTransaction(
        `Payout Outflow: ${customerName}`,
        TransactionType.SWIPE_PAY,
        entries,
        { customerId: customerId || undefined, walletId: outflowWallet.id }
      );
      if (p && typeof (p as Promise<unknown>).then === 'function') await p;

    toast.success('Outflow recorded successfully!');
    resetCustomer();
    setPayoutAmount('');
    setTransferCommission('0');
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
              onClick={() => { setMode('inflow'); resetCustomer(); setSwipeAmount(''); setStep1Errors({}); }}
              className={`flex-1 flex items-center justify-center gap-2 py-4 px-6 rounded-xl font-bold text-sm uppercase tracking-wider transition-all ${mode === 'inflow' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-600 hover:bg-slate-200'}`}
            >
              <ArrowDownToLine size={20} /> Inflow Entry
            </button>
            <button
              type="button"
              onClick={() => { setMode('outflow'); resetCustomer(); setPayoutAmount(''); setTransferCommission('0'); setStep2Errors({}); }}
              className={`flex-1 flex items-center justify-center gap-2 py-4 px-6 rounded-xl font-bold text-sm uppercase tracking-wider transition-all ${mode === 'outflow' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-600 hover:bg-slate-200'}`}
            >
              <ArrowUpFromLine size={20} /> Outflow Entry
            </button>
          </div>

          <Card className={`border-t-4 ${mode === 'inflow' ? 'border-t-indigo-500' : 'border-t-emerald-500'}`}>
            <CardHeader 
              title={mode === 'inflow' ? "Inflow Data Entry" : "Outflow Data Entry"} 
              subtitle={mode === 'inflow' ? "Record customer swipe (inflow)" : "Record payout settlement (outflow)"} 
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
                      <div className="grid grid-cols-2 gap-4">
                        <Select label="Inflow Wallet" value={swipeWalletId} onChange={e => setSwipeWalletId(e.target.value)} options={wallets.map(w => ({ label: w.name, value: w.id }))} />
                        <Select label="Card Type" value={cardType} onChange={e => setCardType(e.target.value)} options={[{label:'Visa',value:'visa'},{label:'Master',value:'master'},{label:'Amex',value:'amex'},{label:'Rupay',value:'rupay'}]} />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <Input label="Swipe Amount (₹)" type="number" className="text-xl font-bold" value={swipeAmount} onChange={e => { setSwipeAmount(e.target.value); setStep1Errors(p => ({...p, swipeAmount: ''})); }} error={step1Errors.swipeAmount} placeholder="0" />
                        <Input label="Applied Rate %" type="number" step="0.1" value={currentServiceRate} onChange={e => { setCurrentServiceRate(e.target.value); setStep1Errors(p => ({...p, currentServiceRate: ''})); }} error={step1Errors.currentServiceRate} />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <Input label="Wallet PG Charge %" type="number" step="0.1" value={appliedPortalRate} onChange={e => setAppliedPortalRate(e.target.value)} placeholder="e.g. 0.5" title="Payment gateway MDR % – pre-filled from wallet, editable for overrides" />
                      </div>
                      <Button type="submit" size="lg" className="w-full h-14 text-lg" loading={inflowLoading}>Process Inflow <ArrowRight size={20}/></Button>
                    </form>
                  )}
                </div>
              ) : (
                <div className="space-y-6 animate-fade-in">
                  {/* Outflow: Customer lookup (same as Inflow - standalone) */}
                  <div className="p-5 bg-slate-50/80 rounded-xl border border-slate-200 space-y-4">
                    <div className="flex items-end gap-3">
                      <div className="flex-1">
                        <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                          {isPhoneLocked ? <Lock size={14}/> : <Unlock size={14}/>} Mobile Number (10 Digits)
                        </label>
                        <input 
                          type="text"
                          maxLength={10}
                          className={`w-full px-4 py-3 border rounded-xl outline-none transition-all duration-200 text-lg font-mono ${isPhoneLocked ? 'bg-slate-100 text-slate-500 border-slate-300' : 'border-emerald-300 focus:ring-2 focus:ring-emerald-500/30 font-bold'}`}
                          value={phone}
                          onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                          disabled={isPhoneLocked}
                          placeholder="00000 00000"
                        />
                      </div>
                      {isPhoneLocked ? (
                        <Button type="button" variant="outline" onClick={resetCustomer} className="h-[52px]">Change</Button>
                      ) : (
                        <Button type="button" onClick={handlePhoneSearch} disabled={phone.length !== 10} className="h-[52px] bg-emerald-600 hover:bg-emerald-700">Search</Button>
                      )}
                    </div>
                    {isPhoneLocked && !isNewCustomer && (
                      <div className="p-4 bg-white rounded-xl border border-slate-200 flex justify-between items-center">
                        <div>
                          <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Customer</p>
                          <p className="font-bold text-slate-900">{customerName}</p>
                        </div>
                        <CheckCircle2 className="text-emerald-600" size={20}/>
                      </div>
                    )}
                    {isPhoneLocked && isNewCustomer && (
                      <p className="text-sm text-amber-700">Customer not found. Create via Inflow first.</p>
                    )}
                  </div>

                  {isPhoneLocked && !isNewCustomer && (
                    <form onSubmit={handleStep2Submit} className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Input label="Settlement Amount (₹)" type="number" value={payoutAmount} onChange={e => { setPayoutAmount(e.target.value); setStep2Errors(p => ({...p, payoutAmount: ''})); }} className="font-bold" error={step2Errors.payoutAmount} placeholder="0" />
                        <Input label="Wallet Transfer Fee (₹)" type="number" value={transferCommission} onChange={e => { setTransferCommission(e.target.value); setStep2Errors(p => ({...p, transferCommission: ''})); }} error={step2Errors.transferCommission} placeholder="0" />
                      </div>
                      <Select 
                        label="Pay From Wallet" 
                        value={outflowWalletId} 
                        onChange={e => setOutflowWalletId(e.target.value)} 
                        options={wallets.map(w => ({ label: `${w.name} (${formatCurrency(getAccountBalance(w.ledgerAccountId))})`, value: w.id }))} 
                      />
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
                     <span className="text-base font-semibold text-rose-300">Portal Fee ({portalRateVal}%)</span>
                     <span className="text-lg font-bold text-white tabular-nums">-{formatCurrency(portalFeeAmount)}</span>
                   </div>
                   <div className="flex justify-between items-center pb-5 border-b-2 border-slate-600">
                     <span className="text-base font-semibold text-indigo-300">Our Service Fee ({serviceRateVal}%)</span>
                     <span className="text-lg font-bold text-white tabular-nums">-{formatCurrency(serviceFeeAmount)}</span>
                   </div>
                   <div className="pt-5">
                     <p className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-2">Net Payable to Customer</p>
                     <p className="text-4xl font-black text-indigo-300 tabular-nums">{formatCurrency(netPayableToCustomer)}</p>
                   </div>
                   <div className="mt-6 pt-5 border-t-2 border-slate-600">
                     <div className="flex justify-between items-center">
                       <span className="text-base font-semibold text-slate-300">Expected Margin</span>
                       <span className="text-xl font-black text-emerald-400 tabular-nums">+{formatCurrency(estimatedProfit)}</span>
                     </div>
                   </div>
                </div>
              ) : (
                <div className="space-y-6">
                   <div className="flex justify-between items-center">
                     <span className="text-base font-semibold text-slate-200">Liability Settle</span>
                     <span className="text-2xl font-black text-white tabular-nums">{formatCurrency(payVal)}</span>
                   </div>
                   <div className="flex justify-between items-center pb-5 border-b-2 border-slate-600">
                     <span className="text-base font-semibold text-rose-300">Transfer Commission</span>
                     <span className="text-lg font-bold text-white tabular-nums">+{formatCurrency(transCommVal)}</span>
                   </div>
                   <div className="pt-5">
                     <p className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-2">Total Result (Net Outflow)</p>
                     <p className="text-4xl font-black text-emerald-400 tabular-nums">{formatCurrency(finalPayoutResult)}</p>
                   </div>
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
    </Layout>
  );
};
