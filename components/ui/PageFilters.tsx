import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/utils';
import { Input } from './Elements';
import { Calendar, ChevronUp, ChevronDown, ChevronRight, Search } from 'lucide-react';

export type DatePreset = 'today' | 'yesterday' | 'last7' | 'thisMonth' | 'lastMonth' | 'allTime' | 'custom';

export interface DateRange {
  from: string;
  to: string;
  preset: DatePreset;
}

const getPresetRange = (preset: DatePreset): { fromStr: string; toStr: string } => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  switch (preset) {
    case 'today':
      return { fromStr: fmt(today), toStr: fmt(today) };
    case 'yesterday': {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      return { fromStr: fmt(y), toStr: fmt(y) };
    }
    case 'last7': {
      const from = new Date(today);
      from.setDate(from.getDate() - 6);
      return { fromStr: fmt(from), toStr: fmt(now) };
    }
    case 'thisMonth': {
      const from = new Date(today.getFullYear(), today.getMonth(), 1);
      return { fromStr: fmt(from), toStr: fmt(now) };
    }
    case 'lastMonth': {
      const from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const to = new Date(today.getFullYear(), today.getMonth(), 0);
      return { fromStr: fmt(from), toStr: fmt(to) };
    }
    case 'allTime':
      return { fromStr: '', toStr: '' };
    default:
      return { fromStr: fmt(today), toStr: fmt(now) };
  }
};

