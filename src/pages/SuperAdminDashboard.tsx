import { useState, useEffect, useCallback } from 'react';
import { Building2, Users, Church as ChurchIcon, Plus, Calendar, Trash2, Edit3, X, Check, ChevronRight, Folder, FolderOpen, FileText, UserCircle, Send, UserPlus, UserCheck, Download, Mic, BookOpen, Star } from 'lucide-react';
import { DashboardShell } from '@/components/DashboardShell';
import { Alert, StatCard } from '@/components/ui';
import { CircularsSection } from '@/components/CircularsSection';
import { MemberDetailDrawer } from '@/components/MemberDetailDrawer';
import { ChurchFundsSection } from '@/components/ChurchFundsSection';
import { EventsManagementSection } from '@/components/EventsManagementSection';
import { InformationRequestsSection } from '@/components/InformationRequestsSection';
import { ManualAttendance } from '@/components/ManualAttendance';
import { MemberExport } from '@/components/MemberExport';
import { ExportAccessAdmin } from '@/components/ExportAccessAdmin';
import { MessageWorshipAllChurches } from '@/components/MessageWorshipAllChurches';
import { MinuteBook } from '@/components/MinuteBook';
import { PublicLeadersAdmin } from '@/components/PublicLeadersAdmin';
import { useUnreadCounts } from '@/hooks/useUnreadCounts';
import { CountBadge } from '@/components/CountBadge';
import { supabase } from '@/lib/supabase';
import type { Church, Profile, UserRole, YouthMember } from '@/types';
import { ROLE_LABELS } from '@/types';

