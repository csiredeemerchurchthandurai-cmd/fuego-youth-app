import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, ArrowRight, Shield } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Logo } from '@/components/Logo';
import { Alert } from '@/components/ui';
import { LeadershipShowcase } from '@/components/LeadershipShowcase';
import { PasswordInput } from '@/components/PasswordInput';

export function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: signInError } = await signIn(email, password);
    if (signInError) {
      setError(signInError);
      setLoading(false);
    } else {
      navigate('/', { replace: true });
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-orange-500 via-red-500 to-red-700 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, white 1px, transparent 1px), radial-gradient(circle at 80% 80%, white 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
        <div className="relative z-10 flex flex-col justify-between p-12 text-white">
          <div>
            <Logo size="lg" />
            <LeadershipShowcase variant="panel" />
          </div>
          <div>
            <h1 className="text-4xl font-extrabold leading-tight">Fuego Youth Fellowship</h1>
            <p className="mt-4 text-lg text-orange-100 max-w-md">
              Manage attendance, members, and roles with secure OTP-based verification.
            </p>
            <div className="mt-8 space-y-3">
              {['Role-based access control', 'OTP-secured attendance', 'Real-time member tracking'].map((feat) => (
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

      {/* Right panel - form */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 bg-gray-50">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-8">
            <div className="flex justify-center"><Logo size="md" /></div>
            <LeadershipShowcase variant="light" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Welcome Back</h2>
          <p className="mt-1.5 text-sm text-gray-500">Sign in to your Fuego account</p>

          {error && <div className="mt-4"><Alert type="error" message={error} /></div>}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
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
            {' '}
            <Link to="/signup" className="text-orange-600 font-semibold hover:text-orange-700 transition-colors">
            </Link>
          </p>

          <div className="mt-4 pt-4 border-t border-gray-100 text-center">
            <Link to="/portals" className="text-sm text-gray-500 hover:text-orange-600 transition-colors">
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}