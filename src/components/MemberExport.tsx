import { useCallback, useEffect, useState } from 'react';
import { Download, Lock } from 'lucide-react';
import { Alert } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { ROLE_LABELS } from '@/types';
import type { Church, UserRole } from '@/types';

type AccessStatus = 'none' | 'pending' | 'approved' | 'rejected' | 'expired';
type LogRow = { id: string; scope_label: string | null; with_details: boolean; created_at: string };
type ExportRow = { person_type: string; full_name: string; role_key: string; church_name: string | null; phone: string | null; email: string | null; date_of_birth: string | null; address: string | null };

// People that can be included in a download (pastorate roles choose; local roles get their own church's youth members)
const GROUPS: { key: string; label: string }[] = [
  { key: 'youth_member', label: 'Youth members' },
  { key: 'church_admin', label: 'Church Admins' },
  { key: 'pc_member', label: 'PC members' },
  { key: 'pastorate_convenor', label: 'Pastorate Convener' },
  { key: 'pastorate_youth_treasurer', label: 'Pastorate Youth Treasurer' },
  { key: 'pastorate_youth_secretary', label: 'Pastorate Youth Secretary' },
  { key: 'local_youth_secretary', label: 'Local Youth Secretaries' },
  { key: 'local_youth_treasurer', label: 'Local Youth Treasurers' },
];

const csvCell = (value: string | null | undefined) => `"${String(value ?? '').replace(/"/g, '""')}"`;

