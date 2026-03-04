import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Layout } from '../components/Layout';
import { Card, CardHeader, CardContent } from '../components/ui/Elements';
import { DateRangePicker, type DateRange } from '../components/ui/PageFilters';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Target, TrendingUp, Award, DollarSign, Activity, BarChart3 } from 'lucide-react';
import { api, USE_API } from '../lib/api';
import type { StaffAnalytics as StaffAnalyticsType } from '../types';

const defaultDateRange = (): DateRange => {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    from: from.toISOString().slice(0, 10),
    to: now.toISOString().slice(0, 10),
    preset: 'thisMonth',
  };
};

export const StaffAnalytics: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'product_admin';
  const [dateRange, setDateRange] = useState<DateRange>(defaultDateRange);
  const [analytics, setAnalytics] = useState<StaffAnalyticsType[]>([]);
  const [prevAnalytics, setPrevAnalytics] = useState<StaffAnalyticsType[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!USE_API || !user?.productId) {
      setLoading(false);
      setError(!USE_API ? 'Enable API mode to view staff analytics.' : null);
      return;
    }
    setLoading(true);
    setPrevAnalytics(null);
    const opts: { month?: string; dateFrom?: string; dateTo?: string; staffId?: string } = {};
    if (dateRange.preset === 'allTime' || (!dateRange.from && !dateRange.to)) {
      opts.dateFrom = '2000-01-01';
      opts.dateTo = '2099-12-31';
    } else if (dateRange.from && dateRange.to) {
      opts.dateFrom = dateRange.from;
      opts.dateTo = dateRange.to;
    } else {
      const m = new Date().toISOString().slice(0, 7);
      opts.month = m;
    }
    if (!isAdmin && user?.id) opts.staffId = user.id;
    api.getStaffAnalytics(opts)
      .then((data) => {
        setAnalytics(data);
        if (!isAdmin && user?.id && dateRange.from && dateRange.to && dateRange.preset !== 'allTime') {
          const from = new Date(dateRange.from);
          const to = new Date(dateRange.to);
          const days = Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1;
          const prevTo = new Date(from);
          prevTo.setDate(prevTo.getDate() - 1);
          const prevFrom = new Date(prevTo);
          prevFrom.setDate(prevFrom.getDate() - days + 1);
          api.getStaffAnalytics({
            dateFrom: prevFrom.toISOString().slice(0, 10),
            dateTo: prevTo.toISOString().slice(0, 10),
            staffId: user.id,
          }).then(setPrevAnalytics).catch(() => setPrevAnalytics([]));
        }
      })
      .catch((e: Error) => setError(e?.message || 'Failed to load analytics'))
      .finally(() => setLoading(false));
  }, [dateRange, user?.id, user?.productId, isAdmin]);

  const myData = analytics.find(a => a.staffId === user?.id);
  const chartData = analytics.map(a => ({
    name: a.staffName,
    achieved: a.achieved,
    target: a.target,
    percentage: a.percentage,
    fill: a.percentage >= 100 ? '#10b981' : a.percentage >= 50 ? '#f59e0b' : '#ef4444',
  }));

  if (loading) {
    return (
      <Layout title={isAdmin ? 'Staff Analytics' : 'My Analytics'}>
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin w-10 h-10 border-2 border-indigo-500 border-t-transparent rounded-full" />
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout title={isAdmin ? 'Staff Analytics' : 'My Analytics'}>
        <Card>
          <CardContent>
            <p className="text-rose-600 font-semibold">{error}</p>
          </CardContent>
        </Card>
      </Layout>
    );
  }

  return (
    <Layout title={isAdmin ? 'Staff Analytics' : 'My Analytics'}>
      <div className="space-y-6">
        {/* Date range filter */}
        <div className="flex items-center justify-between">
          <DateRangePicker value={dateRange} onChange={setDateRange} />
        </div>

        {/* Staff view: personal progress */}
        {!isAdmin && myData && (
          <div className="space-y-6">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Track your performance against the revenue target set by your store admin. Achieved amount comes from Swipe & Pay and Pay & Swipe transactions you completed in the selected period.
            </p>

            {/* Progress bar */}
            {myData.target > 0 && (
              <Card>
                <CardContent className="pt-6">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-bold text-slate-600 dark:text-slate-400">Target progress</span>
                    <span className="text-sm font-bold">{myData.percentage}%</span>
                  </div>
                  <div className="h-3 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        myData.percentage >= 100 ? 'bg-emerald-500' :
                        myData.percentage >= 50 ? 'bg-amber-500' : 'bg-rose-500'
                      }`}
                      style={{ width: `${Math.min(myData.percentage, 100)}%` }}
                    />
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
              <div className="bg-gradient-to-br from-indigo-50 to-violet-50 dark:from-indigo-900/20 dark:to-violet-900/20 p-6 rounded-2xl border-2 border-indigo-100 dark:border-indigo-800">
                <div className="flex items-center gap-3 mb-2">
                  <Target className="w-6 h-6 text-indigo-600" />
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase">Target</span>
                </div>
                <p className="text-xl font-black text-slate-900 dark:text-white">
                  ₹{(myData.target || 0).toLocaleString('en-IN')}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Revenue goal for this period</p>
              </div>
              <div className="bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 p-6 rounded-2xl border-2 border-emerald-100 dark:border-emerald-800">
                <div className="flex items-center gap-3 mb-2">
                  <TrendingUp className="w-6 h-6 text-emerald-600" />
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase">Achieved</span>
                </div>
                <p className="text-xl font-black text-slate-900 dark:text-white">
                  ₹{myData.achieved.toLocaleString('en-IN')}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">From your transactions</p>
              </div>
              <div className={`p-6 rounded-2xl border-2 ${
                myData.percentage >= 100 ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200' :
                myData.percentage >= 50 ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200' :
                'bg-rose-50 dark:bg-rose-900/20 border-rose-200'
              }`}>
                <div className="flex items-center gap-3 mb-2">
                  <Award className="w-6 h-6 text-slate-600" />
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase">Progress</span>
                </div>
                <p className="text-xl font-black text-slate-900 dark:text-white">{myData.percentage}%</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {myData.target > 0 && myData.percentage < 100
                    ? `₹${(myData.target - myData.achieved).toLocaleString('en-IN')} to go`
                    : myData.percentage >= 100 ? 'Target met!' : 'No target set'}
                </p>
              </div>
              <div className="p-6 rounded-2xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                <div className="flex items-center gap-3 mb-2">
                  <Activity className="w-6 h-6 text-slate-600" />
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase">Transactions</span>
                </div>
                <p className="text-xl font-black text-slate-900 dark:text-white">{myData.transactionCount}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Card swipes in period</p>
              </div>
              <div className="p-6 rounded-2xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                <div className="flex items-center gap-3 mb-2">
                  <DollarSign className="w-6 h-6 text-slate-600" />
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase">Avg / Txn</span>
                </div>
                <p className="text-xl font-black text-slate-900 dark:text-white">
                  {myData.transactionCount > 0
                    ? `₹${Math.round(myData.achieved / myData.transactionCount).toLocaleString('en-IN')}`
                    : '—'}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Per transaction</p>
              </div>
              {prevAnalytics && prevAnalytics.length > 0 && (() => {
                const prev = prevAnalytics.find(a => a.staffId === user?.id);
                if (!prev || prev.achieved === 0) return null;
                const change = myData.achieved - prev.achieved;
                const pctChange = prev.achieved > 0 ? Math.round((change / prev.achieved) * 100) : (myData.achieved > 0 ? 100 : 0);
                return (
                  <div className="p-6 rounded-2xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                    <div className="flex items-center gap-3 mb-2">
                      <BarChart3 className="w-6 h-6 text-slate-600" />
                      <span className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase">Vs last period</span>
                    </div>
                    <p className={`text-xl font-black ${change >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {change >= 0 ? '+' : ''}{pctChange}%
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {change >= 0 ? 'Up' : 'Down'} ₹{Math.abs(change).toLocaleString('en-IN')}
                    </p>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* Admin view: all staff performance */}
        {isAdmin && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                <p className="text-xs font-bold text-slate-500 uppercase">Staff Count</p>
                <p className="text-xl font-black">{analytics.length}</p>
              </div>
              <div className="p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                <p className="text-xs font-bold text-slate-500 uppercase">Target Met</p>
                <p className="text-xl font-black text-emerald-600">{analytics.filter(a => a.percentage >= 100).length}</p>
              </div>
              <div className="p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                <p className="text-xs font-bold text-slate-500 uppercase">Total Target</p>
                <p className="text-xl font-black">₹{analytics.reduce((s, a) => s + a.target, 0).toLocaleString('en-IN')}</p>
              </div>
              <div className="p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                <p className="text-xs font-bold text-slate-500 uppercase">Total Achieved</p>
                <p className="text-xl font-black text-indigo-600">₹{analytics.reduce((s, a) => s + a.achieved, 0).toLocaleString('en-IN')}</p>
              </div>
            </div>

            {chartData.length > 0 ? (
              <Card>
                <CardHeader title="Staff Performance" subtitle={`Revenue generated by each staff in selected period`} />
                <CardContent>
                  <div
                    className="w-full overflow-x-auto min-w-0"
                    style={{ height: Math.min(400, Math.max(180, chartData.length * 32 + 60)), minHeight: 180 }}
                  >
                    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={100}>
                      <BarChart
                        data={chartData}
                        layout="vertical"
                        margin={{ top: 8, right: 24, left: 60, bottom: 8 }}
                        barSize={18}
                        barCategoryGap={6}
                      >
                        <CartesianGrid strokeDasharray="2 2" horizontal={false} strokeOpacity={0.5} />
                        <XAxis type="number" tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10 }} width={50} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={56} />
                        <Tooltip formatter={(v: number) => [`₹${v.toLocaleString('en-IN')}`, 'Achieved']} />
                        <Bar dataKey="achieved" name="Achieved" radius={[0, 2, 2, 0]}>
                          {chartData.map((_, i) => (
                            <Cell key={i} fill={chartData[i].fill} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            <Card>
              <CardHeader title="Staff Details" subtitle="Target vs achieved for each staff" />
              <CardContent>
                {analytics.length === 0 ? (
                  <p className="text-center py-8 text-slate-500">No staff activity or targets set for this period.</p>
                ) : (
                  <div className="space-y-3">
                    {analytics.map((a) => (
                      <div
                        key={a.staffId}
                        className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700"
                      >
                        <div>
                          <p className="font-bold text-slate-900 dark:text-white">{a.staffName}</p>
                          <p className="text-sm text-slate-500">{a.transactionCount} transactions</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold">₹{a.achieved.toLocaleString('en-IN')} / ₹{a.target.toLocaleString('en-IN')}</p>
                          <p className={`text-sm font-semibold ${a.percentage >= 100 ? 'text-emerald-600' : a.percentage >= 50 ? 'text-amber-600' : 'text-rose-600'}`}>
                            {a.percentage}% of target
                          </p>
                        </div>
                        <div className={`w-3 h-3 rounded-full ${a.percentage >= 100 ? 'bg-emerald-500' : a.percentage >= 50 ? 'bg-amber-500' : 'bg-rose-500'}`} />
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {/* Staff view: no data */}
        {!isAdmin && !myData && analytics.length === 0 && (
          <Card>
            <CardContent>
              <p className="text-center py-8 text-slate-500">No target set or transactions for this period. Ask your store admin to set your monthly target.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
};
