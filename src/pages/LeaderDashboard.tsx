import { useState, useEffect, useCallback } from 'react';
import { Users, FileText, Building2, ChevronRight, Folder, FolderOpen, UserCircle, Calendar, CalendarPlus, KeyRound, Send, BookOpen, Download, Mic, ClipboardList } from 'lucide-react';
import { DashboardShell } from '@/components/DashboardShell';
import { StatCard } from '@/components/ui';
import { CircularsSection } from '@/components/CircularsSection';
import { MemberDetailDrawer } from '@/components/MemberDetailDrawer';
import { LeadershipProfilesSection } from '@/components/LeadershipProfilesSection';
import { ChurchFundsSection } from '@/components/ChurchFundsSection';
import { InformationRequestsSection } from '@/components/InformationRequestsSection';
import { MemberDirectory } from '@/components/MemberDirectory';
import { MyChurchEvents } from '@/components/MyChurchEvents';
import { MinuteBook } from '@/components/MinuteBook';
import { MemberExport } from '@/components/MemberExport';
import { ChurchAttendanceLog } from '@/components/ChurchAttendanceLog';
import { MessageWorshipSpin } from '@/components/MessageWorshipSpin';
import { MessageWorshipBoard } from '@/components/MessageWorshipBoard';
import { PastorateEventsSection } from '@/components/PastorateEventsSection';
import { useUnreadCounts } from '@/hooks/useUnreadCounts';
import { CountBadge } from '@/components/CountBadge';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { Church, YouthEvent, YouthMember } from '@/types';
import { ROLE_LABELS } from '@/types';

interface LeaderDashboardProps {
  scope: 'pastorate' | 'local';
}