// Download member lists as a spreadsheet (CSV).
//  - "Download list": names, roles and churches. No approval needed.
//  - "Download with full details": adds phone, email, date of birth and address. Needs the Super Admin's approval.
// mode "own": the person's own church (local secretary / treasurer). mode "choose": any church or all churches, and which groups of people.
export function MemberExport({ mode, churches = [] }: { mode: 'own' | 'choose'; churches?: Church[] }) {
  const { profile } = useAuth();
  const isSuperAdmin = profile?.role === 'super_admin';
  const [churchId, setChurchId] = useState('');
  const [groups, setGroups] = useState<string[]>(GROUPS.map((group) => group.key));
  const [access, setAccess] = useState<AccessStatus>(isSuperAdmin ? 'approved' : 'none');
  const [showRequest, setShowRequest] = useState(false);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [myDownloads, setMyDownloads] = useState<LogRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadAccess = useCallback(async () => {
    if (!profile?.id || isSuperAdmin) return;
    const { data } = await supabase.from('member_export_access').select('status, expires_at').eq('user_id', profile.id).maybeSingle();
    let status = ((data?.status as AccessStatus) || 'none');
    // Access lasts 5 hours; treat it as ended the moment the time is up
    if (status === 'approved' && data?.expires_at && new Date(data.expires_at) < new Date()) status = 'expired';
    setAccess(status);
    setExpiresAt(status === 'approved' ? data?.expires_at ?? null : null);
  }, [profile?.id, isSuperAdmin]);

  const loadDownloads = useCallback(async () => {
    if (!profile?.id) return;
    const { data } = await supabase.from('member_export_log').select('id, scope_label, with_details, created_at').eq('user_id', profile.id).order('created_at', { ascending: false }).limit(5);
    setMyDownloads((data as LogRow[]) || []);
  }, [profile?.id]);

  useEffect(() => { loadDownloads(); }, [loadDownloads]);

  useEffect(() => { loadAccess(); }, [loadAccess]);

  const toggleGroup = (key: string) => setGroups((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));

  const requestAccess = async () => {
    if (!profile?.id) return;
    setBusy(true);
    setError(null);
    const { error: upsertError } = await supabase.from('member_export_access').upsert({ user_id: profile.id, status: 'pending', requested_at: new Date().toISOString(), decided_by: null, decided_at: null }, { onConflict: 'user_id' });
    if (upsertError) { setError(`Could not send your request: ${upsertError.message}`); setBusy(false); return; }
    // Also appears in the Super Admin's Requests (with its notification)
    if (profile.church_id) {
      await supabase.from('information_requests').insert({
        church_id: profile.church_id, requested_by: profile.id, requester_role: profile.role, requester_name: profile.full_name,
        recipient_role: 'super_admin', subject: 'Member list: access to full details',
        message: `${profile.full_name} needs to download member lists with full details. Please approve this in the Downloads tab.`,
      });
    }
    setAccess('pending');
    setSuccess('Your request was sent to the Super Admin.');
    setTimeout(() => setSuccess(null), 4000);
    setBusy(false);
  };

  const download = async (withDetails: boolean) => {
    if (withDetails && access !== 'approved') { setShowRequest(true); return; }
    const chosen = mode === 'choose' ? groups : ['youth_member'];
    if (chosen.length === 0) { setError('Choose at least one group of people to include.'); return; }
    setBusy(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc('export_member_list', {
      target_church: mode === 'choose' && churchId ? churchId : null,
      include_details: withDetails,
      groups: chosen,
    });
    if (rpcError) { setError(rpcError.message); setBusy(false); return; }
    const rows = (data as ExportRow[]) || [];
    const header = withDetails ? ['Type', 'Name', 'Role', 'Church', 'Phone', 'Email', 'Date of birth', 'Address'] : ['Type', 'Name', 'Role', 'Church'];
    const lines = rows.map((row) => {
      const base = [row.person_type, row.full_name, ROLE_LABELS[row.role_key as UserRole] || row.role_key, row.church_name || ''];
      return (withDetails ? [...base, row.phone, row.email, row.date_of_birth, row.address] : base).map(csvCell).join(',');
    });
    const csv = `\uFEFF${header.map(csvCell).join(',')}\n${lines.join('\n')}`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    const churchLabel = mode === 'choose' ? (churches.find((church) => church.id === churchId)?.name || 'all-churches') : 'my-church';
    link.href = url;
    link.download = `members-${churchLabel.replace(/\s+/g, '-').toLowerCase()}${withDetails ? '-with-details' : ''}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setSuccess(`Downloaded ${rows.length} ${rows.length === 1 ? 'person' : 'people'}.`);
    setTimeout(() => setSuccess(null), 4000);
    await loadAccess();
    await loadDownloads();
    setBusy(false);
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="p-5 border-b border-gray-100">
        <h2 className="font-bold text-gray-900 flex items-center gap-2"><Download size={18} className="text-orange-600" /> Download member list</h2>
        <p className="text-sm text-gray-500 mt-1">{mode === 'own' ? "Download your church's youth members as a spreadsheet." : 'Choose a church and who to include, then download.'}</p>
      </div>
      <div className="p-5 space-y-4">
        {error && <Alert type="error" message={error} />}
        {success && <Alert type="success" message={success} />}

        {mode === 'choose' && (
          <>
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-gray-500">Church</span>
              <select value={churchId} onChange={(e) => setChurchId(e.target.value)} className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm">
                <option value="">All churches</option>
                {churches.map((church) => <option key={church.id} value={church.id}>{church.name}</option>)}
              </select>
            </label>
            <div>
              <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-gray-500">Who to include</span>
              <div className="grid gap-2 sm:grid-cols-2">
                {GROUPS.map((group) => (
                  <label key={group.key} className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-700">
                    <input type="checkbox" checked={groups.includes(group.key)} onChange={() => toggleGroup(group.key)} className="h-4 w-4 accent-orange-500" /> {group.label}
                  </label>
                ))}
              </div>
            </div>
          </>
        )}

        <div className="flex flex-wrap gap-3">
          <button onClick={() => download(false)} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-5 py-3 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-40">
            <Download size={16} /> {busy ? 'Preparing...' : 'Download list'}
          </button>
          <button onClick={() => download(true)} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-40">
            {access === 'approved' ? <Download size={16} /> : <Lock size={16} />} Download with full details
          </button>
        </div>
        <p className="text-xs text-gray-400">The list has names, roles and churches. "With full details" adds phone, email, date of birth and address{access === 'approved' ? '.' : ' and needs the Super Admin\'s approval.'}</p>

        {access === 'approved' && !isSuperAdmin && expiresAt && (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">Full details are unlocked until {new Date(expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} (5 hours from approval).</p>
        )}

        {showRequest && access !== 'approved' && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="flex items-center gap-2 font-semibold"><Lock size={15} /> Full details need the Super Admin's approval</p>
            {access === 'pending' && <p className="mt-1 text-amber-800">Your request is waiting for the Super Admin. The plain list is available meanwhile.</p>}
            {access === 'rejected' && <p className="mt-1 text-amber-800">Your last request was declined or revoked. You can ask again.</p>}
            {access === 'expired' && <p className="mt-1 text-amber-800">Your 5 hours of access are over. Request it again to download with full details.</p>}
            {access === 'none' && <p className="mt-1 text-amber-800">Send a request, and download with details once it is approved.</p>}
            {access !== 'pending' && (
              <button onClick={requestAccess} disabled={busy} className="mt-3 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50">{access === 'rejected' || access === 'expired' ? 'Request again' : 'Request access'}</button>
            )}
          </div>
        )}

        {myDownloads.length > 0 && (
          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Your recent downloads</p>
            <ul className="mt-2 space-y-1 text-xs text-gray-500">
              {myDownloads.map((row) => <li key={row.id}>{new Date(row.created_at).toLocaleString()} · {row.scope_label || 'My church'}{row.with_details ? ' · with full details' : ''}</li>)}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}