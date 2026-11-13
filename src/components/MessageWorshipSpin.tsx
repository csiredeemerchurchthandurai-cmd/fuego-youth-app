import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Mic } from 'lucide-react';
import { Alert } from '@/components/ui';
import { SpinWheel, WHEEL_COLORS } from '@/components/SpinWheel';
import type { WheelItem } from '@/components/SpinWheel';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { YouthEvent } from '@/types';

type Member = { id: string; full_name: string; is_leader?: boolean | null };
type Assignment = { id: string; service_date: string; message_member_id: string | null; message_name: string; worship_member_id: string | null; worship_name: string };

// A person who did Message (or Worship) can do the same again only after this many days
const COOLDOWN_DAYS = 14;

const toDate = (value: string) => new Date(`${value}T00:00:00`);
const toIso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const addDays = (value: string, days: number) => { const date = toDate(value); date.setDate(date.getDate() + days); return toIso(date); };
const daysBetween = (later: string, earlier: string) => Math.round((toDate(later).getTime() - toDate(earlier).getTime()) / 86400000);

// Local Youth Treasurer: pick next week's Message and Worship persons by spinning a wheel.
// The wheel holds the members who were present on the chosen day. Nobody does both roles in the same week,
// and nobody repeats a role within two weeks. Spinning is unlimited; "Assign" saves the final choice.
export function MessageWorshipSpin() {
  const { profile } = useAuth();
  const churchId = profile?.church_id;
  const [events, setEvents] = useState<YouthEvent[]>([]);
  const [eventId, setEventId] = useState('');
  const [present, setPresent] = useState<Member[]>([]);
  const [allMembers, setAllMembers] = useState<Member[]>([]);
  const [useAll, setUseAll] = useState(false);
  const [history, setHistory] = useState<Assignment[]>([]);
  const [serviceDate, setServiceDate] = useState('');
  const [messagePick, setMessagePick] = useState<WheelItem | null>(null);
  const [worshipPick, setWorshipPick] = useState<WheelItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    if (!churchId) return;
    const { data } = await supabase.from('service_assignments').select('id, service_date, message_member_id, message_name, worship_member_id, worship_name').eq('church_id', churchId).order('service_date', { ascending: false }).limit(40);
    setHistory((data as Assignment[]) || []);
  }, [churchId]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  // The church's own events; start on the latest one that has already happened
  useEffect(() => {
    if (!churchId) return;
    supabase.from('youth_events').select('id, title, description, venue, event_date, start_time, end_time, scope, church_id, created_by, created_at').eq('church_id', churchId).order('event_date', { ascending: false }).then(({ data }) => {
      const list = (data as YouthEvent[]) || [];
      const today = toIso(new Date());
      setEvents(list);
      setEventId((list.find((event) => event.event_date <= today) || list[0])?.id || '');
    });
  }, [churchId]);

  const event = events.find((item) => item.id === eventId) || null;

  // Members who were present on that day
  useEffect(() => {
    setMessagePick(null);
    setWorshipPick(null);
    if (!churchId || !event) { setPresent([]); return; }
    setServiceDate(addDays(event.event_date, 7));
    const load = async () => {
      // Members whose IN OTP was approved on that day (youth members and the church's own admins / pastorate members / PC members)
      const [{ data: attendance }, { data: members }, { data: people }] = await Promise.all([
        supabase.from('attendance').select('youth_member_id, in_status, status, present').eq('event_id', event.id).eq('church_id', churchId),
        supabase.from('youth_members').select('id, full_name, is_leader, email').eq('church_id', churchId).order('full_name'),
        supabase.rpc('church_people', { target_church: churchId }),
      ]);
      // Church admins are left out of Message and Worship; other admins who were present can be picked
      const adminEmails = new Set(((people as { role_key: string; email: string | null }[]) || []).filter((person) => person.role_key === 'church_admin' && person.email).map((person) => (person.email as string).toLowerCase()));
      const pickable = ((members as (Member & { email?: string | null })[]) || []).filter((member) => !member.email || !adminEmails.has(member.email.toLowerCase()));
      const presentIds = new Set(((attendance as { youth_member_id: string; in_status: string | null; status: string | null; present: boolean | null }[]) || [])
        .filter((row) => row.in_status === 'approved' || row.status === 'approved' || row.present === true).map((row) => row.youth_member_id));
      setAllMembers(pickable);
      setPresent(pickable.filter((member) => presentIds.has(member.id)));
    };
    load();
  }, [churchId, event?.id]);

  useEffect(() => { setMessagePick(null); setWorshipPick(null); }, [serviceDate]);

  // Last time each person did each role before the week being planned (the week being planned is overwritten, not counted)
  const lastDone = useMemo(() => {
    const message = new Map<string, string>();
    const worship = new Map<string, string>();
    history.filter((item) => serviceDate && item.service_date < serviceDate).forEach((item) => {
      if (item.message_member_id && (!message.has(item.message_member_id) || message.get(item.message_member_id)! < item.service_date)) message.set(item.message_member_id, item.service_date);
      if (item.worship_member_id && (!worship.has(item.worship_member_id) || worship.get(item.worship_member_id)! < item.service_date)) worship.set(item.worship_member_id, item.service_date);
    });
    return { message, worship };
  }, [history, serviceDate]);

  const eligible = (role: 'message' | 'worship', member: Member) => {
    const last = lastDone[role].get(member.id);
    return !last || daysBetween(serviceDate, last) >= COOLDOWN_DAYS;
  };

  const toItem = (member: Member): WheelItem => ({ id: member.id, label: member.full_name, tag: member.is_leader ? 'Leader' : undefined });
  // Normally the members present that day; optionally everyone in the church
  const candidates = useAll ? allMembers : present;
  const messagePool = candidates.filter((member) => eligible('message', member) && member.id !== worshipPick?.id).map(toItem);
  const worshipPool = candidates.filter((member) => eligible('worship', member) && member.id !== messagePick?.id).map(toItem);
  const resting = candidates.filter((member) => !eligible('message', member) || !eligible('worship', member));

  const assign = async () => {
    if (!profile?.id || !churchId || !messagePick || !worshipPick || !serviceDate || saving) return;
    setSaving(true);
    setError(null);
    const { error: saveError } = await supabase.from('service_assignments').upsert({
      church_id: churchId,
      service_date: serviceDate,
      message_member_id: messagePick.id,
      message_name: messagePick.label,
      worship_member_id: worshipPick.id,
      worship_name: worshipPick.label,
      assigned_by: profile.id,
    }, { onConflict: 'church_id,service_date' });
    if (saveError) setError(`Could not assign: ${saveError.message}`);
    else {
      setSuccess(`Assigned for ${toDate(serviceDate).toLocaleDateString()}: Message by ${messagePick.label}, Worship by ${worshipPick.label}.`);
      setTimeout(() => setSuccess(null), 6000);
      setMessagePick(null);
      setWorshipPick(null);
      await loadHistory();
    }
    setSaving(false);
  };

  const resultBox = (label: string, pick: WheelItem | null) => (
    <div className={`mt-4 w-full max-w-xs rounded-xl border p-4 text-center ${pick ? 'border-orange-200 bg-orange-50' : 'border-dashed border-gray-300 bg-gray-50'}`}>
      <p className="text-xs font-bold uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-1 text-lg font-extrabold ${pick ? 'text-orange-700' : 'text-gray-300'}`}>{pick ? pick.label : 'Not picked yet'}</p>
    </div>
  );

  return (
    <section className="space-y-6">
      {error && <Alert type="error" message={error} />}
      {success && <Alert type="success" message={success} />}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="p-5 border-b border-gray-100">
          <h2 className="font-bold text-gray-900 flex items-center gap-2"><Mic size={18} className="text-orange-600" /> Message &amp; Worship wheel</h2>
          <p className="text-sm text-gray-500 mt-1">Spin as many times as you like. Names come from the members who were present, and nobody repeats a role within 2 weeks or does both in the same week.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">Members present on</span>
              <select value={eventId} onChange={(e) => setEventId(e.target.value)} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm">
                {events.length === 0 && <option value="">No events</option>}
                {events.map((item) => <option key={item.id} value={item.id}>{item.title} · {toDate(item.event_date).toLocaleDateString()}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">Message &amp; Worship for (next week)</span>
              <input type="date" value={serviceDate} onChange={(e) => setServiceDate(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm" />
            </label>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-gray-500">{present.length} {present.length === 1 ? 'person' : 'people'} with an approved IN OTP that day (youth members and your church's leaders){present.length === 0 ? '. Approve IN attendance for that day first, or tick the box to use everyone.' : '.'}</p>
            <label className="flex items-center gap-2 text-xs font-semibold text-gray-700"><input type="checkbox" checked={useAll} onChange={(e) => { setUseAll(e.target.checked); setMessagePick(null); setWorshipPick(null); }} className="h-4 w-4 accent-orange-500" /> Use everyone in the church ({allMembers.length})</label>
          </div>
        </div>

        <div className="grid gap-10 p-6 sm:grid-cols-2">
          <div className="flex flex-col items-center">
            <SpinWheel title="Message" items={messagePool} onResult={setMessagePick} />
            {resultBox('Message by', messagePick)}
            <p className="mt-2 text-xs text-gray-400">{messagePool.length} on the wheel</p>
            <div className="mt-2 flex max-w-xs flex-wrap justify-center gap-1.5">{messagePool.map((item, index) => <span key={item.id} style={{ backgroundColor: WHEEL_COLORS[index % WHEEL_COLORS.length] }} className="rounded-full px-2.5 py-1 text-xs font-bold text-white">{item.label}{item.tag ? ` · ${item.tag}` : ''}</span>)}</div>
          </div>
          <div className="flex flex-col items-center">
            <SpinWheel title="Worship" items={worshipPool} onResult={setWorshipPick} />
            {resultBox('Worship by', worshipPick)}
            <p className="mt-2 text-xs text-gray-400">{worshipPool.length} on the wheel</p>
            <div className="mt-2 flex max-w-xs flex-wrap justify-center gap-1.5">{worshipPool.map((item, index) => <span key={item.id} style={{ backgroundColor: WHEEL_COLORS[index % WHEEL_COLORS.length] }} className="rounded-full px-2.5 py-1 text-xs font-bold text-white">{item.label}{item.tag ? ` · ${item.tag}` : ''}</span>)}</div>
          </div>
        </div>

        <div className="border-t border-gray-100 p-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-gray-500">{messagePick && worshipPick ? 'Happy with the result? Assign it.' : 'Spin both wheels to enable Assign.'}</p>
          <button onClick={assign} disabled={!messagePick || !worshipPick || !serviceDate || saving} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-40">
            <Check size={16} /> {saving ? 'Assigning...' : 'Assign'}
          </button>
        </div>
      </div>

      {resting.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h3 className="font-bold text-gray-900 text-sm">Resting this week</h3>
          <p className="mt-1 text-xs text-gray-500">These present members did a role less than 2 weeks before this date, so they are left off that wheel.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {resting.map((member) => (
              <span key={member.id} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                {member.full_name}{!eligible('message', member) ? ' · message' : ''}{!eligible('worship', member) ? ' · worship' : ''}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="p-5 border-b border-gray-100"><h3 className="font-bold text-gray-900">Recent assignments</h3></div>
        {history.length === 0 ? (
          <p className="p-6 text-center text-sm text-gray-400">Nothing assigned yet.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {history.slice(0, 8).map((item) => (
              <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                <span className="font-semibold text-gray-900">{toDate(item.service_date).toLocaleDateString()}</span>
                <span className="text-gray-600">Message: <b>{item.message_name}</b> · Worship: <b>{item.worship_name}</b></span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}