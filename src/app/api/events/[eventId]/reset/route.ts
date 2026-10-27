import { NextRequest } from 'next/server';
import { requireRole } from '@/lib/auth/guards';
import { ResetEntireTournamentSchema } from '@/lib/validation/api-schemas';
import { TournamentService } from '@/lib/services/tournament-service';
import { createAdminClient } from '@/lib/supabase/admin';
import { successResponse, errorResponse } from '@/lib/api-response';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;
    const body = await req.json();
    const validated = ResetEntireTournamentSchema.parse(body);

    const { user } = await requireRole(['super_admin']);
    const adminId = user.id;

    const supabase = createAdminClient();
    const service = new TournamentService(supabase);

    // 1. Create durable backup snapshot before any destructive deletion
    const backupSnapshot = await service.createDurableTournamentBackup(eventId, adminId, validated.reason);

    // 2. Perform atomic full reset with verified backup
    const result = await service.resetEntireTournament(
      eventId,
      adminId,
      validated.reason,
      validated.confirmPublished,
      backupSnapshot.id
    );

    return successResponse({
      ...result,
      backupTimestamp: backupSnapshot.backupTimestamp,
      backupStatus: 'verified_complete',
    });
  } catch (err) {
    console.error('Reset tournament API error:', err);
    return errorResponse(err);
  }
}
