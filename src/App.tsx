import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { LoginPage } from '@/pages/LoginPage';
import { SignupPage } from '@/pages/SignupPage';
import { RoleLoginPage } from '@/pages/RoleLoginPage';
import { RoleSignupPage } from '@/pages/RoleSignupPage';
import { LeaderPortalsPage } from '@/pages/LeaderPortalsPage';
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage';
import { ResetPasswordPage } from '@/pages/ResetPasswordPage';
import { ProfilePage } from '@/pages/ProfilePage';
import { SuperAdminDashboard } from '@/pages/SuperAdminDashboard';
import { ChurchAdminDashboard } from '@/pages/ChurchAdminDashboard';
import { PcMemberDashboard } from '@/pages/PcMemberDashboard';
import { YouthMemberDashboard } from '@/pages/YouthMemberDashboard';
import { LocalYouthSecretaryDashboard } from '@/pages/LocalYouthSecretaryDashboard';
import { LeaderDashboard } from '@/pages/LeaderDashboard';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { SessionGuard } from '@/components/SessionGuard';
import type { UserRole } from '@/types';

function RootRedirect() {
  const { session, profile, loading } = useAuth();
  // Right after signing in, the session exists a moment before the profile has been loaded.
  // Wait for it (up to 8 seconds) instead of sending the person back to the login page.
  const [gaveUp, setGaveUp] = useState(false);
  useEffect(() => {
    if (!session || profile || loading) { setGaveUp(false); return; }
    const timer = window.setTimeout(() => setGaveUp(true), 8000);
    return () => window.clearTimeout(timer);
  }, [session, profile, loading]);

  if (loading || (session && !profile && !gaveUp)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="h-10 w-10 border-4 border-orange-200 border-t-orange-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!session) return <Navigate to="/login" replace />;
  if (!profile) return <Navigate to="/login" replace />;

  return <Navigate to={`/${profile.role}`} replace />;
}

const ROLE_ROUTES: { role: UserRole; path: string }[] = [
  { role: 'super_admin', path: '/super_admin' },
  { role: 'church_admin', path: '/church_admin' },
  { role: 'pc_member', path: '/pc_member' },
  { role: 'youth_member', path: '/youth_member' },
  { role: 'pastorate_youth_secretary', path: '/pastorate_youth_secretary' },
  { role: 'pastorate_youth_treasurer', path: '/pastorate_youth_treasurer' },
  { role: 'pastorate_convenor', path: '/pastorate_convenor' },
  { role: 'local_youth_secretary', path: '/local_youth_secretary' },
  { role: 'local_youth_treasurer', path: '/local_youth_treasurer' },
];

const PASTORATE_ROLES: UserRole[] = ['pastorate_youth_secretary', 'pastorate_youth_treasurer', 'pastorate_convenor'];
const LOCAL_ROLES: UserRole[] = ['local_youth_secretary', 'local_youth_treasurer'];

// Every role except youth members (they have their own profile page inside their dashboard)
const PROFILE_PAGE_ROLES: UserRole[] = ROLE_ROUTES.map((route) => route.role).filter((role) => role !== 'youth_member');

function DashboardRouter({ role }: { role: UserRole }) {
  if (role === 'super_admin') return <SuperAdminDashboard />;
  if (role === 'church_admin') return <ChurchAdminDashboard />;
  if (role === 'pc_member') return <PcMemberDashboard />;
  if (role === 'youth_member') return <YouthMemberDashboard />;
  if (role === 'local_youth_secretary') return <LocalYouthSecretaryDashboard />;
  if (role === 'pastorate_youth_secretary') return <LocalYouthSecretaryDashboard scope="pastorate" />;
  if (PASTORATE_ROLES.includes(role)) return <LeaderDashboard scope="pastorate" />;
  if (LOCAL_ROLES.includes(role)) return <LeaderDashboard scope="local" />;
  return <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <SessionGuard />
      <BrowserRouter>
        <Routes>
          {/* Default login/signup */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />

          {/* Password reset (open to everyone) */}
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          {/* Leader portals selection page */}
          <Route path="/portals" element={<LeaderPortalsPage />} />

          {/* Role-specific login/signup routes */}
          {ROLE_ROUTES.map(({ role }) => (
            <Route
              key={`login-${role}`}
              path={`/login/${role}`}
              element={<RoleLoginPage role={role} signupPath={`/signup/${role}`} />}
            />
          ))}
          {ROLE_ROUTES.map(({ role }) => (
            <Route
              key={`signup-${role}`}
              path={`/signup/${role}`}
              element={<RoleSignupPage role={role} loginPath={`/login/${role}`} />}
            />
          ))}

          {/* Root redirect */}
          <Route path="/" element={<RootRedirect />} />

          {/* Profile page for admins, leaders and members of the leadership team */}
          <Route
            path="/profile"
            element={
              <ProtectedRoute allowedRoles={PROFILE_PAGE_ROLES}>
                <ProfilePage />
              </ProtectedRoute>
            }
          />

          {/* Dashboard routes */}
          {ROLE_ROUTES.map(({ role, path }) => (
            <Route
              key={`dash-${role}`}
              path={path}
              element={
                <ProtectedRoute allowedRoles={[role]}>
                  <DashboardRouter role={role} />
                </ProtectedRoute>
              }
            />
          ))}

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}