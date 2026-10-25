import { NextRequest } from 'next/server';
import { requireRole } from '@/lib/auth/guards';
import { TournamentService } from '@/lib/services/tournament-service';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { successResponse, errorResponse } from '@/lib/api-response';
import { AppError } from '@/lib/errors/app-error';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const supabase = createAdminClient();

    try {
      await requireRole(['super_admin', 'domain_coordinator', 'judge']);
    } catch (guardErr) {
      try {
        const serverClient = await createClient();
        const { data: { user } } = await serverClient.auth.getUser();
        if (!user) throw guardErr;
      } catch {
        throw guardErr;
      }
    }

    const { searchParams } = new URL(req.url);
    let roundId = searchParams.get('roundId');

    const service = new TournamentService(supabase);

    // If roundId was not passed, resolve to the current active round
    if (!roundId) {
      const activeEvent = await service.getActiveEvent();
      if (!activeEvent) {
        throw new AppError('NOT_FOUND', 'No active event found', 404);
      }
      const { data: openRound } = await supabase
        .from('rounds')
        .select('id')
        .eq('event_id', activeEvent.id)
        .eq('status', 'open')
        .order('round_number', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (openRound) {
        roundId = openRound.id;
      } else {
        // Fallback to latest round
        const { data: latestRound } = await supabase
          .from('rounds')
          .select('id')
          .eq('event_id', activeEvent.id)
          .order('round_number', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (latestRound) {
          roundId = latestRound.id;
        } else {
          throw new AppError('NOT_FOUND', 'No rounds found for tournament', 404);
        }
      }
    }

    if (!roundId) {
      throw new AppError('NOT_FOUND', 'No target round found', 404);
    }

    const roundData = await service.getAdminRoundDecisions(roundId);

    return successResponse(roundData, 200, {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    });
  } catch (err) {
    return errorResponse(err);
  }
}
