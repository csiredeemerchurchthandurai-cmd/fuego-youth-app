import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, User, Phone, ArrowRight, Check } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { Logo } from '@/components/Logo';
import { Alert } from '@/components/ui';
import { PasswordInput } from '@/components/PasswordInput';
import type { UserRole, Church } from '@/types';
import { ROLE_LABELS, ROLE_DESCRIPTIONS } from '@/types';

export function SignupPage() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('pc_member');
  const [churchId, setChurchId] = useState<string>('');
  const [churches, setChurches] = useState<Church[]>([]);
  const [phone, setPhone] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.from('churches').select('id, name, location, created_at').then(({ data }) => {
      if (data) setChurches(data as Church[]);
    });
  }, []);

  const needsChurch = role !== 'super_admin';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (needsChurch && !churchId) {
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
    const { error: signUpError } = await signUp(email, password, fullName, role, needsChurch ? churchId : null, phone, dateOfBirth);
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

  const roles: UserRole[] = [
    'super_admin', 'church_admin', 'pc_member', 'youth_member',
    'pastorate_youth_secretary', 'pastorate_youth_treasurer', 'pastorate_convenor',
    'local_youth_secretary', 'local_youth_treasurer',
  ];

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex flex-col items-center mb-8">
          <Logo size="md" />
          <h1 className="mt-6 text-2xl font-bold text-gray-900">Create Your Account</h1>
          <p className="mt-1.5 text-sm text-gray-500">Join the Fuego Youth Fellowship platform</p>
        </div>

        {error && <div className="mb-4"><Alert type="error" message={error} /></div>}

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 sm:p-8 space-y-5">
          {/* Role selection */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-3">Select Your Role</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {roles.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={`flex items-start gap-3 p-3.5 rounded-xl border-2 text-left transition-all ${
                    role === r
                      ? 'border-orange-500 bg-orange-50 ring-2 ring-orange-200'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <div className={`mt-0.5 h-5 w-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                    role === r ? 'border-orange-500 bg-orange-500' : 'border-gray-300'
                  }`}>
                    {role === r && <Check size={12} className="text-white" strokeWidth={3} />}
                  </div>
                  <div>
                    <div className="text-sm font-bold text-gray-900">{ROLE_LABELS[r]}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{ROLE_DESCRIPTIONS[r]}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {needsChurch && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Your Church</label>
              <select
                value={churchId}
                onChange={(e) => setChurchId(e.target.value)}
                required={needsChurch}
                className="w-full px-4 py-3 rounded-xl border border-gray-300 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
              >
                <option value="">Select your church...</option>
                {churches.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} — {c.location}</option>
                ))}
              </select>
              {churches.length === 0 && (
                <p className="mt-1.5 text-xs text-gray-400">No churches registered yet. A super admin must create a church first.</p>
              )}
            </div>
          )}

          {role === 'youth_member' && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Phone Number</label>
              <div className="relative">
                <Phone size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-300 bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                  placeholder="Your phone number"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Full Name</label>
            <div className="relative">
              <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-300 bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                placeholder="John Doe"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Date of Birth</label>
            <input type="date" required value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-gray-300 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all" />
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
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-300 bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                placeholder="you@church.org"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Password</label>
            <div className="relative">
              <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 z-10" />
              <PasswordInput
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 py-3 rounded-xl border border-gray-300 bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                placeholder="At least 6 characters"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white font-semibold py-3 rounded-xl shadow-lg shadow-orange-500/30 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating account...' : 'Create Account'}
            {!loading && <ArrowRight size={18} />}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-600">
          Already have an account?{' '}
          <Link to="/login" className="text-orange-600 font-semibold hover:text-orange-700 transition-colors">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}