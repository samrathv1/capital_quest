import { NextRequest } from 'next/server';
import { TournamentService } from '@/lib/services/tournament-service';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { successResponse, errorResponse } from '@/lib/api-response';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const eventIdParam = searchParams.get('eventId') || undefined;

    let supabase;
    try {
      supabase = await createClient();
    } catch {
      supabase = createAdminClient();
    }

    const service = new TournamentService(supabase);
    const presentationData = await service.getPublicPresentationData(eventIdParam);

    return successResponse(presentationData, 200, {
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    });
  } catch (err) {
    return errorResponse(err);
  }
}
