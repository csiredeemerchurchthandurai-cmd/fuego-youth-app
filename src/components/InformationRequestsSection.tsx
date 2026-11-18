import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Clock3, FileText, MessageSquare, Paperclip, RefreshCw, Send, X, XCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { markFeatureSeen } from '@/hooks/useUnreadCounts';
import { Alert } from '@/components/ui';
import { ROLE_LABELS } from '@/types';
import type { UserRole } from '@/types';

type RequestStatus = 'pending' | 'approved' | 'rejected';
type StatusFilter = 'all' | RequestStatus;

type InformationRequest = {
  id: string;
  church_id: string | null;
  requested_by: string;
  requester_role: UserRole;
  requester_name: string | null;
  recipient_role: UserRole;
  subject: string;
  message: string;
  status: RequestStatus;
  decided_by_name: string | null;
  target_all_churches: boolean | null;
  target_church_ids: string[] | null;
  target_user_ids: string[] | null;
  decided_at: string | null;
  created_at: string;
};

type RequestComment = {
  id: string;
  request_id: string;
  author_id: string;
  author_name: string | null;
  author_role: UserRole;
  body: string;
  created_at: string;
};

type Attachment = {
  id: string;
  request_id: string;
  comment_id: string | null;
  file_name: string;
  file_path: string;
  file_type: string | null;
  file_size: number | null;
  created_at: string;
};

type Person = { id: string; full_name: string | null; role: UserRole; church_id: string | null };
type Scope = 'mine' | 'selected' | 'all' | 'people';

// Roles that can be asked for information
const recipientRoles: UserRole[] = [
  'super_admin',
  'church_admin',
  'pc_member',
  'local_youth_secretary',
  'local_youth_treasurer',
  'pastorate_convenor',
  'pastorate_youth_secretary',
  'pastorate_youth_treasurer',
];

// Who can address one church, several churches, or all churches
const CHURCH_TARGET_ROLES = ['super_admin', 'pastorate_youth_secretary', 'pastorate_youth_treasurer', 'pastorate_convenor', 'local_youth_secretary', 'local_youth_treasurer'];
// Who can also pick specific people (youth leaders). Add more roles here if needed.
const PEOPLE_TARGET_ROLES = ['super_admin'];

const requestFields = 'id, church_id, requested_by, requester_role, requester_name, recipient_role, subject, message, status, decided_by_name, decided_at, created_at, target_all_churches, target_church_ids, target_user_ids';
const commentFields = 'id, request_id, author_id, author_name, author_role, body, created_at';
const attachmentFields = 'id, request_id, comment_id, file_name, file_path, file_type, file_size, created_at';

const BUCKET = 'request-attachments';
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 5;
const ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.png,.jpg,.jpeg,.gif,.webp,.heic';
const ALLOWED_EXTENSIONS = ACCEPT.split(',').map((ext) => ext.slice(1));

function formatSize(bytes: number | null) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

// Checks a chosen list of files; returns the accepted ones plus a message if any were skipped
function validateFiles(current: File[], incoming: File[]): { files: File[]; message: string | null } {
  const accepted = [...current];
  let message: string | null = null;
  for (const file of incoming) {
    const extension = file.name.split('.').pop()?.toLowerCase() || '';
    if (accepted.length >= MAX_FILES) { message = `You can attach up to ${MAX_FILES} files at a time.`; break; }
    if (!ALLOWED_EXTENSIONS.includes(extension)) { message = `${file.name}: this file type is not allowed.`; continue; }
    if (file.size > MAX_FILE_BYTES) { message = `${file.name} is larger than 10 MB.`; continue; }
    accepted.push(file);
  }
  return { files: accepted, message };
}

function StatusBadge({ status }: { status: RequestStatus }) {
  if (status === 'approved') return <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700"><CheckCircle2 size={13} /> Approved</span>;
  if (status === 'rejected') return <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700"><XCircle size={13} /> Rejected</span>;
  return <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700"><Clock3 size={13} /> Pending</span>;
}

