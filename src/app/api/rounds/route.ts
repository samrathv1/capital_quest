import { NextRequest } from 'next/server';
import { TournamentService } from '@/lib/services/tournament-service';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { successResponse, errorResponse } from '@/lib/api-response';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const eventId = searchParams.get('eventId');

    let supabase;
    try {
      supabase = await createClient();
    } catch {
      supabase = createAdminClient();
    }

    const service = new TournamentService(supabase);

    const targetEventId = eventId || (await service.getActiveEvent())?.id;
    if (!targetEventId) {
      return successResponse({ rounds: [], eligibleCompaniesCount: 0 });
    }

    const overview = await service.getRoundsOverview(targetEventId);
    return successResponse(overview);
  } catch (err) {
    return errorResponse(err);
  }
}
