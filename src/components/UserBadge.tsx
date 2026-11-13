import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useAvatar } from '@/hooks/useAvatar';
import { ROLE_LABELS } from '@/types';

// Top-right user badge: name with the role below it, and the profile photo. Click it to open "My profile".
export function UserBadge() {
  const { profile } = useAuth();
  const { url } = useAvatar();
  const navigate = useNavigate();
  const name = profile?.full_name || 'User';

  return (
    <button type="button" onClick={() => navigate('/profile')} title="Open my profile" className="flex items-center gap-3 rounded-xl px-2 py-1 text-left hover:bg-gray-50">
      <div className="min-w-0 text-right">
        <p className="truncate max-w-[7.5rem] sm:max-w-[14rem] text-sm font-semibold text-gray-900">{name}</p>
        <p className="truncate max-w-[7.5rem] sm:max-w-[14rem] text-xs font-medium text-orange-600">{profile ? ROLE_LABELS[profile.role] : ''}</p>
      </div>
      <span className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-orange-100 text-orange-700 font-bold flex items-center justify-center">
        {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : name.charAt(0).toUpperCase()}
      </span>
    </button>
  );
}