import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarPlus, Search } from 'lucide-react';
import { Alert } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { Church, YouthEvent } from '@/types';
import { ROLE_LABELS } from '@/types';
import type { UserRole } from '@/types';

type PastorateEvent = YouthEvent & { audience_roles?: string[] | null; audience_member_ids?: string[] | null; audience_user_ids?: string[] | null };
type PickMember = { id: string; full_name: string; role: string; church_id: string | null };

const eventFields = 'id, title, description, venue, event_date, start_time, end_time, scope, church_id, created_by, created_at, audience_roles, audience_member_ids, audience_user_ids';
const emptyForm = { title: '', description: '', venue: '', eventDate: '', startTime: '', endTime: '' };

// Groups of people an event can be limited to. (A "Local Joint Secretary" option can be added here once that role exists.)
const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: 'youth_member', label: 'All youth members' },
  { value: 'local_youth_secretary', label: 'Local Youth Secretaries (all churches)' },
  { value: 'local_youth_treasurer', label: 'Local Youth Treasurers (all churches)' },
  { value: 'pc_member', label: 'PC Members (all churches)' },
];

function phaseOf(event: YouthEvent, now: number): 'live' | 'upcoming' | 'ended' {
  const start = new Date(`${event.event_date}T${event.start_time || '00:00:00'}`).getTime();
  const end = new Date(`${event.event_date}T${event.end_time || '23:59:59'}`).getTime();
  if (now < start) return 'upcoming';
  if (now > end) return 'ended';
  return 'live';
}

function describeAudience(event: PastorateEvent) {
  const roles = event.audience_roles || [];
  const members = [...(event.audience_user_ids || []), ...(event.audience_member_ids || [])];
  if (roles.length === 0 && members.length === 0) return 'Everyone';
  const parts = roles.map((role) => ROLE_OPTIONS.find((option) => option.value === role)?.label.replace(' (all churches)', '') || role);
  if (members.length > 0) parts.push(`${members.length} selected ${members.length > 1 ? 'people' : 'person'}`);
  return parts.join(', ');
}

