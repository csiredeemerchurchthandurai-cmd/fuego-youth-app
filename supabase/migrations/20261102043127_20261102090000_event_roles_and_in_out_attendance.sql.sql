/*
# Add role-based events and in/out attendance approvals

## Overview
Adds event ownership permissions for church admins, super admins, pastorate convenors, and youth secretaries. Extends attendance so a member is present only after both entry and exit OTP approvals.

## Modified Tables
- `youth_events`: existing event creation policies now allow church admins to create local events, super admins to create local or pastorate events, pastorate convenors to create pastorate events, and pastorate youth secretaries to create pastorate events.
- `attendance`: adds separate in/out OTP session references, approval fields, and a `present` flag.

## Security
- Event creation remains restricted by role and scope.
- Attendance approval remains restricted to the local youth secretary for that church.
- Existing attendance records remain present for compatibility.

## Important Notes
1. New event attendance starts with `present = false`.
2. The member becomes present only after both in and out approvals are approved.
3. Existing attendance rows are marked present so historical records remain unchanged.
*/

ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS in_otp_session_id uuid REFERENCES public.otp_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS out_otp_session_id uuid REFERENCES public.otp_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS in_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS out_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS in_approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS out_approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS in_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS out_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS present boolean NOT NULL DEFAULT false;

UPDATE public.attendance SET present = true, in_status = 'approved', out_status = 'approved' WHERE status = 'approved';

DROP POLICY IF EXISTS "leaders_insert_events" ON public.youth_events;
CREATE POLICY "leaders_insert_events" ON public.youth_events FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = created_by
  AND (
    (scope = 'local' AND church_id = public.get_user_church_id() AND public.get_user_role() IN ('local_youth_secretary', 'church_admin'))
    OR (scope = 'pastorate' AND public.get_user_role() IN ('pastorate_youth_secretary', 'pastorate_convenor', 'super_admin'))
    OR (scope = 'local' AND public.get_user_role() = 'super_admin' AND church_id IS NOT NULL)
  )
);

DROP POLICY IF EXISTS "leaders_update_events" ON public.youth_events;
CREATE POLICY "leaders_update_events" ON public.youth_events FOR UPDATE TO authenticated
USING (auth.uid() = created_by OR public.get_user_role() = 'super_admin')
WITH CHECK (
  (auth.uid() = created_by AND (
    (scope = 'local' AND church_id = public.get_user_church_id() AND public.get_user_role() IN ('local_youth_secretary', 'church_admin'))
    OR (scope = 'pastorate' AND public.get_user_role() IN ('pastorate_youth_secretary', 'pastorate_convenor'))
  ))
  OR public.get_user_role() = 'super_admin'
);

DROP POLICY IF EXISTS "insert_otp_sessions" ON public.otp_sessions;
CREATE POLICY "insert_otp_sessions" ON public.otp_sessions FOR INSERT TO authenticated
WITH CHECK (
  church_id = public.get_user_church_id()
  AND (
    (type = 'secretary_enable' AND public.get_user_role() IN ('church_admin', 'super_admin'))
    OR (type IN ('attendance', 'attendance_in', 'attendance_out') AND public.get_user_role() IN ('local_youth_secretary', 'pastorate_youth_secretary'))
  )
);

DROP POLICY IF EXISTS "update_attendance" ON public.attendance;
CREATE POLICY "update_attendance" ON public.attendance FOR UPDATE TO authenticated
USING ((church_id = public.get_user_church_id() AND public.get_user_role() = 'local_youth_secretary') OR public.get_user_role() = 'super_admin')
WITH CHECK ((church_id = public.get_user_church_id() AND public.get_user_role() = 'local_youth_secretary') OR public.get_user_role() = 'super_admin');
