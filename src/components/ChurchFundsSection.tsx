import { useCallback, useEffect, useState } from 'react';
import { FileSpreadsheet, FileText, History, LockKeyhole, Save } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Alert } from '@/components/ui';
import type { Church, ChurchFund, ChurchFundAccess, UserRole } from '@/types';
import { ROLE_LABELS } from '@/types';

interface ChurchFundsSectionProps { churchId: string | null; isSuperAdmin?: boolean; churches?: Church[]; canEdit?: boolean; canManageAccess?: boolean; }

type HistoryRow = {
  id: string;
  weekly_offering: number;
  monthly_contribution: number;
  current_youth_fund: number;
  prev_weekly_offering: number | null;
  prev_monthly_contribution: number | null;
  prev_current_youth_fund: number | null;
  changed_by_name: string | null;
  changed_at: string;
};

const viewRoles: UserRole[] = ['church_admin', 'pc_member', 'pastorate_youth_secretary', 'pastorate_youth_treasurer', 'pastorate_convenor', 'local_youth_secretary', 'local_youth_treasurer', 'youth_member'];

// Who can see the history of fund changes
const HISTORY_ROLES = ['super_admin', 'pastorate_youth_treasurer', 'local_youth_treasurer', 'local_youth_secretary'];

const money = (value: number | null | undefined) => `₹${Number(value ?? 0).toLocaleString('en-IN')}`;

