import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { ArrowRight, ArrowLeft, TrendingUp, CreditCard, BarChart3 } from 'lucide-react';

interface DistributorLoginProps {
  onBackToHome?: () => void;
}

export const DistributorLogin: React.FC<DistributorLoginProps> = ({ onBackToHome }) => {
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
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(245,158,11,0.2),transparent)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_80%_50%,rgba(249,115,22,0.15),transparent)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_40%_40%_at_20%_80%,rgba(234,88,12,0.12),transparent)]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_0%,rgba(15,23,42,0.4)_100%)]" />
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                             linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
            backgroundSize: '60px 60px',
          }}
        />
        <div className="absolute -top-32 -right-32 w-96 h-96 bg-amber-500/25 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute top-1/2 -left-40 w-80 h-80 bg-orange-500/20 rounded-full blur-[100px]" />
        <div className="absolute bottom-0 right-1/3 w-64 h-64 bg-amber-600/15 rounded-full blur-[80px]" />
      </div>

      <div className="relative flex flex-col lg:flex-row w-full min-h-screen">
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
              <div className="relative overflow-hidden rounded-3xl bg-white/[0.03] backdrop-blur-2xl border border-white/10 shadow-2xl shadow-black/20">
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-400/50 to-transparent" />

                <div className="p-8 md:p-10">
                  <div className="flex items-center gap-4 mb-8">
                    <img src="/logo.png" alt="CASIFLY" className="h-14 w-auto object-contain" />
                    <div>
                      <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
                        Distributor Login
                      </h1>
                      <p className="text-slate-400 text-sm mt-0.5 font-medium">
                        Sign in to your distributor account
                      </p>
                    </div>
                  </div>

                  <div className="mb-6 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20">
                    <p className="text-xs font-bold text-amber-300 uppercase tracking-wider mb-1.5">
                      Distributor login
                    </p>
                    <p className="text-sm text-slate-300 leading-relaxed">
                      Access your distributor dashboard. Manage retailers, track sales, and view commissions.
                    </p>
                  </div>

                  <form onSubmit={handleSubmit} className="space-y-5">
                    <div>
                      <label className="block text-sm font-semibold text-slate-300 mb-2">Email</label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="distributor@example.com"
                        required
                        autoComplete="email"
                        className="w-full px-4 py-3.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-slate-500 font-medium outline-none transition-all focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 focus:bg-white/[0.07]"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-300 mb-2">Password</label>
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        required
                        autoComplete="current-password"
                        className="w-full px-4 py-3.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-slate-500 font-medium outline-none transition-all focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 focus:bg-white/[0.07]"
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
                      className="w-full h-12 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 hover:from-amber-400 hover:via-orange-400 hover:to-amber-500 text-white font-bold flex items-center justify-center gap-2 shadow-lg shadow-amber-500/25 transition-all duration-300 hover:shadow-amber-500/40 disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                      {loading ? (
                        <span className="flex items-center gap-2">
                          <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Signing in...
                        </span>
                      ) : (
                        <>
                          Sign In
                          <ArrowRight size={18} />
                        </>
                      )}
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="hidden lg:flex lg:w-[45%] xl:w-[50%] relative items-center justify-center p-8 xl:p-12 overflow-hidden">
          <div className="relative w-full max-w-md">
            <div className="relative">
              <div className="aspect-[4/3] bg-slate-800/90 rounded-2xl p-2 shadow-2xl border border-slate-700/80 backdrop-blur-sm">
                <div className="h-full bg-slate-900/95 rounded-xl overflow-hidden">
                  <div className="h-10 bg-gradient-to-r from-amber-500 to-orange-600 flex items-center justify-center gap-2 px-2">
                    <img src="/logo.png" alt="CASIFLY" className="h-6 w-auto object-contain" />
                    <span className="font-bold text-white text-sm tracking-wider">DISTRIBUTOR</span>
                  </div>
                  <div className="p-3 grid grid-cols-2 gap-2">
                    <div className="bg-slate-800/80 rounded-lg p-2">
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Retailers</p>
                      <p className="text-lg font-bold text-white">24</p>
                    </div>
                    <div className="bg-slate-800/80 rounded-lg p-2 flex flex-col">
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Commission</p>
                      <div className="h-4 flex gap-0.5 items-end mt-1">
                        {[4, 6, 5, 8, 7, 10, 9].map((h, i) => (
                          <div key={i} className="w-1.5 bg-amber-500 rounded-t" style={{ height: `${h * 3}px` }} />
                        ))}
                      </div>
                    </div>
                    <div className="col-span-2 bg-slate-800/80 rounded-lg p-2">
                      <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Recent</p>
                      {[
                        { name: 'Store A', amt: '₹2.1k' },
                        { name: 'Store B', amt: '₹1.5k' },
                      ].map((t, i) => (
                        <div key={i} className="flex justify-between text-xs text-slate-300 py-0.5">
                          <span>{t.name}</span><span className="text-white font-semibold">{t.amt}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <div className="absolute -bottom-4 -right-4 w-28 h-[4.5rem] bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl shadow-xl border border-white/20 flex items-end p-2 transform rotate-6">
                <span className="text-white/80 text-[10px] font-mono">Retailers</span>
              </div>
            </div>

            <div className="mt-8 flex flex-wrap gap-4 justify-center">
              {[
                { icon: CreditCard, label: 'Pay & Swipe' },
                { icon: BarChart3, label: 'Reports' },
                { icon: TrendingUp, label: 'Commissions' },
              ].map(({ icon: Icon, label }) => (
                <div
                  key={label}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm"
                >
                  <Icon className="w-4 h-4 text-amber-400" />
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
