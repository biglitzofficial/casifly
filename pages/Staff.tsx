import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Layout } from '../components/Layout';
import { Card, CardHeader, CardContent, Input, Button } from '../components/ui/Elements';
import { Plus, UserPlus, Trash2, X } from 'lucide-react';
import { useConfirm } from '../context/ConfirmContext';

export const Staff: React.FC = () => {
  const { addStaff, getStaffForCurrentStore, updateStaffStatus, removeStaff, products, user } = useAuth();
  const { confirm } = useConfirm();
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

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
      </div>
    </Layout>
  );
};
