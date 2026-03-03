import React, { useState } from 'react';
import { useERP } from '../context/ERPContext';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import { Layout } from '../components/Layout';
import { Card, CardHeader, CardContent, Input, Button, Select } from '../components/ui/Elements';
import { PageFilters } from '../components/ui/PageFilters';
import { Plus, Save, Activity, Users, Wallet as WalletIcon, Edit2, Check, X, List, LayoutGrid, Trash2, Download, Upload } from 'lucide-react';
import { CreateCustomerDTO, CreateWalletDTO, PGConfig, Rates } from '../types';
import { formatCurrency, safeParseFloat } from '../lib/utils';

type Tab = 'reconcile' | 'customers' | 'wallets' | 'data';

export const Masters: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('reconcile');

  return (
    <Layout title="Masters & Configuration">
      <div className="flex gap-2 mb-6 p-2 bg-white/90 dark:bg-slate-800/90 backdrop-blur-md rounded-2xl border-2 border-slate-100 dark:border-slate-700 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.06)] dark:shadow-none w-fit flex-wrap">
        <TabButton id="reconcile" active={activeTab} onClick={setActiveTab} icon={Activity} label="Reconciliation" />
        <TabButton id="customers" active={activeTab} onClick={setActiveTab} icon={Users} label="Customers" />
        <TabButton id="wallets" active={activeTab} onClick={setActiveTab} icon={WalletIcon} label="Wallets" />
        <TabButton id="data" active={activeTab} onClick={setActiveTab} icon={Save} label="Backup & Restore" />
      </div>

      <div className="animate-fade-in">
        {activeTab === 'reconcile' && <ReconciliationView />}
        {activeTab === 'customers' && <CustomersView />}
        {activeTab === 'wallets' && <WalletsView />}
        {activeTab === 'data' && <DataBackupView />}
      </div>
    </Layout>
  );
};

const TabButton = ({ id, active, onClick, icon: Icon, label }: any) => (
  <button 
    onClick={() => onClick(id)}
    className={`flex items-center gap-2 px-6 py-3 font-bold text-sm transition-all duration-300 rounded-xl ${
      active === id 
        ? 'bg-gradient-to-r from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/30' 
        : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
    }`}
  >
    <Icon size={16} />
    {label}
  </button>
);

