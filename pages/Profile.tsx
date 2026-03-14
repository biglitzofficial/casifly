import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useERP } from '../context/ERPContext';
import { USE_API } from '../lib/api';
import { useConfirm } from '../context/ConfirmContext';
import { Layout } from '../components/Layout';
import { Card, CardHeader, CardContent, Input, Button } from '../components/ui/Elements';
import { Save, Trash2, AlertTriangle } from 'lucide-react';

export const Profile: React.FC = () => {
  const { user, getCurrentProductUser, updateCurrentUserProfile, products } = useAuth();
  const { clearAllData } = useERP();
  const { confirm } = useConfirm();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState(false);

  const pu = getCurrentProductUser();
  const storeName = user?.productId ? products.find((p) => p.id === user.productId)?.name : null;

  useEffect(() => {
    if (pu) {
      setName(pu.name);
      setEmail(pu.email);
    } else if (user) {
      setName(user.name);
      setEmail(user.email);
    }
  }, [pu, user]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setSuccess(false);

    if (password && password !== confirmPassword) {
      setErrors({ confirmPassword: 'Passwords do not match' });
      return;
    }
    if (password.trim() && password.trim().length < 6) {
      setErrors({ password: 'Password must be at least 6 characters' });
      return;
    }

    const data: { password?: string } = {};
    if (password.trim()) data.password = password.trim();

    const result = updateCurrentUserProfile(data);
    if (result.success) {
      setSuccess(true);
      setPassword('');
      setConfirmPassword('');
      setTimeout(() => setSuccess(false), 3000);
    } else {
      setErrors({ form: result.error || 'Update failed' });
    }
  };

  if (!user) return null;

  const isMasterAdmin = user.role === 'master_admin';

  return (
    <Layout title="Profile">
      <div className="max-w-2xl">
        <Card>
          <CardHeader
            title="Profile"
            subtitle={storeName ? `${user.name} • ${storeName}` : user.name}
          />
          <CardContent>
            {isMasterAdmin ? (
              <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200">
                <p className="text-slate-600 font-semibold">Master Admin</p>
                <p className="text-sm text-slate-500 mt-1">Profile editing is not available for the master admin account.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                <Input
                  label="Full Name"
                  value={name}
                  disabled
                  placeholder="Your name"
                />
                <Input
                  label="Email"
                  type="email"
                  value={email}
                  disabled
                  placeholder="your@email.com"
                />
                <p className="text-xs text-slate-500">Name and email are set by Master Admin and cannot be changed. You can only update your password.</p>
                <div className="pt-4 border-t border-slate-200">
                  <p className="text-sm font-bold text-slate-700 mb-3">Change Password</p>
                  <p className="text-xs text-slate-500 mb-4">Leave blank to keep your current password.</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input
                      label="New Password"
                      type="password"
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); setErrors((p) => ({ ...p, password: '', confirmPassword: '' })); }}
                      error={errors.password}
                      placeholder="••••••••"
                    />
                    <Input
                      label="Confirm Password"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => { setConfirmPassword(e.target.value); setErrors((p) => ({ ...p, confirmPassword: '' })); }}
                      error={errors.confirmPassword}
                      placeholder="••••••••"
                    />
                  </div>
                </div>
                {errors.form && <p className="text-sm font-bold text-rose-600">{errors.form}</p>}
                {success && <p className="text-sm font-bold text-emerald-600">Profile updated successfully!</p>}
                <Button type="submit">
                  <Save size={18} />
                  Save Changes
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        {/* Development: Delete All Data - Master Admin only when using API; all users when localStorage */}
        {(!USE_API || isMasterAdmin) && (
        <Card className="mt-8 border-rose-200">
          <CardHeader
            title="Development"
            subtitle="Reset all ERP data to initial state (for development only)"
          />
          <CardContent>
            <div className="p-6 bg-rose-50/50 rounded-2xl border border-rose-200 space-y-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-rose-800">Delete All Data</p>
                  <p className="text-xs text-rose-700 mt-1">This will permanently delete all transactions, customers, and reset accounts/wallets to initial state. Use only for development.</p>
                </div>
              </div>
              <Button
                variant="outline"
                className="border-rose-300 text-rose-700 hover:bg-rose-100"
                onClick={async () => {
                  const ok = await confirm({
                    title: 'Delete All Data?',
                    message: 'This will permanently clear all ERP data and reset to initial state. This cannot be undone.',
                    confirmText: 'Delete All',
                    variant: 'danger',
                  });
                  if (ok) await clearAllData();
                }}
              >
                <Trash2 size={18} />
                Delete All Data
              </Button>
            </div>
          </CardContent>
        </Card>
        )}
      </div>
    </Layout>
  );
};
