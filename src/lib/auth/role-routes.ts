import { UserRole } from '@/types/database';

export function getDefaultRedirectForRole(role: UserRole): string {
  switch (role) {
    case 'super_admin':
      return '/admin/dashboard';
    case 'domain_coordinator':
      return '/coordinator/dashboard';
    case 'volunteer':
      return '/volunteer/entry';
    case 'judge':
      return '/admin/dashboard';
    default:
      return '/login';
  }
}
