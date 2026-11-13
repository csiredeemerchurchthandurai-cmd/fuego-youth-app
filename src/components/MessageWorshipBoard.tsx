import { useCallback, useEffect, useState } from 'react';
import { BookOpen, Mic, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

type Assignment = { id: string; service_date: string; message_name: string; worship_name: string };

const todayIso = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

// Who gives the Message and who leads the Worship next week. For the church's secretary, treasurer and youth members.
export function MessageWorshipBoard() {
  const { profile } = useAuth();
  const churchId = profile?.church_id;
  const [upcoming, setUpcoming] = useState<Assignment | null>(null);
  const [previous, setPrevious] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!churchId) return;
    setLoading(true);
    const today = todayIso();
    const [{ data: next }, { data: before }] = await Promise.all([
      supabase.from('service_assignments').select('id, service_date, message_name, worship_name').eq('church_id', churchId).gte('service_date', today).order('service_date', { ascending: true }).limit(1),
      supabase.from('service_assignments').select('id, service_date, message_name, worship_name').eq('church_id', churchId).lt('service_date', today).order('service_date', { ascending: false }).limit(5),
    ]);
    setUpcoming(((next as Assignment[]) || [])[0] || null);
    setPrevious((before as Assignment[]) || []);
    setLoading(false);
  }, [churchId]);

  useEffect(() => { load(); }, [load]);

  const date = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <section className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-gray-900 flex items-center gap-2"><Mic size={18} className="text-orange-600" /> Message &amp; Worship</h2>
            <p className="text-sm text-gray-500 mt-1">Who gives the message and who leads the worship next week.</p>
          </div>
          <button onClick={load} disabled={loading} className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /></button>
        </div>

        {upcoming ? (
          <div className="p-6">
            <p className="text-sm font-semibold text-orange-600">{date(upcoming.service_date)}</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-orange-200 bg-orange-50 p-6 text-center">
                <p className="flex items-center justify-center gap-1.5 text-xs font-bold uppercase tracking-wide text-orange-700"><BookOpen size={14} /> Message</p>
                <p className="mt-2 text-2xl font-extrabold text-slate-900">{upcoming.message_name}</p>
              </div>
              <div className="rounded-2xl border border-sky-200 bg-sky-50 p-6 text-center">
                <p className="flex items-center justify-center gap-1.5 text-xs font-bold uppercase tracking-wide text-sky-700"><Mic size={14} /> Worship</p>
                <p className="mt-2 text-2xl font-extrabold text-slate-900">{upcoming.worship_name}</p>
              </div>
            </div>
          </div>
        ) : (
          <p className="p-8 text-center text-sm text-gray-400">The Message and Worship persons for next week have not been assigned yet.</p>
        )}
      </div>

      {previous.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="p-5 border-b border-gray-100"><h3 className="font-bold text-gray-900">Previous weeks</h3></div>
          <div className="divide-y divide-gray-100">
            {previous.map((item) => (
              <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                <span className="font-semibold text-gray-900">{new Date(`${item.service_date}T00:00:00`).toLocaleDateString()}</span>
                <span className="text-gray-600">Message: <b>{item.message_name}</b> · Worship: <b>{item.worship_name}</b></span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}