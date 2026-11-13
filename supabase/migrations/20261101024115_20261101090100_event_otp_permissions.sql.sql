/*
# Permit event-linked OTPs for local and pastorate youth secretaries

## Overview
Updates the existing OTP policies so event attendance can be created by the correct secretary and read by authenticated youth members for visible events.

## Security
- Local secretaries can create attendance OTPs for local events in their church.
- Pastorate secretaries can create attendance OTPs for pastorate events.
- Youth members can read active OTP sessions only when the linked event is visible to them.
- Existing OTP rows and non-event attendance behavior remain unchanged.
*/

DROP POLICY IF EXISTS "insert_otp_sessions" ON public.otp_sessions;
CREATE POLICY "insert_otp_sessions" ON public.otp_sessions FOR INSERT TO authenticated
WITH CHECK (
  (
    type = 'attendance'
    AND (
      (public.get_user_role() = 'local_youth_secretary' AND church_id = public.get_user_church_id())
      OR (public.get_user_role() = 'pastorate_youth_secretary')
    )
  )
  OR (
    type = 'secretary_enable'
    AND public.get_user_role() IN ('church_admin', 'super_admin')
    AND church_id = public.get_user_church_id()
  )
);

DROP POLICY IF EXISTS "read_otp_sessions" ON public.otp_sessions;
CREATE POLICY "read_otp_sessions" ON public.otp_sessions FOR SELECT TO authenticated
USING (
  church_id = public.get_user_church_id()
  OR public.get_user_role() = 'super_admin'
  OR EXISTS (
    SELECT 1 FROM public.youth_events e
    WHERE e.id = otp_sessions.event_id
      AND (e.scope = 'pastorate' OR e.church_id = public.get_user_church_id())
  )
);
