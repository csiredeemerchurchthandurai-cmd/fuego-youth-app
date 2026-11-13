/*
# Fuego Youth Fellowship — Initial Schema

## Overview
Multi-role church youth fellowship management app with OTP-based attendance chain.

## Roles
- super_admin: oversees all churches, manages church admins
- church_admin: manages one church, generates enabling OTP for secretary
- pc_member: read-only access to attendance and members of their church
- secretary: enters enabling OTP, generates attendance OTP, takes attendance
- treasurer: takes attendance using attendance OTP

## OTP Chain
1. Church Admin generates a "secretary_enable" OTP (6-digit) and shares it with the secretary
2. Secretary enters that OTP to unlock attendance session creation
3. Secretary generates an "attendance" OTP (6-digit) for the session
4. Secretary or Treasurer enters the attendance OTP and marks youth members present

## Tables
1. profiles — extends auth.users with full_name, role, church_id
2. churches — church information
3. youth_members — youth fellowship members per church
4. otp_sessions — OTP codes for secretary-enable and attendance sessions
5. attendance — per-member attendance records linked to an OTP session

## Security
- RLS enabled on all tables
- Helper SECURITY DEFINER functions: get_user_role(), get_user_church_id()
- Policies scope data by church membership and role
*/

-- ===== Tables (created first, no policies yet) =====

