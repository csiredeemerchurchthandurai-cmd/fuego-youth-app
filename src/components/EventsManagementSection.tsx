import { useCallback, useEffect, useState } from 'react';
import { CalendarPlus, Pencil, Trash2, Eye, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Alert } from '@/components/ui';
import { EventStatusModal } from '@/components/EventStatusModal';
import type { Church, UserRole, YouthEvent } from '@/types';

interface EventsManagementSectionProps {
  role: UserRole;
  churchId: string | null;
  churches?: Church[];
}

const fields = 'id, title, description, venue, event_date, start_time, end_time, scope, church_id, created_by, created_at';
type EventForm = { title: string; description: string; venue: string; eventDate: string; startTime: string; endTime: string; scope: 'local' | 'pastorate'; selectedChurch: string };

const emptyForm = (scope: 'local' | 'pastorate', churchId: string | null): EventForm => ({ title: '', description: '', venue: '', eventDate: '', startTime: '', endTime: '', scope, selectedChurch: churchId || '' });

export function EventsManagementSection({ role, churchId, churches = [] }: EventsManagementSectionProps) {
  const isSuperAdmin = role === 'super_admin';
  const canManageEvents = isSuperAdmin || role === 'church_admin';
  const [events, setEvents] = useState<YouthEvent[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<YouthEvent | null>(null);
  const [form, setForm] = useState<EventForm>(emptyForm('local', churchId));

  const loadEvents = useCallback(async () => {
    const query = supabase.from('youth_events').select(fields).order('event_date', { ascending: true });
    const { data } = isSuperAdmin ? await query : await query.eq('church_id', churchId || '');
    setEvents((data as YouthEvent[]) || []);
  }, [churchId, isSuperAdmin]);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  const saveEvent = async (event: React.FormEvent) => {
    event.preventDefault();
    const selectedChurch = form.scope === 'local' ? (isSuperAdmin ? form.selectedChurch : churchId) : null;
    if (!form.title || !form.eventDate || (form.scope === 'local' && !selectedChurch)) return;
    const values = { title: form.title, description: form.description, venue: form.venue, event_date: form.eventDate, start_time: form.startTime || null, end_time: form.endTime || null, scope: form.scope, church_id: selectedChurch };
    const result = editingId
      ? await supabase.from('youth_events').update(values).eq('id', editingId).select(fields).maybeSingle()
      : await supabase.from('youth_events').insert({ ...values, created_by: (await supabase.auth.getUser()).data.user?.id }).select(fields).maybeSingle();
    if (result.error || !result.data) { setMessage('Could not save this event.'); return; }
    setEvents((current) => editingId ? current.map((item) => item.id === editingId ? result.data as YouthEvent : item) : [...current, result.data as YouthEvent].sort((a, b) => a.event_date.localeCompare(b.event_date)));
    setEditingId(null);
    setForm(emptyForm('local', churchId));
    setMessage(editingId ? 'Event updated successfully.' : 'Event created successfully.');
  };

  const deleteEvent = async (event: YouthEvent) => {
    if (!window.confirm(`Delete ${event.title}? This cannot be undone.`)) return;
    const { error: deleteError } = await supabase.from('youth_events').delete().eq('id', event.id);
    if (deleteError) { setMessage('Could not delete this event.'); return; }
    setEvents((current) => current.filter((item) => item.id !== event.id));
    setMessage('Event deleted successfully.');
  };

  const beginEdit = (event: YouthEvent) => {
    setEditingId(event.id);
    setForm({ title: event.title, description: event.description, venue: event.venue, eventDate: event.event_date, startTime: event.start_time || '', endTime: event.end_time || '', scope: event.scope, selectedChurch: event.church_id || '' });
  };

  if (!canManageEvents) return null;

  return <><section className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 sm:p-6">
    {message && <div className="mb-4"><Alert type="info" message={message} /></div>}
    <div className="flex items-start gap-3 mb-5"><div className="h-10 w-10 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center"><CalendarPlus size={20} /></div><div><h2 className="font-bold text-gray-900">Events</h2><p className="text-sm text-gray-500 mt-1">{role === 'church_admin' ? 'Add or edit events for your local church.' : `Create local church events.`}</p></div></div>
    <form onSubmit={saveEvent} className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-xl bg-gray-50 border border-gray-100 mb-6">
      <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Event title" className="px-3 py-2.5 rounded-lg border border-gray-300 text-sm" />
      <input required type="date" min={new Date().toISOString().slice(0, 10)} value={form.eventDate} onChange={(e) => setForm({ ...form, eventDate: e.target.value })} className="px-3 py-2.5 rounded-lg border border-gray-300 text-sm" />
      <input value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} placeholder="Venue" className="px-3 py-2.5 rounded-lg border border-gray-300 text-sm" />
      <div className="flex gap-2"><input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm" /><input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm" /></div>
      {isSuperAdmin && <><select value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value as 'local' | 'pastorate' })} className="px-3 py-2.5 rounded-lg border border-gray-300 text-sm"><option value="local">Local event</option><option value="pastorate">Pastorate event</option></select>{form.scope === 'local' && <select required value={form.selectedChurch} onChange={(e) => setForm({ ...form, selectedChurch: e.target.value })} className="px-3 py-2.5 rounded-lg border border-gray-300 text-sm"><option value="">Select church</option>{churches.map((church) => <option key={church.id} value={church.id}>{church.name}</option>)}</select>}</>}
      <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Event description" rows={2} className="sm:col-span-2 px-3 py-2.5 rounded-lg border border-gray-300 text-sm" />
      <div className="sm:col-span-2 flex gap-2"><button className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold"><CalendarPlus size={16} /> {editingId ? 'Save changes' : 'Add event'}</button>{editingId && <button type="button" onClick={() => { setEditingId(null); setForm(emptyForm('local', churchId)); }} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700 text-sm font-semibold"><X size={16} /> Cancel</button>}</div>
    </form>
    <div className="space-y-3">{events.length === 0 ? <p className="text-sm text-gray-400 text-center py-5">No events created yet.</p> : events.map((event) => <div key={event.id} className="rounded-xl border border-gray-200 p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-bold text-gray-900">{event.title}</h3><p className="text-sm text-gray-500 mt-1">{new Date(`${event.event_date}T00:00:00`).toLocaleDateString()} · {event.venue || 'Venue pending'}</p></div><span className="text-xs font-semibold px-2 py-1 rounded-full bg-orange-50 text-orange-700">{event.scope}</span></div><div className="mt-4 flex flex-wrap gap-2"><button onClick={() => setSelectedEvent(event)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 text-slate-700 text-xs font-semibold"><Eye size={14} /> View event</button><button onClick={() => beginEdit(event)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 text-gray-700 text-xs font-semibold"><Pencil size={14} /> Edit event</button><button onClick={() => deleteEvent(event)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-200 text-red-600 text-xs font-semibold"><Trash2 size={14} /> Delete event</button></div></div>)}</div>
  </section>{selectedEvent && <EventStatusModal event={selectedEvent} showFeedback={isSuperAdmin} onClose={() => setSelectedEvent(null)} />}</>;
}
