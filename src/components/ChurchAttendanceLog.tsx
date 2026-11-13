import { useEffect, useMemo, useState } from 'react';
import { ClipboardList } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { AttendanceDownloadButtons } from '@/components/AttendanceDownloadButtons';
import type { AttendanceExportData } from '@/lib/attendanceExport';
import type { Church, YouthEvent } from '@/types';

type LogMember = { id: string; full_name: string; is_leader?: boolean | null };
type LogRecord = {
  youth_member_id: string;
  status: string | null;
  present: boolean | null;
  in_status: string | null;
  out_status: string | null;
  in_otp_session_id: string | null;
  out_otp_session_id: string | null;
};
type Filter = 'all' | 'present' | 'absent' | 'pending';

function phaseOf(event: YouthEvent, now: number): 'live' | 'upcoming' | 'ended' {
  const start = new Date(`${event.event_date}T${event.start_time || '00:00:00'}`).getTime();
  const end = new Date(`${event.event_date}T${event.end_time || '23:59:59'}`).getTime();
  if (now < start) return 'upcoming';
  if (now > end) return 'ended';
  return 'live';
}

const step = (status: string | null, otpId: string | null) => (status === 'approved' ? 'Approved' : otpId ? 'Submitted' : 'Not entered');

// Attendance log of one church at a time, event by event. View only.
export function ChurchAttendanceLog({ churches }: { churches: Church[] }) {
  const [churchId, setChurchId] = useState('');
  const [events, setEvents] = useState<YouthEvent[]>([]);
  const [eventId, setEventId] = useState('');
  const [members, setMembers] = useState<LogMember[]>([]);
  const [records, setRecords] = useState<LogRecord[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(false);

  // Events of the chosen church (its local events plus the pastorate events), current/upcoming first
  useEffect(() => {
    if (!churchId) { setEvents([]); setEventId(''); setMembers([]); setRecords([]); return; }
    const load = async () => {
      const [{ data: eventData }, { data: memberData }] = await Promise.all([
        supabase.from('youth_events').select('id, title, description, venue, event_date, start_time, end_time, scope, church_id, created_by, created_at').or(`church_id.eq.${churchId},scope.eq.pastorate`).order('event_date'),
        supabase.from('youth_members').select('id, full_name, is_leader').eq('church_id', churchId).order('full_name'),
      ]);
      const now = Date.now();
      const rank = { live: 0, upcoming: 1, ended: 2 } as const;
      const sorted = ((eventData as YouthEvent[]) || []).sort((a, b) => {
        const pa = phaseOf(a, now);
        const pb = phaseOf(b, now);
        if (pa !== pb) return rank[pa] - rank[pb];
        const ta = new Date(`${a.event_date}T${a.start_time || '00:00:00'}`).getTime();
        const tb = new Date(`${b.event_date}T${b.start_time || '00:00:00'}`).getTime();
        return pa === 'ended' ? tb - ta : ta - tb;
      });
      setEvents(sorted);
      setEventId(sorted[0]?.id || '');
      setMembers((memberData as LogMember[]) || []);
    };
    load();
  }, [churchId]);

  useEffect(() => {
    if (!churchId || !eventId) { setRecords([]); return; }
    const load = async () => {
      setLoading(true);
      const { data } = await supabase.from('attendance').select('youth_member_id, status, present, in_status, out_status, in_otp_session_id, out_otp_session_id').eq('event_id', eventId).eq('church_id', churchId);
      setRecords((data as LogRecord[]) || []);
      setLoading(false);
    };
    load();
  }, [churchId, eventId]);

  const event = events.find((item) => item.id === eventId) || null;
  const closed = event ? phaseOf(event, Date.now()) === 'ended' : false;

  const rows = useMemo(() => {
    const byMember = new Map(records.map((record) => [record.youth_member_id, record]));
    return members
      .filter((member) => !member.is_leader || byMember.has(member.id))
      .map((member) => {
        const record = byMember.get(member.id);
        const present = Boolean(record && (record.present === true || record.status === 'approved'));
        const rejected = record?.status === 'rejected';
        const final: 'Present' | 'Absent' | 'Pending' = present ? 'Present' : rejected || closed ? 'Absent' : 'Pending';
        return { member, final, inLabel: step(record?.in_status ?? null, record?.in_otp_session_id ?? null), outLabel: step(record?.out_status ?? null, record?.out_otp_session_id ?? null) };
      });
  }, [members, records, closed]);

  const count = (value: 'Present' | 'Absent' | 'Pending') => rows.filter((row) => row.final === value).length;
  const visible = rows.filter((row) => filter === 'all' || row.final.toLowerCase() === filter);
  // One file per event: the event on screen, for the church chosen
  const exportData: AttendanceExportData | null = event ? {
    eventTitle: event.title,
    eventDate: event.event_date,
    venue: event.venue,
    scopeLabel: churches.find((church) => church.id === churchId)?.name,
    rows: rows.map((row) => ({ name: row.member.full_name, inStatus: row.inLabel, outStatus: row.outLabel, result: row.final })),
  } : null;
  const pill = (label: string) => <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${label === 'Approved' ? 'bg-emerald-50 text-emerald-700' : label === 'Submitted' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>{label}</span>;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="p-5 border-b border-gray-100">
        <h2 className="font-bold text-gray-900 flex items-center gap-2"><ClipboardList size={18} className="text-orange-600" /> Attendance log</h2>
        <p className="text-sm text-gray-500 mt-1">Pick a church, then an event, to see who was present. View only.</p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <select value={churchId} onChange={(e) => setChurchId(e.target.value)} className="flex-1 px-3 py-2.5 rounded-lg border border-gray-300 text-sm">
            <option value="">Select a church...</option>
            {churches.map((church) => <option key={church.id} value={church.id}>{church.name}</option>)}
          </select>
          <select value={eventId} onChange={(e) => setEventId(e.target.value)} disabled={!churchId || events.length === 0} className="flex-1 px-3 py-2.5 rounded-lg border border-gray-300 text-sm disabled:bg-gray-50">
            {events.length === 0 ? <option value="">{churchId ? 'No events' : 'Select a church first'}</option> : events.map((item) => <option key={item.id} value={item.id}>{item.scope === 'pastorate' ? '[Pastorate] ' : ''}{item.title} · {new Date(`${item.event_date}T00:00:00`).toLocaleDateString()}</option>)}
          </select>
        </div>
        <div className="mt-3"><AttendanceDownloadButtons data={exportData} /></div>
      </div>

      {!churchId ? (
        <p className="p-6 text-center text-sm text-gray-400">Select a church to see its attendance.</p>
      ) : !event ? (
        <p className="p-6 text-center text-sm text-gray-400">This church has no events yet.</p>
      ) : (
        <>
          <div className="p-5 grid grid-cols-3 gap-3 border-b border-gray-100">
            <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3 text-center"><p className="text-2xl font-extrabold text-emerald-700">{count('Present')}</p><p className="text-xs font-semibold text-emerald-700">Present</p></div>
            <div className="rounded-xl bg-red-50 border border-red-100 p-3 text-center"><p className="text-2xl font-extrabold text-red-700">{count('Absent')}</p><p className="text-xs font-semibold text-red-700">Absent</p></div>
            <div className="rounded-xl bg-amber-50 border border-amber-100 p-3 text-center"><p className="text-2xl font-extrabold text-amber-700">{count('Pending')}</p><p className="text-xs font-semibold text-amber-700">Pending</p></div>
          </div>
          <div className="px-5 pt-4 flex flex-wrap gap-2">
            {(['all', 'present', 'absent', 'pending'] as const).map((key) => (
              <button key={key} onClick={() => setFilter(key)} className={`px-3 py-1.5 rounded-full text-xs font-bold capitalize ${filter === key ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{key === 'all' ? `All (${rows.length})` : `${key} (${count(key === 'present' ? 'Present' : key === 'absent' ? 'Absent' : 'Pending')})`}</button>
            ))}
          </div>
          <div className="p-5 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left">
              <thead className="border-b border-gray-200">
                <tr>
                  <th className="py-3 pr-4 text-xs uppercase tracking-wider text-gray-500">Member</th>
                  <th className="py-3 pr-4 text-xs uppercase tracking-wider text-gray-500">IN</th>
                  <th className="py-3 pr-4 text-xs uppercase tracking-wider text-gray-500">OUT</th>
                  <th className="py-3 text-xs uppercase tracking-wider text-gray-500">Attendance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr><td colSpan={4} className="py-8 text-center text-sm text-gray-400">Loading...</td></tr>
                ) : visible.length === 0 ? (
                  <tr><td colSpan={4} className="py-8 text-center text-sm text-gray-400">No members in this list.</td></tr>
                ) : visible.map((row) => (
                  <tr key={row.member.id}>
                    <td className="py-3 pr-4 text-sm font-semibold text-gray-900">{row.member.full_name}{row.member.is_leader && <span className="ml-2 text-xs font-normal text-gray-400">Leader</span>}</td>
                    <td className="py-3 pr-4">{pill(row.inLabel)}</td>
                    <td className="py-3 pr-4">{pill(row.outLabel)}</td>
                    <td className="py-3"><span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${row.final === 'Present' ? 'bg-emerald-50 text-emerald-700' : row.final === 'Absent' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>{row.final}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}