import { useCallback, useEffect, useState } from 'react';
import { Mic, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type Church = { id: string; name: string };
type Assignment = { id: string; church_id: string; service_date: string; message_name: string; worship_name: string };

const todayIso = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

// Super Admin: next week's Message and Worship persons of every church
export function MessageWorshipAllChurches() {
  const [churches, setChurches] = useState<Church[]>([]);
  const [upcoming, setUpcoming] = useState<Record<string, Assignment>>({});
  const [recent, setRecent] = useState<Record<string, Assignment>>({});
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const today = todayIso();
    const [{ data: churchData }, { data: next }, { data: before }] = await Promise.all([
      supabase.from('churches').select('id, name').order('name'),
      supabase.from('service_assignments').select('id, church_id, service_date, message_name, worship_name').gte('service_date', today).order('service_date', { ascending: true }),
      supabase.from('service_assignments').select('id, church_id, service_date, message_name, worship_name').lt('service_date', today).order('service_date', { ascending: false }).limit(200),
    ]);
    setChurches((churchData as Church[]) || []);
    const firstPerChurch = (rows: Assignment[]) => { const map: Record<string, Assignment> = {}; rows.forEach((row) => { if (!map[row.church_id]) map[row.church_id] = row; }); return map; };
    setUpcoming(firstPerChurch((next as Assignment[]) || []));
    setRecent(firstPerChurch((before as Assignment[]) || []));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const date = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="p-5 border-b border-gray-100 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-gray-900 flex items-center gap-2"><Mic size={18} className="text-orange-600" /> Message &amp; Worship, all churches</h2>
          <p className="text-sm text-gray-500 mt-1">Who gives the message and who leads the worship next week in each church.</p>
        </div>
        <button onClick={load} disabled={loading} className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /></button>
      </div>
      {churches.length === 0 ? (
        <p className="p-6 text-center text-sm text-gray-400">No churches yet.</p>
      ) : (
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          {churches.map((church) => {
            const next = upcoming[church.id];
            const last = recent[church.id];
            return (
              <div key={church.id} className="rounded-2xl border border-gray-200 p-5">
                <p className="font-bold text-gray-900">{church.name}</p>
                {next ? (
                  <>
                    <p className="mt-1 text-xs font-semibold text-orange-600">{date(next.service_date)}</p>
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <div className="rounded-xl bg-orange-50 p-3 text-center"><p className="text-[11px] font-bold uppercase tracking-wide text-orange-700">Message</p><p className="mt-1 text-sm font-extrabold text-slate-900">{next.message_name}</p></div>
                      <div className="rounded-xl bg-sky-50 p-3 text-center"><p className="text-[11px] font-bold uppercase tracking-wide text-sky-700">Worship</p><p className="mt-1 text-sm font-extrabold text-slate-900">{next.worship_name}</p></div>
                    </div>
                  </>
                ) : (
                  <p className="mt-3 rounded-xl bg-gray-50 p-3 text-center text-sm text-gray-400">Not assigned yet</p>
                )}
                {last && <p className="mt-3 text-xs text-gray-400">Last week ({date(last.service_date)}): {last.message_name} (message), {last.worship_name} (worship)</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}