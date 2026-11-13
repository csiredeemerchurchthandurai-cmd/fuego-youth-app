/*
# Auto-create profile on user signup

## Problem
When a user signs up, the profile row was inserted from the frontend.
This caused a race condition: the onAuthStateChange listener fired and
fetched the profile before the insert completed, getting null, and then
overwriting the correct profile value later — leaving the app stuck on
a loading spinner.

## Fix
Create a SECURITY DEFINER trigger on auth.users that automatically inserts
a profile row whenever a new auth user is created. The frontend passes
full_name, role, and church_id via user_metadata during signUp, and the
trigger reads those values. This makes profile creation atomic with user
creation — no race condition, no RLS issues.

## Changes
- New function: public.handle_new_user() — SECURITY DEFINER trigger function
- New trigger: on_auth_user_created AFTER INSERT ON auth.users
- Existing profiles without these fields are unaffected
*/

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role, church_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'pc_member'),
    NULLIF(NEW.raw_user_meta_data->>'church_id', '')::uuid
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
