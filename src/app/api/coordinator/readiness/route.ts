import { NextRequest } from 'next/server';
import { TournamentService } from '@/lib/services/tournament-service';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { AppError } from '@/lib/errors/app-error';
import { successResponse, errorResponse } from '@/lib/api-response';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const roundId = searchParams.get('roundId');
    const domainId = searchParams.get('domainId');

    if (!roundId || !domainId) {
      return errorResponse(new AppError('VALIDATION_ERROR', 'roundId and domainId parameters are required', 400));
    }

    let supabase;
    try {
      supabase = await createClient();
    } catch {
      supabase = createAdminClient();
    }

    const service = new TournamentService(supabase);
    const readiness = await service.getDomainReadiness(roundId, domainId);

    return successResponse({ readiness });
  } catch (err) {
    return errorResponse(err);
  }
}
