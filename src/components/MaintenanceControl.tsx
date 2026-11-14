import { useCallback, useEffect, useState } from 'react';
import { LogOut, Wrench } from 'lucide-react';
import { Alert } from '@/components/ui';
import { supabase } from '@/lib/supabase';

// Super Admin: sign everyone out (for an update or maintenance). People stay signed in otherwise.
export function MaintenanceControl() {
  const [lastTime, setLastTime] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from('app_settings').select('value').eq('key', 'session_epoch').maybeSingle();
    const value = data?.value as string | undefined;
    setLastTime(value && value !== '0' ? value : null);
  }, []);

  useEffect(() => { load(); }, [load]);

  const signEveryoneOut = async () => {
    if (!confirm('Everyone will be signed out and must sign in again the next time they open the app. Continue?')) return;
    setBusy(true);
    setError(null);
    const value = new Date().toISOString();
    const { error: saveError } = await supabase.from('app_settings').upsert({ key: 'session_epoch', value, updated_at: value }, { onConflict: 'key' });
    if (saveError) setError(`Could not do this: ${saveError.message}`);
    else {
      localStorage.setItem('fuego:sessionStamp', value);   // you stay signed in
      setLastTime(value);
      setSuccess('Done. Everyone else will be asked to sign in again the next time they open the app.');
    }
    setBusy(false);
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="p-5 border-b border-gray-100">
        <h2 className="font-bold text-gray-900 flex items-center gap-2"><Wrench size={18} className="text-orange-600" /> Updates and maintenance</h2>
        <p className="text-sm text-gray-500 mt-1">People stay signed in on their phones and computers. They are signed out only when they change their password, when a new version of the app goes online, or when you use the button below.</p>
      </div>
      <div className="p-5 space-y-4">
        {error && <Alert type="error" message={error} />}
        {success && <Alert type="success" message={success} />}
        <button onClick={signEveryoneOut} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-5 py-3 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"><LogOut size={16} /> {busy ? 'Working...' : 'Sign everyone out'}</button>
        <p className="text-xs text-gray-400">Last time: {lastTime ? new Date(lastTime).toLocaleString() : 'never'}</p>
      </div>
    </div>
  );
}