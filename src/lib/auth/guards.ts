import { createClient } from '@/lib/supabase/server';
import { UserRole } from '@/types/database';
import { AppError } from '@/lib/errors/app-error';

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  assigned_domain_id?: string | null;
  is_active: boolean;
}

export async function getCurrentUserProfile(): Promise<{
  user: { id: string; email?: string } | null;
  profile: UserProfile | null;
}> {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return { user: null, profile: null };
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, email, full_name, role, assigned_domain_id, is_active')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return { user, profile: null };
    }

    return { user, profile: profile as UserProfile };
  } catch {
    return { user: null, profile: null };
  }
}

export async function requireRole(allowedRoles: UserRole[]): Promise<{
  user: { id: string; email?: string };
  profile: UserProfile;
}> {
  const { user, profile } = await getCurrentUserProfile();

  if (!user) {
    throw new AppError('UNAUTHENTICATED', 'Authentication required. Please log in.', 401);
  }

  if (!profile || !profile.is_active) {
    throw new AppError('FORBIDDEN', 'Profile record not found or account is deactivated.', 403);
  }

  if (!allowedRoles.includes(profile.role)) {
    throw new AppError(
      'FORBIDDEN',
      `Access denied: Action requires one of roles [${allowedRoles.join(', ')}]. Current role: ${profile.role}.`,
      403,
      { requiredRoles: allowedRoles, currentRole: profile.role }
    );
  }

  return { user, profile };
}

export { getDefaultRedirectForRole } from './role-routes';