CREATE TABLE IF NOT EXISTS public.churches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  location text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'pc_member',
  church_id uuid REFERENCES public.churches(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.youth_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES public.churches(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  phone text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.otp_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES public.churches(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'attendance',
  otp_code text NOT NULL,
  generated_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_used boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '2 hours'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  otp_session_id uuid NOT NULL REFERENCES public.otp_sessions(id) ON DELETE CASCADE,
  youth_member_id uuid NOT NULL REFERENCES public.youth_members(id) ON DELETE CASCADE,
  church_id uuid NOT NULL REFERENCES public.churches(id) ON DELETE CASCADE,
  marked_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  attendance_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(otp_session_id, youth_member_id)
);

-- ===== Helper Functions (SECURITY DEFINER for RLS checks) =====

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_user_church_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT church_id FROM public.profiles WHERE id = auth.uid();
$$;

-- ===== Enable RLS + Policies =====

-- Churches
ALTER TABLE public.churches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_churches" ON public.churches;
CREATE POLICY "read_churches" ON public.churches FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "super_admin_manage_churches" ON public.churches;
CREATE POLICY "super_admin_manage_churches" ON public.churches FOR INSERT
  TO authenticated WITH CHECK (public.get_user_role() = 'super_admin');

DROP POLICY IF EXISTS "super_admin_update_churches" ON public.churches;
CREATE POLICY "super_admin_update_churches" ON public.churches FOR UPDATE
  TO authenticated USING (public.get_user_role() = 'super_admin')
  WITH CHECK (public.get_user_role() = 'super_admin');

DROP POLICY IF EXISTS "super_admin_delete_churches" ON public.churches;
CREATE POLICY "super_admin_delete_churches" ON public.churches FOR DELETE
  TO authenticated USING (public.get_user_role() = 'super_admin');

-- Profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_own_profile" ON public.profiles;
CREATE POLICY "read_own_profile" ON public.profiles FOR SELECT
  TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "super_admin_read_profiles" ON public.profiles;
CREATE POLICY "super_admin_read_profiles" ON public.profiles FOR SELECT
  TO authenticated USING (public.get_user_role() = 'super_admin');

DROP POLICY IF EXISTS "church_admin_read_profiles" ON public.profiles;
CREATE POLICY "church_admin_read_profiles" ON public.profiles FOR SELECT
  TO authenticated USING (
    public.get_user_role() = 'church_admin'
    AND church_id = public.get_user_church_id()
  );

DROP POLICY IF EXISTS "insert_own_profile" ON public.profiles;
CREATE POLICY "insert_own_profile" ON public.profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "update_own_profile" ON public.profiles;
CREATE POLICY "update_own_profile" ON public.profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "super_admin_update_profiles" ON public.profiles;
CREATE POLICY "super_admin_update_profiles" ON public.profiles FOR UPDATE
  TO authenticated USING (public.get_user_role() = 'super_admin')
  WITH CHECK (public.get_user_role() = 'super_admin');

-- Youth Members
ALTER TABLE public.youth_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_youth_members" ON public.youth_members;
CREATE POLICY "read_youth_members" ON public.youth_members FOR SELECT
  TO authenticated USING (
    church_id = public.get_user_church_id()
    OR public.get_user_role() = 'super_admin'
  );

DROP POLICY IF EXISTS "insert_youth_members" ON public.youth_members;
CREATE POLICY "insert_youth_members" ON public.youth_members FOR INSERT
  TO authenticated WITH CHECK (
    public.get_user_role() IN ('church_admin', 'secretary', 'treasurer')
    AND church_id = public.get_user_church_id()
  );

DROP POLICY IF EXISTS "update_youth_members" ON public.youth_members;
CREATE POLICY "update_youth_members" ON public.youth_members FOR UPDATE
  TO authenticated USING (
    public.get_user_role() IN ('church_admin', 'secretary')
    AND church_id = public.get_user_church_id()
  )
  WITH CHECK (
    public.get_user_role() IN ('church_admin', 'secretary')
    AND church_id = public.get_user_church_id()
  );

DROP POLICY IF EXISTS "delete_youth_members" ON public.youth_members;
CREATE POLICY "delete_youth_members" ON public.youth_members FOR DELETE
  TO authenticated USING (
    public.get_user_role() IN ('church_admin')
    AND church_id = public.get_user_church_id()
  );

-- OTP Sessions
ALTER TABLE public.otp_sessions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_otp_sessions_church ON public.otp_sessions(church_id);

DROP POLICY IF EXISTS "read_otp_sessions" ON public.otp_sessions;
CREATE POLICY "read_otp_sessions" ON public.otp_sessions FOR SELECT
  TO authenticated USING (
    church_id = public.get_user_church_id()
    OR public.get_user_role() = 'super_admin'
  );

DROP POLICY IF EXISTS "insert_otp_sessions" ON public.otp_sessions;
CREATE POLICY "insert_otp_sessions" ON public.otp_sessions FOR INSERT
  TO authenticated WITH CHECK (
    church_id = public.get_user_church_id()
    AND public.get_user_role() IN ('church_admin', 'secretary')
  );

DROP POLICY IF EXISTS "update_otp_sessions" ON public.otp_sessions;
CREATE POLICY "update_otp_sessions" ON public.otp_sessions FOR UPDATE
  TO authenticated USING (
    church_id = public.get_user_church_id()
    AND public.get_user_role() IN ('church_admin', 'secretary', 'treasurer')
  )
  WITH CHECK (
    church_id = public.get_user_church_id()
    AND public.get_user_role() IN ('church_admin', 'secretary', 'treasurer')
  );

-- Attendance
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_attendance_church ON public.attendance(church_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON public.attendance(attendance_date);

DROP POLICY IF EXISTS "read_attendance" ON public.attendance;
CREATE POLICY "read_attendance" ON public.attendance FOR SELECT
  TO authenticated USING (
    church_id = public.get_user_church_id()
    OR public.get_user_role() = 'super_admin'
  );

DROP POLICY IF EXISTS "insert_attendance" ON public.attendance;
CREATE POLICY "insert_attendance" ON public.attendance FOR INSERT
  TO authenticated WITH CHECK (
    church_id = public.get_user_church_id()
    AND public.get_user_role() IN ('secretary', 'treasurer')
  );

DROP POLICY IF EXISTS "delete_attendance" ON public.attendance;
CREATE POLICY "delete_attendance" ON public.attendance FOR DELETE
  TO authenticated USING (
    church_id = public.get_user_church_id()
    AND public.get_user_role() IN ('secretary', 'treasurer')
  );
