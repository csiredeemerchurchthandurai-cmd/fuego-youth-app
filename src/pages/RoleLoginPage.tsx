import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, ArrowRight, Shield } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Logo } from '@/components/Logo';
import { Alert } from '@/components/ui';
import { LeadershipShowcase } from '@/components/LeadershipShowcase';
import { PasswordInput } from '@/components/PasswordInput';
import { supabase } from '@/lib/supabase';
import type { Church, UserRole } from '@/types';
import { ROLE_LABELS, ROLE_DESCRIPTIONS } from '@/types';

interface RoleLoginPageProps {
  role: UserRole;
  signupPath: string;
}

export function RoleLoginPage({ role, signupPath }: RoleLoginPageProps) {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [churchId, setChurchId] = useState('');
  const [churches, setChurches] = useState<Church[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const needsChurch = role !== 'super_admin';

  useEffect(() => {
    if (!needsChurch) return;
    supabase.from('churches').select('id, name, location, created_at').order('name').then(({ data }) => {
      if (data) setChurches(data as Church[]);
    });
  }, [needsChurch]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (needsChurch && !churchId) {
      setError('Please select your church before signing in.');
      return;
    }
    setLoading(true);
    const { error: signInError } = await signIn(email, password, role, needsChurch ? churchId : null);
    if (signInError) {
      setError(signInError);
      setLoading(false);
    } else {
      navigate('/', { replace: true });
    }
  };

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-orange-500 via-red-500 to-red-700 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, white 1px, transparent 1px), radial-gradient(circle at 80% 80%, white 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
        <div className="relative z-10 flex flex-col justify-between p-12 text-white">
          <div>
            <Logo size="lg" />
            <LeadershipShowcase variant="panel" />
          </div>
          <div>
            <h1 className="text-4xl font-extrabold leading-tight">Fuego Youth Fellowship</h1>
            <p className="mt-4 text-lg text-orange-100 max-w-md">{ROLE_DESCRIPTIONS[role]}</p>
            <div className="mt-6">
              <span className="inline-flex items-center px-4 py-2 rounded-full bg-white/15 text-sm font-semibold backdrop-blur-sm">
                {ROLE_LABELS[role]} Portal
              </span>
            </div>
            <div className="mt-8 space-y-3">
              {['Role-based access control', 'OTP-secured attendance', 'Secure member management'].map((feat) => (
                <div key={feat} className="flex items-center gap-3">
                  <div className="h-6 w-6 rounded-full bg-white/20 flex items-center justify-center">
                    <Shield size={14} className="text-white" />
                  </div>
                  <span className="text-orange-50 text-sm font-medium">{feat}</span>
                </div>
              ))}
            </div>
          </div>
          <p className="text-sm text-orange-200">© 2026 Fuego Youth Fellowship. All rights reserved.</p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center px-6 py-12 bg-gray-50">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-8">
            <div className="flex justify-center"><Logo size="md" /></div>
            <LeadershipShowcase variant="light" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">{ROLE_LABELS[role]} Sign In</h2>
          <p className="mt-1.5 text-sm text-gray-500">Enter your credentials to access your portal</p>

          {error && <div className="mt-4"><Alert type="error" message={error} /></div>}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {needsChurch && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Your Church</label>
                <select
                  value={churchId}
                  onChange={(event) => setChurchId(event.target.value)}
                  required
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                >
                  <option value="">Select your church...</option>
                  {churches.map((church) => <option key={church.id} value={church.id}>{church.name} — {church.location}</option>)}
                </select>
                {churches.length === 0 && <p className="mt-1.5 text-xs text-gray-400">No churches are available yet.</p>}
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Email Address</label>
              <div className="relative">
                <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-300 bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                  placeholder="you@church.org"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-semibold text-gray-700">Password</label>
                <Link to="/forgot-password" className="text-sm font-semibold text-orange-600 hover:text-orange-700 transition-colors">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 z-10" />
                <PasswordInput
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 py-3 rounded-xl border border-gray-300 bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white font-semibold py-3 rounded-xl shadow-lg shadow-orange-500/30 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? 'Signing in...' : 'Sign In'}
              {!loading && <ArrowRight size={18} />}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-600">
            Don't have an account?{' '}
            <Link to={signupPath} className="text-orange-600 font-semibold hover:text-orange-700 transition-colors">
              Create one
            </Link>
          </p>
          <p className="mt-3 text-center text-sm text-gray-500">
            <Link to="/portals" className="font-semibold text-orange-600 hover:text-orange-700"></Link>
          </p>
        </div>
      </div>
    </div>
  );
}