/*
# Allow anon to read churches

## Problem
The signup page loads the church dropdown before the user is authenticated.
The churches SELECT policy was scoped to `TO authenticated` only, so the
anon-key client got an empty list — users couldn't select a church during
signup.

## Fix
Add a separate SELECT policy for `anon` role so the church dropdown works
on the signup page. This is safe because church names/locations are public
information needed for registration.
*/

DROP POLICY IF EXISTS "read_churches" ON public.churches;
CREATE POLICY "read_churches" ON public.churches FOR SELECT
  TO anon, authenticated USING (true);
