import { Link } from 'react-router-dom';
import { Shield, Users, KeyRound, FileText, Coins, User, BookOpen, Megaphone, Building2, ChevronRight, ArrowLeft } from 'lucide-react';
import { Logo } from '@/components/Logo';
import type { UserRole } from '@/types';
import { ROLE_LABELS } from '@/types';

interface LeaderPortal {
  role: UserRole;
  icon: React.ReactNode;
  color: string;
  description: string;
}

const PORTALS: LeaderPortal[] = [
  { role: 'super_admin', icon: <Shield size={24} />, color: 'from-orange-500 to-red-600', description: 'Full system access' },
  { role: 'church_admin', icon: <Building2 size={24} />, color: 'from-blue-500 to-blue-700', description: 'Manage your church' },
{ role: 'pc_member', icon: <Users size={24} />, color: 'from-purple-500 to-purple-700', description: 'View attendance & members' },
  { role: 'youth_member', icon: <User size={24} />, color: 'from-teal-500 to-teal-700', description: 'Mark attendance & read circulars' },
  { role: 'pastorate_youth_secretary', icon: <FileText size={24} />, color: 'from-rose-500 to-rose-700', description: 'Pastorate-level circulars' },
  { role: 'pastorate_youth_treasurer', icon: <Coins size={24} />, color: 'from-indigo-500 to-indigo-700', description: 'Pastorate-level oversight' },
  { role: 'pastorate_convenor', icon: <Megaphone size={24} />, color: 'from-cyan-500 to-cyan-700', description: 'Convenor oversight' },
  { role: 'local_youth_secretary', icon: <BookOpen size={24} />, color: 'from-violet-500 to-violet-700', description: 'Local church secretary' },
  { role: 'local_youth_treasurer', icon: <Coins size={24} />, color: 'from-lime-500 to-lime-700', description: 'Local church treasurer' },
];

export function LeaderPortalsPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-col items-center mb-8">
          <Logo size="md" />
          <h1 className="mt-6 text-3xl font-bold text-gray-900">Fuego Youth Fellowship</h1>
          <p className="mt-2 text-sm text-gray-500">Select your role to access your portal</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {PORTALS.map((portal) => (
            <Link
              key={portal.role}
              to={`/login/${portal.role}`}
              className="group bg-white rounded-2xl border border-gray-200 shadow-sm p-5 hover:shadow-md hover:border-orange-300 transition-all"
            >
              <div className="flex items-center gap-4">
                <div className={`h-12 w-12 rounded-xl bg-gradient-to-br ${portal.color} flex items-center justify-center text-white flex-shrink-0`}>
                  {portal.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-gray-900 text-sm">{ROLE_LABELS[portal.role]}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{portal.description}</div>
                </div>
                <ChevronRight size={18} className="text-gray-300 group-hover:text-orange-500 transition-colors flex-shrink-0" />
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-8 text-center">
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors">
            <ArrowLeft size={14} /> Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