// File chooser with the list of selected files
function FilePicker({ files, onChange, onProblem, compact = false }: { files: File[]; onChange: (files: File[]) => void; onProblem: (message: string | null) => void; compact?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChoose = (event: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = Array.from(event.target.files || []);
    event.target.value = '';
    if (chosen.length === 0) return;
    const result = validateFiles(files, chosen);
    onProblem(result.message);
    onChange(result.files);
  };

  return (
    <div>
      <input ref={inputRef} type="file" multiple accept={ACCEPT} onChange={handleChoose} className="hidden" />
      <button type="button" onClick={() => inputRef.current?.click()} className={`inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white font-semibold text-slate-700 hover:bg-slate-50 ${compact ? 'px-3 py-2 text-xs' : 'px-3.5 py-2.5 text-sm'}`}>
        <Paperclip size={compact ? 14 : 16} /> Attach files
      </button>
      {files.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {files.map((file, index) => (
            <li key={`${file.name}-${index}`} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600">
              <FileText size={14} className="shrink-0 text-slate-400" />
              <span className="min-w-0 flex-1 truncate">{file.name}</span>
              <span className="shrink-0 text-slate-400">{formatSize(file.size)}</span>
              <button type="button" onClick={() => onChange(files.filter((_, i) => i !== index))} className="shrink-0 text-slate-400 hover:text-red-600" aria-label={`Remove ${file.name}`}><X size={14} /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AttachmentList({ items, onOpen }: { items: Attachment[]; onOpen: (item: Attachment) => void }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {items.map((item) => (
        <button key={item.id} type="button" onClick={() => onOpen(item)} className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:border-orange-300 hover:text-orange-700">
          <Paperclip size={13} className="shrink-0" />
          <span className="truncate">{item.file_name}</span>
          {item.file_size ? <span className="shrink-0 font-normal text-slate-400">{formatSize(item.file_size)}</span> : null}
        </button>
      ))}
    </div>
  );
}

function recipientSummary(item: InformationRequest) {
  if (item.target_user_ids && item.target_user_ids.length > 0) {
    return ` · ${item.target_user_ids.length} ${item.target_user_ids.length === 1 ? 'person' : 'people'}`;
  }
  if (item.target_all_churches) return ' · all churches';
  if (item.target_church_ids && item.target_church_ids.length > 0) {
    return ` · ${item.target_church_ids.length} ${item.target_church_ids.length === 1 ? 'church' : 'churches'}`;
  }
  return '';
}

function RequestCard({ item, comments, requestFiles, commentFiles, canDecide, showRequester, churchName, onDecide, onComment, onOpenFile, onProblem }: {
  item: InformationRequest;
  comments: RequestComment[];
  requestFiles: Attachment[];
  commentFiles: Record<string, Attachment[]>;
  canDecide: boolean;
  showRequester: boolean;
  churchName?: string;
  onDecide: (status: RequestStatus) => Promise<void>;
  onComment: (body: string, files: File[]) => Promise<void>;
  onOpenFile: (attachment: Attachment) => void;
  onProblem: (message: string | null) => void;
}) {
  const [draft, setDraft] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [posting, setPosting] = useState(false);
  const [deciding, setDeciding] = useState(false);

  const postComment = async (event: React.FormEvent) => {
    event.preventDefault();
    if ((!draft.trim() && files.length === 0) || posting) return;
    setPosting(true);
    await onComment(draft.trim(), files);
    setDraft('');
    setFiles([]);
    setPosting(false);
  };

  const decide = async (status: RequestStatus) => {
    setDeciding(true);
    await onDecide(status);
    setDeciding(false);
  };

  return (
    <div className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold text-gray-900">{item.subject}</p>
          <p className="text-xs text-gray-400 mt-1">
            {showRequester
              ? `From ${item.requester_name || 'Unknown'} (${ROLE_LABELS[item.requester_role] || item.requester_role})${churchName ? ` · ${churchName}` : ''}`
              : `To ${item.target_user_ids && item.target_user_ids.length > 0 ? 'selected leaders' : ROLE_LABELS[item.recipient_role] || item.recipient_role}${recipientSummary(item)}`}
            {' · '}{new Date(item.created_at).toLocaleString()}
          </p>
        </div>
        <StatusBadge status={item.status} />
      </div>

      <p className="text-sm text-gray-600 mt-3 whitespace-pre-wrap">{item.message}</p>
      <AttachmentList items={requestFiles} onOpen={onOpenFile} />

      {item.status !== 'pending' && item.decided_at && (
        <p className="text-xs text-gray-400 mt-2">{item.status === 'approved' ? 'Approved' : 'Rejected'} by {item.decided_by_name || 'an administrator'} · {new Date(item.decided_at).toLocaleString()}</p>
      )}

      {canDecide && item.status === 'pending' && (
        <div className="mt-3 flex gap-2">
          <button disabled={deciding} onClick={() => decide('approved')} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"><CheckCircle2 size={14} /> Approve</button>
          <button disabled={deciding} onClick={() => decide('rejected')} className="inline-flex items-center gap-1.5 rounded-lg bg-red-500 px-3 py-2 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-50"><XCircle size={14} /> Reject</button>
        </div>
      )}

      <div className="mt-4 rounded-xl bg-slate-50 border border-slate-200 p-3">
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500"><MessageSquare size={13} /> Comments ({comments.length})</p>
        {comments.length > 0 && (
          <div className="mt-3 space-y-2">
            {comments.map((comment) => (
              <div key={comment.id} className="rounded-lg bg-white border border-slate-200 p-3">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-slate-700">{comment.author_name || 'User'} <span className="font-normal text-slate-400">· {ROLE_LABELS[comment.author_role] || comment.author_role}</span></span>
                  <span className="text-slate-400">{new Date(comment.created_at).toLocaleString()}</span>
                </div>
                {comment.body && <p className="text-sm text-slate-600 mt-1 whitespace-pre-wrap">{comment.body}</p>}
                <AttachmentList items={commentFiles[comment.id] || []} onOpen={onOpenFile} />
              </div>
            ))}
          </div>
        )}
        <form onSubmit={postComment} className="mt-3 space-y-2">
          <div className="flex gap-2">
            <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={1000} placeholder="Write a comment" className="flex-1 min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
            <button disabled={posting || (!draft.trim() && files.length === 0)} className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-40">{posting ? 'Posting...' : 'Comment'}</button>
          </div>
          <FilePicker files={files} onChange={setFiles} onProblem={onProblem} compact />
        </form>
      </div>
    </div>
  );
}

// mode "send": the sender's view (form + my requests).
// mode "inbox": the recipient's view (requests sent to my role, with approve/reject).
export function InformationRequestsSection({ mode = 'both' }: { mode?: 'send' | 'inbox' | 'both' }) {
  const { profile } = useAuth();
  // "both": the person can send requests and also receive them (switch between Received and Sent)
  const [box, setBox] = useState<'received' | 'sent'>('received');
  const [composeOpen, setComposeOpen] = useState(false);
  const activeBox = mode === 'inbox' ? 'received' : mode === 'send' ? 'sent' : box;
  const isInbox = activeBox === 'received';
  const showForm = mode === 'send' || (mode === 'both' && composeOpen);
  const [recipient, setRecipient] = useState<UserRole>('church_admin');
  // Who can choose the churches / specific people. The Super Admin can do all of it.
  const canTarget = CHURCH_TARGET_ROLES.includes(profile?.role || '');
  const canPickPeople = PEOPLE_TARGET_ROLES.includes(profile?.role || '');
  const hasOwnChurch = Boolean(profile?.church_id);
  const [scope, setScope] = useState<Scope>('mine');
  const [selectedChurches, setSelectedChurches] = useState<string[]>([]);
  const [selectedPeople, setSelectedPeople] = useState<string[]>([]);
  const [peopleSearch, setPeopleSearch] = useState('');
  const [churchList, setChurchList] = useState<{ id: string; name: string }[]>([]);
  const [peopleList, setPeopleList] = useState<Person[]>([]);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [requests, setRequests] = useState<InformationRequest[]>([]);
  const [comments, setComments] = useState<Record<string, RequestComment[]>>({});
  const [requestFiles, setRequestFiles] = useState<Record<string, Attachment[]>>({});
  const [commentFiles, setCommentFiles] = useState<Record<string, Attachment[]>>({});
  const [churchNames, setChurchNames] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // A person without a church of their own (the Super Admin) cannot use "My church"
  useEffect(() => {
    if (profile && !hasOwnChurch && scope === 'mine') setScope('all');
  }, [profile, hasOwnChurch, scope]);

  const flash = (text: string) => {
    setSuccess(text);
    setTimeout(() => setSuccess(null), 3500);
  };

  const load = useCallback(async () => {
    if (!profile?.id) return;
    const startedAt = new Date();
    setLoading(true);
    let query = supabase.from('information_requests').select(requestFields).order('created_at', { ascending: false });
    if (isInbox) {
      // Requests for my role, plus requests that name me personally
      query = query.or(`recipient_role.eq.${profile.role},target_user_ids.cs.{${profile.id}}`);
    } else {
      query = query.eq('requested_by', profile.id);
    }
    const { data, error: queryError } = await query;
    if (queryError) {
      setError('Could not load requests right now.');
      setLoading(false);
      return;
    }
    const wholePastorateRoles = ['super_admin', 'pastorate_convenor', 'pastorate_youth_secretary', 'pastorate_youth_treasurer'];
    const rows = ((data as InformationRequest[]) || []).filter((row) => {
      if (!isInbox) return true;
      // A request addressed to named people is only for those people
      if (row.target_user_ids && row.target_user_ids.length > 0) return row.target_user_ids.includes(profile.id);
      if (wholePastorateRoles.includes(profile.role) || row.target_all_churches) return true;
      if (row.target_church_ids && row.target_church_ids.length > 0) return Boolean(profile.church_id) && row.target_church_ids.includes(profile.church_id as string);
      return row.church_id === profile.church_id;
    });
    setRequests(rows);

    if (rows.length > 0) {
      const ids = rows.map((row) => row.id);
      const [{ data: commentData }, { data: attachmentData }] = await Promise.all([
        supabase.from('request_comments').select(commentFields).in('request_id', ids).order('created_at', { ascending: true }),
        supabase.from('request_attachments').select(attachmentFields).in('request_id', ids).order('created_at', { ascending: true }),
      ]);
      const groupedComments: Record<string, RequestComment[]> = {};
      ((commentData as RequestComment[]) || []).forEach((comment) => {
        (groupedComments[comment.request_id] = groupedComments[comment.request_id] || []).push(comment);
      });
      setComments(groupedComments);

      const groupedRequestFiles: Record<string, Attachment[]> = {};
      const groupedCommentFiles: Record<string, Attachment[]> = {};
      ((attachmentData as Attachment[]) || []).forEach((file) => {
        if (file.comment_id) (groupedCommentFiles[file.comment_id] = groupedCommentFiles[file.comment_id] || []).push(file);
        else (groupedRequestFiles[file.request_id] = groupedRequestFiles[file.request_id] || []).push(file);
      });
      setRequestFiles(groupedRequestFiles);
      setCommentFiles(groupedCommentFiles);
    } else {
      setComments({});
      setRequestFiles({});
      setCommentFiles({});
    }

    if (isInbox) {
      const { data: churchData } = await supabase.from('churches').select('id, name');
      setChurchNames(Object.fromEntries(((churchData as { id: string; name: string }[]) || []).map((church) => [church.id, church.name])));
    }
    // The user is now looking at the latest requests, replies and decisions
    markFeatureSeen(profile.id, 'requests', startedAt);
    setLoading(false);
  }, [profile?.id, profile?.role, profile?.church_id, isInbox]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!canTarget) return;
    supabase.from('churches').select('id, name').order('name').then(({ data }) => setChurchList((data as { id: string; name: string }[]) || []));
  }, [canTarget]);

  // The youth leaders a Super Admin can pick from (everyone who can receive requests, except super admins)
  useEffect(() => {
    if (!canPickPeople) return;
    supabase
      .from('profiles')
      .select('id, full_name, role, church_id')
      .in('role', recipientRoles.filter((role) => role !== 'super_admin'))
      .order('full_name')
      .then(({ data }) => setPeopleList(((data as Person[]) || []).filter((person) => person.id !== profile?.id)));
  }, [canPickPeople, profile?.id]);

  // Uploads files to storage and records them. Returns how many failed.
  const uploadFiles = async (requestId: string, files: File[], commentId: string | null): Promise<number> => {
    if (!profile?.id) return files.length;
    let failed = 0;
    for (const file of files) {
      const path = `${requestId}/${crypto.randomUUID()}-${safeName(file.name)}`;
      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined });
      if (uploadError) { failed += 1; continue; }
      const { error: rowError } = await supabase.from('request_attachments').insert({
        request_id: requestId,
        comment_id: commentId,
        uploaded_by: profile.id,
        file_name: file.name,
        file_path: path,
        file_type: file.type || null,
        file_size: file.size,
      });
      if (rowError) {
        failed += 1;
        await supabase.storage.from(BUCKET).remove([path]);
      }
    }
    return failed;
  };

  const openFile = async (attachment: Attachment) => {
    const { data, error: urlError } = await supabase.storage.from(BUCKET).createSignedUrl(attachment.file_path, 120);
    if (urlError || !data?.signedUrl) { setError('Could not open this file.'); return; }
    window.open(data.signedUrl, '_blank', 'noopener');
  };

  const sendRequest = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!profile?.id || !subject.trim() || !message.trim() || sending) return;
    setError(null);

    const usingPeople = canPickPeople && scope === 'people';
    const usingChurches = canTarget && !usingPeople;
    if (!hasOwnChurch && !usingPeople && usingChurches && scope === 'mine') { setError('Choose specific churches or all churches.'); return; }
    if (usingChurches && scope === 'selected' && selectedChurches.length === 0) { setError('Choose at least one church, or pick all churches.'); return; }
    if (usingPeople && selectedPeople.length === 0) { setError('Choose at least one person.'); return; }
    // People who are not the Super Admin always need a church of their own
    if (!hasOwnChurch && profile.role !== 'super_admin') { setError('Your account is not linked to a church yet.'); return; }

    // For named people the role column still needs a value: use the first chosen person's role
    const recipientRole = usingPeople
      ? (peopleList.find((person) => person.id === selectedPeople[0])?.role ?? recipient)
      : recipient;

    setSending(true);
    const { data: created, error: insertError } = await supabase.from('information_requests').insert({
      church_id: profile.church_id ?? null,
      requested_by: profile.id,
      requester_role: profile.role,
      requester_name: profile.full_name,
      recipient_role: recipientRole,
      target_all_churches: usingChurches && scope === 'all',
      target_church_ids: usingChurches && scope === 'selected' ? selectedChurches : null,
      target_user_ids: usingPeople ? selectedPeople : null,
      subject: subject.trim(),
      message: message.trim(),
    }).select('id').single();
    if (insertError || !created) {
      setError(`Could not send your request. ${insertError?.message ?? 'Please try again.'}`);
      setSending(false);
      return;
    }
    let failed = 0;
    if (newFiles.length > 0) failed = await uploadFiles(created.id, newFiles, null);
    setSubject('');
    setMessage('');
    setNewFiles([]);
    setScope(hasOwnChurch ? 'mine' : 'all');
    setSelectedChurches([]);
    setSelectedPeople([]);
    setPeopleSearch('');
    if (mode === 'both') { setComposeOpen(false); setBox('sent'); }
    if (failed > 0) setError(`Your request was sent, but ${failed} file${failed > 1 ? 's' : ''} could not be uploaded.`);
    else flash('Your request has been sent.');
    await load();
    setSending(false);
  };

  const decide = async (id: string, status: RequestStatus) => {
    if (!profile?.id) return;
    const { error: updateError } = await supabase.from('information_requests').update({
      status,
      decided_by: profile.id,
      decided_by_name: profile.full_name,
      decided_at: new Date().toISOString(),
    }).eq('id', id);
    if (updateError) { setError('Could not update this request.'); return; }
    flash(status === 'approved' ? 'Request approved.' : 'Request rejected.');
    await load();
  };

  const addComment = async (requestId: string, body: string, files: File[]) => {
    if (!profile?.id) return;
    const { data: created, error: insertError } = await supabase.from('request_comments').insert({
      request_id: requestId,
      author_id: profile.id,
      author_name: profile.full_name,
      author_role: profile.role,
      body,
    }).select('id').single();
    if (insertError || !created) { setError('Could not post your comment.'); return; }
    if (files.length > 0) {
      const failed = await uploadFiles(requestId, files, created.id);
      if (failed > 0) setError(`Your comment was posted, but ${failed} file${failed > 1 ? 's' : ''} could not be uploaded.`);
    }
    await load();
  };

  const counts = {
    all: requests.length,
    pending: requests.filter((r) => r.status === 'pending').length,
    approved: requests.filter((r) => r.status === 'approved').length,
    rejected: requests.filter((r) => r.status === 'rejected').length,
  };
  const visible = requests.filter((r) => filter === 'all' || r.status === filter);

  const scopeOptions: [Scope, string][] = [
    ...(hasOwnChurch ? ([['mine', 'My church']] as [Scope, string][]) : []),
    ['selected', 'Specific churches'],
    ['all', 'All churches'],
    ...(canPickPeople ? ([['people', 'Specific youth leaders']] as [Scope, string][]) : []),
  ];
  const usingPeopleScope = canPickPeople && scope === 'people';
  const visiblePeople = peopleList.filter((person) => {
    const term = peopleSearch.trim().toLowerCase();
    if (!term) return true;
    const churchName = (churchList.find((church) => church.id === person.church_id)?.name || '').toLowerCase();
    return (person.full_name || '').toLowerCase().includes(term) || (ROLE_LABELS[person.role] || person.role).toLowerCase().includes(term) || churchName.includes(term);
  });

  return (
    <section className="space-y-6">
      {error && <Alert type="error" message={error} />}
      {success && <Alert type="success" message={success} />}

      {mode === 'both' && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1 rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
            {([['received', 'Received'], ['sent', 'Sent']] as const).map(([key, label]) => (
              <button key={key} onClick={() => setBox(key)} className={`rounded-lg px-4 py-2 text-sm font-semibold transition-all ${box === key ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'}`}>{label}</button>
            ))}
          </div>
          <button onClick={() => setComposeOpen((open) => !open)} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800">
            <Send size={15} /> {composeOpen ? 'Close' : 'New request'}
          </button>
        </div>
      )}

      {showForm && (
        <form onSubmit={sendRequest} className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="p-5 border-b border-gray-100">
            <h2 className="font-bold text-gray-900 flex items-center gap-2"><Send size={18} className="text-orange-600" /> Send a request</h2>
            <p className="text-sm text-gray-500 mt-1">Ask for any information you need. You can follow its status and comments below.</p>
          </div>
          <div className="p-5 space-y-4">
            {canTarget && (
              <div>
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-gray-500">Who should receive it?</span>
                <div className="flex flex-wrap gap-4 text-sm font-semibold text-gray-700">
                  {scopeOptions.map(([value, label]) => (
                    <label key={value} className="flex items-center gap-2"><input type="radio" name="request-scope" checked={scope === value} onChange={() => setScope(value)} className="accent-orange-500" /> {label}</label>
                  ))}
                </div>
              </div>
            )}

            {!usingPeopleScope && (
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-gray-500">Send to</span>
                <select value={recipient} onChange={(e) => setRecipient(e.target.value as UserRole)} className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm">
                  {recipientRoles.filter((role) => role !== profile?.role).map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
                </select>
              </label>
            )}

            {canTarget && scope === 'selected' && (
              <div>
                <div className="grid max-h-48 gap-2 overflow-y-auto rounded-lg border border-gray-200 p-2 sm:grid-cols-2">
                  {churchList.map((church) => (
                    <label key={church.id} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-gray-50">
                      <input type="checkbox" checked={selectedChurches.includes(church.id)} onChange={() => setSelectedChurches((current) => (current.includes(church.id) ? current.filter((id) => id !== church.id) : [...current, church.id]))} className="h-4 w-4 accent-orange-500" /> {church.name}
                    </label>
                  ))}
                </div>
                <p className="mt-1 text-xs text-gray-400">The role chosen above, in those churches, receives the request.</p>
              </div>
            )}

            {canTarget && scope === 'all' && (
              <p className="text-xs text-gray-400">The role chosen above, in every church, receives the request.</p>
            )}

            {usingPeopleScope && (
              <div>
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-gray-500">Choose youth leaders ({selectedPeople.length} selected)</span>
                <input value={peopleSearch} onChange={(e) => setPeopleSearch(e.target.value)} placeholder="Search by name, role or church" className="mb-2 w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm" />
                <div className="max-h-60 overflow-y-auto rounded-lg border border-gray-200 p-2">
                  {visiblePeople.length === 0 ? (
                    <p className="p-3 text-center text-sm text-gray-400">No leaders found.</p>
                  ) : visiblePeople.map((person) => (
                    <label key={person.id} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-gray-50">
                      <input type="checkbox" checked={selectedPeople.includes(person.id)} onChange={() => setSelectedPeople((current) => (current.includes(person.id) ? current.filter((id) => id !== person.id) : [...current, person.id]))} className="h-4 w-4 accent-orange-500" />
                      <span className="min-w-0 flex-1 truncate font-semibold text-gray-900">{person.full_name || 'Unnamed'}</span>
                      <span className="shrink-0 text-xs text-gray-400">{ROLE_LABELS[person.role] || person.role}{person.church_id ? ` · ${churchList.find((church) => church.id === person.church_id)?.name || ''}` : ''}</span>
                    </label>
                  ))}
                </div>
                <p className="mt-1 text-xs text-gray-400">Only the people you tick will receive this request.</p>
              </div>
            )}

            <label className="block">
              <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-gray-500">Subject</span>
              <input required value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={120} placeholder="What do you need to know?" className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-gray-500">Details</span>
              <textarea required value={message} onChange={(e) => setMessage(e.target.value)} rows={4} maxLength={2000} placeholder="Describe the information you are requesting" className="w-full rounded-xl border border-gray-300 p-3 text-sm" />
            </label>
            <div>
              <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-gray-500">Attachments (optional)</span>
              <FilePicker files={newFiles} onChange={setNewFiles} onProblem={setError} />
              <p className="mt-1.5 text-xs text-gray-400">Up to {MAX_FILES} files, 10 MB each. PDF, Word, Excel, PowerPoint, text, CSV and images.</p>
            </div>
            <button disabled={sending} className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-50">
              <Send size={15} /> {sending ? 'Sending...' : 'Send request'}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-gray-900">{isInbox ? 'Requests received' : 'My requests'}</h2>
            <p className="text-sm text-gray-500 mt-1">{isInbox ? 'Review, approve or reject, and comment on requests sent to you.' : 'Requests you have sent, their status and comments.'}</p>
          </div>
          <button onClick={load} disabled={loading} className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        <div className="px-5 pt-4 flex flex-wrap gap-2">
          {([
            { key: 'all', label: `All (${counts.all})` },
            { key: 'pending', label: `Pending (${counts.pending})` },
            { key: 'approved', label: `Approved (${counts.approved})` },
            { key: 'rejected', label: `Rejected (${counts.rejected})` },
          ] as const).map((f) => (
            <button key={f.key} onClick={() => setFilter(f.key)} className={`px-3 py-1.5 rounded-full text-xs font-bold ${filter === f.key ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{f.label}</button>
          ))}
        </div>

        {visible.length === 0 ? (
          <p className="p-6 text-sm text-gray-400 text-center">{requests.length === 0 ? (isInbox ? 'No requests received yet.' : 'You have not sent any requests yet.') : 'No requests in this filter.'}</p>
        ) : (
          <div className="mt-2 divide-y divide-gray-100">
            {visible.map((item) => (
              <RequestCard
                key={item.id}
                item={item}
                comments={comments[item.id] || []}
                requestFiles={requestFiles[item.id] || []}
                commentFiles={commentFiles}
                canDecide={isInbox}
                showRequester={isInbox}
                churchName={item.church_id ? churchNames[item.church_id] : undefined}
                onDecide={(status) => decide(item.id, status)}
                onComment={(body, files) => addComment(item.id, body, files)}
                onOpenFile={openFile}
                onProblem={setError}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}