import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, ArrowRight, User, Sparkles } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { Alert } from '@/components/ui';
import type { Church } from '@/types';
import { useEffect } from 'react';

export function YouthLoginPage() {
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
      {/* Left panel — youth-themed */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-teal-500 via-cyan-600 to-blue-700 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 30% 40%, white 1.5px, transparent 1.5px), radial-gradient(circle at 70% 70%, white 1px, transparent 1px)', backgroundSize: '50px 50px' }} />
        <div className="absolute top-20 right-20 w-40 h-40 bg-white/5 rounded-full blur-3xl" />
        <div className="absolute bottom-32 left-16 w-52 h-52 bg-cyan-300/10 rounded-full blur-3xl" />

        <div className="relative z-10 flex flex-col justify-between p-12 text-white">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-white/15 flex items-center justify-center backdrop-blur-sm">
              <Sparkles size={26} />
            </div>
            <span className="text-xl font-bold">Fuego Youth</span>
          </div>

          <div>
            <h1 className="text-4xl font-extrabold leading-tight">Youth Member Portal</h1>
            <p className="mt-4 text-lg text-cyan-100 max-w-md">
              Mark your attendance, submit feedback, and stay updated with circulars from your fellowship leaders.
            </p>
            <div className="mt-8 space-y-3">
              {[
                'Enter OTP to check in for sessions',
                'Submit feedback after each session',
                'Read circulars from your leaders',
              ].map((feat) => (
                <div key={feat} className="flex items-center gap-3">
                  <div className="h-6 w-6 rounded-full bg-white/20 flex items-center justify-center">
                    <ArrowRight size={12} className="text-white" />
                  </div>
                  <span className="text-cyan-50 text-sm font-medium">{feat}</span>
                </div>
              ))}
            </div>
          </div>

          <p className="text-sm text-cyan-200">© 2026 Fuego Youth Fellowship. All rights reserved.</p>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 bg-gray-50">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-8 flex flex-col items-center">
            <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center mb-3">
              <Sparkles size={26} className="text-white" />
            </div>
            <h1 className="text-xl font-bold text-gray-900">Fuego Youth Portal</h1>
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Youth Member Sign In</h2>
          <p className="mt-1.5 text-sm text-gray-500">Welcome back! Enter your credentials to continue.</p>

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
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-300 bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
                  placeholder="you@fuego.org"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Password</label>
              <div className="relative">
                <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-300 bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-600 hover:to-cyan-700 text-white font-semibold py-3 rounded-xl shadow-lg shadow-teal-500/30 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? 'Signing in...' : 'Sign In'}
              {!loading && <ArrowRight size={18} />}
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-gray-100 space-y-3">
            <p className="text-center text-sm text-gray-600">
              New member?{' '}
              <Link to="/signup/youth_member" className="text-teal-600 font-semibold hover:text-teal-700 transition-colors">
                Create an account
              </Link>
            </p>
            <p className="text-center">
              <Link to="/portals" className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
                Leader login
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function YouthSignupPage() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [churchId, setChurchId] = useState<string>('');
  const [churches, setChurches] = useState<Church[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.from('churches').select('id, name, location, created_at').then(({ data }) => {
      if (data) setChurches(data as Church[]);
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!churchId) {
      setError('Please select your church.');
      return;
    }
    if (!dateOfBirth) {
      setError('Please enter your date of birth.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    const { error: signUpError } = await signUp(email, password, fullName, 'youth_member', churchId, phone, dateOfBirth);
    if (signUpError) {
      if (signUpError.toLowerCase().includes('already') || signUpError.toLowerCase().includes('registered')) {
        setError('This email is already registered. Please sign in instead.');
      } else {
        setError(signUpError);
      }
      setLoading(false);
    } else {
      navigate('/', { replace: true });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-cyan-50 py-8 px-4">
      <div className="max-w-md mx-auto">
        <div className="flex flex-col items-center mb-8">
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center mb-3">
            <Sparkles size={26} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Join Fuego Youth</h1>
          <p className="mt-1.5 text-sm text-gray-500">Create your youth member account</p>
        </div>

        {error && <div className="mb-4"><Alert type="error" message={error} /></div>}

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 sm:p-8 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Your Church</label>
            <select
              value={churchId}
              onChange={(e) => setChurchId(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl border border-gray-300 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
            >
              <option value="">Select your church...</option>
              {churches.map((c) => (
                <option key={c.id} value={c.id}>{c.name} — {c.location}</option>
              ))}
            </select>
            {churches.length === 0 && (
              <p className="mt-1.5 text-xs text-gray-400">No churches registered yet. Ask a leader to create one.</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Full Name</label>
            <div className="relative">
              <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-300 bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
                placeholder="John Doe"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Phone Number</label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-300 bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
              placeholder="Your phone number"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Date of Birth</label>
            <input
              type="date"
              required
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-300 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Email Address</label>
            <div className="relative">
              <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-300 bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
                placeholder="you@fuego.org"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Password</label>
            <div className="relative">
              <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-300 bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
                placeholder="At least 6 characters"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-600 hover:to-cyan-700 text-white font-semibold py-3 rounded-xl shadow-lg shadow-teal-500/30 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating account...' : 'Create Account'}
            {!loading && <ArrowRight size={18} />}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-600">
          Already have an account?{' '}
          <Link to="/login/youth" className="text-teal-600 font-semibold hover:text-teal-700 transition-colors">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
