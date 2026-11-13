import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { ROLE_LABELS } from '@/types';
import type { UserRole } from '@/types';

type DirectoryRow = { member_id: string; full_name: string; avatar_url: string | null; role_key: string; sort_group: number };

const BUCKET = 'profile-photos';

// Photo shown as a background behind a transparent shield: there is no <img> to right-click,
// drag or long-press and "save". (A screenshot cannot be blocked by a website, see the notes.)
function ProtectedPhoto({ url, name }: { url?: string; name: string }) {
  return (
    <div
      className="relative h-24 w-24 shrink-0 select-none overflow-hidden rounded-2xl bg-orange-100"
      style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
    >
      {url ? (
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url("${url}")` }} />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-3xl font-extrabold text-orange-700">{name.charAt(0).toUpperCase()}</span>
      )}
      <div className="absolute inset-0" />
    </div>
  );
}

// Members of the signed-in youth member's own church: name and photo only.
export function YouthChurchMembers() {
  const [rows, setRows] = useState<DirectoryRow[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: rpcError } = await supabase.rpc('church_member_directory');
    if (rpcError) { setError('Could not load your church members right now.'); setLoading(false); return; }
    const list = (data as DirectoryRow[]) || [];
    setRows(list);
    setError(null);

    // Short-lived links (5 minutes), renewed while this page stays open
    const paths = list.map((row) => row.avatar_url).filter((path): path is string => Boolean(path));
    if (paths.length > 0) {
      const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 300);
      const map: Record<string, string> = {};
      (signed || []).forEach((item) => { if (item.path && item.signedUrl) map[item.path] = item.signedUrl; });
      setUrls(map);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 4 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [load]);

  const visible = useMemo(() => rows.filter((row) => row.full_name.toLowerCase().includes(query.trim().toLowerCase())), [rows, query]);

  return (
    <section className="print:hidden">
      <div className="mb-7 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-slate-500">The leaders and youth members of your church.</p>
          <h2 className="mt-1 text-3xl font-extrabold tracking-tight">Members</h2>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name" className="w-48 rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
          </div>
          <button onClick={load} disabled={loading} className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50" aria-label="Refresh">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {error && <p className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {!loading && visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center max-w-xl">
          <h3 className="text-lg font-bold">{rows.length === 0 ? 'No members yet' : 'No match'}</h3>
          <p className="mt-2 text-sm text-slate-500">{rows.length === 0 ? 'Members of your church will appear here.' : 'No member matches that name.'}</p>
        </div>
      ) : (
        <div className="space-y-8">
          {[{ title: 'Leaders', list: visible.filter((row) => row.sort_group === 0) }, { title: 'Youth members', list: visible.filter((row) => row.sort_group !== 0) }]
            .filter((group) => group.list.length > 0)
            .map((group) => (
              <div key={group.title}>
                <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-400">{group.title} ({group.list.length})</h3>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                  {group.list.map((row) => (
                    <div key={`${row.role_key}-${row.member_id}`} className="flex flex-col items-center rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm">
                      <ProtectedPhoto url={row.avatar_url ? urls[row.avatar_url] : undefined} name={row.full_name} />
                      <p className="mt-3 w-full truncate text-sm font-bold text-slate-900">{row.full_name}</p>
                      {row.sort_group === 0 && <p className="mt-1 w-full truncate text-xs font-semibold text-orange-600">{ROLE_LABELS[row.role_key as UserRole] || row.role_key}</p>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}
    </section>
  );
}