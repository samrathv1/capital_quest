import { NextRequest } from 'next/server';
import { TournamentService } from '@/lib/services/tournament-service';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { successResponse, errorResponse } from '@/lib/api-response';
import { AppError } from '@/lib/errors/app-error';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const roundId = searchParams.get('roundId');

    if (!roundId) {
      return errorResponse(new AppError('VALIDATION_ERROR', 'roundId parameter is required', 400));
    }

    let supabase;
    try {
      supabase = await createClient();
    } catch {
      supabase = createAdminClient();
    }

    const service = new TournamentService(supabase);
    const decisions = await service.getDecisions(roundId);

    return successResponse({ decisions });
  } catch (err) {
    return errorResponse(err);
  }
}
