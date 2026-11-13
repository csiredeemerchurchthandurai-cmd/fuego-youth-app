import { useCallback, useEffect, useState } from 'react';
import { Edit3, Plus, Trash2, UserRound, X, Check } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Alert } from '@/components/ui';
import type { Church, LeadershipCategory, LeadershipProfile } from '@/types';

interface LeadershipProfilesSectionProps {
  isSuperAdmin?: boolean;
  churchId?: string | null;
  churches?: Church[];
}

const categories: { value: LeadershipCategory; label: string }[] = [
  { value: 'reverend', label: 'Church Reverend' },
  { value: 'pc_member', label: 'PC Member' },
  { value: 'pastorate_committee', label: 'Pastorate Committee' },
];

export function LeadershipProfilesSection({ isSuperAdmin = false, churchId = null, churches = [] }: LeadershipProfilesSectionProps) {
  const [profiles, setProfiles] = useState<LeadershipProfile[]>([]);
  const [editing, setEditing] = useState<LeadershipProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ category: 'reverend' as LeadershipCategory, name: '', title: '', description: '', photo_url: '', church_id: churchId || '' });

  const fetchProfiles = useCallback(async () => {
    let query = supabase.from('leadership_profiles').select('id, church_id, category, name, title, description, photo_url, sort_order, created_at').order('sort_order').order('created_at');
    if (churchId) query = query.or(`church_id.is.null,church_id.eq.${churchId}`);
    const { data } = await query;
    if (data) setProfiles(data as LeadershipProfile[]);
  }, [churchId]);

  useEffect(() => { fetchProfiles(); }, [fetchProfiles]);

  const resetForm = () => {
    setForm({ category: 'reverend', name: '', title: '', description: '', photo_url: '', church_id: churchId || '' });
    setEditing(null);
    setShowForm(false);
  };

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    const payload = { ...form, church_id: form.church_id || null };
    const result = editing
      ? await supabase.from('leadership_profiles').update(payload).eq('id', editing.id)
      : await supabase.from('leadership_profiles').insert(payload);
    if (result.error) { setError('Could not save this profile. Please try again.'); return; }
    resetForm();
    fetchProfiles();
  };

  const startEdit = (profile: LeadershipProfile) => {
    setEditing(profile);
    setForm({ category: profile.category, name: profile.name, title: profile.title, description: profile.description, photo_url: profile.photo_url, church_id: profile.church_id || '' });
    setShowForm(true);
  };

  const removeProfile = async (id: string) => {
    if (!window.confirm('Remove this profile?')) return;
    const { error: deleteError } = await supabase.from('leadership_profiles').delete().eq('id', id);
    if (deleteError) { setError('Could not remove this profile. Please try again.'); return; }
    fetchProfiles();
  };

  const labelFor = (category: LeadershipCategory) => categories.find((item) => item.value === category)?.label || category;

  return (
    <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="p-5 sm:p-6 border-b border-gray-100 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-600">Leadership</p>
          <h2 className="mt-1 text-xl font-bold text-gray-900">Meet the fellowship team</h2>
          <p className="mt-1 text-sm text-gray-500">Reverends, PC members, and pastorate committee members.</p>
        </div>
        {isSuperAdmin && <button onClick={() => setShowForm((value) => !value)} className="shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-600 transition-colors">{showForm ? <X size={16} /> : <Plus size={16} />} {showForm ? 'Close' : 'Add profile'}</button>}
      </div>

      {error && <div className="m-5"><Alert type="error" message={error} /></div>}

      {isSuperAdmin && showForm && (
        <form onSubmit={saveProfile} className="p-5 sm:p-6 bg-amber-50/50 border-b border-amber-100 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2 flex items-center justify-between"><h3 className="font-bold text-gray-900">{editing ? 'Edit profile' : 'New profile'}</h3><span className="text-xs text-gray-500">Use a secure image URL for the profile photo</span></div>
          <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value as LeadershipCategory })} className="rounded-xl border border-gray-300 px-3 py-2.5 text-sm bg-white"><option value="reverend">Church Reverend</option><option value="pc_member">PC Member</option><option value="pastorate_committee">Pastorate Committee</option></select>
          {churches.length > 0 && <select value={form.church_id} onChange={(event) => setForm({ ...form, church_id: event.target.value })} className="rounded-xl border border-gray-300 px-3 py-2.5 text-sm bg-white"><option value="">Shared pastorate profile</option>{churches.map((church) => <option key={church.id} value={church.id}>{church.name}</option>)}</select>}
          <input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Full name" className="rounded-xl border border-gray-300 px-3 py-2.5 text-sm" />
          <input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Job title" className="rounded-xl border border-gray-300 px-3 py-2.5 text-sm" />
          <input value={form.photo_url} onChange={(event) => setForm({ ...form, photo_url: event.target.value })} placeholder="Photo URL" className="md:col-span-2 rounded-xl border border-gray-300 px-3 py-2.5 text-sm" />
          <textarea required value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Short description" rows={3} className="md:col-span-2 rounded-xl border border-gray-300 px-3 py-2.5 text-sm resize-none" />
          <div className="md:col-span-2 flex gap-2"><button className="inline-flex items-center gap-1.5 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-800"><Check size={16} /> Save profile</button><button type="button" onClick={resetForm} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-white">Cancel</button></div>
        </form>
      )}

      <div className="p-5 sm:p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {profiles.length === 0 ? <div className="sm:col-span-2 lg:col-span-3 rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-400">No leadership profiles added yet.</div> : profiles.map((profile) => (
          <article key={profile.id} className="group overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm hover:-translate-y-1 hover:shadow-lg transition-all">
            <div className="relative h-52 bg-gradient-to-br from-gray-100 to-gray-200 overflow-hidden">
              {profile.photo_url ? <img src={profile.photo_url} alt={profile.name} className="h-full w-full object-cover grayscale group-hover:grayscale-0 transition-all duration-500" /> : <div className="h-full w-full flex items-center justify-center"><UserRound size={64} className="text-gray-400" /></div>}
              <div className="absolute top-4 right-4 h-12 w-12 rounded-xl border-4 border-amber-400 bg-amber-400/90 rotate-45"><div className="h-full w-full rounded-lg bg-white/10" /></div>
            </div>
            <div className="p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-amber-600">{labelFor(profile.category)}</p>
              <h3 className="mt-1 text-lg font-bold text-gray-900">{profile.name}</h3>
              <p className="text-sm font-medium text-gray-700">{profile.title}</p>
              <p className="mt-2 text-sm leading-6 text-gray-500 line-clamp-3">{profile.description}</p>
              {isSuperAdmin && <div className="mt-4 flex gap-2"><button onClick={() => startEdit(profile)} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100"><Edit3 size={13} /> Edit</button><button onClick={() => removeProfile(profile.id)} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"><Trash2 size={13} /> Remove</button></div>}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
