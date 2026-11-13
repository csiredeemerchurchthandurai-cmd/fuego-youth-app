/*
# Allow youth members to create their own roster entry

## Problem
When a youth member marks attendance via OTP, the app auto-creates a youth_members
row if one doesn't exist yet (matching by name). The insert_youth_members policy
only allows church_admin, secretary, and treasurer roles.

## Fix
Add 'youth_member' to the allowed roles for inserting youth_members, keeping the
church_id ownership check so they can only add entries to their own church.
*/

DROP POLICY IF EXISTS "insert_youth_members" ON public.youth_members;
CREATE POLICY "insert_youth_members" ON public.youth_members FOR INSERT
  TO authenticated WITH CHECK (
    public.get_user_role() IN ('church_admin', 'secretary', 'treasurer', 'youth_member')
    AND church_id = public.get_user_church_id()
  );
