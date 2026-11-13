import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Alert } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { LEADER_POSITIONS, positionLabel, positionRank } from '@/lib/leaderPositions';

type Leader = { id: string; church_id: string | null; position: string; name: string; details: string | null; photo_path: string | null };
type ChurchName = { id: string; name: string };

const BUCKET = 'leadership-photos';
const emptyForm = { id: '', church_id: '', position: 'presbyter', name: '', details: '', photo_path: '' };

// Super Admin only: manage the leaders shown on the sign-in page (photo, name, position, church and details)
export function PublicLeadersAdmin() {
  const { profile } = useAuth();
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [churches, setChurches] = useState<ChurchName[]>([]);
  const [filter, setFilter] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [formOpen, setFormOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const [{ data: leaderData }, { data: churchData }] = await Promise.all([
      supabase.from('public_leaders').select('id, church_id, position, name, details, photo_path'),
      supabase.from('churches').select('id, name').order('name'),
    ]);
    setLeaders((leaderData as Leader[]) || []);
    setChurches((churchData as ChurchName[]) || []);
  }, []);

  useEffect(() => { load(); }, [load]);

  const photoUrl = (path: string | null) => (path ? supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl : '');
  const churchName = (id: string | null) => churches.find((church) => church.id === id)?.name || 'No church';

  const openNew = () => { setForm({ ...emptyForm, church_id: filter }); setFile(null); setPreview(''); setFormOpen(true); };
  const openEdit = (leader: Leader) => {
    setForm({ id: leader.id, church_id: leader.church_id || '', position: leader.position, name: leader.name, details: leader.details || '', photo_path: leader.photo_path || '' });
    setFile(null);
    setPreview(photoUrl(leader.photo_path));
    setFormOpen(true);
  };
  const closeForm = () => { setFormOpen(false); setForm(emptyForm); setFile(null); setPreview(''); };

  const choosePhoto = (event: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = event.target.files?.[0];
    event.target.value = '';
    if (!chosen) return;
    if (!chosen.type.startsWith('image/') || chosen.size > 4 * 1024 * 1024) { setError('Choose an image smaller than 4 MB.'); return; }
    setError(null);
    setFile(chosen);
    setPreview(URL.createObjectURL(chosen));
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim() || saving) return;
    setSaving(true);
    setError(null);
    let photoPath = form.photo_path || null;
    if (file) {
      const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const path = `${form.church_id || 'general'}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type });
      if (uploadError) { setError(`Could not upload the photo: ${uploadError.message}`); setSaving(false); return; }
      if (photoPath) await supabase.storage.from(BUCKET).remove([photoPath]);   // replace the old photo
      photoPath = path;
    }
    const payload = { church_id: form.church_id || null, position: form.position, name: form.name.trim(), details: form.details.trim() || null, photo_path: photoPath };
    const result = form.id ? await supabase.from('public_leaders').update(payload).eq('id', form.id) : await supabase.from('public_leaders').insert(payload);
    if (result.error) setError(`Could not save: ${result.error.message}`);
    else { setSuccess('Saved. It is now on the sign-in page.'); setTimeout(() => setSuccess(null), 3500); closeForm(); await load(); }
    setSaving(false);
  };

  const remove = async (leader: Leader) => {
    if (!confirm(`Remove ${leader.name} from the sign-in page?`)) return;
    const { error: deleteError } = await supabase.from('public_leaders').delete().eq('id', leader.id);
    if (deleteError) { setError(deleteError.message); return; }
    if (leader.photo_path) await supabase.storage.from(BUCKET).remove([leader.photo_path]);
    await load();
  };

  if (profile?.role !== 'super_admin') return <p className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">Only the Super Admin can manage this page.</p>;

  const visible = leaders
    .filter((leader) => !filter || leader.church_id === filter)
    .sort((a, b) => churches.findIndex((church) => church.id === a.church_id) - churches.findIndex((church) => church.id === b.church_id) || positionRank(a.position) - positionRank(b.position));

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="p-5 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-gray-900">Leaders on the sign-in page</h2>
          <p className="text-sm text-gray-500 mt-1">Add the Presbyter, local and pastorate youth leaders and PC members of each church. A church without a position simply has no card for it.</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm">
            <option value="">All churches</option>
            {churches.map((church) => <option key={church.id} value={church.id}>{church.name}</option>)}
          </select>
          <button onClick={() => (formOpen ? closeForm() : openNew())} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-950 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800">{formOpen ? <><X size={15} /> Close</> : <><Plus size={15} /> Add leader</>}</button>
        </div>
      </div>

      {error && <div className="m-4"><Alert type="error" message={error} /></div>}
      {success && <div className="m-4"><Alert type="success" message={success} /></div>}

      {formOpen && (
        <form onSubmit={save} className="p-5 border-b border-gray-100 bg-gray-50 grid gap-4 sm:grid-cols-[auto_1fr]">
          <div className="relative h-28 w-28">
            <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-full bg-orange-100 text-3xl font-extrabold text-orange-700">
              {preview ? <img src={preview} alt="" className="h-full w-full object-cover" /> : (form.name || '?').charAt(0).toUpperCase()}
            </div>
            <button type="button" onClick={() => fileRef.current?.click()} className="absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full bg-orange-500 text-white shadow hover:bg-orange-600" aria-label="Choose photo"><Camera size={16} /></button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={choosePhoto} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block"><span className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">Church</span>
              <select value={form.church_id} onChange={(e) => setForm({ ...form, church_id: e.target.value })} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm">
                <option value="">Select a church...</option>
                {churches.map((church) => <option key={church.id} value={church.id}>{church.name}</option>)}
              </select>
            </label>
            <label className="block"><span className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">Position</span>
              <select value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm">
                {LEADER_POSITIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label className="block sm:col-span-2"><span className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">Name</span><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm" /></label>
            <label className="block sm:col-span-2"><span className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">Other details (optional)</span><input value={form.details} onChange={(e) => setForm({ ...form, details: e.target.value })} placeholder="e.g. phone number or a short note" className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm" /></label>
            <div className="sm:col-span-2"><button disabled={saving} className="rounded-lg bg-orange-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-50">{saving ? 'Saving...' : form.id ? 'Save changes' : 'Add leader'}</button></div>
          </div>
        </form>
      )}

      {visible.length === 0 ? (
        <p className="p-6 text-center text-sm text-gray-400">No leaders added yet.</p>
      ) : (
        <div className="divide-y divide-gray-100">
          {visible.map((leader) => (
            <div key={leader.id} className="flex items-center gap-4 p-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-orange-100 text-lg font-bold text-orange-700">
                {leader.photo_path ? <img src={photoUrl(leader.photo_path)} alt="" className="h-full w-full object-cover" /> : leader.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-gray-900">{leader.name}</p>
                <p className="text-xs font-semibold text-orange-600">{positionLabel(leader.position)}</p>
                <p className="text-xs text-gray-400">{churchName(leader.church_id)}{leader.details ? ` · ${leader.details}` : ''}</p>
              </div>
              <button onClick={() => openEdit(leader)} className="rounded-lg p-2 text-gray-400 hover:bg-orange-50 hover:text-orange-600" aria-label="Edit"><Pencil size={16} /></button>
              <button onClick={() => remove(leader)} className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600" aria-label="Remove"><Trash2 size={16} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}