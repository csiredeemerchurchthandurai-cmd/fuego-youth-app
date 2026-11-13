import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

const BUCKET = 'profile-photos';

async function signedUrl(path: string) {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  return data?.signedUrl || '';
}

/**
 * Profile photo of the signed-in user.
 * Youth members keep their photo path in youth_member_profiles (as before).
 * Every other role keeps it in their account (auth user metadata), so it needs no extra database column or policy.
 */
export function useAvatar() {
  const { profile, session } = useAuth();
  const [url, setUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const isYouth = profile?.role === 'youth_member';
  const metadataPath = (session?.user?.user_metadata?.avatar_path as string | undefined) || '';

  const load = useCallback(async () => {
    if (!profile?.id) return;
    let path: string | null | undefined;
    if (isYouth) {
      const { data } = await supabase.from('youth_member_profiles').select('avatar_url').eq('id', profile.id).maybeSingle();
      path = (data as { avatar_url?: string | null } | null)?.avatar_url;
    } else {
      path = metadataPath;
      if (!path) {
        // Photos saved by an earlier version of the app
        const { data } = await supabase.from('profiles').select('avatar_url').eq('id', profile.id).maybeSingle();
        path = (data as { avatar_url?: string | null } | null)?.avatar_url;
      }
    }
    setUrl(path ? await signedUrl(path) : '');
  }, [profile?.id, isYouth, metadataPath]);

  useEffect(() => { load(); }, [load]);

  // Returns an error message, or null when the photo was saved
  const upload = async (file: File): Promise<string | null> => {
    if (!profile?.id) return 'You are not signed in.';
    if (!file.type.startsWith('image/') || file.size > 4 * 1024 * 1024) return 'Choose an image smaller than 4 MB.';
    setUploading(true);
    const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `${profile.id}/avatar.${extension}`;

    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true, contentType: file.type });
    if (uploadError) { setUploading(false); return `Could not upload that photo: ${uploadError.message}`; }

    if (isYouth) {
      const { error: updateError } = await supabase.from('youth_member_profiles').update({ avatar_url: path }).eq('id', profile.id);
      if (updateError) { setUploading(false); return `Photo uploaded, but it could not be saved to your profile: ${updateError.message}`; }
    } else {
      const { error: metadataError } = await supabase.auth.updateUser({ data: { avatar_path: path } });
      if (metadataError) { setUploading(false); return `Photo uploaded, but it could not be saved to your account: ${metadataError.message}`; }
    }

    setUrl(await signedUrl(path));
    setUploading(false);
    return null;
  };

  return { url, uploading, upload };
}