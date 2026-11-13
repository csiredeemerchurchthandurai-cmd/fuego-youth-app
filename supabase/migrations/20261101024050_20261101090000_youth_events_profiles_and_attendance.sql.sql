/*
# Add youth events, profiles, and event attendance

## Overview
1. Adds date of birth and profile photo fields for account holders and youth member profiles.
2. Adds a pastorate/local event catalogue with event details visible to youth members.
3. Links attendance OTP sessions and attendance records to a specific event.
4. Keeps member-editable profile fields narrow and protects account role, church, and other managed fields.

## New Tables
### youth_events
- `id` — event identifier.
- `title`, `description`, `venue` — event information.
- `event_date`, `start_time`, `end_time` — schedule.
- `scope` — `local` or `pastorate`.
- `church_id` — local church for local events; null for pastorate-wide events.
- `created_by` — authenticated leader who created the event.

## Modified Tables
### profiles
- Adds `date_of_birth` for all new account types.
### youth_member_profiles
- Adds `date_of_birth` and `avatar_url`.
### otp_sessions
- Adds nullable `event_id` to identify the event whose OTP is active.
### attendance
- Adds nullable `event_id` to identify the attended event.

## Security
- Enables RLS on the new event table.
- Youth members can read events for their church and pastorate-wide events.
- Only local or pastorate youth secretaries can create and update their matching events.
- Youth members can update only their own display name and avatar URL in their member profile.
- Account roles, church assignment, DOB, phone, and linked roster identity remain protected.
- Storage policies restrict profile photos to the signed-in user's folder.

## Important Notes
1. Existing attendance and OTP rows remain valid because event links are nullable.
2. Pastorate-wide events use a null church_id because the current church model has no pastorate identifier.
3. The application should create new event-linked OTP sessions for new event attendance.
*/

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS date_of_birth date;

ALTER TABLE public.youth_member_profiles
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS avatar_url text NOT NULL DEFAULT '';

ALTER TABLE public.otp_sessions
  ADD COLUMN IF NOT EXISTS event_id uuid;

ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS event_id uuid;

CREATE TABLE IF NOT EXISTS public.youth_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  venue text NOT NULL DEFAULT '',
  event_date date NOT NULL,
  start_time time,
  end_time time,
  scope text NOT NULL CHECK (scope IN ('local', 'pastorate')),
  church_id uuid REFERENCES public.churches(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT local_event_requires_church CHECK (scope = 'pastorate' OR church_id IS NOT NULL)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'otp_sessions_event_id_fkey') THEN
    ALTER TABLE public.otp_sessions
      ADD CONSTRAINT otp_sessions_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.youth_events(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendance_event_id_fkey') THEN
    ALTER TABLE public.attendance
      ADD CONSTRAINT attendance_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.youth_events(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_youth_events_date ON public.youth_events(event_date);
CREATE INDEX IF NOT EXISTS idx_youth_events_church ON public.youth_events(church_id);
CREATE INDEX IF NOT EXISTS idx_otp_sessions_event ON public.otp_sessions(event_id);
CREATE INDEX IF NOT EXISTS idx_attendance_event ON public.attendance(event_id);

ALTER TABLE public.youth_events ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.youth_events TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.youth_events TO authenticated;

DROP POLICY IF EXISTS "youth_read_visible_events" ON public.youth_events;
CREATE POLICY "youth_read_visible_events" ON public.youth_events FOR SELECT TO authenticated
USING (scope = 'pastorate' OR church_id = public.get_user_church_id() OR public.get_user_role() = 'super_admin');

DROP POLICY IF EXISTS "leaders_insert_events" ON public.youth_events;
CREATE POLICY "leaders_insert_events" ON public.youth_events FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = created_by
  AND (
    (scope = 'local' AND church_id = public.get_user_church_id() AND public.get_user_role() = 'local_youth_secretary')
    OR (scope = 'pastorate' AND public.get_user_role() = 'pastorate_youth_secretary')
    OR public.get_user_role() = 'super_admin'
  )
);

DROP POLICY IF EXISTS "leaders_update_events" ON public.youth_events;
CREATE POLICY "leaders_update_events" ON public.youth_events FOR UPDATE TO authenticated
USING (auth.uid() = created_by OR public.get_user_role() = 'super_admin')
WITH CHECK (
  (auth.uid() = created_by AND (
    (scope = 'local' AND church_id = public.get_user_church_id() AND public.get_user_role() = 'local_youth_secretary')
    OR (scope = 'pastorate' AND public.get_user_role() = 'pastorate_youth_secretary')
  ))
  OR public.get_user_role() = 'super_admin'
);

DROP POLICY IF EXISTS "leaders_delete_events" ON public.youth_events;
CREATE POLICY "leaders_delete_events" ON public.youth_events FOR DELETE TO authenticated
USING (auth.uid() = created_by OR public.get_user_role() = 'super_admin');

REVOKE UPDATE ON public.youth_member_profiles FROM authenticated;
GRANT SELECT ON public.youth_member_profiles TO authenticated;
GRANT UPDATE (full_name, avatar_url) ON public.youth_member_profiles TO authenticated;

DROP POLICY IF EXISTS "update_own_youth_profile" ON public.youth_member_profiles;
CREATE POLICY "update_own_youth_profile" ON public.youth_member_profiles FOR UPDATE TO authenticated
USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT SELECT ON public.profiles TO authenticated;
GRANT UPDATE (full_name) ON public.profiles TO authenticated;

DROP POLICY IF EXISTS "update_own_profile" ON public.profiles;
CREATE POLICY "update_own_profile" ON public.profiles FOR UPDATE TO authenticated
USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

INSERT INTO storage.buckets (id, name, public)
VALUES ('profile-photos', 'profile-photos', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "profile_photos_read_own" ON storage.objects;
CREATE POLICY "profile_photos_read_own" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'profile-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "profile_photos_insert_own" ON storage.objects;
CREATE POLICY "profile_photos_insert_own" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'profile-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "profile_photos_update_own" ON storage.objects;
CREATE POLICY "profile_photos_update_own" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'profile-photos' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'profile-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "profile_photos_delete_own" ON storage.objects;
CREATE POLICY "profile_photos_delete_own" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'profile-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_church_id uuid;
  v_dob date;
BEGIN
  v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'pc_member');
  v_church_id := NULLIF(NEW.raw_user_meta_data->>'church_id', '')::uuid;
  v_dob := NULLIF(NEW.raw_user_meta_data->>'date_of_birth', '')::date;

  INSERT INTO public.profiles (id, full_name, role, church_id, date_of_birth)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), v_role, v_church_id, v_dob)
  ON CONFLICT (id) DO UPDATE SET date_of_birth = COALESCE(public.profiles.date_of_birth, EXCLUDED.date_of_birth);

  IF v_role = 'youth_member' THEN
    INSERT INTO public.youth_member_profiles (id, church_id, full_name, phone, date_of_birth)
    VALUES (NEW.id, v_church_id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), COALESCE(NEW.raw_user_meta_data->>'phone', ''), v_dob)
    ON CONFLICT (id) DO UPDATE SET date_of_birth = COALESCE(public.youth_member_profiles.date_of_birth, EXCLUDED.date_of_birth);
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
