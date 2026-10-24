import { NextRequest } from 'next/server';
import { TournamentService } from '@/lib/services/tournament-service';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { successResponse, errorResponse } from '@/lib/api-response';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    let eventId = searchParams.get('eventId');

    let supabase;
    try {
      supabase = await createClient();
    } catch {
      supabase = createAdminClient();
    }

    const service = new TournamentService(supabase);

    if (!eventId) {
      const active = await service.getActiveEvent();
      eventId = active?.id;
    }

    if (!eventId) {
      return successResponse({
        stats: {
          event: null,
          totalTeams: 0,
          totalDomains: 0,
          activeRound: null,
          submittedCount: 0,
          verifiedCount: 0,
          missingCount: 0,
          flaggedCount: 0,
          eventStatus: 'setup',
        },
      });
    }

    const stats = await service.getOverviewStats(eventId);
    return successResponse({ stats });
  } catch (err) {
    return errorResponse(err);
  }
}
