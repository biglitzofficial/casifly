import React, { useState } from 'react';
import { Button, Input, Select } from '../components/ui/Elements';
import { Store, ChevronDown, CreditCard, Smartphone, ArrowLeftRight, Headphones, Laptop, Phone, Mail, MessageCircle, MapPin, Facebook, Instagram, Globe, Menu, X } from 'lucide-react';

const serviceOptions = [
  { value: 'cash-from-card', label: 'I Need Cash From Card' },
  { value: 'pay-swipe', label: 'Pay and Swipe' },
  { value: 'swipe-pay', label: 'Swipe and Pay' },
  { value: 'money-transfer', label: 'Money Transfer' },
];

const coreServices = [
  {
    icon: CreditCard,
    title: 'Pay and Swipe',
    description: 'Accept payments effortlessly with card swipe solutions. Offer your customers fast, reliable, and secure transactions through our integrated payment systems. Accessible anytime, anywhere, with instant confirmations for peace of mind.',
  },
  {
    icon: Smartphone,
    title: 'Swipe and Pay',
    description: 'Unlock seamless transactions with personalized retail and business solutions. Manage your operations efficiently with secure credentials linking you directly to multiple payment gateways and digital wallets.',
  },
  {
    icon: ArrowLeftRight,
    title: 'Money Transfer',
    description: 'Transfer funds effortlessly between accounts. CASIFLY ensures quick, compliant, and safe money transfers for both business and personal needs. Send and receive with confidence.',
  },
];

type LoginType = 'store' | 'distributor';

interface HomeProps {
  onNavigateToLogin?: (type: LoginType) => void;
}

