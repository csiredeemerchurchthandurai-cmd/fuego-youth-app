import { useRef } from 'react';
import { FileText, Paperclip, X } from 'lucide-react';

export const ATTACHMENT_ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.png,.jpg,.jpeg,.gif,.webp,.heic';
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS = 5;
const ALLOWED = ATTACHMENT_ACCEPT.split(',').map((ext) => ext.slice(1));

export function formatFileSize(bytes: number | null | undefined) {
  if (!bytes) return '';
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function check(current: File[], incoming: File[]): { files: File[]; message: string | null } {
  const accepted = [...current];
  let message: string | null = null;
  for (const file of incoming) {
    const extension = file.name.split('.').pop()?.toLowerCase() || '';
    if (accepted.length >= MAX_ATTACHMENTS) { message = `You can attach up to ${MAX_ATTACHMENTS} files.`; break; }
    if (!ALLOWED.includes(extension)) { message = `${file.name}: this file type is not allowed.`; continue; }
    if (file.size > MAX_ATTACHMENT_BYTES) { message = `${file.name} is larger than 10 MB.`; continue; }
    accepted.push(file);
  }
  return { files: accepted, message };
}

// "Attach files" button with the list of chosen files. Use it in any form that sends files.
export function AttachmentPicker({ files, onChange, onProblem }: { files: File[]; onChange: (files: File[]) => void; onProblem?: (message: string | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);

  const choose = (event: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = Array.from(event.target.files || []);
    event.target.value = '';
    if (chosen.length === 0) return;
    const result = check(files, chosen);
    onProblem?.(result.message);
    onChange(result.files);
  };

  return (
    <div>
      <input ref={inputRef} type="file" multiple accept={ATTACHMENT_ACCEPT} onChange={choose} className="hidden" />
      <button type="button" onClick={() => inputRef.current?.click()} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
        <Paperclip size={16} /> Attach files
      </button>
      <p className="mt-1.5 text-xs text-gray-400">Up to {MAX_ATTACHMENTS} files, 10 MB each. PDF, Word, Excel, PowerPoint, text, CSV and images.</p>
      {files.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {files.map((file, index) => (
            <li key={`${file.name}-${index}`} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600">
              <FileText size={14} className="shrink-0 text-slate-400" />
              <span className="min-w-0 flex-1 truncate">{file.name}</span>
              <span className="shrink-0 text-slate-400">{formatFileSize(file.size)}</span>
              <button type="button" onClick={() => onChange(files.filter((_, i) => i !== index))} className="shrink-0 text-slate-400 hover:text-red-600" aria-label={`Remove ${file.name}`}><X size={14} /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}