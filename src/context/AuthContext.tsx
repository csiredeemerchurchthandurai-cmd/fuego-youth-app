import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Profile, UserRole } from '@/types';

interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signUp: (email: string, password: string, fullName: string, role: UserRole, churchId: string | null, phone?: string, dateOfBirth?: string) => Promise<{ error: string | null }>;
  signIn: (email: string, password: string, expectedRole?: UserRole, churchId?: string | null) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchProfile(uid: string, retries = 5, metadata: Record<string, unknown> = {}): Promise<Profile | null> {
    for (let i = 0; i < retries; i++) {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, role, church_id, created_at')
        .eq('id', uid)
        .maybeSingle();

      if (error) {
        console.error('Profile fetch error:', error.message);
        return null;
      }

      if (data) {
        setProfile(data as Profile);
        return data as Profile;
      }

      // Profile not created yet (trigger may still be running) — wait and retry
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    const allowedRoles: UserRole[] = ['super_admin', 'church_admin', 'pc_member', 'youth_member', 'pastorate_youth_secretary', 'pastorate_youth_treasurer', 'pastorate_convenor', 'local_youth_secretary', 'local_youth_treasurer'];
    const metadataRole = typeof metadata.role === 'string' && allowedRoles.includes(metadata.role as UserRole) ? metadata.role : 'pc_member';
    const metadataChurchId = typeof metadata.church_id === 'string' && metadata.church_id.length > 0 ? metadata.church_id : null;
    const { data: createdProfile, error: createError } = await supabase.from('profiles').insert({
      id: uid,
      full_name: typeof metadata.full_name === 'string' ? metadata.full_name : '',
      role: metadataRole,
      church_id: metadataChurchId,
    }).select('id, full_name, role, church_id, created_at').maybeSingle();
    if (!createError && createdProfile) {
      setProfile(createdProfile as Profile);
      return createdProfile as Profile;
    }
    console.error('Profile not found after retries', createError?.message);
    setProfile(null);
    return null;
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) {
        fetchProfile(data.session.user.id, 5, data.session.user.user_metadata).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession) {
        (async () => {
          await fetchProfile(newSession.user.id, 5, newSession.user.user_metadata);
          setLoading(false);
        })();
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const signUp: AuthContextValue['signUp'] = async (email, password, fullName, role, churchId, phone, dateOfBirth) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          role,
          church_id: churchId || '',
          phone: phone || '',
          date_of_birth: dateOfBirth || '',
        },
      },
    });
    if (error) return { error: error.message };
    if (!data.user) return { error: 'Sign-up failed. Please try again.' };

    // The database trigger creates the profile automatically.
    // Fetch it with retries in case the trigger hasn't committed yet.
    await fetchProfile(data.user.id);
    return { error: null };
  };

  const signIn: AuthContextValue['signIn'] = async (email, password, expectedRole, churchId) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };

    if (expectedRole && data.user) {
      const signedProfile = await fetchProfile(data.user.id, 5, data.user.user_metadata);
      const roleMatches = signedProfile?.role === expectedRole;
      const churchMatches = expectedRole === 'super_admin' || signedProfile?.church_id === churchId;
      if (!signedProfile || !roleMatches || !churchMatches) {
        await supabase.auth.signOut();
        setProfile(null);
        setSession(null);
        return { error: 'These credentials do not belong to the selected portal or church.' };
      }
    }

    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setSession(null);
  };

  const refreshProfile = async () => {
    if (session) await fetchProfile(session.user.id);
  };

  return (
    <AuthContext.Provider value={{ session, profile, loading, signUp, signIn, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
