/*
# Leadership Profiles and Church Finance

## Overview
Adds two church-scoped features:
1. Leadership profile cards for reverends, PC members, and pastorate committee members.
2. Private church finance records for weekly offerings, monthly contributions, and the current youth fund.

## New Tables

### leadership_profiles
- `id` (uuid, primary key)
- `church_id` (uuid, nullable church reference; null means shared pastorate profile)
- `category` (text: reverend, pc_member, or pastorate_committee)
- `name`, `title`, `description`, and `photo_url` (editable profile-card content)
- `sort_order` and `created_at`

### church_funds
- `id` (uuid, primary key)
- `church_id` (uuid, one record per church)
- `weekly_offering`, `monthly_contribution`, and `current_youth_fund` (numeric amounts)
- `updated_by` and `updated_at`

### church_fund_access
- `id` (uuid, primary key)
- `church_id` (uuid)
- `role` (text role allowed to view the church fund)
- `can_view` (boolean)
- Unique per church and role.

## Security
- All new tables have RLS enabled.
- Leadership profiles are readable only by authenticated users in the same church, or super_admin; only super_admin can create, edit, or delete them.
- Fund records are readable only by super_admin, the owning church's local_youth_treasurer, or roles explicitly granted in church_fund_access.
- Only super_admin and local_youth_treasurer can create or update fund values for their own church.
- Fund access settings are readable and editable only by super_admin.

## Important Notes
1. Existing data is untouched.
2. Amounts are stored as numeric values and default to zero.
3. Photo files can be represented by a secure image URL in `photo_url`; the UI keeps this editable per profile card.
*/

CREATE TABLE IF NOT EXISTS public.leadership_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid REFERENCES public.churches(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('reverend', 'pc_member', 'pastorate_committee')),
  name text NOT NULL,
  title text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  photo_url text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leadership_profiles_church ON public.leadership_profiles(church_id);
ALTER TABLE public.leadership_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leadership_select_same_church" ON public.leadership_profiles;
CREATE POLICY "leadership_select_same_church" ON public.leadership_profiles FOR SELECT TO authenticated
USING (
  public.get_user_role() = 'super_admin'
  OR church_id IS NULL
  OR church_id = public.get_user_church_id()
);
DROP POLICY IF EXISTS "leadership_insert_super_admin" ON public.leadership_profiles;
CREATE POLICY "leadership_insert_super_admin" ON public.leadership_profiles FOR INSERT TO authenticated
WITH CHECK (public.get_user_role() = 'super_admin');
DROP POLICY IF EXISTS "leadership_update_super_admin" ON public.leadership_profiles;
CREATE POLICY "leadership_update_super_admin" ON public.leadership_profiles FOR UPDATE TO authenticated
USING (public.get_user_role() = 'super_admin') WITH CHECK (public.get_user_role() = 'super_admin');
DROP POLICY IF EXISTS "leadership_delete_super_admin" ON public.leadership_profiles;
CREATE POLICY "leadership_delete_super_admin" ON public.leadership_profiles FOR DELETE TO authenticated
USING (public.get_user_role() = 'super_admin');

CREATE TABLE IF NOT EXISTS public.church_funds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL UNIQUE REFERENCES public.churches(id) ON DELETE CASCADE,
  weekly_offering numeric(12,2) NOT NULL DEFAULT 0 CHECK (weekly_offering >= 0),
  monthly_contribution numeric(12,2) NOT NULL DEFAULT 0 CHECK (monthly_contribution >= 0),
  current_youth_fund numeric(12,2) NOT NULL DEFAULT 0 CHECK (current_youth_fund >= 0),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.church_funds ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.church_fund_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES public.churches(id) ON DELETE CASCADE,
  role text NOT NULL,
  can_view boolean NOT NULL DEFAULT false,
  UNIQUE(church_id, role)
);
ALTER TABLE public.church_fund_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "funds_select_allowed" ON public.church_funds;
CREATE POLICY "funds_select_allowed" ON public.church_funds FOR SELECT TO authenticated
USING (
  public.get_user_role() = 'super_admin'
  OR church_id = public.get_user_church_id() AND (
    public.get_user_role() = 'local_youth_treasurer'
    OR EXISTS (
      SELECT 1 FROM public.church_fund_access a
      WHERE a.church_id = church_funds.church_id
        AND a.role = public.get_user_role()
        AND a.can_view = true
    )
  )
);
DROP POLICY IF EXISTS "funds_insert_allowed" ON public.church_funds;
CREATE POLICY "funds_insert_allowed" ON public.church_funds FOR INSERT TO authenticated
WITH CHECK (
  (public.get_user_role() = 'super_admin' OR public.get_user_role() = 'local_youth_treasurer')
  AND church_id = public.get_user_church_id()
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
DROP POLICY IF EXISTS "funds_delete_allowed" ON public.church_funds;
CREATE POLICY "funds_delete_allowed" ON public.church_funds FOR DELETE TO authenticated
USING (public.get_user_role() = 'super_admin');

DROP POLICY IF EXISTS "fund_access_select_super_admin" ON public.church_fund_access;
CREATE POLICY "fund_access_select_super_admin" ON public.church_fund_access FOR SELECT TO authenticated
USING (public.get_user_role() = 'super_admin');
DROP POLICY IF EXISTS "fund_access_insert_super_admin" ON public.church_fund_access;
CREATE POLICY "fund_access_insert_super_admin" ON public.church_fund_access FOR INSERT TO authenticated
WITH CHECK (public.get_user_role() = 'super_admin');
DROP POLICY IF EXISTS "fund_access_update_super_admin" ON public.church_fund_access;
CREATE POLICY "fund_access_update_super_admin" ON public.church_fund_access FOR UPDATE TO authenticated
USING (public.get_user_role() = 'super_admin') WITH CHECK (public.get_user_role() = 'super_admin');
DROP POLICY IF EXISTS "fund_access_delete_super_admin" ON public.church_fund_access;
CREATE POLICY "fund_access_delete_super_admin" ON public.church_fund_access FOR DELETE TO authenticated
USING (public.get_user_role() = 'super_admin');