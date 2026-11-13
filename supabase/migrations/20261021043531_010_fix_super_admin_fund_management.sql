/*
# Fix Super Admin Church Fund Management

## Overview
Updates only the church fund insert and update rules so super_admin can manage
any church, while local_youth_treasurer remains limited to their own church.

## Security
- Super admin can insert and update fund records for any church.
- Local youth treasurer can insert and update only their own church fund.
- No other access is broadened.
*/

DROP POLICY IF EXISTS "funds_insert_allowed" ON public.church_funds;
CREATE POLICY "funds_insert_allowed" ON public.church_funds FOR INSERT TO authenticated
WITH CHECK (
  public.get_user_role() = 'super_admin'
  OR (public.get_user_role() = 'local_youth_treasurer' AND church_id = public.get_user_church_id())
);

DROP POLICY IF EXISTS "funds_update_allowed" ON public.church_funds;
CREATE POLICY "funds_update_allowed" ON public.church_funds FOR UPDATE TO authenticated
USING (
  public.get_user_role() = 'super_admin'
  OR (public.get_user_role() = 'local_youth_treasurer' AND church_id = public.get_user_church_id())
)
WITH CHECK (
  public.get_user_role() = 'super_admin'
  OR (public.get_user_role() = 'local_youth_treasurer' AND church_id = public.get_user_church_id())
);