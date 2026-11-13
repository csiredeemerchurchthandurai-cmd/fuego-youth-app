import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, KeyRound, X } from 'lucide-react';
import { Alert } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { YouthEvent } from '@/types';

type MyAttendance = {
  id: string;
  event_id: string;
  status: string | null;
  present: boolean | null;
  in_status: string | null;
  out_status: string | null;
  in_otp_session_id: string | null;
  out_otp_session_id: string | null;
};

const eventFields = 'id, title, description, venue, event_date, start_time, end_time, scope, church_id, created_by, created_at';
const attendanceFields = 'id, event_id, status, present, in_status, out_status, in_otp_session_id, out_otp_session_id';

function phaseOf(event: YouthEvent, now: number): 'live' | 'upcoming' | 'ended' {
  const start = new Date(`${event.event_date}T${event.start_time || '00:00:00'}`).getTime();
  const end = new Date(`${event.event_date}T${event.end_time || '23:59:59'}`).getTime();
  if (now < start) return 'upcoming';
  if (now > end) return 'ended';
  return 'live';
}

function StepPill({ label }: { label: string }) {
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${label === 'Approved' ? 'bg-emerald-50 text-emerald-700' : label === 'Submitted' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>{label}</span>;
}

// Events of the signed-in person's own church (local events) plus the pastorate events they can see,
// with a way to mark their own attendance using the OTP shared at the event.
// For leaders who are members of a church (Pastorate Youth Secretary, PC Member, ...).
export function MyChurchEvents() {
  const { profile, session } = useAuth();
  const [events, setEvents] = useState<YouthEvent[]>([]);
  const [records, setRecords] = useState<Record<string, MyAttendance>>({});
  const [memberId, setMemberId] = useState('');
  const [active, setActive] = useState<YouthEvent | null>(null);
  const [direction, setDirection] = useState<'attendance_in' | 'attendance_out'>('attendance_in');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  // Attendance is recorded against a church member record. People who are not youth members get one (marked as a leader).
  const ensureMemberId = useCallback(async (): Promise<string> => {
    if (!profile?.id || !profile.church_id) return '';
    const email = session?.user?.email?.toLowerCase() || '';
    const { data: link } = await supabase.from('youth_member_profiles').select('youth_member_id').eq('id', profile.id).maybeSingle();
    if (link?.youth_member_id) return link.youth_member_id;
    if (email) {
      const { data: existingRows } = await supabase.from('youth_members').select('id').eq('church_id', profile.church_id).ilike('email', email).order('created_at', { ascending: true }).limit(1);
      if (existingRows?.[0]?.id) return existingRows[0].id;
    }
    const { data: created } = await supabase.from('youth_members').insert({
      church_id: profile.church_id,
      full_name: profile.full_name,
      email,
      date_of_birth: profile.date_of_birth || null,
      is_leader: true,
    }).select('id').single();
    if (created?.id) return created.id;
    const { data: again } = await supabase.from('youth_members').select('id').eq('church_id', profile.church_id).ilike('email', email).order('created_at', { ascending: true }).limit(1);
    return again?.[0]?.id || '';
  }, [profile?.id, profile?.church_id, profile?.full_name, profile?.date_of_birth, session?.user?.email]);

  const load = useCallback(async () => {
    if (!profile?.church_id) return;
    const { data } = await supabase.from('youth_events').select(eventFields).or(`church_id.eq.${profile.church_id},scope.eq.pastorate`).order('event_date');
    setEvents((data as YouthEvent[]) || []);
    const id = memberId || await ensureMemberId();
    if (id && !memberId) setMemberId(id);
    if (id) {
      const { data: attendance } = await supabase.from('attendance').select(attendanceFields).eq('youth_member_id', id);
      const map: Record<string, MyAttendance> = {};
      ((attendance as MyAttendance[]) || []).forEach((row) => { map[row.event_id] = row; });
      setRecords(map);
    }
  }, [profile?.church_id, memberId, ensureMemberId]);

  useEffect(() => { load(); }, [load]);

  const flash = (text: string, kind: 'error' | 'success') => {
    if (kind === 'error') setError(text); else setSuccess(text);
    setTimeout(() => (kind === 'error' ? setError(null) : setSuccess(null)), 4500);
  };

  const submitOtp = async () => {
    if (!active || !profile?.id || !profile.church_id || code.length !== 6 || busy) return;
    setBusy(true);
    const id = memberId || await ensureMemberId();
    if (!id) { flash('We could not set up your attendance record. Please sign out, sign in again and retry.', 'error'); setBusy(false); return; }
    setMemberId(id);

    const { data: otp, error: otpError } = await supabase.from('otp_sessions').select('id, expires_at').eq('event_id', active.id).eq('type', direction).eq('otp_code', code).eq('is_active', true).eq('is_used', false).maybeSingle();
    if (otpError || !otp) { flash('That OTP is not valid for this event. Ask the youth secretary for the active code.', 'error'); setBusy(false); return; }
    if (new Date(otp.expires_at) < new Date()) { flash('This OTP has expired. Ask the youth secretary for a new code.', 'error'); setBusy(false); return; }

    const { data: existing } = await supabase.from('attendance').select('id').eq('event_id', active.id).eq('youth_member_id', id).maybeSingle();
    const patch = direction === 'attendance_in'
      ? { otp_session_id: otp.id, in_otp_session_id: otp.id, in_status: 'pending' }
      : { otp_session_id: otp.id, out_otp_session_id: otp.id, out_status: 'pending' };
    const result = existing
      ? await supabase.from('attendance').update(patch).eq('id', existing.id)
      : await supabase.from('attendance').insert({ ...patch, event_id: active.id, youth_member_id: id, church_id: profile.church_id, marked_by: profile.id, status: 'pending', feedback_submitted: false });
    if (result.error) flash(`Could not record attendance: ${result.error.message}`, 'error');
    else {
      setActive(null);
      setCode('');
      flash(`${direction === 'attendance_in' ? 'IN' : 'OUT'} OTP accepted. Awaiting secretary approval.`, 'success');
      await load();
    }
    setBusy(false);
  };

  const rank = { live: 0, upcoming: 1, ended: 2 } as const;
  const sorted = [...events].sort((a, b) => {
    const pa = phaseOf(a, now);
    const pb = phaseOf(b, now);
    if (pa !== pb) return rank[pa] - rank[pb];
    const ta = new Date(`${a.event_date}T${a.start_time || '00:00:00'}`).getTime();
    const tb = new Date(`${b.event_date}T${b.start_time || '00:00:00'}`).getTime();
    return pa === 'ended' ? tb - ta : ta - tb;
  });

  const stepLabel = (status: string | null | undefined, otpId: string | null | undefined) => (status === 'approved' ? 'Approved' : otpId ? 'Submitted' : 'Not entered');

  return (
    <section className="space-y-4">
      {error && <Alert type="error" message={error} />}
      {success && <Alert type="success" message={success} />}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="p-5 border-b border-gray-100">
          <h2 className="font-bold text-gray-900 flex items-center gap-2"><CalendarDays size={18} className="text-orange-600" /> My church events</h2>
          <p className="text-sm text-gray-500 mt-1">Your church's events and the pastorate events you can attend. Enter the OTP shared at the event to mark your attendance.</p>
        </div>
        {sorted.length === 0 ? (
          <p className="p-6 text-sm text-gray-400 text-center">No events to show yet.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {sorted.map((event) => {
              const phase = phaseOf(event, now);
              const record = records[event.id];
              const present = record?.status === 'approved' || record?.present === true;
              return (
                <div key={event.id} className={`p-4 ${phase === 'ended' ? 'opacity-75' : ''}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-gray-900">{event.title}</p>
                        <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-bold text-orange-700">{event.scope === 'pastorate' ? 'Pastorate' : 'Local'}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${phase === 'live' ? 'bg-emerald-100 text-emerald-700' : phase === 'upcoming' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>{phase === 'live' ? 'Happening now' : phase === 'upcoming' ? 'Upcoming' : 'Ended'}</span>
                      </div>
                      <p className="mt-1 text-sm text-gray-500">{new Date(`${event.event_date}T00:00:00`).toLocaleDateString()}{event.start_time ? ` · ${event.start_time.slice(0, 5)}` : ''}{event.end_time ? ` – ${event.end_time.slice(0, 5)}` : ''} · {event.venue || 'Venue pending'}</p>
                    </div>
                    {phase !== 'ended' && (
                      <button onClick={() => { setActive(event); setCode(''); setDirection('attendance_in'); }} className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-600">
                        <KeyRound size={14} /> Mark attendance
                      </button>
                    )}
                  </div>
                  {record && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                      IN <StepPill label={stepLabel(record.in_status, record.in_otp_session_id)} />
                      OUT <StepPill label={stepLabel(record.out_status, record.out_otp_session_id)} />
                      {present && <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-bold text-emerald-700">Present</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {active && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" onClick={() => setActive(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div><h3 className="text-lg font-bold text-gray-900">Mark your attendance</h3><p className="mt-1 text-sm text-gray-500">{active.title}</p></div>
              <button onClick={() => setActive(null)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100" aria-label="Close"><X size={18} /></button>
            </div>
            <div className="mt-4 flex gap-2">
              {(['attendance_in', 'attendance_out'] as const).map((value) => (
                <button key={value} onClick={() => setDirection(value)} className={`flex-1 rounded-lg py-2 text-xs font-bold ${direction === value ? 'bg-orange-500 text-white' : 'border border-orange-200 bg-white text-orange-700'}`}>{value === 'attendance_in' ? 'IN OTP' : 'OUT OTP'}</button>
              ))}
            </div>
            <div className="mt-3 flex gap-3">
              <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" inputMode="numeric" className="min-w-0 flex-1 rounded-xl border border-orange-200 px-4 py-3 text-center text-xl font-bold tracking-[0.3em] focus:outline-none focus:ring-2 focus:ring-orange-500" />
              <button disabled={busy || code.length !== 6} onClick={submitOtp} className="rounded-xl bg-orange-500 px-4 py-3 font-bold text-white hover:bg-orange-600 disabled:opacity-50">{busy ? 'Checking...' : 'Check in'}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}