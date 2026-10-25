import { NextRequest } from 'next/server';
import { requireRole } from '@/lib/auth/guards';
import { TournamentService } from '@/lib/services/tournament-service';
import { createAdminClient } from '@/lib/supabase/admin';
import { successResponse, errorResponse } from '@/lib/api-response';

export const dynamic = 'force-dynamic';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    const { teamId } = await params;
    const { user } = await requireRole(['super_admin']);
    const adminId = user.id;
    const supabase = createAdminClient();

    const service = new TournamentService(supabase);
    const result = await service.deleteTeam(teamId, adminId);

    return successResponse(result);
  } catch (err) {
    return errorResponse(err);
  }
}
