import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { Alert } from '@/components/ui';
import { supabase } from '@/lib/supabase';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim() || sending) return;
    setSending(true);
    setError(null);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset-password` });
    if (resetError) setError(resetError.message);
    else setSent(true);
    setSending(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 sm:p-8 shadow-sm">
        <div className="mb-6"><Logo size="sm" /></div>
        <h1 className="text-2xl font-extrabold text-gray-900">Forgot your password?</h1>
        <p className="mt-2 text-sm text-gray-500">Enter the email you signed up with and we will send you a link to choose a new password.</p>

        {sent ? (
          <div className="mt-6 space-y-4">
            <Alert type="success" message={`If an account exists for ${email.trim()}, a password reset link is on its way. Check your inbox and spam folder. The link works for a limited time.`} />
            <button type="button" onClick={() => setSent(false)} className="block w-full text-center text-sm font-semibold text-gray-500 hover:text-gray-700">Use a different email or send again</button>
            <Link to="/login" className="block text-center text-sm font-semibold text-orange-600 hover:text-orange-700">Back to sign in</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-4">
            {error && <Alert type="error" message={error} />}
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-gray-500">Email</span>
              <div className="relative">
                <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="w-full rounded-xl border border-gray-300 py-3 pl-10 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
              </div>
            </label>
            <button disabled={sending} className="w-full rounded-xl bg-orange-500 py-3 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-50">{sending ? 'Sending...' : 'Send reset link'}</button>
            <Link to="/login" className="block text-center text-sm font-semibold text-gray-500 hover:text-gray-700">Back to sign in</Link>
          </form>
        )}
      </div>
    </div>
  );
}