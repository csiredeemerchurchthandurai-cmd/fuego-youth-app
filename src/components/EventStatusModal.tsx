import { useEffect, useState } from 'react';
import { CheckCircle2, Clock3, MessageSquare, XCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { AttendanceRecord, YouthEvent } from '@/types';

interface EventStatusModalProps {
  event: YouthEvent;
  memberId?: string;
  showFeedback?: boolean;
  onClose: () => void;
}

type OtpStatus = { id: string; type: string; is_used: boolean; created_at: string; expires_at: string };

export function EventStatusModal({ event, memberId, showFeedback = false, onClose }: EventStatusModalProps) {
  const [otps, setOtps] = useState<OtpStatus[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord | null>(null);
  const [feedback, setFeedback] = useState('');
  const [rating, setRating] = useState(5);
  const [feedbackSaved, setFeedbackSaved] = useState(false);
  const [feedbackExists, setFeedbackExists] = useState(false);
  const [savingFeedback, setSavingFeedback] = useState(false);
  const [submittedFeedback, setSubmittedFeedback] = useState<{ id: string; feedback_text: string; rating: number; created_at: string; youth_member_id: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const [{ data: otpData }, { data: attendanceData }] = await Promise.all([
          supabase.from('otp_sessions').select('id, type, is_used, created_at, expires_at').eq('event_id', event.id).order('created_at', { ascending: true }),
          memberId ? supabase.from('attendance').select('id, otp_session_id, event_id, youth_member_id, church_id, marked_by, attendance_date, created_at, status, feedback_submitted, approved_by, approved_at, in_otp_session_id, out_otp_session_id, in_status, out_status, present, in_approved_by, out_approved_by, in_approved_at, out_approved_at').eq('event_id', event.id).eq('youth_member_id', memberId).maybeSingle() : Promise.resolve({ data: null }),
        ]);
        if (cancelled) return;
        setOtps((otpData as OtpStatus[]) || []);
        const attendanceRow = (attendanceData as AttendanceRecord | null) || null;
        setAttendance(attendanceRow);

        // Check the feedback table itself, so the form stays closed even if the
        // feedback_submitted flag on the attendance row was not saved.
        if (attendanceRow && memberId) {
          const { data: existingFeedback } = await supabase
            .from('attendance_feedback')
            .select('id')
            .eq('attendance_id', attendanceRow.id)
            .eq('youth_member_id', memberId)
            .limit(1);
          if (!cancelled) setFeedbackExists((existingFeedback || []).length > 0);
        }

        if (showFeedback) {
          const { data: eventAttendance } = await supabase.from('attendance').select('id').eq('event_id', event.id);
          const ids = (eventAttendance || []).map((item) => item.id);
          if (ids.length > 0) {
            const { data: feedbackRows } = await supabase.from('attendance_feedback').select('id, feedback_text, rating, created_at, youth_member_id').in('attendance_id', ids).order('created_at', { ascending: false });
            if (!cancelled) setSubmittedFeedback((feedbackRows as { id: string; feedback_text: string; rating: number; created_at: string; youth_member_id: string }[]) || []);
          }
        }
      } catch {
        if (!cancelled) setError('Could not load event status. Please try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [event.id, memberId, showFeedback]);

  const inOtp = otps.find((otp) => otp.type === 'attendance_in');
  const outOtp = otps.find((otp) => otp.type === 'attendance_out');
  const approved = attendance?.status === 'approved' || attendance?.present === true;
  const inApproved = attendance?.in_status === 'approved';
  const alreadySubmitted = feedbackSaved || feedbackExists || Boolean(attendance?.feedback_submitted);

  const saveFeedback = async (submitEvent: React.FormEvent) => {
    submitEvent.preventDefault();
    if (!attendance || !memberId || !feedback.trim() || alreadySubmitted || savingFeedback) return;
    setSavingFeedback(true);
    setError(null);

    // One feedback per member per event: re-check right before inserting.
    const { data: existingFeedback } = await supabase
      .from('attendance_feedback')
      .select('id')
      .eq('attendance_id', attendance.id)
      .eq('youth_member_id', memberId)
      .limit(1);
    if ((existingFeedback || []).length > 0) {
      setFeedbackExists(true);
      setSavingFeedback(false);
      return;
    }

    const { error: insertError } = await supabase.from('attendance_feedback').insert({ attendance_id: attendance.id, youth_member_id: memberId, feedback_text: feedback.trim(), rating });
    if (insertError) {
      setError('Could not submit feedback.');
      setSavingFeedback(false);
      return;
    }
    await supabase.from('attendance').update({ feedback_submitted: true }).eq('id', attendance.id);
    setAttendance({ ...attendance, feedback_submitted: true });
    setFeedbackSaved(true);
    setSavingFeedback(false);
  };

  const statusItem = (label: string, complete: boolean, detail: string) => <div className="flex items-start gap-3 rounded-xl border border-slate-200 p-4"><div className={`mt-0.5 ${complete ? 'text-emerald-600' : 'text-slate-300'}`}>{complete ? <CheckCircle2 size={19} /> : <Clock3 size={19} />}</div><div><p className="font-bold text-slate-900">{label}</p><p className="text-sm text-slate-500 mt-1">{detail}</p></div></div>;

  return <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4" onClick={onClose}><div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}><div className="bg-gradient-to-br from-slate-950 via-slate-800 to-orange-700 p-6 text-white flex items-start justify-between"><div><p className="text-xs uppercase tracking-[0.18em] text-orange-200 font-bold">Event attendance</p><h2 className="text-2xl font-extrabold mt-2">{event.title}</h2><p className="text-sm text-slate-200 mt-2">{new Date(`${event.event_date}T00:00:00`).toLocaleDateString()} · {event.venue || 'Venue pending'}</p></div><button onClick={onClose} className="p-2 rounded-xl bg-white/10 hover:bg-white/20"><XCircle size={19} /></button></div><div className="p-6 space-y-4">{loading && <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 text-sm text-slate-600">Loading attendance status...</div>}{error && <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700">{error}</div>}<div className="grid sm:grid-cols-2 gap-3">{statusItem('IN OTP entry', Boolean(inOtp), inOtp ? `Generated ${new Date(inOtp.created_at).toLocaleString()}` : 'Not generated yet')}{statusItem('IN OTP approval', Boolean(attendance?.in_status === 'approved'), attendance?.in_status === 'approved' ? 'Approved by the local secretary' : 'Waiting for secretary approval')}{statusItem('OUT OTP entry', Boolean(outOtp), outOtp ? `Generated ${new Date(outOtp.created_at).toLocaleString()}` : 'Available after the IN window')}{statusItem('OUT OTP approval', Boolean(attendance?.out_status === 'approved'), attendance?.out_status === 'approved' ? 'Approved by the local secretary' : 'Waiting for secretary approval')}</div><div className={`rounded-xl p-4 border ${approved ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}><p className={`font-bold ${approved ? 'text-emerald-800' : 'text-amber-800'}`}>{approved ? 'Attendance marked present' : attendance?.status === 'rejected' ? 'Attendance rejected' : 'Attendance pending'}</p><p className="text-sm mt-1 text-slate-600">Both IN and OUT approvals are required before the final present status is recorded.</p></div>{memberId && attendance && !loading && inApproved && !alreadySubmitted && <form onSubmit={saveFeedback} className="rounded-xl border border-orange-200 bg-orange-50 p-4"><div className="flex items-center gap-2"><MessageSquare size={18} className="text-orange-600" /><h3 className="font-bold text-orange-950">Event feedback</h3></div><textarea required value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={3} placeholder="Tell us how the event went" className="w-full mt-3 rounded-lg border border-orange-200 bg-white p-3 text-sm" /><div className="flex items-center justify-between gap-3 mt-3"><label className="text-sm font-semibold text-orange-950">Rating <select value={rating} onChange={(e) => setRating(Number(e.target.value))} className="ml-2 rounded-lg border border-orange-200 bg-white px-2 py-1">{[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}/5</option>)}</select></label><button disabled={savingFeedback} className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{savingFeedback ? 'Submitting...' : 'Submit feedback'}</button></div></form>}{memberId && alreadySubmitted && <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-sm font-semibold text-emerald-800">Feedback submitted for this event.</div>}{showFeedback && <div className="rounded-xl border border-slate-200 p-4"><h3 className="font-bold text-slate-900">Member feedback</h3>{submittedFeedback.length === 0 ? <p className="text-sm text-slate-500 mt-2">No feedback submitted yet.</p> : <div className="mt-3 space-y-3">{submittedFeedback.map((item) => <div key={item.id} className="rounded-lg bg-slate-50 p-3"><div className="flex justify-between gap-3 text-sm"><span className="font-semibold">Member {item.youth_member_id.slice(0, 8)}</span><span className="text-orange-600 font-bold">{item.rating}/5</span></div><p className="text-sm text-slate-600 mt-1">{item.feedback_text}</p></div>)}</div>}</div>}</div></div></div>;
}