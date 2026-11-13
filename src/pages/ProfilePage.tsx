import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Camera, KeyRound, Save, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { DashboardShell } from '@/components/DashboardShell';
import { Alert } from '@/components/ui';
import { PasswordInput } from '@/components/PasswordInput';
import { useAuth } from '@/context/AuthContext';
import { useAvatar } from '@/hooks/useAvatar';
import { supabase } from '@/lib/supabase';
import { ROLE_LABELS } from '@/types';

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1.5 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">{value}</p>
    </div>
  );
}

// "My profile" for every non-youth role (youth members have their own profile page)
export function ProfilePage() {
  const { profile, session, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const { url, uploading, upload } = useAvatar();
  const fileRef = useRef<HTMLInputElement>(null);

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [churchName, setChurchName] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const flash = (text: string) => { setSuccess(text); setTimeout(() => setSuccess(null), 4000); };

  useEffect(() => {
    if (!profile?.id) return;
    setFullName(profile.full_name || '');
    const load = async () => {
      // The phone lives on the account itself; older saves may be in the profiles table
      const accountPhone = (session?.user?.user_metadata?.phone as string | undefined) || '';
      if (accountPhone) setPhone(accountPhone);
      else {
        const { data } = await supabase.from('profiles').select('phone').eq('id', profile.id).maybeSingle();
        setPhone((data as { phone?: string | null } | null)?.phone || '');
      }
      if (profile.church_id) {
        const { data: church } = await supabase.from('churches').select('name').eq('id', profile.church_id).maybeSingle();
        setChurchName(church?.name || '');
      }
    };
    load();
  }, [profile?.id, profile?.church_id, profile?.full_name]);

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!profile?.id || !fullName.trim() || savingProfile) return;
    setSavingProfile(true);
    setError(null);
    const { error: updateError } = await supabase.from('profiles').update({ full_name: fullName.trim() }).eq('id', profile.id);
    const { error: phoneError } = await supabase.auth.updateUser({ data: { phone: phone.trim() } });
    // Keep the profiles table in step when it has a phone column (ignored otherwise)
    await supabase.from('profiles').update({ phone: phone.trim() || null }).eq('id', profile.id);
    if (updateError || phoneError) setError(`Could not save your profile: ${(updateError || phoneError)?.message}`);
    else { await refreshProfile(); flash('Your profile has been updated.'); }
    setSavingProfile(false);
  };

  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (newPassword.length < 8) { setError('Your new password must be at least 8 characters.'); return; }
    if (newPassword !== confirmPassword) { setError('The two passwords do not match.'); return; }
    setSavingPassword(true);
    const { error: passwordError } = await supabase.auth.updateUser({ password: newPassword });
    if (passwordError) setError(passwordError.message);
    else { setNewPassword(''); setConfirmPassword(''); flash('Your password has been changed.'); }
    setSavingPassword(false);
  };

  const choosePhoto = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const problem = await upload(file);
    if (problem) setError(problem);
    else flash('Your profile photo has been updated.');
  };

  return (
    <DashboardShell>
      <button onClick={() => navigate(`/${profile?.role ?? ''}`)} className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-orange-600">
        <ArrowLeft size={16} /> Back to dashboard
      </button>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">My profile</h1>
        <p className="mt-1 text-sm text-gray-500">Update your details, photo and password.</p>
      </div>

      {error && <div className="mb-4"><Alert type="error" message={error} /></div>}
      {success && <div className="mb-4"><Alert type="success" message={success} /></div>}

      <div className="max-w-3xl space-y-6">
        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col items-start gap-5 border-b border-gray-100 pb-6 sm:flex-row sm:items-center">
            <div className="relative">
              <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-3xl bg-orange-100 text-3xl font-extrabold text-orange-700">
                {url ? <img src={url} alt="Profile" className="h-full w-full object-cover" /> : (fullName || 'U').charAt(0).toUpperCase()}
              </div>
              <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} aria-label="Change profile photo" className="absolute -bottom-2 -right-2 flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500 text-white shadow-lg hover:bg-orange-600 disabled:opacity-50">
                <Camera size={17} />
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={choosePhoto} />
            </div>
            <div>
              <p className="text-xl font-bold text-gray-900">{profile?.full_name}</p>
              <p className="mt-1 text-sm font-medium text-orange-600">{profile ? ROLE_LABELS[profile.role] : ''}</p>
              <p className="mt-2 flex items-center gap-1 text-xs text-gray-400"><ShieldCheck size={14} /> {uploading ? 'Uploading photo...' : 'Photos up to 4 MB'}</p>
            </div>
          </div>

          <form onSubmit={saveProfile} className="pt-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-gray-500">Full name</span>
                <input required value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-gray-500">Phone number</span>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Optional" className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
              </label>
              <ReadOnlyField label="Email address" value={session?.user.email || 'Not available'} />
              <ReadOnlyField label="Role" value={profile ? ROLE_LABELS[profile.role] : ''} />
              {profile?.church_id && <ReadOnlyField label="Church" value={churchName || '—'} />}
              {(profile as { created_at?: string } | null)?.created_at && <ReadOnlyField label="Member since" value={new Date((profile as { created_at: string }).created_at).toLocaleDateString()} />}
            </div>
            <button disabled={savingProfile} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
              <Save size={16} /> {savingProfile ? 'Saving...' : 'Save changes'}
            </button>
          </form>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2"><KeyRound size={18} className="text-orange-600" /><h2 className="font-bold text-gray-900">Change password</h2></div>
          <form onSubmit={changePassword} className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-gray-500">New password</span>
              <PasswordInput required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="At least 8 characters" className="w-full rounded-xl border border-gray-300 py-3 pl-4 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-gray-500">Confirm new password</span>
              <PasswordInput required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Type it again" className="w-full rounded-xl border border-gray-300 py-3 pl-4 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
            </label>
            <div className="sm:col-span-2">
              <button disabled={savingPassword} className="rounded-xl bg-orange-500 px-5 py-3 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50">{savingPassword ? 'Updating...' : 'Update password'}</button>
            </div>
          </form>
        </section>
      </div>
    </DashboardShell>
  );
}