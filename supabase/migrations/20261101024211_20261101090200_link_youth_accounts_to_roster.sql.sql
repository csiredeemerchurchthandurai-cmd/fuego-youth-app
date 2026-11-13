/*
# Link youth accounts to roster records

## Overview
Ensures every new youth account has a corresponding youth_members roster row so event attendance can reference the existing attendance foreign key safely.

## Modified Behavior
- New youth accounts create one roster row using the signup name, email, phone, church, and DOB.
- The youth_member_profiles row stores that roster row identifier.
- Existing account and attendance records are not deleted or changed.

## Security
The trigger runs as a protected database function. The browser still cannot choose another user's roster identity during attendance.
*/

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
  v_youth_member_id uuid;
BEGIN
  v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'pc_member');
  v_church_id := NULLIF(NEW.raw_user_meta_data->>'church_id', '')::uuid;
  v_dob := NULLIF(NEW.raw_user_meta_data->>'date_of_birth', '')::date;

  INSERT INTO public.profiles (id, full_name, role, church_id, date_of_birth)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), v_role, v_church_id, v_dob)
  ON CONFLICT (id) DO UPDATE SET date_of_birth = COALESCE(public.profiles.date_of_birth, EXCLUDED.date_of_birth);

  IF v_role = 'youth_member' THEN
    INSERT INTO public.youth_members (church_id, full_name, phone, email, date_of_birth)
    VALUES (v_church_id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), COALESCE(NEW.raw_user_meta_data->>'phone', ''), COALESCE(NEW.email, ''), v_dob)
    RETURNING id INTO v_youth_member_id;

    INSERT INTO public.youth_member_profiles (id, church_id, full_name, phone, youth_member_id, date_of_birth)
    VALUES (NEW.id, v_church_id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), COALESCE(NEW.raw_user_meta_data->>'phone', ''), v_youth_member_id, v_dob)
    ON CONFLICT (id) DO UPDATE SET date_of_birth = COALESCE(public.youth_member_profiles.date_of_birth, EXCLUDED.date_of_birth), youth_member_id = COALESCE(public.youth_member_profiles.youth_member_id, EXCLUDED.youth_member_id);
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
