import { useState } from 'react';
import { ChevronRight, Folder, FolderOpen, Search, UserCircle, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { ROLE_LABELS } from '@/types';
import type { Church, UserRole } from '@/types';

type Person = {
  person_id: string;
  full_name: string;
  role_key: string;
  phone: string | null;
  email: string | null;
  date_of_birth: string | null;
  address: string | null;
  is_leader: boolean;
  church_id: string;
};

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-700">{value || '—'}</p>
    </div>
  );
}

const roleName = (key: string) => ROLE_LABELS[key as UserRole] || key;

// Every church's people for the pastorate roles and PC members: the church's leaders (pastorate admins,
// local secretary and treasurer, PC members) first, then its youth members. View only: nothing here can be edited.
export function MemberDirectory({ churches }: { churches: Church[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [peopleByChurch, setPeopleByChurch] = useState<Record<string, Person[]>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Person | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  const toggle = async (churchId: string) => {
    if (expanded === churchId) { setExpanded(null); return; }
    setExpanded(churchId);
    setQuery('');
    if (peopleByChurch[churchId]) return;
    setLoadingId(churchId);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc('church_people', { target_church: churchId });
    if (rpcError) setError(`Could not load the people of this church: ${rpcError.message}`);
    else setPeopleByChurch((current) => ({ ...current, [churchId]: ((data as Omit<Person, 'church_id'>[]) || []).map((row) => ({ ...row, church_id: churchId })) }));
    setLoadingId(null);
  };

  const churchName = (id: string) => churches.find((church) => church.id === id)?.name || '';

  const renderPerson = (person: Person) => (
    <button key={`${person.role_key}-${person.person_id}`} onClick={() => setSelected(person)} className="flex items-center gap-3 p-3 rounded-xl bg-white border border-gray-200 hover:border-orange-300 hover:shadow-sm transition-all text-left">
      <div className={`h-9 w-9 rounded-full flex items-center justify-center text-sm font-bold text-white ${person.is_leader ? 'bg-gradient-to-br from-slate-700 to-slate-900' : 'bg-gradient-to-br from-orange-400 to-red-500'}`}>{person.full_name.charAt(0).toUpperCase()}</div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-gray-900 text-sm truncate">{person.full_name}</div>
        <div className="text-xs text-gray-400 truncate">{person.is_leader ? roleName(person.role_key) : (person.phone || person.email || 'No contact info')}</div>
      </div>
      <ChevronRight size={16} className="text-gray-300 flex-shrink-0" />
    </button>
  );

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="p-5 border-b border-gray-100">
        <h2 className="font-bold text-gray-900 flex items-center gap-2"><Folder size={18} className="text-orange-600" /> Church members</h2>
        <p className="text-sm text-gray-500 mt-1">Open a church to see its leaders and youth members. Details are view only.</p>
      </div>
      {error && <p className="px-5 pt-4 text-sm text-red-600">{error}</p>}
      {churches.length === 0 ? (
        <p className="p-5 text-sm text-gray-400 text-center">No churches available.</p>
      ) : (
        <div className="divide-y divide-gray-100">
          {churches.map((church) => {
            const people = peopleByChurch[church.id] || [];
            const term = query.trim().toLowerCase();
            const match = (person: Person) => !term || person.full_name.toLowerCase().includes(term) || roleName(person.role_key).toLowerCase().includes(term);
            const leaders = people.filter((person) => person.is_leader && match(person));
            const youth = people.filter((person) => !person.is_leader && match(person));
            const youthTotal = people.filter((person) => !person.is_leader).length;
            return (
              <div key={church.id}>
                <button onClick={() => toggle(church.id)} className="w-full p-4 flex items-center gap-3 hover:bg-gray-50 transition-colors text-left">
                  <div className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${expanded === church.id ? 'bg-orange-100' : 'bg-gray-100'}`}>
                    {expanded === church.id ? <FolderOpen size={20} className="text-orange-600" /> : <Folder size={20} className="text-gray-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-gray-900">{church.name}</div>
                    <div className="text-sm text-gray-500">{church.location || 'No location set'}</div>
                  </div>
                  {peopleByChurch[church.id] && <span className="text-xs px-2 py-1 rounded-full bg-blue-50 text-blue-600 font-medium">{youthTotal} youth members</span>}
                  <ChevronRight size={18} className={`text-gray-300 transition-transform ${expanded === church.id ? 'rotate-90' : ''}`} />
                </button>

                {expanded === church.id && (
                  <div className="bg-gray-50 px-4 pb-4">
                    {loadingId === church.id ? (
                      <p className="py-4 text-center text-sm text-gray-400">Loading...</p>
                    ) : (
                      <>
                        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 mb-3">
                          <div className="flex items-center gap-2">
                            <UserCircle size={16} className="text-orange-500" />
                            <h3 className="text-sm font-bold text-gray-700">{people.length} people</h3>
                          </div>
                          {people.length > 0 && (
                            <div className="relative">
                              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or role" className="w-52 rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                            </div>
                          )}
                        </div>

                        {people.length === 0 ? (
                          <p className="text-sm text-gray-400 text-center py-4 bg-white rounded-lg border border-gray-100">Nobody is registered for this church yet.</p>
                        ) : leaders.length + youth.length === 0 ? (
                          <p className="text-sm text-gray-400 text-center py-4">No one matches that search.</p>
                        ) : (
                          <div className="space-y-4">
                            {leaders.length > 0 && (
                              <div>
                                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">Leaders ({leaders.length})</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{leaders.map(renderPerson)}</div>
                              </div>
                            )}
                            {youth.length > 0 && (
                              <div>
                                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">Youth members ({youth.length})</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{youth.map(renderPerson)}</div>
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center text-lg font-bold text-white">{selected.full_name.charAt(0).toUpperCase()}</div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">{selected.full_name}</h3>
                  <p className="text-xs font-semibold text-orange-600">{selected.is_leader ? `${roleName(selected.role_key)} · ` : ''}{churchName(selected.church_id)}</p>
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100" aria-label="Close"><X size={18} /></button>
            </div>
            <div className="mt-5 space-y-3">
              <Detail label="Phone" value={selected.phone || ''} />
              <Detail label="Email" value={selected.email || ''} />
              <Detail label="Date of birth" value={selected.date_of_birth ? new Date(`${selected.date_of_birth.slice(0, 10)}T00:00:00`).toLocaleDateString() : ''} />
              {!selected.is_leader && <Detail label="Address" value={selected.address || ''} />}
            </div>
            <p className="mt-4 text-xs text-gray-400">View only. Details can be changed by the church's own leaders.</p>
          </div>
        </div>
      )}
    </div>
  );
}