import { Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import type { UserRole } from '@/types';
import type { ReactNode } from 'react';

export function ProtectedRoute({ children, allowedRoles }: { children: ReactNode; allowedRoles: UserRole[] }) {
  const { session, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="h-10 w-10 border-4 border-orange-200 border-t-orange-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!session) return <Navigate to="/login" replace />;
  if (!profile) return <Navigate to="/login" replace />;

  if (!allowedRoles.includes(profile.role)) {
    return <Navigate to={`/${profile.role}`} replace />;
  }

  return <>{children}</>;
}
