// Who a circular can be addressed to, and who can see it.
// The value is stored in circulars.target_audience.

export type AudienceOption = { value: string; label: string };

// Roles that can send circulars (every admin role, plus PC members)
export const CIRCULAR_SENDER_ROLES = [
  'super_admin',
  'church_admin',
  'pc_member',
  'pastorate_convenor',
  'pastorate_youth_secretary',
  'pastorate_youth_treasurer',
  'local_youth_secretary',
  'local_youth_treasurer',
];

// Roles that oversee every church: they can address any church, or all churches at once
export const WIDE_ROLES = ['super_admin', 'pc_member', 'pastorate_convenor', 'pastorate_youth_secretary', 'pastorate_youth_treasurer'];

// "All youth members" reaches the youth AND the leaders around them
export const YOUTH_AUDIENCE_ROLES = [
  'youth_member',
  'local_youth_secretary',
  'local_youth_treasurer',
  'pastorate_youth_secretary',
  'pastorate_youth_treasurer',
  'pastorate_convenor',
  'pc_member',
];

export const AUDIENCE_OPTIONS: AudienceOption[] = [
  { value: 'all', label: 'Everyone' },
  { value: 'youth_member', label: 'All youth members (incl. local admins, pastorate admins and PC members)' },
  { value: 'local_youth_secretary', label: 'Local Youth Secretaries' },
  { value: 'local_youth_treasurer', label: 'Local Youth Treasurers' },
  { value: 'pc_member', label: 'PC Members' },
  { value: 'pastorate_convenor', label: 'Pastorate Convener' },
  { value: 'pastorate_youth_secretary', label: 'Pastorate Youth Secretary' },
  { value: 'pastorate_youth_treasurer', label: 'Pastorate Youth Treasurer' },
  { value: 'church_admin', label: 'Church Admins' },
];

const KNOWN_ROLE_AUDIENCES = AUDIENCE_OPTIONS.map((option) => option.value).filter((value) => value !== 'all' && value !== 'youth_member');

export function audienceLabel(value: string | null | undefined) {
  if (!value || value === 'all') return 'Everyone';
  return AUDIENCE_OPTIONS.find((option) => option.value === value)?.label.split(' (')[0] || value;
}

// Can this person see a circular with this audience?
export function audienceIncludes(audience: string | null | undefined, viewerRole: string, isAuthor: boolean) {
  if (isAuthor || viewerRole === 'super_admin' || viewerRole === 'church_admin') return true;
  if (!audience || audience === 'all') return true;
  if (audience === 'youth_member') return YOUTH_AUDIENCE_ROLES.includes(viewerRole);
  if (KNOWN_ROLE_AUDIENCES.includes(audience)) return audience === viewerRole;
  return true; // older circulars with another audience value stay visible
}