import { useState, type ReactNode } from 'react';
import { LogOut, Menu, X, LayoutDashboard, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Logo } from '@/components/Logo';
import { NotificationToggle } from '@/components/NotificationToggle';
import { UserBadge } from '@/components/UserBadge';
import { useAuth } from '@/context/AuthContext';
import { disablePush } from '@/lib/push';
import { ROLE_LABELS } from '@/types';

export function DashboardShell({ children }: { children: ReactNode }) {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const dashboardPath = profile ? `/${profile.role}` : '/';

  const leave = async () => {
    setMenuOpen(false);
    // Stop notifications for this account on this device before signing out
    await disablePush().catch(() => undefined);
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {menuOpen && <button aria-label="Close menu" onClick={() => setMenuOpen(false)} className="fixed inset-0 z-40 bg-slate-950/40 cursor-default" />}
      <aside className={`fixed inset-y-0 left-0 z-50 w-80 max-w-[86vw] bg-slate-950 text-white shadow-2xl transition-transform duration-300 ${menuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between p-5 border-b border-white/10"><Logo size="sm" /><button onClick={() => setMenuOpen(false)} className="rounded-xl p-2 text-slate-300 hover:bg-white/10 hover:text-white" aria-label="Close menu"><X size={20} /></button></div>
        <div className="p-5 border-b border-white/10"><p className="text-xs uppercase tracking-[0.18em] text-orange-300 font-bold">Signed in as</p><p className="mt-2 font-semibold truncate">{profile?.full_name || 'User'}</p><p className="mt-1 text-sm text-slate-400">{profile ? ROLE_LABELS[profile.role] : ''}</p></div>
        <nav className="p-4 space-y-2"><button onClick={() => { setMenuOpen(false); navigate(dashboardPath); }} className="w-full flex items-center gap-3 rounded-xl px-4 py-3 text-left font-semibold text-slate-200 hover:bg-white/10 hover:text-white"><LayoutDashboard size={18} /> Dashboard <ChevronRight size={16} className="ml-auto text-slate-500" /></button><NotificationToggle /></nav>
        <button onClick={leave} className="absolute bottom-5 left-4 right-4 flex items-center gap-3 rounded-xl px-4 py-3 text-left font-semibold text-slate-300 hover:bg-red-500/15 hover:text-red-200"><LogOut size={18} /> Sign out</button>
      </aside>

      <header className="sticky top-0 z-30 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3"><button onClick={() => setMenuOpen(true)} className="rounded-xl p-2 text-gray-600 hover:bg-gray-100 hover:text-orange-600" aria-label="Open menu"><Menu size={21} /></button><Logo size="sm" /></div>
          <div className="flex items-center gap-4"><UserBadge /><button onClick={leave} className="flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-red-600 transition-colors px-3 py-2 rounded-lg hover:bg-red-50"><LogOut size={16} /><span className="hidden sm:inline">Sign Out</span></button></div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">{children}</main>
    </div>
  );
}