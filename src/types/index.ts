// FALLBACK ONLY: a rebuilt version of src/types/index.ts, based on how the app uses these types.
// Prefer restoring your original file from VS Code Timeline / git / Time Machine.

export type UserRole =
  | 'super_admin'
  | 'church_admin'
  | 'pc_member'
  | 'youth_member'
  | 'pastorate_youth_secretary'
  | 'pastorate_youth_treasurer'
  | 'pastorate_convenor'
  | 'local_youth_secretary'
  | 'local_youth_treasurer';

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'Super Admin',
  church_admin: 'Church Admin',
  pc_member: 'PC Member',
  youth_member: 'Youth Member',
  pastorate_youth_secretary: 'Pastorate Youth Secretary',
  pastorate_youth_treasurer: 'Pastorate Youth Treasurer',
  pastorate_convenor: 'Pastorate Convenor',
  local_youth_secretary: 'Local Youth Secretary',
  local_youth_treasurer: 'Local Youth Treasurer',
};

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  super_admin: 'Manage churches, users, circulars and funds across the whole fellowship.',
  church_admin: "Manage your church's members, events and circulars.",
  pc_member: 'Pastorate Committee member of your church.',
  youth_member: 'Attend events, give feedback and read circulars from your leaders.',
  pastorate_youth_secretary: 'Run attendance for pastorate events and view every church.',
  pastorate_youth_treasurer: "View every church's members and funds.",
  pastorate_convenor: 'Add pastorate events and oversee all churches.',
  local_youth_secretary: "Generate attendance OTPs and approve attendance for your church's events.",
  local_youth_treasurer: "Manage your church's youth fund.",
};

export interface Church {
  id: string;
  name: string;
  location: string;
  created_at: string;
}

export interface Profile {
  id: string;
  full_name: string;
  role: UserRole;
  church_id: string | null;
  created_at: string;
  date_of_birth?: string | null;
  phone?: string | null;
}

export interface YouthMember {
  id: string;
  church_id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  date_of_birth: string | null;
  address: string | null;
  created_at: string;
}

export interface YouthEvent {
  id: string;
  title: string;
  description: string | null;
  venue: string | null;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  scope: 'local' | 'pastorate';
  church_id: string | null;
  created_by: string;
  created_at: string;
}

export interface AttendanceRecord {
  id: string;
  otp_session_id: string | null;
  event_id: string | null;
  youth_member_id: string;
  church_id: string;
  marked_by: string;
  attendance_date: string;
  created_at: string;
  status: string | null;
  feedback_submitted: boolean;
  approved_by: string | null;
  approved_at: string | null;
  in_otp_session_id?: string | null;
  out_otp_session_id?: string | null;
  in_status?: string | null;
  out_status?: string | null;
  present?: boolean | null;
  in_approved_by?: string | null;
  out_approved_by?: string | null;
  in_approved_at?: string | null;
  out_approved_at?: string | null;
}

export interface OtpSession {
  id: string;
  church_id: string;
  event_id: string | null;
  type: string;
  otp_code: string;
  generated_by: string;
  is_used: boolean;
  is_active: boolean;
  expires_at: string;
  created_at: string;
}

export interface Circular {
  id: string;
  church_id: string | null;
  title: string;
  body: string;
  created_by: string;
  created_by_role: string;
  target_audience: string | null;
  created_at: string;
}

export interface CircularRead {
  id: string;
  circular_id: string;
  read_by: string;
  read_at: string;
}

export interface ChurchFund {
  id: string;
  church_id: string;
  weekly_offering: number;
  monthly_contribution: number;
  current_youth_fund: number;
  updated_by: string | null;
  updated_at: string;
}

export interface ChurchFundAccess {
  id: string;
  church_id: string;
  role: UserRole;
  can_view: boolean;
}

// Who a circular is addressed to. The value is stored in circulars.target_audience.
export const CIRCULAR_AUDIENCES: { value: string; label: string }[] = [
  { value: 'all', label: 'Everyone' },
  { value: 'youth_member', label: 'Youth Members' },
  { value: 'local_youth_secretary', label: 'Local Youth Secretaries' },
  { value: 'local_youth_treasurer', label: 'Local Youth Treasurers' },
  { value: 'pc_member', label: 'PC Members' },
];

// Roles that are allowed to send circulars
export const CIRCULAR_ISSUING_ROLES: UserRole[] = [
  'super_admin',
  'church_admin',
  'pastorate_youth_secretary',
  'pastorate_youth_treasurer',
  'pastorate_convenor',
  'local_youth_secretary',
  'local_youth_treasurer',
];