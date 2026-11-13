import { useEffect, useMemo, useState } from 'react';
import { Check, UserCheck, X } from 'lucide-react';
import { Alert } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { Church, YouthEvent } from '@/types';

type Row = { id: string; full_name: string; is_leader?: boolean | null };
type Rec = { id: string; youth_member_id: string; status: string | null; present: boolean | null; manual_override: boolean | null };

const eventFields = 'id, title, description, venue, event_date, start_time, end_time, scope, church_id, created_by, created_at';

// Super Admin: mark a youth member Present or Absent for an event by hand. The member sees the result in their Attendance page.
export function ManualAttendance() {
  const { profile } = useAuth();
  const [churches, setChurches] = useState<Church[]>([]);
  const [churchId, setChurchId] = useState('');
  const [events, setEvents] = useState<YouthEvent[]>([]);
  const [eventId, setEventId] = useState('');
  const [members, setMembers] = useState<Row[]>([]);
  const [records, setRecords] = useState<Rec[]>([]);
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    supabase.from('churches').select('id, name, location, created_at').order('name').then(({ data }) => setChurches((data as Church[]) || []));
  }, []);

  useEffect(() => {
    if (!churchId) { setEvents([]); setEventId(''); setMembers([]); return; }
    const load = async () => {
      const [{ data: eventData }, { data: memberData }] = await Promise.all([
        supabase.from('youth_events').select(eventFields).or(`church_id.eq.${churchId},scope.eq.pastorate`).order('event_date', { ascending: false }),
        supabase.from('youth_members').select('id, full_name, is_leader').eq('church_id', churchId).order('full_name'),
      ]);
      const list = (eventData as YouthEvent[]) || [];
      setEvents(list);
      setEventId(list[0]?.id || '');
      setMembers((memberData as Row[]) || []);
    };
    load();
  }, [churchId]);

  const loadRecords = async () => {
    if (!churchId || !eventId) { setRecords([]); return; }
    const { data } = await supabase.from('attendance').select('id, youth_member_id, status, present, manual_override').eq('event_id', eventId).eq('church_id', churchId);
    setRecords((data as Rec[]) || []);
  };
  useEffect(() => { loadRecords(); }, [churchId, eventId]);

  const event = events.find((item) => item.id === eventId) || null;
  const byMember = useMemo(() => new Map(records.map((record) => [record.youth_member_id, record])), [records]);
  const visible = members
    .filter((member) => !member.is_leader || byMember.has(member.id))
    .filter((member) => member.full_name.toLowerCase().includes(search.trim().toLowerCase()));

  const mark = async (member: Row, kind: 'present' | 'absent') => {
    if (!profile?.id || !event || busyId) return;
    setBusyId(member.id);
    setError(null);
    const now = new Date().toISOString();
    const patch = kind === 'present'
      ? { status: 'approved', present: true, in_status: 'approved', out_status: 'approved', approved_by: profile.id, approved_at: now, in_approved_by: profile.id, in_approved_at: now, out_approved_by: profile.id, out_approved_at: now, manual_override: true }
      : { status: 'rejected', present: false, manual_override: true };
    const existing = byMember.get(member.id);
    const result = existing
      ? await supabase.from('attendance').update(patch).eq('id', existing.id)
      : await supabase.from('attendance').insert({ ...patch, event_id: event.id, youth_member_id: member.id, church_id: churchId, marked_by: profile.id, attendance_date: event.event_date, feedback_submitted: false });
    if (result.error) setError(`Could not update attendance: ${result.error.message}`);
    else {
      setSuccess(`${member.full_name} marked ${kind}.`);
      setTimeout(() => setSuccess(null), 2500);
      await loadRecords();
    }
    setBusyId(null);
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="p-5 border-b border-gray-100">
        <h2 className="font-bold text-gray-900 flex items-center gap-2"><UserCheck size={18} className="text-orange-600" /> Manual attendance</h2>
        <p className="text-sm text-gray-500 mt-1">Mark a member Present or Absent for an event. It shows in their Attendance page straight away.</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <select value={churchId} onChange={(e) => setChurchId(e.target.value)} className="px-3 py-2.5 rounded-lg border border-gray-300 text-sm">
            <option value="">Select a church...</option>
            {churches.map((church) => <option key={church.id} value={church.id}>{church.name}</option>)}
          </select>
          <select value={eventId} onChange={(e) => setEventId(e.target.value)} disabled={!churchId || events.length === 0} className="px-3 py-2.5 rounded-lg border border-gray-300 text-sm disabled:bg-gray-50">
            {events.length === 0 ? <option value="">{churchId ? 'No events' : 'Select a church first'}</option> : events.map((item) => <option key={item.id} value={item.id}>{item.scope === 'pastorate' ? '[Pastorate] ' : ''}{item.title} · {new Date(`${item.event_date}T00:00:00`).toLocaleDateString()}</option>)}
          </select>
        </div>
      </div>

      {error && <div className="m-4"><Alert type="error" message={error} /></div>}
      {success && <div className="m-4"><Alert type="success" message={success} /></div>}

      {!event ? (
        <p className="p-6 text-center text-sm text-gray-400">Choose a church and an event to mark attendance.</p>
      ) : (
        <div className="p-5">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name" className="mb-3 w-full sm:w-64 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
          {visible.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">No members to show.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {visible.map((member) => {
                const record = byMember.get(member.id);
                const present = record?.status === 'approved' || record?.present === true;
                const absent = record?.status === 'rejected';
                return (
                  <div key={member.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{member.full_name}</p>
                      <p className="mt-0.5 text-xs text-gray-400">
                        {present ? 'Present' : absent ? 'Absent' : 'Not marked'}{record?.manual_override ? ' · set manually' : ''}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button disabled={busyId === member.id} onClick={() => mark(member, 'present')} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50 ${present ? 'bg-emerald-500 text-white' : 'border border-emerald-300 text-emerald-700 hover:bg-emerald-50'}`}><Check size={14} /> Present</button>
                      <button disabled={busyId === member.id} onClick={() => mark(member, 'absent')} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50 ${absent ? 'bg-red-500 text-white' : 'border border-red-300 text-red-700 hover:bg-red-50'}`}><X size={14} /> Absent</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}