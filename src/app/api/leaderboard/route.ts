import { NextRequest } from 'next/server';
import { TournamentService } from '@/lib/services/tournament-service';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { successResponse, errorResponse } from '@/lib/api-response';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const eventIdParam = searchParams.get('eventId');
    const roundNumberStr = searchParams.get('roundNumber');
    const domainId = searchParams.get('domainId') || undefined;

    const roundNumber = roundNumberStr !== null && roundNumberStr !== '' ? parseInt(roundNumberStr, 10) : undefined;

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
    const publicData = await service.getPublicLeaderboard({
      eventId: eventIdParam || undefined,
      roundNumber,
      domainId,
      callerRole,
    });

    return successResponse(
      {
        eventId: publicData.event?.id,
        roundNumber: publicData.selectedRoundNumber,
        domainId,
        ...publicData,
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
