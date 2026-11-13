import { supabase } from '@/lib/supabase';

const BUCKET = 'circular-attachments';

export type CircularAttachment = { id: string; circular_id: string; file_name: string; file_path: string; file_type: string | null; file_size: number | null };

const safeName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, '_');

// Upload files for a circular that has just been created. Returns how many files failed.
export async function uploadCircularFiles(circularId: string, files: File[], userId: string): Promise<number> {
  let failed = 0;
  for (const file of files) {
    const path = `${circularId}/${crypto.randomUUID()}-${safeName(file.name)}`;
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined });
    if (uploadError) { failed += 1; continue; }
    const { error: rowError } = await supabase.from('circular_attachments').insert({
      circular_id: circularId, uploaded_by: userId, file_name: file.name, file_path: path, file_type: file.type || null, file_size: file.size,
    });
    if (rowError) { failed += 1; await supabase.storage.from(BUCKET).remove([path]); }
  }
  return failed;
}

export async function listCircularFiles(circularIds: string[]): Promise<Record<string, CircularAttachment[]>> {
  if (circularIds.length === 0) return {};
  const { data } = await supabase.from('circular_attachments').select('id, circular_id, file_name, file_path, file_type, file_size').in('circular_id', circularIds).order('created_at', { ascending: true });
  const grouped: Record<string, CircularAttachment[]> = {};
  ((data as CircularAttachment[]) || []).forEach((file) => { (grouped[file.circular_id] = grouped[file.circular_id] || []).push(file); });
  return grouped;
}

export async function openCircularFile(path: string) {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 120);
  if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener');
}