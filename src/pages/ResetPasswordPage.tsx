import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Logo } from '@/components/Logo';
import { Alert } from '@/components/ui';
import { PasswordInput } from '@/components/PasswordInput';
import { supabase } from '@/lib/supabase';

// Opened from the link in the reset email. Supabase signs the user in with a short recovery session,
// which lets them choose a new password.
export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<'checking' | 'ready' | 'invalid' | 'done'>('checking');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' && !cancelled) setStatus('ready');
    });
    // The recovery session can already exist by the time this page loads, so also check for it (a few tries)
    const check = async () => {
      for (let attempt = 0; attempt < 6 && !cancelled; attempt += 1) {
        const { data } = await supabase.auth.getSession();
        if (data.session) { setStatus('ready'); return; }
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
      if (!cancelled) setStatus((current) => (current === 'checking' ? 'invalid' : current));
    };
    check();
    return () => { cancelled = true; listener.subscription.unsubscribe(); };
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (password.length < 8) { setError('Your password must be at least 8 characters.'); return; }
    if (password !== confirm) { setError('The two passwords do not match.'); return; }
    setSaving(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) { setError(updateError.message); setSaving(false); return; }
    await supabase.auth.signOut({ scope: 'global' });
    setStatus('done');
    setSaving(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 sm:p-8 shadow-sm">
        <div className="mb-6"><Logo size="sm" /></div>

        {status === 'checking' && <p className="text-sm text-gray-500">Checking your reset link...</p>}

        {status === 'invalid' && (
          <div className="space-y-4">
            <h1 className="text-2xl font-extrabold text-gray-900">This link has expired</h1>
            <p className="text-sm text-gray-500">The reset link is invalid or has already been used. Request a new one and try again.</p>
            <Link to="/forgot-password" className="block w-full rounded-xl bg-orange-500 py-3 text-center text-sm font-bold text-white hover:bg-orange-600">Request a new link</Link>
          </div>
        )}

        {status === 'ready' && (
          <form onSubmit={submit} className="space-y-4">
            <h1 className="text-2xl font-extrabold text-gray-900">Choose a new password</h1>
            {error && <Alert type="error" message={error} />}
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-gray-500">New password</span>
              <PasswordInput required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" className="w-full rounded-xl border border-gray-300 py-3 pl-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-gray-500">Confirm password</span>
              <PasswordInput required value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Type it again" className="w-full rounded-xl border border-gray-300 py-3 pl-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
            </label>
            <button disabled={saving} className="w-full rounded-xl bg-orange-500 py-3 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-50">{saving ? 'Saving...' : 'Update password'}</button>
          </form>
        )}

        {status === 'done' && (
          <div className="space-y-4">
            <Alert type="success" message="Your password has been updated. You can now sign in with it." />
            <button onClick={() => navigate('/login', { replace: true })} className="w-full rounded-xl bg-orange-500 py-3 text-sm font-bold text-white hover:bg-orange-600">Go to sign in</button>
          </div>
        )}
      </div>
    </div>
  );
}