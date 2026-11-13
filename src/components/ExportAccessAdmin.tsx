import { useCallback, useEffect, useState } from 'react';
import { Lock, RefreshCw } from 'lucide-react';
import { Alert } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { ROLE_LABELS } from '@/types';
import type { UserRole } from '@/types';

type Status = 'pending' | 'approved' | 'rejected' | 'expired';
type AccessRow = { user_id: string; status: Status; requested_at: string; decided_at: string | null; expires_at: string | null };
type Person = { id: string; full_name: string; role: UserRole };
type LogRow = { id: string; user_name: string | null; user_role: string | null; scope_label: string | null; groups: string[] | null; with_details: boolean; created_at: string };

// Super Admin: decide who may download member lists with full details (access lasts 5 hours),
// and see who has downloaded what, and when.
export function ExportAccessAdmin() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<AccessRow[]>([]);
  const [people, setPeople] = useState<Record<string, Person>>({});
  const [log, setLog] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data }, { data: logData }] = await Promise.all([
      supabase.from('member_export_access').select('user_id, status, requested_at, decided_at, expires_at').order('requested_at', { ascending: false }),
      supabase.from('member_export_log').select('id, user_name, user_role, scope_label, groups, with_details, created_at').order('created_at', { ascending: false }).limit(60),
    ]);
    const list = (data as AccessRow[]) || [];
    setRows(list);
    setLog((logData as LogRow[]) || []);
    if (list.length > 0) {
      const { data: profileData } = await supabase.from('profiles').select('id, full_name, role').in('id', list.map((row) => row.user_id));
      setPeople(Object.fromEntries(((profileData as Person[]) || []).map((person) => [person.id, person])));
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const decide = async (userId: string, status: 'approved' | 'rejected') => {
    setError(null);
    const { error: updateError } = await supabase.from('member_export_access').update({ status, decided_by: profile?.id, decided_at: new Date().toISOString() }).eq('user_id', userId);
    if (updateError) { setError(updateError.message); return; }
    await load();
  };

  // An approval that has run past its 5 hours counts as expired even before the scheduled clean-up runs
  const effective = (row: AccessRow): Status => (row.status === 'approved' && row.expires_at && new Date(row.expires_at) < new Date() ? 'expired' : row.status);

  const badge = (row: AccessRow) => {
    const status = effective(row);
    const style = status === 'approved' ? 'bg-emerald-50 text-emerald-700' : status === 'pending' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600';
    const label = status === 'approved' ? `Approved · until ${row.expires_at ? new Date(row.expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}` : status === 'rejected' ? 'Declined / revoked' : status === 'expired' ? 'Expired' : 'Pending';
    return <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${style}`}>{label}</span>;
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-gray-900 flex items-center gap-2"><Lock size={18} className="text-orange-600" /> Download access</h2>
            <p className="text-sm text-gray-500 mt-1">Admins who asked to download member lists with full details. An approval lasts 5 hours, then ends on its own. The admin is notified each time.</p>
          </div>
          <button onClick={load} disabled={loading} className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh</button>
        </div>
        {error && <div className="m-4"><Alert type="error" message={error} /></div>}
        {rows.length === 0 ? (
          <p className="p-6 text-center text-sm text-gray-400">No requests yet.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {rows.map((row) => {
              const person = people[row.user_id];
              const status = effective(row);
              return (
                <div key={row.user_id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900">{person?.full_name || 'Unknown user'}</p>
                    <p className="mt-0.5 text-xs text-gray-400">{person ? ROLE_LABELS[person.role] : ''} · asked {new Date(row.requested_at).toLocaleString()}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {badge(row)}
                    {status !== 'approved' && <button onClick={() => decide(row.user_id, 'approved')} className="rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-600">Approve for 5 hours</button>}
                    {status === 'pending' && <button onClick={() => decide(row.user_id, 'rejected')} className="rounded-lg bg-red-500 px-3 py-2 text-sm font-semibold text-white hover:bg-red-600">Decline</button>}
                    {status === 'approved' && <button onClick={() => decide(row.user_id, 'rejected')} className="rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50">Revoke now</button>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="p-5 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">Download log</h2>
          <p className="text-sm text-gray-500 mt-1">Every member list download: who, what and when.</p>
        </div>
        {log.length === 0 ? (
          <p className="p-6 text-center text-sm text-gray-400">Nothing has been downloaded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left">
              <thead className="border-b border-gray-200">
                <tr>
                  <th className="px-5 py-3 text-xs uppercase tracking-wider text-gray-500">When</th>
                  <th className="px-5 py-3 text-xs uppercase tracking-wider text-gray-500">Downloaded by</th>
                  <th className="px-5 py-3 text-xs uppercase tracking-wider text-gray-500">Church</th>
                  <th className="px-5 py-3 text-xs uppercase tracking-wider text-gray-500">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {log.map((entry) => (
                  <tr key={entry.id}>
                    <td className="px-5 py-3 text-sm text-gray-600 whitespace-nowrap">{new Date(entry.created_at).toLocaleString()}</td>
                    <td className="px-5 py-3 text-sm font-semibold text-gray-900">{entry.user_name || 'Unknown'}<span className="block text-xs font-normal text-gray-400">{entry.user_role ? ROLE_LABELS[entry.user_role as UserRole] || entry.user_role : ''}</span></td>
                    <td className="px-5 py-3 text-sm text-gray-600">{entry.scope_label || '—'}</td>
                    <td className="px-5 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${entry.with_details ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-600'}`}>{entry.with_details ? 'With full details' : 'List only'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}