const DataBackupView = () => {
  const { exportBackup, restoreBackup } = useERP();
  const toast = useToast();
  const { confirm } = useConfirm();
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleExport = () => {
    const json = exportBackup();
    const blob = new Blob([json], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `finledger-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    toast.success('Backup exported successfully');
  };

  const handleImport = async () => {
    const ok = await confirm({
      title: 'Restore Backup',
      message: 'This will replace all current data. Are you sure?',
      confirmText: 'Restore',
      variant: 'danger',
    });
    if (!ok) return;
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = restoreBackup(reader.result as string);
      if (result.success) {
        toast.success('Backup restored. Refreshing...');
        window.location.reload();
      } else {
        toast.error(result.error || 'Restore failed');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <Card className="max-w-2xl">
      <CardHeader title="Backup & Restore" subtitle="Export or restore all data (ERP + stores & users)" />
      <CardContent className="space-y-4">
        <p className="text-sm text-slate-600 dark:text-slate-400">Export saves accounts, customers, wallets, transactions, and store/user data to a JSON file.</p>
        <div className="flex gap-3">
          <Button onClick={handleExport} variant="outline">
            <Download size={18} /> Export Backup
          </Button>
          <Button onClick={handleImport} variant="outline">
            <Upload size={18} /> Restore Backup
          </Button>
          <input type="file" accept=".json" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">After restore, the page will reload to apply changes.</p>
      </CardContent>
    </Card>
  );
};

const ReconciliationView = () => {
  const { wallets, getAccountBalance, formatCurrency, reconcileWallet } = useERP();
  const toast = useToast();
  const [values, setValues] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');

  const filteredWallets = wallets.filter(w =>
    w.name.toLowerCase().includes(search.toLowerCase()) || w.ledgerAccountId.toLowerCase().includes(search.toLowerCase())
  );

  const handleAction = (id: string) => {
    const val = parseFloat(values[id]);
    if (!isNaN(val)) {
      reconcileWallet(id, val);
      setValues(p => ({...p, [id]: ''}));
      toast.success('Reconciliation posted.');
    }
  };

  return (
    <div className="space-y-6">
      <PageFilters
        sectionTitle="Filters"
        searchPlaceholder="Search by wallet name or ledger ID..."
        searchValue={search}
        onSearchChange={setSearch}
      />
    <Card>
      <CardHeader title="Daily Wallet Reconciliation" subtitle="Compare system balance with actual closing balance" />
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-600">
            <tr>
              <th className="p-4">Wallet</th>
              <th className="p-4 text-right">System Balance</th>
              <th className="p-4 w-48">Actual Balance</th>
              <th className="p-4 w-32">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {filteredWallets.map((w, idx) => (
              <tr key={w.id} className={`hover:bg-indigo-50/30 dark:hover:bg-indigo-900/20 transition-colors ${idx % 2 === 1 ? 'bg-slate-50/30 dark:bg-slate-800/30' : ''}`}>
                <td className="p-4 font-semibold text-slate-800 dark:text-slate-200">{w.name}</td>
                <td className="p-4 text-right font-mono font-semibold text-indigo-600 dark:text-indigo-400">{formatCurrency(getAccountBalance(w.ledgerAccountId))}</td>
                <td className="p-4">
                  <Input 
                    type="number" 
                    placeholder="0.00" 
                    value={values[w.id] || ''} 
                    onChange={e => setValues({...values, [w.id]: e.target.value})} 
                  />
                </td>
                <td className="p-4">
                  <Button size="sm" onClick={() => handleAction(w.id)}>Reconcile</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
    </div>
  );
};

const DEFAULT_RATES = { visa: 2.0, master: 2.0, amex: 3.0, rupay: 1.5 };

const PHONE_REGEX = /^\d{0,10}$/;
const validateCustomerForm = (data: CreateCustomerDTO, isEdit: boolean, editingId: string | null, existingPhones: string[]) => {
  const errors: Record<string, string> = {};
  const name = data.name?.trim() || '';
  const phone = data.phone?.trim() || '';
  if (!name) errors.name = 'Full name is required';
  else if (name.length < 2) errors.name = 'Name must be at least 2 characters';
  if (!phone) errors.phone = 'Phone number is required';
  else if (!/^\d{10}$/.test(phone)) errors.phone = 'Phone must be exactly 10 digits';
  else if (!isEdit && existingPhones.includes(phone)) errors.phone = 'This phone number is already registered';
  const rates = data.commissionRates;
  (['visa', 'master', 'amex', 'rupay'] as const).forEach(key => {
    const v = rates[key];
    if (typeof v !== 'number' || isNaN(v) || v < 0 || v > 100) {
      errors[`rate_${key}`] = `${key.charAt(0).toUpperCase() + key.slice(1)} must be 0–100%`;
    }
  });
  return errors;
};

const CustomersView = () => {
  const { customers, addCustomer, updateCustomer, deleteCustomer } = useERP();
  const { confirm } = useConfirm();
  const [isAdding, setIsAdding] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'card'>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState<CreateCustomerDTO>({ 
    name: '', 
    phone: '', 
    commissionRates: { ...DEFAULT_RATES } 
  });

  const resetForm = () => {
    setFormData({ name: '', phone: '', commissionRates: { ...DEFAULT_RATES } });
    setErrors({});
    setIsAdding(false);
    setEditingId(null);
  };

  const handlePhoneChange = (value: string) => {
    if (PHONE_REGEX.test(value)) {
      setFormData(prev => ({ ...prev, phone: value }));
      setErrors(prev => (prev.phone ? { ...prev, phone: undefined } : prev));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { ...formData, name: formData.name.trim(), phone: formData.phone.trim() };
    const otherPhones = customers.filter(c => c.id !== editingId).map(c => c.phone);
    const validationErrors = validateCustomerForm(payload, !!editingId, editingId, otherPhones);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setErrors({});
    if (editingId) {
      updateCustomer(editingId, payload);
      resetForm();
    } else {
      const id = await addCustomer(payload);
      if (id) resetForm();
    }
  };

  const handleEdit = (c: { id: string; name: string; phone: string; commissionRates: Rates }) => {
    setEditingId(c.id);
    setErrors({});
    setFormData({
      name: c.name,
      phone: c.phone.replace(/\D/g, '').slice(0, 10),
      commissionRates: { ...c.commissionRates }
    });
  };

  const handleDelete = async (id: string, name: string) => {
    const ok = await confirm({
      title: 'Delete Customer',
      message: `Delete customer "${name}"? This cannot be undone.`,
      confirmText: 'Delete',
      variant: 'danger',
    });
    if (ok) deleteCustomer(id);
  };

  const updateRate = (key: keyof typeof formData.commissionRates, value: string) => {
    const num = safeParseFloat(value);
    setFormData(prev => ({
      ...prev,
      commissionRates: { ...prev.commissionRates, [key]: num }
    }));
    if (errors[`rate_${key}`]) setErrors(prev => ({ ...prev, [`rate_${key}`]: undefined }));
  };

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search) || c.id.toLowerCase().includes(search.toLowerCase())
  );
  const isFormOpen = isAdding || editingId;

  return (
    <div className="space-y-6">
      <PageFilters
        sectionTitle="Filters"
        searchPlaceholder="Search by name, phone or ID..."
        searchValue={search}
        onSearchChange={setSearch}
      />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-600 dark:text-slate-400">View:</span>
          <div className="flex p-1 bg-slate-100 rounded-lg">
            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
                viewMode === 'list' ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              <List size={16} />
              List
            </button>
            <button
              onClick={() => setViewMode('card')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
                viewMode === 'card' ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              <LayoutGrid size={16} />
              Card
            </button>
          </div>
        </div>
        <Button 
          onClick={() => isFormOpen ? resetForm() : setIsAdding(true)} 
          variant={isFormOpen ? 'secondary' : 'primary'}
        >
          {isFormOpen ? 'Cancel' : 'Add New Customer'}
        </Button>
      </div>

      {(isAdding || editingId) && (
        <Card className="max-w-xl mx-auto border-indigo-200">
          <CardHeader 
            title={editingId ? 'Edit Customer' : 'Create Customer'} 
            subtitle={editingId ? 'Update customer details and commission rates.' : 'Adds a customer and a corresponding payable ledger account.'} 
          />
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="Full Name"
                value={formData.name}
                onChange={e => { setFormData({...formData, name: e.target.value}); if (errors.name) setErrors(p => ({...p, name: undefined})); }}
                error={errors.name}
                placeholder="Enter full name"
                maxLength={100}
                required
              />
              <Input
                label="Phone Number"
                value={formData.phone}
                onChange={e => handlePhoneChange(e.target.value)}
                error={errors.phone}
                placeholder="10 digits only"
                maxLength={10}
                inputMode="numeric"
                pattern="\d{10}"
                required
              />
              
              <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-700">
                <p className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-3">Commission / Service Charges (%)</p>
                <div className="grid grid-cols-2 gap-4">
                  <Input label="Visa" type="number" step="0.1" min={0} max={100} value={formData.commissionRates.visa} onChange={e => updateRate('visa', e.target.value)} error={errors.rate_visa} />
                  <Input label="Master" type="number" step="0.1" min={0} max={100} value={formData.commissionRates.master} onChange={e => updateRate('master', e.target.value)} error={errors.rate_master} />
                  <Input label="Amex" type="number" step="0.1" min={0} max={100} value={formData.commissionRates.amex} onChange={e => updateRate('amex', e.target.value)} error={errors.rate_amex} />
                  <Input label="Rupay" type="number" step="0.1" min={0} max={100} value={formData.commissionRates.rupay} onChange={e => updateRate('rupay', e.target.value)} error={errors.rate_rupay} />
                </div>
              </div>

              <Button type="submit" className="w-full">{editingId ? 'Save Changes' : 'Create Customer'}</Button>
            </form>
          </CardContent>
        </Card>
      )}

      {viewMode === 'list' ? (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-600">
                <tr>
                  <th className="p-4 text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Name</th>
                  <th className="p-4 text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Phone</th>
                  <th className="p-4 text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider text-center">Visa</th>
                  <th className="p-4 text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider text-center">Master</th>
                  <th className="p-4 text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider text-center">Amex</th>
                  <th className="p-4 text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider text-center">Rupay</th>
                  <th className="p-4 text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">ID</th>
                  <th className="p-4 text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider text-right w-28">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {filteredCustomers.map((c, idx) => (
                  <tr key={c.id} className={`hover:bg-indigo-50/30 dark:hover:bg-indigo-900/20 transition-colors ${idx % 2 === 1 ? 'bg-slate-50/30 dark:bg-slate-800/30' : ''}`}>
                    <td className="p-4 font-semibold text-slate-800 dark:text-slate-200">{c.name}</td>
                    <td className="p-4 text-slate-600 dark:text-slate-400 font-medium">{c.phone}</td>
                    <td className="p-4 text-center font-semibold">{c.commissionRates.visa}%</td>
                    <td className="p-4 text-center font-semibold">{c.commissionRates.master}%</td>
                    <td className="p-4 text-center font-semibold">{c.commissionRates.amex}%</td>
                    <td className="p-4 text-center font-semibold">{c.commissionRates.rupay}%</td>
                    <td className="p-4 text-slate-500 dark:text-slate-400 font-medium">{c.id}</td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleEdit(c)}
                          className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(c.id, c.name)}
                          className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCustomers.map(c => (
            <Card key={c.id}>
              <div className="p-4 flex items-start justify-between">
                <div>
                  <h4 className="font-bold text-slate-800 dark:text-slate-200">{c.name}</h4>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{c.phone}</p>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => handleEdit(c)}
                    className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                    title="Edit"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    onClick={() => handleDelete(c.id, c.name)}
                    className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border-y border-slate-100 dark:border-slate-700 grid grid-cols-4 gap-2 text-center text-xs">
                <div><div className="text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase">Visa</div><div className="font-bold dark:text-slate-200">{c.commissionRates.visa}%</div></div>
                <div><div className="text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase">Master</div><div className="font-bold dark:text-slate-200">{c.commissionRates.master}%</div></div>
                <div><div className="text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase">Amex</div><div className="font-bold dark:text-slate-200">{c.commissionRates.amex}%</div></div>
                <div><div className="text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase">Rupay</div><div className="font-bold dark:text-slate-200">{c.commissionRates.rupay}%</div></div>
              </div>
              <div className="px-4 py-2 text-xs text-slate-400 dark:text-slate-500">ID: {c.id}</div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

const WalletsView = () => {
  const { wallets, updateWallet, addWalletPG, updateWalletPG, getAccountBalance, formatCurrency } = useERP();
  const [viewMode, setViewMode] = useState<'list' | 'card'>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingPG, setEditingPG] = useState<{ walletId: string, pgName: string | null } | null>(null);
  const [search, setSearch] = useState('');
  const [editWalletName, setEditWalletName] = useState('');
  const [editWalletError, setEditWalletError] = useState('');
  const [pgForm, setPgForm] = useState({
    name: '', visa: '', master: '', amex: '', rupay: ''
  });
  const [pgErrors, setPgErrors] = useState<Record<string, string>>({});

  const openPGForm = (walletId: string, pg?: PGConfig) => {
    setEditingPG({ walletId, pgName: pg ? pg.name : null });
    setPgErrors({});
    if (pg) {
      setPgForm({
        name: pg.name,
        visa: pg.charges.visa.toString(),
        master: pg.charges.master.toString(),
        amex: pg.charges.amex.toString(),
        rupay: pg.charges.rupay.toString(),
      });
    } else {
      setPgForm({ name: '', visa: '', master: '', amex: '', rupay: '' });
    }
  };

  const handleEditWallet = (w: { id: string; name: string }) => {
    setEditingId(w.id);
    setEditWalletName(w.name);
    setEditWalletError('');
  };

  const handleWalletNameSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    const name = editWalletName.trim();
    if (!name) { setEditWalletError('Wallet name is required'); return; }
    if (name.length < 2) { setEditWalletError('Name must be at least 2 characters'); return; }
    setEditWalletError('');
    updateWallet(editingId, { name });
    setEditingId(null);
  };

  const handlePGSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPG) return;
    const err: Record<string, string> = {};
    if (!editingPG.pgName && !pgForm.name?.trim()) err.name = 'PG name is required';
    (['visa', 'master', 'amex', 'rupay'] as const).forEach(key => {
      const v = safeParseFloat(pgForm[key]);
      if (pgForm[key] !== '' && (isNaN(v) || v < 0 || v > 100)) err[key] = 'Must be 0–100%';
    });
    setPgErrors(err);
    if (Object.keys(err).length > 0) return;

    const config: PGConfig = {
      name: editingPG.pgName || pgForm.name.trim(),
      charges: {
        visa: safeParseFloat(pgForm.visa) || 0,
        master: safeParseFloat(pgForm.master) || 0,
        amex: safeParseFloat(pgForm.amex) || 0,
        rupay: safeParseFloat(pgForm.rupay) || 0,
      }
    };
    if (editingPG.pgName) {
      updateWalletPG(editingPG.walletId, editingPG.pgName, config);
    } else {
      addWalletPG(editingPG.walletId, config);
    }
    setEditingPG(null);
    setPgErrors({});
  };

  const filteredWallets = wallets.filter(w =>
    w.name.toLowerCase().includes(search.toLowerCase()) || w.ledgerAccountId.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <PageFilters
        sectionTitle="Filters"
        searchPlaceholder="Search by wallet name or ledger ID..."
        searchValue={search}
        onSearchChange={setSearch}
      />
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-600 dark:text-slate-400">View:</span>
          <div className="flex p-1 bg-slate-100 rounded-lg">
            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
                viewMode === 'list' ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              <List size={16} />
              List
            </button>
            <button
              onClick={() => setViewMode('card')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
                viewMode === 'card' ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              <LayoutGrid size={16} />
              Card
            </button>
          </div>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">Wallets are created in Master Admin. You can edit wallet details here.</p>
      </div>

      {editingPG && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-lg">
            <CardHeader 
              title={editingPG.pgName ? `Edit PG: ${editingPG.pgName}` : "Add New PG"} 
              action={<Button variant="outline" size="sm" onClick={() => setEditingPG(null)}><X size={16}/></Button>} 
            />
            <CardContent>
              <form onSubmit={handlePGSubmit} className="space-y-4">
                <Input label="PG Name" value={pgForm.name} onChange={e => { setPgForm({...pgForm, name: e.target.value}); setPgErrors(p => ({...p, name: ''})); }} disabled={!!editingPG.pgName} error={pgErrors.name} placeholder="e.g. Razorpay PG" />
                <div className="grid grid-cols-2 gap-4">
                  <Input label="Visa %" type="number" step="0.1" value={pgForm.visa} onChange={e => { setPgForm({...pgForm, visa: e.target.value}); setPgErrors(p => ({...p, visa: ''})); }} error={pgErrors.visa} placeholder="0" />
                  <Input label="Master %" type="number" step="0.1" value={pgForm.master} onChange={e => { setPgForm({...pgForm, master: e.target.value}); setPgErrors(p => ({...p, master: ''})); }} error={pgErrors.master} placeholder="0" />
                  <Input label="Amex %" type="number" step="0.1" value={pgForm.amex} onChange={e => { setPgForm({...pgForm, amex: e.target.value}); setPgErrors(p => ({...p, amex: ''})); }} error={pgErrors.amex} placeholder="0" />
                  <Input label="Rupay %" type="number" step="0.1" value={pgForm.rupay} onChange={e => { setPgForm({...pgForm, rupay: e.target.value}); setPgErrors(p => ({...p, rupay: ''})); }} error={pgErrors.rupay} placeholder="0" />
                </div>
                <Button type="submit" className="w-full">Save Configuration</Button>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {editingId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md">
            <CardHeader 
              title="Edit Wallet Name" 
              action={<Button variant="outline" size="sm" onClick={() => setEditingId(null)}><X size={16}/></Button>} 
            />
            <CardContent>
              <form onSubmit={handleWalletNameSave} className="space-y-4">
                <Input label="Wallet Name" value={editWalletName} onChange={e => { setEditWalletName(e.target.value); setEditWalletError(''); }} error={editWalletError} placeholder="Wallet name" />
                <Button type="submit" className="w-full">Save</Button>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {viewMode === 'list' ? (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-600">
                <tr>
                  <th className="p-4 text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Wallet</th>
                  <th className="p-4 text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Ledger</th>
                  <th className="p-4 text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider text-right">Balance</th>
                  <th className="p-4 text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Payment Gateways</th>
                  <th className="p-4 text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider text-right w-36">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredWallets.map((w, idx) => (
                  <tr key={w.id} className={`hover:bg-indigo-50/30 dark:hover:bg-indigo-900/20 transition-colors ${idx % 2 === 1 ? 'bg-slate-50/30 dark:bg-slate-800/30' : ''}`}>
                    <td className="p-4 font-semibold text-slate-800 dark:text-slate-200">{w.name}</td>
                    <td className="p-4 text-slate-600 dark:text-slate-400 font-medium">{w.ledgerAccountId}</td>
                    <td className="p-4 text-right font-mono font-semibold text-indigo-600">{formatCurrency(getAccountBalance(w.ledgerAccountId))}</td>
                    <td className="p-4">
                      <div className="flex flex-wrap gap-2 items-center">
                        {w.pgs.map(pg => (
                          <span key={pg.name} className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 rounded text-xs font-medium group">
                            {pg.name}
                            <button onClick={() => openPGForm(w.id, pg)} className="p-0.5 text-indigo-600 hover:bg-indigo-100 rounded opacity-70 group-hover:opacity-100" title="Edit PG"><Edit2 size={12}/></button>
                          </span>
                        ))}
                        <button onClick={() => openPGForm(w.id)} className="text-indigo-600 hover:underline text-xs font-semibold">+ Add PG</button>
                      </div>
                    </td>
                    <td className="p-4 text-right">
                      <button onClick={() => handleEditWallet(w)} className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Edit"><Edit2 size={16} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredWallets.map(w => (
            <Card key={w.id} className="h-full">
              <CardHeader 
                title={w.name} 
                subtitle={`Ledger: ${w.ledgerAccountId}`} 
                action={
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="outline" onClick={() => openPGForm(w.id)}><Plus size={14}/> Add PG</Button>
                    <button onClick={() => handleEditWallet(w)} className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Edit"><Edit2 size={14}/></button>
                  </div>
                }
              />
              <CardContent className="space-y-4">
                {w.pgs.map(pg => (
                  <div key={pg.name} className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-100 dark:border-slate-700">
                    <div className="flex justify-between items-center mb-2">
                      <p className="font-bold text-slate-700 dark:text-slate-300">{pg.name}</p>
                      <button onClick={() => openPGForm(w.id, pg)} className="text-indigo-600 hover:text-indigo-800 p-1 rounded-lg hover:bg-indigo-50 transition-colors"><Edit2 size={14}/></button>
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-center text-xs">
                      <div className="bg-white dark:bg-slate-800 p-2 rounded-lg border border-slate-100 dark:border-slate-600"><div className="text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase">Visa</div><span className="font-bold dark:text-slate-200">{pg.charges.visa}%</span></div>
                      <div className="bg-white dark:bg-slate-800 p-2 rounded-lg border border-slate-100 dark:border-slate-600"><div className="text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase">Master</div><span className="font-bold dark:text-slate-200">{pg.charges.master}%</span></div>
                      <div className="bg-white dark:bg-slate-800 p-2 rounded-lg border border-slate-100 dark:border-slate-600"><div className="text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase">Amex</div><span className="font-bold dark:text-slate-200">{pg.charges.amex}%</span></div>
                      <div className="bg-white dark:bg-slate-800 p-2 rounded-lg border border-slate-100 dark:border-slate-600"><div className="text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase">Rupay</div><span className="font-bold dark:text-slate-200">{pg.charges.rupay}%</span></div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