// Pastorate Convener: add pastorate events for everyone or for chosen groups / youth members. Events cannot be edited or removed here.
export function PastorateEventsSection() {
  const { profile } = useAuth();
  const [events, setEvents] = useState<PastorateEvent[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [audienceMode, setAudienceMode] = useState<'all' | 'custom'>('all');
  const [roles, setRoles] = useState<string[]>([]);
  const [pickSpecific, setPickSpecific] = useState(false);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [people, setPeople] = useState<PickMember[]>([]);
  const [churches, setChurches] = useState<Church[]>([]);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from('youth_events').select(eventFields).eq('scope', 'pastorate').order('event_date');
    setEvents((data as PastorateEvent[]) || []);
  }, []);

  useEffect(() => { load(); }, [load]);

  // The list of youth members (all churches) is only loaded when the convener wants to pick specific ones
  useEffect(() => {
    if (!pickSpecific || people.length > 0) return;
    const loadPeople = async () => {
      // Youth members, local secretaries and treasurers, and PC members of every church
      const [{ data: memberData }, { data: churchData }] = await Promise.all([
        supabase.rpc('people_directory'),
        supabase.from('churches').select('id, name, location, created_at').order('name'),
      ]);
      setPeople((memberData as PickMember[]) || []);
      setChurches((churchData as Church[]) || []);
    };
    loadPeople();
  }, [pickSpecific, people.length]);

  const churchName = (id: string | null) => churches.find((church) => church.id === id)?.name || '';
  const roleName = (role: string) => ROLE_LABELS[role as UserRole] || role;
  const visiblePeople = useMemo(() => {
    const term = search.trim().toLowerCase();
    return people.filter((person) => !term || person.full_name.toLowerCase().includes(term) || churchName(person.church_id).toLowerCase().includes(term) || roleName(person.role).toLowerCase().includes(term));
  }, [people, search, churches]);

  const toggleRole = (value: string) => setRoles((current) => (current.includes(value) ? current.filter((role) => role !== value) : [...current, value]));
  const toggleMember = (id: string) => setMemberIds((current) => (current.includes(id) ? current.filter((memberId) => memberId !== id) : [...current, id]));

  const createEvent = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!profile?.id || !form.title.trim() || !form.eventDate || saving) return;
    if (form.startTime && form.endTime && form.endTime <= form.startTime) { setError('The end time must be after the start time.'); return; }
    const chosenRoles = audienceMode === 'custom' ? roles : [];
    const chosenMembers = audienceMode === 'custom' && pickSpecific ? memberIds : [];
    if (audienceMode === 'custom' && chosenRoles.length === 0 && chosenMembers.length === 0) { setError('Choose who this event is for, or switch back to Everyone.'); return; }
    setSaving(true);
    setError(null);
    const { error: insertError } = await supabase.from('youth_events').insert({
      title: form.title.trim(),
      description: form.description.trim(),
      venue: form.venue.trim(),
      event_date: form.eventDate,
      start_time: form.startTime || null,
      end_time: form.endTime || null,
      scope: 'pastorate',
      church_id: null,
      created_by: profile.id,
      audience_roles: chosenRoles.length > 0 ? chosenRoles : null,
      audience_user_ids: chosenMembers.length > 0 ? chosenMembers : null,
    });
    if (insertError) setError(`Could not create this event: ${insertError.message}`);
    else {
      setForm(emptyForm);
      setAudienceMode('all');
      setRoles([]);
      setMemberIds([]);
      setPickSpecific(false);
      setSuccess('Pastorate event created.');
      setTimeout(() => setSuccess(null), 3500);
      await load();
    }
    setSaving(false);
  };

  const now = Date.now();
  const rank = { live: 0, upcoming: 1, ended: 2 } as const;
  const sorted = [...events].sort((a, b) => {
    const pa = phaseOf(a, now);
    const pb = phaseOf(b, now);
    if (pa !== pb) return rank[pa] - rank[pb];
    const ta = new Date(`${a.event_date}T${a.start_time || '00:00:00'}`).getTime();
    const tb = new Date(`${b.event_date}T${b.start_time || '00:00:00'}`).getTime();
    return pa === 'ended' ? tb - ta : ta - tb;
  });

  return (
    <section className="space-y-6">
      {error && <Alert type="error" message={error} />}
      {success && <Alert type="success" message={success} />}

      <form onSubmit={createEvent} className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="p-5 border-b border-gray-100">
          <h2 className="font-bold text-gray-900 flex items-center gap-2"><CalendarPlus size={18} className="text-orange-600" /> Add a pastorate event</h2>
          <p className="text-sm text-gray-500 mt-1">Choose whether the whole pastorate or only certain people can see and attend it.</p>
        </div>
        <div className="p-5 grid gap-4 sm:grid-cols-2">
          <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Event title *" className="sm:col-span-2 rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
          <input value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} placeholder="Venue" className="sm:col-span-2 rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
          <label className="block"><span className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">Date *</span><input required type="date" value={form.eventDate} onChange={(e) => setForm({ ...form, eventDate: e.target.value })} className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">Starts</span><input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} className="w-full rounded-xl border border-gray-300 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" /></label>
            <label className="block"><span className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">Ends</span><input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} className="w-full rounded-xl border border-gray-300 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" /></label>
          </div>
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} placeholder="Description" className="sm:col-span-2 rounded-xl border border-gray-300 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />

          <div className="sm:col-span-2 rounded-xl border border-gray-200 bg-gray-50 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Who is this event for?</p>
            <div className="mt-3 flex flex-wrap gap-4 text-sm font-semibold text-gray-700">
              <label className="flex items-center gap-2"><input type="radio" name="audience" checked={audienceMode === 'all'} onChange={() => setAudienceMode('all')} className="accent-orange-500" /> Everyone in the pastorate</label>
              <label className="flex items-center gap-2"><input type="radio" name="audience" checked={audienceMode === 'custom'} onChange={() => setAudienceMode('custom')} className="accent-orange-500" /> Choose who</label>
            </div>

            {audienceMode === 'custom' && (
              <div className="mt-4 space-y-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  {ROLE_OPTIONS.map((option) => (
                    <label key={option.value} className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm">
                      <input type="checkbox" checked={roles.includes(option.value)} onChange={() => toggleRole(option.value)} className="h-4 w-4 accent-orange-500" /> {option.label}
                    </label>
                  ))}
                  <label className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm">
                    <input type="checkbox" checked={pickSpecific} onChange={(e) => setPickSpecific(e.target.checked)} className="h-4 w-4 accent-orange-500" /> Specific people: youth members, local secretaries and treasurers, PC members
                  </label>
                </div>

                {pickSpecific && (
                  <div className="rounded-lg border border-gray-200 bg-white">
                    <div className="flex items-center justify-between gap-3 border-b border-gray-100 p-3">
                      <div className="relative flex-1">
                        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, role or church" className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                      </div>
                      <span className="shrink-0 text-xs font-bold text-orange-600">{memberIds.length} selected</span>
                    </div>
                    <div className="max-h-64 divide-y divide-gray-100 overflow-y-auto">
                      {visiblePeople.length === 0 ? (
                        <p className="p-4 text-center text-sm text-gray-400">{people.length === 0 ? 'Loading people...' : 'No one matches.'}</p>
                      ) : visiblePeople.map((person) => (
                        <label key={person.id} className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm hover:bg-gray-50">
                          <input type="checkbox" checked={memberIds.includes(person.id)} onChange={() => toggleMember(person.id)} className="h-4 w-4 accent-orange-500" />
                          <span className="min-w-0 flex-1 truncate font-medium text-gray-800">{person.full_name}</span>
                          <span className="shrink-0 rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-semibold text-orange-700">{roleName(person.role)}</span>
                          <span className="hidden shrink-0 text-xs text-gray-400 sm:inline">{churchName(person.church_id)}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="sm:col-span-2">
            <button disabled={saving} className="rounded-xl bg-orange-500 px-5 py-3 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-50">{saving ? 'Saving...' : 'Add event'}</button>
            <p className="mt-2 text-xs text-gray-400">Set a start and end time so OTPs and reminders work for this event.</p>
          </div>
        </div>
      </form>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="p-5 border-b border-gray-100"><h2 className="font-bold text-gray-900">Pastorate events</h2><p className="text-sm text-gray-500 mt-1">Current and upcoming events first.</p></div>
        {sorted.length === 0 ? (
          <p className="p-6 text-sm text-gray-400 text-center">No pastorate events yet.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {sorted.map((event) => {
              const phase = phaseOf(event, now);
              return (
                <div key={event.id} className={`p-4 flex items-start justify-between gap-3 ${phase === 'ended' ? 'opacity-70' : ''}`}>
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900">{event.title}</p>
                    <p className="text-sm text-gray-500 mt-1">{new Date(`${event.event_date}T00:00:00`).toLocaleDateString()}{event.start_time ? ` · ${event.start_time.slice(0, 5)}` : ''}{event.end_time ? ` – ${event.end_time.slice(0, 5)}` : ''} · {event.venue || 'Venue pending'}</p>
                    <p className="mt-1 text-xs font-semibold text-orange-600">For: {describeAudience(event)}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${phase === 'live' ? 'bg-emerald-100 text-emerald-700' : phase === 'upcoming' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>{phase === 'live' ? 'Happening now' : phase === 'upcoming' ? 'Upcoming' : 'Ended'}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}