export const Home: React.FC<HomeProps> = ({ onNavigateToLogin }) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [name, setName] = useState('');
  const [service, setService] = useState('cash-from-card');
  const [phone, setPhone] = useState('');
  const [formSubmitted, setFormSubmitted] = useState(false);

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
    setMobileNavOpen(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormSubmitted(true);
    setName('');
    setService('cash-from-card');
    setPhone('');
  };

  return (
    <div className="min-h-screen bg-white text-slate-900">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="CASIFLY" className="h-10 w-auto object-contain shrink-0" />
            <span className="text-xl font-black text-slate-900 tracking-tight">CASIFLY</span>
          </div>

          <button
            type="button"
            onClick={() => setMobileNavOpen((o) => !o)}
            className="md:hidden p-2 rounded-lg text-slate-700 hover:bg-slate-100 transition-colors"
            aria-label="Toggle menu"
          >
            {mobileNavOpen ? <X size={24} /> : <Menu size={24} />}
          </button>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-8">
            <button type="button" onClick={() => scrollTo('hero')} className="text-sm font-semibold text-slate-700 hover:text-amber-600 transition-colors">Home</button>
            <button type="button" onClick={() => scrollTo('services')} className="text-sm font-semibold text-slate-700 hover:text-amber-600 transition-colors">Services</button>
            <div className="relative">
              <button
                type="button"
                onClick={() => setDropdownOpen((o) => !o)}
                className="flex items-center gap-1 text-sm font-semibold text-slate-700 hover:text-amber-600 transition-colors"
              >
                Partner Login
                <ChevronDown size={16} className={`opacity-70 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
              </button>
              {dropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    aria-hidden
                    onClick={() => setDropdownOpen(false)}
                  />
                  <div className="absolute top-full right-0 mt-2 py-1 w-44 bg-white rounded-xl shadow-xl border border-slate-200 z-50">
                    <button
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); onNavigateToLogin?.('store'); }}
                      className="w-full px-4 py-3 text-left text-sm font-semibold text-slate-700 hover:bg-amber-50 hover:text-amber-600 transition-colors rounded-t-xl"
                    >
                      Store Login
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); onNavigateToLogin?.('distributor'); }}
                      className="w-full px-4 py-3 text-left text-sm font-semibold text-slate-700 hover:bg-amber-50 hover:text-amber-600 transition-colors rounded-b-xl"
                    >
                      Distributor Login
                    </button>
                  </div>
                </>
              )}
            </div>
            <button type="button" onClick={() => scrollTo('contact')} className="text-sm font-semibold text-slate-700 hover:text-amber-600 transition-colors">Contact</button>
          </nav>
        </div>

        {/* Mobile Nav */}
        {mobileNavOpen && (
          <div className="md:hidden absolute top-full left-0 right-0 bg-white border-b border-slate-100 shadow-lg py-4 px-4">
            <div className="flex flex-col gap-2">
              <button type="button" onClick={() => scrollTo('hero')} className="py-2 text-left font-semibold text-slate-700 hover:text-amber-600">Home</button>
              <button type="button" onClick={() => scrollTo('services')} className="py-2 text-left font-semibold text-slate-700 hover:text-amber-600">Services</button>
              <button type="button" onClick={() => scrollTo('contact')} className="py-2 text-left font-semibold text-slate-700 hover:text-amber-600">Contact</button>
              <div className="border-t border-slate-100 pt-2 mt-2 space-y-1">
                <button type="button" onMouseDown={(e) => { e.preventDefault(); onNavigateToLogin?.('store'); setMobileNavOpen(false); }} className="w-full py-2 text-left font-semibold text-amber-600">Store Login</button>
                <button type="button" onMouseDown={(e) => { e.preventDefault(); onNavigateToLogin?.('distributor'); setMobileNavOpen(false); }} className="w-full py-2 text-left font-semibold text-amber-600">Distributor Login</button>
              </div>
            </div>
          </div>
        )}
      </header>

      <main className="pt-24 pb-16 px-4 sm:px-6">
        <div id="hero" className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center scroll-mt-24">
          {/* Left - Value Proposition */}
          <div className="space-y-6">
            <p className="text-sm font-bold text-amber-600 uppercase tracking-wider">
              Financial ERP | Swipe & Pay | Ledgers
            </p>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-slate-900 leading-tight tracking-tight">
              Become a CASIFLY Partner and Start Earning Today.
            </h1>
            <p className="text-lg text-slate-600 max-w-xl leading-relaxed">
              Partner with CASIFLY and experience the future of digital payments. Empower your business with seamless Swipe & Pay, Ledgers, Reports, and start earning today!
            </p>
            <Button
              onClick={() => scrollTo('contact')}
              className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white px-8 py-4 text-base font-bold rounded-2xl shadow-xl shadow-amber-500/30 transition-all duration-300 hover:scale-105 active:scale-95"
            >
              JOIN NOW
            </Button>
          </div>

          {/* Right - Dashboard Preview */}
          <div className="relative flex justify-center lg:justify-end">
            {/* Laptop Frame */}
            <div className="relative w-full max-w-lg">
              <div className="aspect-[4/3] bg-slate-800 rounded-2xl p-2 shadow-2xl border-4 border-slate-700">
                {/* Screen content - dark dashboard mock */}
                <div className="h-full bg-slate-900 rounded-xl overflow-hidden">
                  {/* Top Banner */}
                  <div className="h-12 bg-amber-500 flex items-center justify-center px-2">
                    <img src="/logo.png" alt="CASIFLY" className="h-8 w-auto object-contain" />
                  </div>
                  {/* Dashboard content */}
                  <div className="p-4 grid grid-cols-2 gap-4">
                    <div className="bg-slate-800/80 rounded-xl p-4">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">BALANCE</p>
                      <p className="text-2xl font-black text-white">₹5,240.50</p>
                    </div>
                    <div className="bg-slate-800/80 rounded-xl p-4 flex flex-col justify-between">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">REVENUE</p>
                      <div className="h-8 bg-amber-500/30 rounded flex items-end gap-1 mt-2">
                        <div className="w-2 h-4 bg-amber-500 rounded-t" />
                        <div className="w-2 h-6 bg-amber-500 rounded-t" />
                        <div className="w-2 h-8 bg-amber-500 rounded-t" />
                        <div className="w-2 h-5 bg-amber-500 rounded-t" />
                        <div className="w-2 h-10 bg-amber-500 rounded-t" />
                      </div>
                    </div>
                    <div className="col-span-2 bg-slate-800/80 rounded-xl p-4">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">RECENT TRANSACTIONS</p>
                      <div className="space-y-2">
                        {['Reliance', 'Tata', 'Flipkart', 'Infosys', 'Paytm'].map((name, i) => (
                          <div key={name} className="flex justify-between text-sm">
                            <span className="text-slate-300">{name}</span>
                            <span className="font-semibold text-white">₹{[1200, 800, 1000, 700, 2100][i]}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="bg-slate-800/80 rounded-xl p-4 flex flex-col items-center justify-center">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">GROWTH</p>
                      <p className="text-2xl font-black text-emerald-400">12%</p>
                      <p className="text-xs text-emerald-500">+₹1,500</p>
                    </div>
                  </div>
                </div>
              </div>
              {/* Credit card graphic */}
              <div className="absolute -bottom-4 -right-4 w-32 h-20 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl shadow-xl transform rotate-6 flex items-center justify-center p-3">
                <div className="w-full h-full border border-white/30 rounded-lg flex items-end">
                  <span className="text-white/80 text-xs font-mono">•••• •••• ••••</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <section id="services" className="pt-24 pb-16 px-4 sm:px-6 scroll-mt-24">
          <div className="max-w-7xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 text-center mb-16">
              Our Core Service
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
              {coreServices.map(({ icon: Icon, title, description }) => (
                <div
                  key={title}
                  className="bg-white rounded-2xl border-2 border-amber-500/40 p-8 flex flex-col items-center text-center hover:border-amber-500/80 hover:shadow-xl hover:shadow-amber-500/10 transition-all duration-300 hover:-translate-y-1"
                >
                  <div className="w-14 h-14 rounded-xl bg-amber-500/10 flex items-center justify-center mb-6">
                    <Icon className="w-7 h-7 text-amber-600" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 uppercase tracking-wide mb-4">
                    {title}
                  </h3>
                  <p className="text-slate-600 text-sm leading-relaxed">
                    {description}
                  </p>
                </div>
              ))}
            </div>

            {/* Statistics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              <div className="text-center">
                <p className="text-4xl md:text-5xl font-black text-amber-600">500+</p>
                <p className="text-slate-700 font-semibold mt-1">Retailers</p>
              </div>
              <div className="text-center">
                <p className="text-4xl md:text-5xl font-black text-amber-600">250+</p>
                <p className="text-slate-700 font-semibold mt-1">Distributors</p>
              </div>
              <div className="text-center">
                <p className="text-4xl md:text-5xl font-black text-amber-600">10L+</p>
                <p className="text-slate-700 font-semibold mt-1">Transactions</p>
              </div>
              <div className="text-center">
                <p className="text-4xl md:text-5xl font-black text-amber-600">100K+</p>
                <p className="text-slate-700 font-semibold mt-1">Happy Customers</p>
              </div>
            </div>
          </div>
        </section>

        <section id="contact" className="pt-24 pb-16 px-4 sm:px-6 scroll-mt-24">
          <div className="max-w-7xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 text-center mb-16">
              Would you like to be our merchant? Fill the Form
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
              {/* Form */}
              <form
                onSubmit={handleSubmit}
                className="bg-white rounded-2xl border-2 border-amber-500/40 p-8 lg:p-10"
              >
                <div className="space-y-6">
                  <Input
                    label="Name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter your name"
                    required
                  />
                  <Select
                    label="Select the Service"
                    options={serviceOptions}
                    value={service}
                    onChange={(e) => setService(e.target.value)}
                  />
                  <Input
                    label="Phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Enter your phone number"
                    required
                  />
                </div>
                {formSubmitted && (
                  <p className="mt-4 text-sm font-semibold text-emerald-600 bg-emerald-50 px-4 py-2 rounded-lg">
                    Thank you! We&apos;ll get back to you soon.
                  </p>
                )}
                <button
                  type="submit"
                  className="mt-8 w-full py-4 bg-slate-800 hover:bg-slate-900 text-white font-bold uppercase tracking-wider rounded-xl transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
                >
                  SUBMIT
                </button>
              </form>

              {/* Illustration - Customer Support */}
              <div className="flex flex-col items-center lg:items-start">
                <div className="flex items-center gap-4">
                  {/* Large central headphone circle */}
                  <div className="w-40 h-40 rounded-full bg-slate-100 border-2 border-slate-200 flex items-center justify-center shrink-0">
                    <Headphones className="w-16 h-16 text-slate-500" />
                  </div>
                  {/* Contact bubbles - right side */}
                  <div className="flex flex-col gap-4">
                    <div className="w-14 h-14 rounded-full bg-amber-500 flex items-center justify-center shadow-lg">
                      <Phone className="w-6 h-6 text-white" />
                    </div>
                    <div className="w-14 h-14 rounded-full bg-amber-500 flex items-center justify-center shadow-lg">
                      <Mail className="w-6 h-6 text-white" />
                    </div>
                    <div className="w-14 h-14 rounded-full bg-slate-700 flex items-center justify-center shadow-lg">
                      <MessageCircle className="w-6 h-6 text-white" />
                    </div>
                  </div>
                </div>
                {/* Laptop button below */}
                <button
                  type="button"
                  className="mt-8 px-10 py-4 bg-gradient-to-r from-amber-500 to-orange-600 rounded-xl flex items-center justify-center gap-2 shadow-lg hover:from-amber-600 hover:to-orange-700 transition-colors"
                >
                  <Laptop className="w-6 h-6 text-white" />
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="bg-slate-900 text-white">
          <div className="max-w-7xl mx-auto px-6 py-12">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12">
              {/* Logo */}
              <div className="lg:col-span-1">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg">
                    <Store className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <span className="text-xl font-black text-white tracking-tight">FIN</span>
                    <span className="text-xl font-black text-amber-400 tracking-tight">LEDGER</span>
                  </div>
                </div>
              </div>

              {/* Quick Links */}
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-amber-400/90 mb-4">Quick Links</h3>
                <ul className="space-y-2">
                  <li><button type="button" onClick={() => scrollTo('hero')} className="text-white/80 hover:text-amber-400 transition-colors text-left">Home</button></li>
                  <li><button type="button" onClick={() => scrollTo('services')} className="text-white/80 hover:text-amber-400 transition-colors text-left">Services</button></li>
                  <li><button type="button" onClick={() => scrollTo('contact')} className="text-white/80 hover:text-amber-400 transition-colors text-left">Contact</button></li>
                </ul>
              </div>

              {/* Get In Touch */}
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-amber-400/90 mb-4">Get In Touch</h3>
                <ul className="space-y-3 text-white/80">
                  <li className="flex items-start gap-2">
                    <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-amber-400" />
                    <span className="text-sm">No : 49/16, Anandavelu street, perambur, chennai -600011</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Phone className="w-4 h-4 shrink-0 text-amber-400" />
                    <a href="tel:8939238896" className="hover:text-amber-400 transition-colors">8939238896</a>
                  </li>
                  <li className="flex items-center gap-2">
                    <Mail className="w-4 h-4 shrink-0 text-amber-400" />
                    <a href="mailto:zylinxtech@gmail.com" className="hover:text-amber-400 transition-colors">zylinxtech@gmail.com</a>
                  </li>
                  <li className="flex gap-3 pt-2">
                    <a href="#" className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center hover:bg-amber-500 transition-colors">
                      <Facebook className="w-4 h-4" />
                    </a>
                    <a href="#" className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center hover:bg-amber-500 transition-colors">
                      <Globe className="w-4 h-4" />
                    </a>
                    <a href="#" className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center hover:bg-amber-500 transition-colors">
                      <Instagram className="w-4 h-4" />
                    </a>
                  </li>
                </ul>
              </div>

              {/* Privacy Policy */}
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-amber-400/90 mb-4">Privacy policy</h3>
                <ul className="space-y-2">
                  <li><a href="#" className="text-white/80 hover:text-amber-400 transition-colors">T&C</a></li>
                  <li><a href="#" className="text-white/80 hover:text-amber-400 transition-colors">Privacy Policy</a></li>
                  <li><a href="#" className="text-white/80 hover:text-amber-400 transition-colors">Refund Policy</a></li>
                </ul>
              </div>
            </div>

            <div className="border-t border-white/10 mt-12 pt-8">
              <p className="text-center text-sm text-white/70">
                © Copyright CASIFLY Powered by : Zylinx Tech Pvt Ltd All Rights Reserved
              </p>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
};
