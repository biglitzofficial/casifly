import React, { useState } from 'react';
import { useERP } from '../context/ERPContext';
import { useToast } from '../context/ToastContext';
import { Layout } from '../components/Layout';
import { LedgerEntry, TransactionType } from '../types';
import { Card, CardContent, CardHeader, Input, Select, Button } from '../components/ui/Elements';
import { safeParseFloat } from '../lib/utils';
import { ArrowDown, Search } from 'lucide-react';
import { DEFAULT_COMMISSION_RATES } from '../constants';

export const MoneyTransfer: React.FC = () => {
  const { customers, wallets, accounts, postTransaction, formatCurrency, addCustomer, getAccountBalance } = useERP();
  const toast = useToast();

  const [phone, setPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [isNewCustomer, setIsNewCustomer] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [amount, setAmount] = useState('');
  const [inflowAccount, setInflowAccount] = useState('A001');
  const [outflowWallet, setOutflowWallet] = useState(wallets[0]?.id || '');
  const [serviceCharge, setServiceCharge] = useState('');

  const handlePhoneBlur = () => {
    const digits = phone.replace(/\D/g, '');
    if (digits.length !== 10) return;
    const found = customers.find(c => c.phone === digits);
    if (found) {
      setCustomerId(found.id);
      setCustomerName(found.name);
      setIsNewCustomer(false);
    } else {
      setCustomerId(null);
      setCustomerName('');
      setIsNewCustomer(true);
    }
    setErrors(p => ({ ...p, phone: '' }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err: Record<string, string> = {};
    const digits = phone.replace(/\D/g, '');
    if (!digits) err.phone = 'Phone number is required';
    else if (digits.length !== 10) err.phone = 'Phone must be exactly 10 digits';
    if (!customerName?.trim()) err.customerName = 'Customer name is required';
    else if (customerName.trim().length < 2) err.customerName = 'Name must be at least 2 characters';
    const val = safeParseFloat(amount);
    if (!amount?.trim()) err.amount = 'Transfer amount is required';
    else if (val <= 0) err.amount = 'Transfer amount must be greater than 0';
    const charge = safeParseFloat(serviceCharge);
    if (serviceCharge !== '' && (isNaN(charge) || charge < 0)) err.serviceCharge = 'Commission must be 0 or more';
    setErrors(err);
    if (Object.keys(err).length > 0) return;

    const wallet = wallets.find(w => w.id === outflowWallet);
    if (!wallet) return;

    let finalName = customerName.trim();
    let finalCustomerId = customerId;
    if (isNewCustomer) {
        const newId = await addCustomer({
            name: finalName,
            phone: digits,
            commissionRates: DEFAULT_COMMISSION_RATES
        });
        if (!newId) return;
        finalCustomerId = newId;
    }

    const totalReceived = val + charge;
    const entries: LedgerEntry[] = [
      { accountId: inflowAccount, debit: totalReceived, credit: 0 },
      { accountId: wallet.ledgerAccountId, debit: 0, credit: val },
      { accountId: 'I001', debit: 0, credit: charge }
    ];
    
    postTransaction(
      `DMT: ${finalName}`, 
      TransactionType.MONEY_TRANSFER, 
      entries,
      { 
        customerId: finalCustomerId || undefined,
        walletId: wallet.id 
      }
    );
    toast.success("DMT Recorded Successfully");
    setAmount('');
    setServiceCharge('');
    setPhone('');
    setCustomerName('');
    setIsNewCustomer(false);
    setErrors({});
  };

  return (
    <Layout title="Money Transfer (DMT)">
       <Card className="max-w-2xl mx-auto">
          <CardHeader title="Domestic Money Transfer" subtitle="Receive cash, send from wallet." />
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              
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
                    <div className="absolute right-4 top-10 text-slate-400 pointer-events-none"><Search size={16} /></div>
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
              
              <div className="p-5 bg-slate-50 rounded-xl border border-slate-200 space-y-4">
                 <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider">Incoming (Cash/Bank)</h4>
                 <div className="grid grid-cols-2 gap-4">
                    <Input label="Transfer Amount" type="number" value={amount} onChange={e => { setAmount(e.target.value); setErrors(p => ({...p, amount: ''})); }} error={errors.amount} placeholder="0" />
                    <Input label="Our Commission" type="number" value={serviceCharge} onChange={e => { setServiceCharge(e.target.value); setErrors(p => ({...p, serviceCharge: ''})); }} error={errors.serviceCharge} placeholder="0" />
                 </div>
                 <Select label="Receive Into" value={inflowAccount} onChange={e => setInflowAccount(e.target.value)} options={accounts.filter(a => ['Cash', 'Bank', 'Wallet'].includes(a.category)).map(a => ({ label: a.name, value: a.id }))} />
              </div>

              <div className="flex justify-center">
                <div className="p-2 bg-slate-100 rounded-full">
                  <ArrowDown className="text-slate-400" size={24} />
                </div>
              </div>

              <div className="p-5 bg-indigo-50 rounded-xl border border-indigo-100 space-y-4">
                 <h4 className="text-xs font-bold text-indigo-700 uppercase tracking-wider">Outgoing (Wallet)</h4>
                 <Select label="Send From Wallet" value={outflowWallet} onChange={e => setOutflowWallet(e.target.value)} options={wallets.map(w => ({ label: `${w.name} (Bal: ${formatCurrency(getAccountBalance(w.ledgerAccountId))})`, value: w.id }))} />
              </div>

              <Button type="submit" className="w-full">Execute Transfer</Button>
            </form>
          </CardContent>
       </Card>
    </Layout>
  );
};
