import { NextRequest } from 'next/server';
import { TournamentService } from '@/lib/services/tournament-service';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { successResponse, errorResponse } from '@/lib/api-response';

interface RouteContext {
  params: Promise<{ companyId: string }>;
}

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await context.params;

    if (!companyId) {
      return errorResponse(new Error('Missing required companyId parameter'));
    }

    let supabase;
    let callerRole: string | undefined;

    try {
      supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .maybeSingle();
        callerRole = profile?.role;
      }
    } catch {
      supabase = createAdminClient();
    }

    const service = new TournamentService(supabase);
    const performanceData = await service.getCompanyPerformance(companyId, callerRole);

    return successResponse(
      performanceData,
      200,
      {
        'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30',
      }
    );
  } catch (err) {
    return errorResponse(err);
  }
}
