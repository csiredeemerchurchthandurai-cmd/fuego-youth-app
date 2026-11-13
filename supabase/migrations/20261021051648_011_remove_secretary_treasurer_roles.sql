/*
# Remove Secretary and Treasurer Roles, Expand Fund Access

## Overview
1. Migrates any existing `secretary` profiles to `local_youth_secretary`.
2. Migrates any existing `treasurer` profiles to `local_youth_treasurer`.
3. Migrates `secretary_enable` OTP sessions to `attendance` type (the old secretary enable-OTP flow is replaced by the local youth secretary's direct OTP generation).
4. Expands church fund access management: both `local_youth_treasurer` and `pastorate_youth_treasurer` can now manage fund-view access checkboxes for Reverend (church_admin), PC Members, Pastorate Secretary, Convenor, and Youth Members of their churches.
5. Updates the `church_fund_access` RLS so both treasurer roles can manage access rows for their own church (not just super_admin).
6. Updates the `church_funds` SELECT policy so `pastorate_youth_treasurer` can view funds for all churches (pastorate-level oversight), and `local_youth_treasurer` can view their own church fund.
7. Cleans up stale `church_fund_access` rows that referenced the removed `secretary`/`treasurer` roles.

## Security
- RLS remains enabled on all affected tables.
- Fund access management is now granted to both treasurer roles for their own church, plus super_admin for any church.
- No destructive column or table changes — only data updates and policy replacements.
*/

-- 1. Migrate old role profiles
UPDATE public.profiles SET role = 'local_youth_secretary' WHERE role = 'secretary';
UPDATE public.profiles SET role = 'local_youth_treasurer' WHERE role = 'treasurer';

-- 2. Migrate secretary_enable OTP sessions to attendance type
UPDATE public.otp_sessions SET type = 'attendance' WHERE type = 'secretary_enable';

-- 3. Clean up stale fund access rows referencing removed roles
DELETE FROM public.church_fund_access WHERE role IN ('secretary', 'treasurer');

-- 4. Update church_funds SELECT policy — pastorate_youth_treasurer sees all churches
DROP POLICY IF EXISTS "funds_select_allowed" ON public.church_funds;
CREATE POLICY "funds_select_allowed" ON public.church_funds FOR SELECT TO authenticated
USING (
  public.get_user_role() = 'super_admin'
  OR (public.get_user_role() = 'pastorate_youth_treasurer')
  OR (church_id = public.get_user_church_id() AND (
    public.get_user_role() = 'local_youth_treasurer'
    OR EXISTS (
      SELECT 1 FROM public.church_fund_access a
      WHERE a.church_id = church_funds.church_id
        AND a.role = public.get_user_role()
        AND a.can_view = true
    )
  ))
);

-- 5. Update church_funds INSERT policy — add pastorate_youth_treasurer (own church only)
DROP POLICY IF EXISTS "funds_insert_allowed" ON public.church_funds;
CREATE POLICY "funds_insert_allowed" ON public.church_funds FOR INSERT TO authenticated
WITH CHECK (
  public.get_user_role() = 'super_admin'
  OR (public.get_user_role() = 'local_youth_treasurer' AND church_id = public.get_user_church_id())
  OR (public.get_user_role() = 'pastorate_youth_treasurer' AND church_id = public.get_user_church_id())
);

-- 6. Update church_funds UPDATE policy — add pastorate_youth_treasurer (own church only)
DROP POLICY IF EXISTS "funds_update_allowed" ON public.church_funds;
CREATE POLICY "funds_update_allowed" ON public.church_funds FOR UPDATE TO authenticated
USING (
  public.get_user_role() = 'super_admin'
  OR (public.get_user_role() = 'local_youth_treasurer' AND church_id = public.get_user_church_id())
  OR (public.get_user_role() = 'pastorate_youth_treasurer' AND church_id = public.get_user_church_id())
)
WITH CHECK (
  public.get_user_role() = 'super_admin'
  OR (public.get_user_role() = 'local_youth_treasurer' AND church_id = public.get_user_church_id())
  OR (public.get_user_role() = 'pastorate_youth_treasurer' AND church_id = public.get_user_church_id())
);

-- 7. Update church_fund_access policies — both treasurer roles can manage access for their church
DROP POLICY IF EXISTS "fund_access_select_allowed" ON public.church_fund_access;
CREATE POLICY "fund_access_select_allowed" ON public.church_fund_access FOR SELECT TO authenticated
USING (
  public.get_user_role() = 'super_admin'
  OR (public.get_user_role() IN ('local_youth_treasurer', 'pastorate_youth_treasurer') AND church_id = public.get_user_church_id())
);

DROP POLICY IF EXISTS "fund_access_insert_allowed" ON public.church_fund_access;
CREATE POLICY "fund_access_insert_allowed" ON public.church_fund_access FOR INSERT TO authenticated
WITH CHECK (
  public.get_user_role() = 'super_admin'
  OR (public.get_user_role() IN ('local_youth_treasurer', 'pastorate_youth_treasurer') AND church_id = public.get_user_church_id())
);

DROP POLICY IF EXISTS "fund_access_update_allowed" ON public.church_fund_access;
CREATE POLICY "fund_access_update_allowed" ON public.church_fund_access FOR UPDATE TO authenticated
USING (
  public.get_user_role() = 'super_admin'
  OR (public.get_user_role() IN ('local_youth_treasurer', 'pastorate_youth_treasurer') AND church_id = public.get_user_church_id())
)
WITH CHECK (
  public.get_user_role() = 'super_admin'
  OR (public.get_user_role() IN ('local_youth_treasurer', 'pastorate_youth_treasurer') AND church_id = public.get_user_church_id())
);

DROP POLICY IF EXISTS "fund_access_delete_allowed" ON public.church_fund_access;
CREATE POLICY "fund_access_delete_allowed" ON public.church_fund_access FOR DELETE TO authenticated
USING (
  public.get_user_role() = 'super_admin'
  OR (public.get_user_role() IN ('local_youth_treasurer', 'pastorate_youth_treasurer') AND church_id = public.get_user_church_id())
);
