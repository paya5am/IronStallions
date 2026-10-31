// Navigation for each role. Phase 2 replaces this file to add its pages.
export const NAV = {
  MEMBER: [
    { href: '/member', label: 'Dashboard' },
    { href: '/member/check-in', label: 'Check-in QR' },
    { href: '/member/equipment', label: 'Machines' },
    { href: '/member/workouts', label: 'Workouts' },
    { href: '/member/training', label: 'Personal training' },
    { href: '/member/plans', label: 'Plans' },
    { href: '/member/billing', label: 'Billing' },
  ],
  TRAINER: [
    { href: '/trainer', label: 'Sessions' },
    { href: '/trainer/availability', label: 'Availability' },
  ],
  STAFF: [
    { href: '/staff', label: 'Live floor' },
    { href: '/staff/scanner', label: 'QR scanner' },
    { href: '/staff/members', label: 'Members' },
    { href: '/staff/payments', label: 'Payments' },
    { href: '/staff/equipment', label: 'Equipment' },
  ],
  ADMIN: [
    { href: '/admin', label: 'Dashboard' },
    { href: '/admin/branches', label: 'Branches' },
    { href: '/admin/plans', label: 'Plans' },
    { href: '/admin/closures', label: 'Close days' },
    { href: '/admin/people', label: 'People' },
    { href: '/admin/settings', label: 'Settings' },
    { href: '/admin/activity', label: 'Activity log' },
  ],
};

export const ROLE_TITLE = { MEMBER: 'Member', TRAINER: 'Trainer', STAFF: 'Front desk', ADMIN: 'Owner / Admin' };
