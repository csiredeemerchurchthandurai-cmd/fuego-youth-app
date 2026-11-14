import { useCallback, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { disablePush } from '@/lib/push';

const STAMP_KEY = 'fuego:sessionStamp';
const REASON_KEY = 'fuego:signedOutReason';

const MESSAGES: Record<string, string> = {
  updated: 'The app was updated, so you were signed out. Please sign in again.',
  maintenance: 'The app went through maintenance, so you were signed out. Please sign in again.',
  password: 'Your password was changed, so you were signed out everywhere. Please sign in with the new password.',
};

// The file name of the app version this page is running (only built apps have one; the dev server does not)
const runningBuild = () => {
  const script = document.querySelector('script[type="module"][src*="/assets/index-"]') as HTMLScriptElement | null;
  return script ? new URL(script.src).pathname : null;
};

// The app version that is online right now
async function deployedBuild() {
  try {
    const response = await fetch(`/index.html?cb=${Date.now()}`, { cache: 'no-store' });
    const match = (await response.text()).match(/\/assets\/index-[A-Za-z0-9_-]+\.js/);
    return match ? match[0] : null;
  } catch {
    return null;
  }
}

async function currentEpoch() {
  const { data } = await supabase.from('app_settings').select('value').eq('key', 'session_epoch').maybeSingle();
  return (data?.value as string | undefined) ?? '0';
}

// Keeps people signed in on their phone or computer. They are signed out only when:
//  - their password was changed (done where the password is changed),
//  - a new version of the app is online, or
//  - the Super Admin asked everyone to sign in again (maintenance).
export function SessionGuard() {
  const { session, loading } = useAuth();
  const signedIn = Boolean(session);
  const [reason, setReason] = useState<string | null>(() => localStorage.getItem(REASON_KEY));

  const forceSignOut = useCallback(async (why: 'updated' | 'maintenance') => {
    localStorage.setItem(REASON_KEY, why);
    localStorage.removeItem(STAMP_KEY);
    setReason(why);
    await disablePush().catch(() => undefined);   // stop notifications for this account on this device
    await supabase.auth.signOut();
    if (why === 'updated') window.location.reload();   // load the new version
  }, []);

  const check = useCallback(async () => {
    if (!signedIn) return;
    const running = runningBuild();
    if (running) {
      const live = await deployedBuild();
      if (live && live !== running) { await forceSignOut('updated'); return; }
    }
    const epoch = await currentEpoch();
    const stamp = localStorage.getItem(STAMP_KEY);
    if (!stamp) { localStorage.setItem(STAMP_KEY, epoch); return; }   // first time on this device since signing in
    if (stamp !== epoch) await forceSignOut('maintenance');
  }, [signedIn, forceSignOut]);

  // A fresh sign-in starts a fresh stamp
  useEffect(() => {
    if (!loading && !signedIn) localStorage.removeItem(STAMP_KEY);
    if (signedIn && reason) { localStorage.removeItem(REASON_KEY); setReason(null); }
  }, [loading, signedIn, reason]);

  useEffect(() => {
    check();
    const timer = window.setInterval(check, 5 * 60 * 1000);
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      check();
      // The app is open now: clear the number on the home screen icon and the pending notifications
      const nav = navigator as Navigator & { clearAppBadge?: () => Promise<void> };
      nav.clearAppBadge?.().catch(() => undefined);
      navigator.serviceWorker?.getRegistration().then((registration) => registration?.getNotifications().then((list) => list.forEach((item) => item.close()))).catch(() => undefined);
    };
    document.addEventListener('visibilitychange', onVisible);
    onVisible();
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [check]);

  if (!reason || signedIn) return null;
  return (
    <div className="fixed inset-x-0 top-0 z-[100] flex items-center justify-between gap-3 bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-lg">
      <span>{MESSAGES[reason] || 'Please sign in again.'}</span>
      <button onClick={() => { localStorage.removeItem(REASON_KEY); setReason(null); }} aria-label="Dismiss" className="rounded p-1 hover:bg-white/10"><X size={16} /></button>
    </div>
  );
}