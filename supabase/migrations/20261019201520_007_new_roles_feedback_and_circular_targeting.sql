/*
# Add new roles + member feedback + circular targeting

## Overview
1. Expands the role system to include new leadership roles:
   - pastorate_youth_secretary
   - pastorate_youth_treasurer
   - pastorate_convenor
   - local_youth_secretary
   - local_youth_treasurer
   - pc_member (already exists)
2. Adds a `member_feedback` table so super admin / leaders can record feedback
   for individual youth members.
3. Adds a `target_audience` column to circulars so they can be targeted to
   specific role groups (all, specific church, specific role).
4. Adds `date_of_birth` and `address` columns to youth_members for richer
   member detail views.

## New Tables

### member_feedback
- `id` (uuid, PK)
- `youth_member_id` (uuid, FK to youth_members, CASCADE)
- `given_by` (uuid, FK to auth.users)
- `given_by_role` (text)
- `feedback_text` (text)
- `rating` (int, 1-5)
- `created_at` (timestamptz)

## Modified Tables
### circulars
- Added `target_audience` (text, nullable) — 'all', 'church_youth', 'specific_role',
  or null (default behavior: visible to all in church or global)

### youth_members
- Added `date_of_birth` (date, nullable)
- Added `address` (text, nullable)

## Security
- RLS on member_feedback: leaders can read/insert feedback for their church's
  members; super admin has full access.
- Circular target_audience: doesn't change RLS (circulars still visible by
  church_id scope), the filtering by role happens in the frontend.

## Notes
1. The get_user_role() function already reads the role from the profiles table,
   so new roles work automatically once a profile is created.
2. Existing circulars get target_audience = NULL (visible to everyone as before).
*/

-- ===== Add columns to youth_members =====

ALTER TABLE public.youth_members
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS address text;

-- ===== Add target_audience to circulars =====

ALTER TABLE public.circulars
  ADD COLUMN IF NOT EXISTS target_audience text;

-- ===== member_feedback table =====

CREATE TABLE IF NOT EXISTS public.member_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  youth_member_id uuid NOT NULL REFERENCES public.youth_members(id) ON DELETE CASCADE,
  given_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  given_by_role text NOT NULL DEFAULT '',
  feedback_text text NOT NULL DEFAULT '',
  rating int NOT NULL DEFAULT 3 CHECK (rating >= 1 AND rating <= 5),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedback_member ON public.member_feedback(youth_member_id);

ALTER TABLE public.member_feedback ENABLE ROW LEVEL SECURITY;

-- Leaders can read feedback for members in their church
DROP POLICY IF EXISTS "read_feedback" ON public.member_feedback;
CREATE POLICY "read_feedback" ON public.member_feedback FOR SELECT
  TO authenticated USING (
    public.get_user_role() = 'super_admin'
    OR EXISTS (
      SELECT 1 FROM public.youth_members ym
      WHERE ym.id = member_feedback.youth_member_id
      AND ym.church_id = public.get_user_church_id()
    )
  );

-- Leaders can insert feedback for members in their church
DROP POLICY IF EXISTS "insert_feedback" ON public.member_feedback;
CREATE POLICY "insert_feedback" ON public.member_feedback FOR INSERT
  TO authenticated WITH CHECK (
    auth.uid() = given_by
    AND (
      public.get_user_role() = 'super_admin'
      OR EXISTS (
        SELECT 1 FROM public.youth_members ym
        WHERE ym.id = member_feedback.youth_member_id
        AND ym.church_id = public.get_user_church_id()
      )
    )
  );

-- Only the feedback author or super admin can delete
DROP POLICY IF EXISTS "delete_feedback" ON public.member_feedback;
CREATE POLICY "delete_feedback" ON public.member_feedback FOR DELETE
  TO authenticated USING (
    auth.uid() = given_by OR public.get_user_role() = 'super_admin'
  );
