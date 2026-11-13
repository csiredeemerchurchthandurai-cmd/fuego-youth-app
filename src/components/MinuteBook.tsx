import { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, BookOpen, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { Alert } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

type Minute = {
  id: string;
  church_id: string;
  event_id: string | null;
  meeting_date: string;
  title: string;
  content: string;
  status: 'draft' | 'published';
  created_by: string;
  author_name: string | null;
  published_at: string | null;
  created_at: string;
};
type Verification = { id: string; minute_id: string; slot: string; verifier_name: string | null; verified_at: string };
type EventOption = { id: string; title: string; event_date: string };

// The Local Youth Secretary and Local Youth Treasurer always have to verify.
// A church that also has a pastorate secretary, pastorate treasurer, pastorate convener or PC members needs them to verify too.
const ALWAYS: { slot: string; label: string }[] = [
  { slot: 'local_youth_secretary', label: 'Local Youth Secretary' },
  { slot: 'local_youth_treasurer', label: 'Local Youth Treasurer' },
];
const WHEN_PRESENT: { slot: string; label: string }[] = [
  { slot: 'pastorate_youth_secretary', label: 'Pastorate Youth Secretary' },
  { slot: 'pastorate_youth_treasurer', label: 'Pastorate Youth Treasurer' },
  { slot: 'pastorate_convenor', label: 'Pastorate Convener' },
  { slot: 'pc_member', label: 'PC Member (any one)' },
];

const minuteFields = 'id, church_id, event_id, meeting_date, title, content, status, created_by, author_name, published_at, created_at';
const todayLocal = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

// Minute book of a church. The Local Youth Secretary writes and publishes (optionally for a particular event).
// Everyone in the church reads published minutes; the verifiers sign them off. The Super Admin sees every church's minutes.
export function MinuteBook() {
  const { profile } = useAuth();
  const role = profile?.role || '';
  const isSuperAdmin = role === 'super_admin';
  const canWrite = role === 'local_youth_secretary';

  const [minutes, setMinutes] = useState<Minute[]>([]);
  const [verifications, setVerifications] = useState<Record<string, Verification[]>>({});
  const [churchRoles, setChurchRoles] = useState<Record<string, string[]>>({});
  const [churchNames, setChurchNames] = useState<Record<string, string>>({});
  const [eventLabels, setEventLabels] = useState<Record<string, EventOption>>({});
  const [myEvents, setMyEvents] = useState<EventOption[]>([]);
  const [churchFilter, setChurchFilter] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [meetingDate, setMeetingDate] = useState(todayLocal());
  const [eventId, setEventId] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const flash = (text: string) => { setSuccess(text); setTimeout(() => setSuccess(null), 3500); };

  // Who has to verify the minutes of this church
  const slotsFor = (churchId: string) => [...ALWAYS, ...WHEN_PRESENT.filter((item) => (churchRoles[churchId] || []).includes(item.slot))];

  const load = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    let query = supabase.from('minute_books').select(minuteFields).order('meeting_date', { ascending: false }).order('created_at', { ascending: false });
    if (!isSuperAdmin && profile.church_id) query = query.eq('church_id', profile.church_id);
    const { data, error: queryError } = await query;
    if (queryError) { setError('Could not load the minute book right now.'); setLoading(false); return; }
    const rows = (data as Minute[]) || [];
    setMinutes(rows);

    const churchIds = [...new Set(rows.map((row) => row.church_id))];
    const roleEntries = await Promise.all(churchIds.map(async (id) => {
      const { data: roleData } = await supabase.rpc('church_verifier_roles', { target_church: id });
      return [id, ((roleData as { role_key: string }[]) || []).map((item) => item.role_key)] as const;
    }));
    setChurchRoles(Object.fromEntries(roleEntries));

    if (isSuperAdmin) {
      const { data: churchData } = await supabase.from('churches').select('id, name');
      setChurchNames(Object.fromEntries(((churchData as { id: string; name: string }[]) || []).map((church) => [church.id, church.name])));
    }

    const eventIds = [...new Set(rows.map((row) => row.event_id).filter((id): id is string => Boolean(id)))];
    if (eventIds.length > 0) {
      const { data: eventData } = await supabase.from('youth_events').select('id, title, event_date').in('id', eventIds);
      setEventLabels(Object.fromEntries(((eventData as EventOption[]) || []).map((item) => [item.id, item])));
    }

    if (rows.length > 0) {
      const { data: verifyData } = await supabase.from('minute_verifications').select('id, minute_id, slot, verifier_name, verified_at').in('minute_id', rows.map((row) => row.id));
      const grouped: Record<string, Verification[]> = {};
      ((verifyData as Verification[]) || []).forEach((item) => { (grouped[item.minute_id] = grouped[item.minute_id] || []).push(item); });
      setVerifications(grouped);
    } else setVerifications({});
    setLoading(false);
  }, [profile?.id, profile?.church_id, isSuperAdmin]);

  useEffect(() => { load(); }, [load]);

  // Events the secretary can link the minutes to
  useEffect(() => {
    if (!canWrite || !profile?.church_id) return;
    supabase.from('youth_events').select('id, title, event_date').eq('church_id', profile.church_id).order('event_date', { ascending: false }).then(({ data }) => setMyEvents((data as EventOption[]) || []));
  }, [canWrite, profile?.church_id]);

  const resetForm = () => { setFormOpen(false); setEditingId(null); setTitle(''); setContent(''); setEventId(''); setMeetingDate(todayLocal()); };

  const save = async (publish: boolean) => {
    if (!profile?.id || !profile.church_id || !title.trim() || !content.trim() || busy) return;
    setBusy(true);
    setError(null);
    const payload = {
      meeting_date: meetingDate,
      event_id: eventId || null,
      title: title.trim(),
      content: content.trim(),
      status: publish ? 'published' : 'draft',
      published_at: publish ? new Date().toISOString() : null,
    };
    const result = editingId
      ? await supabase.from('minute_books').update(payload).eq('id', editingId)
      : await supabase.from('minute_books').insert({ ...payload, church_id: profile.church_id, created_by: profile.id, author_name: profile.full_name });
    if (result.error) setError(`Could not save the minutes: ${result.error.message}`);
    else { flash(publish ? 'Minutes published. Verifiers can now verify them.' : 'Draft saved.'); resetForm(); await load(); }
    setBusy(false);
  };

  const publishDraft = async (minute: Minute) => {
    if (!confirm('Publish these minutes? After publishing they can no longer be edited.')) return;
    setBusy(true);
    const { error: updateError } = await supabase.from('minute_books').update({ status: 'published', published_at: new Date().toISOString() }).eq('id', minute.id);
    if (updateError) setError(`Could not publish: ${updateError.message}`); else { flash('Minutes published.'); await load(); }
    setBusy(false);
  };

  const removeDraft = async (minute: Minute) => {
    if (!confirm('Delete this draft?')) return;
    const { error: deleteError } = await supabase.from('minute_books').delete().eq('id', minute.id);
    if (deleteError) setError(deleteError.message); else { flash('Draft deleted.'); await load(); }
  };

  const editDraft = (minute: Minute) => {
    setEditingId(minute.id); setMeetingDate(minute.meeting_date); setEventId(minute.event_id || ''); setTitle(minute.title); setContent(minute.content); setFormOpen(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const verify = async (minute: Minute) => {
    if (!profile?.id) return;
    setBusy(true);
    setError(null);
    const { error: insertError } = await supabase.from('minute_verifications').insert({ minute_id: minute.id, slot: role, verifier_id: profile.id, verifier_name: profile.full_name });
    if (insertError) setError(insertError.message.includes('duplicate') ? 'This minute was just verified for your role by someone else.' : `Could not verify: ${insertError.message}`);
    else { flash('You verified these minutes.'); await load(); }
    setBusy(false);
  };

  const visibleMinutes = minutes.filter((minute) => !churchFilter || minute.church_id === churchFilter);

  return (
    <section className="space-y-4">
      {error && <Alert type="error" message={error} />}
      {success && <Alert type="success" message={success} />}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="p-5 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-gray-900 flex items-center gap-2"><BookOpen size={18} className="text-orange-600" /> Minute book</h2>
            <p className="text-sm text-gray-500 mt-1">{isSuperAdmin ? 'Minutes of every church, with who has verified them.' : canWrite ? 'Write down what was discussed and publish it for your church.' : "Published minutes of your church's meetings."}</p>
          </div>
          <div className="flex items-center gap-2">
            {isSuperAdmin && (
              <select value={churchFilter} onChange={(e) => setChurchFilter(e.target.value)} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm">
                <option value="">All churches</option>
                {Object.entries(churchNames).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            )}
            <button onClick={load} disabled={loading} className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /></button>
            {canWrite && (
              <button onClick={() => (formOpen ? resetForm() : setFormOpen(true))} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-950 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800">
                {formOpen ? <><X size={15} /> Close</> : <><Plus size={15} /> New minutes</>}
              </button>
            )}
          </div>
        </div>

        {canWrite && formOpen && (
          <div className="p-5 border-b border-gray-100 bg-gray-50 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block"><span className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">Meeting date</span><input type="date" value={meetingDate} onChange={(e) => setMeetingDate(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm" /></label>
              <label className="block"><span className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">For which event? (optional)</span>
                <select value={eventId} onChange={(e) => setEventId(e.target.value)} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm">
                  <option value="">Not linked to an event</option>
                  {myEvents.map((item) => <option key={item.id} value={item.id}>{item.title} · {new Date(`${item.event_date}T00:00:00`).toLocaleDateString()}</option>)}
                </select>
              </label>
            </div>
            <label className="block"><span className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">Title</span><input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} placeholder="e.g. Monthly youth meeting" className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm" /></label>
            <label className="block"><span className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">What was discussed</span><textarea value={content} onChange={(e) => setContent(e.target.value)} rows={9} placeholder="Attendees, agenda, discussions, decisions and action points..." className="w-full rounded-lg border border-gray-300 p-3 text-sm" /></label>
            <div className="flex flex-wrap gap-2">
              <button disabled={busy || !title.trim() || !content.trim()} onClick={() => save(false)} className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40">Save draft</button>
              <button disabled={busy || !title.trim() || !content.trim()} onClick={() => save(true)} className="rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-40">Publish</button>
            </div>
            <p className="text-xs text-gray-400">Once published, minutes can't be edited, so that verifiers sign off exactly what they read.</p>
          </div>
        )}

        {visibleMinutes.length === 0 ? (
          <p className="p-6 text-center text-sm text-gray-400">{canWrite ? 'No minutes yet. Click "New minutes" to write the first.' : 'No minutes have been published yet.'}</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {visibleMinutes.map((minute) => {
              const slots = slotsFor(minute.church_id);
              const done = verifications[minute.id] || [];
              const verifiedCount = slots.filter((item) => done.some((entry) => entry.slot === item.slot)).length;
              const fully = verifiedCount === slots.length;
              const mySlot = slots.some((item) => item.slot === role) ? role : '';
              const mineDone = mySlot ? done.some((entry) => entry.slot === mySlot) : false;
              const open = openId === minute.id;
              const linkedEvent = minute.event_id ? eventLabels[minute.event_id] : null;
              return (
                <div key={minute.id} className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <button onClick={() => setOpenId(open ? null : minute.id)} className="min-w-0 text-left">
                      <p className="font-bold text-gray-900">{minute.title}</p>
                      <p className="mt-1 text-xs text-gray-400">
                        {isSuperAdmin && churchNames[minute.church_id] ? `${churchNames[minute.church_id]} · ` : ''}
                        {new Date(`${minute.meeting_date}T00:00:00`).toLocaleDateString()}
                        {linkedEvent ? ` · event: ${linkedEvent.title}` : ''} · written by {minute.author_name || 'the secretary'}
                      </p>
                    </button>
                    <div className="flex items-center gap-2">
                      {minute.status === 'draft' ? (
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">Draft</span>
                      ) : fully ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700"><BadgeCheck size={13} /> Fully verified</span>
                      ) : (
                        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">Verified {verifiedCount}/{slots.length}</span>
                      )}
                    </div>
                  </div>

                  {open && <p className="mt-3 whitespace-pre-wrap rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm leading-6 text-gray-700">{minute.content}</p>}
                  {!open && <button onClick={() => setOpenId(minute.id)} className="mt-2 text-xs font-semibold text-orange-600 hover:text-orange-700">Read the minutes</button>}

                  {minute.status === 'published' && (
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      {slots.map((item) => {
                        const entry = done.find((candidate) => candidate.slot === item.slot);
                        return (
                          <div key={item.slot} className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs ${entry ? 'border-emerald-200 bg-emerald-50' : 'border-gray-200 bg-white'}`}>
                            <span className="font-semibold text-gray-700">{item.label}</span>
                            {entry ? <span className="text-emerald-700">✓ {entry.verifier_name || 'Verified'} · {new Date(entry.verified_at).toLocaleDateString()}</span> : <span className="text-gray-400">Waiting</span>}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {minute.status === 'published' && mySlot && !mineDone && (
                    <button disabled={busy} onClick={() => verify(minute)} className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-600 disabled:opacity-50"><BadgeCheck size={15} /> Verify these minutes</button>
                  )}

                  {minute.status === 'draft' && canWrite && minute.created_by === profile?.id && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button onClick={() => editDraft(minute)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Edit</button>
                      <button disabled={busy} onClick={() => publishDraft(minute)} className="rounded-lg bg-orange-500 px-3 py-2 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-50">Publish</button>
                      <button onClick={() => removeDraft(minute)} className="inline-flex items-center gap-1 rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"><Trash2 size={14} /> Delete</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}