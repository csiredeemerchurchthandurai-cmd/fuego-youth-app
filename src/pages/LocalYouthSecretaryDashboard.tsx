import { useState, useEffect, useCallback } from 'react';
import { KeyRound, Users, CheckCircle, Copy, Check, Clock, CalendarCheck, Hourglass, X, FileText, CalendarDays, ClipboardList, Wallet, RefreshCw, Send, BookOpen, Download, Mic } from 'lucide-react';
import { DashboardShell } from '@/components/DashboardShell';
import { Alert, StatCard } from '@/components/ui';
import { CircularsSection } from '@/components/CircularsSection';
import { MemberDirectory } from '@/components/MemberDirectory';
import { MyChurchEvents } from '@/components/MyChurchEvents';
import { MinuteBook } from '@/components/MinuteBook';
import { MessageWorshipBoard } from '@/components/MessageWorshipBoard';
import { AttendanceDownloadButtons } from '@/components/AttendanceDownloadButtons';
import { MemberExport } from '@/components/MemberExport';
import { ChurchFundsSection } from '@/components/ChurchFundsSection';
import { InformationRequestsSection } from '@/components/InformationRequestsSection';
import { useUnreadCounts } from '@/hooks/useUnreadCounts';
import { CountBadge } from '@/components/CountBadge';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { generateOtpCode } from '@/lib/otp';
import type { Church, YouthMember, AttendanceRecord, OtpSession, YouthEvent } from '@/types';

type ViewKey = 'events' | 'otp' | 'in_approvals' | 'out_approvals' | 'view_attendance' | 'members' | 'my_events' | 'funds' | 'requests' | 'minutes' | 'downloads' | 'worship' | 'circulars';
type AttendanceFilter = 'all' | 'present' | 'absent' | 'pending';

// Local date (YYYY-MM-DD) rather than UTC
function todayLocal() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// An event is 'live' from its start time until its end time on the event date.
// Missing start time = start of the day, missing end time = end of the day.
function eventPhase(event: YouthEvent, now: number): 'upcoming' | 'live' | 'ended' {
  const start = new Date(`${event.event_date}T${event.start_time || '00:00:00'}`).getTime();
  const end = new Date(`${event.event_date}T${event.end_time || '23:59:59'}`).getTime();
  if (now < start) return 'upcoming';
  if (now > end) return 'ended';
  return 'live';
}

function eventStartTime(event: YouthEvent) {
  return new Date(`${event.event_date}T${event.start_time || '00:00:00'}`).getTime();
}

// Current (live) events first, then upcoming (soonest first), then past events (most recent first)
function sortEventsForDisplay(list: YouthEvent[], now: number): YouthEvent[] {
  const rank = { live: 0, upcoming: 1, ended: 2 } as const;
  return [...list].sort((a, b) => {
    const phaseA = eventPhase(a, now);
    const phaseB = eventPhase(b, now);
    if (phaseA !== phaseB) return rank[phaseA] - rank[phaseB];
    return phaseA === 'ended' ? eventStartTime(b) - eventStartTime(a) : eventStartTime(a) - eventStartTime(b);
  });
}