export function SuperAdminDashboard() {
  const [churches, setChurches] = useState<Church[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [membersByChurch, setMembersByChurch] = useState<Record<string, YouthMember[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showChurchForm, setShowChurchForm] = useState(false);
  const [newChurchName, setNewChurchName] = useState('');
  const [newChurchLocation, setNewChurchLocation] = useState('');
  const [editingChurch, setEditingChurch] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editingProfile, setEditingProfile] = useState<string | null>(null);
  const [editRole, setEditRole] = useState<UserRole>('pc_member');
  const [expandedChurch, setExpandedChurch] = useState<string | null>(null);
  const [selectedMember, setSelectedMember] = useState<YouthMember | null>(null);
  type LeaderRow = { person_id: string; full_name: string; role_key: string; phone: string | null; email: string | null; is_leader: boolean };
  const [leadersByChurch, setLeadersByChurch] = useState<Record<string, LeaderRow[]>>({});
  const [addingMemberFor, setAddingMemberFor] = useState<string | null>(null);
  const emptyMemberForm = { full_name: '', email: '', phone: '', date_of_birth: '', address: '' };
  const [memberForm, setMemberForm] = useState(emptyMemberForm);
  const [savingMember, setSavingMember] = useState(false);
  const [view, setView] = useState<'churches' | 'users' | 'circulars' | 'funds' | 'events' | 'requests' | 'manual' | 'downloads' | 'worshipAll' | 'minutes' | 'leadersPage'>('churches');
  const unread = useUnreadCounts(view === 'requests' ? 'requests' : view === 'circulars' ? 'circulars' : null);

  const fetchData = useCallback(async () => {
    const [{ data: churchData }, { data: profileData }] = await Promise.all([
      supabase.from('churches').select('id, name, location, created_at').order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, full_name, role, church_id, created_at').order('created_at', { ascending: false }),
    ]);
    if (churchData) setChurches(churchData as Church[]);
    if (profileData) setProfiles(profileData as Profile[]);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const fetchMembersForChurch = async (churchId: string) => {
    const { data } = await supabase.from('youth_members').select('id, church_id, full_name, phone, email, date_of_birth, address, created_at').eq('church_id', churchId).eq('is_leader', false).order('full_name');
    setMembersByChurch((prev) => ({ ...prev, [churchId]: (data as YouthMember[]) || [] }));
  };

  // Church admin, pastorate roles, local secretary / treasurer and PC members of a church, with their contact details
  const fetchLeadersForChurch = async (churchId: string) => {
    const { data } = await supabase.rpc('church_people', { target_church: churchId });
    setLeadersByChurch((prev) => ({ ...prev, [churchId]: ((data as LeaderRow[]) || []).filter((row) => row.is_leader) }));
  };

  const toggleChurch = (churchId: string) => {
    if (expandedChurch === churchId) {
      setExpandedChurch(null);
    } else {
      setExpandedChurch(churchId);
      fetchMembersForChurch(churchId);
      fetchLeadersForChurch(churchId);
    }
  };

  const createChurch = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const { error: insertError } = await supabase.from('churches').insert({ name: newChurchName, location: newChurchLocation });
    if (insertError) { setError(insertError.message); return; }
    setSuccess('Church created successfully!');
    setNewChurchName(''); setNewChurchLocation(''); setShowChurchForm(false);
    fetchData();
    setTimeout(() => setSuccess(null), 3000);
  };

  const saveEditChurch = async (id: string) => {
    const { error: updateError } = await supabase.from('churches').update({ name: editName, location: editLocation }).eq('id', id);
    if (updateError) { setError(updateError.message); return; }
    setEditingChurch(null);
    fetchData();
    setSuccess('Church updated.');
    setTimeout(() => setSuccess(null), 3000);
  };

  const deleteChurch = async (id: string) => {
    if (!confirm('Delete this church and all its data? This cannot be undone.')) return;
    const { error: deleteError } = await supabase.from('churches').delete().eq('id', id);
    if (deleteError) { setError(deleteError.message); return; }
    fetchData();
    setSuccess('Church deleted.');
    setTimeout(() => setSuccess(null), 3000);
  };

  const saveProfileRole = async (id: string) => {
    const { error: updateError } = await supabase.from('profiles').update({ role: editRole }).eq('id', id);
    if (updateError) { setError(updateError.message); return; }
    setEditingProfile(null);
    fetchData();
    setSuccess('User role updated.');
    setTimeout(() => setSuccess(null), 3000);
  };

  const addMember = async (e: React.FormEvent, churchId: string) => {
    e.preventDefault();
    if (!memberForm.full_name.trim() || !memberForm.email.trim() || savingMember) return;
    setSavingMember(true);
    setError(null);
    const { error: insertError } = await supabase.from('youth_members').insert({
      church_id: churchId,
      full_name: memberForm.full_name.trim(),
      email: memberForm.email.trim().toLowerCase(),
      phone: memberForm.phone.trim(),
      date_of_birth: memberForm.date_of_birth || null,
      address: memberForm.address.trim(),
    });
    if (insertError) {
      setError(`Could not add this member: ${insertError.message}`);
    } else {
      setMemberForm(emptyMemberForm);
      setAddingMemberFor(null);
      await fetchMembersForChurch(churchId);
      setSuccess('Youth member added.');
      setTimeout(() => setSuccess(null), 3000);
    }
    setSavingMember(false);
  };

  const deleteMember = async (member: YouthMember) => {
    if (!confirm(`Delete ${member.full_name}? Their youth member record will be removed. This cannot be undone.`)) return;
    setError(null);
    const { error: deleteError } = await supabase.from('youth_members').delete().eq('id', member.id);
    if (deleteError) {
      setError(`Could not delete this member: ${deleteError.message}`);
      return;
    }
    if (selectedMember?.id === member.id) setSelectedMember(null);
    await fetchMembersForChurch(member.church_id);
    setSuccess('Youth member deleted.');
    setTimeout(() => setSuccess(null), 3000);
  };

  const churchName = (id: string | null) => churches.find((c) => c.id === id)?.name || '—';
  const churchMembers = (id: string) => membersByChurch[id] || [];

  return (
    <DashboardShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Super Admin Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Manage churches, members, users, and circulars across the fellowship</p>
      </div>

      {error && <div className="mb-4"><Alert type="error" message={error} /></div>}
      {success && <div className="mb-4"><Alert type="success" message={success} /></div>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <StatCard icon={<ChurchIcon size={22} className="text-white" />} label="Total Churches" value={churches.length} color="bg-gradient-to-br from-orange-500 to-red-600" />
        <StatCard icon={<Users size={22} className="text-white" />} label="Total Users" value={profiles.length} color="bg-gradient-to-br from-blue-500 to-blue-700" />
        <StatCard icon={<Building2 size={22} className="text-white" />} label="Church Admins" value={profiles.filter((p) => p.role === 'church_admin').length} color="bg-gradient-to-br from-emerald-500 to-emerald-700" />
      </div>

      {/* Tab navigation */}
      <div className="w-full max-w-full overflow-x-auto mb-6">
        <div className="flex gap-1 bg-white rounded-xl border border-gray-200 p-1.5 shadow-sm w-max min-w-full">
          {([
            { key: 'churches', label: 'Churches & Members', icon: <Folder size={16} /> },
            { key: 'users', label: 'All Users', icon: <Users size={16} /> },
            { key: 'circulars', label: 'Circulars', icon: <FileText size={16} /> },
            { key: 'funds', label: 'Church Funds', icon: <Building2 size={16} /> },
            { key: 'events', label: 'Events', icon: <Calendar size={16} /> },
            { key: 'requests', label: 'Requests', icon: <Send size={16} /> },
            { key: 'manual', label: 'Manual Attendance', icon: <UserCheck size={16} /> },
            { key: 'downloads', label: 'Downloads', icon: <Download size={16} /> },
            { key: 'worshipAll', label: 'Message & Worship', icon: <Mic size={16} /> },
            { key: 'minutes', label: 'Minute Books', icon: <BookOpen size={16} /> },
            { key: 'leadersPage', label: 'Leaders Page', icon: <Star size={16} /> },
          ] as const).map((t) => (
            <button
              key={t.key}
              onClick={() => setView(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all whitespace-nowrap ${
                view === t.key ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {t.icon}
              {t.label}
              <CountBadge count={t.key === 'requests' ? unread.requests : t.key === 'circulars' ? unread.circulars : 0} />
            </button>
          ))}
        </div>
      </div>

      {/* Churches & Members View */}
      {view === 'churches' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-8">
          <div className="flex items-center justify-between p-5 border-b border-gray-100">
            <h2 className="font-bold text-gray-900">Churches</h2>
            <button
              onClick={() => setShowChurchForm(!showChurchForm)}
              className="flex items-center gap-1.5 text-sm font-semibold text-orange-600 hover:text-orange-700 transition-colors"
            >
              {showChurchForm ? <><X size={16} /> Cancel</> : <><Plus size={16} /> Add Church</>}
            </button>
          </div>

          {showChurchForm && (
            <form onSubmit={createChurch} className="p-5 border-b border-gray-100 bg-gray-50 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input type="text" required value={newChurchName} onChange={(e) => setNewChurchName(e.target.value)} placeholder="Church name" className="px-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm" />
                <input type="text" value={newChurchLocation} onChange={(e) => setNewChurchLocation(e.target.value)} placeholder="Location" className="px-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm" />
              </div>
              <button type="submit" className="bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors">Create Church</button>
            </form>
          )}

          {churches.length === 0 ? (
            <p className="p-5 text-sm text-gray-400 text-center">No churches yet. Click "Add Church" to create one.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {churches.map((church) => (
                <div key={church.id}>
                  {/* Church folder header */}
                  <div className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                    <button
                      onClick={() => toggleChurch(church.id)}
                      className="flex items-center gap-3 flex-1 text-left min-w-0"
                    >
                      <div className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${expandedChurch === church.id ? 'bg-orange-100' : 'bg-gray-100'}`}>
                        {expandedChurch === church.id ? <FolderOpen size={20} className="text-orange-600" /> : <Folder size={20} className="text-gray-400" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-gray-900">{church.name}</div>
                        <div className="text-sm text-gray-500">{church.location || 'No location set'}</div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs px-2 py-1 rounded-full bg-blue-50 text-blue-600 font-medium">
                          {profiles.filter((p) => p.church_id === church.id).length} leaders
                        </span>
                        <ChevronRight size={18} className={`text-gray-300 transition-transform ${expandedChurch === church.id ? 'rotate-90' : ''}`} />
                      </div>
                    </button>

                    {editingChurch === church.id ? (
                      <div className="flex items-center gap-2 ml-3">
                        <input value={editName} onChange={(e) => setEditName(e.target.value)} className="px-2 py-1 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                        <input value={editLocation} onChange={(e) => setEditLocation(e.target.value)} className="px-2 py-1 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                        <button onClick={() => saveEditChurch(church.id)} className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-colors"><Check size={16} /></button>
                        <button onClick={() => setEditingChurch(null)} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg transition-colors"><X size={16} /></button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 ml-2">
                        <button onClick={() => { setEditingChurch(church.id); setEditName(church.name); setEditLocation(church.location); }} className="p-2 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"><Edit3 size={16} /></button>
                        <button onClick={() => deleteChurch(church.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={16} /></button>
                      </div>
                    )}
                  </div>

                  {/* Expanded members list */}
                  {expandedChurch === church.id && (
                    <div className="bg-gray-50 px-4 pb-4">
                      <div className="ml-13">
                        {(leadersByChurch[church.id] || []).length > 0 && (
                          <div className="mb-5 pt-3">
                            <h3 className="mb-2 text-sm font-bold text-gray-700">Leaders ({(leadersByChurch[church.id] || []).length})</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {(leadersByChurch[church.id] || []).map((leader) => (
                                <div key={`${leader.role_key}-${leader.person_id}`} className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-3">
                                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-700 to-slate-900 text-sm font-bold text-white">{leader.full_name.charAt(0).toUpperCase()}</div>
                                  <div className="min-w-0">
                                    <div className="truncate text-sm font-semibold text-gray-900">{leader.full_name}</div>
                                    <div className="text-xs font-semibold text-orange-600">{ROLE_LABELS[leader.role_key as UserRole] || leader.role_key}</div>
                                    <div className="mt-0.5 truncate text-xs text-gray-400">{leader.phone || 'No phone'}</div>
                                    <div className="truncate text-xs text-gray-400">{leader.email || 'No email'}</div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        <div className="flex items-center justify-between gap-2 mb-3 pt-3">
                          <div className="flex items-center gap-2">
                            <UserCircle size={16} className="text-orange-500" />
                            <h3 className="text-sm font-bold text-gray-700">Youth Members ({churchMembers(church.id).length})</h3>
                          </div>
                          <button
                            onClick={() => { setAddingMemberFor(addingMemberFor === church.id ? null : church.id); setMemberForm(emptyMemberForm); }}
                            className="flex items-center gap-1.5 text-sm font-semibold text-orange-600 hover:text-orange-700 transition-colors"
                          >
                            {addingMemberFor === church.id ? <><X size={15} /> Cancel</> : <><UserPlus size={15} /> Add member</>}
                          </button>
                        </div>

                        {addingMemberFor === church.id && (
                          <form onSubmit={(e) => addMember(e, church.id)} className="mb-4 rounded-xl border border-orange-100 bg-white p-4 space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <input required value={memberForm.full_name} onChange={(e) => setMemberForm({ ...memberForm, full_name: e.target.value })} placeholder="Full name *" className="px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                              <input required type="email" value={memberForm.email} onChange={(e) => setMemberForm({ ...memberForm, email: e.target.value })} placeholder="Email *" className="px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                              <input value={memberForm.phone} onChange={(e) => setMemberForm({ ...memberForm, phone: e.target.value })} placeholder="Phone" className="px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                              <input type="date" value={memberForm.date_of_birth} onChange={(e) => setMemberForm({ ...memberForm, date_of_birth: e.target.value })} className="px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                            </div>
                            <input value={memberForm.address} onChange={(e) => setMemberForm({ ...memberForm, address: e.target.value })} placeholder="Address" className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                            <button type="submit" disabled={savingMember} className="bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors disabled:opacity-50">{savingMember ? 'Adding...' : 'Add youth member'}</button>
                          </form>
                        )}
                        {churchMembers(church.id).length === 0 ? (
                          <p className="text-sm text-gray-400 text-center py-4 bg-white rounded-lg border border-gray-100">No youth members registered for this church yet.</p>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {churchMembers(church.id).map((m) => (
                              <div key={m.id} className="relative">
                              <button
                                onClick={() => setSelectedMember(m)}
                                className="w-full pr-14 flex items-center gap-3 p-3 rounded-xl bg-white border border-gray-200 hover:border-orange-300 hover:shadow-sm transition-all text-left"
                              >
                                <div className="h-9 w-9 rounded-full bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center text-sm font-bold text-white">
                                  {m.full_name.charAt(0).toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium text-gray-900 text-sm truncate">{m.full_name}</div>
                                  <div className="text-xs text-gray-400 truncate">{m.phone || m.email || 'No contact info'}</div>
                                </div>
                                <ChevronRight size={16} className="text-gray-300 flex-shrink-0" />
                              </button>
                              <button
                                onClick={() => deleteMember(m)}
                                aria-label={`Delete ${m.full_name}`}
                                className="absolute right-9 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              >
                                <Trash2 size={15} />
                              </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Users View */}
      {view === 'users' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="p-5 border-b border-gray-100">
            <h2 className="font-bold text-gray-900">All Users</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Church</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Role</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {profiles.length === 0 ? (
                  <tr><td colSpan={4} className="px-5 py-8 text-center text-sm text-gray-400">No users registered yet.</td></tr>
                ) : (
                  profiles.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3 text-sm font-medium text-gray-900">{p.full_name}</td>
                      <td className="px-5 py-3 text-sm text-gray-600">{churchName(p.church_id)}</td>
                      <td className="px-5 py-3">
                        {editingProfile === p.id ? (
                          <select value={editRole} onChange={(e) => setEditRole(e.target.value as UserRole)} className="text-sm px-2 py-1 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-orange-500">
                            {Object.entries(ROLE_LABELS).map(([val, label]) => (
                              <option key={val} value={val}>{label}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-orange-50 text-orange-700">{ROLE_LABELS[p.role]}</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {editingProfile === p.id ? (
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={() => saveProfileRole(p.id)} className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-colors"><Check size={16} /></button>
                            <button onClick={() => setEditingProfile(null)} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg transition-colors"><X size={16} /></button>
                          </div>
                        ) : (
                          <button onClick={() => { setEditingProfile(p.id); setEditRole(p.role); }} className="p-1.5 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"><Edit3 size={16} /></button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Circulars View */}
      {view === 'circulars' && <CircularsSection />}

      {view === 'events' && <EventsManagementSection role="super_admin" churchId={null} churches={churches} />}

      {view === 'funds' && <ChurchFundsSection churchId={null} isSuperAdmin churches={churches} />}

      {/* Requests sent to the Super Admin role */}
      {view === 'requests' && <InformationRequestsSection mode="both" />}
      {view === 'manual' && <ManualAttendance />}
      {view === 'worshipAll' && <MessageWorshipAllChurches />}
      {view === 'minutes' && <MinuteBook />}
      {view === 'leadersPage' && <PublicLeadersAdmin />}
      {view === 'downloads' && <div className="space-y-6"><ExportAccessAdmin /><MemberExport mode="choose" churches={churches} /></div>}

      {/* Member detail drawer */}
      {selectedMember && (
        <MemberDetailDrawer
          member={selectedMember}
          onClose={() => setSelectedMember(null)}
          onUpdated={() => {
            if (expandedChurch) fetchMembersForChurch(expandedChurch);
          }}
        />
      )}
    </DashboardShell>
  );
}