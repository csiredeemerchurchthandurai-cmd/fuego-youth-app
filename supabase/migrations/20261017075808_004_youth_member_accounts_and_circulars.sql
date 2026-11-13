/*
# Add Youth Member Accounts + Circulars System

## Overview
1. Adds a `youth_member_profiles` table so youth members can have their own login accounts
   and mark their own attendance via OTP.
2. Adds a `circulars` table for announcements that any role (super_admin, church_admin,
   pc_member, secretary, treasurer) can issue.
3. Adds a `circular_reads` table to track which youth members have read a circular.

## New Tables

### youth_member_profiles
- `id` (uuid, PK, references auth.users) — the login account
- `church_id` (uuid, FK to churches) — which church this member belongs to
- `full_name` (text)
- `phone` (text)
- `youth_member_id` (uuid, FK to youth_members, nullable) — links to the attendance roster entry

### circulars
- `id` (uuid, PK)
- `church_id` (uuid, FK to churches, nullable) — null means global (all churches)
- `title` (text)
- `body` (text)
- `created_by` (uuid, FK to auth.users)
- `created_by_role` (text) — the role of the person who issued it
- `created_at` (timestamptz)

### circular_reads
- `id` (uuid, PK)
- `circular_id` (uuid, FK to circulars, CASCADE)
- `read_by` (uuid, FK to auth.users)
- `read_at` (timestamptz)
- UNIQUE(circular_id, read_by)

## Security
- RLS on all new tables.
- youth_member_profiles: readable by the member themselves, super_admin, and church_admin
  of the same church. Insert via trigger on auth.users (same pattern as profiles).
- circulars: readable by all authenticated users. Insert/update/delete by all authenticated
  users (any role can issue circulars). Super admin can delete any.
- circular_reads: a user can read their own read records and insert their own.

## Notes
1. The handle_new_user trigger is updated to also create a youth_member_profiles row
   when the role in user_metadata is 'youth_member'.
2. Youth members use the same login/signup page but select 'Youth Member' as their role.
*/

-- ===== youth_member_profiles =====

CREATE TABLE IF NOT EXISTS public.youth_member_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  church_id uuid REFERENCES public.churches(id) ON DELETE SET NULL,
  full_name text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  youth_member_id uuid REFERENCES public.youth_members(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.youth_member_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_own_youth_profile" ON public.youth_member_profiles;
CREATE POLICY "read_own_youth_profile" ON public.youth_member_profiles FOR SELECT
  TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "super_admin_read_youth_profiles" ON public.youth_member_profiles;
CREATE POLICY "super_admin_read_youth_profiles" ON public.youth_member_profiles FOR SELECT
  TO authenticated USING (public.get_user_role() = 'super_admin');

DROP POLICY IF EXISTS "church_admin_read_youth_profiles" ON public.youth_member_profiles;
CREATE POLICY "church_admin_read_youth_profiles" ON public.youth_member_profiles FOR SELECT
  TO authenticated USING (
    public.get_user_role() = 'church_admin'
    AND church_id = public.get_user_church_id()
  );

DROP POLICY IF EXISTS "update_own_youth_profile" ON public.youth_member_profiles;
CREATE POLICY "update_own_youth_profile" ON public.youth_member_profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- ===== circulars =====

CREATE TABLE IF NOT EXISTS public.circulars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid REFERENCES public.churches(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_by_role text NOT NULL DEFAULT 'pc_member',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_circulars_church ON public.circulars(church_id);
CREATE INDEX IF NOT EXISTS idx_circulars_created ON public.circulars(created_at DESC);

ALTER TABLE public.circulars ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read circulars (they see global + their church's)
DROP POLICY IF EXISTS "read_circulars" ON public.circulars;
CREATE POLICY "read_circulars" ON public.circulars FOR SELECT
  TO authenticated USING (
    church_id IS NULL
    OR church_id = public.get_user_church_id()
    OR public.get_user_role() = 'super_admin'
  );

-- Any authenticated user (any role) can create circulars
DROP POLICY IF EXISTS "insert_circulars" ON public.circulars;
CREATE POLICY "insert_circulars" ON public.circulars FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = created_by);

-- Creator or super admin can update
DROP POLICY IF EXISTS "update_circulars" ON public.circulars;
CREATE POLICY "update_circulars" ON public.circulars FOR UPDATE
  TO authenticated USING (auth.uid() = created_by OR public.get_user_role() = 'super_admin')
  WITH CHECK (auth.uid() = created_by OR public.get_user_role() = 'super_admin');

-- Creator or super admin can delete
DROP POLICY IF EXISTS "delete_circulars" ON public.circulars;
CREATE POLICY "delete_circulars" ON public.circulars FOR DELETE
  TO authenticated USING (auth.uid() = created_by OR public.get_user_role() = 'super_admin');

-- ===== circular_reads =====

CREATE TABLE IF NOT EXISTS public.circular_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  circular_id uuid NOT NULL REFERENCES public.circulars(id) ON DELETE CASCADE,
  read_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(circular_id, read_by)
);

ALTER TABLE public.circular_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_own_circular_reads" ON public.circular_reads;
CREATE POLICY "read_own_circular_reads" ON public.circular_reads FOR SELECT
  TO authenticated USING (auth.uid() = read_by);

DROP POLICY IF EXISTS "insert_own_circular_reads" ON public.circular_reads;
CREATE POLICY "insert_own_circular_reads" ON public.circular_reads FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = read_by);

-- ===== Update handle_new_user trigger for youth_member role =====

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_church_id uuid;
BEGIN
  v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'pc_member');
  v_church_id := NULLIF(NEW.raw_user_meta_data->>'church_id', '')::uuid;

  INSERT INTO public.profiles (id, full_name, role, church_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    v_role,
    v_church_id
  )
  ON CONFLICT (id) DO NOTHING;

  IF v_role = 'youth_member' THEN
    INSERT INTO public.youth_member_profiles (id, church_id, full_name, phone)
    VALUES (
      NEW.id,
      v_church_id,
      COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
      COALESCE(NEW.raw_user_meta_data->>'phone', '')
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;