function EventSummaryModal({ event, otps, records, memberCount, onClose, onOpenAttendance }: {
  event: YouthEvent;
  otps: OtpSession[];
  records: AttendanceRecord[];
  memberCount: number;
  onClose: () => void;
  onOpenAttendance: () => void;
}) {
  const endAt = new Date(`${event.event_date}T${event.end_time || '23:59:59'}`);
  const ended = Date.now() > endAt.getTime();
  const eventRecords = records.filter((r) => r.event_id === event.id);
  const inOtps = otps.filter((o) => o.event_id === event.id && o.type === 'attendance_in');
  const outOtps = otps.filter((o) => o.event_id === event.id && o.type === 'attendance_out');
  const inEntered = eventRecords.filter((r) => r.in_otp_session_id).length;
  const outEntered = eventRecords.filter((r) => r.out_otp_session_id).length;
  const inApproved = eventRecords.filter((r) => r.in_status === 'approved').length;
  const outApproved = eventRecords.filter((r) => r.out_status === 'approved').length;
  const present = eventRecords.filter((r) => r.present === true || r.status === 'approved').length;
  const absent = Math.max(memberCount - present, 0);

  const stat = (label: string, value: number | string, tone: string) => (
    <div className={`rounded-xl border p-3 text-center ${tone}`}><p className="text-2xl font-extrabold">{value}</p><p className="text-xs font-semibold mt-0.5">{label}</p></div>
  );
  const otpCard = (label: string, list: OtpSession[], entered: number, approved: number) => (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="font-bold text-slate-900">{label}</p>
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${list.length > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{list.length > 0 ? 'Generated' : 'Not generated'}</span>
      </div>
      {list.length > 0 && <p className="text-xs text-slate-500 mt-1">Generated {new Date(list[list.length - 1].created_at).toLocaleString()}</p>}
      <div className="grid grid-cols-2 gap-2 mt-3">
        {stat('Entered OTP', entered, 'bg-blue-50 border-blue-100 text-blue-700')}
        {stat('Approved', approved, 'bg-emerald-50 border-emerald-100 text-emerald-700')}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="bg-gradient-to-br from-slate-950 via-slate-800 to-orange-700 p-6 text-white flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-orange-200 font-bold">Event status</p>
            <h2 className="text-2xl font-extrabold mt-2">{event.title}</h2>
            <p className="text-sm text-slate-200 mt-2">{new Date(`${event.event_date}T00:00:00`).toLocaleDateString()} · {event.venue || 'Venue pending'}{event.end_time ? ` · ends ${event.end_time.slice(0, 5)}` : ''}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl bg-white/10 hover:bg-white/20"><X size={19} /></button>
        </div>
        <div className="p-6 space-y-4">
          {event.description && <p className="text-sm text-slate-600 whitespace-pre-wrap">{event.description}</p>}
          {!ended ? (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-4">
              <p className="font-bold text-amber-900">Event is not over yet</p>
              <p className="text-sm text-amber-800 mt-1">The IN and OUT OTP status and approvals will appear here once the event ends{event.end_time ? ` at ${event.end_time.slice(0, 5)}` : ' (end of the day)'}.</p>
            </div>
          ) : (
            <>
              <div className="grid sm:grid-cols-2 gap-3">
                {otpCard('IN OTP', inOtps, inEntered, inApproved)}
                {otpCard('OUT OTP', outOtps, outEntered, outApproved)}
              </div>
              <div className="grid grid-cols-3 gap-3">
                {stat('Present', present, 'bg-emerald-50 border-emerald-100 text-emerald-700')}
                {stat('Absent', absent, 'bg-red-50 border-red-100 text-red-700')}
                {stat('Total members', memberCount, 'bg-slate-50 border-slate-200 text-slate-700')}
              </div>
              <button onClick={onOpenAttendance} className="w-full rounded-xl bg-slate-950 py-3 text-sm font-bold text-white hover:bg-slate-800">See who was present or absent</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// scope "local": the Local Youth Secretary (their church).
// scope "pastorate": the Pastorate Youth Secretary - the same tools, but only for pastorate events,
// with every church's members and funds available to view (never edit).
export function LocalYouthSecretaryDashboard({ scope = 'local' }: { scope?: 'local' | 'pastorate' }) {
  const isPastorate = scope === 'pastorate';
  const { profile } = useAuth();
  const churchId = profile?.church_id;
  const [members, setMembers] = useState<YouthMember[]>([]);
  const [churches, setChurches] = useState<Church[]>([]);
  const [fundsAllowed, setFundsAllowed] = useState(false);
  const [pendingAttendance, setPendingAttendance] = useState<AttendanceRecord[]>([]);
  const [allAttendance, setAllAttendance] = useState<AttendanceRecord[]>([]);
  const [otpSessions, setOtpSessions] = useState<OtpSession[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [generatedOtp, setGeneratedOtp] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [view, setView] = useState<ViewKey>('events');
  const unread = useUnreadCounts(view === 'requests' ? 'requests' : view === 'circulars' ? 'circulars' : null);
  const [events, setEvents] = useState<YouthEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [selectedEvent, setSelectedEvent] = useState<YouthEvent | null>(null);
  const [secretaryOtp, setSecretaryOtp] = useState('');
  const [generatedSecretaryOtp, setGeneratedSecretaryOtp] = useState<string | null>(null);
  const [verifiedEventIds, setVerifiedEventIds] = useState<Record<string, boolean>>({});
  const [otpDirection, setOtpDirection] = useState<'attendance_in' | 'attendance_out'>('attendance_in');
  const [generatedCodes, setGeneratedCodes] = useState<Record<string, string>>({});
  const [viewEventId, setViewEventId] = useState('');
  const [attendanceFilter, setAttendanceFilter] = useState<AttendanceFilter>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Re-check event timing every 30 seconds so buttons enable/disable on their own
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const fetchData = useCallback(async () => {
    if (!churchId) return;

    // Events first, so everything else can be limited to the events this secretary is responsible for
    const eventFields = 'id, title, description, venue, event_date, start_time, end_time, scope, church_id, created_by, created_at';
    const { data: eventData } = isPastorate
      ? await supabase.from('youth_events').select(eventFields).eq('scope', 'pastorate').order('event_date')
      : await supabase.from('youth_events').select(eventFields).or(`church_id.eq.${churchId},scope.eq.pastorate`).order('event_date');
    const loadedEvents = (eventData as YouthEvent[]) || [];
    setEvents(loadedEvents);
    if (!selectedEventId && loadedEvents[0]) setSelectedEventId(sortEventsForDisplay(loadedEvents, Date.now())[0].id);
    const eventIds = new Set(loadedEvents.map((event) => event.id));

    const membersQuery = supabase.from('youth_members').select('id, church_id, full_name, phone, email, date_of_birth, address, created_at, is_leader').order('full_name');
    const attendanceQuery = supabase.from('attendance').select('id, otp_session_id, event_id, youth_member_id, church_id, marked_by, attendance_date, created_at, status, feedback_submitted, approved_by, approved_at, in_otp_session_id, out_otp_session_id, in_status, out_status, present, in_approved_by, out_approved_by, in_approved_at, out_approved_at').order('created_at', { ascending: false });
    const otpQuery = supabase.from('otp_sessions').select('id, church_id, event_id, type, otp_code, generated_by, is_used, is_active, expires_at, created_at').in('type', ['secretary_enable', 'attendance', 'attendance_in', 'attendance_out']).order('created_at', { ascending: false });
    const [{ data: memberData }, { data: attData }, { data: otpData }] = await Promise.all([
      isPastorate ? membersQuery : membersQuery.eq('church_id', churchId),
      isPastorate ? attendanceQuery : attendanceQuery.eq('church_id', churchId),
      isPastorate ? otpQuery : otpQuery.eq('church_id', churchId),
    ]);
    if (memberData) setMembers(memberData as YouthMember[]);

    if (isPastorate) {
      // The Pastorate Youth Secretary can view the funds of every church (view only)
      setFundsAllowed(true);
      const { data: churchData } = await supabase.from('churches').select('id, name, location, created_at').order('name');
      if (churchData) setChurches(churchData as Church[]);
    } else {
      // The Funds tab is shown only if the Local Youth Treasurer granted view access to this role for this church
      const { data: accessRow } = await supabase.from('church_fund_access').select('can_view').eq('church_id', churchId).eq('role', 'local_youth_secretary').maybeSingle();
      setFundsAllowed(Boolean(accessRow?.can_view));
    }

    if (attData) {
      const rows = (attData as AttendanceRecord[]).filter((a) => !isPastorate || (!!a.event_id && eventIds.has(a.event_id)));
      setAllAttendance(rows);
      setPendingAttendance(rows.filter((a) => a.status !== 'approved' && (a.in_otp_session_id || a.out_otp_session_id)));
    }
    if (otpData) {
      const sessions = (otpData as OtpSession[]).filter((otp) => !isPastorate || (!!otp.event_id && eventIds.has(otp.event_id)));
      setOtpSessions(sessions.filter((otp) => otp.type !== 'secretary_enable'));
      const verified = sessions.filter((otp) => otp.type === 'secretary_enable' && otp.is_used && otp.event_id).reduce<Record<string, boolean>>((result, otp) => ({ ...result, [otp.event_id as string]: true }), {});
      setVerifiedEventIds(verified);
    }
  }, [churchId, isPastorate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Refresh when opening the attendance tabs so the secretary always sees the latest status
  useEffect(() => {
    if (view === 'view_attendance' || view === 'in_approvals' || view === 'out_approvals') fetchData();
  }, [view, fetchData]);

  // Reload fresh data whenever an event is opened
  useEffect(() => { if (selectedEvent) fetchData(); }, [selectedEvent?.id]);

  // If the treasurer revokes access while the tab is open, leave it
  useEffect(() => { if (view === 'funds' && !fundsAllowed) setView('events'); }, [view, fundsAllowed]);

  const secretaryVerified = Boolean(selectedEventId && verifiedEventIds[selectedEventId]);
  const otpEvent = events.find((event) => event.id === selectedEventId) || null;
  const otpPhase = otpEvent ? eventPhase(otpEvent, now) : null;
  const otpWindowOpen = otpPhase === 'live';
  const otpClosedMessage = otpPhase === 'ended' ? 'This event has ended, so OTP generation is closed.' : 'OTP generation opens when the event starts.';

  // Events ordered with current and upcoming ones first, past events last
  const sortedEvents = sortEventsForDisplay(events, now);
  const currentAndUpcoming = sortedEvents.filter((event) => eventPhase(event, now) !== 'ended');
  const pastEvents = sortedEvents.filter((event) => eventPhase(event, now) === 'ended');
  const optionLabel = (event: YouthEvent) => `${eventPhase(event, now) === 'live' ? '● Live now · ' : ''}${event.title} · ${new Date(`${event.event_date}T00:00:00`).toLocaleDateString()}`;
  const eventOptions = (
    <>
      {currentAndUpcoming.length > 0 && <optgroup label="Current & upcoming">{currentAndUpcoming.map((event) => <option key={event.id} value={event.id}>{optionLabel(event)}</option>)}</optgroup>}
      {pastEvents.length > 0 && <optgroup label="Past events">{pastEvents.map((event) => <option key={event.id} value={event.id}>{optionLabel(event)}</option>)}</optgroup>}
    </>
  );

  const renderEventRow = (event: YouthEvent) => {
    const phase = eventPhase(event, now);
    return (
      <div key={event.id} className={`flex items-center justify-between gap-3 rounded-xl border p-4 ${phase === 'live' ? 'border-emerald-300 bg-emerald-50/40' : 'border-gray-200'} ${phase === 'ended' ? 'opacity-70' : ''}`}>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-gray-900">{event.title}</p>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${phase === 'live' ? 'bg-emerald-100 text-emerald-700' : phase === 'upcoming' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>{phase === 'live' ? 'Happening now' : phase === 'upcoming' ? 'Upcoming' : 'Ended'}</span>
          </div>
          <p className="text-sm text-gray-500 mt-1">{new Date(`${event.event_date}T00:00:00`).toLocaleDateString()} · {event.venue || 'Venue pending'}</p>
        </div>
        <button onClick={() => setSelectedEvent(event)} className="shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">View event</button>
      </div>
    );
  };

  const generateSecretaryOtp = async () => {
    if (!churchId || !profile || !selectedEventId) return;
    if (!otpWindowOpen) { setError(otpClosedMessage); return; }
    const code = generateOtpCode();
    const { error: insertError } = await supabase.from('otp_sessions').insert({ church_id: churchId, event_id: selectedEventId, type: 'secretary_enable', otp_code: code, generated_by: profile.id, is_active: true, is_used: false });
    if (insertError) { setError('Could not generate the event secretary OTP.'); return; }
    setGeneratedSecretaryOtp(code);
    setSecretaryOtp('');
    setSuccess('Event secretary OTP generated. Verify it once for this event.');
  };

  const verifySecretaryOtp = async () => {
    if (!churchId || !profile || !selectedEventId || secretaryOtp.length !== 6) return;
    if (!otpWindowOpen) { setError(otpClosedMessage); return; }
    const { data, error: queryError } = await supabase.from('otp_sessions').select('id').eq('church_id', churchId).eq('event_id', selectedEventId).eq('type', 'secretary_enable').eq('generated_by', profile.id).eq('otp_code', secretaryOtp).eq('is_active', true).eq('is_used', false).maybeSingle();
    if (queryError || !data) { setError('That secretary OTP does not match this event or has expired.'); return; }
    const { error: useError } = await supabase.from('otp_sessions').update({ is_used: true }).eq('id', data.id);
    if (useError) { setError('Could not verify the event secretary OTP.'); return; }
    setVerifiedEventIds((current) => ({ ...current, [selectedEventId]: true }));
    setSuccess('Secretary OTP verified for this event. Member IN and OUT OTPs are now enabled.');
  };

  const generateOtp = async (direction: 'attendance_in' | 'attendance_out') => {
    if (!churchId || !profile || !secretaryVerified || !selectedEventId) return;
    if (!otpWindowOpen) { setError(otpClosedMessage); return; }
    if (direction === 'attendance_out') {
      const latestIn = otpSessions.find((otp) => otp.type === 'attendance_in' && otp.event_id === selectedEventId && otp.is_active);
      if (latestIn && Date.now() - new Date(latestIn.created_at).getTime() < 30 * 60 * 1000) { setError('The OUT OTP becomes available 30 minutes after the IN OTP.'); return; }
    }
    const code = generateOtpCode();
    const { error: insertError } = await supabase.from('otp_sessions').insert({ church_id: churchId, event_id: selectedEventId, type: direction, otp_code: code, generated_by: profile.id, is_active: true, is_used: false });
    if (insertError) { setError('Could not generate the member OTP.'); return; }
    setGeneratedCodes((current) => ({ ...current, [direction]: code }));
    setOtpDirection(direction);
    setGeneratedOtp(code);
    setSuccess(`${direction === 'attendance_in' ? 'IN' : 'OUT'} OTP generated. Share it with the youth members.`);
    fetchData();
    setTimeout(() => setSuccess(null), 5000);
  };

  const refreshApprovals = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const copyOtp = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isExpired = (expiresAt: string) => new Date(expiresAt) < new Date();
  const activeOtp = otpSessions.find((o) => o.is_active && !o.is_used && !isExpired(o.expires_at));

  const approveAttendance = async (id: string, direction: 'in' | 'out') => {
    if (!profile) return;
    const record = pendingAttendance.find((item) => item.id === id);
    if (!record) return;
    const now = new Date().toISOString();
    const otherApproved = direction === 'in' ? record.out_status === 'approved' : record.in_status === 'approved';
    const patch = direction === 'in'
      ? { in_status: 'approved', in_approved_by: profile.id, in_approved_at: now, ...(otherApproved ? { present: true, status: 'approved', approved_by: profile.id, approved_at: now } : {}) }
      : { out_status: 'approved', out_approved_by: profile.id, out_approved_at: now, ...(otherApproved ? { present: true, status: 'approved', approved_by: profile.id, approved_at: now } : {}) };
    const { error: updateError } = await supabase.from('attendance').update(patch).eq('id', id);
    if (updateError) { setError('Could not approve this attendance step.'); return; }
    setSuccess(`${direction.toUpperCase()} attendance approved.`);
    fetchData();
    setTimeout(() => setSuccess(null), 3000);
  };

  const rejectAttendance = async (id: string) => {
    setError(null);
    const { error: updateError } = await supabase.from('attendance').update({
      status: 'rejected',
    }).eq('id', id);
    if (updateError) { setError(updateError.message); return; }
    setSuccess('Attendance rejected.');
    fetchData();
    setTimeout(() => setSuccess(null), 3000);
  };

  const memberName = (id: string) => members.find((m) => m.id === id)?.full_name || 'Unknown';
  const inApprovals = pendingAttendance.filter((item) => item.in_otp_session_id && item.in_status !== 'approved' && item.status !== 'rejected');
  const outApprovals = pendingAttendance.filter((item) => item.out_otp_session_id && item.out_status !== 'approved' && item.status !== 'rejected');

  const approveAll = async (direction: 'in' | 'out') => {
    const records = direction === 'in' ? inApprovals : outApprovals;
    await Promise.all(records.map((record) => approveAttendance(record.id, direction)));
    setSuccess(`All ${direction.toUpperCase()} approvals completed.`);
    fetchData();
  };

  // ---- View Attendance (per event) ----
  const attendanceEventId = viewEventId || selectedEventId || events[0]?.id || '';
  const attendanceEvent = events.find((event) => event.id === attendanceEventId) || null;
  const eventHasOutOtp = otpSessions.some((otp) => otp.event_id === attendanceEventId && otp.type === 'attendance_out');
  // An event counts as finished once its date has passed, or today once the OUT OTP has been generated
  const eventClosed = Boolean(attendanceEvent && (attendanceEvent.event_date < todayLocal() || (attendanceEvent.event_date === todayLocal() && eventHasOutOtp)));

  // Church leaders who attend events appear only for events where they actually have a record
  const attendanceRows = members.filter((member) => !(member as { is_leader?: boolean }).is_leader || allAttendance.some((item) => item.event_id === attendanceEventId && item.youth_member_id === member.id)).map((member) => {
    const record = allAttendance.find((item) => item.event_id === attendanceEventId && item.youth_member_id === member.id);
    const stepLabel = (status: string | null | undefined, otpId: string | null | undefined) => (status === 'approved' ? 'Approved' : otpId ? 'Submitted' : 'Not entered');
    const isPresent = Boolean(record && (record.present === true || record.status === 'approved'));
    const isRejected = record?.status === 'rejected';
    const final: 'Present' | 'Absent' | 'Pending' = isPresent ? 'Present' : isRejected || eventClosed ? 'Absent' : 'Pending';
    return {
      member,
      inLabel: stepLabel(record?.in_status, record?.in_otp_session_id),
      outLabel: stepLabel(record?.out_status, record?.out_otp_session_id),
      final,
    };
  });
  const presentCount = attendanceRows.filter((row) => row.final === 'Present').length;
  const absentCount = attendanceRows.filter((row) => row.final === 'Absent').length;
  const pendingCount = attendanceRows.filter((row) => row.final === 'Pending').length;
  const visibleRows = attendanceRows.filter((row) => attendanceFilter === 'all' || row.final.toLowerCase() === attendanceFilter);

  const stepPill = (label: string) => (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${label === 'Approved' ? 'bg-emerald-50 text-emerald-700' : label === 'Submitted' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>{label}</span>
  );

  return (
    <DashboardShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{isPastorate ? 'Pastorate Youth Secretary Dashboard' : 'Local Youth Secretary Dashboard'}</h1>
        <p className="text-sm text-gray-500 mt-1">{isPastorate ? 'Generate attendance OTPs and approve attendance for pastorate events' : 'Generate attendance OTPs and approve pending attendance from youth members'}</p>
      </div>

      {error && <div className="mb-4"><Alert type="error" message={error} /></div>}
      {success && <div className="mb-4"><Alert type="success" message={success} /></div>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <StatCard icon={<Users size={22} className="text-white" />} label="Youth Members" value={members.filter((member) => !(member as { is_leader?: boolean }).is_leader).length} color="bg-gradient-to-br from-orange-500 to-red-600" />
        <StatCard icon={<Hourglass size={22} className="text-white" />} label="Pending Approvals" value={pendingAttendance.length} color="bg-gradient-to-br from-amber-500 to-amber-700" />
        <StatCard icon={<KeyRound size={22} className="text-white" />} label="Active OTP" value={activeOtp ? 'Yes' : 'None'} color="bg-gradient-to-br from-emerald-500 to-emerald-700" />
      </div>

      {/* Tab navigation */}
      <div className="w-full max-w-full overflow-x-auto mb-6"><div className="flex gap-1 bg-white rounded-xl border border-gray-200 p-1.5 shadow-sm w-max min-w-full">
        {([
          { key: 'events', label: 'Events', icon: <CalendarDays size={16} /> },
          { key: 'otp', label: 'Generate OTP', icon: <KeyRound size={16} /> },
          { key: 'in_approvals', label: `IN Approvals (${inApprovals.length})`, icon: <CheckCircle size={16} /> },
          { key: 'out_approvals', label: `OUT Approvals (${outApprovals.length})`, icon: <CheckCircle size={16} /> },
          { key: 'view_attendance', label: 'View Attendance', icon: <ClipboardList size={16} /> },
          { key: 'members', label: 'Members', icon: <Users size={16} /> },
          { key: 'my_events', label: 'My Church Events', icon: <CalendarDays size={16} /> },
          { key: 'funds', label: 'Funds', icon: <Wallet size={16} /> },
          { key: 'requests', label: 'Requests', icon: <Send size={16} /> },
          { key: 'minutes', label: 'Minute Book', icon: <BookOpen size={16} /> },
          { key: 'worship', label: 'Message & Worship', icon: <Mic size={16} /> },
          { key: 'downloads', label: 'Download List', icon: <Download size={16} /> },
          { key: 'circulars', label: 'Circulars', icon: <FileText size={16} /> },
        ] as const).filter((t) => (t.key !== 'funds' || fundsAllowed) && (t.key !== 'members' || isPastorate) && (t.key !== 'worship' || !isPastorate)).map((t) => (
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
      </div></div>

      {view === 'events' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h2 className="font-bold text-gray-900">Church events</h2>
          <p className="text-sm text-gray-500 mt-1">Events added by your Church Admin appear here. Current and upcoming events are listed first.</p>
          {events.length === 0 ? (
            <p className="text-sm text-gray-400 py-4">No events available.</p>
          ) : (
            <>
              <h3 className="mt-5 text-xs font-bold uppercase tracking-wide text-gray-500">Current &amp; upcoming ({currentAndUpcoming.length})</h3>
              <div className="mt-2 grid gap-3">
                {currentAndUpcoming.length === 0 ? <p className="text-sm text-gray-400 py-2">No current or upcoming events.</p> : currentAndUpcoming.map(renderEventRow)}
              </div>
              {pastEvents.length > 0 && (
                <>
                  <h3 className="mt-6 text-xs font-bold uppercase tracking-wide text-gray-500">Past events ({pastEvents.length})</h3>
                  <div className="mt-2 grid gap-3">{pastEvents.map(renderEventRow)}</div>
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* OTP Generation View */}
      {view === 'otp' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6">
          <div className="p-5 border-b border-gray-100">
            <h2 className="font-bold text-gray-900 flex items-center gap-2"><KeyRound size={18} className="text-orange-600" /> Attendance controls</h2>
            <p className="text-sm text-gray-500 mt-1">Verify the church admin's secretary OTP before member codes become available.</p>
          </div>
          <div className="p-5 space-y-5">
            <div className="flex flex-col sm:flex-row gap-2">
              <select value={selectedEventId} onChange={(e) => { setSelectedEventId(e.target.value); setGeneratedSecretaryOtp(null); setSecretaryOtp(''); }} className="flex-1 px-3 py-2.5 rounded-lg border border-gray-300"><option value="">Select an event</option>{eventOptions}</select>
              <button type="button" disabled={!selectedEventId} onClick={() => setSelectedEvent(events.find((event) => event.id === selectedEventId) || null)} className="px-4 py-2.5 rounded-lg border border-slate-300 text-slate-700 font-semibold disabled:opacity-40">View event</button>
            </div>
            {otpEvent && !otpWindowOpen && <div className="rounded-xl bg-slate-100 border border-slate-300 p-4 text-sm font-semibold text-slate-700">{otpPhase === 'ended' ? 'This event has ended, so OTP generation is closed. Select the next event once it starts.' : `OTP generation opens when this event starts (${new Date(`${otpEvent.event_date}T00:00:00`).toLocaleDateString()}${otpEvent.start_time ? ' at ' + otpEvent.start_time.slice(0, 5) : ''}).`}</div>}
            {!selectedEventId ? <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 text-sm text-slate-600">Select an event to generate or verify its secretary OTP.</div> : secretaryVerified ? <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4"><p className="font-semibold text-emerald-900">Secretary OTP verified for this event</p><p className="text-sm text-emerald-700 mt-1">You can generate member IN and OUT OTPs without repeating verification.</p></div> : <div className="rounded-xl bg-amber-50 border border-amber-200 p-4"><p className="font-semibold text-amber-900">Verify this event's secretary OTP</p><button onClick={generateSecretaryOtp} disabled={!otpWindowOpen} className="mt-3 px-4 py-2.5 rounded-lg bg-orange-500 text-white font-semibold disabled:opacity-40">Generate event secretary OTP</button>{generatedSecretaryOtp && <p className="mt-3 text-2xl font-extrabold tracking-[0.3em] text-orange-700">{generatedSecretaryOtp}</p>}<div className="flex flex-col sm:flex-row gap-2 mt-3"><input value={secretaryOtp} onChange={(e) => setSecretaryOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="Enter 6-digit event code" className="flex-1 px-3 py-2.5 rounded-lg border border-amber-200" /><button onClick={verifySecretaryOtp} disabled={secretaryOtp.length !== 6 || !otpWindowOpen} className="px-4 py-2.5 rounded-lg bg-amber-600 text-white font-semibold disabled:opacity-40">Verify code</button></div></div>}
            <div className="flex flex-wrap gap-3"><button disabled={!secretaryVerified || !otpWindowOpen} onClick={() => generateOtp('attendance_in')} className="px-4 py-2.5 rounded-xl bg-orange-500 text-white font-semibold disabled:opacity-40">Generate member IN OTP</button><button disabled={!secretaryVerified || !otpWindowOpen} onClick={() => generateOtp('attendance_out')} className="px-4 py-2.5 rounded-xl bg-slate-950 text-white font-semibold disabled:opacity-40">Generate member OUT OTP</button></div>
            {generatedOtp && <div className="rounded-xl bg-orange-50 border-2 border-orange-200 p-5 text-center"><p className="text-sm text-gray-600">Share the latest {otpDirection === 'attendance_in' ? 'IN' : 'OUT'} code</p><span className="text-4xl font-extrabold tracking-[0.3em] text-orange-700">{generatedOtp}</span><button onClick={() => copyOtp(generatedOtp)} className="ml-3 p-2 text-orange-600">{copied ? <Check size={20} /> : <Copy size={20} />}</button><p className="text-xs text-gray-500 mt-2">The OUT code is available only after 30 minutes from the IN code.</p></div>}
          </div>
        </div>
      )}

      {(view === 'in_approvals' || view === 'out_approvals') && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="p-5 border-b border-gray-100 flex items-center justify-between gap-3"><div><h2 className="font-bold text-gray-900 flex items-center gap-2"><CheckCircle size={18} className="text-orange-600" /> {view === 'in_approvals' ? 'IN' : 'OUT'} Approvals</h2><p className="text-sm text-gray-500 mt-1">Approve each member or approve all submitted attendance.</p></div><div className="flex items-center gap-2"><button onClick={refreshApprovals} disabled={refreshing} className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} /> {refreshing ? 'Refreshing...' : 'Refresh'}</button><button onClick={() => approveAll(view === 'in_approvals' ? 'in' : 'out')} className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-bold text-white">Approve all</button></div></div>
          {(view === 'in_approvals' ? inApprovals : outApprovals).length === 0 ? (
            <p className="p-5 text-sm text-gray-400 text-center">No pending approvals. Youth members who enter their {view === 'in_approvals' ? 'IN' : 'OUT'} OTP will appear here.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {(view === 'in_approvals' ? inApprovals : outApprovals).map((a) => (
                <div key={a.id} className="p-4 flex items-center gap-3 hover:bg-gray-50 transition-colors">
                  <div className="h-10 w-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                    <Hourglass size={18} className="text-amber-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-gray-900 text-sm">{memberName(a.youth_member_id)}</div>
                    <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-2">
                      <span className="flex items-center gap-1"><CalendarCheck size={11} /> {new Date(a.attendance_date).toLocaleDateString()}</span>
                      <span className="flex items-center gap-1"><Clock size={11} /> Submitted {new Date(a.created_at).toLocaleTimeString()}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => approveAttendance(a.id, view === 'in_approvals' ? 'in' : 'out')}
                      className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold px-3 py-2 rounded-lg transition-colors"
                    >
                      <Check size={14} /> Approve {view === 'in_approvals' ? 'IN' : 'OUT'}
                    </button>
                    <button
                      onClick={() => rejectAttendance(a.id)}
                      className="flex items-center gap-1.5 bg-red-500 hover:bg-red-600 text-white text-sm font-semibold px-3 py-2 rounded-lg transition-colors"
                    >
                      <X size={14} /> Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* View Attendance */}
      {view === 'view_attendance' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="p-5 border-b border-gray-100">
            <h2 className="font-bold text-gray-900 flex items-center gap-2"><ClipboardList size={18} className="text-orange-600" /> View Attendance</h2>
            <p className="text-sm text-gray-500 mt-1">See who entered and got approved for IN and OUT, and who is present or absent for each event.</p>
            <select value={attendanceEventId} onChange={(e) => setViewEventId(e.target.value)} className="mt-4 w-full sm:w-96 px-3 py-2.5 rounded-lg border border-gray-300">
              {events.length === 0 && <option value="">No events available</option>}
              {eventOptions}
            </select>
            <div className="mt-3">
              <AttendanceDownloadButtons data={attendanceEvent ? {
                eventTitle: attendanceEvent.title,
                eventDate: attendanceEvent.event_date,
                venue: attendanceEvent.venue,
                scopeLabel: isPastorate ? 'All churches' : churches.find((church) => church.id === churchId)?.name,
                showChurch: isPastorate,
                rows: attendanceRows.map((row) => ({
                  name: row.member.full_name,
                  church: churches.find((church) => church.id === row.member.church_id)?.name || '',
                  inStatus: row.inLabel,
                  outStatus: row.outLabel,
                  result: row.final,
                })),
              } : null} />
            </div>
          </div>

          {!attendanceEvent ? (
            <p className="p-5 text-sm text-gray-400 text-center">Select an event to see its attendance.</p>
          ) : (
            <>
              <div className="p-5 grid grid-cols-3 gap-3 border-b border-gray-100">
                <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3 text-center"><p className="text-2xl font-extrabold text-emerald-700">{presentCount}</p><p className="text-xs font-semibold text-emerald-700">Present</p></div>
                <div className="rounded-xl bg-red-50 border border-red-100 p-3 text-center"><p className="text-2xl font-extrabold text-red-700">{absentCount}</p><p className="text-xs font-semibold text-red-700">Absent</p></div>
                <div className="rounded-xl bg-amber-50 border border-amber-100 p-3 text-center"><p className="text-2xl font-extrabold text-amber-700">{pendingCount}</p><p className="text-xs font-semibold text-amber-700">Pending</p></div>
              </div>

              <div className="px-5 pt-4 flex flex-wrap gap-2">
                {([
                  { key: 'all', label: `All (${attendanceRows.length})` },
                  { key: 'present', label: `Present (${presentCount})` },
                  { key: 'absent', label: `Absent (${absentCount})` },
                  { key: 'pending', label: `Pending (${pendingCount})` },
                ] as const).map((f) => (
                  <button key={f.key} onClick={() => setAttendanceFilter(f.key)} className={`px-3 py-1.5 rounded-full text-xs font-bold ${attendanceFilter === f.key ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{f.label}</button>
                ))}
              </div>
              {!eventClosed && <p className="px-5 pt-3 text-xs text-gray-500">Members who have not finished both IN and OUT show as Pending until the event is over, then as Absent.</p>}

              <div className="p-5 overflow-x-auto">
                <table className="w-full min-w-[640px] text-left">
                  <thead className="border-b border-gray-200">
                    <tr>
                      <th className="py-3 pr-4 text-xs uppercase tracking-wider text-gray-500">Member</th>
                      <th className="py-3 pr-4 text-xs uppercase tracking-wider text-gray-500">IN OTP</th>
                      <th className="py-3 pr-4 text-xs uppercase tracking-wider text-gray-500">OUT OTP</th>
                      <th className="py-3 text-xs uppercase tracking-wider text-gray-500">Attendance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {visibleRows.length === 0 ? (
                      <tr><td colSpan={4} className="py-8 text-center text-sm text-gray-400">No members in this list.</td></tr>
                    ) : visibleRows.map((row) => (
                      <tr key={row.member.id}>
                        <td className="py-3 pr-4 font-semibold text-gray-900 text-sm">{row.member.full_name}{isPastorate && <span className="block text-xs font-normal text-gray-400">{churches.find((church) => church.id === row.member.church_id)?.name || ''}</span>}</td>
                        <td className="py-3 pr-4">{stepPill(row.inLabel)}</td>
                        <td className="py-3 pr-4">{stepPill(row.outLabel)}</td>
                        <td className="py-3"><span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${row.final === 'Present' ? 'bg-emerald-50 text-emerald-700' : row.final === 'Absent' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>{row.final}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Funds (view only for the secretary) */}
      {view === 'members' && isPastorate && <MemberDirectory churches={churches} />}
      {view === 'my_events' && <MyChurchEvents />}
      {view === 'funds' && fundsAllowed && <ChurchFundsSection churchId={isPastorate ? null : churchId ?? null} churches={isPastorate ? churches : []} canEdit={false} canManageAccess={false} />}

      {view === 'requests' && <InformationRequestsSection mode="both" />}
      {view === 'minutes' && <MinuteBook />}
      {view === 'worship' && !isPastorate && <MessageWorshipBoard />}
      {view === 'downloads' && <MemberExport mode={isPastorate ? 'choose' : 'own'} churches={churches} />}

      {/* Circulars View */}
      {view === 'circulars' && <CircularsSection />}
      {selectedEvent && (
        <EventSummaryModal
          event={selectedEvent}
          otps={otpSessions}
          records={allAttendance}
          memberCount={members.filter((member) => !(member as { is_leader?: boolean }).is_leader).length}
          onClose={() => setSelectedEvent(null)}
          onOpenAttendance={() => { setViewEventId(selectedEvent.id); setView('view_attendance'); setSelectedEvent(null); }}
        />
      )}
    </DashboardShell>
  );
}