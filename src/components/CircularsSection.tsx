import { useState, useEffect, useCallback } from 'react';
import { FileText, Plus, X, Clock, Eye, Trash2, Check, Target, Paperclip } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Alert } from '@/components/ui';
import { AttachmentPicker, formatFileSize } from '@/components/AttachmentPicker';
import { listCircularFiles, openCircularFile, uploadCircularFiles } from '@/lib/circularAttachments';
import type { CircularAttachment } from '@/lib/circularAttachments';
import { AUDIENCE_OPTIONS, CIRCULAR_SENDER_ROLES, WIDE_ROLES, audienceIncludes, audienceLabel } from '@/lib/circularAudience';
import type { Circular, CircularRead, Church } from '@/types';
import { ROLE_LABELS } from '@/types';

export function CircularsSection() {
  const { profile } = useAuth();
  const churchId = profile?.church_id;
  const [circulars, setCirculars] = useState<Circular[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [churches, setChurches] = useState<Church[]>([]);
  const [attachments, setAttachments] = useState<Record<string, CircularAttachment[]>>({});
  const [showForm, setShowForm] = useState(false);
  const [selectedCircular, setSelectedCircular] = useState<Circular | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [scope, setScope] = useState<'church' | 'global'>('church');
  const [targetChurchId, setTargetChurchId] = useState<string>('');
  const [audience, setAudience] = useState<string>('all');
  const [files, setFiles] = useState<File[]>([]);
  const [publishing, setPublishing] = useState(false);

  const isSuperAdmin = profile?.role === 'super_admin';
  // Every admin role (and PC members) can send circulars
  const canIssue = profile ? CIRCULAR_SENDER_ROLES.includes(profile.role) : false;
  // Roles that oversee all churches can pick any church; church-level roles send to their own church or to all churches
  const canPickChurch = profile ? WIDE_ROLES.includes(profile.role) : false;

  const fetchData = useCallback(async () => {
    if (!profile) return;
    let circularQuery = supabase
      .from('circulars')
      .select('id, church_id, title, body, created_by, created_by_role, target_audience, created_at')
      .order('created_at', { ascending: false });
    if (!canPickChurch) circularQuery = circularQuery.or(`church_id.is.null,church_id.eq.${churchId || '00000000-0000-0000-0000-000000000000'}`);
    const { data: circData } = await circularQuery;
    const { data: readData } = await supabase.from('circular_reads').select('id, circular_id, read_by, read_at').eq('read_by', profile.id);

    if (circData) {
      const visible = (circData as Circular[]).filter((c) => audienceIncludes(c.target_audience, profile.role, c.created_by === profile.id));
      setCirculars(visible);
      setAttachments(await listCircularFiles(visible.map((c) => c.id)));
    }
    if (readData) setReadIds(new Set((readData as CircularRead[]).map((r) => r.circular_id)));
  }, [profile, churchId, canPickChurch]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (canPickChurch) {
      supabase.from('churches').select('id, name, location, created_at').order('name').then(({ data }) => {
        if (data) setChurches(data as Church[]);
      });
    }
  }, [canPickChurch]);

  const createCircular = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || publishing) return;
    setError(null);

    const targetChurch = scope === 'global' ? null : (canPickChurch ? targetChurchId || churchId : churchId);
    if (scope === 'church' && !targetChurch) {
      setError('Please select a target church.');
      return;
    }

    setPublishing(true);
    const { data: created, error: insertError } = await supabase.from('circulars').insert({
      church_id: targetChurch,
      title,
      body,
      created_by: profile.id,
      created_by_role: profile.role,
      target_audience: audience,
    }).select('id').single();

    if (insertError || !created) { setError(insertError?.message || 'Could not publish this circular.'); setPublishing(false); return; }

    // Attach the chosen files to the new circular
    let failed = 0;
    if (files.length > 0) failed = await uploadCircularFiles(created.id, files, profile.id);

    if (failed > 0) setError(`The circular was published, but ${failed} file${failed > 1 ? 's' : ''} could not be uploaded.`);
    else setSuccess('Circular published successfully!');
    setTitle(''); setBody(''); setShowForm(false); setScope('church'); setTargetChurchId(''); setAudience('all'); setFiles([]);
    setPublishing(false);
    fetchData();
    setTimeout(() => setSuccess(null), 3000);
  };

  const deleteCircular = async (id: string) => {
    if (!confirm('Delete this circular?')) return;
    const { error: delError } = await supabase.from('circulars').delete().eq('id', id);
    if (delError) { setError(delError.message); return; }
    fetchData();
    setSuccess('Circular deleted.');
    setTimeout(() => setSuccess(null), 3000);
  };

  const markRead = async (circularId: string) => {
    if (readIds.has(circularId)) return;
    const { error: readError } = await supabase.from('circular_reads').insert({
      circular_id: circularId,
      read_by: profile!.id,
    });
    if (readError) { setError(readError.message); return; }
    setReadIds((prev) => new Set(prev).add(circularId));
  };

  const openCircular = (c: Circular) => {
    setSelectedCircular(c);
    markRead(c.id);
  };

  const canDelete = (c: Circular) => c.created_by === profile?.id || isSuperAdmin;

  const selectedFiles = selectedCircular ? attachments[selectedCircular.id] || [] : [];

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      {error && <div className="m-4"><Alert type="error" message={error} /></div>}
      {success && <div className="m-4"><Alert type="success" message={success} /></div>}

      <div className="flex items-center justify-between p-5 border-b border-gray-100">
        <h2 className="font-bold text-gray-900 flex items-center gap-2"><FileText size={18} className="text-orange-600" /> Circulars</h2>
        {canIssue && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-1.5 text-sm font-semibold text-orange-600 hover:text-orange-700 transition-colors"
          >
            {showForm ? <><X size={16} /> Cancel</> : <><Plus size={16} /> New Circular</>}
          </button>
        )}
      </div>

      {showForm && canIssue && (
        <form onSubmit={createCircular} className="p-5 border-b border-gray-100 bg-gray-50 space-y-3">
          <div className="flex gap-2">
            <button type="button" onClick={() => setScope('church')} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${scope === 'church' ? 'bg-orange-500 text-white' : 'bg-white border border-gray-300 text-gray-600'}`}>{canPickChurch ? 'To Specific Church' : 'My Church'}</button>
            <button type="button" onClick={() => setScope('global')} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${scope === 'global' ? 'bg-orange-500 text-white' : 'bg-white border border-gray-300 text-gray-600'}`}>{canPickChurch ? 'Global (All Churches)' : 'All Churches'}</button>
          </div>
          {canPickChurch && scope === 'church' && (
            <select value={targetChurchId} onChange={(e) => setTargetChurchId(e.target.value)} required={scope === 'church'} className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500">
              <option value="">Select target church...</option>
              {churches.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}

          {/* Target audience selector */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5 flex items-center gap-1"><Target size={12} /> Target Audience</label>
            <select value={audience} onChange={(e) => setAudience(e.target.value)} className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white">
              {AUDIENCE_OPTIONS.map((a) => (
                <option key={a.value} value={a.value}>{a.label}</option>
              ))}
            </select>
          </div>

          <input type="text" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Circular title" className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
          <textarea required value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write your circular content..." rows={4} className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none" />

          {/* File attachments */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5 flex items-center gap-1"><Paperclip size={12} /> Attachments (optional)</label>
            <AttachmentPicker files={files} onChange={setFiles} onProblem={setError} />
          </div>

          <button type="submit" disabled={publishing} className="bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors disabled:opacity-50">{publishing ? 'Publishing...' : 'Publish Circular'}</button>
        </form>
      )}

      {circulars.length === 0 ? (
        <p className="p-5 text-sm text-gray-400 text-center">No circulars yet.</p>
      ) : (
        <div className="divide-y divide-gray-100">
          {circulars.map((c) => {
            const isRead = readIds.has(c.id);
            const fileCount = attachments[c.id]?.length || 0;
            return (
              <div key={c.id} className="p-4 flex items-start gap-3 hover:bg-gray-50 transition-colors group">
                <button onClick={() => openCircular(c)} className="flex items-start gap-3 flex-1 min-w-0 text-left">
                  <div className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isRead ? 'bg-gray-100' : 'bg-orange-100'}`}>
                    <FileText size={18} className={isRead ? 'text-gray-400' : 'text-orange-600'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900 text-sm truncate">{c.title}</span>
                      {!isRead && <span className="h-2 w-2 rounded-full bg-orange-500 flex-shrink-0" />}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{c.body}</p>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className="text-xs text-gray-400 flex items-center gap-1"><Clock size={11} /> {new Date(c.created_at).toLocaleDateString()}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 capitalize">{ROLE_LABELS[c.created_by_role as keyof typeof ROLE_LABELS] || c.created_by_role.replace(/_/g, ' ')}</span>
                      {c.church_id === null && <span className="text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-medium">Global</span>}
                      {c.target_audience && c.target_audience !== 'all' && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-purple-50 text-purple-600 font-medium">{audienceLabel(c.target_audience)}</span>
                      )}
                      {fileCount > 0 && <span className="text-xs px-1.5 py-0.5 rounded bg-orange-50 text-orange-600 font-medium flex items-center gap-1"><Paperclip size={11} /> {fileCount}</span>}
                    </div>
                  </div>
                  <Eye size={16} className="text-gray-300 flex-shrink-0 mt-1" />
                </button>
                {canDelete(c) && (
                  <button onClick={() => deleteCircular(c.id)} className="p-1.5 text-gray-200 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100">
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {selectedCircular && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setSelectedCircular(null)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h3 className="font-bold text-gray-900 text-lg">{selectedCircular.title}</h3>
              <button onClick={() => setSelectedCircular(null)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"><X size={18} /></button>
            </div>
            <div className="p-5">
              <div className="flex items-center gap-2 mb-4 flex-wrap">
                <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-500 capitalize">{ROLE_LABELS[selectedCircular.created_by_role as keyof typeof ROLE_LABELS] || selectedCircular.created_by_role.replace(/_/g, ' ')}</span>
                <span className="text-xs text-gray-400 flex items-center gap-1"><Clock size={11} /> {new Date(selectedCircular.created_at).toLocaleString()}</span>
                {selectedCircular.church_id === null && <span className="text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-600 font-medium">Global</span>}
                {selectedCircular.target_audience && selectedCircular.target_audience !== 'all' && (
                  <span className="text-xs px-2 py-0.5 rounded bg-purple-50 text-purple-600 font-medium">{audienceLabel(selectedCircular.target_audience)}</span>
                )}
              </div>
              <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{selectedCircular.body}</p>

              {selectedFiles.length > 0 && (
                <div className="mt-5">
                  <p className="text-xs font-bold uppercase tracking-wide text-gray-400 flex items-center gap-1"><Paperclip size={12} /> Attachments ({selectedFiles.length})</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selectedFiles.map((file) => (
                      <button key={file.id} type="button" onClick={() => openCircularFile(file.file_path)} className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:border-orange-300 hover:text-orange-700">
                        <Paperclip size={13} className="shrink-0" />
                        <span className="truncate">{file.file_name}</span>
                        {file.file_size ? <span className="shrink-0 font-normal text-gray-400">{formatFileSize(file.file_size)}</span> : null}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="p-5 border-t border-gray-100 flex items-center gap-2">
              <Check size={16} className="text-emerald-500" />
              <span className="text-sm text-emerald-600 font-medium">Marked as read</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}