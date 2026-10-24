import { NextRequest } from 'next/server';
import { TournamentService } from '@/lib/services/tournament-service';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { successResponse, errorResponse } from '@/lib/api-response';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const eventId = searchParams.get('eventId');
    const roundNumberStr = searchParams.get('roundNumber');
    const domainId = searchParams.get('domainId') || undefined;

    if (!eventId) {
      return errorResponse(new Error('Missing required query parameter: eventId'));
    }

    const roundNumber = roundNumberStr !== null ? parseInt(roundNumberStr, 10) : undefined;

    let supabase;
    try {
      supabase = await createClient();
    } catch {
      supabase = createAdminClient();
    }

    const service = new TournamentService(supabase);
    const leaderboard = await service.getLeaderboard(eventId, roundNumber, domainId);

    return successResponse(
      {
        eventId,
        roundNumber,
        domainId,
        leaderboard,
      },
      200,
      {
        'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30',
      }
    );
  } catch (err) {
    return errorResponse(err);
  }
}
