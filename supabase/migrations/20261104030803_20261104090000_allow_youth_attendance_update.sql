/*
# Allow youth members to complete their own event attendance

1. Purpose
- Fix the second-step OTP flow so a signed-in youth member can update the attendance row created by their IN OTP submission.
- Keep approval authority with the local youth secretary and Super Admin.

2. Modified table
- `attendance`
- Adds an UPDATE policy allowing a youth member to update only an attendance row they personally created.
- The row must belong to the caller's church and the caller must be the `marked_by` member account.

3. Security
- Existing local secretary and Super Admin update policy remains unchanged.
- Youth members cannot update another member's attendance row.
- The policy is scoped to authenticated users and uses `auth.uid()` through the existing `marked_by` ownership field.

4. Notes
- No rows are deleted or recreated.
- This migration is safe to apply again because the policy is replaced idempotently.
*/

DROP POLICY IF EXISTS "youth_update_own_attendance" ON public.attendance;
CREATE POLICY "youth_update_own_attendance" ON public.attendance FOR UPDATE
TO authenticated
USING (
  church_id = public.get_user_church_id()
  AND public.get_user_role() = 'youth_member'
  AND marked_by = auth.uid()
)
WITH CHECK (
  church_id = public.get_user_church_id()
  AND public.get_user_role() = 'youth_member'
  AND marked_by = auth.uid()
);
