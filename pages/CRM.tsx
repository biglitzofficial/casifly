import React, { useState, useMemo } from 'react';
import { useERP } from '../context/ERPContext';
import { useToast } from '../context/ToastContext';
import { Layout } from '../components/Layout';
import { Card, CardHeader, CardContent, Input, Button } from '../components/ui/Elements';
import { PageFilters } from '../components/ui/PageFilters';
import { UserCheck, Clock, Send, Phone, AlertCircle } from 'lucide-react';

export const CRM: React.FC = () => {
  const { customers, transactions, formatCurrency } = useERP();
  const toast = useToast();
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [search, setSearch] = useState('');

  const customerMetrics = useMemo(() => {
    const now = new Date();
    return customers.map(c => {
      const cTxns = transactions.filter(t => t.metadata?.customerId === c.id);
      const totalVolume = cTxns.reduce((sum, t) => {
         const swipeCredit = t.entries.find(e => e.accountId === 'L001' && e.credit > 0);
         return sum + (swipeCredit?.credit || 0);
      }, 0);

      const sortedTxns = [...cTxns].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      const lastActiveDate = sortedTxns.length > 0 ? new Date(sortedTxns[0].date) : null;
      const daysInactive = lastActiveDate 
        ? Math.floor((now.getTime() - lastActiveDate.getTime()) / (1000 * 3600 * 24))
        : 999; 

      return {
        ...c,
        totalVolume,
        txnCount: cTxns.length,
        lastActive: lastActiveDate,
        daysInactive,
        status: daysInactive > 90 ? 'inactive' : 'active'
      };
    });
  }, [customers, transactions]);

  const filteredCustomers = customerMetrics.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search);
    const matchesFilter = filter === 'all' || c.status === filter;
    return matchesSearch && matchesFilter;
  });

  const sendReminder = (name: string, phone: string) => {
    toast.info(`Reminder nudge triggered for ${name} (${phone}). (Simulated SMS/WhatsApp)`);
  };

  return (
    <Layout title="CRM & Activity Monitoring">
      <PageFilters
        sectionTitle="Filters"
        searchPlaceholder="Search by name or 10-digit phone..."
        searchValue={search}
        onSearchChange={setSearch}
        categoryOptions={[
          { value: 'all', label: `All (${customerMetrics.length})` },
          { value: 'active', label: `Active (${customerMetrics.filter(c => c.status === 'active').length})` },
          { value: 'inactive', label: `Inactive 90d+ (${customerMetrics.filter(c => c.status === 'inactive').length})` },
        ]}
        categoryValue={filter}
        onCategoryChange={(v) => setFilter(v as 'all' | 'active' | 'inactive')}
        categoryLabel="Status"
      />

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200">
               <tr>
                 <th className="p-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Customer Details</th>
                 <th className="p-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Loyalty Status</th>
                 <th className="p-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Last Active</th>
                 <th className="p-4 text-xs font-bold text-slate-600 uppercase tracking-wider text-right">Lifetime Volume</th>
                 <th className="p-4 text-xs font-bold text-slate-600 uppercase tracking-wider text-center">Actions</th>
               </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
               {filteredCustomers.map(c => (
                 <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                   <td className="p-4">
                     <div className="font-bold text-slate-800">{c.name}</div>
                     <div className="text-xs text-gray-500 flex items-center gap-1"><Phone size={10}/> {c.phone}</div>
                   </td>
                   <td className="p-4">
                     {c.status === 'active' ? (
                       <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">
                         <UserCheck size={12}/> ACTIVE
                       </span>
                     ) : (
                       <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-100 text-rose-700 border border-rose-200">
                         <AlertCircle size={12}/> INACTIVE ({c.daysInactive}D)
                       </span>
                     )}
                   </td>
                   <td className="p-4">
                     {c.lastActive ? (
                       <div className="flex items-center gap-2 text-slate-600">
                         <Clock size={14} className="text-gray-400"/>
                         {c.lastActive.toLocaleDateString()}
                       </div>
                     ) : (
                       <span className="text-gray-400 italic">No Activity Recorded</span>
                     )}
                   </td>
                   <td className="p-4 text-right font-black text-slate-700">
                     {formatCurrency(c.totalVolume)}
                   </td>
                   <td className="p-4">
                     <div className="flex justify-center gap-2">
                       <Button size="sm" variant="outline" className="h-9 px-3 border-indigo-200 text-indigo-700 hover:border-indigo-400 hover:text-indigo-800 hover:bg-indigo-50/70" onClick={() => sendReminder(c.name, c.phone)}>
                         <Send size={14} /> Nudge
                       </Button>
                     </div>
                   </td>
                 </tr>
               ))}
            </tbody>
          </table>
        </div>
      </Card>
    </Layout>
  );
};

