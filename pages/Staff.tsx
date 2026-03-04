import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Layout } from '../components/Layout';
import { Card, CardHeader, CardContent, Input, Button } from '../components/ui/Elements';
import { Plus, UserPlus, Trash2, X, Target } from 'lucide-react';
import { useConfirm } from '../context/ConfirmContext';
import { api, USE_API } from '../lib/api';

export const Staff: React.FC = () => {
  const { addStaff, getStaffForCurrentStore, updateStaffStatus, removeStaff, products, user } = useAuth();
  const { confirm } = useConfirm();
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [targetModal, setTargetModal] = useState<{ staffId: string; staffName: string } | null>(null);
  const [targetMonth, setTargetMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [targetAmount, setTargetAmount] = useState('');
  const [targetSaving, setTargetSaving] = useState(false);

  const staff = getStaffForCurrentStore();
  const storeName = products.find((p) => p.id === user?.productId)?.name;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    if (!email.trim()) { setErrors({ email: 'Email is required' }); return; }
    if (!password.trim()) { setErrors({ password: 'Password is required' }); return; }
    if (password.length < 6) { setErrors({ password: 'Password must be at least 6 characters' }); return; }
    if (!name.trim()) { setErrors({ name: 'Name is required' }); return; }

    const result = await addStaff(email.trim(), password.trim(), name.trim());
    if (result.success) {
      setEmail('');
      setPassword('');
      setName('');
      setShowForm(false);
    } else {
      setErrors({ form: result.error || 'Failed to add staff' });
    }
  };

  const handleRemove = async (id: string, staffName: string) => {
    const ok = await confirm({
      title: 'Remove Staff',
      message: `Remove staff "${staffName}"? They will no longer be able to log in.`,
      confirmText: 'Remove',
      variant: 'danger',
    });
    if (ok) removeStaff(id);
  };

  const handleSetTarget = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetModal || !USE_API) return;
    const amount = parseFloat(targetAmount.replace(/,/g, ''));
    if (isNaN(amount) || amount < 0) return;
    setTargetSaving(true);
    try {
      await api.setStaffTarget(targetModal.staffId, targetMonth, amount);
      setTargetModal(null);
      setTargetAmount('');
    } catch (err: any) {
      setErrors({ form: err?.message || 'Failed to set target' });
    } finally {
      setTargetSaving(false);
    }
  };

  return (
    <Layout title="Staff Management">
      <div className="max-w-2xl">
        <Card>
          <CardHeader
            title="Staff"
            subtitle={`Create staff logins for ${storeName || 'your store'}. Staff can access Swipe & Pay, Ledgers, Reports, etc.`}
            action={
              <Button size="sm" onClick={() => setShowForm(true)}>
                <Plus size={16} />
                Add Staff
              </Button>
            }
          />
          <CardContent>
            {showForm && (
              <form onSubmit={handleSubmit} className="mb-6 p-6 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="font-bold text-slate-800 dark:text-slate-200">Create Staff Login</h3>
                  <button type="button" onClick={() => setShowForm(false)} className="p-2 text-slate-400 hover:text-slate-600">
                    <X size={20} />
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} placeholder="staff@store.com" required />
                  <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} placeholder="Full name" required />
                  <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} placeholder="Min 6 characters" required />
                </div>
                {errors.form && <p className="text-sm text-rose-600 font-bold">{errors.form}</p>}
                <div className="flex gap-3">
                  <Button type="submit">
                    <UserPlus size={16} />
                    Create Staff
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
                </div>
              </form>
            )}

            {staff.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <UserPlus className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p className="font-semibold">No staff yet</p>
                <p className="text-sm mt-1">Add staff so they can log in and use Swipe & Pay, Ledgers, Reports.</p>
                <Button className="mt-4" onClick={() => setShowForm(true)}>
                  <Plus size={16} />
                  Add First Staff
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {staff.map((u) => (
                  <div key={u.id} className="flex items-center justify-between p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-slate-100">{u.name}</p>
                      <p className="text-sm text-slate-500">{u.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {USE_API && (
                        <button
                          onClick={() => setTargetModal({ staffId: u.id, staffName: u.name })}
                          className="flex items-center gap-1.5 px-3 py-2 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg font-semibold text-sm"
                          title="Set monthly target"
                        >
                          <Target size={16} />
                          Set Target
                        </button>
                      )}
                      <select
                        className="text-xs px-2 py-1 rounded-lg border dark:bg-slate-800 dark:border-slate-600"
                        value={u.status}
                        onChange={(e) => updateStaffStatus(u.id, e.target.value as 'active' | 'inactive')}
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </select>
                      <button onClick={() => handleRemove(u.id, u.name)} className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg" title="Remove">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Set Target Modal */}
        {targetModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[9999] p-4" onClick={() => setTargetModal(null)}>
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 dark:border-slate-700" onClick={e => e.stopPropagation()}>
              <div className="p-6 border-b border-slate-200 dark:border-slate-700">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Target className="w-5 h-5 text-indigo-600" />
                  Set Monthly Target
                </h2>
                <p className="text-sm text-slate-500 mt-1">For {targetModal.staffName}</p>
              </div>
              <form onSubmit={handleSetTarget} className="p-6 space-y-4">
                <Input
                  label="Month"
                  type="month"
                  value={targetMonth}
                  onChange={e => setTargetMonth(e.target.value)}
                  required
                />
                <Input
                  label="Target (₹)"
                  type="number"
                  min={0}
                  step={1000}
                  value={targetAmount}
                  onChange={e => setTargetAmount(e.target.value)}
                  placeholder="e.g. 50000"
                  required
                />
                {errors.form && <p className="text-sm text-rose-600 font-bold">{errors.form}</p>}
                <div className="flex gap-3">
                  <Button type="submit" disabled={targetSaving}>{targetSaving ? 'Saving...' : 'Set Target'}</Button>
                  <Button type="button" variant="outline" onClick={() => setTargetModal(null)}>Cancel</Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};
