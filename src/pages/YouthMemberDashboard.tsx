import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, CalendarDays, Camera, CheckCircle2, Clock3, FileText, KeyRound, LogOut, Menu, BookOpen, Mic, Paperclip, Pencil, ShieldCheck, UserRound, Users, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { NotificationToggle } from '@/components/NotificationToggle';
import { disablePush } from '@/lib/push';
import { ROLE_LABELS } from '@/types';
import { supabase } from '@/lib/supabase';
import { Alert } from '@/components/ui';
import { EventStatusModal } from '@/components/EventStatusModal';
import { Logo } from '@/components/Logo';
import { YouthChurchMembers } from '@/components/YouthChurchMembers';
import { MinuteBook } from '@/components/MinuteBook';
import { MessageWorshipBoard } from '@/components/MessageWorshipBoard';
import type { AttendanceRecord, Circular, CircularRead, YouthEvent } from '@/types';

type YouthPage = 'events' | 'attendance' | 'members' | 'minutes' | 'worship' | 'profile' | 'circulars';

const attendanceFields = 'id, otp_session_id, event_id, youth_member_id, church_id, marked_by, attendance_date, created_at, status, feedback_submitted, approved_by, approved_at, in_otp_session_id, out_otp_session_id, in_status, out_status';

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(value: string | null) {
  if (!value) return '';
  const [hour, minute] = value.split(':').map(Number);
  return new Date(2000, 0, 1, hour, minute).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// Local date (YYYY-MM-DD) instead of UTC, so events flip to "past" at local midnight.
function todayLocal() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

export function YouthMemberDashboard() {
  const { profile, session, signOut, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [page, setPage] = useState<YouthPage>('events');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [events, setEvents] = useState<YouthEvent[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [circulars, setCirculars] = useState<Circular[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [selectedEvent, setSelectedEvent] = useState<YouthEvent | null>(null);
  const [statusEvent, setStatusEvent] = useState<YouthEvent | null>(null);
  const [selectedCircular, setSelectedCircular] = useState<Circular | null>(null);
  const [circularFiles, setCircularFiles] = useState<{ id: string; file_name: string; file_path: string }[]>([]);

  // Files attached to the circular that is open
  useEffect(() => {
    if (!selectedCircular) { setCircularFiles([]); return; }
    supabase.from('circular_attachments').select('id, file_name, file_path').eq('circular_id', selectedCircular.id).then(({ data }) => setCircularFiles(data || []));
  }, [selectedCircular]);

  const openCircularFile = async (path: string) => {
    const { data } = await supabase.storage.from('circular-attachments').createSignedUrl(path, 120);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener');
  };
  const [profileData, setProfileData] = useState({ memberId: '', fullName: '', phone: '', dateOfBirth: '', avatarPath: '', avatarUrl: '' });
  const [nameInput, setNameInput] = useState('');
  const [otpInput, setOtpInput] = useState('');
  const [otpDirection, setOtpDirection] = useState<'attendance_in' | 'attendance_out'>('attendance_in');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadEvents = useCallback(async () => {
    const { data, error: queryError } = await supabase.from('youth_events').select('id, title, description, venue, event_date, start_time, end_time, scope, church_id, created_by, created_at').order('event_date', { ascending: true });
    if (queryError) setError('Could not load events right now.');
    else setEvents((data as YouthEvent[]) || []);
  }, []);

  const loadAttendance = useCallback(async () => {
    if (!profile?.church_id || !profileData.memberId) return;
    const { data, error: queryError } = await supabase.from('attendance').select(attendanceFields).eq('youth_member_id', profileData.memberId).order('attendance_date', { ascending: false });
    if (queryError) setError('Could not load your attendance right now.');
    else setAttendance((data as AttendanceRecord[]) || []);
  }, [profile?.church_id, profileData.memberId]);

  const loadCirculars = useCallback(async () => {
    if (!profile?.church_id || !profile.id) return;
    const [{ data: circularData }, { data: readData }] = await Promise.all([
      supabase.from('circulars').select('id, church_id, title, body, created_by, created_by_role, target_audience, created_at').or(`church_id.is.null,church_id.eq.${profile.church_id}`).order('created_at', { ascending: false }),
      supabase.from('circular_reads').select('id, circular_id, read_by, read_at').eq('read_by', profile.id),
    ]);
    setCirculars((circularData as Circular[]) || []);
    setReadIds(new Set(((readData as CircularRead[]) || []).map((item) => item.circular_id)));
  }, [profile]);

  // Links the logged-in user to a youth_members row automatically, using the church chosen at signup.
  const ensureMemberLink = useCallback(async (): Promise<string> => {
    if (!profile?.id || !profile.church_id) return '';
    const email = session?.user?.email?.toLowerCase() || '';

    // 1. Already linked?
    const { data: link } = await supabase
      .from('youth_member_profiles')
      .select('youth_member_id')
      .eq('id', profile.id)
      .maybeSingle();
    if (link?.youth_member_id) return link.youth_member_id;

    // 2. Existing youth member in the same church with this email?
    let memberId = '';
    if (email) {
      // limit(1): if copies of this member ever exist, take the oldest one instead of creating yet another
      const { data: existingRows } = await supabase
        .from('youth_members')
        .select('id')
        .eq('church_id', profile.church_id)
        .ilike('email', email)
        .order('created_at', { ascending: true })
        .limit(1);
      memberId = existingRows?.[0]?.id || '';
    }

    // 3. Otherwise create one for the church they selected at signup
    if (!memberId) {
      const { data: created, error: createError } = await supabase
        .from('youth_members')
        .insert({
          church_id: profile.church_id,
          full_name: profile.full_name,
          email,
          date_of_birth: profile.date_of_birth || null,
        })
        .select('id')
        .single();
      if (createError || !created) {
        // Another tab may have just created it: look once more before giving up
        const { data: again } = await supabase.from('youth_members').select('id').eq('church_id', profile.church_id).ilike('email', email).order('created_at', { ascending: true }).limit(1);
        return again?.[0]?.id || '';
      }
      memberId = created.id;
    }

    // 4. Save the link on the member's profile
    await supabase
      .from('youth_member_profiles')
      .upsert({ id: profile.id, full_name: profile.full_name, youth_member_id: memberId }, { onConflict: 'id' });

    return memberId;
  }, [profile, session?.user?.email]);

  const loadProfileData = useCallback(async () => {
    if (!profile?.id) return;
    const { data } = await supabase.from('youth_member_profiles').select('youth_member_id, full_name, phone, date_of_birth, avatar_url').eq('id', profile.id).maybeSingle();
    let memberId = data?.youth_member_id || '';
    if (!memberId) memberId = await ensureMemberLink();
    let avatarUrl = '';
    if (data?.avatar_url) {
      const { data: signed } = await supabase.storage.from('profile-photos').createSignedUrl(data.avatar_url, 3600);
      avatarUrl = signed?.signedUrl || '';
    }
    const next = { memberId, fullName: data?.full_name || profile.full_name, phone: data?.phone || '', dateOfBirth: data?.date_of_birth || profile.date_of_birth || '', avatarPath: data?.avatar_url || '', avatarUrl };
    setProfileData(next);
    setNameInput(next.fullName);
  }, [profile, session?.user?.email, ensureMemberLink]);

  useEffect(() => {
    loadEvents();
    loadAttendance();
    loadCirculars();
    loadProfileData();
  }, [loadEvents, loadAttendance, loadCirculars, loadProfileData]);

  const upcomingEvents = useMemo(() => events.filter((event) => event.event_date >= todayLocal()), [events]);
  const pastEvents = useMemo(() => events.filter((event) => event.event_date < todayLocal()), [events]);
  const unreadCount = circulars.filter((item) => !readIds.has(item.id)).length;

  // Attendance state for the event currently open in the modal
  const selectedAttendance = useMemo(
    () => (selectedEvent ? attendance.find((record) => record.event_id === selectedEvent.id) : undefined),
    [attendance, selectedEvent],
  );
  const inApproved = selectedAttendance?.in_status === 'approved';
  const outApproved = selectedAttendance?.out_status === 'approved';
  const feedbackDone = Boolean(selectedAttendance?.feedback_submitted);
  const availableDirections = useMemo(
    () => (['attendance_in', 'attendance_out'] as const).filter((d) => (d === 'attendance_in' ? !inApproved && !feedbackDone : !outApproved)),
    [inApproved, outApproved, feedbackDone],
  );

  // Keep the selected tab on a direction that is still open
  useEffect(() => {
    if (availableDirections.length > 0 && !availableDirections.includes(otpDirection)) setOtpDirection(availableDirections[0]);
  }, [availableDirections, otpDirection]);

  const showMessage = (message: string, kind: 'error' | 'success') => {
    if (kind === 'error') setError(message);
    else setSuccess(message);
    window.setTimeout(() => kind === 'error' ? setError(null) : setSuccess(null), 4500);
  };

  const verifyEventOtp = async (event: YouthEvent) => {
    if (!profile?.church_id || !profile.id) { showMessage('Your account is not fully set up. Please sign out and sign in again.', 'error'); return; }
    if (otpInput.trim().length !== 6) { showMessage('Please enter the 6-digit OTP code.', 'error'); return; }
    setSaving(true);
    setError(null);

    // Self-healing: link the member automatically if not linked yet.
    const memberId = profileData.memberId || await ensureMemberLink();
    if (!memberId) {
      showMessage('We could not set up your member profile. Please sign out, sign in again, and retry.', 'error');
      setSaving(false);
      return;
    }
    if (!profileData.memberId) await loadProfileData();

    const { data: otp, error: otpError } = await supabase.from('otp_sessions').select('id, church_id, event_id, type, expires_at, is_used, is_active').eq('event_id', event.id).eq('type', otpDirection).eq('otp_code', otpInput.trim()).eq('is_active', true).eq('is_used', false).maybeSingle();
    if (otpError || !otp) {
      showMessage('That OTP is not valid for this event. Please ask the correct youth secretary for the active code.', 'error');
      setSaving(false);
      return;
    }
    if (new Date(otp.expires_at) < new Date()) {
      showMessage('This OTP has expired. Ask the youth secretary for a new code.', 'error');
      setSaving(false);
      return;
    }
    const { data: existing } = await supabase.from('attendance').select(attendanceFields).eq('event_id', event.id).eq('youth_member_id', memberId).maybeSingle();
    const attendancePatch = otpDirection === 'attendance_in' ? { otp_session_id: otp.id, in_otp_session_id: otp.id, in_status: 'pending' } : { otp_session_id: otp.id, out_otp_session_id: otp.id, out_status: 'pending' };
    const insertOrUpdate = existing
      ? await supabase.from('attendance').update(attendancePatch).eq('id', existing.id)
      : await supabase.from('attendance').insert({ ...attendancePatch, event_id: event.id, youth_member_id: memberId, church_id: profile.church_id, marked_by: profile.id, status: 'pending', feedback_submitted: false });
    const insertError = insertOrUpdate.error;
    if (insertError) {
      showMessage('Could not record attendance. Please try again.', 'error');
    } else {
      setSelectedEvent(null);
      setOtpInput('');
      setPage('attendance');
      await loadAttendance();
      showMessage(`${otpDirection === 'attendance_in' ? 'IN' : 'OUT'} OTP accepted. Awaiting secretary approval.`, 'success');
    }
    setSaving(false);
  };

  const saveName = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!profile?.id || !nameInput.trim()) return;
    setSaving(true);
    const [{ error: memberError }, { error: profileError }] = await Promise.all([
      supabase.from('youth_member_profiles').update({ full_name: nameInput.trim() }).eq('id', profile.id),
      supabase.from('profiles').update({ full_name: nameInput.trim() }).eq('id', profile.id),
    ]);
    if (memberError || profileError) showMessage('Could not save your name. Please try again.', 'error');
    else {
      await refreshProfile();
      await loadProfileData();
      showMessage('Your name has been updated.', 'success');
    }
    setSaving(false);
  };

  const uploadPhoto = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !profile?.id) return;
    if (!file.type.startsWith('image/') || file.size > 4 * 1024 * 1024) {
      showMessage('Choose an image smaller than 4 MB.', 'error');
      return;
    }
    setSaving(true);
    const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `${profile.id}/avatar.${extension}`;
    const { error: uploadError } = await supabase.storage.from('profile-photos').upload(path, file, { upsert: true, contentType: file.type });
    if (uploadError) showMessage('Could not upload that photo. Please try again.', 'error');
    else {
      const { error: updateError } = await supabase.from('youth_member_profiles').update({ avatar_url: path }).eq('id', profile.id);
      if (updateError) showMessage('Photo uploaded, but could not save it to your profile.', 'error');
      else {
        await loadProfileData();
        showMessage('Your profile photo has been updated.', 'success');
      }
    }
    setSaving(false);
  };

  const markCircularRead = async (circular: Circular) => {
    if (!profile?.id || readIds.has(circular.id)) return;
    const { error: readError } = await supabase.from('circular_reads').insert({ circular_id: circular.id, read_by: profile.id });
    if (!readError) setReadIds((current) => new Set(current).add(circular.id));
  };

  const signOutAndLeave = async () => {
    await disablePush().catch(() => undefined);
    await signOut();
    navigate('/login/youth');
  };

  const navItems: { key: YouthPage; label: string; icon: React.ReactNode; badge?: number }[] = [
    { key: 'events', label: 'Events', icon: <CalendarDays size={18} /> },
    { key: 'attendance', label: 'Attendance', icon: <KeyRound size={18} /> },
    { key: 'members', label: 'Members', icon: <Users size={18} /> },
    { key: 'minutes', label: 'Minute Book', icon: <BookOpen size={18} /> },
    { key: 'worship', label: 'Message & Worship', icon: <Mic size={18} /> },
    { key: 'profile', label: 'My Profile', icon: <UserRound size={18} /> },
    { key: 'circulars', label: 'Circulars', icon: <FileText size={18} />, badge: unreadCount },
  ];

  return (
    <div className="min-h-screen bg-[#f7f8fa] text-slate-900 flex">
      <aside className={`fixed inset-y-0 left-0 z-40 w-72 bg-slate-950 text-white transform transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-6 border-b border-white/10"><Logo size="sm" /><p className="mt-5 text-xs uppercase tracking-[0.18em] text-slate-400">Member portal</p><p className="mt-2 text-sm text-slate-300 truncate">{profile?.full_name}</p></div>
        <nav className="p-4 space-y-1">
          {navItems.map((item) => <button key={item.key} onClick={() => { setPage(item.key); setSidebarOpen(false); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-colors ${page === item.key ? 'bg-orange-500 text-white' : 'text-slate-300 hover:bg-white/10 hover:text-white'}`}>{item.icon}<span>{item.label}</span>{item.badge ? <span className="ml-auto min-w-5 h-5 px-1 rounded-full bg-red-500 text-xs flex items-center justify-center">{item.badge}</span> : null}</button>)}
          <button onClick={() => { setSidebarOpen(false); navigate('/notifications'); }} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-colors text-slate-300 hover:bg-white/10 hover:text-white"><Bell size={18} /><span>Notification settings</span></button>
          <NotificationToggle />
        </nav>
        <button onClick={signOutAndLeave} className="absolute bottom-5 left-4 right-4 flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold text-slate-300 hover:bg-white/10 hover:text-white"><LogOut size={18} /> Sign out</button>
      </aside>

      {sidebarOpen && <div className="fixed inset-0 z-30 bg-slate-950/50 lg:hidden" onClick={() => setSidebarOpen(false)} />}
      <main className="flex-1 lg:ml-72">
        <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-slate-200"><div className="h-20 px-5 sm:px-8 flex items-center justify-between"><button className="p-2 rounded-lg hover:bg-slate-100" onClick={() => setSidebarOpen(true)} aria-label="Open menu"><Menu size={22} /></button><div className="hidden lg:block"><p className="text-xs uppercase tracking-[0.18em] text-orange-600 font-bold">Fuego Youth Fellowship</p><h1 className="text-xl font-bold mt-1">{navItems.find((item) => item.key === page)?.label}</h1></div><div className="flex flex-row-reverse items-center gap-3"><div className="h-10 w-10 shrink-0 rounded-full overflow-hidden bg-orange-100 flex items-center justify-center text-orange-700 font-bold">{profileData.avatarUrl ? <img src={profileData.avatarUrl} alt="" className="h-full w-full object-cover" /> : profile?.full_name?.charAt(0).toUpperCase()}</div><div className="min-w-0 text-right"><p className="truncate max-w-[7.5rem] sm:max-w-[14rem] text-sm font-semibold text-slate-700">{profile?.full_name}</p><p className="text-xs font-medium text-orange-600">{profile ? ROLE_LABELS[profile.role] : 'Youth Member'}</p></div></div></div></header>
        <div className="max-w-6xl mx-auto p-5 sm:p-8">
          {error && <div className="mb-5"><Alert type="error" message={error} /></div>}
          {success && <div className="mb-5"><Alert type="success" message={success} /></div>}

          {page === 'events' && <section>
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-7"><div><p className="text-sm text-slate-500">Stay connected with what is happening across your fellowship.</p><h2 className="text-3xl font-extrabold tracking-tight mt-1">Upcoming events</h2></div><div className="text-sm text-slate-500">{upcomingEvents.length} upcoming</div></div>
            {upcomingEvents.length === 0 ? <EmptyState icon={<CalendarDays size={28} />} title="No upcoming events" text="Your youth secretaries will publish new events here." /> : <div className="grid grid-cols-1 md:grid-cols-2 gap-5">{upcomingEvents.map((event) => <EventCard key={event.id} event={event} onOpen={() => { setSelectedEvent(event); setOtpInput(''); }} />)}</div>}
            {pastEvents.length > 0 && <div className="mt-12"><h3 className="text-lg font-bold mb-4">Past events</h3><div className="grid grid-cols-1 md:grid-cols-2 gap-5">{pastEvents.map((event) => <EventCard key={event.id} event={event} onOpen={() => setSelectedEvent(event)} past />)}</div></div>}
          </section>}

          {page === 'attendance' && <AttendancePage records={attendance} events={events} />}

          {page === 'members' && <YouthChurchMembers />}

          {page === 'minutes' && <MinuteBook />}

          {page === 'worship' && <MessageWorshipBoard />}

          {page === 'profile' && <section className="max-w-3xl"><div className="mb-7"><p className="text-sm text-slate-500">Keep your member details up to date.</p><h2 className="text-3xl font-extrabold tracking-tight mt-1">My profile</h2></div><div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm"><div className="flex flex-col sm:flex-row items-start gap-6 pb-7 border-b border-slate-100"><div className="relative"><div className="h-28 w-28 rounded-3xl overflow-hidden bg-orange-100 flex items-center justify-center text-4xl font-extrabold text-orange-700">{profileData.avatarUrl ? <img src={profileData.avatarUrl} alt="Profile" className="h-full w-full object-cover" /> : profileData.fullName.charAt(0).toUpperCase()}</div><label className="absolute -right-2 -bottom-2 h-10 w-10 rounded-xl bg-orange-500 text-white flex items-center justify-center cursor-pointer hover:bg-orange-600 transition-colors shadow-lg"><Camera size={18} /><input type="file" accept="image/*" className="hidden" onChange={uploadPhoto} /></label></div><div><p className="text-xl font-bold">{profileData.fullName}</p><p className="text-sm text-slate-500 mt-1">Youth member</p><p className="text-xs text-slate-400 mt-3 flex items-center gap-1"><ShieldCheck size={14} /> Your account details are protected</p></div></div><form onSubmit={saveName} className="py-7 border-b border-slate-100"><div className="flex items-center justify-between mb-4"><div><h3 className="font-bold">Name</h3><p className="text-xs text-slate-500 mt-1">This is the only personal detail you can edit.</p></div><Pencil size={16} className="text-orange-500" /></div><div className="flex flex-col sm:flex-row gap-3"><input value={nameInput} onChange={(event) => setNameInput(event.target.value)} className="flex-1 px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-500" /><button disabled={saving} className="px-5 py-3 rounded-xl bg-slate-950 text-white font-semibold hover:bg-slate-800 disabled:opacity-50">Save name</button></div></form><div className="pt-7 grid sm:grid-cols-2 gap-5"><ReadOnlyField label="Email address" value={session?.user.email || 'Not available'} /><ReadOnlyField label="Phone number" value={profileData.phone || 'Not provided'} /><ReadOnlyField label="Date of birth" value={profileData.dateOfBirth ? new Date(`${profileData.dateOfBirth}T00:00:00`).toLocaleDateString() : 'Not available'} /><ReadOnlyField label="Account role" value="Youth Member" /></div></div></section>}

          {page === 'circulars' && <section><div className="mb-7"><p className="text-sm text-slate-500">Announcements from your fellowship leaders.</p><h2 className="text-3xl font-extrabold tracking-tight mt-1">Circulars</h2></div>{circulars.length === 0 ? <EmptyState icon={<FileText size={28} />} title="No circulars yet" text="New announcements will appear here." /> : <div className="space-y-3">{circulars.map((circular) => <button key={circular.id} onClick={() => { setSelectedCircular(circular); markCircularRead(circular); }} className="w-full bg-white border border-slate-200 rounded-2xl p-5 text-left hover:border-orange-300 hover:shadow-md transition-all flex items-start gap-4"><div className="h-11 w-11 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center shrink-0"><FileText size={19} /></div><div className="min-w-0"><div className="flex items-center gap-2"><h3 className="font-bold truncate">{circular.title}</h3>{!readIds.has(circular.id) && <span className="h-2 w-2 bg-orange-500 rounded-full shrink-0" />}</div><p className="text-sm text-slate-500 mt-1 line-clamp-2">{circular.body}</p><p className="text-xs text-slate-400 mt-3 flex items-center gap-1"><Clock3 size={12} /> {new Date(circular.created_at).toLocaleDateString()}</p></div></button>)}</div>}</section>}
        </div>
      </main>

      {selectedEvent && <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4" onClick={() => setSelectedEvent(null)}><div className="bg-white rounded-3xl max-w-xl w-full overflow-hidden shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="h-36 bg-gradient-to-br from-slate-950 via-slate-800 to-orange-700 p-6 text-white flex items-end justify-between"><div><span className="text-xs uppercase tracking-[0.18em] text-orange-200 font-bold">{selectedEvent.scope === 'local' ? 'Local event' : 'Pastorate event'}</span><h3 className="text-2xl font-extrabold mt-2">{selectedEvent.title}</h3></div><button onClick={() => setSelectedEvent(null)} className="p-2 rounded-xl bg-white/10 hover:bg-white/20"><X size={18} /></button></div><div className="p-6"><div className="grid grid-cols-2 gap-4 text-sm mb-5"><div><p className="text-xs uppercase tracking-wider text-slate-400 font-bold">Date</p><p className="font-semibold mt-1">{formatDate(selectedEvent.event_date)}</p></div><div><p className="text-xs uppercase tracking-wider text-slate-400 font-bold">Time</p><p className="font-semibold mt-1">{formatTime(selectedEvent.start_time)}{selectedEvent.end_time ? ` – ${formatTime(selectedEvent.end_time)}` : ''}</p></div><div className="col-span-2"><p className="text-xs uppercase tracking-wider text-slate-400 font-bold">Venue</p><p className="font-semibold mt-1">{selectedEvent.venue || 'Venue to be announced'}</p></div></div><p className="text-sm leading-7 text-slate-600 whitespace-pre-wrap">{selectedEvent.description || 'Join us for this fellowship event.'}</p><button onClick={() => setStatusEvent(selectedEvent)} className="mt-5 w-full rounded-xl border border-slate-200 py-3 text-sm font-bold text-slate-700 hover:bg-slate-950 hover:text-white hover:border-slate-950 transition-colors">View attendance status and feedback</button>{selectedEvent.event_date >= todayLocal() && availableDirections.length > 0 && <div className="mt-6 p-5 rounded-2xl bg-orange-50 border border-orange-100"><div className="flex items-start gap-3"><KeyRound size={19} className="text-orange-600 mt-0.5" /><div><h4 className="font-bold text-orange-950">Mark your attendance</h4><p className="text-sm text-orange-800/80 mt-1">Enter the 6-digit OTP shared by your {selectedEvent.scope === 'local' ? 'Local' : 'Pastorate'} Youth Secretary.</p></div></div><div className="flex gap-2 mt-4">{!inApproved && !feedbackDone && <button onClick={() => setOtpDirection('attendance_in')} className={`flex-1 py-2 rounded-lg text-xs font-bold ${otpDirection === 'attendance_in' ? 'bg-orange-500 text-white' : 'bg-white text-orange-700 border border-orange-200'}`}>IN OTP</button>}{!outApproved && <button onClick={() => setOtpDirection('attendance_out')} className={`flex-1 py-2 rounded-lg text-xs font-bold ${otpDirection === 'attendance_out' ? 'bg-orange-500 text-white' : 'bg-white text-orange-700 border border-orange-200'}`}>OUT OTP</button>}</div><div className="flex gap-3 mt-3"><input value={otpInput} onChange={(event) => setOtpInput(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" inputMode="numeric" className="flex-1 min-w-0 px-4 py-3 rounded-xl border border-orange-200 bg-white text-center text-xl tracking-[0.3em] font-bold focus:outline-none focus:ring-2 focus:ring-orange-500" /><button disabled={saving || otpInput.length !== 6} onClick={() => verifyEventOtp(selectedEvent)} className="px-4 py-3 rounded-xl bg-orange-500 text-white font-bold hover:bg-orange-600 disabled:opacity-50">{saving ? 'Checking...' : 'Check in'}</button></div></div>}</div></div></div>}
      {statusEvent && <EventStatusModal event={statusEvent} memberId={profileData.memberId || undefined} onClose={() => { setStatusEvent(null); loadAttendance(); }} />}
      {selectedCircular && <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4" onClick={() => setSelectedCircular(null)}><div className="bg-white rounded-2xl max-w-lg w-full p-6" onClick={(event) => event.stopPropagation()}><div className="flex justify-between items-start gap-4"><h3 className="text-xl font-bold">{selectedCircular.title}</h3><button onClick={() => setSelectedCircular(null)}><X size={18} /></button></div><p className="text-sm leading-7 whitespace-pre-wrap text-slate-600 mt-5">{selectedCircular.body}</p>{circularFiles.length > 0 && <div className="mt-5 flex flex-wrap gap-2">{circularFiles.map((file) => <button key={file.id} onClick={() => openCircularFile(file.file_path)} className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:border-orange-300 hover:text-orange-700"><Paperclip size={13} className="shrink-0" /><span className="truncate">{file.file_name}</span></button>)}</div>}</div></div>}
    </div>
  );
}

function EventCard({ event, onOpen, past = false }: { event: YouthEvent; onOpen: () => void; past?: boolean }) {
  return <article className={`bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all ${past ? 'opacity-75' : ''}`}><div className="h-2 bg-gradient-to-r from-orange-500 to-red-600" /><div className="p-5"><div className="flex items-start gap-4"><div className="h-14 w-14 rounded-2xl bg-orange-50 text-orange-600 flex flex-col items-center justify-center shrink-0"><span className="text-[10px] font-bold uppercase">{new Date(`${event.event_date}T00:00:00`).toLocaleDateString('en-US', { month: 'short' })}</span><span className="text-xl font-extrabold leading-none">{new Date(`${event.event_date}T00:00:00`).getDate()}</span></div><div className="min-w-0"><span className="text-[10px] uppercase tracking-wider font-bold text-orange-600">{event.scope === 'local' ? 'Local fellowship' : 'Pastorate fellowship'}</span><h3 className="font-extrabold text-lg mt-1 truncate">{event.title}</h3><p className="text-sm text-slate-500 mt-1">{event.venue || 'Venue to be announced'}</p></div></div><p className="text-sm text-slate-600 line-clamp-2 leading-6 mt-5 min-h-12">{event.description || 'Join your fellowship community for this event.'}</p><button onClick={onOpen} className="mt-5 w-full rounded-xl border border-slate-200 py-3 text-sm font-bold text-slate-700 hover:bg-slate-950 hover:text-white hover:border-slate-950 transition-colors">View event</button></div></article>;
}

function AttendancePage({ records, events }: { records: AttendanceRecord[]; events: YouthEvent[] }) {
  const eventById = new Map(events.map((event) => [event.id, event]));
  const today = todayLocal();
  return <section><div className="mb-7"><p className="text-sm text-slate-500">Your event check-ins, approval progress, and final attendance.</p><h2 className="text-3xl font-extrabold tracking-tight mt-1">Attendance</h2></div>{records.length === 0 ? <EmptyState icon={<CheckCircle2 size={28} />} title="No attendance yet" text="Open an upcoming event to enter your attendance OTP." /> : <div className="bg-white border border-slate-200 rounded-2xl overflow-x-auto shadow-sm"><table className="w-full min-w-[720px] text-left"><thead className="bg-slate-50 border-b border-slate-200"><tr><th className="px-5 py-4 text-xs uppercase tracking-wider text-slate-500">Event</th><th className="px-5 py-4 text-xs uppercase tracking-wider text-slate-500">Date</th><th className="px-5 py-4 text-xs uppercase tracking-wider text-slate-500">IN</th><th className="px-5 py-4 text-xs uppercase tracking-wider text-slate-500">OUT</th><th className="px-5 py-4 text-xs uppercase tracking-wider text-slate-500">Attendance</th></tr></thead><tbody className="divide-y divide-slate-100">{records.map((record) => { const event = record.event_id ? eventById.get(record.event_id) : null; const present = record.status === 'approved' || record.present === true; const rejected = record.status === 'rejected'; const absent = rejected || Boolean(event && event.event_date < today); return <tr key={record.id} className="hover:bg-slate-50"><td className="px-5 py-4 font-bold text-slate-900">{event?.title || 'Attendance check-in'}</td><td className="px-5 py-4 text-sm text-slate-600">{event ? formatDate(event.event_date) : formatDate(record.attendance_date)}</td><td className="px-5 py-4"><StatusPill value={record.in_status === 'approved' ? 'Approved' : record.in_otp_session_id ? 'Submitted' : 'Not entered'} /></td><td className="px-5 py-4"><StatusPill value={record.out_status === 'approved' ? 'Approved' : record.out_otp_session_id ? 'Submitted' : 'Not entered'} /></td><td className="px-5 py-4"><span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${present ? 'bg-emerald-50 text-emerald-700' : rejected ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>{present ? 'Present' : absent ? 'Absent' : 'Pending'}</span></td></tr>; })}</tbody></table></div>}</section>;
}

function StatusPill({ value }: { value: string }) {
  const approved = value === 'Approved';
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${approved ? 'bg-emerald-50 text-emerald-700' : value === 'Submitted' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>{value}</span>;
}

function EmptyState({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-12 text-center max-w-xl"><div className="h-14 w-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">{icon}</div><h3 className="font-bold text-lg mt-4">{title}</h3><p className="text-sm text-slate-500 mt-2">{text}</p></div>;
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs uppercase tracking-wider text-slate-400 font-bold">{label}</p><p className="mt-2 px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-600">{value}</p></div>;
}