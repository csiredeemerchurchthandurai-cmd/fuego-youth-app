// Positions shown on the sign-in page, in the order they appear for each church
export const LEADER_POSITIONS: { value: string; label: string }[] = [
  { value: 'presbyter', label: 'Presbyter & Chairman' },
  { value: 'local_youth_secretary', label: 'Local Youth Secretary' },
  { value: 'local_joint_secretary', label: 'Local Youth Joint Secretary' },
  { value: 'local_youth_treasurer', label: 'Local Youth Treasurer' },
  { value: 'pastorate_youth_secretary', label: 'Pastorate Youth Secretary' },
  { value: 'pastorate_youth_treasurer', label: 'Pastorate Youth Treasurer' },
  { value: 'pastorate_convenor', label: 'Pastorate Youth Convener' },
  { value: 'pc_member', label: 'PC Member' },
];

export const positionLabel = (value: string) => LEADER_POSITIONS.find((item) => item.value === value)?.label || value;
export const positionRank = (value: string) => {
  const index = LEADER_POSITIONS.findIndex((item) => item.value === value);
  return index === -1 ? LEADER_POSITIONS.length : index;
};