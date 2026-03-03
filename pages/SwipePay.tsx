import React, { useState, useEffect } from 'react';
import { useERP } from '../context/ERPContext';
import { useToast } from '../context/ToastContext';
import { Layout } from '../components/Layout';
import { LedgerEntry, TransactionType, Rates } from '../types';
import { Card, CardContent, CardHeader, Input, Select, Button } from '../components/ui/Elements';
import { safeParseFloat, roundCurrency } from '../lib/utils';
import { DEFAULT_COMMISSION_RATES } from '../constants';
import { ArrowRight, Lock, Unlock, CheckCircle2, Info, UserPlus, Save, X } from 'lucide-react';

export const SwipePay: React.FC = () => {
  const { customers, wallets, accounts, postTransaction, formatCurrency, getAccountBalance, addCustomer, updateCustomer } = useERP();
  const toast = useToast();

  // --- Workflow State ---
  const [step, setStep] = useState<1 | 2>(1);

  // --- Step 1: Customer & Inflow Details ---
  const [phone, setPhone] = useState('');
  const [isPhoneLocked, setIsPhoneLocked] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [step1Errors, setStep1Errors] = useState<Record<string, string>>({});
  const [step2Errors, setStep2Errors] = useState<Record<string, string>>({});
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [isNewCustomer, setIsNewCustomer] = useState(false);
  const [commissionRates, setCommissionRates] = useState<Rates>(DEFAULT_COMMISSION_RATES);

  const [swipeWalletId, setSwipeWalletId] = useState(wallets[0]?.id || '');
  const [pgName, setPgName] = useState('');
  const [cardType, setCardType] = useState('visa');
  const [swipeAmount, setSwipeAmount] = useState<string>('');
  const [currentServiceRate, setCurrentServiceRate] = useState<string>('0');

  // --- Step 2: Outflow / Payout Details ---
  const [payoutAccountId, setPayoutAccountId] = useState('A002');
  const [payoutAmount, setPayoutAmount] = useState<string>('');
  const [transferCommission, setTransferCommission] = useState<string>('0'); // e.g. IMPS charge
  const [transactionNote, setTransactionNote] = useState('');

  // --- Logic ---
  const selectedWallet = wallets.find(w => w.id === swipeWalletId);
  useEffect(() => {
    if (selectedWallet && selectedWallet.pgs.length > 0) {
      setPgName(selectedWallet.pgs[0].name);
    }
  }, [swipeWalletId, selectedWallet]);

  useEffect(() => {
    const rate = (commissionRates as any)[cardType] || 0;
    setCurrentServiceRate(rate.toString());
  }, [cardType, commissionRates]);

  const handlePhoneSearch = () => {
    if (phone.length !== 10) return;
    const found = customers.find(c => c.phone === phone);
    if (found) {
      setCustomerId(found.id);
      setCustomerName(found.name);
      setCommissionRates(found.commissionRates);
      setIsNewCustomer(false);
      setIsPhoneLocked(true);
    } else {
      setCustomerId(null);
      setCustomerName(''); 
      setCommissionRates(DEFAULT_COMMISSION_RATES);
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

    const newId = await addCustomer({
      name: customerName,
      phone,
      commissionRates: commissionRates
    });
    if (!newId) return;
    setCustomerId(newId);
    setIsNewCustomer(false); // Switch to "swipe" mode for this existing customer
  };

  // Calculations
  const selectedPG = selectedWallet?.pgs.find(p => p.name === pgName) || selectedWallet?.pgs[0];
  const amountVal = safeParseFloat(swipeAmount);
  const serviceRateVal = safeParseFloat(currentServiceRate);
  const serviceFeeAmount = roundCurrency((amountVal * serviceRateVal) / 100);

  const portalRateVal = (selectedPG?.charges as any)?.[cardType] || 0;
  const portalFeeAmount = roundCurrency((amountVal * portalRateVal) / 100);

  const netPayableToCustomer = roundCurrency(amountVal - serviceFeeAmount);
  const estimatedProfit = roundCurrency(serviceFeeAmount - portalFeeAmount);

  // Payout Math (Step 2)
  const payVal = safeParseFloat(payoutAmount);
  const transCommVal = safeParseFloat(transferCommission);
  const finalPayoutResult = roundCurrency(payVal + transCommVal);

  const handleStep1Submit = (e: React.FormEvent) => {
    e.preventDefault();
    const err: Record<string, string> = {};
    if (!swipeAmount?.trim()) err.swipeAmount = 'Swipe amount is required';
    else if (amountVal <= 0) err.swipeAmount = 'Swipe amount must be greater than 0';
    const rateVal = safeParseFloat(currentServiceRate);
    if (isNaN(rateVal) || rateVal < 0 || rateVal > 100) err.currentServiceRate = 'Rate must be between 0 and 100%';
    setStep1Errors(err);
    if (Object.keys(err).length > 0 || !selectedWallet || !customerId) return;

    // Update customer rates if the specific one was edited during this transaction
    const updatedRates = { ...commissionRates, [cardType]: serviceRateVal };
    updateCustomer(customerId, { commissionRates: updatedRates });

    const entries: LedgerEntry[] = [
      { accountId: selectedWallet.ledgerAccountId, debit: amountVal, credit: 0 },
      { accountId: 'L001', debit: 0, credit: amountVal },
      { accountId: 'E001', debit: portalFeeAmount, credit: 0 },
      { accountId: selectedWallet.ledgerAccountId, debit: 0, credit: portalFeeAmount },
      { accountId: 'L001', debit: serviceFeeAmount, credit: 0 },
      { accountId: 'I001', debit: 0, credit: serviceFeeAmount }
    ];

    setStep1Errors({});
    postTransaction(
      `Swipe Inflow: ${customerName} (${cardType.toUpperCase()})`,
      TransactionType.SWIPE_PAY,
      entries,
      { customerId: customerId || undefined, walletId: selectedWallet.id, cardType: cardType }
    );

    setPayoutAmount(netPayableToCustomer.toString());
    setStep(2);
  };

  const handleStep2Submit = (e: React.FormEvent) => {
    e.preventDefault();
    const err: Record<string, string> = {};
    if (!payoutAmount?.trim()) err.payoutAmount = 'Settlement amount is required';
    else if (payVal <= 0) err.payoutAmount = 'Settlement amount must be greater than 0';
    if (transferCommission !== '' && (isNaN(transCommVal) || transCommVal < 0)) err.transferCommission = 'Transfer fee must be 0 or more';
    setStep2Errors(err);
    if (Object.keys(err).length > 0) return;

    const entries: LedgerEntry[] = [
      { accountId: 'L001', debit: payVal, credit: 0 },
      { accountId: payoutAccountId, debit: 0, credit: finalPayoutResult }
    ];
    
    if (transCommVal > 0) {
      entries.push({ accountId: 'E001', debit: transCommVal, credit: 0 });
    }

    postTransaction(
      `Payout Outflow: ${customerName}`,
      TransactionType.SWIPE_PAY,
      entries,
      { customerId: customerId || undefined }
    );

    toast.success("Transaction Cycle Complete!");
    setStep(1);
    setPhone('');
    setIsPhoneLocked(false);
    setSwipeAmount('');
    setTransferCommission('0');
    setStep1Errors({});
    setStep2Errors({});
  };

  const updateNewCustRate = (type: keyof Rates, val: string) => {
    setCommissionRates(prev => ({
      ...prev,
      [type]: safeParseFloat(val)
    }));
  };

  return (
    <Layout title="Swipe & Pay">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
        
        <div className="lg:col-span-2 space-y-6">
          {/* Progress Header */}
          <div className="flex items-center justify-between p-6 bg-white/95 backdrop-blur-md rounded-3xl border-2 border-slate-100 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.06)]">
            <div className={`flex items-center gap-4 ${step === 1 ? 'text-indigo-600' : 'text-slate-400'}`}>
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border-2 font-black text-lg transition-all duration-300 ${step === 1 ? 'border-indigo-500 bg-gradient-to-br from-indigo-50 to-indigo-100 shadow-lg shadow-indigo-500/20' : 'border-slate-200 bg-slate-50'}`}>1</div>
              <div>
                <p className="font-black text-sm uppercase tracking-widest">Step 1: Inflow</p>
                <p className="text-xs text-slate-500 font-semibold">Customer Swipe Details</p>
              </div>
            </div>
            <div className="p-2 bg-slate-100 rounded-full"><ArrowRight className="text-slate-400 w-5 h-5" /></div>
            <div className={`flex items-center gap-4 ${step === 2 ? 'text-emerald-600' : 'text-slate-400'}`}>
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border-2 font-black text-lg transition-all duration-300 ${step === 2 ? 'border-emerald-500 bg-gradient-to-br from-emerald-50 to-emerald-100 shadow-lg shadow-emerald-500/20' : 'border-slate-200 bg-slate-50'}`}>2</div>
              <div>
                <p className="font-black text-sm uppercase tracking-widest">Step 2: Outflow</p>
                <p className="text-xs text-slate-500 font-semibold">Final Settle Payout</p>
              </div>
            </div>
          </div>

          <Card className={`border-t-4 ${step === 1 ? 'border-t-indigo-500' : 'border-t-emerald-500'}`}>
            <CardHeader 
              title={step === 1 ? "Inflow Data Entry" : "Outflow Data Entry"} 
              subtitle={step === 1 ? "Identify customer via 10-digit phone" : "Verify net payout amount"} 
            />
            <CardContent>
              {step === 1 ? (
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

                        <Button type="submit" className="w-full bg-amber-600 hover:bg-amber-700">
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
                      <Button type="submit" size="lg" className="w-full h-14 text-lg">Process Inflow <ArrowRight size={20}/></Button>
                    </form>
                  )}
                </div>
              ) : (
                <form onSubmit={handleStep2Submit} className="space-y-6 animate-fade-in">
                  <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-200">
                    <p className="text-xs text-emerald-700 font-bold uppercase mb-2 tracking-wider">Step 1 Completed</p>
                    <p className="text-sm font-medium">Liability of <b>{formatCurrency(netPayableToCustomer)}</b> recorded for {customerName}.</p>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input label="Settlement Amount" type="number" value={payoutAmount} onChange={e => { setPayoutAmount(e.target.value); setStep2Errors(p => ({...p, payoutAmount: ''})); }} className="font-bold" error={step2Errors.payoutAmount} placeholder="0" />
                    <Input label="Wallet Transfer Fee (₹)" type="number" value={transferCommission} onChange={e => { setTransferCommission(e.target.value); setStep2Errors(p => ({...p, transferCommission: ''})); }} error={step2Errors.transferCommission} placeholder="0" />
                  </div>
                  
                  <Select 
                    label="Payout Source Account" 
                    value={payoutAccountId} 
                    onChange={e => setPayoutAccountId(e.target.value)} 
                    options={accounts.filter(a => ['Bank','Cash','Wallet'].includes(a.category)).map(a => ({ label: `${a.name} (${formatCurrency(getAccountBalance(a.id))})`, value: a.id }))} 
                  />
                  
                  <Input label="Internal Note" placeholder="IMPS Ref / Transfer Reason" value={transactionNote} onChange={e => setTransactionNote(e.target.value)} />

                  <div className="grid grid-cols-2 gap-4 pt-4">
                    <Button type="button" variant="outline" onClick={() => setStep(1)}>Back to Step 1</Button>
                    <Button type="submit" variant="success">Finish Outflow</Button>
                  </div>
                </form>
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
              {step === 1 ? (
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
          
          <Card className="bg-indigo-50/80 border-indigo-100">
            <CardContent className="flex items-start gap-3 text-sm text-indigo-800 font-medium">
              <Info className="shrink-0 mt-0.5 text-indigo-600" size={16}/>
              <p>The "Applied Rate" can be manually adjusted for one-time deals if necessary.</p>
            </CardContent>
          </Card>
        </div>

      </div>
    </Layout>
  );
};