export function ChurchFundsSection({ churchId, isSuperAdmin = false, churches = [], canEdit: canEditProp, canManageAccess = false }: ChurchFundsSectionProps) {
  const { profile } = useAuth();
  const [selectedChurchId, setSelectedChurchId] = useState(churchId || '');
  const [fund, setFund] = useState<ChurchFund | null>(null);
  const [access, setAccess] = useState<ChurchFundAccess[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [values, setValues] = useState({ weekly_offering: '0', monthly_contribution: '0', current_youth_fund: '0' });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [exporting, setExporting] = useState<'xlsx' | 'pdf' | null>(null);
  const canEdit = canEditProp ?? isSuperAdmin;
  const showAccessPanel = isSuperAdmin || canManageAccess;
  const canSeeHistory = isSuperAdmin || (profile ? HISTORY_ROLES.includes(profile.role) : false);

  const loadHistory = useCallback(async () => {
    if (!selectedChurchId || !canSeeHistory) { setHistory([]); return; }
    const { data } = await supabase.from('church_fund_history')
      .select('id, weekly_offering, monthly_contribution, current_youth_fund, prev_weekly_offering, prev_monthly_contribution, prev_current_youth_fund, changed_by_name, changed_at')
      .eq('church_id', selectedChurchId).order('changed_at', { ascending: false }).limit(300);
    setHistory((data as HistoryRow[]) || []);
  }, [selectedChurchId, canSeeHistory]);

  const load = useCallback(async () => {
    if (!selectedChurchId) return;
    const { data } = await supabase.from('church_funds').select('id, church_id, weekly_offering, monthly_contribution, current_youth_fund, updated_by, updated_at').eq('church_id', selectedChurchId).maybeSingle();
    if (data) { const next = data as ChurchFund; setFund(next); setValues({ weekly_offering: String(next.weekly_offering), monthly_contribution: String(next.monthly_contribution), current_youth_fund: String(next.current_youth_fund) }); } else { setFund(null); setValues({ weekly_offering: '0', monthly_contribution: '0', current_youth_fund: '0' }); }
    if (showAccessPanel) { const { data: accessData } = await supabase.from('church_fund_access').select('id, church_id, role, can_view').eq('church_id', selectedChurchId); if (accessData) setAccess(accessData as ChurchFundAccess[]); }
    await loadHistory();
  }, [selectedChurchId, showAccessPanel, loadHistory]);

  useEffect(() => { load(); }, [load]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedChurchId) return;
    const payload = { church_id: selectedChurchId, weekly_offering: Number(values.weekly_offering), monthly_contribution: Number(values.monthly_contribution), current_youth_fund: Number(values.current_youth_fund), updated_by: profile?.id ?? null, updated_at: new Date().toISOString() };
    const result = fund ? await supabase.from('church_funds').update(payload).eq('id', fund.id) : await supabase.from('church_funds').insert(payload);
    if (result.error) { setError('Could not save the fund values. Please check the amounts and try again.'); return; }
    setSuccess('Church fund updated. The change is saved in the history below.');
    load();
    setTimeout(() => setSuccess(null), 3500);
  };

  const toggleAccess = async (role: UserRole, canView: boolean) => {
    const result = await supabase.from('church_fund_access').upsert({ church_id: selectedChurchId, role, can_view: canView }, { onConflict: 'church_id,role' });
    if (result.error) { setError('Could not update fund access.'); return; }
    load();
  };

  const isAllowed = (role: UserRole) => access.find((item) => item.role === role)?.can_view || false;

  const exportHistory = async (kind: 'xlsx' | 'pdf') => {
    setExporting(kind);
    setError(null);
    try {
      const lib = await import('@/lib/fundHistoryExport');
      const data = {
        churchName: churches.find((church) => church.id === selectedChurchId)?.name || 'Church',
        rows: history.map((row) => ({ changedAt: row.changed_at, weekly: Number(row.weekly_offering), monthly: Number(row.monthly_contribution), current: Number(row.current_youth_fund), changedBy: row.changed_by_name || 'Unknown' })),
      };
      if (kind === 'xlsx') lib.downloadFundHistoryExcel(data); else lib.downloadFundHistoryPdf(data);
    } catch {
      setError('Could not create the file. In the project folder run: npm install xlsx jspdf jspdf-autotable');
    }
    setExporting(null);
  };

  return (
    <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="p-5 sm:p-6 border-b border-gray-100 flex items-start justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-600">Church finance</p><h2 className="mt-1 text-xl font-bold text-gray-900">Youth fund overview</h2><p className="mt-1 text-sm text-gray-500">Private to the selected church and its approved viewers.</p></div>
        {churches.length > 0 && <select value={selectedChurchId} onChange={(event) => setSelectedChurchId(event.target.value)} className="max-w-[190px] rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm"><option value="">Select church</option>{churches.map((church) => <option key={church.id} value={church.id}>{church.name}</option>)}</select>}
      </div>
      {error && <div className="m-5"><Alert type="error" message={error} /></div>}
      {success && <div className="m-5"><Alert type="success" message={success} /></div>}
      {!selectedChurchId ? <p className="p-8 text-center text-sm text-gray-400">Choose a church to view its fund.</p> : <>
        <form onSubmit={save} className="p-5 sm:p-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[['weekly_offering', 'Weekly offering'], ['monthly_contribution', 'Monthly contribution'], ['current_youth_fund', 'Current youth fund']].map(([key, label]) => <label key={key} className="block"><span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-gray-500">{label}</span><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">₹</span><input type="number" min="0" step="0.01" value={values[key as keyof typeof values]} onChange={(event) => setValues({ ...values, [key]: event.target.value })} disabled={!canEdit} className="w-full rounded-xl border border-gray-300 py-3 pl-8 pr-3 text-lg font-bold text-gray-900 disabled:bg-gray-50" /></div></label>)}
          {canEdit && <div className="sm:col-span-3"><button className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"><Save size={16} /> Save fund values</button></div>}
          {fund?.updated_at && <p className="sm:col-span-3 text-xs text-gray-400">Last updated {new Date(fund.updated_at).toLocaleString()}</p>}
        </form>

        {canSeeHistory && (
          <div className="border-t border-gray-100 p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2"><History size={16} className="text-emerald-600" /><h3 className="font-bold text-gray-900">Fund history</h3><span className="text-xs text-gray-400">({history.length})</span></div>
              <div className="flex gap-2">
                <button type="button" disabled={history.length === 0 || exporting !== null} onClick={() => exportHistory('xlsx')} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-40"><FileSpreadsheet size={15} /> {exporting === 'xlsx' ? 'Preparing...' : 'Excel'}</button>
                <button type="button" disabled={history.length === 0 || exporting !== null} onClick={() => exportHistory('pdf')} className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-40"><FileText size={15} /> {exporting === 'pdf' ? 'Preparing...' : 'PDF'}</button>
              </div>
            </div>
            {history.length === 0 ? (
              <p className="mt-4 text-sm text-gray-400">No changes recorded yet.</p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[640px] text-left">
                  <thead className="border-b border-gray-200">
                    <tr>
                      <th className="py-2.5 pr-4 text-xs uppercase tracking-wider text-gray-500">Date and time</th>
                      <th className="py-2.5 pr-4 text-xs uppercase tracking-wider text-gray-500">Weekly offering</th>
                      <th className="py-2.5 pr-4 text-xs uppercase tracking-wider text-gray-500">Monthly contribution</th>
                      <th className="py-2.5 pr-4 text-xs uppercase tracking-wider text-gray-500">Current fund</th>
                      <th className="py-2.5 text-xs uppercase tracking-wider text-gray-500">Updated by</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {history.map((row) => (
                      <tr key={row.id}>
                        <td className="py-3 pr-4 text-sm text-gray-700 whitespace-nowrap">{new Date(row.changed_at).toLocaleString()}</td>
                        {([['weekly_offering', 'prev_weekly_offering'], ['monthly_contribution', 'prev_monthly_contribution'], ['current_youth_fund', 'prev_current_youth_fund']] as const).map(([now, before]) => (
                          <td key={now} className="py-3 pr-4 text-sm font-semibold text-gray-900">
                            {money(row[now])}
                            {row[before] !== null && Number(row[before]) !== Number(row[now]) && <span className="block text-xs font-normal text-gray-400">was {money(row[before])}</span>}
                          </td>
                        ))}
                        <td className="py-3 text-sm text-gray-600">{row.changed_by_name || 'Unknown'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {showAccessPanel && <div className="border-t border-gray-100 bg-gray-50 p-5 sm:p-6"><div className="flex items-center gap-2"><LockKeyhole size={16} className="text-emerald-600" /><h3 className="font-bold text-gray-900">Who can view this church fund?</h3></div><p className="mt-1 text-sm text-gray-500">Grant fund view access to specific roles within your church.</p><div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">{viewRoles.map((role) => <label key={role} className="flex items-center gap-2 rounded-xl bg-white border border-gray-200 px-3 py-2.5 text-sm"><input type="checkbox" checked={isAllowed(role)} onChange={(event) => toggleAccess(role, event.target.checked)} className="h-4 w-4 accent-emerald-600" /><span>{ROLE_LABELS[role]}</span></label>)}</div></div>}
      </>}
    </section>
  );
}