export const DateRangePicker: React.FC<{
  value: DateRange;
  onChange: (range: DateRange) => void;
  className?: string;
}> = ({ value, onChange, className }) => {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [customFrom, setCustomFrom] = useState(value.from || '');
  const [customTo, setCustomTo] = useState(value.to || '');
  const [preset, setPreset] = useState<DatePreset>(value.preset);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPreset(value.preset);
    setCustomFrom(value.from || '');
    setCustomTo(value.to || '');
  }, [value.preset, value.from, value.to]);

  useEffect(() => {
    if (open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPosition({ top: rect.bottom + 8, left: rect.left });
    }
  }, [open]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        open &&
        !triggerRef.current?.contains(target) &&
        !dropdownRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const getLabel = () => {
    if (preset === 'custom' && value.from && value.to) {
      return `${value.from} → ${value.to}`;
    }
    const labels: Record<DatePreset, string> = {
      today: 'Today',
      yesterday: 'Yesterday',
      last7: 'Last 7 Days',
      thisMonth: 'This Month',
      lastMonth: 'Last Month',
      allTime: 'All Time',
      custom: 'Custom Range',
    };
    return labels[preset];
  };

  const handlePresetClick = (p: DatePreset) => {
    if (p === 'custom') {
      setPreset('custom');
      return;
    }
    setPreset(p);
    const { fromStr, toStr } = getPresetRange(p);
    onChange({ from: fromStr, to: toStr, preset: p });
    setOpen(false);
  };

  const handleApplyCustom = () => {
    onChange({ from: customFrom, to: customTo, preset: 'custom' });
    setPreset('custom');
    setOpen(false);
  };

  return (
    <div className={cn('relative', className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          'flex items-center gap-2 px-4 py-2.5 rounded-2xl border-2 transition-all duration-200 font-semibold text-sm',
          'bg-white dark:bg-slate-800 shadow-sm hover:shadow-md outline-none dark:border-slate-600',
          open
            ? 'border-indigo-400 ring-2 ring-indigo-500/25'
            : 'border-slate-200 dark:border-slate-600 hover:border-indigo-300 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400'
        )}
      >
        <Calendar className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
        <span className="text-slate-700 dark:text-slate-300">{getLabel()}</span>
        {open ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
      </button>

      {open &&
        createPortal(
          <div
            ref={dropdownRef}
            className={cn(
              'fixed z-[99999] flex bg-white dark:bg-slate-800 rounded-2xl border-2 border-slate-200 dark:border-slate-600 shadow-2xl overflow-hidden animate-fade-in',
              preset === 'custom' ? 'min-w-[320px]' : 'min-w-[160px]'
            )}
            style={{ top: position.top, left: position.left }}
          >
            {/* Left: Presets */}
            <div className={cn(
              'w-40 p-2 bg-slate-50/50 dark:bg-slate-900/50',
              preset === 'custom' && 'border-r border-slate-100 dark:border-slate-600'
            )}>
              {(['today', 'yesterday', 'last7', 'thisMonth', 'lastMonth', 'allTime', 'custom'] as DatePreset[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => handlePresetClick(p)}
                  className={cn(
                    'w-full text-left px-3 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-between',
                    preset === p || (p === 'custom' && preset === 'custom')
                      ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/25'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                  )}
                >
                  {p === 'today' && 'Today'}
                  {p === 'yesterday' && 'Yesterday'}
                  {p === 'last7' && 'Last 7 Days'}
                  {p === 'thisMonth' && 'This Month'}
                  {p === 'lastMonth' && 'Last Month'}
                  {p === 'allTime' && 'All Time'}
                  {p === 'custom' && (
                    <>
                      <span>Custom Range</span>
                      <ChevronRight className="w-4 h-4 opacity-75" />
                    </>
                  )}
                </button>
              ))}
            </div>
            {/* Right: Custom date inputs - only visible when Custom Range is selected */}
            {preset === 'custom' && (
              <div className="p-4 flex flex-col gap-4 min-w-[200px]">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">FROM</label>
                  <input
                    type="date"
                    value={customFrom}
                    onChange={e => setCustomFrom(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 dark:text-slate-100 text-sm font-semibold focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">TO</label>
                  <input
                    type="date"
                    value={customTo}
                    onChange={e => setCustomTo(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 dark:text-slate-100 text-sm font-semibold focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleApplyCustom}
                  className="w-full py-2.5 rounded-xl bg-indigo-500 text-white font-bold text-sm hover:bg-indigo-600 transition-colors shadow-lg shadow-indigo-500/25"
                >
                  APPLY
                </button>
              </div>
            )}
          </div>,
          document.body
        )}
    </div>
  );
};

export const CategoryFilter: React.FC<{
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  label?: string;
  className?: string;
}> = ({ options, value, onChange, label = 'Category', className }) => {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPosition({ top: rect.bottom + 8, left: rect.left });
    }
  }, [open]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        open &&
        !triggerRef.current?.contains(target) &&
        !dropdownRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const selectedLabel = options.find(o => o.value === value)?.label || options[0]?.label || 'All';

  return (
    <div className={cn('relative', className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          'flex items-center gap-2 px-4 py-2.5 rounded-2xl border-2 transition-all duration-200 font-semibold text-sm',
          'bg-white dark:bg-slate-800 shadow-sm hover:shadow-md outline-none dark:border-slate-600',
          open
            ? 'border-indigo-400 ring-2 ring-indigo-500/25'
            : 'border-slate-200 dark:border-slate-600 hover:border-indigo-300 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400'
        )}
      >
        <span className="text-slate-500 dark:text-slate-400">{label}:</span>
        <span className="text-slate-700 dark:text-slate-300">{selectedLabel}</span>
        {open ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
      </button>

      {open &&
        createPortal(
          <div
            ref={dropdownRef}
            className="fixed z-[99999] bg-white dark:bg-slate-800 rounded-2xl border-2 border-slate-200 dark:border-slate-600 shadow-2xl py-2 min-w-[180px] animate-fade-in"
            style={{ top: position.top, left: position.left }}
          >
            {options.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={cn(
                'w-full text-left px-4 py-2.5 text-sm font-semibold transition-colors',
                value === opt.value ? 'bg-indigo-50 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>,
          document.body
        )}
    </div>
  );
};

export interface PageFiltersProps {
  sectionTitle?: string;
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  showDateRange?: boolean;
  dateRange?: DateRange;
  onDateRangeChange?: (range: DateRange) => void;
  categoryOptions?: { value: string; label: string }[];
  categoryValue?: string;
  onCategoryChange?: (value: string) => void;
  categoryLabel?: string;
  children?: React.ReactNode;
}

export const FilterSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="mb-6">
    <h2 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-3 px-1">{title}</h2>
    {children}
  </section>
);

export const PageFilters: React.FC<PageFiltersProps> = ({
  sectionTitle = 'Filters',
  searchPlaceholder,
  searchValue = '',
  onSearchChange,
  showDateRange = false,
  dateRange,
  onDateRangeChange,
  categoryOptions,
  categoryValue,
  onCategoryChange,
  categoryLabel = 'Category',
  children,
}) => {
  return (
    <FilterSection title={sectionTitle}>
    <div className="flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center bg-white/95 dark:bg-slate-800/95 backdrop-blur-md p-6 rounded-3xl border-2 border-slate-100/80 dark:border-slate-700/80 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.06)] dark:shadow-none">
      <div className="flex flex-1 flex-wrap gap-4 items-center">
        {searchPlaceholder && onSearchChange && (
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Input
              placeholder={searchPlaceholder}
              value={searchValue}
              onChange={e => onSearchChange(e.target.value)}
              className="pl-11 rounded-2xl"
            />
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={18} />
          </div>
        )}
        {showDateRange && dateRange && onDateRangeChange && (
          <DateRangePicker value={dateRange} onChange={onDateRangeChange} />
        )}
        {categoryOptions && categoryValue !== undefined && onCategoryChange && (
          <CategoryFilter
            options={categoryOptions}
            value={categoryValue}
            onChange={onCategoryChange}
            label={categoryLabel}
          />
        )}
      </div>
      {children}
    </div>
    </FilterSection>
  );
};
