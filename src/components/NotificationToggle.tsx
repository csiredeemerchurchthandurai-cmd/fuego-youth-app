import { useEffect, useState } from 'react';
import { Bell, BellOff, Download } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { disablePush, enablePush, getCurrentSubscription, isIos, isStandalone, pushSupported, registerServiceWorker } from '@/lib/push.ts';

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
type Status = 'loading' | 'unsupported' | 'ios-install' | 'off' | 'on' | 'denied';

// Install-to-home-screen and push notification controls (styled for the dark sidebar)
export function NotificationToggle() {
  const { profile } = useAuth();
  const [status, setStatus] = useState<Status>('loading');
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    registerServiceWorker().catch(() => undefined);
    const onPrompt = (event: Event) => { event.preventDefault(); setInstallEvent(event as BeforeInstallPromptEvent); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  useEffect(() => {
    const check = async () => {
      if (!pushSupported()) { setStatus(isIos() && !isStandalone() ? 'ios-install' : 'unsupported'); return; }
      if (Notification.permission === 'denied') { setStatus('denied'); return; }
      const subscription = await getCurrentSubscription();
      setStatus(Notification.permission === 'granted' && subscription ? 'on' : 'off');
    };
    check();
  }, [profile?.id]);

  const turnOn = async () => {
    if (!profile?.id) return;
    setBusy(true);
    setMessage(null);
    const result = await enablePush(profile.id);
    if (result === 'enabled') setStatus('on');
    else if (result === 'denied') setStatus('denied');
    else if (result === 'missing-key') setMessage('Notifications are not configured yet.');
    else setMessage('Could not turn on notifications. Please try again.');
    setBusy(false);
  };

  const turnOff = async () => {
    setBusy(true);
    await disablePush();
    setStatus('off');
    setBusy(false);
  };

  const install = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    await installEvent.userChoice;
    setInstallEvent(null);
  };

  if (status === 'loading') return null;

  return (
    <div className="mt-4 space-y-2 border-t border-white/10 pt-4">
      {installEvent && !isStandalone() && (
        <button onClick={install} className="w-full flex items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold text-slate-200 hover:bg-white/10 hover:text-white">
          <Download size={18} /> Install app on this device
        </button>
      )}

      {status === 'off' && (
        <button onClick={turnOn} disabled={busy} className="w-full flex items-center gap-3 rounded-xl bg-orange-500/15 px-4 py-3 text-left text-sm font-semibold text-orange-200 hover:bg-orange-500/25 disabled:opacity-50">
          <Bell size={18} /> {busy ? 'Turning on...' : 'Turn on notifications'}
        </button>
      )}
      {status === 'on' && (
        <button onClick={turnOff} disabled={busy} className="w-full flex items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold text-slate-300 hover:bg-white/10 hover:text-white disabled:opacity-50">
          <BellOff size={18} /> {busy ? 'Turning off...' : 'Turn off notifications'}
        </button>
      )}
      {status === 'denied' && <p className="px-4 text-xs text-slate-400">Notifications are blocked. Allow them for this site in your browser or phone settings, then reload.</p>}
      {status === 'ios-install' && <p className="px-4 text-xs text-slate-400">On iPhone, tap Share, then Add to Home Screen. Open Fuego from your home screen to turn on notifications.</p>}
      {status === 'unsupported' && <p className="px-4 text-xs text-slate-400">This browser does not support notifications.</p>}
      {message && <p className="px-4 text-xs text-red-300">{message}</p>}
    </div>
  );
}