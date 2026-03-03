import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { ArrowRight, Store, ArrowLeft, Sparkles, TrendingUp, CreditCard, BarChart3 } from 'lucide-react';

interface StoreLoginProps {
  onBackToHome?: () => void;
}

export const StoreLogin: React.FC<StoreLoginProps> = ({ onBackToHome }) => {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await login(email, password);
    setLoading(false);
    if (result.success) return;
    setError(result.error || 'Login failed');
  };

  return (
    <div className="min-h-screen flex overflow-hidden bg-slate-950">
      {/* Animated gradient mesh background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(99,102,241,0.25),transparent)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_80%_50%,rgba(139,92,246,0.15),transparent)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_40%_40%_at_20%_80%,rgba(59,130,246,0.12),transparent)]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_0%,rgba(15,23,42,0.4)_100%)]" />
        {/* Subtle grid */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                             linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
            backgroundSize: '60px 60px',
          }}
        />
        {/* Floating orbs */}
        <div className="absolute -top-32 -right-32 w-96 h-96 bg-indigo-500/30 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute top-1/2 -left-40 w-80 h-80 bg-violet-500/20 rounded-full blur-[100px]" />
        <div className="absolute bottom-0 right-1/3 w-64 h-64 bg-indigo-600/15 rounded-full blur-[80px]" />
      </div>

      {/* Split layout: form + decorative panel */}
      <div className="relative flex flex-col lg:flex-row w-full min-h-screen">
        {/* Left: Form */}
        <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
          <div className="w-full max-w-md">
            {onBackToHome && (
              <button
                onClick={onBackToHome}
                className="mb-8 flex items-center gap-2 text-slate-400 hover:text-white text-sm font-medium transition-colors group"
              >
                <ArrowLeft size={18} className="group-hover:-translate-x-0.5 transition-transform" />
                Back to Home
              </button>
            )}

            <div className="animate-slide-up">
              {/* Card */}
              <div className="relative overflow-hidden rounded-3xl bg-white/[0.03] backdrop-blur-2xl border border-white/10 shadow-2xl shadow-black/20">
                {/* Subtle top glow */}
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-indigo-400/50 to-transparent" />

                <div className="p-8 md:p-10">
                  {/* Header */}
                  <div className="flex items-center gap-4 mb-8">
                    <div className="relative">
                      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/25">
                        <Store className="w-8 h-8 text-white" />
                      </div>
                      <div className="absolute -top-1 -right-1 w-5 h-5 rounded-lg bg-indigo-400/20 flex items-center justify-center">
                        <Sparkles className="w-3 h-3 text-indigo-300" />
                      </div>
                    </div>
                    <div>
                      <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
                        Store Login
                      </h1>
                      <p className="text-slate-400 text-sm mt-0.5 font-medium">
                        Sign in to your store account
                      </p>
                    </div>
                  </div>

                  {/* Info block - refined */}
                  <div className="mb-6 p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/20">
                    <p className="text-xs font-bold text-indigo-300 uppercase tracking-wider mb-1.5">
                      Store login
                    </p>
                    <p className="text-sm text-slate-300 leading-relaxed">
                      Use the credentials provided by your store administrator to access Swipe & Pay, Ledgers, Reports, and more.
                    </p>
                  </div>

                  {/* Form */}
                  <form onSubmit={handleSubmit} className="space-y-5">
                    <div>
                      <label className="block text-sm font-semibold text-slate-300 mb-2">
                        Email
                      </label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="store@example.com"
                        required
                        autoComplete="email"
                        className="w-full px-4 py-3.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-slate-500 font-medium outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:bg-white/[0.07]"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-300 mb-2">
                        Password
                      </label>
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        required
                        autoComplete="current-password"
                        className="w-full px-4 py-3.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-slate-500 font-medium outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:bg-white/[0.07]"
                      />
                    </div>
                    {error && (
                      <p className="text-sm font-semibold text-rose-400 bg-rose-500/10 px-3 py-2 rounded-lg">
                        {error}
                      </p>
                    )}
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full h-12 rounded-xl bg-gradient-to-r from-indigo-500 via-violet-500 to-indigo-600 hover:from-indigo-400 hover:via-violet-400 hover:to-indigo-500 text-white font-bold flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/25 transition-all duration-300 hover:shadow-indigo-500/40 disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                      {loading ? (
                        <span className="flex items-center gap-2">
                          <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Signing in...
                        </span>
                      ) : (
                        <>
                          Sign In
                          <ArrowRight size={18} className="group-hover:translate-x-0.5" />
                        </>
                      )}
                    </button>
                  </form>

                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Dashboard preview & feature highlights - hidden on mobile */}
        <div className="hidden lg:flex lg:w-[45%] xl:w-[50%] relative items-center justify-center p-8 xl:p-12 overflow-hidden">
          <div className="relative w-full max-w-md">
            {/* Laptop/Dashboard mockup */}
            <div className="relative">
              <div className="aspect-[4/3] bg-slate-800/90 rounded-2xl p-2 shadow-2xl border border-slate-700/80 backdrop-blur-sm">
                <div className="h-full bg-slate-900/95 rounded-xl overflow-hidden">
                  <div className="h-10 bg-gradient-to-r from-indigo-500 to-violet-600 flex items-center justify-center">
                    <span className="font-bold text-white text-sm tracking-wider">STORE DASHBOARD</span>
                  </div>
                  <div className="p-3 grid grid-cols-2 gap-2">
                    <div className="bg-slate-800/80 rounded-lg p-2">
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Balance</p>
                      <p className="text-lg font-bold text-white">₹24,560</p>
                    </div>
                    <div className="bg-slate-800/80 rounded-lg p-2 flex flex-col">
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Revenue</p>
                      <div className="h-4 flex gap-0.5 items-end mt-1">
                        {[3, 5, 4, 7, 6, 9, 8].map((h, i) => (
                          <div key={i} className="w-1.5 bg-indigo-500 rounded-t" style={{ height: `${h * 3}px` }} />
                        ))}
                      </div>
                    </div>
                    <div className="col-span-2 bg-slate-800/80 rounded-lg p-2">
                      <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Recent</p>
                      {['Reliance ₹1.2k', 'Flipkart ₹800'].map((t, i) => (
                        <div key={i} className="flex justify-between text-xs text-slate-300 py-0.5">
                          <span>{t.split(' ')[0]}</span><span className="text-white font-semibold">{t.split(' ')[1]}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              {/* Floating credit card */}
              <div className="absolute -bottom-4 -right-4 w-28 h-[4.5rem] bg-gradient-to-br from-indigo-500 to-violet-600 rounded-xl shadow-xl border border-white/20 flex items-end p-2 transform rotate-6">
                <span className="text-white/80 text-[10px] font-mono">•••• •••• 4242</span>
              </div>
            </div>

            {/* Feature highlights */}
            <div className="mt-8 flex flex-wrap gap-4 justify-center">
              {[
                { icon: CreditCard, label: 'Swipe & Pay' },
                { icon: BarChart3, label: 'Reports' },
                { icon: TrendingUp, label: 'Analytics' },
              ].map(({ icon: Icon, label }) => (
                <div
                  key={label}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm"
                >
                  <Icon className="w-4 h-4 text-indigo-400" />
                  <span className="text-sm font-semibold text-slate-300">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
