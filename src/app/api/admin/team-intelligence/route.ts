import { NextRequest } from 'next/server';
import { requireRole } from '@/lib/auth/guards';
import { TournamentService } from '@/lib/services/tournament-service';
import { createAdminClient } from '@/lib/supabase/admin';
import { successResponse, errorResponse } from '@/lib/api-response';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/team-intelligence
 * Query parameters:
 *  - roundNumber: optional round number (1-5)
 *  - eventId: optional event UUID
 *
 * Strict Access: super_admin, judge, domain_coordinator
 */
export async function GET(req: NextRequest) {
  try {
    // 1. Enforce strict role authorization
    await requireRole(['super_admin', 'judge', 'domain_coordinator']);

    const supabase = createAdminClient();

    const { searchParams } = new URL(req.url);
    const roundNumberParam = searchParams.get('roundNumber');
    const eventIdParam = searchParams.get('eventId');

    const roundNumber = roundNumberParam ? parseInt(roundNumberParam, 10) : undefined;
    const eventId = eventIdParam || undefined;

    const service = new TournamentService(supabase);
    const data = await service.getTeamIntelligence({
      roundNumber: Number.isFinite(roundNumber) ? roundNumber : undefined,
      eventId,
    });

    return successResponse(data);
  } catch (error: unknown) {
    return errorResponse(error);
  }
}
