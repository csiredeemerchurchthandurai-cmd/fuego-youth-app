import { useState, useEffect, useCallback } from 'react';
import { Users, UserPlus, Trash2, ShieldCheck } from 'lucide-react';
import { DashboardShell } from '@/components/DashboardShell';
import { Alert, StatCard } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { YouthMember, Profile } from '@/types';
import { ROLE_LABELS } from '@/types';
import { CircularsSection } from '@/components/CircularsSection';
import { EventsManagementSection } from '@/components/EventsManagementSection';

export function ChurchAdminDashboard() {
  const { profile } = useAuth();
  const churchId = profile?.church_id;
  const [members, setMembers] = useState<YouthMember[]>([]);
  const [churchProfiles, setChurchProfiles] = useState<Profile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showMemberForm, setShowMemberForm] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberPhone, setNewMemberPhone] = useState('');
  const [newMemberEmail, setNewMemberEmail] = useState('');

  const fetchData = useCallback(async () => {
    if (!churchId) return;
    const [{ data: memberData }, { data: profileData }] = await Promise.all([
      supabase.from('youth_members').select('id, church_id, full_name, phone, email, created_at').eq('church_id', churchId).order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, full_name, role, church_id, created_at').eq('church_id', churchId).order('created_at', { ascending: false }),
    ]);
    if (memberData) setMembers(memberData as YouthMember[]);
    if (profileData) setChurchProfiles(profileData as Profile[]);
  }, [churchId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const addMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!churchId) return;
    setError(null);
    const { error: insertError } = await supabase.from('youth_members').insert({
      church_id: churchId,
      full_name: newMemberName,
      phone: newMemberPhone,
      email: newMemberEmail,
    });
    if (insertError) { setError(insertError.message); return; }
    setSuccess('Youth member added!');
    setNewMemberName(''); setNewMemberPhone(''); setNewMemberEmail('');
    setShowMemberForm(false);
    fetchData();
    setTimeout(() => setSuccess(null), 3000);
  };

  const deleteMember = async (id: string) => {
    if (!confirm('Remove this youth member?')) return;
    const { error: delError } = await supabase.from('youth_members').delete().eq('id', id);
    if (delError) { setError(delError.message); return; }
    fetchData();
    setSuccess('Member removed.');
    setTimeout(() => setSuccess(null), 3000);
  };

  return (
    <DashboardShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Church Admin Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Manage your church members and generate OTP codes for your local youth secretary</p>
      </div>

      {error && <div className="mb-4"><Alert type="error" message={error} /></div>}
      {success && <div className="mb-4"><Alert type="success" message={success} /></div>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <StatCard icon={<Users size={22} className="text-white" />} label="Youth Members" value={members.length} color="bg-gradient-to-br from-orange-500 to-red-600" />
        <StatCard icon={<ShieldCheck size={22} className="text-white" />} label="Church Users" value={churchProfiles.length} color="bg-gradient-to-br from-blue-500 to-blue-700" />
      </div>

      {/* Church users */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-8">
        <div className="p-5 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">Church Users</h2>
        </div>
        <div className="divide-y divide-gray-100">
          {churchProfiles.length === 0 ? (
            <p className="p-5 text-sm text-gray-400 text-center">No users in your church yet.</p>
          ) : (
            churchProfiles.map((p) => (
              <div key={p.id} className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                <div>
                  <div className="font-medium text-gray-900 text-sm">{p.full_name}</div>
                </div>
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-orange-50 text-orange-700">{ROLE_LABELS[p.role]}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Youth Members */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">Youth Members</h2>
          <button
            onClick={() => setShowMemberForm(!showMemberForm)}
            className="flex items-center gap-1.5 text-sm font-semibold text-orange-600 hover:text-orange-700 transition-colors"
          >
            {showMemberForm ? 'Cancel' : <><UserPlus size={16} /> Add Member</>}
          </button>
        </div>

        {showMemberForm && (
          <form onSubmit={addMember} className="p-5 border-b border-gray-100 bg-gray-50 space-y-3">
            <input type="text" required value={newMemberName} onChange={(e) => setNewMemberName(e.target.value)} placeholder="Full name" className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input type="text" value={newMemberPhone} onChange={(e) => setNewMemberPhone(e.target.value)} placeholder="Phone" className="px-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm" />
              <input type="email" value={newMemberEmail} onChange={(e) => setNewMemberEmail(e.target.value)} placeholder="Email" className="px-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm" />
            </div>
            <button type="submit" className="bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors">Add Member</button>
          </form>
        )}

        <div className="divide-y divide-gray-100">
          {members.length === 0 ? (
            <p className="p-5 text-sm text-gray-400 text-center">No youth members yet. Click "Add Member" to add one.</p>
          ) : (
            members.map((m) => (
              <div key={m.id} className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                <div>
                  <div className="font-medium text-gray-900 text-sm">{m.full_name}</div>
                  <div className="text-xs text-gray-400">{m.phone}{m.phone && m.email ? ' · ' : ''}{m.email}</div>
                </div>
                <button onClick={() => deleteMember(m.id)} className="p-1.5 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={16} /></button>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="mt-8">
        <EventsManagementSection role="church_admin" churchId={churchId ?? null} />
      </div>

      <div className="mt-8">
        <CircularsSection />
      </div>
    </DashboardShell>
  );
}
