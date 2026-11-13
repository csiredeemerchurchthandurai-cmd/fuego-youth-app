/*
# Restrict event management and move secretary OTP generation

1. Event management
- Only `church_admin` and `super_admin` may create or edit youth events.
- Church Admins may create or edit only local events belonging to their own church.
- Super Admin may create or edit local events for any church and pastorate events.
- Other leadership roles retain event visibility but cannot create or edit events.
- Event deletion remains available only to Super Admin.

2. Secretary verification OTP
- Church Admins can no longer create `secretary_enable` OTPs.
- Local Youth Secretaries may create and update their own local secretary verification OTPs.
- Super Admin retains access for administrative support.

3. Security
- Existing RLS policies are replaced with narrower authenticated-role policies.
- All predicates derive authorization from the signed-in profile and church helper functions.
*/

DROP POLICY IF EXISTS "leaders_insert_events" ON public.youth_events;
CREATE POLICY "admins_insert_events" ON public.youth_events
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = created_by
  AND (
    (get_user_role() = 'church_admin' AND scope = 'local' AND church_id = get_user_church_id())
    OR get_user_role() = 'super_admin'
  )
);

DROP POLICY IF EXISTS "leaders_update_events" ON public.youth_events;
CREATE POLICY "admins_update_events" ON public.youth_events
FOR UPDATE TO authenticated
USING (
  get_user_role() = 'super_admin'
  OR (
    get_user_role() = 'church_admin'
    AND scope = 'local'
    AND church_id = get_user_church_id()
  )
)
WITH CHECK (
  get_user_role() = 'super_admin'
  OR (
    get_user_role() = 'church_admin'
    AND scope = 'local'
    AND church_id = get_user_church_id()
  )
);

DROP POLICY IF EXISTS "leaders_delete_events" ON public.youth_events;
CREATE POLICY "super_admin_delete_events" ON public.youth_events
FOR DELETE TO authenticated
USING (get_user_role() = 'super_admin');

DROP POLICY IF EXISTS "insert_otp_sessions" ON public.otp_sessions;
CREATE POLICY "insert_otp_sessions" ON public.otp_sessions
FOR INSERT TO authenticated
WITH CHECK (
  church_id = get_user_church_id()
  AND (
    (type = 'secretary_enable' AND get_user_role() = 'local_youth_secretary')
    OR (type = 'secretary_enable' AND get_user_role() = 'super_admin')
    OR (type IN ('attendance', 'attendance_in', 'attendance_out') AND get_user_role() = 'local_youth_secretary')
    OR (type IN ('attendance', 'attendance_in', 'attendance_out') AND get_user_role() = 'pastorate_youth_secretary')
  )
);

DROP POLICY IF EXISTS "update_otp_sessions" ON public.otp_sessions;
CREATE POLICY "update_otp_sessions" ON public.otp_sessions
FOR UPDATE TO authenticated
USING (
  (church_id = get_user_church_id() AND generated_by = auth.uid() AND get_user_role() = 'local_youth_secretary')
  OR get_user_role() = 'super_admin'
)
WITH CHECK (
  (church_id = get_user_church_id() AND generated_by = auth.uid() AND get_user_role() = 'local_youth_secretary')
  OR get_user_role() = 'super_admin'
);