export function LeaderDashboard({ scope }: LeaderDashboardProps) {
  const { profile } = useAuth();
  const churchId = profile?.church_id;
  const [churches, setChurches] = useState<Church[]>([]);
  const [membersByChurch, setMembersByChurch] = useState<Record<string, YouthMember[]>>({});
  const [attendanceCount, setAttendanceCount] = useState(0);
  const [memberTotal, setMemberTotal] = useState(0);
  type LeaderRow = { person_id: string; full_name: string; role_key: string; phone: string | null; email: string | null; is_leader: boolean };
  const [leadersByChurch, setLeadersByChurch] = useState<Record<string, LeaderRow[]>>({});
  const [expandedChurch, setExpandedChurch] = useState<string | null>(null);
  const [selectedMember, setSelectedMember] = useState<YouthMember | null>(null);
  const [view, setView] = useState<'overview' | 'members' | 'profiles' | 'funds' | 'events' | 'requests' | 'my_events' | 'minutes' | 'downloads' | 'attendance' | 'spin' | 'worship'>('overview');
  const [events, setEvents] = useState<YouthEvent[]>([]);
  const [eventForm, setEventForm] = useState({ title: '', description: '', venue: '', eventDate: '', startTime: '', endTime: '', scope: scope === 'pastorate' ? 'pastorate' : 'local' as 'local' | 'pastorate' });
  const [eventOtp, setEventOtp] = useState<Record<string, string>>({});
  const [eventMessage, setEventMessage] = useState<string | null>(null);

  const unread = useUnreadCounts(view === 'requests' ? 'requests' : view === 'members' ? 'circulars' : null);

  // Pastorate-level sees all churches; local sees only their church
  const isPastorate = scope === 'pastorate';
  // Convener and Pastorate Treasurer belong to a church, and attend its events
  const canAttendLocalEvents = profile?.role === 'pastorate_convenor' || profile?.role === 'pastorate_youth_treasurer' || profile?.role === 'local_youth_treasurer';
  // Treasurers download the member list; the Local Youth Treasurer also reads and verifies the minute book
  const canDownloadLists = profile?.role === 'local_youth_treasurer' || profile?.role === 'pastorate_youth_treasurer';
  // Attendance logs (Excel / PDF) for the convener and both treasurers; the wheel is for the Local Youth Treasurer
  const canViewAttendanceLog = profile?.role === 'pastorate_convenor' || profile?.role === 'pastorate_youth_treasurer' || profile?.role === 'local_youth_treasurer';
  const canSpin = profile?.role === 'local_youth_treasurer';
  const canUseMinutes = profile?.role === 'local_youth_treasurer';
  const canSendRequests = profile?.role === 'local_youth_treasurer';
  const canReceiveRequests = profile?.role === 'pastorate_youth_treasurer' || profile?.role === 'pastorate_convenor';
  // Only the Pastorate Convener adds pastorate events
  const canManageEvents = profile?.role === 'pastorate_convenor';

  const fetchData = useCallback(async () => {
    if (isPastorate) {
      const { data: churchData } = await supabase.from('churches').select('id, name, location, created_at').order('name');
      if (churchData) setChurches(churchData as Church[]);
      const { data: attData } = await supabase.from('attendance').select('id');
      const { count: allMembers } = await supabase.from('youth_members').select('id', { count: 'exact', head: true }).eq('is_leader', false);
      setMemberTotal(allMembers || 0);
      setAttendanceCount(attData?.length || 0);
      const { data: eventData } = await supabase.from('youth_events').select('id, title, description, venue, event_date, start_time, end_time, scope, church_id, created_by, created_at').order('event_date');
      setEvents((eventData as YouthEvent[]) || []);
    } else if (churchId) {
      const { data: churchData } = await supabase.from('churches').select('id, name, location, created_at').eq('id', churchId).single();
      if (churchData) setChurches([churchData as Church]);
      const { data: attData } = await supabase.from('attendance').select('id').eq('church_id', churchId);
      setAttendanceCount(attData?.length || 0);
      const { count: ownMembers } = await supabase.from('youth_members').select('id', { count: 'exact', head: true }).eq('church_id', churchId).eq('is_leader', false);
      setMemberTotal(ownMembers || 0);
      const { data: eventData } = await supabase.from('youth_events').select('id, title, description, venue, event_date, start_time, end_time, scope, church_id, created_by, created_at').eq('church_id', churchId).order('event_date');
      setEvents((eventData as YouthEvent[]) || []);
    }
  }, [isPastorate, churchId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const fetchMembersForChurch = async (id: string) => {
    const { data } = await supabase.from('youth_members').select('id, church_id, full_name, phone, email, date_of_birth, address, created_at').eq('church_id', id).eq('is_leader', false).order('full_name');
    setMembersByChurch((prev) => ({ ...prev, [id]: (data as YouthMember[]) || [] }));
  };

  // The church's admins, pastorate members and PC members (shown above the youth members)
  const fetchLeadersForChurch = async (id: string) => {
    const { data } = await supabase.rpc('church_people', { target_church: id });
    setLeadersByChurch((prev) => ({ ...prev, [id]: ((data as LeaderRow[]) || []).filter((row) => row.is_leader) }));
  };

  const toggleChurch = (id: string) => {
    if (expandedChurch === id) {
      setExpandedChurch(null);
    } else {
      setExpandedChurch(id);
      fetchMembersForChurch(id);
      fetchLeadersForChurch(id);
    }
  };

  const churchMembers = (id: string) => membersByChurch[id] || [];

  const createEvent = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!profile?.id || !profile.church_id || !eventForm.title || !eventForm.eventDate) return;
    const { data, error } = await supabase.from('youth_events').insert({ title: eventForm.title, description: eventForm.description, venue: eventForm.venue, event_date: eventForm.eventDate, start_time: eventForm.startTime || null, end_time: eventForm.endTime || null, scope: eventForm.scope, church_id: eventForm.scope === 'local' ? profile.church_id : null, created_by: profile.id }).select('id, title, description, venue, event_date, start_time, end_time, scope, church_id, created_by, created_at').single();
    if (error || !data) { setEventMessage('Could not create this event.'); return; }
    setEvents((current) => [...current, data as YouthEvent].sort((a, b) => a.event_date.localeCompare(b.event_date)));
    setEventForm({ title: '', description: '', venue: '', eventDate: '', startTime: '', endTime: '', scope: isPastorate ? 'pastorate' : 'local' });
    setEventMessage('Event created. Generate an OTP and share it with members at the event.');
  };

  const generateEventOtp = async (eventId: string) => {
    if (!profile?.id || !profile.church_id) return;
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const { error } = await supabase.from('otp_sessions').insert({ church_id: profile.church_id, event_id: eventId, type: 'attendance', otp_code: code, generated_by: profile.id, expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString() });
    if (error) setEventMessage('Could not generate an OTP for this event.');
    else { setEventOtp((current) => ({ ...current, [eventId]: code })); setEventMessage('Share this active OTP with members attending the event.'); }
  };
  const totalMembers = Object.values(membersByChurch).reduce((sum, arr) => sum + arr.length, 0);

  return (
    <DashboardShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{ROLE_LABELS[profile!.role]} Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">
          {isPastorate ? 'Oversee members and circulars across the pastorate' : 'Manage members and circulars for your church'}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <StatCard icon={<Building2 size={22} className="text-white" />} label="Churches" value={churches.length} color="bg-gradient-to-br from-orange-500 to-red-600" />
        <StatCard icon={<Users size={22} className="text-white" />} label="Youth Members" value={memberTotal || totalMembers} color="bg-gradient-to-br from-blue-500 to-blue-700" />
        <StatCard icon={<Calendar size={22} className="text-white" />} label="Attendance Records" value={attendanceCount} color="bg-gradient-to-br from-emerald-500 to-emerald-700" />
      </div>

      {/* Tab navigation */}
      <div className="w-full max-w-full overflow-x-auto mb-6">
        <div className="flex gap-1 bg-white rounded-xl border border-gray-200 p-1.5 shadow-sm w-max min-w-full">
        <button
          onClick={() => setView('overview')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${view === 'overview' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'}`}
        >
          <Folder size={16} /> Members
        </button>
        <button
          onClick={() => setView('members')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${view === 'members' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'}`}
        >
          <FileText size={16} /> Circulars <CountBadge count={unread.circulars} />
        </button>
        <button
          onClick={() => setView('profiles')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${view === 'profiles' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'}`}
        >
          <Users size={16} /> Profiles
        </button>
        {canManageEvents && <button
          onClick={() => setView('events')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${view === 'events' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'}`}
        >
          <CalendarPlus size={16} /> Events
        </button>}
        <button
          onClick={() => setView('funds')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${view === 'funds' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'}`}
        >
          <Building2 size={16} /> Funds
        </button>
        {canAttendLocalEvents && <button
          onClick={() => setView('my_events')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${view === 'my_events' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'}`}
        >
          <Calendar size={16} /> My Church Events
        </button>}
        {canViewAttendanceLog && <button
          onClick={() => setView('attendance')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${view === 'attendance' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'}`}
        >
          <ClipboardList size={16} /> Attendance Log
        </button>}
        {canSpin && <button
          onClick={() => setView('spin')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${view === 'spin' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'}`}
        >
          <Mic size={16} /> Spin Wheel
        </button>}
        {canSpin && <button
          onClick={() => setView('worship')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${view === 'worship' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'}`}
        >
          <Mic size={16} /> Message &amp; Worship
        </button>}
        {canUseMinutes && <button
          onClick={() => setView('minutes')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${view === 'minutes' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'}`}
        >
          <BookOpen size={16} /> Minute Book
        </button>}
        {canDownloadLists && <button
          onClick={() => setView('downloads')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${view === 'downloads' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'}`}
        >
          <Download size={16} /> Download List
        </button>}
        {(canSendRequests || canReceiveRequests) && <button
          onClick={() => setView('requests')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${view === 'requests' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'}`}
        >
          <Send size={16} /> Requests <CountBadge count={unread.requests} />
        </button>}
        </div>
      </div>

      {view === 'overview' && isPastorate && <MemberDirectory churches={churches} />}

      {view === 'overview' && !isPastorate && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="p-5 border-b border-gray-100">
            <h2 className="font-bold text-gray-900 flex items-center gap-2"><Folder size={18} className="text-orange-600" /> Church Members</h2>
            <p className="text-sm text-gray-500 mt-1">Click a church folder to view its youth members</p>
          </div>
          {churches.length === 0 ? (
            <p className="p-5 text-sm text-gray-400 text-center">No churches available.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {churches.map((church) => (
                <div key={church.id}>
                  <button
                    onClick={() => toggleChurch(church.id)}
                    className="w-full p-4 flex items-center gap-3 hover:bg-gray-50 transition-colors text-left"
                  >
                    <div className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${expandedChurch === church.id ? 'bg-orange-100' : 'bg-gray-100'}`}>
                      {expandedChurch === church.id ? <FolderOpen size={20} className="text-orange-600" /> : <Folder size={20} className="text-gray-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-900">{church.name}</div>
                      <div className="text-sm text-gray-500">{church.location || 'No location set'}</div>
                    </div>
                    <span className="text-xs px-2 py-1 rounded-full bg-blue-50 text-blue-600 font-medium">
                      {churchMembers(church.id).length} members
                    </span>
                    <ChevronRight size={18} className={`text-gray-300 transition-transform ${expandedChurch === church.id ? 'rotate-90' : ''}`} />
                  </button>

                  {expandedChurch === church.id && (
                    <div className="bg-gray-50 px-4 pb-4">
                      {(leadersByChurch[church.id] || []).length > 0 && (
                        <div className="mb-5 pt-3">
                          <h3 className="mb-2 text-sm font-bold text-gray-700">Leaders ({(leadersByChurch[church.id] || []).length})</h3>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {(leadersByChurch[church.id] || []).map((leader) => (
                              <div key={`${leader.role_key}-${leader.person_id}`} className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-3">
                                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-700 to-slate-900 text-sm font-bold text-white">{leader.full_name.charAt(0).toUpperCase()}</div>
                                <div className="min-w-0">
                                  <div className="truncate text-sm font-semibold text-gray-900">{leader.full_name}</div>
                                  <div className="text-xs font-semibold text-orange-600">{ROLE_LABELS[leader.role_key as keyof typeof ROLE_LABELS] || leader.role_key}</div>
                                  <div className="mt-0.5 truncate text-xs text-gray-400">{leader.phone || leader.email || 'No contact info'}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="flex items-center gap-2 mb-3 pt-3">
                        <UserCircle size={16} className="text-orange-500" />
                        <h3 className="text-sm font-bold text-gray-700">Youth Members ({churchMembers(church.id).length})</h3>
                      </div>
                      {churchMembers(church.id).length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-4 bg-white rounded-lg border border-gray-100">No youth members registered.</p>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {churchMembers(church.id).map((m) => (
                            <button
                              key={m.id}
                              onClick={() => setSelectedMember(m)}
                              className="flex items-center gap-3 p-3 rounded-xl bg-white border border-gray-200 hover:border-orange-300 hover:shadow-sm transition-all text-left"
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
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {view === 'events' && canManageEvents && <PastorateEventsSection />}
      {view === 'requests' && (canSendRequests || canReceiveRequests) && <InformationRequestsSection mode="both" />}
      {view === 'my_events' && canAttendLocalEvents && <MyChurchEvents />}
      {view === 'minutes' && canUseMinutes && <MinuteBook />}
      {view === 'attendance' && canViewAttendanceLog && <ChurchAttendanceLog churches={churches} />}
      {view === 'spin' && canSpin && <MessageWorshipSpin />}
      {view === 'worship' && canSpin && <MessageWorshipBoard />}
      {view === 'downloads' && canDownloadLists && <MemberExport mode={isPastorate ? 'choose' : 'own'} churches={churches} />}
      {view === 'members' && <CircularsSection />}
      {view === 'profiles' && <LeadershipProfilesSection churchId={churchId} />}
      {view === 'funds' && <ChurchFundsSection churchId={churchId ?? null} churches={churches} canEdit={profile?.role === 'local_youth_treasurer'} canManageAccess={profile?.role === 'local_youth_treasurer' || profile?.role === 'pastorate_youth_treasurer'} />}

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