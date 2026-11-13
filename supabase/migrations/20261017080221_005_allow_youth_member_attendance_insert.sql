/*
# Allow youth members to insert their own attendance

## Problem
The attendance INSERT policy only allows 'secretary' and 'treasurer' roles.
Youth members need to mark their own attendance via OTP, which requires INSERT access.

## Fix
Update the insert_attendance policy to also allow 'youth_member' role.
Keep the church_id ownership check so youth members can only insert attendance
for their own church.

## Changes
- Drop and recreate insert_attendance policy to include 'youth_member' role
*/

DROP POLICY IF EXISTS "insert_attendance" ON public.attendance;
CREATE POLICY "insert_attendance" ON public.attendance FOR INSERT
  TO authenticated WITH CHECK (
    church_id = public.get_user_church_id()
    AND public.get_user_role() IN ('secretary', 'treasurer', 'youth_member')
  );
