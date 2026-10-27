import { NextRequest } from 'next/server';
import { requireRole } from '@/lib/auth/guards';
import { ResetRoundDecisionsSchema } from '@/lib/validation/api-schemas';
import { TournamentService } from '@/lib/services/tournament-service';
import { createAdminClient } from '@/lib/supabase/admin';
import { successResponse, errorResponse } from '@/lib/api-response';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roundId: string }> }
) {
  try {
    const { roundId } = await params;
    const body = await req.json();
    const validated = ResetRoundDecisionsSchema.parse(body);

    const { user } = await requireRole(['super_admin']);
    const adminId = user.id;

    const supabase = createAdminClient();
    const service = new TournamentService(supabase);

    const result = await service.resetRoundDecisions(
      roundId,
      adminId,
      validated.reason,
      validated.targetStatus
    );

    return successResponse(result);
  } catch (err) {
    return errorResponse(err);
  }
}
